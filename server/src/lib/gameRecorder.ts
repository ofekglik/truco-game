import { supabase, isSupabaseConfigured } from './supabase.js';
import { calculateEloChange, teamAverageElo, DEFAULT_RATING } from './elo.js';
import { GameState, SEAT_ORDER, SeatPosition, SEAT_TEAM, Suit } from '../engine/types.js';

interface AuthenticatedPlayer {
  supabaseUserId: string;
  seat: SeatPosition;
  team: 'team1' | 'team2';
  isWinner: boolean;
}

/**
 * Record game results to Supabase after GAME_OVER.
 * Only records if at least one authenticated player is in the room.
 */
export async function recordGameResults(state: GameState, roomCode: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.log('[gameRecorder] Supabase not configured, skipping');
    return;
  }

  // Collect authenticated players
  const authPlayers: AuthenticatedPlayer[] = [];
  for (const seat of SEAT_ORDER) {
    const player = state.players[seat];
    if (player?.supabaseUserId) {
      const team = SEAT_TEAM[seat];
      const winnerTeam = state.scores.team1 >= state.targetScore ? 'team1' : 'team2';
      authPlayers.push({
        supabaseUserId: player.supabaseUserId,
        seat,
        team,
        isWinner: team === winnerTeam,
      });
    }
  }

  if (authPlayers.length === 0) {
    console.log('[gameRecorder] No authenticated players, skipping');
    return;
  }

  const winnerTeam = state.scores.team1 >= state.targetScore ? 'team1' : 'team2';

  try {
    // 1. Insert game record
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        room_code: roomCode,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        target_score: state.targetScore,
        team_a_score: state.scores.team1,
        team_b_score: state.scores.team2,
        winner_team: winnerTeam,
        total_rounds: state.roundNumber,
        is_ranked: authPlayers.length >= 2, // ranked if at least 2 authenticated players
      })
      .select('id')
      .single();

    if (gameError || !game) {
      console.error('[gameRecorder] Failed to insert game:', gameError);
      return;
    }

    const gameId = game.id;

    // 2. Fetch current ELO ratings for all authenticated players
    const userIds = authPlayers.map(p => p.supabaseUserId);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, elo_rating')
      .in('id', userIds);

    const eloMap = new Map<string, number>();
    for (const p of profiles || []) {
      eloMap.set(p.id, p.elo_rating || DEFAULT_RATING);
    }

    // 3. Calculate ELO changes
    // Team average ELO for each team (using all players, including guests at default)
    const team1Ratings: (number | undefined)[] = [];
    const team2Ratings: (number | undefined)[] = [];
    for (const seat of SEAT_ORDER) {
      const player = state.players[seat];
      if (!player) continue;
      const team = SEAT_TEAM[seat];
      const rating = player.supabaseUserId ? eloMap.get(player.supabaseUserId) : undefined;
      if (team === 'team1') team1Ratings.push(rating);
      else team2Ratings.push(rating);
    }

    const team1AvgElo = teamAverageElo(team1Ratings);
    const team2AvgElo = teamAverageElo(team2Ratings);

    // 4. Insert game_players and calculate ELO changes
    const gamePlayersInserts = [];
    const eloUpdates: { userId: string; newElo: number; eloChange: number }[] = [];

    for (const ap of authPlayers) {
      const currentElo = eloMap.get(ap.supabaseUserId) || DEFAULT_RATING;
      const oppAvgElo = ap.team === 'team1' ? team2AvgElo : team1AvgElo;
      const eloChange = calculateEloChange(currentElo, oppAvgElo, ap.isWinner);
      const newElo = Math.max(0, currentElo + eloChange); // Never go below 0

      gamePlayersInserts.push({
        game_id: gameId,
        user_id: ap.supabaseUserId,
        seat: ap.seat,
        team: ap.team,
        is_winner: ap.isWinner,
        elo_change: eloChange,
        xp_earned: ap.isWinner ? 50 : 20, // simple XP: 50 for win, 20 for loss
      });

      eloUpdates.push({ userId: ap.supabaseUserId, newElo, eloChange });
    }

    // Insert all game_players
    const { error: gpError } = await supabase
      .from('game_players')
      .insert(gamePlayersInserts);

    if (gpError) {
      console.error('[gameRecorder] Failed to insert game_players:', gpError);
    }

    // 5. Insert round history
    if (state.roundHistory.length > 0) {
      const roundInserts = state.roundHistory.map((round, idx) => ({
        game_id: gameId,
        round_number: idx + 1,
        bidding_team: round.biddingTeam,
        bid_amount: round.bidAmount,
        trump_suit: null, // trump varies per round but isn't stored in roundHistory
        team_a_score: round.team1Total,
        team_b_score: round.team2Total,
        bidding_team_fell: round.biddingTeamFell,
        is_capo: false,
      }));

      const { error: roundError } = await supabase
        .from('game_rounds')
        .insert(roundInserts);

      if (roundError) {
        console.error('[gameRecorder] Failed to insert game_rounds:', roundError);
      }
    }

    // 6. Update ELO ratings in profiles
    for (const update of eloUpdates) {
      const { error: eloError } = await supabase
        .from('profiles')
        .update({ elo_rating: update.newElo, last_seen: new Date().toISOString() })
        .eq('id', update.userId);

      if (eloError) {
        console.error(`[gameRecorder] Failed to update ELO for ${update.userId}:`, eloError);
      }
    }

    // 7. Update player_stats
    for (const ap of authPlayers) {
      // First try to get existing stats
      const { data: existingStats } = await supabase
        .from('player_stats')
        .select('*')
        .eq('id', ap.supabaseUserId)
        .single();

      // Count tricks won by this player's team
      const teamTricksWon = ap.team === 'team1' ? state.team1TricksWon : state.team2TricksWon;

      // Determine trump suit for this game
      const trumpSuit = state.trumpSuit;
      const trumpField = trumpSuit ? `trump_${trumpSuit}_count` : null;

      if (existingStats) {
        // Update existing stats
        const updates: Record<string, any> = {
          games_played: existingStats.games_played + 1,
          games_won: existingStats.games_won + (ap.isWinner ? 1 : 0),
          games_lost: existingStats.games_lost + (ap.isWinner ? 0 : 1),
          total_tricks_won: existingStats.total_tricks_won + teamTricksWon,
          updated_at: new Date().toISOString(),
        };

        // Update streaks
        if (ap.isWinner) {
          updates.current_win_streak = existingStats.current_win_streak + 1;
          updates.current_loss_streak = 0;
          updates.longest_win_streak = Math.max(existingStats.longest_win_streak, existingStats.current_win_streak + 1);
        } else {
          updates.current_loss_streak = existingStats.current_loss_streak + 1;
          updates.current_win_streak = 0;
          updates.longest_loss_streak = Math.max(existingStats.longest_loss_streak, existingStats.current_loss_streak + 1);
        }

        // Update trump count
        if (trumpField && trumpField in existingStats) {
          updates[trumpField] = (existingStats as any)[trumpField] + 1;
        }

        const { error: statsError } = await supabase
          .from('player_stats')
          .update(updates)
          .eq('id', ap.supabaseUserId);

        if (statsError) {
          console.error(`[gameRecorder] Failed to update stats for ${ap.supabaseUserId}:`, statsError);
        }
      } else {
        // Insert new stats row
        const newStats: Record<string, any> = {
          id: ap.supabaseUserId,
          games_played: 1,
          games_won: ap.isWinner ? 1 : 0,
          games_lost: ap.isWinner ? 0 : 1,
          total_tricks_won: teamTricksWon,
          current_win_streak: ap.isWinner ? 1 : 0,
          current_loss_streak: ap.isWinner ? 0 : 1,
          longest_win_streak: ap.isWinner ? 1 : 0,
          longest_loss_streak: ap.isWinner ? 0 : 1,
        };

        if (trumpField) {
          newStats[trumpField] = 1;
        }

        const { error: insertError } = await supabase
          .from('player_stats')
          .insert(newStats);

        if (insertError) {
          console.error(`[gameRecorder] Failed to insert stats for ${ap.supabaseUserId}:`, insertError);
        }
      }
    }

    console.log(`[gameRecorder] Successfully recorded game ${gameId} with ${authPlayers.length} authenticated players`);
  } catch (err) {
    console.error('[gameRecorder] Unexpected error:', err);
  }
}
