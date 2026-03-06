# Truco Game - Backend Architecture Design

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Auth** | Supabase Auth (Google OAuth) | Built-in Google login, JWT tokens, free tier supports 50K MAU |
| **Database** | Supabase (PostgreSQL) | SQL power, row-level security, realtime subscriptions, 500MB free |
| **Realtime Game** | Socket.IO (existing) | Keep current game engine, add auth middleware |
| **Server** | Express + Socket.IO (existing) | Add Supabase client for DB operations |
| **Hosting** | Render.com (existing) | Keep current deployment |

---

## Database Schema

### `users` (via Supabase Auth + custom profile)
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  nickname TEXT UNIQUE NOT NULL,
  avatar TEXT DEFAULT '🦁',
  elo_rating INTEGER DEFAULT 1000,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  is_online BOOLEAN DEFAULT false
);
```

### `games` (completed game records)
```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ DEFAULT NOW(),
  target_score INTEGER NOT NULL,
  team_a_score INTEGER NOT NULL,
  team_b_score INTEGER NOT NULL,
  winner_team TEXT NOT NULL, -- 'team_a' or 'team_b'
  total_rounds INTEGER NOT NULL,
  is_ranked BOOLEAN DEFAULT true
);
```

### `game_players` (links players to games)
```sql
CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  seat TEXT NOT NULL, -- 'south', 'north', 'east', 'west'
  team TEXT NOT NULL, -- 'team_a' or 'team_b'
  is_winner BOOLEAN NOT NULL,
  elo_change INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  UNIQUE(game_id, seat)
);
```

### `game_rounds` (per-round stats within a game)
```sql
CREATE TABLE game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  bidding_team TEXT NOT NULL,
  bid_amount INTEGER NOT NULL,
  bidder_user_id UUID REFERENCES profiles(id),
  trump_suit TEXT,
  team_a_trick_points INTEGER DEFAULT 0,
  team_b_trick_points INTEGER DEFAULT 0,
  team_a_singing_points INTEGER DEFAULT 0,
  team_b_singing_points INTEGER DEFAULT 0,
  team_a_total INTEGER DEFAULT 0,
  team_b_total INTEGER DEFAULT 0,
  bidding_team_fell BOOLEAN DEFAULT false,
  is_capo BOOLEAN DEFAULT false,
  UNIQUE(game_id, round_number)
);
```

### `player_stats` (aggregated stats, updated after each game)
```sql
CREATE TABLE player_stats (
  user_id UUID PRIMARY KEY REFERENCES profiles(id),
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  total_rounds_played INTEGER DEFAULT 0,
  total_tricks_won INTEGER DEFAULT 0,
  total_points_scored INTEGER DEFAULT 0,

  -- Bidding stats
  total_bids_made INTEGER DEFAULT 0,
  total_bids_won INTEGER DEFAULT 0,
  highest_bid_won INTEGER DEFAULT 0,
  capo_attempts INTEGER DEFAULT 0,
  capo_wins INTEGER DEFAULT 0,

  -- Singing stats
  total_cantes_sung INTEGER DEFAULT 0,

  -- Trump preferences
  trump_oros_count INTEGER DEFAULT 0,
  trump_copas_count INTEGER DEFAULT 0,
  trump_espadas_count INTEGER DEFAULT 0,
  trump_bastos_count INTEGER DEFAULT 0,

  -- Streaks
  current_streak INTEGER DEFAULT 0, -- positive = wins, negative = losses
  longest_win_streak INTEGER DEFAULT 0,
  comeback_wins INTEGER DEFAULT 0, -- won after being behind by 100+ points

  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `friendships`
```sql
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES profiles(id),
  addressee_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id)
);
```

### `achievements`
```sql
CREATE TABLE achievement_definitions (
  id TEXT PRIMARY KEY, -- e.g., 'first_win', 'capo_master'
  name_he TEXT NOT NULL,
  description_he TEXT NOT NULL,
  icon TEXT NOT NULL, -- emoji
  category TEXT NOT NULL, -- 'beginner', 'bidding', 'social', 'streak', 'rare'
  xp_reward INTEGER DEFAULT 0
);

CREATE TABLE player_achievements (
  user_id UUID REFERENCES profiles(id),
  achievement_id TEXT REFERENCES achievement_definitions(id),
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(user_id, achievement_id)
);
```

### `daily_challenges`
```sql
CREATE TABLE daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  challenge_type TEXT NOT NULL, -- 'win_games', 'sing_cantes', 'win_capo', etc.
  target_value INTEGER NOT NULL,
  description_he TEXT NOT NULL,
  xp_reward INTEGER NOT NULL,
  UNIQUE(date, challenge_type)
);

CREATE TABLE player_challenge_progress (
  user_id UUID REFERENCES profiles(id),
  challenge_id UUID REFERENCES daily_challenges(id),
  current_value INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY(user_id, challenge_id)
);
```

---

## Auth Flow

```
1. User opens app → sees Login screen (new, before Lobby)
2. Clicks "Sign in with Google" → Supabase Auth handles OAuth flow
3. On first login → prompted to choose unique nickname
4. JWT token stored in client → passed to Socket.IO on connection
5. Socket.IO middleware validates JWT → attaches user_id to socket
6. All game actions now tied to authenticated user
```

### Socket.IO Auth Middleware
```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return next(new Error('Invalid token'));

  socket.data.userId = user.id;
  socket.data.nickname = user.user_metadata.nickname;
  next();
});
```

---

## Elo Rating System

```
K-factor: 32 (standard for new players)
Expected score: Ea = 1 / (1 + 10^((Rb - Ra) / 400))
New rating: Ra' = Ra + K * (Sa - Ea)

Where:
- Ra = player A's current rating
- Rb = average opponent team rating
- Sa = actual score (1 for win, 0 for loss)
- Ea = expected score

Team Elo: Average of both teammates' Elo ratings
```

### Rank Tiers
| Tier | Elo Range | Badge |
|------|----------|-------|
| Bronze | 0-999 | 🥉 |
| Silver | 1000-1199 | 🥈 |
| Gold | 1200-1399 | 🥇 |
| Platinum | 1400-1599 | 💎 |
| Diamond | 1600-1799 | 💠 |
| Master | 1800+ | 👑 |

---

## XP & Leveling System

| Action | XP Earned |
|--------|----------|
| Win a game | +50 XP |
| Lose a game | +15 XP |
| Win a capo round | +25 XP |
| Sing a cante | +5 XP |
| Win bid and not fall | +10 XP |
| Complete daily challenge | +30-100 XP |
| Unlock achievement | varies |

### Level Formula
```
Level = floor(sqrt(XP / 100)) + 1
XP needed for level N: (N-1)² × 100
```

---

## Achievement Definitions

### Beginner
- 🎯 **קליעה ראשונה** - Win your first game
- 🃏 **שחקן מתחיל** - Play 10 games
- 📈 **מתקדם** - Reach Level 5

### Bidding
- 💰 **הימור גבוה** - Win a bid of 200+
- 🎪 **קאפו מאסטר** - Win 5 capo rounds
- 📉 **הלך על הכל** - Win a 230 (max) bid

### Social
- 🤝 **שותף נאמן** - Play 20 games with same partner
- 👥 **חברותי** - Add 5 friends
- 🌍 **מוכר בשכונה** - Play against 50 different players

### Streaks
- 🔥 **רצף חם** - Win 5 games in a row
- ⚡ **בלתי ניתן לעצירה** - Win 10 games in a row
- 🏔️ **חזרה מהתהום** - Win after being down 200+ points

### Rare
- 🎼 **זמר מושלם** - Sing all 4 suits in one game
- 🧹 **ניקוי שולחן** - Win all 10 tricks in a round
- 🏆 **יהלום** - Reach Diamond rank

---

## Daily/Weekly Challenges (Examples)

**Daily (rotate randomly):**
- Win 2 games today (+30 XP)
- Sing 3 cantes in one game (+20 XP)
- Win a capo round (+40 XP)
- Play 5 games (+25 XP)
- Win with a bid of 150+ (+35 XP)

**Weekly:**
- Win 10 games this week (+100 XP)
- Play with 5 different partners (+50 XP)
- Win 3 games in a row (+75 XP)

---

## Player Profile Page

```
┌─────────────────────────────────────┐
│  🐺  OfekTheKing                    │
│  💎 Platinum (Elo: 1450)  Lv.12    │
│                                     │
│  W: 156  L: 89  Win Rate: 63.7%   │
│  Favorite Trump: ♠ Espadas         │
│                                     │
│  🔥 Current streak: 4 wins         │
│  📅 Member since: March 2026       │
│                                     │
│  Achievements: 🎯💰🔥🤝 (+8 more) │
└─────────────────────────────────────┘
```

---

## Friends System

### Features
- **Add friend**: Search by nickname → send request
- **Online status**: Real-time via Supabase Realtime or Socket.IO presence
- **Invite to game**: Friend creates room → sends invite → friend gets notification
- **Friend leaderboard**: See rankings among just your friends
- **Recent players**: Auto-saved list of last 20 opponents

### Invite Flow
```
1. Player A creates room
2. Clicks "Invite Friend" → selects from friends list
3. Friend B sees notification (via Socket.IO)
4. Friend B clicks "Join" → auto-fills room code
```

---

## Match History

Each completed game saved with full detail:
- Date, duration, final scores
- All round summaries (bids, trump, points)
- Partner and opponents
- Elo change, XP earned
- Shareable link: `truco-game.onrender.com/game/{game_id}`

---

## Implementation Phases

### Phase 1: Auth + User Profiles (1-2 days)
- Add Supabase client to server and client
- Google OAuth login screen
- Nickname selection on first login
- JWT-based Socket.IO authentication
- Basic `profiles` table

### Phase 2: Game Recording + Stats (1-2 days)
- Save completed games to `games` + `game_players` tables
- Save round details to `game_rounds`
- Calculate and update `player_stats` after each game
- Profile page with basic stats

### Phase 3: Elo + XP System (1 day)
- Elo calculation after each game
- XP earning system
- Level calculation
- Rank badges on profiles and in-game

### Phase 4: Achievements (1 day)
- Define all achievements in DB
- Check achievement conditions after each game/action
- Achievement unlock notifications in-game
- Achievement showcase on profile

### Phase 5: Friends + Social (1-2 days)
- Friend request system
- Online status tracking
- Game invite notifications
- Friend leaderboard
- Recent players

### Phase 6: Daily Challenges (1 day)
- Daily challenge generation (cron job or Supabase function)
- Progress tracking during games
- Challenge completion rewards
- UI for viewing active challenges

### Phase 7: Match History (1 day)
- Match history page
- Game detail view
- Shareable game links

---

## Supabase Setup

```
1. Create Supabase project (free tier)
2. Enable Google OAuth in Auth settings
3. Create tables via SQL editor (schema above)
4. Enable Row Level Security (RLS)
5. Add Supabase URL + anon key to environment variables
6. Install @supabase/supabase-js in both client and server
```

### Environment Variables (Render)
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_KEY=eyJhbG... (server only)
```
