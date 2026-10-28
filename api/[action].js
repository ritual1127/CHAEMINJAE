// 모든 API를 한 함수로 처리: /api/signup, /api/login, /api/logout, /api/me, /api/avatar, /api/score, /api/rank
import { neon } from '@neondatabase/serverless';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);
const SONGS = ['picnic', 'roll', 'pajama'];
const DIFFS = ['easy', 'normal'];
const RANKS = ['S', 'A', 'B', 'C', 'D'];
const DAY = 86400;

// 테이블은 첫 요청 때 한 번 만든다 (별도 마이그레이션 단계 없음)
let ready;
const init = () => (ready ??= (async () => {
  await sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    pw TEXT NOT NULL,
    avatar INT NOT NULL DEFAULT 1,
    plays INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS scores (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song TEXT NOT NULL,
    diff TEXT NOT NULL,
    score INT NOT NULL,
    combo INT NOT NULL,
    rank TEXT NOT NULL,
    played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, song, diff))`;
})().catch((e) => { ready = null; throw e; }));

const hashPw = (pw, salt = randomBytes(16).toString('hex')) =>
  `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;

const checkPw = (pw, stored) => {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(pw, salt, 64));
};

// 쿠키에는 랜덤 토큰, DB에는 그 해시만 저장
const sha = (s) => createHash('sha256').update(s).digest('hex');

async function startSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  await sql`INSERT INTO sessions (token, user_id, expires_at)
            VALUES (${sha(token)}, ${userId}, now() + interval '30 days')`;
  res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * DAY}`);
}

async function currentUser(req) {
  const token = req.cookies?.sid;
  if (!token) return null;
  const [user] = await sql`SELECT u.id, u.username, u.avatar, u.plays FROM sessions s
                           JOIN users u ON u.id = s.user_id
                           WHERE s.token = ${sha(token)} AND s.expires_at > now()`;
  return user ?? null;
}

async function profile(user) {
  const rows = await sql`SELECT song, diff, score, combo, rank FROM scores WHERE user_id = ${user.id}`;
  const best = {};
  for (const r of rows) best[`${r.song}:${r.diff}`] = { score: r.score, combo: r.combo, rank: r.rank };
  return { username: user.username, avatar: user.avatar, plays: user.plays, best };
}

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

const routes = {
  async 'POST signup'(req, res) {
    const { username = '', password = '', avatar = 1 } = req.body ?? {};
    const name = String(username).trim();
    if (!/^[가-힣a-zA-Z0-9_]{2,12}$/.test(name)) return res.status(400).json({ error: '닉네임은 한글·영문·숫자 2~12자로 지어 주세요' });
    if (typeof password !== 'string' || password.length < 4 || password.length > 64) return res.status(400).json({ error: '비밀번호는 4자 이상이에요' });
    if (!isInt(avatar, 1, 32)) return res.status(400).json({ error: '프로필 사진을 골라 주세요' });
    const [user] = await sql`INSERT INTO users (username, pw, avatar) VALUES (${name}, ${hashPw(password)}, ${avatar})
                             ON CONFLICT (username) DO NOTHING RETURNING id, username, avatar, plays`;
    if (!user) return res.status(409).json({ error: '이미 누가 쓰고 있는 닉네임이에요' });
    await startSession(res, user.id);
    res.json(await profile(user));
  },

  // ponytail: 로그인 시도 횟수 제한 없음. 공개 서비스로 키우면 IP별 rate limit 추가
  async 'POST login'(req, res) {
    const { username = '', password = '' } = req.body ?? {};
    const [user] = await sql`SELECT id, username, avatar, plays, pw FROM users WHERE username = ${String(username).trim()}`;
    if (!user || typeof password !== 'string' || !checkPw(password, user.pw)) {
      return res.status(401).json({ error: '닉네임 또는 비밀번호가 달라요' });
    }
    await startSession(res, user.id);
    res.json(await profile(user));
  },

  async 'POST logout'(req, res) {
    if (req.cookies?.sid) await sql`DELETE FROM sessions WHERE token = ${sha(req.cookies.sid)}`;
    res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  },

  async 'GET me'(req, res) {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요해요' });
    res.json(await profile(user));
  },

  async 'POST avatar'(req, res) {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요해요' });
    const { avatar } = req.body ?? {};
    if (!isInt(avatar, 1, 32)) return res.status(400).json({ error: '프로필 사진을 골라 주세요' });
    await sql`UPDATE users SET avatar = ${avatar} WHERE id = ${user.id}`;
    res.json({ avatar });
  },

  // ponytail: 점수는 클라이언트가 보낸 값을 범위 검사만 하고 믿는다. 경쟁 랭킹이 되면 입력 로그 서버 검증 필요
  async 'POST score'(req, res) {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: '로그인하면 기록이 저장돼요' });
    const { song, diff, score, combo, rank } = req.body ?? {};
    if (!SONGS.includes(song) || !DIFFS.includes(diff) || !RANKS.includes(rank) ||
        !isInt(score, 0, 1_000_000) || !isInt(combo, 0, 5000)) {
      return res.status(400).json({ error: '기록 형식이 이상해요' });
    }
    const [prev] = await sql`SELECT score FROM scores WHERE user_id = ${user.id} AND song = ${song} AND diff = ${diff}`;
    await sql`INSERT INTO scores (user_id, song, diff, score, combo, rank) VALUES (${user.id}, ${song}, ${diff}, ${score}, ${combo}, ${rank})
              ON CONFLICT (user_id, song, diff) DO UPDATE
              SET score = EXCLUDED.score, combo = EXCLUDED.combo, rank = EXCLUDED.rank, played_at = now()
              WHERE scores.score < EXCLUDED.score`;
    await sql`UPDATE users SET plays = plays + 1 WHERE id = ${user.id}`;
    res.json({ newBest: !prev || score > prev.score, prevBest: prev?.score ?? 0 });
  },

  async 'GET rank'(req, res) {
    const { song, diff } = req.query;
    if (!SONGS.includes(song) || !DIFFS.includes(diff)) return res.status(400).json({ error: '곡을 골라 주세요' });
    const rows = await sql`SELECT u.username, u.avatar, s.score, s.combo, s.rank FROM scores s
                           JOIN users u ON u.id = s.user_id
                           WHERE s.song = ${song} AND s.diff = ${diff}
                           ORDER BY s.score DESC, s.played_at ASC LIMIT 30`;
    res.json(rows);
  },
};

export default async function handler(req, res) {
  const route = routes[`${req.method} ${req.query.action}`];
  if (!route) return res.status(404).json({ error: '없는 API예요' });
  try {
    await init();
    await route(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버가 잠깐 졸고 있어요. 다시 시도해 주세요' });
  }
}
