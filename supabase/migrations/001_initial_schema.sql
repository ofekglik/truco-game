-- User Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname VARCHAR(15) NOT NULL UNIQUE,
  avatar VARCHAR(10),
  elo_rating INTEGER DEFAULT 1000,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_online BOOLEAN DEFAULT FALSE
);

-- Player Stats
CREATE TABLE IF NOT EXISTS player_stats (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  total_rounds_played INTEGER DEFAULT 0,
  total_tricks_won INTEGER DEFAULT 0,
  total_points_scored INTEGER DEFAULT 0,
  successful_bids INTEGER DEFAULT 0,
  failed_bids INTEGER DEFAULT 0,
  singing_points_scored INTEGER DEFAULT 0,
  singing_points_conceded INTEGER DEFAULT 0,
  trump_oros_count INTEGER DEFAULT 0,
  trump_copas_count INTEGER DEFAULT 0,
  trump_espadas_count INTEGER DEFAULT 0,
  trump_bastos_count INTEGER DEFAULT 0,
  current_win_streak INTEGER DEFAULT 0,
  longest_win_streak INTEGER DEFAULT 0,
  current_loss_streak INTEGER DEFAULT 0,
  longest_loss_streak INTEGER DEFAULT 0,
  comeback_wins INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Games
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(4) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE,
  target_score INTEGER DEFAULT 1000,
  team_a_score INTEGER DEFAULT 0,
  team_b_score INTEGER DEFAULT 0,
  winner_team VARCHAR(10),
  total_rounds INTEGER DEFAULT 0,
  is_ranked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Game Players
CREATE TABLE IF NOT EXISTS game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat VARCHAR(10) NOT NULL,
  team VARCHAR(10) NOT NULL,
  is_winner BOOLEAN DEFAULT FALSE,
  elo_change INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Game Rounds
CREATE TABLE IF NOT EXISTS game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  bidding_team VARCHAR(10),
  bid_amount INTEGER,
  bidder_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trump_suit VARCHAR(20),
  team_a_score INTEGER DEFAULT 0,
  team_b_score INTEGER DEFAULT 0,
  bidding_team_fell BOOLEAN DEFAULT FALSE,
  is_capo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Friendships
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT different_users CHECK (requester_id != addressee_id)
);

-- Achievement Definitions
CREATE TABLE IF NOT EXISTS achievement_definitions (
  id TEXT PRIMARY KEY,
  name_he VARCHAR(255) NOT NULL,
  description_he TEXT,
  icon VARCHAR(10),
  category VARCHAR(50),
  xp_reward INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Player Achievements
CREATE TABLE IF NOT EXISTS player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, achievement_id)
);

-- Daily Challenges
CREATE TABLE IF NOT EXISTS daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_date DATE NOT NULL UNIQUE,
  challenge_type VARCHAR(50) NOT NULL,
  target_value INTEGER NOT NULL,
  description_he VARCHAR(255),
  xp_reward INTEGER DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Player Challenge Progress
CREATE TABLE IF NOT EXISTS player_challenge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
  current_value INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, challenge_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_nickname ON profiles(nickname);
CREATE INDEX IF NOT EXISTS idx_profiles_is_online ON profiles(is_online);
CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_games_winner_team ON games(winner_team);
CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user_id ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_game_id ON game_rounds(game_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester_id ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee_id ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_user_id ON player_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_player_challenge_progress_user_id ON player_challenge_progress(user_id);

-- Insert Initial Achievements
INSERT INTO achievement_definitions (id, name_he, description_he, icon, category, xp_reward) VALUES
  ('first_win', 'הניצחון הראשון', 'זכו בהשחקה הראשונה שלכם', '🎉', 'general', 50),
  ('ten_games', '10 משחקים', 'סיימו 10 משחקים', '🎮', 'milestones', 100),
  ('level_5', 'רמה 5', 'הגיעו לרמה 5', '⭐', 'progression', 150),
  ('high_bid', 'הצעה גבוהה', 'הצעו מעל 30 נקודות', '💰', 'bidding', 50),
  ('capo_master', 'קפו מנהל', 'היו קפו 3 פעמים', '👑', 'special', 100),
  ('max_bid', 'הצעה מקסימלית', 'הצעו 40 נקודות', '🚀', 'bidding', 75),
  ('loyal_partner', 'שותף נאמן', 'נשחקו 20 משחקים עם אותו שותף', '🤝', 'social', 100),
  ('social_butterfly', 'פרפר חברתי', 'התחברו עם 10 שחקנים שונים', '🦋', 'social', 100),
  ('well_known', 'ידוע היטב', 'הם התחברו עם 50 שחקנים שונים', '📱', 'social', 200),
  ('hot_streak', 'רצף חם', 'ניצחו 5 משחקים ברציפות', '🔥', 'streaks', 150),
  ('unstoppable', 'בלתי עצירים', 'ניצחו 10 משחקים ברציפות', '⚡', 'streaks', 250),
  ('comeback_king', 'מלך הביקום בק', 'ניצחו משחק כשהיתם 100 נקודות מאחור', '🏆', 'special', 200),
  ('perfect_singer', 'זמרון מושלם', 'קנטו 5 יד סגורה ולא נפלתם', '🎵', 'singing', 150),
  ('clean_sweep', 'ניצחון חד', 'ניצחו במשחק ללא הפסדת סיבובים', '✨', 'special', 200),
  ('diamond_rank', 'דרגת יהלום', 'הגיעו ל-1600 Elo', '💠', 'ranking', 500);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_challenge_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Public profiles are readable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for player_stats
CREATE POLICY "User stats are readable by everyone" ON player_stats FOR SELECT USING (true);
CREATE POLICY "Users can update their own stats" ON player_stats FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for games
CREATE POLICY "Games are readable by everyone" ON games FOR SELECT USING (true);

-- RLS Policies for game_players
CREATE POLICY "Game players are readable by everyone" ON game_players FOR SELECT USING (true);

-- RLS Policies for game_rounds
CREATE POLICY "Game rounds are readable by everyone" ON game_rounds FOR SELECT USING (true);

-- RLS Policies for friendships
CREATE POLICY "Users can view their own friendships" ON friendships FOR SELECT USING (
  auth.uid() = requester_id OR auth.uid() = addressee_id
);

-- RLS Policies for player_achievements
CREATE POLICY "Achievements are readable by everyone" ON player_achievements FOR SELECT USING (true);

-- RLS Policies for player_challenge_progress
CREATE POLICY "Users can view their challenge progress" ON player_challenge_progress FOR SELECT USING (
  auth.uid() = user_id
);
