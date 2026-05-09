-- ============================================================
--  KickOff — PostgreSQL Schema
--  Run this file once to set up the full database.
--  psql -U <user> -d <database> -f schema.sql
-- ============================================================

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive text for email/username

-- ============================================================
--  USERS
--  Every person who registers gets one row here.
--  Role is determined by action (creating a league),
--  not by signup — so no role column here.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name   VARCHAR(50)   NOT NULL,
  last_name    VARCHAR(50)   NOT NULL,
  username     CITEXT        NOT NULL UNIQUE,
  email        CITEXT        NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- ============================================================
--  LEAGUES
--  Created by a user who becomes owner_id.
--  status flow: waiting → active → playoffs → completed
-- ============================================================
CREATE TABLE IF NOT EXISTS leagues (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(100)  NOT NULL,
  season       VARCHAR(20)   NOT NULL,
  description  TEXT,
  format       VARCHAR(20)   NOT NULL CHECK (format IN ('single', 'double')),
  max_teams    INT           NOT NULL CHECK (max_teams BETWEEN 2 AND 32),
  playoff_spots INT          NOT NULL DEFAULT 4,
  status       VARCHAR(20)   NOT NULL DEFAULT 'waiting'
                             CHECK (status IN ('waiting', 'active', 'playoffs', 'completed')),
  invite_code  VARCHAR(20)   UNIQUE,
  code_active  BOOLEAN       NOT NULL DEFAULT TRUE,
  winner_id    UUID          REFERENCES users(id) ON DELETE SET NULL,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leagues_owner       ON leagues (owner_id);
CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues (invite_code);
CREATE INDEX IF NOT EXISTS idx_leagues_status      ON leagues (status);

-- ============================================================
--  LEAGUE MEMBERS
--  One row per user per league.
--  team_name is what the player chose when joining.
-- ============================================================
CREATE TABLE IF NOT EXISTS league_members (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    UUID          NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id      UUID          NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  team_name    VARCHAR(80)   NOT NULL,
  role         VARCHAR(10)   NOT NULL DEFAULT 'player'
                             CHECK (role IN ('owner', 'player')),
  joined_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (league_id, user_id),
  UNIQUE (league_id, team_name)
);

CREATE INDEX IF NOT EXISTS idx_members_league ON league_members (league_id);
CREATE INDEX IF NOT EXISTS idx_members_user   ON league_members (user_id);

-- ============================================================
--  FIXTURES
--  Auto-generated when the league starts.
--  Each row is a scheduled match between two league members.
--  status flow: upcoming → pending → approved | rejected
-- ============================================================
CREATE TABLE IF NOT EXISTS fixtures (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID          NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  matchday        INT           NOT NULL,
  home_member_id  UUID          NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  away_member_id  UUID          NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  home_score      INT           CHECK (home_score >= 0),
  away_score      INT           CHECK (away_score >= 0),
  status          VARCHAR(20)   NOT NULL DEFAULT 'upcoming'
                                CHECK (status IN ('upcoming', 'pending', 'approved', 'rejected')),
  submitted_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
  submitted_at    TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- A pair can only appear once per matchday
  UNIQUE (league_id, matchday, home_member_id, away_member_id),

  -- A team cannot play itself
  CHECK (home_member_id <> away_member_id)
);

CREATE INDEX IF NOT EXISTS idx_fixtures_league    ON fixtures (league_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_matchday  ON fixtures (league_id, matchday);
CREATE INDEX IF NOT EXISTS idx_fixtures_home      ON fixtures (home_member_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_away      ON fixtures (away_member_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_status    ON fixtures (status);

-- ============================================================
--  STANDINGS
--  Cached / materialised standings per league.
--  Recalculated every time a fixture is approved.
--  Tiebreakers: points → GD → GF → head_to_head (manual) → name
-- ============================================================
CREATE TABLE IF NOT EXISTS standings (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id        UUID  NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  member_id        UUID  NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
  position         INT   NOT NULL DEFAULT 0,
  previous_position INT,
  played           INT   NOT NULL DEFAULT 0,
  won              INT   NOT NULL DEFAULT 0,
  drawn            INT   NOT NULL DEFAULT 0,
  lost             INT   NOT NULL DEFAULT 0,
  goals_for        INT   NOT NULL DEFAULT 0,
  goals_against    INT   NOT NULL DEFAULT 0,
  goal_difference  INT   NOT NULL DEFAULT 0,
  points           INT   NOT NULL DEFAULT 0,
  form             TEXT  NOT NULL DEFAULT '',   -- e.g. 'WWDLW' last 5 right-to-left
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (league_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_standings_league   ON standings (league_id);
CREATE INDEX IF NOT EXISTS idx_standings_position ON standings (league_id, position);

-- ============================================================
--  KNOCKOUT ROUNDS
--  Auto-generated after league phase ends.
--  round_key: 'round-of-16' | 'quarterfinal' | 'semifinal' | 'final'
-- ============================================================
CREATE TABLE IF NOT EXISTS knockout_rounds (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    UUID          NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  round_key    VARCHAR(30)   NOT NULL
                             CHECK (round_key IN ('round-of-16','quarterfinal','semifinal','final')),
  round_name   VARCHAR(50)   NOT NULL,
  round_order  INT           NOT NULL,   -- 1 = first round, ascending to final
  status       VARCHAR(20)   NOT NULL DEFAULT 'upcoming'
                             CHECK (status IN ('upcoming', 'active', 'completed')),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (league_id, round_key)
);

CREATE INDEX IF NOT EXISTS idx_ko_rounds_league ON knockout_rounds (league_id);

-- ============================================================
--  KNOCKOUT MATCHES
--  One row per match within a knockout round.
--  winner_member_id is set after result is approved.
-- ============================================================
CREATE TABLE IF NOT EXISTS knockout_matches (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id         UUID  NOT NULL REFERENCES knockout_rounds(id) ON DELETE CASCADE,
  league_id        UUID  NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  match_number     INT   NOT NULL,   -- position within the round (1, 2, 3...)
  home_member_id   UUID  REFERENCES league_members(id) ON DELETE SET NULL,
  away_member_id   UUID  REFERENCES league_members(id) ON DELETE SET NULL,
  home_score       INT   CHECK (home_score >= 0),
  away_score       INT   CHECK (away_score >= 0),
  winner_member_id UUID  REFERENCES league_members(id) ON DELETE SET NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'upcoming'
                               CHECK (status IN ('upcoming', 'pending', 'approved', 'rejected')),
  submitted_by     UUID  REFERENCES users(id) ON DELETE SET NULL,
  submitted_at     TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (round_id, match_number)
);

CREATE INDEX IF NOT EXISTS idx_ko_matches_round  ON knockout_matches (round_id);
CREATE INDEX IF NOT EXISTS idx_ko_matches_league ON knockout_matches (league_id);
CREATE INDEX IF NOT EXISTS idx_ko_matches_home   ON knockout_matches (home_member_id);
CREATE INDEX IF NOT EXISTS idx_ko_matches_away   ON knockout_matches (away_member_id);

-- ============================================================
--  TRIGGERS
--  Auto-update updated_at on any row change
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- users
CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- leagues
CREATE OR REPLACE TRIGGER trg_leagues_updated_at
  BEFORE UPDATE ON leagues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- fixtures
CREATE OR REPLACE TRIGGER trg_fixtures_updated_at
  BEFORE UPDATE ON fixtures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- standings
CREATE OR REPLACE TRIGGER trg_standings_updated_at
  BEFORE UPDATE ON standings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- knockout_matches
CREATE OR REPLACE TRIGGER trg_ko_matches_updated_at
  BEFORE UPDATE ON knockout_matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
--  VIEWS
-- ============================================================

-- Full standings view with user and team info joined
CREATE OR REPLACE VIEW v_standings AS
SELECT
  s.league_id,
  s.member_id,
  s.position,
  s.previous_position,
  s.played,
  s.won,
  s.drawn,
  s.lost,
  s.goals_for,
  s.goals_against,
  s.goal_difference,
  s.points,
  s.form,
  s.updated_at,
  lm.team_name,
  lm.role,
  u.id          AS user_id,
  u.username,
  u.first_name,
  u.last_name
FROM standings s
JOIN league_members lm ON lm.id = s.member_id
JOIN users          u  ON u.id  = lm.user_id
ORDER BY s.league_id, s.position ASC;

-- Full fixtures view with team names and usernames joined
CREATE OR REPLACE VIEW v_fixtures AS
SELECT
  f.id,
  f.league_id,
  f.matchday,
  f.status,
  f.home_score,
  f.away_score,
  f.submitted_at,
  f.approved_at,
  f.submitted_by,
  -- home team
  f.home_member_id,
  hm.team_name   AS home_team_name,
  hu.id          AS home_user_id,
  hu.username    AS home_username,
  -- away team
  f.away_member_id,
  am.team_name   AS away_team_name,
  au.id          AS away_user_id,
  au.username    AS away_username
FROM fixtures f
JOIN league_members hm ON hm.id = f.home_member_id
JOIN users          hu ON hu.id = hm.user_id
JOIN league_members am ON am.id = f.away_member_id
JOIN users          au ON au.id = am.user_id
ORDER BY f.league_id, f.matchday, f.id;

-- Knockout bracket view with team names joined
CREATE OR REPLACE VIEW v_knockout AS
SELECT
  km.id,
  km.round_id,
  km.league_id,
  km.match_number,
  km.status,
  km.home_score,
  km.away_score,
  km.submitted_at,
  km.approved_at,
  -- round info
  kr.round_key,
  kr.round_name,
  kr.round_order,
  kr.status       AS round_status,
  -- home team
  km.home_member_id,
  hm.team_name    AS home_team_name,
  hu.id           AS home_user_id,
  hu.username     AS home_username,
  -- away team
  km.away_member_id,
  am.team_name    AS away_team_name,
  au.id           AS away_user_id,
  au.username     AS away_username,
  -- winner
  km.winner_member_id,
  wm.team_name    AS winner_team_name,
  wu.username     AS winner_username
FROM knockout_matches km
JOIN knockout_rounds  kr ON kr.id = km.round_id
LEFT JOIN league_members hm ON hm.id = km.home_member_id
LEFT JOIN users          hu ON hu.id = hm.user_id
LEFT JOIN league_members am ON am.id = km.away_member_id
LEFT JOIN users          au ON au.id = am.user_id
LEFT JOIN league_members wm ON wm.id = km.winner_member_id
LEFT JOIN users          wu ON wu.id = wm.user_id
ORDER BY kr.round_order, km.match_number;

-- ============================================================
--  COMMENTS — for clarity
-- ============================================================
COMMENT ON TABLE users            IS 'All registered KickOff users';
COMMENT ON TABLE leagues          IS 'Football leagues created by users';
COMMENT ON TABLE league_members   IS 'Users who have joined a league with their team name';
COMMENT ON TABLE fixtures         IS 'Auto-generated match schedule for a league';
COMMENT ON TABLE standings        IS 'Cached league table — recalculated on every approved result';
COMMENT ON TABLE knockout_rounds  IS 'Knockout stage round definitions per league';
COMMENT ON TABLE knockout_matches IS 'Individual matches within each knockout round';

COMMENT ON COLUMN leagues.format         IS 'single = each pair plays once, double = home and away';
COMMENT ON COLUMN leagues.invite_code    IS 'Unique code shared by owner. Format: KO-XXXXX';
COMMENT ON COLUMN leagues.code_active    IS 'False when max_teams reached or owner deactivates';
COMMENT ON COLUMN fixtures.form          IS 'Last 5 results as string e.g. WWDLW, newest on right';
COMMENT ON COLUMN standings.form         IS 'Last 5 results string — W, D or L per match';