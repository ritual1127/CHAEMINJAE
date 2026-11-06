// 모든 API를 한 함수로 처리
// 회원: signup, login, logout, me, rename, user(공개 프로필) / 게임: act, guest-play, rank, rank-total / 우편: mail, mail-read, mail-claim, mail-delete
// 문의: inquiry, inquiries / 공지: notices / 상태(점검 · 점검 예고 · 뽑기 확률 · 버전 + 지금 접속 중 신호 + 멀티 초대 · 친구 신청 수): status
// 친구: friends, friend-request, friend-accept, friend-decline, friend-remove, friend-gift
// 멀티플레이: mp-create, mp-join, mp-leave, mp-set, mp-ready, mp-start, mp-kick, mp-host, mp-invite, mp-sync
// 초대 · 자랑 · 쿠폰: signup(친구 코드), boast, coupon / 관리자: admin-coupon, admin-growth(쿠폰 · 유입 · 보안 기록)
// 관리자: admin-login, admin-logout, admin-stats, admin-online, admin-recent, admin-maintenance, admin-preview, admin-schedule, admin-rates,
//         admin-mail, admin-inquiries, admin-inquiry-kind, admin-reply, admin-notice, admin-notice-delete, admin-grant, admin-room-close, admin-user
import { neon } from '@neondatabase/serverless';
import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import {
  act, newSave, normalize, teamPower, unlocked, levelOf, GameError, BANNER, FREE_AVATARS, RANKS, RENAME_COINS, SERVER_ONLY, VERSION, INQUIRY, MP, ATTACKS,
  itemize, perksOf, frameOfSave, GIFT, CHAR, RARITY, TOP, mpOrder, BOT_SKILL, makeBot, botPlay, REF,
} from '../public/rules.js';
import { SONG, DIFFS, DIFF_NAME, compile, playSong, makeChart } from '../public/songs.js';

const sql = neon(process.env.DATABASE_URL);
const DAY = 86400;
const NAME = /^[가-힣a-zA-Z0-9_]{2,12}$/;
const R48 = 2 ** 48 - 1; // randomInt가 받는 가장 큰 범위
const rand = () => randomInt(R48) / R48; // 뽑기는 서버 난수로 (48비트: 초월 0.00000001%도 그대로)
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const WELCOME = { title: '🎉 먼작귀 리듬 파티에 온 걸 환영해요!', body: '시작 선물로 보석 500개를 보내요. 매일 출석 · 미션 · 접속 보상도 꼭 챙겨 가세요!', gems: 500 };
// 이 버전으로 처음 배포될 때 공지사항에 한 번 올라가는 업데이트 내역 (관리자 페이지에서 고칠 수 있다)
const SCHEMA = 3; // 표 구조를 바꿀 때마다 +1 (같은 버전에서도 init이 다시 돈다)
const RELEASE = {
  title: '파티 업데이트! 신나는 새 곡 · 친구 코드 · 점수 자랑 · 더 화끈한 타격감',
  body: [
    '🎺 새 곡 3개 (새 장르 파티 · 축제): 라 쿠카라차 피에스타 (마리아치) · 하바 나길라 (점점 빨라져요!) · 우라! 삼바 카니발 — 모두 무료!',
    '💥 노트를 치면 충격파 · 빛기둥 · 깨지는 조각이 팡팡! 50콤보마다 꽃가루, 100콤보부터 판정선이 무지개로 · 치는 소리는 그 음 높이로',
    '🎹 채보를 새로 다듬었어요: 같은 모양이 계속 나오지 않게, 구절마다 손 모양이 달라져요 (모든 곡 · 모든 난이도)',
    '👫 친구 코드: 친구가 내 코드로 가입하면 친구는 보석 300개 + 바로 서로 친구, 친구가 3곡 연주하면 나도 보석 300개 (친구 창에서 코드 · 초대 링크)',
    '📣 점수 자랑: 결과 화면에서 친구들 우편함으로 자랑하기 · 링크로 공유하기',
    '🎟 쿠폰 코드: 우편함에서 쿠폰을 넣으면 선물이 우편으로 와요',
    '🎼 19곡의 반주를 고쳤어요 (멜로디와 어긋나던 화음)',
    '🛡 연주를 안 하고 기록만 올리는 부정 기록을 막고, 로그인을 여러 번 틀리면 잠깐 쉬어요',
    '— 아래는 지난 업데이트 —',
    '🎵 새 곡 101개! 장르 12개 (클래식 · 동요 · 민요 · 캐럴 · EDM · K-POP 스타일 · 복고 · 트로트 · 퐁크 · 칩튠 · 로파이 · 록 · 재즈)',
    '🎹 노트가 덜 질리게: 같은 가락이 다시 나오면 다른 모양으로, 같은 칸 연타 대신 번갈아 치기, 후렴 첫 박 동시치기',
    '👫 친구: 닉네임으로 친구 신청 · 멀티 방으로 초대 · 매일 무료 선물과 코인 · 보석 선물',
    '👥 멀티: 최대 10명 · 방 코드 4자리 숫자 · 공격은 연주 중 나오는 아이템 노트로 💣 · 1등이 다음 방장 · 방장 넘기기 · 내보내기 · 종합 점수와 이전 판 기록 · 공격 키 바꾸기',
    '⭐ 플레이어 레벨 최대 1000! 10레벨마다 새 프로필 테두리 (101가지) · 레벨 혜택 (코인 · 경험치 보너스, 친구 수, 선물 횟수, 출석 보상)',
    '🃏 진화 대신 레벨 업: 같은 친구 카드를 모아 최대 20레벨 (예전 진화는 1번마다 +3레벨로 바뀌었어요)',
    '🪐 새 등급 초월: 0.00000001% 확률의 말도 안 되게 센 친구 2명',
    '🤖 멀티에 AI 넣기 (쉬움 · 보통 · 어려움 · 고수) · 휴대폰에서도 멀티 플레이!',
    '🛍 상점: 오늘의 카드 (매일 바뀌는 캐릭터 카드) · 행운 상자 · 경험치 물약 · 새 부스터 4종 (방패 젤리 · 정확 안경 · 코인 주머니 · 경험치 책)',
    '🏆 랭킹: 전체 · 최근 30일 · 7일 · 오늘 기간별로, 100위까지',
    '🛠 연주 안정화: 터치 · 키 입력이 늦게 처리돼도 누른 순간으로 판정 · 시작 연타로 게임이 두 번 켜지던 문제 · 몇 곡 하면 휴대폰에서 튕기던 문제 · 일시정지 후 3 · 2 · 1',
    '🎧 로비 음악이 잔잔한 곡들로 돌아가며 나와요 · 마구 연타하면 MISS (너무 일찍 누르면 그 노트는 놓쳐요)',
    '🏅 업적 5만 개 이상 · 화면을 휴대폰 · PC에 맞게 새로 다듬었어요',
  ].join('\n'),
};

// 테이블은 첫 요청 때 만든다 (별도 마이그레이션 단계 없음). 이미 있는 테이블은 건드리지 않고 새 테이블만 더한다
// 이 버전으로 한 번 다 만들었으면 표시 행이 남아서, 그 뒤 새로 뜬 함수 인스턴스는 질문 한 번으로 끝낸다 (사람이 몰려 인스턴스가 많이 떠도 DB가 편하게)
let ready;
const init = () => (ready ??= (async () => {
  try {
    if ((await sql`SELECT 1 FROM app_settings WHERE key = ${`ready:${VERSION}:${SCHEMA}`}`).length) return;
  } catch { /* 처음 만드는 DB: 아래에서 모두 만든다 */ }
  await sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    pw TEXT NOT NULL,
    avatar INT NOT NULL DEFAULT 1,
    save JSONB,
    ver INT NOT NULL DEFAULT 0,
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS save JSONB,
    ADD COLUMN IF NOT EXISTS ver INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ,
    DROP COLUMN IF EXISTS plays`;
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
  await sql`CREATE TABLE IF NOT EXISTS play_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    song TEXT NOT NULL,
    diff TEXT NOT NULL,
    raw INT NOT NULL,
    score INT NOT NULL,
    rank TEXT NOT NULL,
    cleared BOOLEAN NOT NULL,
    played_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  // ponytail: 우편은 지우지 않고 최근 50통만 보여 준다. 쌓여서 느려지면 받은 지 30일 지난 우편 정리
  await sql`CREATE TABLE IF NOT EXISTS mail (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'system',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    coins INT NOT NULL DEFAULT 0,
    gems INT NOT NULL DEFAULT 0,
    read BOOLEAN NOT NULL DEFAULT false,
    claimed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS mail_user ON mail (user_id, id DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS inquiries (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    reply TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    replied_at TIMESTAMPTZ)`;
  await sql`CREATE TABLE IF NOT EXISTS notices (
    id SERIAL PRIMARY KEY,
    version TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ)`;
  await sql`ALTER TABLE play_log ADD COLUMN IF NOT EXISTS multi BOOLEAN NOT NULL DEFAULT false`;
  // 지금 접속 중: 열려 있는 화면(기기마다 임의 번호)이 30초마다 신호를 보낸다
  await sql`CREATE TABLE IF NOT EXISTS presence (
    vid TEXT PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    screen TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    since TIMESTAMPTZ NOT NULL DEFAULT now(),
    seen_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  // 멀티플레이 방: 자리(0~5)가 겹치지 않게 해서 6명을 넘지 않는다 · 한 사람은 한 방에만
  await sql`CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    host INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song TEXT NOT NULL,
    diff TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'lobby',
    round INT NOT NULL DEFAULT 0,
    start_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS room_players (
    code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    seat INT NOT NULL CHECK (seat BETWEEN 0 AND 5),
    name TEXT NOT NULL,
    avatar INT NOT NULL DEFAULT 1,
    lv INT NOT NULL DEFAULT 1,
    ready BOOLEAN NOT NULL DEFAULT false,
    state JSONB,
    result JSONB,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (code, user_id),
    UNIQUE (code, seat))`;
  await sql`CREATE TABLE IF NOT EXISTS room_events (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    round INT NOT NULL,
    from_id INT NOT NULL,
    to_id INT NOT NULL,
    kind TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  // v4: 레벨 · 테두리 · 종합 점수 칸 (랭킹 · 관리자 통계가 저장 데이터 JSON을 매번 뜯지 않게) + 자주 찾는 칸에 색인
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS lv INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS frame INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_score BIGINT NOT NULL DEFAULT 0`;
  await sql`CREATE INDEX IF NOT EXISTS scores_board ON scores (song, diff, score DESC, played_at)`;
  await sql`CREATE INDEX IF NOT EXISTS users_total ON users (total_score DESC) WHERE total_score > 0`;
  await sql`CREATE INDEX IF NOT EXISTS users_seen ON users (last_seen)`;
  await sql`CREATE INDEX IF NOT EXISTS play_log_at ON play_log (played_at)`;
  await sql`CREATE INDEX IF NOT EXISTS play_log_board ON play_log (song, diff, played_at) WHERE user_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS presence_seen ON presence (seen_at)`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`;
  // 멀티 v4: 10자리 · 종합 점수 · 이전 판 · 1등 횟수 · 마지막 연주 시각(30분 지나면 방 정리) · 내보낸 사람
  await sql`ALTER TABLE room_players DROP CONSTRAINT IF EXISTS room_players_seat_check`;
  await sql`ALTER TABLE room_players ADD CONSTRAINT room_players_seat_check CHECK (seat BETWEEN 0 AND 9) NOT VALID`;
  await sql`ALTER TABLE room_players ADD COLUMN IF NOT EXISTS total BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS wins INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS plays INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last JSONB,
    ADD COLUMN IF NOT EXISTS frame INT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS banned INT[] NOT NULL DEFAULT '{}'`;
  // 멀티 AI: 방에 넣은 AI 목록 [{ id(음수), seat, skill, name, avatar, lv, total, wins, plays, last }]
  await sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bots JSONB NOT NULL DEFAULT '[]'`;
  // 친구: (나 → 친구) 한 줄. 신청은 pending, 받아 주면 양쪽 모두 accepted 줄이 생긴다
  await sql`CREATE TABLE IF NOT EXISTS friends (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, friend_id),
    CHECK (user_id <> friend_id))`;
  await sql`CREATE INDEX IF NOT EXISTS friends_in ON friends (friend_id, status)`;
  // 멀티 방 초대 (2분 동안만 유효)
  await sql`CREATE TABLE IF NOT EXISTS room_invites (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL,
    from_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS room_invites_to ON room_invites (to_id, created_at)`;
  // 화면 에러 모음 (관리자 페이지에서 본다 · 최근 3일만 남긴다)
  await sql`CREATE TABLE IF NOT EXISTS client_errors (
    id SERIAL PRIMARY KEY,
    user_id INT,
    msg TEXT NOT NULL,
    stack TEXT,
    place TEXT,
    song TEXT,
    ua TEXT,
    ver TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS client_errors_at ON client_errors (created_at)`;
  // 한 번만: 레벨 · 테두리 · 종합 점수 칸 채우기 (여러 인스턴스가 동시에 떠도 표시 행을 먼저 넣은 쪽만)
  await sql`WITH s AS (INSERT INTO app_settings (key, value) VALUES ('migrate:v4-columns', 'true'::jsonb) ON CONFLICT (key) DO NOTHING RETURNING key)
            UPDATE users u SET total_score = coalesce((SELECT sum(score) FROM scores WHERE user_id = u.id), 0),
              lv = coalesce((save->>'exp')::int, 0) / 100 + 1
            WHERE EXISTS (SELECT 1 FROM s)`;
  // 버전마다 한 번만 (여러 인스턴스가 동시에 떠도 표시 행을 먼저 넣은 쪽만 공지를 올린다)
  await sql`WITH s AS (INSERT INTO app_settings (key, value) VALUES (${`seed:${VERSION}`}, 'true'::jsonb) ON CONFLICT (key) DO NOTHING RETURNING key)
            INSERT INTO notices (version, title, body) SELECT ${VERSION}, ${RELEASE.title}, ${RELEASE.body} FROM s`;
  // 회원 정지 (관리자): 정지 기간 · 사유
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS ban_reason TEXT`;
  // 관리자가 정해 준 임시 비밀번호 (관리자 화면에 계속 보여 주려고 따로 둔다)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_pw TEXT, ADD COLUMN IF NOT EXISTS temp_pw_at TIMESTAMPTZ`;
  // v4.1: 친구 코드로 가입 (누가 초대했는지 · 초대 보상을 줬는지) · 쿠폰 · 보안 기록 (로그인 실패 · 가입 · 이상한 기록 → 횟수 제한 + 관리자 화면)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_by INT, ADD COLUMN IF NOT EXISTS ref_paid BOOLEAN NOT NULL DEFAULT false`;
  await sql`CREATE INDEX IF NOT EXISTS users_ref ON users (ref_by) WHERE ref_by IS NOT NULL`;
  await sql`CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    coins INT NOT NULL DEFAULT 0,
    gems INT NOT NULL DEFAULT 0,
    max_uses INT NOT NULL DEFAULT 0,
    used INT NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS coupon_uses (
    code TEXT NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (code, user_id))`;
  await sql`CREATE TABLE IF NOT EXISTS sec_log (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    k TEXT NOT NULL DEFAULT '',
    user_id INT,
    detail TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS sec_log_at ON sec_log (kind, created_at)`;
  await sql`INSERT INTO app_settings (key, value) VALUES (${`ready:${VERSION}:${SCHEMA}`}, 'true'::jsonb) ON CONFLICT (key) DO NOTHING`;
})().catch((e) => { ready = null; throw e; }));

// 관리자 설정(점검 · 점검 예고 · 뽑기 확률): 함수 인스턴스마다 5초 캐시 (관리자가 바꾸면 늦어도 5초 뒤 모든 요청에 반영)
const settingCache = new Map();
async function setting(key, fresh = false) {
  const hit = settingCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 5000) return hit.value;
  const [row] = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  settingCache.set(key, { at: Date.now(), value: row?.value ?? null });
  return row?.value ?? null;
}
const putSetting = async (key, value) => {
  await sql`INSERT INTO app_settings (key, value) VALUES (${key}, ${JSON.stringify(value)}::jsonb)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  settingCache.delete(key);
};
const maintenance = async (fresh) => { const v = await setting('maintenance', fresh); return v?.on ? v : null; };
// 점검 예고: 끝나는 시각이 지나면 자동으로 안 보인다
const schedule = async () => { const v = await setting('schedule'); return v?.on && Date.parse(v.to) > Date.now() ? v : null; };
const gameCfg = async () => ({ rates: (await setting('rates')) ?? {} });

const hash = (s) => createHash('sha256').update(String(s)).digest();
const same = (a, b) => timingSafeEqual(hash(a), hash(b));
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
// 요청에서 온 이름이 표에 '직접' 있는지 ('constructor' 같은 물려받은 이름은 없는 걸로)
const has = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);

/* ---------- 보안 기록: 로그인 실패 · 가입 · 이상한 기록 · 쿠폰 실패. 횟수 제한에 쓰고 관리자 화면에서 본다 (14일 보관) ---------- */
// 요청한 사람의 IP (Vercel이 직접 채우는 값이라 요청 쪽에서 속일 수 없다)
const ipOf = (req) => text(req.headers?.['x-real-ip'] ?? String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0], 60) || 'local';
const logSec = async (kind, k, uid = null, detail = '') => {
  await sql`INSERT INTO sec_log (kind, k, user_id, detail) VALUES (${kind}, ${k}, ${uid}, ${text(detail, 200)})`;
  if (Math.random() < 0.02) await sql`DELETE FROM sec_log WHERE created_at < now() - interval '14 days'`;
};
// 최근 mins분 동안 이 열쇠(IP · 회원)로 쌓인 기록 수
const hits = async (kind, k, mins) => (await sql`SELECT count(*)::int AS n FROM sec_log
  WHERE kind = ${kind} AND k = ${k} AND created_at > now() - make_interval(mins => ${mins}::int)`)[0].n;
// 로그인: 10분 동안 같은 IP에서 30번 · 같은 닉네임으로 10번 틀리면 잠깐 막는다 (비밀번호 찍어 맞히기 방지)
const loginBlocked = async (ip, name) => {
  const [r] = await sql`SELECT count(*) FILTER (WHERE k = ${ip})::int AS ip, count(*) FILTER (WHERE detail = ${name})::int AS name
    FROM sec_log WHERE kind = 'login-fail' AND created_at > now() - interval '10 minutes'`;
  return r.ip >= 30 || (Boolean(name) && r.name >= 10);
};
const couponCode = (v) => text(v, 24).toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');

const hashPw = (pw, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
const checkPw = (pw, stored) => {
  const [salt, h] = stored.split(':');
  return timingSafeEqual(Buffer.from(h, 'hex'), scryptSync(pw, salt, 64));
};

const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// 쿠키에는 랜덤 토큰, DB에는 그 해시만 저장
async function startSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  await sql`INSERT INTO sessions (token, user_id, expires_at)
            VALUES (${hash(token).toString('hex')}, ${userId}, now() + interval '30 days')`;
  await sql`UPDATE users SET last_seen = now() WHERE id = ${userId}`;
  res.setHeader('Set-Cookie', cookie('sid', token, 30 * DAY));
}

async function currentUser(req) {
  const token = req.cookies?.sid;
  if (!token) return null;
  const [user] = await sql`SELECT u.id, u.username, u.avatar, u.save FROM sessions s JOIN users u ON u.id = s.user_id
                           WHERE s.token = ${hash(token).toString('hex')} AND s.expires_at > now() AND (u.banned_until IS NULL OR u.banned_until < now())`;
  return user ?? null;
}

// 안 읽었거나 선물을 안 받은 우편 수 (빨간 점)
const unreadOf = async (userId) => (await sql`SELECT count(*)::int AS n FROM mail
  WHERE user_id = ${userId} AND (NOT read OR (NOT claimed AND (coins > 0 OR gems > 0)))`)[0].n;

const profile = async (u) => ({ username: u.username, avatar: u.avatar, save: normalize(u.save), unread: await unreadOf(u.id), code: REF.base + u.id });

// 관리자 계정은 코드가 아니라 환경변수(ADMIN_USER, ADMIN_PASSWORD)에 둔다
function isAdmin(username, password) {
  const { ADMIN_USER: u, ADMIN_PASSWORD: p } = process.env;
  return Boolean(u && p) && same(String(username).trim(), u) && same(String(password), p);
}

async function startAdmin(res) {
  const token = randomBytes(32).toString('base64url');
  await sql`INSERT INTO admin_sessions (token, expires_at) VALUES (${hash(token).toString('hex')}, now() + interval '12 hours')`;
  res.setHeader('Set-Cookie', cookie('aid', token, DAY / 2));
}

async function adminOk(req) {
  const token = req.cookies?.aid;
  if (!token) return false;
  const [row] = await sql`SELECT 1 FROM admin_sessions WHERE token = ${hash(token).toString('hex')} AND expires_at > now()`;
  return Boolean(row);
}

// 점검 중 미리보기: 관리자 로그인만으로는 안 되고, 관리자 페이지에서 미리보기를 켠 브라우저만 게임에 들어갈 수 있다
const previewing = async (req) => req.cookies?.apv === '1' && (await adminOk(req));

// 저장 데이터 갱신: 동시에 두 요청이 와도 ver 비교로 한쪽만 반영되고 나머지는 다시 시도. 레벨 · 테두리 칸도 같이 (랭킹 · 친구 목록용)
async function mutate(userId, apply) {
  for (let i = 0; i < 4; i++) {
    const [row] = await sql`SELECT save, ver FROM users WHERE id = ${userId}`;
    if (!row) throw new GameError('없는 회원이에요');
    const out = apply(row.save);
    const ok = await sql`UPDATE users SET save = ${JSON.stringify(out.save)}::jsonb, ver = ver + 1, last_seen = now(),
                           lv = ${levelOf(out.save.exp)}, frame = ${frameOfSave(out.save)}
                         WHERE id = ${userId} AND ver = ${row.ver} RETURNING id`;
    if (ok.length) return out;
  }
  throw new Error('저장이 몰려서 실패했어요');
}

// 신기록이면 랭킹에 올리고, 내가 이번에 제친 사람들에게 우편을 보낸다
async function board(user, a) {
  const [old] = await sql`SELECT score FROM scores WHERE user_id = ${user.id} AND song = ${a.song} AND diff = ${a.diff}`;
  if (old && old.score >= a.score) return null; // 다른 기기에서 세운 기록이 더 높음
  // 기록을 바꾸면서 종합 점수(모든 곡 최고 점수의 합)도 늘어난 만큼 (바뀐 줄이 있을 때만)
  await sql`WITH prev AS (SELECT score FROM scores WHERE user_id = ${user.id} AND song = ${a.song} AND diff = ${a.diff}),
              up AS (INSERT INTO scores (user_id, song, diff, score, combo, rank) VALUES (${user.id}, ${a.song}, ${a.diff}, ${a.score}, ${a.combo}, ${a.rank})
              ON CONFLICT (user_id, song, diff) DO UPDATE
              SET score = EXCLUDED.score, combo = EXCLUDED.combo, rank = EXCLUDED.rank, played_at = now()
              WHERE scores.score < EXCLUDED.score RETURNING score)
            UPDATE users SET total_score = total_score + (SELECT score FROM up) - coalesce((SELECT score FROM prev), 0)
            WHERE id = ${user.id} AND EXISTS (SELECT 1 FROM up)`;
  const song = SONG[a.song], from = old?.score ?? 0;
  const title = `🏁 ${user.username}님이 내 기록을 넘어섰어요!`;
  const body = `'${song.title}' ${DIFF_NAME[a.diff]} 랭킹에서 ${user.username}님이 ${fmt(a.score)}점으로 내 기록을 제쳤어요. 다시 도전해서 자리를 되찾아 볼까요?`;
  // 예전 내 점수 이상 ~ 이번 점수 미만이던 사람들 = 이번에 내가 제친 사람 (가까운 순 20명까지)
  const passed = await sql`INSERT INTO mail (user_id, kind, title, body)
    SELECT user_id, 'rank', ${title}, ${body} FROM (
      SELECT user_id FROM scores WHERE song = ${a.song} AND diff = ${a.diff} AND user_id <> ${user.id}
        AND score < ${a.score} AND score >= ${from} ORDER BY score DESC LIMIT 20) p
    RETURNING id`;
  const [{ pos, total }] = await sql`SELECT
    (SELECT count(*)::int FROM scores WHERE song = ${a.song} AND diff = ${a.diff} AND user_id <> ${user.id} AND score >= ${a.score}) + 1 AS pos,
    (SELECT count(*)::int FROM scores WHERE song = ${a.song} AND diff = ${a.diff}) AS total`;
  const [{ before } = {}] = old ? await sql`SELECT count(*)::int + 1 AS before FROM scores
    WHERE song = ${a.song} AND diff = ${a.diff} AND user_id <> ${user.id} AND score > ${old.score}` : [];
  return { rank: pos, prev: old ? Math.max(before, pos) : null, total, passed: passed.length };
}

const validPlay = (b) => SONG[b.song] && DIFFS.includes(b.diff) && RANKS.includes(b.rank) && isInt(b.raw, 0, 1e6) && isInt(b.score, 0, 3e6);
const login = (res) => res.status(401).json({ error: '다시 로그인해 주세요' });
const adminOnly = (res) => res.status(401).json({ error: '관리자 로그인이 필요해요' });

// 지금 접속 중 신호: 화면(기기마다 임의 번호 v)이 30초마다 /api/status?v=&s=(지금 화면)&d=(pc|mo). 회원이면 마지막 접속도 같이
// 같은 문장에서 회원이면 2분 안에 받은 멀티 초대 · 답하지 않은 친구 신청 수도 돌려준다 (질문 한 번)
async function seen(req) {
  const { v = '', s = '', d = '' } = req.query, token = req.cookies?.sid ? hash(req.cookies.sid).toString('hex') : '';
  if (!/^[\w-]{8,40}$/.test(v)) return null;
  const [r] = await sql`WITH u AS (SELECT user_id FROM sessions WHERE token = ${token} AND expires_at > now()),
    l AS (UPDATE users SET last_seen = now() WHERE id = (SELECT user_id FROM u)),
    p AS (INSERT INTO presence (vid, user_id, screen, device) VALUES (${v}, (SELECT user_id FROM u), ${/^[\w:-]{1,40}$/.test(s) ? s : ''}, ${d === 'pc' ? 'pc' : 'mo'})
      ON CONFLICT (vid) DO UPDATE SET user_id = EXCLUDED.user_id, screen = EXCLUDED.screen, device = EXCLUDED.device, seen_at = now(),
        since = CASE WHEN presence.seen_at < now() - interval '5 minutes' THEN now() ELSE presence.since END RETURNING 1)
    SELECT (SELECT count(*)::int FROM p) AS ok,
      (SELECT coalesce(json_agg(json_build_object('id', i.id, 'code', i.code, 'from', f.username, 'avatar', f.avatar) ORDER BY i.id DESC), '[]'::json)
        FROM room_invites i JOIN users f ON f.id = i.from_id
        WHERE i.to_id = (SELECT user_id FROM u) AND i.created_at > now() - interval '2 minutes') AS invites,
      (SELECT count(*)::int FROM friends WHERE friend_id = (SELECT user_id FROM u) AND status = 'pending') AS requests`;
  return r;
}

/* ---------- 멀티플레이 (PC): 참가 코드(숫자 4자리)로 방 · 최대 10명 · 방장이 곡 고르기 · 모두 준비하면 같은 시각에 시작 · 아이템 노트 공격
   · 판이 끝나면 1등이 방장 · 종합 점수 · 이전 판 기록 · 30분 동안 연주가 없으면 방이 닫힌다 ---------- */
// ponytail: 실시간 서버 없이 Postgres + 짧은 폴링(게임 중 0.35초 · 대기 2초). 방이 많아져 DB가 바빠지면 WebSocket 서비스(Ably 등)로 옮긴다
const roomCode = () => String(randomInt(1000, 10000));
const songMs = new Map();
const durMs = (song, diff) => {
  const k = `${song}:${diff}`;
  if (!songMs.has(k)) songMs.set(k, compile(playSong(SONG[song], diff)).duration * 1000);
  return songMs.get(k);
};
// 이 판에서 한 사람이 쓸 수 있는 공격 수 = 채보의 아이템 노트 수 (화면을 고쳐서 마구 공격하는 걸 막는다). 화면도 같은 열쇠로 아이템을 만든다
const itemCap = new Map();
const itemsOf = (song, diff, round) => {
  const k = `${song}:${diff}:${round}`;
  if (!itemCap.has(k)) {
    if (itemCap.size > 500) itemCap.clear();
    itemCap.set(k, SONG[song] ? itemize(makeChart(SONG[song], diff).tiles, k).filter((n) => n.item).length : 0);
  }
  return itemCap.get(k);
};
const noteCount = new Map();
const notesOf = (song, diff) => {
  const k = `${song}:${diff}`;
  if (!noteCount.has(k)) noteCount.set(k, SONG[song] ? makeChart(SONG[song], diff).tiles.length : 1);
  return noteCount.get(k);
};
// 올라온 기록이 채보로 가능한지 볼 때 쓰는 값 (rules.js finish): 곡 길이(ms) · 판정 수 · 시작 뒤 t초까지 나올 수 있는 판정 수 (롱노트는 누름 + 뗌 두 번)
const charts = new Map();
function chartOf(song, diff) {
  const k = `${song}:${diff}`;
  if (!charts.has(k)) {
    if (charts.size > 300) charts.clear();
    const times = makeChart(SONG[song], diff).tiles.flatMap((n) => (n.hold ? [n.t, n.t] : [n.t])).sort((x, y) => x - y);
    charts.set(k, { ms: durMs(song, diff), total: times.length, at: (t) => { let n = 0; while (n < times.length && times[n] <= t) n++; return n; } });
  }
  return charts.get(k);
}
// 친구 코드로 가입한 회원이 REF.plays곡을 연주하면 초대한 친구에게 보석 (초대한 사람마다 REF.max명까지). 한 번만 (ref_paid)
async function payReferrer(user) {
  const [r] = await sql`UPDATE users SET ref_paid = true WHERE id = ${user.id} AND ref_by IS NOT NULL AND NOT ref_paid RETURNING ref_by`;
  if (!r) return;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM users WHERE ref_by = ${r.ref_by} AND ref_paid`;
  if (n > REF.max) return;
  await sql`INSERT INTO mail (user_id, kind, title, body, gems) SELECT id, 'gift', ${`🎉 ${user.username}님이 내 친구 코드로 놀러 왔어요!`},
    ${`초대한 친구가 연주를 시작했어요. 고마운 마음으로 보석 ${REF.invite}개를 보내요 (${n}/${REF.max}명째)`}, ${REF.invite} FROM users WHERE id = ${r.ref_by}`;
}
/* ---------- 랭킹 판: 정렬된 (회원 · 점수) 목록을 잠깐 기억해 두고, 내 순위는 이진 탐색 · 점수 분포는 목록에서 바로 ---------- */
// ponytail: 인스턴스마다 메모리 캐시 (곡 30초 · 종합 20초 · 기간 종합 2분). 회원이 수백만이 되면 Redis 같은 공용 캐시로
const PERIODS = { all: null, month: '30 days', week: '7 days', day: '1 day' };
const boards = new Map();
function boardOf(key, load, ttl = 30000) {
  const hit = boards.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = load().then((rows) => ({ ids: rows.map((r) => r.id), scores: Float64Array.from(rows, (r) => Number(r.score)) }));
  boards.set(key, { at: Date.now(), p });
  p.catch(() => boards.delete(key));
  if (boards.size > 400) boards.delete(boards.keys().next().value);
  return p;
}
async function boardView(b, uid, best, songs = false) {
  const top = b.ids.slice(0, 100);
  const [users, mine] = await Promise.all([
    !top.length ? [] : songs
      ? sql`SELECT id, username, avatar, lv, frame, (SELECT count(*)::int FROM scores WHERE user_id = users.id) AS songs FROM users WHERE id = ANY(string_to_array(${top.join(',')}, ',')::int[])`
      : sql`SELECT id, username, avatar, lv, frame FROM users WHERE id = ANY(string_to_array(${top.join(',')}, ',')::int[])`,
    best && uid ? sql`SELECT combo, rank FROM scores WHERE user_id = ${uid} AND song = ${best.song} AND diff = ${best.diff}` : [],
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const extra = best && top.length ? new Map((await sql`SELECT user_id, combo, rank FROM scores WHERE song = ${best.song} AND diff = ${best.diff}
    AND user_id = ANY(string_to_array(${top.join(',')}, ',')::int[])`).map((r) => [r.user_id, r])) : new Map();
  const list = top.map((id, i) => ({ ...byId.get(id), ...extra.get(id), score: b.scores[i], id: undefined })).filter((r) => r.username);
  let me = null;
  const at = uid ? b.ids.indexOf(uid) : -1; // ponytail: indexOf는 O(n) — 수십만 명까지는 1ms 안쪽
  if (at >= 0) {
    let lo = 0, hi = at; // 같은 점수면 앞사람과 같은 순위
    while (lo < hi) { const m = (lo + hi) >> 1; if (b.scores[m] > b.scores[at]) lo = m + 1; else hi = m; }
    me = { score: b.scores[at], pos: lo + 1, ...mine[0] };
  }
  return { top: list, me, total: b.ids.length };
}


// 게임 중에는 0.35초마다 부르니 저장 데이터는 안 읽고 회원 번호만
async function uidOf(req) {
  const token = req.cookies?.sid;
  if (!token) return 0;
  const [row] = await sql`SELECT user_id FROM sessions WHERE token = ${hash(token).toString('hex')} AND expires_at > now()`;
  return row?.user_id ?? 0;
}

// 방에서 내보내기: 방장이 나갔으면 다음 자리 사람이 방장, 아무도 없으면 방을 지운다
async function prune(code, ids) {
  await sql`DELETE FROM room_players WHERE code = ${code} AND user_id = ANY(string_to_array(${ids.join(',')}, ',')::int[])`;
  await sql`DELETE FROM rooms WHERE code = ${code} AND NOT EXISTS (SELECT 1 FROM room_players WHERE code = ${code})`;
  await sql`UPDATE rooms SET host = (SELECT user_id FROM room_players WHERE code = ${code} ORDER BY seat LIMIT 1), updated_at = now()
            WHERE code = ${code} AND host NOT IN (SELECT user_id FROM room_players WHERE code = ${code})
              AND EXISTS (SELECT 1 FROM room_players WHERE code = ${code})`;
}
const leaveAll = async (uid) => {
  for (const { code } of await sql`SELECT code FROM room_players WHERE user_id = ${uid}`) await prune(code, [uid]);
};

// 비어 있는 가장 앞자리에 앉기. 자리(code, seat)가 겹치면 DB가 막아 주니 다시 시도
async function sit(code, u) {
  const s = normalize(u.save);
  for (let i = 0; i < 4; i++) {
    try {
      const [p] = await sql`INSERT INTO room_players (code, user_id, seat, name, avatar, lv, frame)
        SELECT ${code}, ${u.id}, s, ${u.username}, ${u.avatar}, ${levelOf(s.exp)}, ${frameOfSave(s)} FROM generate_series(0, ${MP.max - 1}) s
        WHERE EXISTS (SELECT 1 FROM rooms WHERE code = ${code} AND status <> 'playing')
          AND s NOT IN (SELECT seat FROM room_players WHERE code = ${code})
          AND s NOT IN (SELECT (b->>'seat')::int FROM rooms, jsonb_array_elements(rooms.bots) b WHERE rooms.code = ${code})
        ORDER BY s LIMIT 1 RETURNING seat`;
      return Boolean(p);
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  return false;
}

// 판이 끝났을 때 한 번만: 결과를 낸 사람은 종합 점수 · 판 수 · 이전 판(순위 · 점수 · 랭크)을 남기고, 1등은 1등 횟수 +1 · 다음 방장
async function endRound(code, r) {
  const done = r.players.filter((p) => p.result && !p.result.quit);
  const order = mpOrder(done.map((p) => ({ id: p.id, seat: p.seat, raw: Number(p.result.raw) || 0 })));
  const place = new Map(order.map((p, i) => [p.id, i + 1])), winner = order[0]?.id;
  const rows = r.players.filter((p) => p.result).map((p) => ({
    id: p.id, raw: p.result.quit ? 0 : Math.max(0, Math.min(1e6, Number(p.result.raw) || 0)), rank: RANKS.includes(p.result.rank) ? p.result.rank : 'D',
    place: place.get(p.id) ?? 0, quit: Boolean(p.result.quit),
  }));
  // AI 기록은 rooms.bots에
  if (r.bots?.length) {
    const bots = r.bots.map((b) => {
      const x = rows.find((q) => q.id === b.id);
      return x ? { ...b, total: b.total + x.raw, plays: b.plays + 1, wins: b.wins + (x.place === 1 ? 1 : 0),
        last: { raw: x.raw, rank: x.rank, place: x.place, quit: false, round: r.round, song: r.song, diff: r.diff } } : b;
    });
    await sql`UPDATE rooms SET bots = ${JSON.stringify(bots)}::jsonb WHERE code = ${code}`;
  }
  const humans = rows.filter((x) => x.id > 0);
  if (humans.length) {
    await sql`WITH x AS (SELECT * FROM json_to_recordset(${JSON.stringify(humans)}::json) AS x(id int, raw int, rank text, place int, quit boolean))
      UPDATE room_players p SET total = p.total + x.raw, plays = p.plays + 1, wins = p.wins + (CASE WHEN x.place = 1 THEN 1 ELSE 0 END),
        last = json_build_object('raw', x.raw, 'rank', x.rank, 'place', x.place, 'quit', x.quit, 'round', ${r.round}::int, 'song', ${r.song}::text, 'diff', ${r.diff}::text)::jsonb
      FROM x WHERE p.code = ${code} AND p.user_id = x.id`;
  }
  if (!(winner > 0)) return; // AI가 1등이면 방장은 그대로
  await sql`UPDATE rooms SET host = ${winner} WHERE code = ${code} AND EXISTS (SELECT 1 FROM room_players WHERE code = ${code} AND user_id = ${winner})`;
  if (done.filter((p) => p.id > 0).length >= 2) await mutate(winner, (s) => act(s, { type: 'mpWin' })).catch(console.error); // 혼자 끝낸 판은 1등 업적에 안 센다
}

// 방 상태 한 번에: 내 신호(+ 이번 판 상태 · 결과)를 올리고 방 · 참가자 · 새 공격을 받는다. 30초 넘게 소식 없는 사람은 내보낸다
async function roomView(code, uid, { since = 0, round = -1, state = null, result = null } = {}) {
  const [r] = await sql`WITH me AS (
      UPDATE room_players p SET seen_at = now(),
        state = CASE WHEN r.status = 'playing' AND r.round = ${round} AND ${state}::jsonb IS NOT NULL THEN ${state}::jsonb ELSE p.state END,
        result = CASE WHEN r.status <> 'lobby' AND r.round = ${round} AND p.result IS NULL AND ${result}::jsonb IS NOT NULL THEN ${result}::jsonb ELSE p.result END
      FROM rooms r WHERE r.code = p.code AND p.code = ${code} AND p.user_id = ${uid} RETURNING p.user_id)
    SELECT r.host, r.song, r.diff, r.status, r.round, (extract(epoch FROM r.start_at) * 1000)::float8 AS start_at,
      (extract(epoch FROM clock_timestamp()) * 1000)::float8 AS now, (SELECT count(*)::int FROM me) AS here,
      extract(epoch FROM coalesce(r.played_at, r.created_at) + interval '30 minutes' - now())::int AS idle_left, r.bots,
      (SELECT coalesce(json_object_agg(to_id, n), '{}'::json) FROM (SELECT to_id, count(*)::int AS n FROM room_events
        WHERE code = r.code AND round = r.round AND to_id < 0 GROUP BY to_id) h) AS bot_hits,
      (SELECT coalesce(json_agg(json_build_object('id', p.user_id, 'seat', p.seat, 'name', p.name, 'avatar', p.avatar, 'lv', p.lv, 'frame', p.frame, 'ready', p.ready,
          'state', p.state, 'result', p.result, 'total', p.total, 'wins', p.wins, 'plays', p.plays, 'last', p.last,
          'idle', extract(epoch FROM now() - p.seen_at)) ORDER BY p.seat), '[]'::json)
        FROM room_players p WHERE p.code = r.code) AS players,
      (SELECT coalesce(json_agg(e ORDER BY e.id), '[]'::json) FROM (SELECT id, from_id AS "from", to_id AS "to", kind FROM room_events
        WHERE code = r.code AND round = r.round AND id > ${since} ORDER BY id LIMIT 100) e) AS events
    FROM rooms r WHERE r.code = ${code}`;
  if (!r?.here) return null;
  // 같은 문장 안의 UPDATE 결과는 목록에 아직 안 보이니, 방금 올린 내 상태 · 결과를 목록에 직접 반영 (마지막으로 끝낸 사람의 요청에서 바로 판이 끝나게)
  const mine = r.players.find((p) => p.id === uid);
  if (mine && r.round === round && r.status === 'playing' && state) mine.state = JSON.parse(state);
  if (mine && r.round === round && r.status !== 'lobby' && !mine.result && result) mine.result = JSON.parse(result);
  // 30분 동안 연주가 없으면 방을 닫는다 (연주 중엔 안 닫는다)
  if (r.status !== 'playing' && r.idle_left <= 0) {
    await sql`DELETE FROM rooms WHERE code = ${code} AND status <> 'playing' AND coalesce(played_at, created_at) < now() - interval '30 minutes'`;
    return { gone: true, idle: true };
  }
  const stale = r.players.filter((p) => p.idle > 30 && p.id !== uid).map((p) => p.id);
  if (stale.length) {
    await prune(code, stale);
    return roomView(code, uid, { since, round, state, result });
  }
  // AI: 판 시작 뒤 지난 시간으로 지금 점수 · 끝났으면 결과 (판이 끝난 뒤엔 다 친 걸로)
  if (r.bots?.length) {
    const dur = durMs(r.song, r.diff), notes = notesOf(r.song, r.diff), key = `${r.song}:${r.diff}:${r.round}`;
    for (const b of r.bots) {
      const sim = r.round > 0 ? botPlay(b, key, r.status === 'playing' ? r.now - r.start_at : Infinity, dur, notes, r.bot_hits[b.id] ?? 0) : {};
      r.players.push({ id: b.id, seat: b.seat, name: b.name, avatar: b.avatar, lv: b.lv, frame: b.frame ?? 0, ready: true, bot: b.skill,
        state: r.status === 'playing' ? sim.state : null, result: r.status === 'lobby' ? null : sim.result ?? null,
        total: b.total, wins: b.wins, plays: b.plays, last: b.last, idle: 0 });
    }
    r.players.sort((a, b) => a.seat - b.seat);
  }
  // 모두 끝냈거나 곡 길이 + 15초가 지나면 이번 판 끝 (먼저 바꾼 요청 하나만 점수 정리)
  if (r.status === 'playing' && (r.players.every((p) => p.result) || r.now > r.start_at + durMs(r.song, r.diff) + 15000)) {
    const [d] = await sql`UPDATE rooms SET status = 'done', updated_at = now() WHERE code = ${code} AND round = ${r.round} AND status = 'playing' RETURNING round`;
    if (d) {
      await endRound(code, r);
      return roomView(code, uid, { since, round });
    }
    r.status = 'done';
  }
  return {
    code, me: uid, host: r.host, song: r.song, diff: r.diff, status: r.status, round: r.round, startAt: r.start_at, now: r.now, idleLeft: r.idle_left,
    players: r.players.map(({ idle, ...p }) => p), events: r.events,
  };
}
const roomCodeOf = (b) => String(b?.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
// 오래된 방 정리: 30분 동안 연주가 없거나, 5분 넘게 아무도 소식이 없는 방
const sweepRooms = () => Promise.all([
  sql`DELETE FROM rooms WHERE status <> 'playing' AND (coalesce(played_at, created_at) < now() - interval '30 minutes'
    OR (created_at < now() - interval '10 minutes' AND NOT EXISTS (SELECT 1 FROM room_players p WHERE p.code = rooms.code AND p.seen_at > now() - interval '5 minutes')))`,
  sql`DELETE FROM room_invites WHERE created_at < now() - interval '1 hour'`,
]);
const friendsOf = async (a, b) => (await sql`SELECT 1 FROM friends WHERE user_id = ${a} AND friend_id = ${b} AND status = 'accepted'`).length > 0;
// 친구 맺기: 받은 신청을 accepted로 바꾸고 내 쪽 줄도 만든다. 친구 수 업적은 두 사람 모두
async function acceptFriend(me, other) {
  await sql`WITH a AS (UPDATE friends SET status = 'accepted' WHERE user_id = ${other} AND friend_id = ${me} RETURNING 1)
            INSERT INTO friends (user_id, friend_id, status) VALUES (${me}, ${other}, 'accepted')
            ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'`;
  for (const id of [me, other]) {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM friends WHERE user_id = ${id} AND status = 'accepted'`;
    await mutate(id, (s) => act(s, { type: 'friends', n })).catch(console.error);
  }
  return { ok: true, friend: true };
}

const routes = {
  async 'POST signup'(req, res) {
    const { username = '', password = '', avatar = 1 } = req.body ?? {};
    const name = String(username).trim();
    if (!NAME.test(name)) return res.status(400).json({ error: '닉네임은 한글·영문·숫자 2~12자로 지어 주세요' });
    if (name === process.env.ADMIN_USER) return res.status(409).json({ error: '쓸 수 없는 닉네임이에요' });
    if (typeof password !== 'string' || password.length < 4 || password.length > 64) return res.status(400).json({ error: '비밀번호는 4자 이상이에요' });
    if (!isInt(avatar, 1, FREE_AVATARS)) return res.status(400).json({ error: '프로필 친구를 골라 주세요' });
    // 한 네트워크(IP)에서 하루 40명까지 (학교 · 학원처럼 같이 쓰는 곳도 넉넉하게, 계정 찍어 내기만 막는다)
    const ip = ipOf(req);
    if ((await hits('signup', ip, 1440)) >= 40) return res.status(429).json({ error: '오늘은 이 네트워크에서 더 가입할 수 없어요. 내일 다시 시도해 주세요' });
    // 친구 코드 (선택): 코드 = REF.base + 초대한 회원 번호
    const code = req.body?.code, refId = Number(code) - REF.base;
    let ref = null;
    if (code !== undefined && code !== null && code !== '') {
      [ref] = isInt(refId, 1, 2 ** 31 - 1) ? await sql`SELECT id, username, lv FROM users WHERE id = ${refId}` : [];
      if (!ref) return res.status(400).json({ error: '없는 친구 코드예요. 코드를 다시 확인하거나 비워 두고 가입해 주세요' });
    }
    const save = { ...newSave(), avatar };
    const [user] = await sql`INSERT INTO users (username, pw, avatar, save, ref_by) VALUES (${name}, ${hashPw(password)}, ${avatar}, ${JSON.stringify(save)}::jsonb, ${ref?.id ?? null})
                             ON CONFLICT (username) DO NOTHING RETURNING id, username, avatar, save`;
    if (!user) return res.status(409).json({ error: '이미 누가 쓰고 있는 닉네임이에요' });
    await logSec('signup', ip, user.id);
    await sql`INSERT INTO mail (user_id, kind, title, body, gems) VALUES (${user.id}, 'gift', ${WELCOME.title}, ${WELCOME.body}, ${WELCOME.gems})`;
    if (ref) { // 초대 선물 + 초대한 친구와 바로 친구 (친구 자리가 남아 있을 때)
      await sql`INSERT INTO mail (user_id, kind, title, body, gems) VALUES (${user.id}, 'gift', ${`🎁 ${ref.username}님의 초대 선물`},
        ${`친구 코드로 가입해서 보석 ${REF.join}개를 더 받았어요. ${ref.username}님과는 벌써 친구예요!`}, ${REF.join})`;
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM friends WHERE user_id = ${ref.id} AND status = 'accepted'`;
      if (n < perksOf(ref.lv).friends) {
        await sql`INSERT INTO friends (user_id, friend_id) VALUES (${ref.id}, ${user.id}) ON CONFLICT DO NOTHING`;
        await acceptFriend(user.id, ref.id);
      }
    }
    await startSession(res, user.id);
    res.json(await profile(user));
  },

  // 틀린 로그인은 보안 기록에 남고, 10분 동안 같은 IP 30번 · 같은 닉네임 10번 틀리면 잠깐 막힌다
  async 'POST login'(req, res) {
    const { username = '', password = '' } = req.body ?? {}, name = text(username, 20), ip = ipOf(req);
    if (await loginBlocked(ip, name)) return res.status(429).json({ error: '로그인을 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요' });
    if (isAdmin(username, password)) {
      await startAdmin(res);
      return res.json({ admin: true });
    }
    const [user] = await sql`SELECT id, username, avatar, save, pw, banned_until, ban_reason FROM users WHERE username = ${name}`;
    if (!user || typeof password !== 'string' || !checkPw(password, user.pw)) {
      await logSec('login-fail', ip, user?.id ?? null, name);
      return res.status(401).json({ error: '닉네임 또는 비밀번호가 달라요' });
    }
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      const until = new Date(user.banned_until).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      return res.status(403).json({ error: `이용이 정지된 계정이에요 (${until}까지)${user.ban_reason ? ` · 사유: ${user.ban_reason}` : ''}` });
    }
    await startSession(res, user.id);
    res.json(await profile(user));
  },

  async 'POST logout'(req, res) {
    if (req.cookies?.sid) await sql`DELETE FROM sessions WHERE token = ${hash(req.cookies.sid).toString('hex')}`;
    res.setHeader('Set-Cookie', cookie('sid', '', 0));
    res.json({ ok: true });
  },

  async 'GET me'(req, res) {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요해요' });
    await sql`UPDATE users SET last_seen = now() WHERE id = ${user.id}`;
    res.json(await profile(user));
  },

  // 닉네임 변경: 바꿀 때마다 코인 RENAME_COINS개
  // 비밀번호 바꾸기 (내 정보): 지금 비밀번호 확인 → 새 비밀번호. 관리자가 정해 준 임시 비밀번호는 지운다 · 다른 기기는 로그아웃
  async 'POST password'(req, res) {
    const user = await currentUser(req);
    if (!user) return login(res);
    const { old = '', pw = '' } = req.body ?? {};
    if (typeof pw !== 'string' || pw.length < 4 || pw.length > 64) return res.status(400).json({ error: '새 비밀번호는 4~64자로 정해 주세요' });
    const [row] = await sql`SELECT pw FROM users WHERE id = ${user.id}`;
    if (typeof old !== 'string' || !checkPw(old, row.pw)) return res.status(403).json({ error: '지금 비밀번호가 달라요' });
    if (old === pw) return res.status(400).json({ error: '지금 비밀번호와 다른 비밀번호로 정해 주세요' });
    await sql`UPDATE users SET pw = ${hashPw(pw)}, temp_pw = NULL, temp_pw_at = NULL WHERE id = ${user.id}`;
    await sql`DELETE FROM sessions WHERE user_id = ${user.id} AND token <> ${hash(req.cookies.sid).toString('hex')}`;
    res.json({ ok: true });
  },

  async 'POST rename'(req, res) {
    const user = await currentUser(req);
    if (!user) return login(res);
    const name = text(req.body?.username, 20);
    if (!NAME.test(name)) return res.status(400).json({ error: '닉네임은 한글·영문·숫자 2~12자로 지어 주세요' });
    if (name === process.env.ADMIN_USER) return res.status(409).json({ error: '쓸 수 없는 닉네임이에요' });
    if (name === user.username) return res.status(400).json({ error: '지금 닉네임과 같아요' });
    for (let i = 0; i < 4; i++) {
      const [row] = await sql`SELECT save, ver FROM users WHERE id = ${user.id}`;
      const s = normalize(row.save);
      if (s.coins < RENAME_COINS) return res.status(400).json({ error: `닉네임을 바꾸려면 코인 ${fmt(RENAME_COINS)}개가 필요해요` });
      s.coins -= RENAME_COINS;
      s.renames++;
      try {
        const ok = await sql`UPDATE users SET username = ${name}, save = ${JSON.stringify(s)}::jsonb, ver = ver + 1
                             WHERE id = ${user.id} AND ver = ${row.ver} RETURNING id`;
        if (ok.length) return res.json({ username: name, save: s });
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: '이미 누가 쓰고 있는 닉네임이에요' });
        throw e;
      }
    }
    throw new Error('저장이 몰려서 실패했어요');
  },

  async 'POST act'(req, res) {
    const user = await currentUser(req);
    if (!user) return login(res);
    const a = req.body ?? {};
    if (SERVER_ONLY.has(a.type)) return res.status(400).json({ error: '알 수 없는 요청이에요' });
    const cfg = { ...(await gameCfg()), chart: chartOf };
    // 멀티 판의 보상: 내가 들어 있는 방의 이번 판 (곡 · 시작한 지 얼마나 됐는지 · 판마다 한 번)
    if (a.type === 'finish' && a.multi === true) {
      const [r] = await sql`SELECT r.code, r.round, r.song, r.diff, (extract(epoch FROM now() - r.start_at) * 1000)::float8 AS e, extract(epoch FROM r.start_at)::bigint AS at
        FROM room_players p JOIN rooms r ON r.code = p.code WHERE p.user_id = ${user.id} AND r.round > 0`;
      if (r) cfg.mrun = { k: `${r.song}:${r.diff}`, e: r.e, m: `${r.code}:${r.round}:${r.at}` };
    }
    let out;
    try {
      out = await mutate(user.id, (s) => act(s, a, rand, cfg));
    } catch (e) {
      if (e.cheat) await logSec('cheat', ipOf(req), user.id, `${a.song} ${a.diff} · 연주 ${a.raw} · 점수 ${a.score} · ${e.message}`).catch(console.error);
      throw e;
    }
    if (a.type === 'finish' && out.save.stats.plays >= REF.plays && out.save.stats.plays < REF.plays + 3) await payReferrer(user).catch(console.error);
    if (a.type === 'finish') {
      await sql`INSERT INTO play_log (user_id, song, diff, raw, score, rank, cleared, multi)
                VALUES (${user.id}, ${a.song}, ${a.diff}, ${a.raw}, ${a.score}, ${a.rank}, ${out.result.cleared}, ${a.multi === true})`;
      if (out.result.newBest) {
        out.result.board = await board(user, a);
        if (out.result.board?.rank === 1) out.save = (await mutate(user.id, (s) => act(s, { type: 'first' }))).save;
      }
    }
    if (a.type === 'avatar') await sql`UPDATE users SET avatar = ${a.avatar} WHERE id = ${user.id}`;
    res.json(out);
  },

  // ponytail: 게스트 플레이 기록(통계용)은 누구나 보낼 수 있다 (하루 2만 개까지만 쌓는다). 통계가 오염되면 IP별 제한 추가
  async 'POST guest-play'(req, res) {
    const b = req.body ?? {};
    if (!validPlay(b)) return res.status(400).json({ error: '기록 형식이 이상해요' });
    await sql`INSERT INTO play_log (song, diff, raw, score, rank, cleared) SELECT ${b.song}, ${b.diff}, ${b.raw}, ${b.score}, ${b.rank}, ${b.cleared === true}
      WHERE (SELECT count(*) FROM play_log WHERE user_id IS NULL AND played_at > now() - interval '1 day') < 20000`;
    res.json({ ok: true });
  },

  // 곡 · 난이도별 TOP 30 + 내 순위
  // 곡 랭킹 · 기간: all(최고 기록) · month · week · day(그 기간에 친 판 중 최고). 점수 분포 그래프용 dist도 같이
  async 'GET rank'(req, res) {
    const { song, diff } = req.query, period = has(PERIODS, req.query.period) ? req.query.period : 'all';
    if (!SONG[song] || !DIFFS.includes(diff)) return res.status(400).json({ error: '곡을 골라 주세요' });
    const [uid, board] = await Promise.all([uidOf(req), boardOf(`${song}:${diff}:${period}`, () => (period === 'all'
      ? sql`SELECT s.user_id AS id, s.score FROM scores s WHERE s.song = ${song} AND s.diff = ${diff} ORDER BY s.score DESC, s.played_at ASC`
      : sql`SELECT user_id AS id, max(score) AS score FROM play_log WHERE song = ${song} AND diff = ${diff} AND user_id IS NOT NULL
              AND played_at > now() - ${PERIODS[period]}::interval GROUP BY user_id ORDER BY 2 DESC, 1`))]);
    res.json(await boardView(board, uid, period === 'all' ? { song, diff } : null));
  },

  // 종합 랭킹: 모든 곡 · 난이도 최고 점수의 합 (users.total_score에 미리 더해 둔 값 · 색인으로 바로)
  // ponytail: 목록은 인스턴스마다 20초 캐시. 사람이 아주 많아지면 이 정도 늦게 바뀌어도 괜찮다
  // 종합 랭킹 · 기간: all은 모든 곡 최고 점수의 합(users.total_score) · 기간이면 그 기간 곡마다 최고 점수의 합
  async 'GET rank-total'(req, res) {
    const period = has(PERIODS, req.query.period) ? req.query.period : 'all';
    const [uid, board] = await Promise.all([uidOf(req), boardOf(`total:${period}`, () => (period === 'all'
      ? sql`SELECT id, total_score::float8 AS score FROM users WHERE total_score > 0 ORDER BY total_score DESC, id ASC`
      : sql`SELECT user_id AS id, sum(best)::float8 AS score FROM (SELECT user_id, song, diff, max(score) AS best FROM play_log
              WHERE user_id IS NOT NULL AND played_at > now() - ${PERIODS[period]}::interval GROUP BY 1, 2, 3) b GROUP BY 1 ORDER BY 2 DESC, 1`), period === 'all' ? 20000 : 120000)]);
    res.json(await boardView(board, uid, null, true));
  },

  async 'GET mail'(req, res) {
    const user = await currentUser(req);
    if (!user) return login(res);
    const mails = await sql`SELECT id, kind, title, body, coins, gems, read, claimed, created_at FROM mail
                            WHERE user_id = ${user.id} ORDER BY id DESC LIMIT 50`;
    res.json({ mails, unread: await unreadOf(user.id) });
  },

  async 'POST mail-read'(req, res) {
    const user = await currentUser(req);
    if (!user) return login(res);
    await sql`UPDATE mail SET read = true WHERE user_id = ${user.id} AND NOT read`;
    res.json({ unread: await unreadOf(user.id) });
  },

  // 우편 선물 받기 (하나 또는 전부). 저장 데이터와 '받음' 표시를 한 문장에서 같이 바꿔서 두 번 받기를 막는다
  async 'POST mail-claim'(req, res) {
    const user = await currentUser(req);
    if (!user) return login(res);
    const { id, all } = req.body ?? {};
    if (!all && !isInt(id, 1, 2 ** 31 - 1)) return res.status(400).json({ error: '우편을 골라 주세요' });
    for (let i = 0; i < 4; i++) {
      const rows = all
        ? await sql`SELECT id, coins, gems FROM mail WHERE user_id = ${user.id} AND NOT claimed AND (coins > 0 OR gems > 0) ORDER BY id DESC LIMIT 50`
        : await sql`SELECT id, coins, gems FROM mail WHERE id = ${id} AND user_id = ${user.id} AND NOT claimed AND (coins > 0 OR gems > 0)`;
      if (!rows.length) return res.status(400).json({ error: '받을 선물이 없어요' });
      const coins = rows.reduce((a, r) => a + r.coins, 0), gems = rows.reduce((a, r) => a + r.gems, 0), ids = rows.map((r) => r.id);
      const [row] = await sql`SELECT save, ver FROM users WHERE id = ${user.id}`;
      const s = normalize(row.save);
      s.coins += coins;
      s.gems += gems;
      s.stats.coinsEarned += coins;
      // 같은 사용자 행을 먼저 잠그므로, 동시에 온 다른 받기 요청은 ver가 달라져 아무것도 못 바꾸고 다시 시도한다
      const ok = await sql`WITH u AS (UPDATE users SET save = ${JSON.stringify(s)}::jsonb, ver = ver + 1
                             WHERE id = ${user.id} AND ver = ${row.ver} RETURNING id)
                           UPDATE mail SET claimed = true, read = true
                           WHERE id = ANY(string_to_array(${ids.join(',')}, ',')::int[]) AND user_id = ${user.id} AND NOT claimed AND EXISTS (SELECT 1 FROM u) RETURNING id`;
      if (ok.length) return res.json({ save: s, coins, gems, unread: await unreadOf(user.id) });
    }
    throw new Error('저장이 몰려서 실패했어요');
  },

  // 우편 지우기 (하나 또는 읽은 우편 전부). 아직 안 받은 선물은 지우지 않는다
  async 'POST mail-delete'(req, res) {
    const user = await currentUser(req);
    if (!user) return login(res);
    const { id, read } = req.body ?? {};
    if (read !== true && !isInt(id, 1, 2 ** 31 - 1)) return res.status(400).json({ error: '우편을 골라 주세요' });
    const gone = read === true
      ? await sql`DELETE FROM mail WHERE user_id = ${user.id} AND read AND (claimed OR (coins = 0 AND gems = 0)) RETURNING id`
      : await sql`DELETE FROM mail WHERE id = ${id} AND user_id = ${user.id} AND (claimed OR (coins = 0 AND gems = 0)) RETURNING id`;
    if (!gone.length) return res.status(400).json({ error: read === true ? '지울 우편이 없어요' : '선물을 먼저 받아야 지울 수 있어요' });
    res.json({ deleted: gone.map((r) => r.id), unread: await unreadOf(user.id) });
  },

  async 'GET notices'(req, res) {
    res.json(await sql`SELECT id, version, title, body, created_at, updated_at FROM notices ORDER BY created_at DESC, id DESC LIMIT 30`);
  },

  async 'POST inquiry'(req, res) {
    const user = await currentUser(req);
    if (!user) return login(res);
    const b = req.body ?? {};
    const kind = has(INQUIRY, b.kind) ? b.kind : 'etc', title = text(b.title, 60), body = text(b.body, 1000);
    if (!title) return res.status(400).json({ error: kind === 'song' ? '듣고 싶은 노래 제목을 적어 주세요' : '제목을 적어 주세요' });
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM inquiries WHERE user_id = ${user.id} AND created_at > now() - interval '1 day'`;
    if (n >= 10) return res.status(429).json({ error: '문의는 하루 10번까지 보낼 수 있어요' });
    await sql`INSERT INTO inquiries (user_id, kind, title, body) VALUES (${user.id}, ${kind}, ${title}, ${body})`;
    res.json({ ok: true });
  },

  async 'GET inquiries'(req, res) {
    const user = await currentUser(req);
    if (!user) return login(res);
    res.json(await sql`SELECT id, kind, title, body, status, reply, created_at, replied_at FROM inquiries
                       WHERE user_id = ${user.id} ORDER BY id DESC LIMIT 20`);
  },

  // 화면에서 난 에러 받기 (로그인 안 해도). 하루 2만 개 넘게는 안 쌓는다 · 3일 지난 건 지운다
  async 'POST client-error'(req, res) {
    const b = req.body ?? {}, msg = text(b.msg, 300);
    if (!msg) return res.json({ ok: true });
    const uid = await uidOf(req).catch(() => 0);
    await sql`INSERT INTO client_errors (user_id, msg, stack, place, song, ua, ver)
      SELECT ${uid || null}, ${msg}, ${text(b.stack, 1500)}, ${text(b.where, 40)}, ${text(b.song, 40)}, ${text(req.headers?.['user-agent'], 200)}, ${text(b.v, 12)}
      WHERE (SELECT count(*) FROM client_errors WHERE created_at > now() - interval '1 day') < 20000`;
    if (Math.random() < 0.02) await sql`DELETE FROM client_errors WHERE created_at < now() - interval '3 days'`;
    res.json({ ok: true });
  },

  // 방 만들기: 방장이 연 곡 중 하나로 (처음엔 고른 곡 · 없으면 작은 별). 참가 코드는 숫자 4자리
  async 'POST mp-create'(req, res) {
    const u = await currentUser(req);
    if (!u) return login(res);
    const b = req.body ?? {}, s = normalize(u.save);
    const song = SONG[b.song] && unlocked(s, SONG[b.song]) ? b.song : 'twinkle', diff = DIFFS.includes(b.diff) ? b.diff : 'normal';
    await leaveAll(u.id);
    await sweepRooms();
    for (let i = 0; i < 20; i++) {
      const code = roomCode();
      const [r] = await sql`INSERT INTO rooms (code, host, song, diff) VALUES (${code}, ${u.id}, ${song}, ${diff}) ON CONFLICT DO NOTHING RETURNING code`;
      if (r && (await sit(code, u))) return res.json(await roomView(code, u.id));
    }
    throw new Error('방을 만들지 못했어요');
  },

  async 'POST mp-join'(req, res) {
    const u = await currentUser(req);
    if (!u) return login(res);
    const code = roomCodeOf(req.body);
    await sql`DELETE FROM rooms WHERE code = ${code} AND status <> 'playing' AND coalesce(played_at, created_at) < now() - interval '30 minutes'`;
    const [r] = await sql`SELECT status, ${u.id} = ANY(banned) AS banned, (SELECT count(*)::int FROM room_players WHERE code = ${code}) + jsonb_array_length(bots) AS n,
      EXISTS (SELECT 1 FROM room_players WHERE code = ${code} AND user_id = ${u.id}) AS here FROM rooms WHERE code = ${code}`;
    if (!r) return res.status(404).json({ error: '그런 방이 없어요. 참가 코드(숫자 4자리)를 확인해 주세요' });
    if (r.here) return res.json(await roomView(code, u.id));
    if (r.banned) return res.status(403).json({ error: '이 방에서 내보내져서 다시 들어갈 수 없어요' });
    if (r.status === 'playing') return res.status(409).json({ error: '지금 연주 중인 방이에요. 곡이 끝나면 다시 들어와 주세요' });
    if (r.n >= MP.max) return res.status(409).json({ error: `방이 꽉 찼어요 (최대 ${MP.max}명)` });
    await leaveAll(u.id);
    if (!(await sit(code, u))) return res.status(409).json({ error: '방에 들어가지 못했어요. 다시 시도해 주세요' });
    res.json(await roomView(code, u.id));
  },

  // 방 나가기 (창을 닫을 때도 sendBeacon으로)
  async 'POST mp-leave'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    await leaveAll(uid);
    res.json({ ok: true });
  },

  // 방장만: 곡 · 난이도 바꾸기. 다른 사람의 준비는 그대로 둔다 (곡을 바꿀 때마다 준비가 풀리면 번거롭다)
  async 'POST mp-set'(req, res) {
    const u = await currentUser(req);
    if (!u) return login(res);
    const b = req.body ?? {}, code = roomCodeOf(b), song = SONG[b.song];
    if (!song || !DIFFS.includes(b.diff)) return res.status(400).json({ error: '곡과 난이도를 골라 주세요' });
    // 방장이 연 곡만 고를 수 있다 (방장이 바뀌었으면 지금 곡의 난이도만 바꾸는 건 된다)
    const own = unlocked(normalize(u.save), song);
    const [r] = await sql`UPDATE rooms SET song = ${b.song}, diff = ${b.diff}, updated_at = now()
                          WHERE code = ${code} AND host = ${u.id} AND status <> 'playing' AND (${own}::boolean OR song = ${b.song}) RETURNING code`;
    if (!r) return res.status(403).json({ error: own ? '방장만 곡을 바꿀 수 있어요' : '아직 열지 않은 곡이에요' });
    res.json(await roomView(code, u.id));
  },

  async 'POST mp-ready'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    const code = roomCodeOf(req.body);
    await sql`UPDATE room_players SET ready = ${req.body?.ready === true} WHERE code = ${code} AND user_id = ${uid}`;
    res.json((await roomView(code, uid)) ?? { gone: true });
  },

  // 방장만: 2명 이상 · 모두 준비했으면 5초 뒤 같은 시각에 시작 (새 판 번호)
  async 'POST mp-start'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    const code = roomCodeOf(req.body);
    const [r] = await sql`UPDATE rooms SET status = 'playing', round = round + 1, start_at = now() + interval '5 seconds', updated_at = now(), played_at = now()
      WHERE code = ${code} AND host = ${uid} AND status <> 'playing'
        AND (SELECT count(*) FROM room_players WHERE code = ${code}) + jsonb_array_length(bots) >= 2
        AND NOT EXISTS (SELECT 1 FROM room_players WHERE code = ${code} AND user_id <> ${uid} AND NOT ready)
      RETURNING round`;
    if (!r) return res.status(409).json({ error: '2명 이상(AI 포함) 모두 준비해야 시작할 수 있어요' });
    await sql`UPDATE room_players SET state = NULL, result = NULL, ready = false WHERE code = ${code}`;
    await sql`DELETE FROM room_events WHERE code = ${code} AND round < ${r.round}`;
    res.json(await roomView(code, uid));
  },

  // 방장만: 내보내기 (내보낸 사람은 이 방에 다시 못 들어온다)
  async 'POST mp-kick'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    const code = roomCodeOf(req.body), who = req.body?.user;
    if (isInt(who, -MP.max, -1)) { // AI 빼기
      const [r] = await sql`UPDATE rooms SET bots = (SELECT coalesce(jsonb_agg(b), '[]'::jsonb) FROM jsonb_array_elements(bots) b WHERE (b->>'id')::int <> ${who}),
        updated_at = now() WHERE code = ${code} AND host = ${uid} AND status <> 'playing' RETURNING code`;
      if (!r) return res.status(403).json({ error: '방장만 AI를 뺄 수 있어요 (연주 중에는 안 돼요)' });
      return res.json(await roomView(code, uid));
    }
    if (!isInt(who, 1, 2 ** 31 - 1) || who === uid) return res.status(400).json({ error: '내보낼 사람을 골라 주세요' });
    const [r] = await sql`UPDATE rooms SET banned = array_append(banned, ${who}::int), updated_at = now()
                          WHERE code = ${code} AND host = ${uid} AND status <> 'playing' AND NOT (${who}::int = ANY(banned)) RETURNING code`;
    if (!r) return res.status(403).json({ error: '방장만 내보낼 수 있어요 (연주 중에는 안 돼요)' });
    await prune(code, [who]);
    res.json(await roomView(code, uid));
  },

  // 방장만: 빈 자리에 AI 넣기 (쉬움 · 보통 · 어려움 · 고수)
  async 'POST mp-bot'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    const code = roomCodeOf(req.body), skill = has(BOT_SKILL, req.body?.skill) ? req.body.skill : 'normal';
    const [r] = await sql`SELECT host, status, bots, ARRAY(SELECT seat FROM room_players WHERE code = ${code}) AS seats FROM rooms WHERE code = ${code}`;
    if (!r || r.host !== uid) return res.status(403).json({ error: '방장만 AI를 넣을 수 있어요' });
    if (r.status === 'playing') return res.status(409).json({ error: '연주가 끝나면 넣을 수 있어요' });
    const used = new Set([...r.seats, ...r.bots.map((b) => b.seat)]), seat = Array.from({ length: MP.max }, (_, i) => i).find((i) => !used.has(i));
    if (seat === undefined) return res.status(409).json({ error: `방이 꽉 찼어요 (최대 ${MP.max}명)` });
    // 그사이 다른 AI가 들어왔으면(개수가 바뀌었으면) 다시 눌러 달라고 한다
    // ponytail: 사람이 같은 순간에 같은 자리에 앉는 경우는 막지 않는다 (아주 드묾 · 화면에서 한쪽만 보임)
    const [ok] = await sql`UPDATE rooms SET bots = bots || ${JSON.stringify([makeBot(seat, skill)])}::jsonb, updated_at = now()
      WHERE code = ${code} AND host = ${uid} AND status <> 'playing' AND jsonb_array_length(bots) = ${r.bots.length} RETURNING code`;
    if (!ok) return res.status(409).json({ error: '다시 한 번 눌러 주세요' });
    res.json(await roomView(code, uid));
  },

  // 방장만: 방장 넘기기
  async 'POST mp-host'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    const code = roomCodeOf(req.body), who = req.body?.user;
    if (!isInt(who, 1, 2 ** 31 - 1) || who === uid) return res.status(400).json({ error: '방장을 넘길 사람을 골라 주세요' });
    const [r] = await sql`UPDATE rooms SET host = ${who}, updated_at = now()
                          WHERE code = ${code} AND host = ${uid} AND EXISTS (SELECT 1 FROM room_players WHERE code = ${code} AND user_id = ${who}) RETURNING code`;
    if (!r) return res.status(403).json({ error: '방장만 넘길 수 있어요' });
    res.json(await roomView(code, uid));
  },

  // 친구를 지금 방으로 초대 (같은 친구는 30초에 한 번). 친구 화면은 /api/status로 2분 안의 초대를 받는다
  async 'POST mp-invite'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    const code = roomCodeOf(req.body), to = req.body?.to;
    if (!isInt(to, 1, 2 ** 31 - 1) || !(await friendsOf(uid, to))) return res.status(403).json({ error: '친구만 초대할 수 있어요' });
    const [r] = await sql`INSERT INTO room_invites (code, from_id, to_id)
      SELECT ${code}, ${uid}, ${to} WHERE EXISTS (SELECT 1 FROM room_players WHERE code = ${code} AND user_id = ${uid})
        AND NOT EXISTS (SELECT 1 FROM room_invites WHERE from_id = ${uid} AND to_id = ${to} AND created_at > now() - interval '30 seconds')
      RETURNING id`;
    if (!r) return res.status(429).json({ error: '방에 있을 때만, 같은 친구는 30초에 한 번 초대할 수 있어요' });
    res.json({ ok: true });
  },

  // 대기 중 2초 · 게임 중 0.35초마다: 내 상태(점수 · 콤보 · 판정) · 공격 · 결과를 올리고 방 전체 상태를 받는다
  async 'POST mp-sync'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    const b = req.body ?? {}, code = roomCodeOf(b), round = isInt(b.round, 0, 1e9) ? b.round : -1, a = b.atk;
    const json = (v, max) => {
      const s = v && typeof v === 'object' ? JSON.stringify(v) : null;
      return s && s.length <= max ? s : null;
    };
    // 공격: 같은 판에서 1초에 한 번까지 · 이 판 채보의 아이템 노트 수까지 (아이템을 쳤는지는 화면이 센다)
    if (a && has(ATTACKS, a.kind) && (isInt(a.to, 1, 2 ** 31 - 1) || isInt(a.to, -MP.max, -1)) && a.to !== uid) {
      const [rm] = await sql`SELECT song, diff FROM rooms WHERE code = ${code} AND status = 'playing' AND round = ${round}`;
      if (rm) {
        await sql`INSERT INTO room_events (code, round, from_id, to_id, kind)
          SELECT ${code}, ${round}, ${uid}, ${a.to}, ${a.kind}
          WHERE EXISTS (SELECT 1 FROM room_players WHERE code = ${code} AND user_id = ${uid})
            AND (${a.to}::int < 0 OR EXISTS (SELECT 1 FROM room_players WHERE code = ${code} AND user_id = ${a.to}))
            AND NOT EXISTS (SELECT 1 FROM room_events WHERE code = ${code} AND from_id = ${uid} AND created_at > now() - interval '1 second')
            AND (SELECT count(*) FROM room_events WHERE code = ${code} AND round = ${round} AND from_id = ${uid}) < ${itemsOf(rm.song, rm.diff, round)}`;
      }
    }
    const view = await roomView(code, uid, { since: isInt(b.since, 0, 2 ** 31 - 1) ? b.since : 0, round, state: json(b.state, 4000), result: json(b.result, 1000) });
    res.json(view ?? { gone: true });
  },

  /* ---------- 친구 ---------- */

  // 내 친구 목록 (+ 지금 접속 중 · 멀티 방) · 받은 신청 · 보낸 신청 · 오늘 선물 상태 · 레벨 혜택(최대 친구 수 · 하루 선물 횟수)
  async 'GET friends'(req, res) {
    const u = await currentUser(req);
    if (!u) return login(res);
    const s = normalize(u.save), per = perksOf(levelOf(s.exp));
    const [list, incoming, outgoing, [inv]] = await Promise.all([
      sql`SELECT u.id, u.username, u.avatar, u.lv, u.frame, u.last_seen,
            EXISTS (SELECT 1 FROM presence p WHERE p.user_id = u.id AND p.seen_at > now() - interval '75 seconds') AS online,
            (SELECT code FROM room_players rp WHERE rp.user_id = u.id LIMIT 1) AS room
          FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ${u.id} AND f.status = 'accepted'
          ORDER BY u.last_seen DESC NULLS LAST LIMIT 300`,
      sql`SELECT u.id, u.username, u.avatar, u.lv, u.frame, f.created_at FROM friends f JOIN users u ON u.id = f.user_id
          WHERE f.friend_id = ${u.id} AND f.status = 'pending' ORDER BY f.created_at DESC LIMIT 100`,
      sql`SELECT u.id, u.username, u.avatar, u.lv, u.frame, f.created_at FROM friends f JOIN users u ON u.id = f.friend_id
          WHERE f.user_id = ${u.id} AND f.status = 'pending' ORDER BY f.created_at DESC LIMIT 100`,
      sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE ref_paid)::int AS paid FROM users WHERE ref_by = ${u.id}`,
    ]);
    const day = s.day.date === new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) ? s.day.gifts : [];
    res.json({ friends: list, incoming, outgoing, gifts: day, max: per.friends, giftMax: per.gifts, code: REF.base + u.id, invited: inv.n, invitedPaid: inv.paid });
  },

  // 친구 신청 (닉네임으로). 상대가 이미 나에게 신청했으면 바로 친구
  async 'POST friend-request'(req, res) {
    const u = await currentUser(req);
    if (!u) return login(res);
    const name = text(req.body?.name, 20);
    const [t] = await sql`SELECT id, username, save FROM users WHERE username = ${name}`;
    if (!t) return res.status(404).json({ error: '그런 닉네임은 없어요' });
    if (t.id === u.id) return res.status(400).json({ error: '나 자신과는 이미 친구예요' });
    const [{ n, out }] = await sql`SELECT (SELECT count(*)::int FROM friends WHERE user_id = ${u.id} AND status = 'accepted') AS n,
      (SELECT count(*)::int FROM friends WHERE user_id = ${u.id} AND status = 'pending') AS out`;
    const max = perksOf(levelOf(normalize(u.save).exp)).friends;
    if (n >= max) return res.status(409).json({ error: `친구는 ${max}명까지예요 (레벨이 오르면 늘어나요)` });
    if (out >= 50) return res.status(429).json({ error: '아직 답이 없는 신청이 너무 많아요 (최대 50개)' });
    if (await friendsOf(u.id, t.id)) return res.status(409).json({ error: '이미 친구예요' });
    const [back] = await sql`SELECT 1 FROM friends WHERE user_id = ${t.id} AND friend_id = ${u.id} AND status = 'pending'`;
    if (back) return res.json(await acceptFriend(u.id, t.id));
    await sql`INSERT INTO friends (user_id, friend_id) VALUES (${u.id}, ${t.id}) ON CONFLICT DO NOTHING`;
    res.json({ ok: true, pending: true, name: t.username });
  },

  async 'POST friend-accept'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    const id = req.body?.id;
    if (!isInt(id, 1, 2 ** 31 - 1)) return res.status(400).json({ error: '신청을 골라 주세요' });
    const [p] = await sql`SELECT 1 FROM friends WHERE user_id = ${id} AND friend_id = ${uid} AND status = 'pending'`;
    if (!p) return res.status(404).json({ error: '이미 처리된 신청이에요' });
    res.json(await acceptFriend(uid, id));
  },

  // 받은 신청 거절 · 보낸 신청 취소 · 친구 끊기 (양쪽 줄을 모두 지운다)
  async 'POST friend-remove'(req, res) {
    const uid = await uidOf(req);
    if (!uid) return login(res);
    const id = req.body?.id;
    if (!isInt(id, 1, 2 ** 31 - 1)) return res.status(400).json({ error: '친구를 골라 주세요' });
    await sql`DELETE FROM friends WHERE (user_id = ${uid} AND friend_id = ${id}) OR (user_id = ${id} AND friend_id = ${uid})`;
    res.json({ ok: true });
  },

  // 친구에게 선물: 보내는 사람 저장 데이터(재화 · 오늘 보낸 기록)와 받는 사람 우편을 한 문장에서 같이 바꾼다
  async 'POST friend-gift'(req, res) {
    const u = await currentUser(req);
    if (!u) return login(res);
    const b = req.body ?? {}, to = b.id;
    if (!isInt(to, 1, 2 ** 31 - 1) || !(await friendsOf(u.id, to))) return res.status(403).json({ error: '친구에게만 선물할 수 있어요' });
    if (b.kind === 'free') {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM mail WHERE user_id = ${to} AND kind = 'friend' AND gems = ${GIFT.free.give.gems}
        AND coins = ${GIFT.free.give.coins} AND created_at > date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'`;
      if (n >= GIFT.getMax) return res.status(429).json({ error: '이 친구는 오늘 무료 선물을 너무 많이 받았어요. 내일 보내 주세요' });
    }
    const cfg = await gameCfg();
    for (let i = 0; i < 4; i++) {
      const [row] = await sql`SELECT save, ver FROM users WHERE id = ${u.id}`;
      const out = act(row.save, { type: 'gift', to, kind: b.kind, amount: b.amount }, rand, cfg), g = out.result.give;
      const title = `🎁 ${u.username}님의 ${b.kind === 'free' ? '친구 선물' : '선물'}`;
      const body = b.kind === 'free' ? '오늘도 같이 연주해요! 매일 하나씩 선물을 주고받을 수 있어요' : `${u.username}님이 아껴 둔 ${g.coins ? `코인 ${fmt(g.coins)}개` : `보석 ${fmt(g.gems)}개`}를 보냈어요`;
      const ok = await sql`WITH s AS (UPDATE users SET save = ${JSON.stringify(out.save)}::jsonb, ver = ver + 1, last_seen = now()
                             WHERE id = ${u.id} AND ver = ${row.ver} RETURNING id)
                           INSERT INTO mail (user_id, kind, title, body, coins, gems)
                           SELECT ${to}, 'friend', ${title}, ${body}, ${g.coins ?? 0}, ${g.gems ?? 0} WHERE EXISTS (SELECT 1 FROM s) RETURNING id`;
      if (ok.length) return res.json({ save: out.save, ...out.result });
    }
    throw new Error('저장이 몰려서 실패했어요');
  },

  // 친구들에게 점수 자랑: 서버에 있는 내 최고 기록을 친구 모두의 우편함으로 (글은 서버가 쓴다 → 스팸 문구를 넣을 수 없다). 하루 횟수 제한은 act('boast')
  async 'POST boast'(req, res) {
    const u = await currentUser(req);
    if (!u) return login(res);
    const { song, diff } = req.body ?? {};
    if (!SONG[song] || !DIFFS.includes(diff)) return res.status(400).json({ error: '곡을 골라 주세요' });
    const [[best], [{ n }]] = await Promise.all([
      sql`SELECT score, rank, combo FROM scores WHERE user_id = ${u.id} AND song = ${song} AND diff = ${diff}`,
      sql`SELECT count(*)::int AS n FROM friends WHERE user_id = ${u.id} AND status = 'accepted'`,
    ]);
    if (!best) return res.status(400).json({ error: '이 곡을 클리어한 기록이 있어야 자랑할 수 있어요' });
    if (!n) return res.status(400).json({ error: '아직 친구가 없어요. 친구 창에서 내 친구 코드로 초대해 보세요!' });
    const out = await mutate(u.id, (s) => act(s, { type: 'boast' }));
    const sent = await sql`INSERT INTO mail (user_id, kind, title, body)
      SELECT friend_id, 'boast', ${`📣 ${u.username}님의 점수 자랑!`},
        ${`'${SONG[song].title}' ${DIFF_NAME[diff]}에서 ${fmt(best.score)}점 · ${best.rank} 랭크 · ${fmt(best.combo)}콤보! 이 기록, 넘을 수 있을까요?`}
      FROM friends WHERE user_id = ${u.id} AND status = 'accepted' RETURNING id`;
    res.json({ sent: sent.length, left: out.result.left, save: out.save });
  },

  // 쿠폰 코드: 한 사람이 한 번 · 정해진 수만큼 · 기한까지. 선물은 우편으로. 틀린 코드는 10분에 10번까지 (코드 찍어 맞히기 방지)
  async 'POST coupon'(req, res) {
    const u = await currentUser(req);
    if (!u) return login(res);
    const code = couponCode(req.body?.code);
    if (!code) return res.status(400).json({ error: '쿠폰 코드를 적어 주세요' });
    if ((await hits('coupon-fail', `u${u.id}`, 10)) >= 10) return res.status(429).json({ error: '너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요' });
    let got;
    try {
      // 한 문장: 남은 수가 있고 아직 안 쓴 사람만 사용 수 +1 → 쓴 기록 → 우편. 동시에 두 번 눌러도 쓴 기록(코드 + 회원)이 겹쳐서 한 번만 된다
      [got] = await sql`WITH c AS (UPDATE coupons SET used = used + 1 WHERE code = ${code} AND (max_uses = 0 OR used < max_uses) AND (expires_at IS NULL OR expires_at > now())
            AND NOT EXISTS (SELECT 1 FROM coupon_uses WHERE code = ${code} AND user_id = ${u.id}) RETURNING code, coins, gems, note),
          x AS (INSERT INTO coupon_uses (code, user_id) SELECT code, ${u.id} FROM c)
        INSERT INTO mail (user_id, kind, title, body, coins, gems) SELECT ${u.id}, 'gift', '🎟 쿠폰 선물이 도착했어요!', note, coins, gems FROM c RETURNING coins, gems`;
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
    if (got) return res.json({ ...got, unread: await unreadOf(u.id) });
    const [c] = await sql`SELECT EXISTS (SELECT 1 FROM coupon_uses WHERE code = ${code} AND user_id = ${u.id}) AS mine FROM coupons WHERE code = ${code}`;
    if (!c) await logSec('coupon-fail', `u${u.id}`, u.id, code);
    res.status(400).json({ error: !c ? '없는 쿠폰 코드예요' : c.mine ? '이미 받은 쿠폰이에요' : '끝난 쿠폰이에요 (기한이 지났거나 모두 나갔어요)' });
  },

  // 공개 프로필 (닉네임): 레벨 · 테두리 · 팀 · 기록 · 나와 친구인지
  async 'GET user'(req, res) {
    const name = text(req.query.name, 20), uid = await uidOf(req);
    const [t] = await sql`SELECT id, username, avatar, lv, frame, total_score::float8 AS total, created_at, last_seen,
        save->'team' AS team, save->'chars' AS chars, coalesce((save->'stats'->>'plays')::int, 0) AS plays,
        coalesce((save->'stats'->>'maxCombo')::int, 0) AS combo, coalesce((save->'stats'->>'mwins')::int, 0) AS mwins
      FROM users WHERE username = ${name}`;
    if (!t) return res.status(404).json({ error: '그런 닉네임은 없어요' });
    const [rel] = uid && uid !== t.id ? await sql`SELECT
        EXISTS (SELECT 1 FROM friends WHERE user_id = ${uid} AND friend_id = ${t.id} AND status = 'accepted') AS friend,
        EXISTS (SELECT 1 FROM friends WHERE user_id = ${uid} AND friend_id = ${t.id} AND status = 'pending') AS sent,
        EXISTS (SELECT 1 FROM friends WHERE user_id = ${t.id} AND friend_id = ${uid} AND status = 'pending') AS got` : [{}];
    const team = (Array.isArray(t.team) ? t.team : []).map((id) => (id && CHAR[id] ? { id, lv: t.chars?.[id] ?? 1 } : null));
    res.json({
      id: t.id, username: t.username, avatar: t.avatar, lv: t.lv, frame: t.frame, total: t.total, plays: t.plays, combo: t.combo, mwins: t.mwins,
      team, chars: Object.keys(t.chars ?? {}).filter((id) => CHAR[id]).length, joined: t.created_at, me: uid === t.id, ...rel,
    });
  },

  // 모든 화면이 30초마다 부른다: 점검 여부 · 점검 예고 · 뽑기 확률 · 버전 (+ 지금 접속 중 신호)
  async 'GET status'(req, res) {
    const [m, sched, cfg, admin, me] = await Promise.all([maintenance(), schedule(), gameCfg(), adminOk(req), seen(req).catch((e) => console.error(e))]);
    if (Math.random() < 0.005) await sql`DELETE FROM presence WHERE seen_at < now() - interval '2 days'`.catch(console.error);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      maintenance: m, admin, preview: admin && req.cookies?.apv === '1', schedule: sched, rates: cfg.rates, version: VERSION,
      invites: me?.invites ?? [], requests: me?.requests ?? 0,
    });
  },

  async 'POST admin-maintenance'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const on = req.body?.on === true, prev = await maintenance(true);
    // 점검을 켤 때는 점검 비밀번호 (실수로 켜는 걸 막는다 · 환경 변수 MAINT_PIN으로 바꿀 수 있음)
    if (on && String(req.body?.pin ?? '') !== String(process.env.MAINT_PIN || '6121')) return res.status(403).json({ error: '점검 비밀번호가 달라요' });
    await putSetting('maintenance', {
      on,
      reason: text(req.body?.reason, 200) || '더 재밌는 게임을 위해 점검 중이에요',
      since: on && prev ? prev.since : new Date().toISOString(),
    });
    // 점검을 시작하면 점검 예고는 할 일을 다 했으니 끈다
    if (on) await putSetting('schedule', { on: false });
    res.json({ maintenance: await maintenance(true) });
  },

  // 점검 중에도 이 브라우저에서 게임을 해 보기 (관리자 로그인 쿠키와 같이 있어야만 통과)
  async 'POST admin-preview'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const on = req.body?.on === true;
    res.setHeader('Set-Cookie', cookie('apv', on ? '1' : '', on ? DAY / 2 : 0));
    res.json({ preview: on });
  },

  // 점검 예고: 유저 화면에 '언제부터 언제까지 점검' 팝업을 띄운다 (게임 중이면 끝난 뒤에)
  async 'POST admin-schedule'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const b = req.body ?? {};
    if (b.off === true) {
      await putSetting('schedule', { on: false });
      return res.json({ schedule: null });
    }
    const from = Date.parse(b.from), to = Date.parse(b.to);
    if (!from || !to || to <= from) return res.status(400).json({ error: '점검 시작과 끝 시각을 바르게 골라 주세요' });
    if (to < Date.now()) return res.status(400).json({ error: '이미 지난 시각이에요' });
    await putSetting('schedule', {
      on: true, id: Date.now(), from: new Date(from).toISOString(), to: new Date(to).toISOString(),
      msg: text(b.msg, 300) || '더 재밌는 게임을 위해 점검할 예정이에요. 점검 전에 보상을 꼭 챙겨 주세요!',
    });
    res.json({ schedule: await schedule() });
  },

  // 뽑기 확률 · 천장 바꾸기: { rates: { 배너 id: { rates: [일반, 희귀, 영웅, 전설, 신화, 초월], pity } } } / { reset: true }
  async 'POST admin-rates'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const b = req.body ?? {}, out = {};
    if (b.reset !== true) {
      for (const [id, o] of Object.entries(b.rates && typeof b.rates === 'object' ? b.rates : {})) {
        const ban = BANNER[id];
        if (!ban) continue;
        const r = Array.isArray(o?.rates) ? o.rates.map(Number) : [];
        if (r.length !== 6 || r.some((x) => !(x >= 0 && x <= 1)) || Math.abs(r.reduce((a, x) => a + x, 0) - 1) > 1e-6) {
          return res.status(400).json({ error: `${ban.name}: 확률 6개(일반 ~ 초월)의 합이 100%가 되게 적어 주세요` });
        }
        if (ban.pity && !isInt(o.pity, 10, 1000)) return res.status(400).json({ error: `${ban.name}: 천장은 10~1000회로 적어 주세요` });
        out[id] = { rates: r, ...(ban.pity ? { pity: o.pity } : {}) };
      }
    }
    await putSetting('rates', out);
    res.json({ rates: out });
  },

  async 'POST admin-login'(req, res) {
    const { username = '', password = '' } = req.body ?? {}, ip = ipOf(req);
    if (!process.env.ADMIN_USER) return res.status(403).json({ error: '관리자 계정이 설정되지 않았어요' });
    if ((await hits('admin-fail', ip, 15)) >= 5) return res.status(429).json({ error: '너무 많이 틀렸어요. 15분 뒤에 다시 시도해 주세요' });
    if (!isAdmin(username, password)) {
      await logSec('admin-fail', ip, null, text(username, 20));
      return res.status(401).json({ error: '관리자 아이디 또는 비밀번호가 달라요' });
    }
    await startAdmin(res);
    res.json({ ok: true });
  },

  async 'POST admin-logout'(req, res) {
    if (req.cookies?.aid) await sql`DELETE FROM admin_sessions WHERE token = ${hash(req.cookies.aid).toString('hex')}`;
    res.setHeader('Set-Cookie', cookie('aid', '', 0));
    res.json({ ok: true });
  },

  // 우편 보내기: all이면 전체 회원, 아니면 to(닉네임 목록)에게
  async 'POST admin-mail'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const b = req.body ?? {}, title = text(b.title, 60), body = text(b.body, 1000);
    const to = [...new Set((Array.isArray(b.to) ? b.to : [b.to]).map((x) => text(x, 20)).filter((x) => NAME.test(x)))].slice(0, 1000);
    const coins = Number(b.coins) || 0, gems = Number(b.gems) || 0;
    if (!title) return res.status(400).json({ error: '우편 제목을 적어 주세요' });
    if (b.all !== true && !to.length) return res.status(400).json({ error: '받는 사람을 골라 주세요' });
    if (!isInt(coins, 0, 1e6) || !isInt(gems, 0, 1e5)) return res.status(400).json({ error: '선물은 코인 100만 · 보석 10만 개까지예요' });
    // 닉네임은 한글 · 영문 · 숫자 · _ 만 되니 쉼표로 이어 붙여도 안전하다
    const rows = b.all === true
      ? await sql`INSERT INTO mail (user_id, kind, title, body, coins, gems) SELECT id, 'gift', ${title}, ${body}, ${coins}, ${gems} FROM users RETURNING id`
      : await sql`INSERT INTO mail (user_id, kind, title, body, coins, gems) SELECT id, 'gift', ${title}, ${body}, ${coins}, ${gems} FROM users
                  WHERE username = ANY(string_to_array(${to.join(',')}, ',')) RETURNING id`;
    if (!rows.length) return res.status(404).json({ error: '그런 닉네임은 없어요' });
    res.json({ sent: rows.length, missing: b.all === true ? 0 : to.length - rows.length });
  },

  // 공지 쓰기 · 고치기 (id가 있으면 고치기)
  async 'POST admin-notice'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const b = req.body ?? {}, version = text(b.version, 20), title = text(b.title, 80), body = text(b.body, 3000);
    if (!title) return res.status(400).json({ error: '공지 제목을 적어 주세요' });
    if (b.id !== undefined && !isInt(b.id, 1, 2 ** 31 - 1)) return res.status(400).json({ error: '공지를 골라 주세요' });
    const [row] = b.id
      ? await sql`UPDATE notices SET version = ${version}, title = ${title}, body = ${body}, updated_at = now() WHERE id = ${b.id} RETURNING id`
      : await sql`INSERT INTO notices (version, title, body) VALUES (${version}, ${title}, ${body}) RETURNING id`;
    if (!row) return res.status(404).json({ error: '없는 공지예요' });
    res.json({ id: row.id });
  },

  async 'POST admin-notice-delete'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    if (!isInt(req.body?.id, 1, 2 ** 31 - 1)) return res.status(400).json({ error: '공지를 골라 주세요' });
    await sql`DELETE FROM notices WHERE id = ${req.body.id}`;
    res.json({ ok: true });
  },

  // 최근 플레이만 다시 불러오기 (관리자 페이지 새로고침 버튼)
  async 'GET admin-recent'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    res.json(await recentPlays());
  },

  // 문의함: 문의마다 보낸 회원 정보(레벨 · 플레이 · 가입일 · 이 회원이 보낸 문의 수)를 같이
  async 'GET admin-inquiries'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const [inquiries, songs] = await Promise.all([
      sql`SELECT i.id, i.kind, i.title, i.body, i.status, i.reply, i.created_at, i.replied_at, i.user_id,
          u.username, u.avatar, u.created_at AS joined, u.last_seen,
          coalesce((u.save->>'exp')::int, 0) AS exp, coalesce((u.save->'stats'->>'plays')::int, 0) AS plays,
          count(*) OVER (PARTITION BY i.user_id)::int AS user_total
          FROM inquiries i LEFT JOIN users u ON u.id = i.user_id ORDER BY (i.status = 'open') DESC, i.id DESC LIMIT 500`,
      sql`SELECT min(title) AS title, count(*)::int AS n FROM inquiries WHERE kind = 'song'
          GROUP BY lower(regexp_replace(title, '\\s+', '', 'g')) ORDER BY n DESC, min(created_at) LIMIT 20`,
    ]);
    res.json({ inquiries, songs });
  },

  // 문의 주제 고치기 (잘못 고른 주제를 관리자가 옮긴다)
  async 'POST admin-inquiry-kind'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const { id, kind } = req.body ?? {};
    if (!isInt(id, 1, 2 ** 31 - 1) || !has(INQUIRY, kind)) return res.status(400).json({ error: '문의와 주제를 골라 주세요' });
    await sql`UPDATE inquiries SET kind = ${kind} WHERE id = ${id}`;
    res.json({ ok: true });
  },

  // 지금 접속 중인 사람 (75초 안에 신호를 보낸 화면) + 열려 있는 멀티 방
  async 'GET admin-online'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const [people, rooms] = await Promise.all([
      sql`SELECT p.screen, p.device, p.since, p.seen_at, p.user_id, u.username, u.avatar, coalesce((u.save->>'exp')::int, 0) AS exp
          FROM presence p LEFT JOIN users u ON u.id = p.user_id WHERE p.seen_at > now() - interval '75 seconds' ORDER BY p.since`,
      sql`SELECT r.code, r.status, r.song, r.diff, r.round, r.created_at, u.username AS host,
            (SELECT json_agg(p.name ORDER BY p.seat) FROM room_players p WHERE p.code = r.code) AS players
          FROM rooms r LEFT JOIN users u ON u.id = r.host
          WHERE EXISTS (SELECT 1 FROM room_players p WHERE p.code = r.code AND p.seen_at > now() - interval '1 minute')
          ORDER BY r.created_at DESC LIMIT 50`,
      sql`DELETE FROM presence WHERE seen_at < now() - interval '2 days'`,
    ]);
    res.json({ people, rooms });
  },

  // 문의에 답하기: 답변(+선물)은 그 회원 우편함으로 간다
  async 'POST admin-reply'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const b = req.body ?? {}, reply = text(b.reply, 1000), coins = Number(b.coins) || 0, gems = Number(b.gems) || 0;
    if (!isInt(b.id, 1, 2 ** 31 - 1)) return res.status(400).json({ error: '문의를 골라 주세요' });
    if (!isInt(coins, 0, 1e6) || !isInt(gems, 0, 1e5)) return res.status(400).json({ error: '선물은 코인 100만 · 보석 10만 개까지예요' });
    const [q] = await sql`UPDATE inquiries SET reply = ${reply || null}, status = 'done', replied_at = now() WHERE id = ${b.id} RETURNING user_id, title`;
    if (!q) return res.status(404).json({ error: '없는 문의예요' });
    if (q.user_id && (reply || coins || gems)) {
      await sql`INSERT INTO mail (user_id, kind, title, body, coins, gems)
                VALUES (${q.user_id}, 'reply', ${`💌 문의 답변: ${q.title}`.slice(0, 80)}, ${reply}, ${coins}, ${gems})`;
    }
    res.json({ ok: true });
  },

  async 'GET admin-stats'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const [[totals], days, songs, members, recent, owners, hof, diffs, heat, levels, ranks, kinds] = await Promise.all([
      sql`SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM users WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date) AS users_today,
        (SELECT count(*)::int FROM users WHERE last_seen > now() - interval '1 day') AS active_today,
        (SELECT count(*)::int FROM users WHERE last_seen > now() - interval '7 days') AS wau,
        (SELECT count(*)::int FROM users WHERE last_seen > now() - interval '30 days') AS mau,
        (SELECT count(*)::int FROM users WHERE created_at BETWEEN now() - interval '8 days' AND now() - interval '1 day') AS back_base,
        (SELECT count(*)::int FROM users WHERE created_at BETWEEN now() - interval '8 days' AND now() - interval '1 day' AND last_seen > created_at + interval '1 day') AS back,
        (SELECT count(*)::int FROM presence WHERE seen_at > now() - interval '75 seconds') AS online,
        (SELECT count(*)::int FROM presence WHERE seen_at > now() - interval '75 seconds' AND user_id IS NOT NULL) AS online_members,
        (SELECT count(*)::int FROM play_log) AS plays,
        (SELECT count(*)::int FROM play_log WHERE (played_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date) AS plays_today,
        (SELECT count(*)::int FROM play_log WHERE user_id IS NULL) AS guest_plays,
        (SELECT count(*)::int FROM play_log WHERE cleared) AS clears,
        (SELECT count(*)::int FROM play_log WHERE multi) AS multi_plays,
        (SELECT count(*)::int FROM play_log WHERE multi AND (played_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date) AS multi_today,
        (SELECT count(*)::int FROM rooms WHERE EXISTS (SELECT 1 FROM room_players p WHERE p.code = rooms.code AND p.seen_at > now() - interval '1 minute')) AS rooms_now,
        (SELECT coalesce(sum((save->'stats'->>'pulls')::int), 0)::float8 FROM users) AS pulls,
        (SELECT coalesce(sum((save->'stats'->>'legends')::int), 0)::float8 FROM users) AS legends,
        (SELECT coalesce(sum((save->'stats'->>'mythics')::int), 0)::float8 FROM users) AS mythics,
        (SELECT coalesce(sum((save->'stats'->>'buys')::int), 0)::float8 FROM users) AS buys,
        (SELECT coalesce(sum((save->>'coins')::int), 0)::float8 FROM users) AS coins,
        (SELECT coalesce(sum((save->>'gems')::int), 0)::float8 FROM users) AS gems,
        (SELECT count(*)::int FROM inquiries WHERE status = 'open') AS open_inquiries,
        (SELECT count(*)::int FROM friends WHERE status = 'accepted') / 2 AS friendships,
        (SELECT count(*)::int FROM friends WHERE status = 'pending') AS friend_requests,
        (SELECT count(*)::int FROM mail WHERE kind = 'friend' AND (created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date) AS gifts_today,
        (SELECT count(*)::int FROM mail WHERE kind = 'friend') AS gifts,
        (SELECT count(*)::int FROM users WHERE save->'chars' ?| array['god_chiikawa', 'god_usagi']) AS gods,
        (SELECT coalesce(max(lv), 1)::int FROM users) AS max_lv,
        (SELECT count(*)::int FROM room_players) AS in_rooms`,
      sql`SELECT to_char(d, 'MM-DD') AS day,
        (SELECT count(*)::int FROM users WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date = d::date) AS signups,
        (SELECT count(*)::int FROM play_log WHERE (played_at AT TIME ZONE 'Asia/Seoul')::date = d::date) AS plays,
        (SELECT count(DISTINCT user_id)::int FROM play_log WHERE (played_at AT TIME ZONE 'Asia/Seoul')::date = d::date) AS players
        FROM generate_series((now() AT TIME ZONE 'Asia/Seoul')::date - 13, (now() AT TIME ZONE 'Asia/Seoul')::date, interval '1 day') AS g(d)`,
      sql`SELECT song, count(*)::int AS plays, count(*) FILTER (WHERE cleared)::int AS clears,
        round(avg(raw))::int AS avg_raw, max(score)::int AS best FROM play_log GROUP BY song`,
      sql`SELECT username, avatar, created_at, last_seen,
        coalesce((save->'stats'->>'plays')::int, 0) AS plays,
        coalesce((save->>'exp')::int, 0) AS exp,
        coalesce((save->>'coins')::int, 0) AS coins,
        coalesce((save->>'gems')::int, 0) AS gems,
        coalesce((save->'stats'->>'pulls')::int, 0) AS pulls,
        coalesce((save->'stats'->>'sRanks')::int, 0) AS s_ranks,
        coalesce((save->'stats'->>'maxCombo')::int, 0) AS max_combo,
        (SELECT count(*)::int FROM jsonb_object_keys(coalesce(save->'chars', '{}'::jsonb))) AS chars,
        (SELECT count(*)::int FROM jsonb_object_keys(coalesce(save->'stats'->'clears', '{}'::jsonb))) AS clears,
        lv, frame, total_score::float8 AS total,
        save->'chars' AS c, save->'team' AS t
        FROM users ORDER BY created_at DESC LIMIT 500`,
      recentPlays(),
      sql`SELECT k AS id, count(*)::int AS owners FROM users, jsonb_object_keys(coalesce(save->'chars', '{}'::jsonb)) AS k GROUP BY k`,
      // 명예의 전당: 항목마다 TOP 5
      sql`SELECT * FROM (
        (SELECT 'total' AS k, username, avatar, total_score::float8 AS v FROM users ORDER BY total_score DESC, id LIMIT 5)
        UNION ALL (SELECT 'firsts', u.username, u.avatar, count(*)::float8 AS v FROM (SELECT DISTINCT ON (song, diff) user_id FROM scores ORDER BY song, diff, score DESC, played_at ASC) f
          JOIN users u ON u.id = f.user_id GROUP BY u.id ORDER BY v DESC, u.id LIMIT 5)
        UNION ALL (SELECT 'level', username, avatar, coalesce((save->>'exp')::float8, 0) AS v FROM users ORDER BY v DESC, id LIMIT 5)
        UNION ALL (SELECT 'plays', username, avatar, coalesce((save->'stats'->>'plays')::float8, 0) AS v FROM users ORDER BY v DESC, id LIMIT 5)
        UNION ALL (SELECT 'combo', username, avatar, coalesce((save->'stats'->>'maxCombo')::float8, 0) AS v FROM users ORDER BY v DESC, id LIMIT 5)
        UNION ALL (SELECT 'fc', username, avatar, coalesce((save->'stats'->>'fullCombos')::float8, 0) AS v FROM users ORDER BY v DESC, id LIMIT 5)
        UNION ALL (SELECT 'chars', username, avatar, (SELECT count(*) FROM jsonb_object_keys(coalesce(save->'chars', '{}'::jsonb)))::float8 AS v FROM users ORDER BY v DESC, id LIMIT 5)
        UNION ALL (SELECT 'pulls', username, avatar, coalesce((save->'stats'->>'pulls')::float8, 0) AS v FROM users ORDER BY v DESC, id LIMIT 5)
        UNION ALL (SELECT 'mwins', username, avatar, coalesce((save->'stats'->>'mwins')::float8, 0) AS v FROM users ORDER BY v DESC, id LIMIT 5)
        UNION ALL (SELECT 'gifts', username, avatar, coalesce((save->'stats'->>'gifts')::float8, 0) AS v FROM users ORDER BY v DESC, id LIMIT 5)
      ) h WHERE v > 0`,
      sql`SELECT diff, count(*)::int AS plays, count(*) FILTER (WHERE cleared)::int AS clears FROM play_log GROUP BY diff`,
      // 요일 × 시간대 플레이 수 (최근 4주, 한국 시간)
      sql`SELECT extract(isodow FROM played_at AT TIME ZONE 'Asia/Seoul')::int AS dow, extract(hour FROM played_at AT TIME ZONE 'Asia/Seoul')::int AS h, count(*)::int AS n
        FROM play_log WHERE played_at > now() - interval '28 days' GROUP BY 1, 2`,
      sql`SELECT lv, count(*)::int AS n FROM users GROUP BY 1`,
      sql`SELECT rank, count(*)::int AS n FROM play_log GROUP BY rank`,
      sql`SELECT kind, count(*)::int AS n, count(*) FILTER (WHERE status = 'open')::int AS open FROM inquiries GROUP BY kind`,
    ]);
    // 팀 점수는 저장 데이터로 계산 (최근 가입 500명). 예전 진화 데이터는 normalize가 레벨로 옮긴다
    for (const m of members) {
      m.power = teamPower(normalize({ chars: m.c ?? {}, team: Array.isArray(m.t) ? m.t : [] }));
      delete m.c; delete m.t;
    }
    res.json({ totals, days, songs, members, recent, owners, hof, diffs, heat, levels, ranks, kinds });
  },

  // 친구(캐릭터) 선물하기: 이벤트 상품 등. 없으면 1레벨로, 있으면 레벨 업 카드 +1 · 우편으로 알림
  async 'POST admin-grant'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const b = req.body ?? {}, name = text(b.name, 20), c = CHAR[b.id], n = isInt(b.count, 1, 100) ? b.count : 1;
    if (!c) return res.status(400).json({ error: '선물할 친구를 골라 주세요' });
    const [t] = await sql`SELECT id FROM users WHERE username = ${name}`;
    if (!t) return res.status(404).json({ error: '그런 닉네임은 없어요' });
    let out;
    for (let i = 0; i < n; i++) out = await mutate(t.id, (s) => act(s, { type: 'grant', id: c.id }));
    await sql`INSERT INTO mail (user_id, kind, title, body) VALUES (${t.id}, 'gift',
      ${`🎁 ${RARITY[c.rarity].name} 친구 '${c.name}'이(가) 도착했어요!`}, ${`운영자 선물로 '${c.name}' 카드 ${n}장을 보냈어요. 팀 화면에서 확인해 보세요!`})`;
    res.json({ ok: true, level: out.result.level, dup: out.save.dup[c.id] ?? 0 });
  },

  // 멀티 방 닫기 (문제가 생긴 방)
  async 'POST admin-room-close'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const code = roomCodeOf(req.body);
    const gone = await sql`DELETE FROM rooms WHERE code = ${code} RETURNING code`;
    if (!gone.length) return res.status(404).json({ error: '그런 방이 없어요' });
    res.json({ ok: true });
  },

  // 화면 에러: 같은 메시지끼리 묶어서 많은 순 (최근 3일) + 최근 30개
  async 'GET admin-errors'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const [groups, recent] = await Promise.all([
      sql`SELECT msg, count(*)::int AS n, count(DISTINCT user_id)::int AS users, max(created_at) AS last, (array_agg(place ORDER BY id DESC))[1] AS place,
            (array_agg(ua ORDER BY id DESC))[1] AS ua, (array_agg(stack ORDER BY id DESC))[1] AS stack
          FROM client_errors WHERE created_at > now() - interval '3 days' GROUP BY msg ORDER BY n DESC LIMIT 50`,
      sql`SELECT e.msg, e.place, e.song, e.ua, e.ver, e.created_at, u.username FROM client_errors e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 30`,
    ]);
    res.json({ groups, recent });
  },

  // 회원 조치: 재화 더하기/빼기 · 캐릭터 선물은 admin-grant · 닉네임 바꾸기 · 강제 로그아웃 · 정지/해제 · 랭킹 기록 지우기 · 비밀번호 초기화
  async 'POST admin-user-action'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const b = req.body ?? {}, name = text(b.name, 20);
    const [u] = await sql`SELECT id, username FROM users WHERE username = ${name}`;
    if (!u) return res.status(404).json({ error: '그런 닉네임은 없어요' });
    const note = text(b.reason, 200);
    switch (b.action) {
      case 'wallet': { // 코인 · 보석 더하기 (음수면 빼기, 0 밑으로는 안 내려감)
        const coins = isInt(b.coins, -1e9, 1e9) ? b.coins : 0, gems = isInt(b.gems, -1e8, 1e8) ? b.gems : 0;
        if (!coins && !gems) return res.status(400).json({ error: '코인이나 보석 수를 적어 주세요' });
        const out = await mutate(u.id, (s0) => {
          const s = normalize(s0);
          s.coins = Math.max(0, s.coins + coins);
          s.gems = Math.max(0, s.gems + gems);
          return { save: s };
        });
        if (coins > 0 || gems > 0) await sql`INSERT INTO mail (user_id, kind, title, body) VALUES (${u.id}, 'system', '관리자 지급', ${note || `코인 ${coins} · 보석 ${gems}이 지급됐어요`})`;
        return res.json({ ok: true, coins: out.save.coins, gems: out.save.gems });
      }
      case 'rename': {
        const to = text(b.to, 12);
        if (!NAME.test(to) || to === process.env.ADMIN_USER) return res.status(400).json({ error: '새 닉네임은 한글·영문·숫자 2~12자' });
        try {
          await sql`UPDATE users SET username = ${to} WHERE id = ${u.id}`;
        } catch (e) {
          if (e.code === '23505') return res.status(409).json({ error: '이미 있는 닉네임이에요' });
          throw e;
        }
        await sql`UPDATE room_players SET name = ${to} WHERE user_id = ${u.id}`;
        return res.json({ ok: true });
      }
      case 'logout':
        await sql`DELETE FROM sessions WHERE user_id = ${u.id}`;
        return res.json({ ok: true });
      case 'ban': {
        const days = isInt(b.days, 1, 36500) ? b.days : 7;
        await sql`UPDATE users SET banned_until = now() + make_interval(days => ${days}::int), ban_reason = ${note || null} WHERE id = ${u.id}`;
        await sql`DELETE FROM sessions WHERE user_id = ${u.id}`;
        await leaveAll(u.id);
        return res.json({ ok: true });
      }
      case 'unban':
        await sql`UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = ${u.id}`;
        return res.json({ ok: true });
      case 'wipe-scores': // 부정 기록: 랭킹에서 빼기
        await sql`DELETE FROM scores WHERE user_id = ${u.id}`;
        await sql`UPDATE users SET total_score = 0 WHERE id = ${u.id}`;
        boards.clear();
        return res.json({ ok: true });
      case 'password': { // 관리자가 정한 임시 비밀번호로 바꾼다 (관리자 화면에 계속 보임 · 본인 확인 뒤 전달)
        const temp = typeof b.pw === 'string' ? b.pw.trim() : '';
        if (temp.length < 4 || temp.length > 64) return res.status(400).json({ error: '임시 비밀번호는 4~64자' });
        await sql`UPDATE users SET pw = ${hashPw(temp)}, temp_pw = ${temp}, temp_pw_at = now() WHERE id = ${u.id}`;
        await sql`DELETE FROM sessions WHERE user_id = ${u.id}`;
        return res.json({ ok: true, temp });
      }
      default:
        return res.status(400).json({ error: '없는 조치예요' });
    }
  },

  // 회원 한 명 자세히 (닉네임): 레벨 · 재화 · 친구 · 가진 캐릭터 · 최근 플레이
  async 'GET admin-user'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const name = text(req.query.name, 20);
    const [u] = await sql`SELECT id, username, avatar, lv, frame, total_score::float8 AS total, created_at, last_seen, save, banned_until, ban_reason, temp_pw, temp_pw_at
                          FROM users WHERE username = ${name}`;
    if (!u) return res.status(404).json({ error: '그런 닉네임은 없어요' });
    const s = normalize(u.save);
    const [[f], plays] = await Promise.all([
      sql`SELECT (SELECT count(*)::int FROM friends WHERE user_id = ${u.id} AND status = 'accepted') AS friends,
          (SELECT count(*)::int FROM mail WHERE user_id = ${u.id} AND kind = 'friend') AS gifts_got`,
      sql`SELECT song, diff, score, rank, cleared, multi, played_at FROM play_log WHERE user_id = ${u.id} ORDER BY played_at DESC LIMIT 20`,
    ]);
    res.json({
      username: u.username, avatar: u.avatar, lv: u.lv, frame: u.frame, total: u.total, created_at: u.created_at, last_seen: u.last_seen,
      banned_until: u.banned_until && new Date(u.banned_until) > new Date() ? u.banned_until : null, ban_reason: u.ban_reason,
      temp_pw: u.temp_pw, temp_pw_at: u.temp_pw_at,
      coins: s.coins, gems: s.gems, exp: s.exp, stats: { plays: s.stats.plays, pulls: s.stats.pulls, mwins: s.stats.mwins, gifts: s.stats.gifts, levelUps: s.stats.levelUps },
      chars: Object.entries(s.chars).filter(([id]) => CHAR[id]).map(([id, lv]) => ({ id, name: CHAR[id].name, rarity: CHAR[id].rarity, lv, dup: s.dup[id] ?? 0 }))
        .sort((a, b) => b.rarity - a.rarity || b.lv - a.lv),
      ...f, plays,
    });
  },

  // 쿠폰 만들기 · 지우기: { code, coins, gems, max(0 = 제한 없음), days(0 = 기한 없음), note(우편 내용) } / { del: 코드 }
  async 'POST admin-coupon'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const b = req.body ?? {};
    if (b.del !== undefined) {
      await sql`DELETE FROM coupons WHERE code = ${couponCode(b.del)}`;
      return res.json({ ok: true });
    }
    const code = couponCode(b.code), coins = Number(b.coins) || 0, gems = Number(b.gems) || 0, max = Number(b.max) || 0, days = Number(b.days) || 0;
    if (code.length < 4) return res.status(400).json({ error: '쿠폰 코드는 4~24자로 지어 주세요 (영문 · 숫자 · 한글)' });
    if (!isInt(coins, 0, 1e6) || !isInt(gems, 0, 1e5) || (!coins && !gems)) return res.status(400).json({ error: '선물은 코인 100만 · 보석 10만 개까지예요 (하나는 넣어 주세요)' });
    if (!isInt(max, 0, 1e6) || !isInt(days, 0, 3650)) return res.status(400).json({ error: '사용 수와 기한을 바르게 적어 주세요' });
    const [row] = await sql`INSERT INTO coupons (code, coins, gems, max_uses, note, expires_at)
      VALUES (${code}, ${coins}, ${gems}, ${max}, ${text(b.note, 200) || '쿠폰 선물이에요. 오늘도 신나게 연주해요!'}, ${days ? new Date(Date.now() + days * DAY * 1000).toISOString() : null})
      ON CONFLICT (code) DO NOTHING RETURNING code`;
    if (!row) return res.status(409).json({ error: '이미 있는 쿠폰 코드예요' });
    res.json({ code });
  },

  // 성장 · 보안 탭: 쿠폰 목록 · 최근 14일 가입자가 어디까지 갔는지 · 친구 초대 순위 · 보안 기록(로그인 실패 · 이상한 기록)
  async 'GET admin-growth'(req, res) {
    if (!(await adminOk(req))) return adminOnly(res);
    const [coupons, [funnel], inviters, [sec], recent, top] = await Promise.all([
      sql`SELECT code, coins, gems, max_uses, used, note, expires_at, created_at, (expires_at IS NOT NULL AND expires_at < now()) AS expired
          FROM coupons ORDER BY created_at DESC LIMIT 200`,
      sql`SELECT count(*)::int AS signups,
          count(*) FILTER (WHERE coalesce((save->'stats'->>'plays')::int, 0) >= 1)::int AS played,
          count(*) FILTER (WHERE coalesce((save->'stats'->>'plays')::int, 0) >= 3)::int AS played3,
          count(*) FILTER (WHERE last_seen > created_at + interval '1 day')::int AS back,
          count(*) FILTER (WHERE ref_by IS NOT NULL)::int AS invited,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM friends f WHERE f.user_id = users.id AND f.status = 'accepted'))::int AS friended,
          (SELECT count(*)::int FROM play_log WHERE user_id IS NULL AND played_at > now() - interval '14 days') AS guest_plays,
          (SELECT count(*)::int FROM users WHERE ref_by IS NOT NULL) AS invited_all,
          (SELECT count(*)::int FROM users WHERE ref_by IS NOT NULL AND ref_paid) AS invited_paid,
          (SELECT count(*)::int FROM mail WHERE kind = 'boast' AND created_at > now() - interval '14 days') AS boasts,
          (SELECT coalesce(sum(used), 0)::int FROM coupons) AS coupon_uses
        FROM users WHERE created_at > now() - interval '14 days'`,
      sql`SELECT u.username, u.avatar, count(*)::int AS n, count(*) FILTER (WHERE r.ref_paid)::int AS active
          FROM users r JOIN users u ON u.id = r.ref_by GROUP BY u.id ORDER BY n DESC, u.id LIMIT 20`,
      sql`SELECT count(*) FILTER (WHERE kind = 'login-fail')::int AS login_fail, count(*) FILTER (WHERE kind = 'admin-fail')::int AS admin_fail,
          count(*) FILTER (WHERE kind = 'cheat')::int AS cheat, count(*) FILTER (WHERE kind = 'signup')::int AS signup,
          count(*) FILTER (WHERE kind = 'coupon-fail')::int AS coupon_fail FROM sec_log WHERE created_at > now() - interval '1 day'`,
      sql`SELECT s.kind, s.k, s.detail, s.created_at, u.username FROM sec_log s LEFT JOIN users u ON u.id = s.user_id
          WHERE s.kind <> 'signup' ORDER BY s.id DESC LIMIT 60`,
      // 많이 걸린 곳 (최근 7일): 이상한 기록은 회원별, 로그인 실패는 IP별
      sql`SELECT s.kind, coalesce(u.username, s.k) AS who, count(*)::int AS n, max(s.created_at) AS last
          FROM sec_log s LEFT JOIN users u ON u.id = s.user_id AND s.kind = 'cheat'
          WHERE s.kind IN ('login-fail', 'admin-fail', 'cheat') AND s.created_at > now() - interval '7 days' GROUP BY 1, 2 ORDER BY n DESC LIMIT 20`,
    ]);
    res.json({ coupons, funnel, inviters, sec, recent, top });
  },
};

const recentPlays = () => sql`SELECT p.song, p.diff, p.score, p.rank, p.cleared, p.multi, p.played_at, u.username FROM play_log p
  LEFT JOIN users u ON u.id = p.user_id ORDER BY p.played_at DESC LIMIT 30`;

// 점검 중에도 열려 있는 API (상태 확인 · 공지 · 관리자)
const ALWAYS_OPEN = /^(GET status|GET notices|GET admin-|POST admin-|POST client-error)/;

export default async function handler(req, res) {
  const key = `${req.method} ${req.query.action}`, route = routes[key];
  if (!route) return res.status(404).json({ error: '없는 API예요' });
  try {
    await init();
    if (!ALWAYS_OPEN.test(key)) {
      const m = await maintenance();
      const adminLogin = key === 'POST login' && isAdmin(req.body?.username ?? '', req.body?.password ?? '');
      if (m && !adminLogin && !(await previewing(req))) return res.status(503).json({ error: `지금은 점검 중이에요. ${m.reason}`, maintenance: m });
    }
    await route(req, res);
  } catch (e) {
    if (e instanceof GameError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: '서버가 잠깐 졸고 있어요. 다시 시도해 주세요' });
  }
}
