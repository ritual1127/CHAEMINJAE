// 화면 · 로그인 · 곡 선택 · 팀(끌어서 장착) · 친구 레벨 업 · 뽑기 · 상점 · 업적 · 출석부 · 우편함 · 공지 · 문의 · 게임 · 결과 · 랭킹 · 설정
// · 친구(신청 · 선물 · 초대) · 프로필 테두리 · 레벨 혜택 · 멀티플레이(PC)
import { SONGS, SONG, DIFFS, DIFF_NAME, GENRES, compile, makeChart, fmtTime, chartLevel, playSong, songMatch } from './songs.js';
import { sound, Game, Mini, rankOf } from './game.js';
import {
  CHARS, CHAR, RARITY, BUFFS, SYNERGIES, BOOSTERS, SHOP, ACH_TRACKS, ACH_TOTAL, ACH_CATS, MISSIONS, ONLINE, BANNERS, ATTEND,
  MAX_LEVEL, MAX_LV, TOP, FREE_AVATARS, AVATAR_PRICE, RENAME_COINS, VERSION, INQUIRY, MP, ATTACKS, ATTACK_KINDS, GIFT,
  act, normalize, teamBuffs, teamPower, powerOf, valueAt, bestTeam, unlocked, ownedAvatar, claimable, missionsReady, onlineReady,
  levelOf, today, dayOf, cardsOf, cardPrice, LUCKY, BOT_SKILL, botAttacks, CARD_SHOP, POTION, pickupOf, pickupEnds, bannerOf, priceOf, attendOf, mpOrder, mpTarget, itemize,
  copiesFor, coinsFor, canLevel, achView, achCtx, achCount, tierName, expProgress, levelReward, perksOf, frameInfo, frameTier, frameOfSave,
} from './rules.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
const face = (id) => `assets/faces/${CHAR[id].img ?? id}.webp`;
const card = (id) => CHAR[id].card ?? `assets/cards/${CHAR[id].img ?? id}.webp`;
const jacket = (s) => `assets/${s.jacket ?? `jackets/${s.id}`}.webp`;
const avatar = (n) => `assets/avatars/${n}.webp`;
// 프로필 사진 + 레벨 테두리 (style.css .fr: 재질 색 --f1~3 · 무늬 data-s · 100레벨마다 장식 아이콘)
const framed = (n, tier = 0, cls = '') => {
  const f = frameInfo(tier);
  return `<span class="fr ${cls}" data-s="${f.style}" data-fam="${f.family}" style="--f1:${f.c[0]};--f2:${f.c[1]};--f3:${f.c[2]}" title="${esc(f.name)}">`
    + `<img src="${avatar(+n || 1)}" alt="">${f.family || f.style >= 5 ? `<i class="fr-ic">${f.icon}</i>` : ''}</span>`;
};
const lvTag = (L) => `<i class="lvt">Lv.${fmt(L)}</i>`;
const cardImg = (id, extra = '') => `<img src="${card(id)}" alt="" draggable="false" class="${CHAR[id].card ? 'wide ' : ''}${extra}">`;
// 카드 칸에 붙이는 등급 · 의상 테마 클래스 (style.css의 .r1~.r5 · .fx-*)
const bdg = (id) => (CHAR[id].badge ? `<span class="bdg">${CHAR[id].badge}</span>` : '');
const rcls = (id) => `r${CHAR[id].rarity}${CHAR[id].fx ? ` fx-${CHAR[id].fx}` : ''}`;
const reward = (r) => [r.coins ? `${icon('coin')}${fmt(r.coins)}` : '', r.gems ? `${icon('gem')}${fmt(r.gems)}` : ''].join(' ');
const rewardText = (r) => [r.coins ? `코인 ${fmt(r.coins)}개` : '', r.gems ? `보석 ${fmt(r.gems)}개` : ''].filter(Boolean).join(' + ');
const DUR = Object.fromEntries(SONGS.map((s) => [s.id, compile(s).duration]));
const LANE_COLORS = ['#ffb3cf', '#86c5ff', '#ffd35c', '#b9a3ff'];
const DEFAULT_KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
const MAIN = ['home', 'songs', 'team', 'gacha', 'shop', 'quests', 'rank', 'multi', 'room'];
// 멀티플레이는 키보드로 하는 PC에서만
const isPC = () => matchMedia('(hover: hover) and (pointer: fine) and (min-width: 900px)').matches;

const scene = $('#scene');
const settings = { speed: 5, offset: 0, music: true, musicVol: 90, sfxVol: 80, hitsound: true, ...load('settings', {}) };
if (!Array.isArray(settings.keys) || settings.keys.length !== 4 || new Set(settings.keys).size !== 4) settings.keys = [...DEFAULT_KEYS];
// 멀티 공격 키 (설정에서 바꿀 수 있다). 레인 키와 겹치면 기본값으로
if (typeof settings.atk !== 'string' || settings.keys.includes(settings.atk)) settings.atk = settings.keys.includes('Space') ? 'Enter' : 'Space';
sound.vol = { music: settings.musicVol / 100, sfx: settings.sfxVol / 100 };
const state = {
  me: null, // 로그인 유저 { username } (게스트면 null)
  cfg: { rates: {} }, // 관리자가 바꾼 뽑기 확률 (/api/status)
  save: normalize(load('guestSave', null)),
  diff: 'normal', rankSong: SONGS[0].id, rankDiff: 'normal', rankMode: 'song', rarity: -1, sort: load('teamSort', 'power'), genre: 'all', q: '', achLimit: 100, slot: -1,
  song: null, boosters: new Set(), run: null, banner: 'std', questTab: 'today', achCat: 'all', achSong: '', unread: 0, requests: 0,
};
let current = 'title';
let game = null;
// 멀티플레이 상태: 방 코드 · 마지막으로 받은 방 · 서버 시계 차이 · 받은 이벤트 번호 · 이번 판 · 모아 둔 공격 · 다른 참가자 화면
const mp = {
  code: null, room: null, t: 0, fails: 0, offset: 0, rtt: Infinity, since: 0, round: 0, on: false,
  charges: [], target: 0, lastFire: 0, log: [], seq: 0, views: new Map(), result: null, reward: null,
};

// 키 이름 표시 (KeyD → D, Semicolon → ; …)
const KEYNAME = { Space: '스페이스', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Backquote: '`', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: '왼Shift', ShiftRight: '오른Shift', Enter: 'Enter' };
const keyLabel = (code) => KEYNAME[code] ?? code.replace(/^(Key|Digit|Numpad)/, '');

// 화면 에러 모으기: 콘솔 + 서버(한 화면에서 최대 8번 · 같은 에러는 한 번). 관리자 페이지 '화면 에러'에서 본다
const sentErr = new Set();
function reportError2(e, where = '') {
  const msg = String(e?.message ?? e ?? '').slice(0, 300), stack = String(e?.stack ?? '').slice(0, 1500);
  console.error(e);
  if (!msg || sentErr.size >= 8 || sentErr.has(msg) || /^(Script error|ResizeObserver)|Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return;
  sentErr.add(msg);
  fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ msg, stack, where: where || (typeof current === 'string' ? current : ''), v: VERSION, song: state?.run?.song?.id ?? '' }) }).catch(() => {});
}
addEventListener('error', (e) => reportError2(e.error ?? e.message, 'window'));
addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  if (r?.name === 'AbortError' || r?.name === 'NotAllowedError') return; // 소리 자동재생 막힘 등은 정상
  if (r?.status) return; // 서버가 거절한 요청(로그인 필요 등)은 화면에서 이미 알린다
  reportError2(r, 'promise');
});

async function api(path, body) {
  const res = await fetch(`/api/${path}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 && data.maintenance) showMaint(data.maintenance);
  if (!res.ok) throw Object.assign(new Error(data.error || '연결이 불안정해요. 잠시 후 다시 시도해 주세요'), { status: res.status });
  return data;
}

/* ---------- 상태 확인: 점검 모드 · 점검 예고 · 뽑기 확률을 30초마다 (게스트도). 게임 중에 온 알림은 곡이 끝난 뒤에 ---------- */

const when = (t) => new Date(t).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const clock = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const span = (sc) => `${when(sc.from)} ~ ${new Date(sc.from).toDateString() === new Date(sc.to).toDateString() ? clock(sc.to) : when(sc.to)}`;
let later = null; // 게임 중이라 미뤄 둔 알림 { maint, sched }

function showMaint(m) {
  if (current === 'game') return void (later = { ...later, maint: m });
  $$('dialog[open]').forEach((d) => d.close());
  game?.stop();
  $('#maintReason').textContent = m.reason;
  $('#maintSince').textContent = m.since ? `${when(m.since)}부터` : '';
  $('#maint').hidden = false;
}

// 점검 예고 팝업: 알림마다 한 번만. 위쪽 띠는 점검 시작 전까지 계속 보인다
function showSchedule(sc) {
  $('#schedBar').hidden = !sc;
  if (!sc) return;
  $('#schedBar').textContent = `🛠 ${span(sc)} 점검 예정`;
  if (load('schedSeen', 0) === sc.id || $('#schedDlg').open || !$('#maint').hidden) return;
  if (current === 'game') return void (later = { ...later, sched: sc });
  $('#schedWhen').textContent = span(sc);
  $('#schedMsg').textContent = sc.msg;
  $('#schedDlg').showModal();
  store('schedSeen', sc.id);
}
$('#schedBar').onclick = () => {
  store('schedSeen', 0);
  checkStatus();
};

function flushLater() {
  const l = later;
  later = null;
  if (l?.maint) showMaint(l.maint);
  else if (l?.sched) showSchedule(l.sched);
  else if (l?.invite) showInvites([l.invite]);
}

// 친구의 멀티 초대: 처음 보는 초대만 창으로 (게임 중이면 끝난 뒤에, 이미 그 방에 있으면 무시)
function showInvites(list) {
  const seen = load('invSeen', []), inv = list.find((x) => !seen.includes(x.id) && x.code !== mp.code);
  if (!inv) return;
  if (current === 'game') return void (later = { ...later, invite: inv });
  if ($('#inviteDlg').open) return;
  store('invSeen', [...seen, inv.id].slice(-50));
  $('#invWho').innerHTML = `${framed(inv.avatar, 0, 'sm')}<b>${esc(inv.from)}</b>`;
  $('#invCode').textContent = inv.code;
  $('#invNote').textContent = '같이 연주해요! 지금 바로 들어갈 수 있어요';
  $('#invGo').hidden = false;
  $('#inviteDlg').showModal();
  sound.sfx('rare', 0.08);
}
$('#invGo').onclick = () => {
  $('#inviteDlg').close();
  sound.get();
  if (mp.code) api('mp-leave', {}).catch(() => {});
  if (mp.code) mpGone();
  mpEnter('mp-join', { code: $('#invCode').textContent });
};

// 지금 접속 중 신호: 기기마다 임의 번호 + 지금 보고 있는 화면 (관리자 페이지 '실시간')
const vid = load('vid', null) ?? (() => {
  const v = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  store('vid', v);
  return v;
})();
const where = () => (current === 'game' ? (state.run?.multi ? `mgame:${mp.code}` : `game:${state.run?.song.id}:${state.run?.diff}`)
  : current === 'room' ? `room:${mp.code}` : current);

async function checkStatus() {
  const q = new URLSearchParams({ v: vid, s: where(), d: isPC() ? 'pc' : 'mo' });
  const st = await fetch(`/api/status?${q}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  if (!st) return;
  state.cfg = { rates: st.rates ?? {} };
  if (state.me) {
    state.requests = st.requests ?? 0;
    $('#friendDot').hidden = !state.requests;
    showInvites(st.invites ?? []);
  }
  // 새 버전이 배포됐으면 (게임 중이 아니면) 한 번만 새로고침해서 새 화면을 받는다
  if (st.version && st.version !== VERSION && current !== 'game' && load('reloadedFor', '') !== st.version) {
    store('reloadedFor', st.version);
    return location.reload();
  }
  $('#maintBar').hidden = !(st.maintenance && st.preview);
  $('#maintHint').hidden = !st.admin;
  if (st.maintenance && !st.preview) return showMaint(st.maintenance);
  if (!$('#maint').hidden) return location.reload(); // 점검이 끝났으면 새로 시작
  showSchedule(st.schedule);
}
$('#maintRetry').onclick = checkStatus;
checkStatus();
setInterval(() => !document.hidden && checkStatus(), 30000);

// 재화가 바뀌는 모든 행동: 로그인 유저는 서버가, 게스트는 브라우저가 같은 규칙(rules.js act)으로 처리
async function doAct(action) {
  if (state.me) {
    const { save, result } = await api('act', action);
    state.save = save;
    return result;
  }
  const { save, result } = act(state.save, action, Math.random, state.cfg);
  state.save = save;
  store('guestSave', save);
  return result;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}

const imgs = new Map();
const loadImg = (src) => {
  if (!imgs.has(src)) imgs.set(src, new Promise((ok, fail) => Object.assign(new Image(), { onload() { ok(this); }, onerror: fail, src })));
  return imgs.get(src);
};

// 캐릭터 한마디: 목소리 + 말풍선 텍스트
function speak(id, el) {
  const c = CHAR[id], line = c.lines[Math.floor(Math.random() * c.lines.length)];
  sound.voice(c, line);
  if (el) {
    el.textContent = line;
    el.hidden = false;
    el.getAnimations().forEach((a) => (a.currentTime = 0));
    clearTimeout(el.t);
    el.t = setTimeout(() => (el.hidden = true), 2200);
  }
  return line;
}

/* ---------- 화면 전환 ---------- */

const RENDER = {};
const LEAVE = {};

function show(id) {
  LEAVE[current]?.(id);
  current = id;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  $('#app').classList.toggle('bare', !MAIN.includes(id));
  $$('#nav button').forEach((b) => (b.dataset.go === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  scene.dataset.mode = id;
  RENDER[id]?.();
  renderTop();
  music();
  sideAds();
  if (MAIN.includes(id)) pollMail();
}

function refresh() {
  RENDER[current]?.();
  renderTop();
}

// 로비 음악. 곡 정보 창이 열려 있으면 그 곡 미리듣기를 그대로 둔다
function music() {
  if (!sound.ctx || $('#songDlg').open) return;
  if (!settings.music || !MAIN.includes(current)) return stopMusic();
  if (sound.bgmSong !== 'lobby') {
    sound.bgmSong = 'lobby';
    nextLobby();
  }
}
// 로비 음악: 잔잔한 곡들을 섞어서 한 곡씩 끝까지, 끝나면 다음 곡 (작은 별은 이제 그만!)
const LOBBY = SONGS.filter((x) => x.genre === 'lofi' || ['clairdelune', 'swan', 'jesujoy'].includes(x.id)).map((x) => x.id).sort(() => Math.random() - 0.5);
let lobbyAt = Math.floor(Math.random() * LOBBY.length);
function nextLobby() {
  if (sound.bgmSong !== 'lobby') return;
  sound.bgm(SONG[LOBBY[lobbyAt++ % LOBBY.length]], 'A', { once: true, onEnd: nextLobby });
}
const stopMusic = () => {
  sound.bgmSong = null;
  sound.bgm(null);
};

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  sound.get();
  sound.sfx(go.dataset.go === 'home' ? 'back' : 'tap');
  go.closest('dialog')?.close();
  show(go.dataset.go);
});

/* ---------- 상단바 ---------- */

let lastMoney = null;
function renderTop() {
  const s = state.save, lv = levelOf(s.exp), [cur, need] = expProgress(s.exp);
  $('#meName').textContent = state.me ? state.me.username : '게스트';
  const av = framed(s.avatar, frameOfSave(s));
  if ($('#meAvatar').dataset.k !== av) $('#meAvatar').innerHTML = $('#meAvatar').dataset.k = av;
  $('#meLv').textContent = `Lv.${fmt(lv)}`;
  $('#meExp').style.width = `${(cur / need) * 100}%`;
  $('#meExp').parentElement.title = lv >= MAX_LV ? '최고 레벨!' : `다음 레벨까지 ${fmt(need - cur)} EXP`;
  $('#friendDot').hidden = !state.requests;
  $('#coins').textContent = fmt(s.coins);
  $('#gems').textContent = fmt(s.gems);
  if (lastMoney && (lastMoney[0] !== s.coins || lastMoney[1] !== s.gems)) {
    $$('.money').forEach((m) => {
      m.classList.remove('bump');
      void m.offsetWidth;
      m.classList.add('bump');
    });
  }
  lastMoney = [s.coins, s.gems];
  $('#questDot').hidden = !(claimable(s).length || missionsReady(s).length || onlineReady(s).length || s.daily !== today());
  $('#mailDot').hidden = !state.unread;
  // 멀티 방에 있는 채로 다른 화면을 보면 돌아가기 버튼
  $('#roomBar').hidden = !(mp.code && MAIN.includes(current) && current !== 'room');
  $('#roomBar').textContent = `👥 멀티 방 ${mp.code ?? ''} · 돌아가기`;
}

// 우편 빨간 점: 메인 화면에 있을 때 1분에 한 번만 확인
async function pollMail(force) {
  if (!state.me || (!force && Date.now() - (pollMail.at ?? 0) < 60000)) return;
  pollMail.at = Date.now();
  try {
    state.unread = (await api('mail')).unread;
    renderTop();
  } catch {}
}

/* ---------- 타이틀 · 로그인 ---------- */

// 오늘 첫 접속 시각 기록 (접속 시간 보상)
const hello = () => doAct({ type: 'hello' }).catch(() => {});

function enter(me) {
  state.me = me ? { username: me.username } : null;
  state.save = me ? me.save : normalize(load('guestSave', null));
  state.unread = me?.unread ?? 0;
  hello();
}

const meReady = api('me').then(enter).catch(() => null);
let authMode = 'login';
let pickAvatar = 1 + Math.floor(Math.random() * FREE_AVATARS);

function avatarGrid(el, list, get, set) {
  el.innerHTML = list.map((n) => `<button type="button" class="av" data-n="${n}" aria-label="프로필 ${n}번"><img src="${avatar(n)}" alt="" loading="lazy"></button>`).join('');
  const sync = () => el.querySelectorAll('.av').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.n === get()));
  el.onclick = (e) => {
    const b = e.target.closest('.av');
    if (!b) return;
    sound.sfx('tap');
    set(+b.dataset.n);
    sync();
  };
  sync();
  return sync;
}
avatarGrid($('#signupAvatars'), Array.from({ length: FREE_AVATARS }, (_, i) => i + 1), () => pickAvatar, (n) => (pickAvatar = n));

function openAuth(mode = 'login') {
  $('#touch').hidden = true;
  $('#auth').hidden = false;
  setAuthMode(mode);
}

function setAuthMode(mode) {
  authMode = mode;
  $$('#auth .seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
  $('#auth .signup-only').hidden = mode !== 'signup';
  $('#authSubmit').textContent = mode === 'login' ? '로그인' : '가입하고 시작!';
  $('#auth').password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#auth .err').textContent = '';
}
$$('#auth .seg button').forEach((b) => (b.onclick = () => { sound.sfx('tap'); setAuthMode(b.dataset.mode); }));

$('#title').addEventListener('click', async (e) => {
  if (e.target.closest('#auth') || !$('#auth').hidden) return;
  sound.get();
  sound.sfx('ok');
  await meReady;
  if (state.me) {
    toast(`어서 와요, ${state.me.username}!`);
    show('home');
  } else openAuth();
});

$('#auth').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, btn = $('#authSubmit');
  const body = { username: f.username.value.trim(), password: f.password.value };
  if (!body.username || !body.password) return ($('#auth .err').textContent = '닉네임과 비밀번호를 적어 주세요');
  if (authMode === 'signup') body.avatar = pickAvatar;
  btn.disabled = true;
  try {
    const me = await api(authMode, body);
    if (me.admin) return location.assign('/admin/');
    enter(me);
    sound.sfx('ok');
    f.reset();
    $('#auth').hidden = true;
    $('#touch').hidden = false;
    toast(authMode === 'signup' ? `반가워요, ${me.username}! 우편함에 시작 선물이 와 있어요` : `어서 와요, ${me.username}!`);
    show('home');
    if (authMode === 'signup') openWelcome(true);
  } catch (err) {
    sound.sfx('back');
    $('#auth .err').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$('#guest').onclick = () => {
  sound.sfx('tap');
  enter(null);
  $('#auth').hidden = true;
  $('#touch').hidden = false;
  toast('게스트 기록은 이 기기에만 저장돼요');
  show('home');
  if (!load('welcomed', false)) openWelcome(false);
};

/* ---------- 처음 오면 한 번: 가입 축하 + 간단한 사용법 ---------- */

const WELCOME = [
  { art: 'assets/trio.webp', title: '가입을 축하해요! 🎉', text: (signup) => (signup
    ? '먼작귀 리듬 파티에 온 걸 환영해요! 시작 선물로 보석 1,500개를 드렸고, 우편함에도 보석 500개가 와 있어요.'
    : '게스트 기록은 이 기기에만 저장돼요. 회원가입하면 기록이 서버에 남고 랭킹에도 올라가요!') },
  { emoji: '🎵', title: '연주는 이렇게!', text: () => '곡과 난이도(EASY ~ CHAOS)를 고른 뒤, 노트가 아래 선에 닿는 순간 D · F · J · K 키를 눌러요. 휴대폰은 그 칸을 터치! 길쭉한 롱노트는 끝까지 꾹 누르고 있어야 해요.' },
  { emoji: '👥', title: '팀을 꾸려요', text: () => '친구 4명을 팀에 넣으면 점수 · 체력 버프가 생겨요. 같은 시리즈 친구끼리 모이면 시너지 보너스까지!' },
  { emoji: '🎁', title: '뽑기 · 레벨 업', text: () => '보석으로 새 친구를 뽑아요. 같은 친구 카드가 모이면 레벨 업 (최대 20)! 신화는 0.2%, 전설의 초월 등급은 0.00000001%!' },
  { emoji: '👫', title: '친구랑 같이', text: () => '친구를 추가하면 매일 선물을 주고받고, PC에서는 멀티 방으로 초대해서 최대 10명이 함께 대결할 수 있어요.' },
  { emoji: '📅', title: '매일 보상 챙기기', text: () => '출석부 · 오늘의 미션 · 접속 시간 보상 · 업적 5만 개로 보석과 코인을 모아요. 레벨이 오를수록 테두리와 혜택도 커져요!' },
];
let wStep = 0, wSignup = false;

function openWelcome(signup) {
  wStep = 0;
  wSignup = signup;
  renderWelcome();
  $('#welcome').showModal();
  store('welcomed', true);
}
function renderWelcome() {
  const w = WELCOME[wStep], last = wStep === WELCOME.length - 1;
  $('#wArt').innerHTML = w.art ? `<img src="${w.art}" alt="">` : `<span>${w.emoji}</span>`;
  $('#wTitle').textContent = w.title;
  $('#wText').textContent = w.text(wSignup);
  $('#wDots').innerHTML = WELCOME.map((_, i) => `<i class="${i === wStep ? 'on' : ''}"></i>`).join('');
  $('#wPrev').hidden = !wStep;
  $('#wNext').textContent = last ? '시작하기!' : '다음';
}
$('#wPrev').onclick = () => { wStep--; sound.sfx('tap'); renderWelcome(); };
$('#wNext').onclick = () => {
  sound.sfx(wStep === WELCOME.length - 1 ? 'ok' : 'tap');
  if (wStep === WELCOME.length - 1) return $('#welcome').close();
  wStep++;
  renderWelcome();
};

/* ---------- 홈 ---------- */

function buffChips(b) {
  const list = Object.keys(BUFFS).filter((k) => b[k]).map((k) => `<span class="chip-b">${BUFFS[k](b[k])}</span>`);
  list.push(...b.synergies.map((x) => `<span class="chip-b syn">✦ ${esc(x.name)}</span>`));
  return list.join('') || '<span class="chip-b none">버프 없음</span>';
}

RENDER.home = () => {
  const s = state.save, daily = s.daily !== today(), d = dayOf(s), done = d.claimed.length, n = attendOf(s);
  $('#dailyCard').className = `mini${daily ? ' on' : ''}`;
  $('#dailyCard').innerHTML = daily
    ? `<b>📅 출석 ${n + 1}일째</b><small class="reward">${reward(ATTEND[Math.min(n, 30)])} 받기</small>`
    : `<b>✔ 이번 달 ${n}일 출석</b><small>내일 또 만나요</small>`;
  ads();
  $('#teamCard').innerHTML = `<b>내 팀 <em>${fmt(teamPower(s))}점</em></b><span class="faces">${s.team.filter(Boolean).map((id) => `<img src="${face(id)}" alt="">`).join('')}</span>`;
  const ready = missionsReady(s).length + onlineReady(s).length;
  $('#missionCard').className = `mini${ready ? ' on' : ''}`;
  $('#missionCard').innerHTML = `<b>📋 오늘의 미션</b><small>${ready ? `받을 보상 ${ready}개!` : `${done} / ${MISSIONS.length} 완료`}</small>`;
  $('#rankCard').innerHTML = `<b>🏆 랭킹</b><small id="homeRank">${state.me ? '불러오는 중…' : '로그인하면 순위가 나와요'}</small>`;
  if (state.me) api('rank-total').then((r) => {
    if ($('#homeRank')) $('#homeRank').textContent = r.me ? `종합 ${fmt(r.me.pos)}위 · ${fmt(r.me.score)}점` : '첫 기록을 세워 보세요!';
  }).catch(() => {});
};

/* ---------- 월간 출석부: 이번 달 n번째 출석에 ATTEND[n] 보상 (날이 갈수록 커짐) ---------- */

function openAttend() {
  sound.get();
  sound.sfx('tap');
  renderAttend();
  $('#attendDlg').showModal();
}
function renderAttend() {
  const s = state.save, n = attendOf(s), can = s.daily !== today(), kst = new Date(Date.now() + 9 * 3600e3);
  const days = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + 1, 0)).getUTCDate(); // 이번 달 날짜 수
  $('#attendHead').textContent = `📅 ${kst.getUTCMonth() + 1}월 출석부`;
  $('#attendSum').innerHTML = `이번 달 <b>${n}일</b> 출석 · 출석할수록 보상이 커져요 (7 · 14 · 21 · 28일째 특별 보상)`;
  $('#attendGrid').innerHTML = ATTEND.slice(0, days).map((r, i) => `<li class="${i < n ? 'got' : ''}${can && i === n ? ' next' : ''}${(i + 1) % 7 ? '' : ' big'}">
    <small>${i + 1}일</small><span class="reward">${reward(r)}</span>${i < n ? '<i>✔</i>' : ''}</li>`).join('');
  $('#attendGo').disabled = !can;
  $('#attendGo').textContent = can ? `${n + 1}일째 출석하기!` : '오늘은 출석 완료! 내일 또 만나요';
}
async function claimDaily() {
  if (state.save.daily === today()) return toast('오늘 출석 보상은 이미 받았어요');
  try {
    const r = await doAct({ type: 'daily' });
    sound.sfx('coin');
    if (r.day % 7 === 0) confetti();
    toast(`출석 ${r.day}일째! ${rewardText(r)} 받았어요`);
    renderAttend();
    refresh();
  } catch (e) {
    toast(e.message);
  }
}
$('#dailyCard').onclick = openAttend;
$('#attendGo').onclick = claimDaily;

/* ---------- 공지사항: 버전 · 날짜별 업데이트 내역 (관리자 페이지에서 쓰고 고친다) ---------- */

let notices = [];
const dateText = (t) => new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
async function loadNotices() {
  try {
    notices = await api('notices');
  } catch {
    return;
  }
  $('#noticeDot').hidden = !notices.some((n) => n.id > load('noticeRead', 0));
}
async function openNotices() {
  sound.get();
  sound.sfx('tap');
  $('#noticeDlg').showModal();
  await loadNotices();
  $('#noticeList').innerHTML = notices.map((n, i) => `<li><details${i ? '' : ' open'}>
    <summary>${n.version ? `<span class="ver">v${esc(n.version.replace(/^v/i, ''))}</span>` : ''}<b>${esc(n.title)}</b>
      <small>${dateText(n.created_at)}${n.updated_at ? ' · 수정됨' : ''}</small></summary>
    <p>${esc(n.body).replace(/\n/g, '<br>')}</p></details></li>`).join('') || '<li class="empty">아직 공지가 없어요</li>';
  store('noticeRead', Math.max(0, ...notices.map((n) => n.id)));
  $('#noticeDot').hidden = true;
}
$('#noticeBtn').onclick = openNotices;
loadNotices();

// 사이트 맨 아래 버전 표시
$$('.ver-label').forEach((el) => (el.textContent = `v${VERSION}`));

// 카카오 애드핏 광고: 홈 화면 아래 (넓은 PC 728×90 · 그 밖 320×100). 홈을 처음 열 때 한 번만, 개발 중(localhost)에는 안 불러온다
function ads() {
  if (ads.done || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  ads.done = true;
  const pc = matchMedia('(min-width: 1000px) and (orientation: landscape)').matches, box = $('#adBox');
  const ins = Object.assign(document.createElement('ins'), { className: 'kakao_ad_area' });
  ins.style.display = 'none';
  Object.assign(ins.dataset, pc ? { adUnit: 'DAN-2HV4yA6yyWWPjIWw', adWidth: '728', adHeight: '90' } : { adUnit: 'DAN-0iMK3n51EpQ56lQb', adWidth: '320', adHeight: '100' });
  box.classList.add(pc ? 'pc' : 'mo');
  box.hidden = false;
  $('#app').classList.add('ad-on'); // 홈 캐릭터가 광고 위로 올라가게
  box.append(ins);
  document.body.append(Object.assign(document.createElement('script'), { src: '//t1.kakaocdn.net/kas/static/ba.min.js', async: true }));
}
// 게임이 끝날 때마다(결과 화면 · 멀티 판 결과) PC 좌우에 카카오 애드핏 160×600 두 개.
// 같은 광고를 1분 안에 다시 불러오지는 않는다 (새로고침 남용으로 보이지 않게). 화면이 좁으면 안 띄운다
const SIDE_ADS = [['sideAdL', 'DAN-CljST72EjffNfde5'], ['sideAdR', 'DAN-giN5molNucr1MH3G']];
function sideAds() {
  const wrap = $('#sideAds'), done = current === 'result' || (current === 'room' && mp.room?.status === 'done');
  const room = current === 'room' ? 1560 : 1180, pc = matchMedia(`(hover: hover) and (pointer: fine) and (min-width: ${room}px) and (min-height: 640px)`).matches;
  wrap.hidden = !(done && pc);
  if (wrap.hidden || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  if (Date.now() - (sideAds.at ?? 0) < 60000 && $('#sideAdL').childElementCount) return;
  sideAds.at = Date.now();
  for (const [id, unit] of SIDE_ADS) {
    const ins = Object.assign(document.createElement('ins'), { className: 'kakao_ad_area' });
    ins.style.display = 'none';
    Object.assign(ins.dataset, { adUnit: unit, adWidth: '160', adHeight: '600' });
    $(`#${id}`).replaceChildren(ins);
  }
  // 애드핏 스크립트를 다시 붙이면 새로 넣은 광고 칸을 찾아 채운다
  document.querySelector('script[data-side-ads]')?.remove();
  const sc = Object.assign(document.createElement('script'), { src: '//t1.kakaocdn.net/kas/static/ba.min.js', async: true });
  sc.dataset.sideAds = '1';
  document.body.append(sc);
}
addEventListener('resize', () => !$('#sideAds').hidden !== (current === 'result') && sideAds());

$('#missionCard').onclick = () => {
  state.questTab = 'today';
  sound.sfx('tap');
  show('quests');
};
// 연주하기: 싱글 · 멀티 고르기
$('#playBtn').onclick = () => {
  sound.get();
  sound.sfx('tap');
  $('#modeDlg').showModal();
};
$('#rankCard').onclick = () => (state.rankMode = 'total'); // 이어서 data-go가 랭킹 화면을 연다

const trio = $('.trio'), bubble = $('.bubble');
trio.addEventListener('click', () => {
  if (current !== 'home') return;
  sound.get();
  trio.classList.remove('jump');
  void trio.offsetWidth;
  trio.classList.add('jump');
  speak(['hachiware', 'chiikawa', 'usagi'][Math.floor(Math.random() * 3)], bubble);
});
trio.addEventListener('animationend', (e) => e.animationName === 'jump' && trio.classList.remove('jump'));

/* ---------- 곡 선택 ---------- */

const bestOf = (s, song) => DIFFS.map((d) => [d, s.best[`${song.id}:${d}`]]).filter(([, b]) => b).at(-1);
const jacketTo = (img, song) => {
  img.src = jacket(song);
  img.classList.toggle('jc', Boolean(song.jc));
  img.style.setProperty('--jc', song.jc ?? 'transparent');
};

RENDER.songs = () => {
  // 검색어에 맞는 곡 → 장르 탭 숫자도 검색 결과 기준
  const s = state.save, found = SONGS.filter((x) => songMatch(x, state.q)), list = found.filter((x) => state.genre === 'all' || x.genre === state.genre);
  $('#genreTabs').innerHTML = [['all', '전체'], ...Object.entries(GENRES)].map(([k, name]) =>
    `<button type="button" role="tab" data-genre="${k}" aria-pressed="${state.genre === k}">${name}<i>${k === 'all' ? found.length : found.filter((x) => x.genre === k).length}</i></button>`).join('');
  $('#songCount').textContent = state.q ? `${list.length}곡 찾음` : `${list.length}곡`;
  if (!list.length) {
    $('#songList').innerHTML = `<p class="empty">${state.q ? `'${esc(state.q)}'에 맞는 곡이 없어요` : '이 장르에는 곡이 없어요'}</p>`;
    return;
  }
  $('#songList').innerHTML = list.map((song) => {
    const open = unlocked(s, song), best = bestOf(s, song);
    // 잠긴 곡의 자물쇠 · 가격은 자켓 위에 (난이도 칩 8개가 한 줄을 다 쓰도록)
    return `<button class="song${open ? '' : ' locked'}" data-id="${song.id}">
      <span class="jk"><img src="${jacket(song)}" alt="" loading="lazy"${song.jc ? ` class="jc" style="--jc:${song.jc}"` : ''}>
        ${open ? '' : `<span class="lockp">${icon('lock')}${icon('coin')}${fmt(song.price)}</span>`}</span>
      <span class="info"><span class="t">${esc(song.title)}</span><span class="m">${esc(song.composer)} · ${fmtTime(DUR[song.id])}${best
        ? ` · <b class="bestline">${DIFF_NAME[best[0]]} ${best[1].rank} ${fmt(best[1].score)}</b>` : ''}</span></span>
    </button>`;
  }).join('');
};
$('#genreTabs').onclick = (e) => {
  const b = e.target.closest('[data-genre]');
  if (!b) return;
  sound.sfx('tap');
  state.genre = b.dataset.genre;
  RENDER.songs();
};
$('#songSearch').oninput = (e) => {
  state.q = e.target.value.trim();
  RENDER.songs();
};
$('#songList').onclick = (e) => {
  const b = e.target.closest('.song');
  if (!b) return;
  sound.get();
  sound.sfx('tap');
  openSong(b.dataset.id);
};

function openSong(id) {
  state.song = SONG[id];
  state.boosters.clear();
  renderSongDlg();
  $('#songDlg').showModal();
  if (settings.music) {
    sound.bgmSong = id;
    sound.bgm(state.song); // 미리듣기
  }
}

function renderSongDlg() {
  const song = state.song, s = state.save, open = unlocked(s, song), best = s.best[`${song.id}:${state.diff}`];
  jacketTo($('#sdJacket'), song);
  $('#sdTitle').textContent = song.title;
  $('#sdMeta').textContent = `${song.composer} · ${fmtTime(DUR[song.id])}`;
  $('#sdBest').textContent = best ? `내 최고 ${fmt(best.score)} · ${best.rank}` : '아직 기록이 없어요';
  $('#sdDiff').innerHTML = DIFFS.map((d) => `<button type="button" role="radio" class="d-${d}" data-diff="${d}" aria-checked="${d === state.diff}">
    <span>${DIFF_NAME[d]}</span><b>${chartLevel(song, d)}</b>${s.best[`${song.id}:${d}`] ? `<small>${s.best[`${song.id}:${d}`].rank}</small>` : ''}</button>`).join('');
  $('#sdBuffs').innerHTML = buffChips(teamBuffs(s, [...state.boosters]));
  $('#sdBoosters').innerHTML = Object.entries(BOOSTERS).map(([k, x]) => {
    const n = s.items[k] ?? 0;
    return `<button type="button" class="boost" data-k="${k}" aria-pressed="${state.boosters.has(k)}" ${n ? '' : 'disabled'}>
      <span class="ic">${x.icon}</span>${esc(x.name)}<small>${n}개</small></button>`;
  }).join('');
  $('#sdStart').innerHTML = open ? `${DIFF_NAME[state.diff]} 시작!` : `${icon('lock')}${icon('coin')}${fmt(song.price)} 열기`;
  $('#sdStart').disabled = !open && s.coins < song.price;
  loadSongRank();
}

// 곡 창 왼쪽(모바일은 난이도 아래) 랭킹. 30초 동안은 다시 안 불러온다
const rankCache = new Map();
async function getRank(song, diff, period = 'all') {
  const k = `${song}:${diff}:${period}`, hit = rankCache.get(k);
  if (hit && Date.now() - hit.at < 30000) return hit.data;
  const data = await api(`rank?song=${song}&diff=${diff}&period=${period}`);
  rankCache.set(k, { at: Date.now(), data });
  return data;
}

// 순위 한 줄: 순위 · 프로필 · 닉네임(+ 최대 콤보 또는 기록한 곡 수) · 점수 · 랭크
const rankRow = (r, i) => `<li class="${r.username === state.me?.username ? 'me' : ''}" data-n="${i + 1}" data-user="${esc(r.username)}">${framed(r.avatar, r.frame ?? 0, 'sm')}
  <span class="who"><span class="nm">${esc(r.username)}</span><small>${r.lv ? `Lv.${fmt(r.lv)} · ` : ''}${r.songs ? `${fmt(r.songs)}곡 기록` : r.combo ? `최대 ${fmt(r.combo)}콤보` : ''}</small></span>
  <span class="sc">${fmt(r.score)}</span>${r.rank ? `<span class="rk" data-r="${esc(r.rank)}">${esc(r.rank)}</span>` : ''}</li>`;

async function loadSongRank() {
  const song = state.song.id, diff = state.diff, want = `${song}:${diff}`, list = $('#sdRankList');
  $('#sdRankDiff').textContent = DIFF_NAME[diff];
  list.innerHTML = '<li class="empty">불러오는 중…</li>';
  try {
    const r = await getRank(song, diff);
    if (want !== `${state.song?.id}:${state.diff}`) return;
    $('#sdMe').innerHTML = r.me
      ? `<b>${fmt(r.me.pos)}위</b><span>/ ${fmt(r.total)}명</span><em>${fmt(r.me.score)}점</em>`
      : state.me ? `<span>아직 기록 없음 · 지금 ${fmt(r.total)}명이 경쟁 중!</span>` : '<span>로그인하면 내 순위가 나와요</span>';
    list.innerHTML = r.top.length ? r.top.slice(0, 10).map((x, i) => rankRow(x, i)).join('') : '<li class="empty">아직 아무도 없어요. 첫 1등이 되어 보세요!</li>';
  } catch (err) {
    if (want === `${state.song?.id}:${state.diff}`) list.innerHTML = `<li class="empty">${esc(err.message)}</li>`;
  }
}

$('#sdDiff').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.sfx('tap');
  state.diff = b.dataset.diff;
  renderSongDlg();
};
$('#sdBoosters').onclick = (e) => {
  const b = e.target.closest('.boost');
  if (!b || b.disabled) return;
  sound.sfx('tap');
  state.boosters.has(b.dataset.k) ? state.boosters.delete(b.dataset.k) : state.boosters.add(b.dataset.k);
  renderSongDlg();
};
$('#sdStart').onclick = async () => {
  const song = state.song;
  if (unlocked(state.save, song)) return startGame();
  try {
    await doAct({ type: 'buy', item: `song:${song.id}` });
    sound.sfx('coin');
    toast(`'${song.title}' 악보를 열었어요!`);
    renderSongDlg();
    refresh();
  } catch (e) {
    toast(e.message);
  }
};
$('#songDlg').addEventListener('close', () => {
  if (current === 'game') return;
  sound.bgmSong = null;
  music();
});

/* ---------- 팀: 칸을 누르고 고르기 + 카드를 꾹 눌러 끌어다 놓기 ---------- */

async function setTeam(team) {
  try {
    await doAct({ type: 'team', team });
  } catch (e) {
    toast(e.message);
  }
  state.slot = -1;
  RENDER.team();
}

const rbadge = (r) => `<span class="rbadge r${r}">${RARITY[r].name}</span>`;

RENDER.team = () => {
  const s = state.save, b = teamBuffs(s);
  $('#teamPower').textContent = fmt(teamPower(s));
  $('#slots').innerHTML = s.team.map((id, i) => {
    const key = `<span class="key">${esc(keyLabel(settings.keys[i]))}</span>`;
    if (!id) return `<button class="slot" data-i="${i}" aria-pressed="${state.slot === i}">${key}<span class="plus">+</span><span class="nm">비어 있음</span></button>`;
    const c = CHAR[id];
    return `<button class="slot filled ${rcls(id)}" data-i="${i}" data-id="${id}" style="--c:${c.color}" aria-pressed="${state.slot === i}">${key}
      <img src="${face(id)}" alt="" draggable="false">${c.badge ? `<span class="bdg">${c.badge}</span>` : ''}<span class="nm">${esc(c.name)}</span>
      <span class="pw">⚡${fmt(powerOf(s, id))}</span></button>`;
  }).join('');
  $('#teamBuffs').innerHTML = `<h3>팀 버프</h3><div class="chips">${buffChips(b)}</div><h3>시너지 <small>누르면 그 조합으로 자동 편성</small></h3>
    <ul class="syn-list">${SYNERGIES.map((x) => `<li><button type="button" class="${b.synergies.includes(x) ? 'on' : ''}" data-syn="${x.id}">
      <span class="fs">${x.chars.map((id) => `<img src="${face(id)}" class="${s.chars[id] ? 'have' : ''}" alt="">`).join('')}</span>
      <span>${esc(x.name)} · ${BUFFS[x.buff](x.value)}</span></button></li>`).join('')}</ul>`;
  $$('#rarityTabs button').forEach((t) => t.setAttribute('aria-pressed', +t.dataset.r === state.rarity));
  const by = {
    power: (x, y) => powerOf(s, y.id) - powerOf(s, x.id) || y.rarity - x.rarity,
    rarity: (x, y) => y.rarity - x.rarity || powerOf(s, y.id) - powerOf(s, x.id),
    stage: (x, y) => (s.chars[y.id] ?? 0) - (s.chars[x.id] ?? 0) || y.rarity - x.rarity,
    name: (x, y) => x.name.localeCompare(y.name, 'ko'),
  }[state.sort] ?? (() => 0);
  const list = CHARS.filter((c) => (state.rarity === -1 ? s.chars[c.id] : c.rarity === state.rarity))
    .sort((x, y) => (s.chars[y.id] ? 1 : 0) - (s.chars[x.id] ? 1 : 0) || by(x, y));
  $('#rosterSort').value = state.sort;
  $('#rosterCount').textContent = `${Object.keys(s.chars).filter((id) => CHAR[id]).length} / ${CHARS.length}명`;
  const ready = Object.keys(s.chars).filter((id) => canLevel(s, id));
  $('#levelAll').hidden = !ready.length;
  $('#levelAll').innerHTML = `⬆ 모두 레벨 업 <small>${ready.length}명</small>`;
  $('#roster').innerHTML = list.map((c) => {
    const L = s.chars[c.id], dup = s.dup[c.id] ?? 0, need = L ? copiesFor(c.rarity, L) : 0, up = L && canLevel(s, c.id);
    // 카드 수 막대: 지금 레벨에서 다음 레벨까지 모은 카드 (최고 레벨이면 MAX)
    const bar = L ? (L >= MAX_LEVEL ? '<span class="cbar max"><i style="width:100%"></i><b>MAX</b></span>'
      : `<span class="cbar${dup >= need ? ' full' : ''}"><i style="width:${Math.min(100, (dup / need) * 100)}%"></i><b>${dup}/${need}</b></span>`) : '';
    return `<button class="ccard ${rcls(c.id)}${L ? '' : ' locked'}${up ? ' can-up' : ''}" data-id="${c.id}">
      ${cardImg(c.id)}${rbadge(c.rarity)}${s.team.includes(c.id) ? '<span class="inteam">팀</span>' : ''}${c.badge && L ? `<span class="bdg">${c.badge}</span>` : ''}
      ${up ? '<span class="upmark">UP!</span>' : ''}<span class="nm">${L ? esc(c.name) : '???'}</span>
      <span class="meta">${L ? `<span class="stg">Lv.${L}</span><span class="pw">⚡${fmt(powerOf(s, c.id))}</span>` : '<span class="stg">미획득</span>'}</span>${bar}</button>`;
  }).join('');
};
$('#levelAll').onclick = async () => {
  try {
    const r = await doAct({ type: 'levelUpAll' });
    sound.sfx('epic', 0.12);
    confetti();
    toast(`${fmt(r.count)}번 레벨 업! (코인 ${fmt(r.coins)}개 사용)`);
  } catch (e) {
    toast(e.message);
  }
  refresh();
};

let justDragged = false;
$('#slots').onclick = (e) => {
  const b = e.target.closest('.slot');
  if (!b || justDragged) return;
  sound.sfx('tap');
  const i = +b.dataset.i, team = [...state.save.team];
  if (state.slot === i && team[i]) {
    team[i] = null; // 고른 칸을 한 번 더 누르면 빼기
    return setTeam(team);
  }
  state.slot = state.slot === i ? -1 : i;
  if (state.slot >= 0) {
    toast(team[i] ? '바꿀 친구를 고르세요 (한 번 더 누르면 빼요)' : '넣을 친구를 고르세요');
    if (team[i]) speak(team[i]);
  }
  RENDER.team();
};
$('#rosterSort').onchange = (e) => {
  state.sort = e.target.value;
  store('teamSort', state.sort);
  sound.sfx('tap');
  RENDER.team();
};
$('#rarityTabs').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.sfx('tap');
  state.rarity = +b.dataset.r;
  RENDER.team();
};
$('#roster').onclick = (e) => {
  const b = e.target.closest('.ccard');
  if (!b || justDragged) return;
  sound.sfx('tap');
  const id = b.dataset.id;
  if (state.slot >= 0 && state.save.chars[id]) {
    const team = state.save.team.map((x) => (x === id ? null : x)); // 이미 다른 칸에 있으면 옮기기
    team[state.slot] = id;
    speak(id);
    return setTeam(team);
  }
  openChar(id);
};
$('#teamBuffs').onclick = (e) => {
  const b = e.target.closest('[data-syn]');
  if (!b) return;
  const x = SYNERGIES.find((y) => y.id === b.dataset.syn), s = state.save, missing = x.chars.filter((id) => !s.chars[id]);
  if (missing.length) return toast(`아직 없는 친구: ${missing.map((id) => CHAR[id].name).join(', ')}`);
  sound.sfx('ok');
  setTeam(bestTeam(s, x.chars));
  toast(`${x.name} 조합으로 편성했어요!`);
};
$('#autoTeam').onclick = () => {
  const s = state.save, team = bestTeam(s);
  sound.sfx('ok');
  toast(`팀 점수가 가장 높은 조합 (${fmt(teamPower(s, team))}점)`);
  setTeam(team);
};

// 끌어서 장착: 마우스는 조금 움직이면 바로, 터치는 꾹 누르고 있으면 시작 (그냥 쓸어 넘기면 스크롤)
let drag = null;
function dragDown(e, id, from) {
  if (e.button > 0) return;
  drag = { id, from, x: e.clientX, y: e.clientY, pid: e.pointerId, live: false, el: null };
  if (e.pointerType !== 'mouse') drag.timer = setTimeout(() => drag && !drag.live && dragBegin(), 230);
}
function dragBegin() {
  drag.live = true;
  const g = document.createElement('img');
  g.src = face(drag.id);
  g.className = 'drag-ghost';
  g.alt = '';
  document.body.append(g);
  drag.el = g;
  dragMove(drag.x, drag.y);
  $('#slots').classList.add('dropping');
  navigator.vibrate?.(12);
  sound.sfx('flip', 0.08);
}
function dragMove(x, y) {
  drag.el.style.translate = `${x - 34}px ${y - 34}px`;
  const over = document.elementFromPoint(x, y)?.closest('.slot');
  $$('#slots .slot').forEach((s) => s.classList.toggle('over', s === over));
}
function dragEnd() {
  if (!drag) return;
  clearTimeout(drag.timer);
  drag.el?.remove();
  $('#slots').classList.remove('dropping');
  $$('#slots .slot').forEach((s) => s.classList.remove('over'));
  drag = null;
}
function dragDrop(x, y) {
  const slot = document.elementFromPoint(x, y)?.closest('.slot'), team = [...state.save.team];
  justDragged = true;
  setTimeout(() => (justDragged = false), 80);
  if (slot) {
    const i = +slot.dataset.i;
    if (drag.from === 'roster') {
      const was = team.indexOf(drag.id);
      if (was >= 0) team[was] = team[i];
      team[i] = drag.id;
    } else [team[drag.from], team[i]] = [team[i], team[drag.from]];
    speak(drag.id);
  } else if (drag.from !== 'roster') team[drag.from] = null; // 칸에서 꺼내 밖에 놓으면 빼기
  else return;
  sound.sfx('ok');
  setTeam(team);
}
$('#roster').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.ccard');
  if (b && state.save.chars[b.dataset.id]) dragDown(e, b.dataset.id, 'roster');
});
$('#slots').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.slot.filled');
  if (b) dragDown(e, b.dataset.id, +b.dataset.i);
});
addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (drag.live) return dragMove(e.clientX, e.clientY);
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) e.pointerType === 'mouse' ? dragBegin() : dragEnd();
});
addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (drag.live) dragDrop(e.clientX, e.clientY);
  dragEnd();
});
addEventListener('pointercancel', dragEnd);
addEventListener('touchmove', (e) => drag?.live && e.preventDefault(), { passive: false }); // 끄는 동안 화면이 같이 스크롤되지 않게
$('#team').addEventListener('contextmenu', (e) => e.preventDefault()); // 꾹 누를 때 이미지 메뉴가 뜨지 않게

/* ---------- 캐릭터 상세 · 레벨 업 (같은 친구 카드 + 코인, 최대 20레벨) ---------- */

let cdId = null;

function openChar(id) {
  cdId = id;
  renderChar();
  $('#charDlg').showModal();
  if (state.save.chars[id]) speak(id, $('#cdLine'));
}

function renderChar() {
  const id = cdId, c = CHAR[id], s = state.save, L = s.chars[id] ?? 0, inTeam = s.team.includes(id);
  const dup = s.dup[id] ?? 0, need = L && L < MAX_LEVEL ? copiesFor(c.rarity, L) : 0, cost = need ? coinsFor(c.rarity, L) : 0;
  $('#cdCard').className = `cd-card ${rcls(id)}${L ? '' : ' locked'}${L >= MAX_LEVEL ? ' maxed' : ''}`;
  $('#cdCard').innerHTML = `${cardImg(id)}${rbadge(c.rarity)}${c.badge ? `<span class="bdg">${c.badge}</span>` : ''}`;
  $('#cdName').textContent = L ? c.name : '아직 만나지 못한 친구';
  $('#cdSub').innerHTML = L
    ? `${RARITY[c.rarity].name} · <b>Lv.${L}</b>${L >= MAX_LEVEL ? ' (MAX)' : ''} · 카드 점수 <b>⚡${fmt(powerOf(s, id))}</b>`
    : `${RARITY[c.rarity].name} · 뽑기에서 만날 수 있어요${c.rarity === TOP ? ' (0.00000001%)' : ''}`;
  $('#cdLevel').innerHTML = !L ? '<p class="hint">뽑기에서 만나면 1레벨로 함께해요. 같은 친구를 또 만나면 레벨 업 카드가 쌓여요</p>'
    : L >= MAX_LEVEL ? `<p class="lv-max">🏆 최고 레벨 달성!${dup ? ` 남은 카드 ${dup}장` : ''}</p>`
    : `<div class="lv-up">
        <div class="lv-bar"><span class="cbar${dup >= need ? ' full' : ''}"><i style="width:${Math.min(100, (dup / need) * 100)}%"></i><b>카드 ${dup} / ${need}장</b></span>
          <small class="lv-cost">${icon('coin')}${fmt(cost)}</small></div>
        <p class="lv-next">Lv.${L} → <b>Lv.${L + 1}</b> · ${esc(BUFFS[c.buff](valueAt(c, L)))} → <b>${esc(BUFFS[c.buff](valueAt(c, L + 1)))}</b></p>
        <button type="button" class="btn pink" id="cdUp" ${canLevel(s, id) ? '' : 'disabled'}>⬆ 레벨 업${dup < need ? ` <small>(카드 ${need - dup}장 더)</small>` : s.coins < cost ? ' <small>(코인 부족)</small>' : ''}</button>
      </div>`;
  $('#cdStages').innerHTML = Array.from({ length: MAX_LEVEL }, (_, i) => `<li class="${i + 1 === L ? 'on' : i + 1 < L ? 'got' : ''}">
    <span>Lv.${i + 1}</span><span>${esc(BUFFS[c.buff](valueAt(c, i + 1)))}</span></li>`).join('');
  const btn = $('#cdTeam');
  btn.disabled = !L;
  btn.textContent = !L ? '아직 없는 친구예요' : inTeam ? '팀에서 빼기' : '팀에 넣기';
}

// 레벨 업: 카드가 빛나며 올라가는 연출
$('#cdLevel').onclick = async (e) => {
  if (!e.target.closest('#cdUp:not(:disabled)')) return;
  const id = cdId;
  try {
    const r = await doAct({ type: 'levelUp', id });
    $('#efCard').className = `ef-card ${rcls(id)}`;
    $('#efCard').innerHTML = cardImg(id);
    $('#efMsg').innerHTML = `⬆ 레벨 업! <b>${esc(CHAR[id].name)} Lv.${r.level}</b><small>눌러서 닫기</small>`;
    $('#evoDlg').className = 'evo-fx ok';
    $('#evoDlg').showModal();
    sound.sfx('epic', 0.12);
    if (r.level % 5 === 0 || r.level === MAX_LEVEL) confetti();
    speak(id);
  } catch (err) {
    toast(err.message);
  }
  renderChar();
  refresh();
};
$('#evoDlg').onclick = () => $('#evoDlg').close();

$('#cdTeam').onclick = async () => {
  const id = cdId, team = [...state.save.team], inTeam = team.includes(id);
  if (inTeam) team[team.indexOf(id)] = null;
  else if (team.includes(null)) team[team.indexOf(null)] = id;
  else return openSwap(id);
  $('#charDlg').close();
  sound.sfx('ok');
  await setTeam(team);
};

// 팀이 꽉 찼을 때: 누구랑 바꿀지 고르기 (바꾸면 팀 점수가 어떻게 되는지 같이 보여 준다)
function openSwap(id) {
  const s = state.save, now = teamPower(s);
  sound.sfx('tap');
  $('#swapTitle').innerHTML = `<b>${esc(CHAR[id].name)}</b>와(과) 바꿀 친구를 골라 주세요`;
  $('#swapList').innerHTML = s.team.map((x, i) => {
    const after = teamPower(s, s.team.map((y, j) => (j === i ? id : y))), d = after - now;
    return `<button type="button" class="ccard ${rcls(x)}" data-i="${i}">${cardImg(x)}${rbadge(CHAR[x].rarity)}<span class="nm">${esc(CHAR[x].name)}</span>
      <span class="meta"><span class="pw">⚡${fmt(powerOf(s, x))}</span></span><span class="delta ${d >= 0 ? 'up' : 'down'}">팀 ${d >= 0 ? '+' : ''}${fmt(d)}</span></button>`;
  }).join('');
  $('#swapDlg').showModal();
}
$('#swapList').onclick = async (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  const team = [...state.save.team], i = +b.dataset.i, out = team[i];
  team[i] = cdId;
  $('#swapDlg').close();
  $('#charDlg').close();
  sound.sfx('ok');
  speak(cdId);
  toast(`${CHAR[out].name} → ${CHAR[cdId].name} 교체!`);
  await setTeam(team);
};

/* ---------- 뽑기 ---------- */

const costText = (b, n) => (b.cost.coins ? `${icon('coin')}${fmt(b.cost.coins * n)}` : `${icon('gem')}${fmt(b.cost.gems * n)}`);
const canPay = (b, n) => (b.cost.coins ? state.save.coins >= b.cost.coins * n : state.save.gems >= b.cost.gems * n);
const left = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 1440 ? `${Math.floor(m / 1440)}일 ${Math.floor((m % 1440) / 60)}시간` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
};

const fan = (ids) => `<div class="art fan">${ids.map((id) => cardImg(id, CHAR[id].fx ? `fx-${CHAR[id].fx}` : '')).join('')}</div>`;
function bannerArt(b) {
  const pick = pickupOf();
  if (b.id === 'pickup') return `<div class="art one ${rcls(pick)}">${cardImg(pick)}<span class="pk">PICK UP</span></div>`;
  if (b.id === 'season') return fan(['wizard_hachiware', 'golden_usagi', 'galaxy_chiikawa', 'witch_usagi']);
  if (b.id === 'pajama') return `<div class="art faces">${['pajama_green', 'pajama_pink', 'pajama_purple', 'pajama_white'].map((id) => `<img src="${face(id)}" alt="">`).join('')}</div>`;
  if (b.id === 'band') return fan(['guitar_hachiware', 'drum_usagi', 'vocal_chiikawa', 'piano_rakko']);
  if (b.id === 'coin') return `<div class="art faces">${['momonga', 'kani', 'shisa', 'tiha'].map((id) => `<img src="${face(id)}" alt="">`).join('')}</div>`;
  return `<div class="banner-art"><img src="assets/trio.webp" alt="">${b.once ? '<span class="pk">한 번만!</span>' : ''}</div>`;
}
// 확률 글자: 0.01% 아래(초월 0.00000001%)는 0을 줄줄이 그대로
const pctText = (r) => (r * 100 >= 0.01 || !r ? `${+(r * 100).toFixed(2)}%` : `${(r * 100).toFixed(12).replace(/0+$/, '')}%`);

RENDER.gacha = () => {
  const s = state.save, list = BANNERS.filter((b) => !(b.once && s.rookie));
  if (!list.some((b) => b.id === state.banner)) state.banner = 'std';
  const b = bannerOf(state.banner, state.cfg);
  $('#bannerTabs').innerHTML = list.map((x) => `<button type="button" role="tab" data-b="${x.id}" aria-selected="${x.id === b.id}"><span>${x.icon}</span>${esc(x.name)}</button>`).join('');
  const pick = CHAR[pickupOf()];
  $('#bannerView').className = `banner b-${b.id}`;
  $('#bannerView').innerHTML = `${bannerArt(b)}<h2>${esc(b.name)}</h2><p>${b.id === 'pickup' ? `이번 주 픽업: <b>${esc(pick.name)}</b> · ` : ''}${esc(b.desc)}</p>
    <div class="rates">${b.rates.map((r, i) => (r ? `<span class="r${i + 1}">${RARITY[i + 1].name} ${pctText(r)}</span>` : '')).join('')}</div>
    <p class="pity">${b.pity ? `전설 이상 확정까지 ${b.pity - (s.pity[b.id] ?? 0)}회` : '천장 없음'}${b.id === 'pickup' ? ` · <span id="pickupLeft">${left(pickupEnds() - Date.now())}</span> 남음` : ''}</p>`;
  $('#pull1').hidden = Boolean(b.once);
  $('#pullUntil').hidden = Boolean(b.once);
  $('#pull1 small').innerHTML = costText(b, 1);
  $('#pull10 small').innerHTML = costText(b, 10);
  $('#pull1').disabled = !canPay(b, 1);
  $('#pull10').disabled = !canPay(b, 10);
  $('#pullUntil').disabled = !canPay(b, 1);
  $('#gachaInfo').innerHTML = [
    `10회 뽑기는 <b>${RARITY[b.ten].name} 이상 1명 확정</b>`,
    '<b>🎯 등급 확정 뽑기</b>: 고른 등급 이상이 나올 때까지 한 장씩 자동으로 뽑아요',
    '같은 친구가 또 나오면 <b>레벨 업 카드 +1</b> · 카드가 모이면 팀 화면에서 <b>레벨 업</b> (최대 20레벨)',
    '20레벨까지 쓸 카드가 다 모인 친구가 또 나오면 보석으로 돌려받아요',
    '<b>🪐 초월</b>: 0.00000001%의 확률로 나오는 말도 안 되게 센 친구 2명 (보석 뽑기 전부)',
    '카드는 직접 눌러야 뒤집혀요. 반짝이는 카드는 등급이 높아요!',
  ].map((t) => `<li>${t}</li>`).join('');
  clearInterval(RENDER.gacha.t);
  if (b.id === 'pickup') RENDER.gacha.t = setInterval(() => $('#pickupLeft') && ($('#pickupLeft').textContent = left(pickupEnds() - Date.now())), 30000);
};
LEAVE.gacha = () => clearInterval(RENDER.gacha.t);

$('#bannerTabs').onclick = (e) => {
  const b = e.target.closest('[data-b]');
  if (!b) return;
  sound.sfx('tap');
  state.banner = b.dataset.b;
  RENDER.gacha();
};

async function pull(count) {
  sound.get();
  const btns = [$('#pull1'), $('#pull10')];
  btns.forEach((b) => (b.disabled = true));
  try {
    const { cards } = await doAct({ type: 'pull', banner: state.banner, count });
    reveal(cards);
    renderTop();
  } catch (e) {
    toast(e.message);
    RENDER.gacha();
  }
}
$('#pull1').onclick = () => pull(1);
$('#pull10').onclick = () => pull(10);

/* 등급 확정 뽑기: 고른 등급 이상이 나올 때까지 1장씩 (최대 횟수 · 재화가 떨어지면 멈춤) */
let untilWant = 4;
const atLeast = (b, r) => b.rates.slice(r - 1).reduce((a, x) => a + x, 0);
function openUntil() {
  const b = bannerOf(state.banner, state.cfg), grades = [2, 3, 4, 5, 6].filter((r) => atLeast(b, r) > 0);
  if (!grades.includes(untilWant)) untilWant = grades.includes(4) ? 4 : grades.at(-1);
  sound.sfx('tap');
  $('#untilSetup').hidden = false;
  $('#untilResult').hidden = true;
  $('#untilBanner').textContent = `${b.icon} ${b.name}`;
  $('#untilGrade').innerHTML = grades.map((r) => `<button type="button" class="r${r}" data-r="${r}" aria-pressed="${r === untilWant}">
    <b>${RARITY[r].name} 이상</b><small>1장에 ${pctText(atLeast(b, r))}</small></button>`).join('');
  renderUntilCost();
  $('#untilDlg').showModal();
}
function renderUntilCost() {
  const b = bannerOf(state.banner, state.cfg), max = +$('#untilMax').value, s = state.save;
  const can = Math.floor(b.cost.coins ? s.coins / b.cost.coins : s.gems / b.cost.gems), p = atLeast(b, untilWant);
  $$('#untilGrade button').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.r === untilWant));
  $('#untilCost').innerHTML = `1장 ${costText(b, 1)} · 최대 ${fmt(max)}장이면 ${costText(b, max)}<br>
    <small>평균 약 ${fmt(Math.ceil(1 / p))}장에 한 번 나와요 · 지금 가진 걸로 ${fmt(Math.min(can, max))}장까지 뽑을 수 있어요</small>`;
  $('#untilGo').disabled = can < 1;
}
$('#pullUntil').onclick = openUntil;
$('#untilGrade').onclick = (e) => {
  const b = e.target.closest('[data-r]');
  if (!b) return;
  sound.sfx('tap');
  untilWant = +b.dataset.r;
  renderUntilCost();
};
$('#untilMax').onchange = renderUntilCost;
$('#untilGo').onclick = async () => {
  $('#untilGo').disabled = true;
  try {
    const r = await doAct({ type: 'pullUntil', banner: state.banner, rarity: untilWant, max: +$('#untilMax').value });
    showUntil(r);
    renderTop();
  } catch (e) {
    toast(e.message);
    renderUntilCost();
  }
};
function showUntil(r) {
  const hit = r.found ? r.cards.at(-1) : null, refund = r.cards.reduce((a, c) => a + c.refund, 0);
  const got = new Map();
  for (const c of r.cards) {
    const g = got.get(c.id) ?? { ...c, n: 0, isNew: false };
    got.set(c.id, { ...g, n: g.n + 1, isNew: g.isNew || c.isNew, level: c.level, dup: c.dup, need: c.need });
  }
  $('#untilSetup').hidden = true;
  $('#untilResult').hidden = false;
  $('#untilHead').innerHTML = hit
    ? `🎉 <b>${fmt(r.cards.length)}번</b> 만에 <span class="r${hit.rarity} rtxt">${RARITY[hit.rarity].name}</span> 등장!`
    : `${fmt(r.cards.length)}번 뽑았지만 아직 안 나왔어요… <small>${r.cards.length >= +$('#untilMax').value ? '최대 횟수까지 뽑았어요' : '재화가 떨어졌어요'}</small>`;
  $('#untilHit').innerHTML = hit ? `<div class="nc-card ${rcls(hit.id)}">${cardImg(hit.id)}${bdg(hit.id)}${rbadge(hit.rarity)}</div>
    <b>${esc(CHAR[hit.id].name)}</b>${hit.isNew ? '<span class="lbl">NEW!</span>' : hit.refund ? `<span class="lbl gem">+${hit.refund} 보석</span>` : `<span class="lbl up">카드 ${hit.dup}/${hit.need}</span>`}` : '';
  $('#untilSum').innerHTML = [1, 2, 3, 4, 5, 6].map((k) => [k, r.cards.filter((c) => c.rarity === k).length]).filter(([, n]) => n)
    .map(([k, n]) => `<span class="r${k}">${RARITY[k].name} ×${n}</span>`).join('') + (refund ? `<span class="gem">${icon('gem')}+${fmt(refund)}</span>` : '');
  $('#untilGrid').innerHTML = [...got.values()].sort((a, b) => b.rarity - a.rarity || b.n - a.n).map((c) => `<div class="ug ${rcls(c.id)}">
    <img src="${face(c.id)}" alt="">${c.n > 1 ? `<i>×${c.n}</i>` : ''}${c.isNew ? '<em>NEW</em>' : ''}<small>${esc(CHAR[c.id].name)}</small></div>`).join('');
  if (hit) {
    sound.sfx(hit.rarity >= 4 ? 'epic' : 'rare', 0.12);
    if (hit.rarity >= 4) confetti();
    speak(hit.id);
  } else sound.sfx('back', 0.1);
}
$('#untilOk').onclick = () => {
  $('#untilDlg').close();
  refresh();
};

let revealed = [];
function reveal(cards) {
  revealed = cards;
  const grid = $('#revealGrid'), top = Math.max(...cards.map((c) => c.rarity));
  grid.className = `reveal-grid${cards.length === 1 ? ' one' : ''}`;
  grid.innerHTML = cards.map((c, i) => {
    const lbl = c.refund ? `<span class="lbl gem">+${c.refund} 보석</span>` : c.isNew ? '<span class="lbl">NEW</span>' : `<span class="lbl up">+1 (${c.dup}/${c.need})</span>`;
    return `<button type="button" class="rcard ${rcls(c.id)}" data-i="${i}" aria-label="${i + 1}번 카드 뒤집기"><span class="in"><span class="face back"><span>♪</span></span>
      <span class="face front">${cardImg(c.id)}${bdg(c.id)}${rbadge(c.rarity)}${lbl}<span class="nm">${esc(CHAR[c.id].name)}</span></span></span></button>`;
  }).join('');
  $('#revealOk').disabled = true;
  $('#revealAll').hidden = false;
  $('#revealHint').textContent = top === 6 ? '🪐 우주가 흔들려요… 말도 안 돼…!!!' : top === 5 ? '🌈 무지갯빛 카드가 보여요…!!' : top === 4 ? '✨ 뭔가 반짝이는 카드가 있어요…!' : '카드를 눌러서 뒤집어 보세요!';
  $('#reveal').hidden = false;
  $('#reveal').classList.toggle('flash', top >= 4);
  $('#reveal').classList.toggle('myth', top === 5);
  $('#reveal').classList.toggle('god', top === 6);
  sound.sfx(top >= 3 ? 'rare' : 'flip', 0.08);
}

const newQueue = [];
function openCard(el, quiet) {
  if (!el || el.classList.contains('open') || $('#reveal').hidden) return;
  el.classList.add('open');
  const c = revealed[+el.dataset.i];
  if (!quiet) sound.sfx(c.rarity >= 4 ? 'epic' : c.rarity >= 3 ? 'rare' : 'flip', 0.1);
  if (c.isNew && c.rarity >= 3) newQueue.push(c);
  if (!quiet) showNew();
  if ($$('#revealGrid .rcard:not(.open)').length) return;
  $('#revealOk').disabled = false;
  $('#revealAll').hidden = true;
  $('#revealHint').textContent = '모두 열었어요!';
}

// 처음 만난 영웅 · 전설은 크게 보여 준다
function showNew() {
  if (!$('#newCard').hidden || !newQueue.length) return;
  const c = newQueue.shift(), ch = CHAR[c.id];
  $('#ncCard').className = `nc-card ${rcls(c.id)}`;
  $('#ncCard').innerHTML = cardImg(c.id) + bdg(c.id);
  $('#ncRarity').textContent = `${'★'.repeat(c.rarity)} ${RARITY[c.rarity].name}`;
  $('#ncRarity').style.color = RARITY[c.rarity].color;
  $('#ncName').textContent = ch.name;
  $('#ncLine').textContent = `“${speak(c.id)}”`;
  $('#newCard').hidden = false;
  if (c.rarity >= 4) confetti();
}
$('#newCard').onclick = () => {
  $('#newCard').hidden = true;
  showNew();
};

$('#revealGrid').onclick = (e) => openCard(e.target.closest('.rcard'));
$('#revealAll').onclick = () => {
  const rest = $$('#revealGrid .rcard:not(.open)');
  rest.forEach((el, i) => setTimeout(() => openCard(el, true), i * 110));
  setTimeout(() => {
    const best = Math.max(...revealed.map((c) => c.rarity));
    sound.sfx(best >= 4 ? 'epic' : best >= 3 ? 'rare' : 'flip', 0.1);
    showNew();
  }, rest.length * 110 + 80);
};
$('#revealOk').onclick = () => {
  $('#reveal').hidden = true;
  newQueue.length = 0;
  sound.sfx('ok');
  refresh();
};

/* ---------- 상점 ---------- */

const buyBtn = (id, price, gems, disabled) => `<button class="btn small butter price" data-buy="${id}" ${disabled ? 'disabled' : ''}>${icon(gems ? 'gem' : 'coin')}${fmt(price)}</button>`;

$('#shopTabs').onclick = (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  sound.sfx('tap');
  state.shopTab = b.dataset.tab;
  store('shopTab', state.shopTab);
  RENDER.shop();
};
RENDER.shop = () => {
  const s = state.save, tab = state.shopTab ??= load('shopTab', 'cards');
  $$('#shopTabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  $$('#shop .shop-pane').forEach((p) => (p.hidden = p.dataset.pane !== tab));
  $('#shopWallet').innerHTML = `${icon('coin')}${fmt(s.coins)} · ${icon('gem')}${fmt(s.gems)}`;
  // 환전 상품은 오늘 바꾼 횟수에 따라 가격 · 받는 양이 달라진다 (rules.js priceOf)
  const item = (i) => {
    const p = priceOf(s, i), gem = p.gems > 0, cost = gem ? p.gems : p.coins;
    const name = i.ex === 'coin' ? `코인 ${fmt(p.give.coins)}개` : i.name;
    let own = i.give.item ? `<span class="own">보유 ${s.items[i.give.item] ?? 0}개</span>` : i.ex ? `<span class="own${p.left ? '' : ' out'}">오늘 ${p.left}번 남음</span>` : '';
    const ic = i.give.item ? BOOSTERS[i.give.item].icon : i.give.lucky ? '🎲' : i.give.items ? '🎁' : icon(i.ex === 'coin' ? 'coin' : 'gem');
    if (i.give.lucky) own = `<span class="own${(dayOf(s).lucky ?? 0) < LUCKY.max ? '' : ' out'}">오늘 ${LUCKY.max - (dayOf(s).lucky ?? 0)}번 남음</span>`;
    return `<div class="item${i.ex ? ' ex' : ''}"><span class="ic">${ic}</span>
      <b>${esc(name)}</b><p>${esc(i.desc)}</p>${own}
      ${p.left > 0 ? buyBtn(i.id, cost, gem, gem ? s.gems < cost : s.coins < cost) : '<span class="btn small plain soldout">내일 다시</span>'}</div>`;
  };
  // 오늘의 카드 + 경험치 물약
  const d = dayOf(s), L = levelOf(s.exp), pn = d.potion ?? 0;
  $('#cardsLeft').textContent = `${left(86400e3 - ((Date.now() + 9 * 3600e3) % 86400e3))} 남음`;
  $('#shopCards').innerHTML = cardsOf().map((id) => {
    const c = CHAR[id], n = d.cards?.[id] ?? 0, price = cardPrice(id, n), have = s.chars[id];
    return `<div class="item card-item ${rcls(id)}"><span class="ic">${cardImg(id)}${rbadge(c.rarity)}</span>
      <b>${esc(c.name)}</b><p>${have ? `Lv.${have} · 레벨 업 카드 1장` : '✨ 새 친구로 데려오기'}</p><span class="own${n < CARD_SHOP.max ? '' : ' out'}">오늘 ${CARD_SHOP.max - n}장 남음</span>
      ${n < CARD_SHOP.max ? buyBtn(`card:${id}`, price, false, s.coins < price) : '<span class="btn small plain soldout">내일 다시</span>'}</div>`;
  }).join('');
  const potion = `<div class="item"><span class="ic">🧪</span><b>경험치 물약</b><p>경험치 +${POTION.exp} (레벨 업 보상도 받아요)</p>
    <span class="own${pn < POTION.max ? '' : ' out'}">오늘 ${POTION.max - pn}번 남음</span>
    ${pn < POTION.max && L < MAX_LV ? buyBtn('potion', POTION.coins(L, pn), false, s.coins < POTION.coins(L, pn)) : '<span class="btn small plain soldout">내일 다시</span>'}</div>`;
  $('#shopGems').innerHTML = SHOP.filter((i) => !i.give.item && !i.give.items && !i.give.lucky).map(item).join('');
  $('#shopSpecial').innerHTML = SHOP.filter((i) => i.give.items || i.give.lucky).map(item).join('') + potion;
  $('#shopBoost').innerHTML = SHOP.filter((i) => i.give.item).map(item).join('');
  $('#shopSongs').innerHTML = SONGS.filter((x) => x.price).map((x) => `<div class="item"><span class="ic"><img src="${jacket(x)}" alt=""${x.jc ? ` class="jc" style="--jc:${x.jc}"` : ''}></span>
    <b>${esc(x.title)}</b><p>${esc(x.composer)} · MASTER Lv.${chartLevel(x, 'master')}</p>
    ${unlocked(s, x) ? '<span class="own">보유 중</span>' : buyBtn(`song:${x.id}`, x.price, false, s.coins < x.price)}</div>`).join('');
  $('#shopAvatars').innerHTML = Array.from({ length: 32 - FREE_AVATARS }, (_, i) => i + FREE_AVATARS + 1).map((n) => `<div class="item">
    <img src="${avatar(n)}" alt="" loading="lazy">${ownedAvatar(s, n) ? '<span class="own">보유</span>' : buyBtn(`avatar:${n}`, AVATAR_PRICE, false, s.coins < AVATAR_PRICE)}</div>`).join('');
};

$('#shop').onclick = async (e) => {
  const b = e.target.closest('[data-buy]');
  if (!b || b.disabled) return;
  try {
    const r = await doAct({ type: 'buy', item: b.dataset.buy });
    sound.sfx('coin');
    if (r?.lucky) {
      const l = r.lucky, what = l.card ? `${CHAR[l.card].name} 레벨 업 카드!` : l.coins ? `코인 ${fmt(l.coins)}개` : l.gems ? `보석 ${fmt(l.gems)}개` : Object.keys(l.items).map((k) => BOOSTERS[k].name).join(' + ');
      if (l.coins >= 25000 || l.gems >= 400 || l.card) { sound.sfx('epic', 0.12); confetti(); }
      refresh();
      return toast(`🎲 ${what}`);
    }
    toast(r?.card ? `${CHAR[r.card].name} 카드를 샀어요! 팀 화면에서 레벨 업해 보세요` : r?.levelUp ? `🎉 Lv.${r.levelUp} 달성!` : '구매 완료!');
    refresh();
  } catch (err) {
    toast(err.message);
  }
};

/* ---------- 업적: 오늘의 보상(출석 · 접속 시간 · 미션) + 분류된 업적 ---------- */

RENDER.quests = () => {
  const s = state.save;
  if (s.online.date !== today()) hello().then(() => current === 'quests' && renderToday());
  $$('#questTabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === state.questTab));
  $('#todayPane').hidden = state.questTab !== 'today';
  $('#achPane').hidden = state.questTab !== 'ach';
  $('#achCount').textContent = `${fmt(achCount(s))}/${fmt(ACH_TOTAL)}`;
  state.questTab === 'today' ? renderToday() : renderAch();
  clearInterval(RENDER.quests.t);
  RENDER.quests.t = setInterval(() => state.questTab === 'today' && renderOnline(), 20000);
};
LEAVE.quests = () => clearInterval(RENDER.quests.t);

function renderToday() {
  const s = state.save, done = s.daily === today(), n = attendOf(s);
  $('#daily').innerHTML = `<span class="ic">📅</span><div><b>월간 출석부</b><small>이번 달 ${n}일 출석 · ${done ? '내일' : '오늘'} 보상 <span class="reward">${reward(ATTEND[Math.min(n, 30)])}</span></small></div>
    <button class="btn small ${done ? 'plain' : 'pink'}" id="dailyBtn">${done ? '출석부' : '출석하기'}</button>`;
  $('#dailyBtn').onclick = openAttend;
  renderOnline();
  const d = dayOf(s);
  $('#missionList').innerHTML = MISSIONS.map((m) => {
    const v = Math.min(m.stat(d), m.goal), got = d.claimed.includes(m.id), ready = !got && v >= m.goal;
    return `<li class="quest${got ? ' done' : ready ? ' ready' : ''}"><div><b>${esc(m.name)}</b>
      <span class="prog"><i style="width:${(v / m.goal) * 100}%"></i></span><small>${fmt(v)} / ${fmt(m.goal)}</small></div>
      <button class="btn small ${ready ? 'pink' : 'plain'}" data-mission="${m.id}" ${ready ? '' : 'disabled'}>${got ? '완료' : `<span class="reward">${reward(m.reward)}</span>`}</button></li>`;
  }).join('');
}

function renderOnline() {
  const s = state.save, on = s.online.date === today(), mins = on ? Math.floor((Date.now() - s.online.start) / 60000) : 0;
  // 막대 채우기: 단계가 같은 간격이니, 지금 있는 두 단계 사이에서 얼마나 왔는지로 나눠 계산
  const i = ONLINE.findIndex((o) => mins < o.min), prev = i > 0 ? ONLINE[i - 1].min : 0;
  const pct = i < 0 ? 100 : i === 0 ? 0 : ((i - 1 + (mins - prev) / (ONLINE[i].min - prev)) / (ONLINE.length - 1)) * 100;
  $('#online').innerHTML = `<div class="on-head"><b>⏰ 접속 시간 보상</b><small>오늘 접속 ${fmt(mins)}분째</small></div>
    <div class="on-track"><span class="prog"><i style="width:${pct}%"></i></span>
    ${ONLINE.map((o) => {
      const got = s.online.claimed.includes(o.id), ready = on && !got && mins >= o.min;
      return `<button type="button" class="on-step${got ? ' got' : ready ? ' ready' : ''}" data-online="${o.id}" ${ready ? '' : 'disabled'}>
        <span class="r">${got ? '✔' : reward(o.reward)}</span><small>${o.min}분</small></button>`;
    }).join('')}</div>`;
}

// 업적: 트랙(같은 기록을 쌓는 묶음)마다 지금 단계 하나씩 보여 준다 (단계를 받으면 다음 단계가 나온다). 곡별은 곡을 골라서
let achDone = false;
function renderAch() {
  const s = state.save, x = achCtx(s), views = ACH_TRACKS.map((t) => ({ t, ...achView(s, t, x) }));
  const readyN = (f) => views.reduce((a, v) => a + (v.ready && f(v) ? 1 : 0), 0);
  const cats = [['all', '전체'], ['ready', '받을 수 있음'], ...Object.entries(ACH_CATS)];
  $('#achCats').innerHTML = cats.map(([k, name]) => {
    const n = k === 'ready' ? readyN(() => true) : k === 'all' ? 0 : readyN((v) => v.t.cat === k);
    return `<button type="button" data-cat="${k}" aria-pressed="${state.achCat === k}">${name}${n ? `<i>${fmt(n)}</i>` : ''}</button>`;
  }).join('') + `<label class="hide-done"><input type="checkbox" id="hideDone" ${achDone ? 'checked' : ''}>다 받은 업적 숨기기</label>`;
  const sel = $('#achSong');
  sel.hidden = state.achCat !== 'song';
  if (!sel.hidden && !sel.options.length) sel.innerHTML = `<option value="">모든 곡</option>${songOptions(SONGS)}`;
  sel.value = state.achSong;
  let rows = views.filter((v) => state.achCat === 'all' || (state.achCat === 'ready' ? v.ready : v.t.cat === state.achCat));
  if (state.achCat === 'song' && state.achSong) rows = rows.filter((v) => v.t.song === state.achSong);
  if (achDone) rows = rows.filter((v) => !v.done);
  rows.sort((a, b) => b.ready - a.ready || a.done - b.done || Math.min(1, b.value / b.goal) - Math.min(1, a.value / a.goal));
  $('#achMore').hidden = rows.length <= state.achLimit;
  $('#achMore').textContent = `더 보기 (${fmt(rows.length - state.achLimit)}개 남음)`;
  rows.length = Math.min(rows.length, state.achLimit);
  const got = achCount(s);
  $('#achSum').textContent = `달성 ${fmt(got)} / ${fmt(ACH_TOTAL)} (${((got / ACH_TOTAL) * 100).toFixed(2)}%)`;
  $('#claimAll').disabled = !readyN(() => true);
  $('#questList').innerHTML = rows.map(({ t, i, goal, value, done, ready }) => {
    const v = Math.min(value, goal), last = t.goals.length - 1;
    return `<li class="quest${done ? ' done' : ready ? ' ready' : ''}">
      <div><b><span class="cat">${ACH_CATS[t.cat]}</span>${esc(tierName(t, done ? last : i))}</b>
      <p>${esc(t.desc(goal))}${t.goals.length > 1 ? ` <em class="tier">${done ? t.goals.length : i + 1} / ${t.goals.length}단계</em>` : ''}</p>
      <span class="prog"><i style="width:${(v / goal) * 100}%"></i></span><small>${fmt(v)} / ${fmt(goal)}</small></div>
      <button class="btn small ${ready ? 'pink' : 'plain'}" data-claim="${t.id}" ${ready ? '' : 'disabled'}>${done ? '완료' : `<span class="reward">${reward(t.reward(i, goal))}</span>`}</button></li>`;
  }).join('') || '<li class="empty">여기엔 아직 아무것도 없어요</li>';
}
$('#achSong').onchange = (e) => {
  state.achSong = e.target.value;
  state.achLimit = 100;
  sound.sfx('tap');
  renderAch();
};

$('#questTabs').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.sfx('tap');
  state.questTab = b.dataset.tab;
  RENDER.quests();
};
$('#achCats').onclick = (e) => {
  if (e.target.id === 'hideDone') {
    achDone = e.target.checked;
    return renderAch();
  }
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  sound.sfx('tap');
  state.achCat = b.dataset.cat;
  state.achLimit = 100;
  renderAch();
};
$('#achMore').onclick = () => {
  state.achLimit += 100;
  renderAch();
};

async function claimAct(action, label) {
  try {
    const r = await doAct(action);
    sound.sfx('coin');
    toast(`${label} ${rewardText(r)} 받았어요!`);
    refresh();
  } catch (err) {
    toast(err.message);
  }
}
$('#quests').addEventListener('click', (e) => {
  const q = e.target.closest('[data-claim]:not(:disabled)');
  if (q) return claimAct({ type: 'claim', id: q.dataset.claim }, '업적 보상');
  const m = e.target.closest('[data-mission]:not(:disabled)');
  if (m) return claimAct({ type: 'mission', id: m.dataset.mission }, '미션 보상');
  const o = e.target.closest('[data-online]:not(:disabled)');
  if (o) return claimAct({ type: 'online', id: o.dataset.online }, '접속 보상');
});
// 받을 수 있는 업적을 한 번에 모두 받기 (서버가 한 번에 처리)
$('#claimAll').onclick = async () => {
  try {
    const r = await doAct({ type: 'claimAll' });
    sound.sfx('coin');
    toast(`업적 ${fmt(r.count)}개 · ${rewardText(r)} 받았어요!`);
  } catch (err) {
    toast(err.message);
  }
  refresh();
};

/* ---------- 랭킹 ---------- */

// 곡 고르기: 장르별로 묶은 목록 + 이전 · 다음 (목록 순서대로)
const BY_GENRE = Object.keys(GENRES).flatMap((g) => SONGS.filter((s) => s.genre === g));
const songOptions = (list) => Object.entries(GENRES).map(([g, name]) => {
  const opts = list.filter((s) => s.genre === g).map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('');
  return opts ? `<optgroup label="${name}">${opts}</optgroup>` : '';
}).join('');
$('#rankSongSel').innerHTML = songOptions(SONGS);
$('#rankDiff').innerHTML = DIFFS.map((d) => `<button type="button" class="d-${d}" data-diff="${d}">${DIFF_NAME[d]}</button>`).join('');
$('#rankSongSel').onchange = (e) => {
  sound.sfx('tap');
  state.rankSong = e.target.value;
  RENDER.rank();
};
const stepSong = (d) => {
  const i = BY_GENRE.findIndex((s) => s.id === state.rankSong);
  state.rankSong = BY_GENRE[(i + d + BY_GENRE.length) % BY_GENRE.length].id;
  sound.sfx('tap');
  RENDER.rank();
};
$('#rankPrev').onclick = () => stepSong(-1);
$('#rankNext').onclick = () => stepSong(1);
$('#rankDiff').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.sfx('tap');
  state.rankDiff = b.dataset.diff;
  RENDER.rank();
};
const PERIOD_NAME = { all: '전체 기간', month: '최근 30일', week: '최근 7일', day: '오늘' };
$('#rankPeriod').onclick = (e) => {
  const b = e.target.closest('[data-p]');
  if (!b) return;
  sound.sfx('tap');
  state.rankPeriod = b.dataset.p;
  RENDER.rank();
};
$('#rankMode').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.sfx('tap');
  state.rankMode = b.dataset.mode;
  RENDER.rank();
};

RENDER.rank = async () => {
  const total = state.rankMode === 'total';
  $$('#rankMode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === state.rankMode));
  $('#rankSongPane').hidden = total;
  $('#rankSongSel').value = state.rankSong;
  jacketTo($('#rankJacket'), SONG[state.rankSong]);
  $$('#rankDiff button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.diff === state.rankDiff));
  const period = state.rankPeriod ?? 'all';
  $$('#rankPeriod button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.p === period));
  const list = $('#rankList'), want = `${total ? 'total' : `${state.rankSong}:${state.rankDiff}`}:${period}`, song = SONG[state.rankSong];
  const same = () => want === `${state.rankMode === 'total' ? 'total' : `${state.rankSong}:${state.rankDiff}`}:${state.rankPeriod ?? 'all'}`;
  const head = total ? `<b>🏆 종합 랭킹</b><small>${period === 'all' ? '모든 곡 · 난이도 최고 점수의 합' : `${PERIOD_NAME[period]} 동안 곡마다 최고 점수의 합`}</small>`
    : `<b>🎵 ${esc(song.title)}</b><span class="tag d-${state.rankDiff}">${DIFF_NAME[state.rankDiff]} Lv.${chartLevel(song, state.rankDiff)}</span>`;
  $('#rankTitle').innerHTML = head;
  list.innerHTML = '<li class="empty">불러오는 중…</li>';
  $('#podium').innerHTML = '';
  $('#myRank').innerHTML = '';
  try {
    const r = total ? await api(`rank-total?period=${period}`) : await getRank(state.rankSong, state.rankDiff, period);
    if (!same()) return;
    $('#rankTitle').innerHTML = `${head}<small class="rank-n">${PERIOD_NAME[period]} · ${fmt(r.total)}명 참여</small>`;
    $('#myRank').innerHTML = myRankCard(r);
    $('#podium').innerHTML = podium(r.top.slice(0, 3));
    list.innerHTML = r.top.length > 3 ? r.top.slice(3).map((x, i) => rankRow(x, i + 3)).join('')
      : r.top.length ? '<li class="empty">4위부터 여기에 보여요. 도전해 보세요!</li>' : '<li class="empty">아직 아무도 없어요. 첫 1등이 되어 보세요!</li>';
  } catch (err) {
    if (same()) list.innerHTML = `<li class="empty">${esc(err.message)}</li>`;
  }
};

// 1~3위 시상대 (가운데가 1위)
const podium = (top) => (top.length ? `${[1, 0, 2].filter((i) => top[i]).map((i) => {
  const r = top[i];
  return `<div class="pod p${i + 1}${r.username === state.me?.username ? ' me' : ''}" data-user="${esc(r.username)}"><span class="medal">${['🥇', '🥈', '🥉'][i]}</span>
    ${framed(r.avatar, r.frame ?? 0)}<b class="nm">${esc(r.username)}</b><span class="sc">${fmt(r.score)}점</span>
    <span class="base">${i + 1}${r.rank ? `<small>${esc(r.rank)}</small>` : ''}</span></div>`;
}).join('')}` : '');

// 내 순위 카드: 몇 위 · 상위 몇 % · 바로 위 순위까지 몇 점
function myRankCard(r) {
  if (!r.me) return `<p class="mr-none">${state.me ? (state.rankMode === 'total' ? '아직 기록이 없어요. 한 곡 연주해 볼까요?' : '이 곡은 아직 기록이 없어요. 첫 기록을 세워 보세요!') : '로그인하면 내 순위가 나와요'}</p>`;
  const { pos, score } = r.me, above = r.top[pos - 2];
  const goal = pos === 1 ? '👑 1위를 지키는 중!' : above ? `${fmt(pos - 1)}위까지 <b>${fmt(above.score - score)}점</b>` : '';
  return `<div class="mr-pos"><small>내 순위</small><b>${fmt(pos)}<i>위</i></b></div>
    <div class="mr-info"><span class="mr-score">${fmt(score)}점</span>${r.total ? `<small>${fmt(r.total)}명 중 상위 ${Math.max(1, Math.ceil((pos / r.total) * 100))}%</small>` : ''}
    ${goal ? `<small class="mr-goal">${goal}</small>` : ''}</div>`;
}

/* ---------- 게임 ---------- */

const judgeEl = $('#gJudge'), comboEl = $('#gCombo'), field = $('#field');
const LABEL = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };

function popText(text, cls) {
  judgeEl.textContent = text;
  judgeEl.className = `judge ${cls}`;
  judgeEl.animate([
    { opacity: 1, transform: 'scale(1.4)' },
    { opacity: 1, transform: 'scale(1)', offset: 0.25 },
    { opacity: 0, transform: 'translateY(-16px)' },
  ], { duration: 560, easing: 'ease-out' });
}

function onJudge(name, combo, score, dt, lane) {
  if (state.run?.multi) mpJudge(name, combo, lane);
  popText(LABEL[name], name);
  const t = $('#gTiming');
  if ((name === 'great' || name === 'good') && Math.abs(dt) > 0.03) {
    t.textContent = dt < 0 ? 'FAST' : 'SLOW';
    t.className = `timing ${dt < 0 ? 'fast' : 'slow'}`;
    t.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 500 });
  }
  comboEl.hidden = combo < 2;
  if (combo >= 2) {
    comboEl.firstElementChild.textContent = combo;
    comboEl.animate([{ transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 160 });
  }
  $('#gScore').textContent = $('#gScore2').textContent = fmt(score);
  $('#gCombo2').textContent = combo;
  $('#gCount').innerHTML = Object.keys(LABEL).map((k) => `<li><span>${LABEL[k]}</span><b>${game?.stats[k] ?? 0}</b></li>`).join('');
}

// 50콤보마다 팀 친구가 응원 한마디
function onCombo(n) {
  const team = state.save.team.filter(Boolean);
  if (!team.length) return;
  const id = team[Math.floor(Math.random() * team.length)], el = $('#cheer');
  el.querySelector('img').src = face(id);
  el.querySelector('p').textContent = `${n} COMBO! ${CHAR[id].lines[Math.floor(Math.random() * CHAR[id].lines.length)]}`;
  el.hidden = false;
  el.getAnimations().forEach((a) => (a.currentTime = 0));
  clearTimeout(el.t);
  el.t = setTimeout(() => (el.hidden = true), 1800);
  sound.voice(CHAR[id], '야하!');
}

function onHp(hp, max, ev) {
  for (const el of $$('.hp')) {
    el.querySelector('i').style.width = `${(hp / max) * 100}%`;
    el.querySelector('b').textContent = `${Math.ceil(hp)} / ${max}`;
    el.classList.toggle('low', hp / max < 0.3);
  }
  if (ev === 'revive') {
    popText('부활!', 'revive');
    sound.sfx('rare', 0.1);
  }
  if (ev === 'down' && state.run?.multi) readyText('체력 0! 끝까지 가 보자', 1400); // 멀티는 쓰러져도 계속 (클리어만 실패)
}

function readyText(text, ms) {
  const r = $('#ready'), p = r.firstElementChild;
  p.textContent = text;
  r.hidden = false;
  p.getAnimations().forEach((a) => (a.currentTime = 0));
  clearTimeout(r.t);
  r.t = setTimeout(() => (r.hidden = true), ms);
}

// 팀 얼굴 그림 + 곡 합성
const loadRun = (song, diff) => Promise.all([
  Promise.all(state.save.team.map((id) => (id ? loadImg(face(id)) : null))),
  sound.load(playSong(song, diff)),
]).then(([faces]) => faces);

let starting = false; // 시작 · 다시하기 연타로 게임이 두 개 돌지 않게
async function startGame() {
  if (starting) return;
  starting = true;
  try { await startGameOnce(); } finally { starting = false; }
}
async function startGameOnce() {
  const song = state.song, diff = state.diff, boosters = [...state.boosters];
  sound.get();
  stopMusic();
  $('#loading').hidden = false;
  let faces;
  try {
    await doAct({ type: 'start', song: song.id, diff, boosters }); // 부스터 차감
    faces = await loadRun(song, diff);
  } catch (e) {
    $('#loading').hidden = true;
    return toast(e.message);
  }
  state.boosters.clear();
  if ($('#songDlg').open) $('#songDlg').close();
  playGame(song, diff, teamBuffs(state.save, boosters), faces);
  readyText('준비~', 1100);
  const g = game;
  setTimeout(() => current === 'game' && game === g && readyText('시작!', 600), 1100);
  await g.start();
}

// 게임 화면 열기 (싱글 · 멀티 공용). 멀티는 버프 없이 · 멈추기 대신 포기하기
function playGame(song, diff, buffs, faces, multi = false, tiles = null) {
  $('#loading').hidden = true;
  game?.stop();
  const s = state.save, keys = settings.keys.map(keyLabel);
  state.run = { song, diff, buffs, multi };
  show('game');
  $('#game').classList.toggle('multi', multi);
  $('#paused h2').textContent = multi ? '게임은 계속되고 있어요!' : '잠깐 쉬어요';
  $('#resume').textContent = multi ? '돌아가기' : '계속하기';
  $('#retryP').hidden = multi;
  $('#quit').textContent = multi ? '이번 판 포기하기' : '그만두기';
  $('#gTitle').textContent = `${song.title} · ${DIFF_NAME[diff]} Lv.${chartLevel(song, diff)}`;
  $('#gScore').textContent = $('#gScore2').textContent = '0';
  $('#gCombo2').textContent = '0';
  $('#gProg').style.width = '0';
  $('#paused').hidden = true;
  $('#cheer').hidden = true;
  comboEl.hidden = true;
  judgeEl.className = 'judge';
  $('#gTeam').innerHTML = s.team.map((id, i) => (id
    ? `<li><img src="${face(id)}" alt=""><span>${esc(CHAR[id].name)}<small>${esc(keys[i])} · Lv.${s.chars[id]}</small></span></li>`
    : `<li><span class="chip-b none">${esc(keys[i])} 빈 칸</span></li>`)).join('');
  $('#gBuffs').innerHTML = buffChips(buffs);
  game = new Game(field, {
    song, diff, speed: settings.speed, offset: settings.offset, buffs, hitsound: settings.hitsound, multi, tiles, onItem,
    lanes: s.team.map((id, i) => ({ color: id ? CHAR[id].color : LANE_COLORS[i], face: faces[i], badge: id ? CHAR[id].badge : null, key: keys[i] })),
    onJudge, onHp, onCombo, onEnd: multi ? finishMulti : finish, onError: reportError2,
    onStall: (on) => { $('#stall').hidden = !on; },
    onTick: (p) => ($('#gProg').style.width = `${p * 100}%`),
  });
  $('#gCount').innerHTML = Object.keys(LABEL).map((k) => `<li><span>${LABEL[k]}</span><b>0</b></li>`).join('');
  onHp(game.hp, game.maxHp);
}
$('#retry').onclick = () => { sound.sfx('ok'); startGame(); };
$('#retryP').onclick = () => { game?.stop(); startGame(); };

const pointers = new Map();
// 입력이 실제로 일어난 뒤 처리되기까지 걸린 초 (이벤트 timeStamp 기준, 이상한 값은 0)
const lagOf = (e) => {
  const d = (performance.now() - e.timeStamp) / 1000;
  return d > 0 && d < 0.5 ? d : 0;
};
field.addEventListener('pointerdown', (e) => {
  if (!game) return;
  e.preventDefault();
  const lane = game.laneAt(e.clientX - field.getBoundingClientRect().left);
  pointers.set(e.pointerId, lane);
  game.press(lane, lagOf(e));
});
const lift = (e) => {
  if (!pointers.has(e.pointerId)) return;
  game?.release(pointers.get(e.pointerId), lagOf(e));
  pointers.delete(e.pointerId);
};
field.addEventListener('pointerup', lift);
field.addEventListener('pointercancel', lift);
field.addEventListener('contextmenu', (e) => e.preventDefault());

let capture = -1, escAt = 0; // 설정에서 키를 바꾸는 중인 레인
addEventListener('keydown', (e) => {
  if (capture >= 0) {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') escAt = performance.now();
    if (!['Escape', 'Tab'].includes(e.code)) {
      if (capture === 4) {
        // 멀티 공격 키: 레인 키와 겹치면 안 된다
        if (settings.keys.includes(e.code)) toast('레인 키와 다른 키를 골라 주세요');
        else settings.atk = e.code;
      } else {
        const keys = [...settings.keys], j = keys.indexOf(e.code);
        if (j >= 0) keys[j] = keys[capture]; // 다른 레인에서 쓰던 키면 서로 바꾸기
        keys[capture] = e.code;
        settings.keys = keys;
        if (keys.includes(settings.atk)) settings.atk = ['Space', 'Enter', 'ShiftRight', 'KeyL'].find((k) => !keys.includes(k)); // 공격 키가 레인 키가 되면 다른 키로
      }
      store('settings', settings);
    }
    capture = -1;
    return renderKeys();
  }
  if (current !== 'game' || !game || e.repeat) return;
  const lane = settings.keys.indexOf(e.code);
  if (lane >= 0) {
    e.preventDefault();
    game.press(lane, lagOf(e));
  } else if (state.run?.multi && e.code === atkKey()) {
    e.preventDefault();
    fireAttack();
  } else if (e.code === 'Escape') {
    $('#paused').hidden ? pauseGame() : resumeGame();
  }
}, true);
addEventListener('keyup', (e) => {
  const lane = settings.keys.indexOf(e.code);
  if (lane >= 0) game?.release(lane, lagOf(e));
});
// 창이 포커스를 잃으면(알림 · Alt+Tab) 눌린 키의 keyup이 안 와서 롱노트가 계속 눌린 걸로 남는다 → 모두 뗀 걸로
addEventListener('blur', () => {
  if (!game) return;
  for (let l = 0; l < 4; l++) game.release(l);
  pointers.clear();
});
addEventListener('resize', () => game?.resize());
// 화면을 벗어나면(다른 앱 · 창 닫기 · 화면 끄기) 게임을 멈추고 소리도 통째로 끈다. 돌아오면 소리를 켜고 상태를 다시 확인
const away = () => {
  if (state.run?.multi && current === 'game') return; // 멀티는 다 같이 연주 중이라 멈추지 않는다
  pauseGame();
  sound.sleep(true);
};
document.addEventListener('visibilitychange', () => (document.hidden ? away() : (sound.sleep(false), checkStatus())));
addEventListener('pagehide', away);
addEventListener('pageshow', (e) => e.persisted && sound.sleep(false));
// 게임 중이라 미뤄 둔 점검 · 점검 예고 알림은 곡이 끝나 결과 화면이 뜬 뒤에
LEAVE.game = () => setTimeout(flushLater, 700);

// 멀티는 곡을 멈출 수 없어서 '포기하기' 창만 띄운다 (게임은 뒤에서 계속)
function pauseGame() {
  if (current !== 'game') return;
  if (state.run?.multi) $('#paused').hidden = false;
  else if (game?.pause()) $('#paused').hidden = false;
}
function resumeGame() {
  $('#paused').hidden = true;
  if (state.run?.multi || !game || game.running) return;
  const g = game;
  g.resume(3);
  [['3', 0], ['2', 1000], ['1', 2000], ['시작!', 3000]].forEach(([text, ms]) =>
    setTimeout(() => current === 'game' && game === g && g.running && readyText(text, ms < 3000 ? 850 : 600), ms));
}
$('#pauseBtn').onclick = () => { sound.sfx('tap'); pauseGame(); };
$('#resume').onclick = resumeGame;
$('#quit').onclick = () => {
  if (state.run?.multi) return mpQuit();
  game?.stop();
  game = null;
  sound.sfx('back');
  show('songs');
};

/* ---------- 결과: 신기록이면 축하 · 랭킹 순위 · 내가 제친 사람 수 ---------- */

const MSG = { S: '완벽해! 야하~!', A: '대단해! 박수 짝짝짝', B: '좋아좋아, 잘 연주했어!', C: '조금만 더 하면 돼!', D: '아슬아슬 클리어!' };

async function finish(r) {
  const { song, diff, buffs } = state.run;
  game = null;
  show('result');
  jacketTo($('#rJacket'), song);
  $('#rTitle').textContent = song.title;
  $('#rDiff').textContent = `${DIFF_NAME[diff]} Lv.${chartLevel(song, diff)}`;
  $('#rRank').textContent = r.rank;
  $('#rRank').className = `stamp r-${r.rank}${r.cleared ? '' : ' fail'}`;
  $('#rClear').textContent = r.cleared ? `CLEAR! ${MSG[r.rank]}` : '체력이 다 떨어졌어요… 다시 도전!';
  $('#rClear').className = `rclear${r.cleared ? '' : ' fail'}`;
  $('#rBonus').textContent = buffs.score ? `연주 점수 ${fmt(r.raw)} × 팀 보너스 +${buffs.score}%` : `연주 점수 ${fmt(r.raw)}`;
  $('#rNew').hidden = true;
  $('#rBoard').hidden = true;
  $('#celebrate').hidden = true;
  $('#rFc').hidden = !r.fullCombo;
  $('#rFc').textContent = r.allPerfect ? 'ALL PERFECT' : 'FULL COMBO';
  $('#rStats').innerHTML = Object.keys(LABEL).map((k) => `<li class="${k}"><span>${LABEL[k]}</span><b>${r.stats[k]}</b></li>`).join('') +
    `<li><span>MAX COMBO</span><b>${r.combo}</b></li>`;
  $('#rRewards').innerHTML = '';
  $('#rNote').textContent = '보상 계산 중…';
  countUp($('#rScore'), r.score);
  sound.sfx(r.cleared ? 'fan' : 'back', 0.12);
  if (r.cleared && 'SA'.includes(r.rank)) confetti();

  const before = claimable(state.save).length;
  try {
    const res = await doAct({
      type: 'finish', song: song.id, diff, raw: r.raw, score: r.score, combo: r.combo, rank: r.rank,
      cleared: r.cleared, fullCombo: r.fullCombo, allPerfect: r.allPerfect, perfect: r.stats.perfect,
    });
    $('#rNew').hidden = !res.newBest;
    if (res.newBest) celebrate(r.score, res.prev, res.board);
    $('#rRewards').innerHTML = [
      `<span>${icon('coin')}+${fmt(res.coins)}</span>`,
      res.gems ? `<span>${icon('gem')}+${fmt(res.gems)}</span>` : '',
      `<span>EXP +${res.exp}</span>`,
      res.levelUp ? `<span>레벨 업! Lv.${res.levelUp}</span>` : '',
    ].join('');
    const fresh = claimable(state.save).length - before;
    $('#rNote').textContent = fresh > 0 ? `새로 받을 수 있는 업적이 ${fresh}개 있어요!` : state.me ? '' : '로그인하면 랭킹에 기록이 올라가요';
    if (!state.me) api('guest-play', { song: song.id, diff, raw: r.raw, score: r.score, rank: r.rank, cleared: r.cleared }).catch(() => {});
    rankCache.delete(`${song.id}:${diff}`);
  } catch (err) {
    $('#rNote').textContent = err.message;
  }
  renderTop();
}

function celebrate(score, prev, board) {
  $('#nrSub').textContent = prev ? `지난 기록보다 +${fmt(score - prev)}점!` : '첫 기록 달성!';
  $('#celebrate').hidden = false;
  $('#celebrate').getAnimations({ subtree: true }).forEach((a) => (a.currentTime = 0));
  clearTimeout(celebrate.t);
  celebrate.t = setTimeout(() => ($('#celebrate').hidden = true), 2600);
  sound.sfx('epic', 0.13);
  confetti();
  setTimeout(confetti, 500);
  if (!board) return;
  const up = board.prev ? board.prev - board.rank : 0;
  $('#rBoard').innerHTML = `🏆 랭킹 <b>${fmt(board.rank)}위</b> / ${fmt(board.total)}명${up > 0 ? ` <em>▲${up}</em>` : ''}${board.passed ? `<br>${fmt(board.passed)}명을 제쳤어요! 따라잡힌 친구들에게 우편이 갔어요` : ''}`;
  $('#rBoard').hidden = false;
}

function countUp(el, to) {
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 900);
    el.textContent = fmt(to * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- 설정 ---------- */

const setEl = { speed: $('#speed'), offset: $('#offset'), musicVol: $('#musicVol'), sfxVol: $('#sfxVol'), music: $('#music'), hitsound: $('#hitsound') };
function syncSettings() {
  for (const k of ['speed', 'offset', 'musicVol', 'sfxVol']) setEl[k].value = settings[k];
  setEl.music.checked = settings.music;
  setEl.hitsound.checked = settings.hitsound;
  $('#speedVal').textContent = settings.speed.toFixed(1);
  $('#offsetVal').textContent = `${settings.offset > 0 ? '+' : ''}${settings.offset}ms`;
  $('#musicVolVal').textContent = `${settings.musicVol}%`;
  $('#sfxVolVal').textContent = `${settings.sfxVol}%`;
  renderKeys();
}
function renderKeys() {
  $('#keyGrid').innerHTML = settings.keys.map((k, i) => `<button type="button" data-k="${i}" class="${capture === i ? 'listening' : ''}">
    <small>${i + 1}번 레인</small><b>${capture === i ? '키를 누르세요' : esc(keyLabel(k))}</b></button>`).join('');
  $('#atkKeyBtn').className = capture === 4 ? 'listening' : '';
  $('#atkKeyBtn').innerHTML = `<small>멀티 공격</small><b>${capture === 4 ? '키를 누르세요' : esc(keyLabel(settings.atk))}</b>`;
}
$('#atkKeyBtn').onclick = () => {
  sound.sfx('tap');
  capture = capture === 4 ? -1 : 4;
  renderKeys();
};
$('#settings').addEventListener('input', (e) => {
  if (!e.target.matches('input')) return;
  const musicChanged = settings.music !== setEl.music.checked;
  Object.assign(settings, {
    speed: +setEl.speed.value, offset: +setEl.offset.value, musicVol: +setEl.musicVol.value, sfxVol: +setEl.sfxVol.value,
    music: setEl.music.checked, hitsound: setEl.hitsound.checked,
  });
  sound.vol.sfx = settings.sfxVol / 100;
  sound.setMusic(settings.musicVol / 100);
  store('settings', settings);
  syncSettings();
  if (musicChanged) {
    sound.bgmSong = null;
    settings.music ? music() : stopMusic();
  }
});
$('#keyGrid').onclick = (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  sound.sfx('tap');
  capture = capture === +b.dataset.k ? -1 : +b.dataset.k;
  renderKeys();
};
$('#keyReset').onclick = () => {
  settings.keys = [...DEFAULT_KEYS];
  settings.atk = 'Space';
  capture = -1;
  store('settings', settings);
  sound.sfx('ok');
  renderKeys();
};
$('#settings').addEventListener('cancel', (e) => {
  if (capture < 0 && performance.now() - escAt > 400) return;
  e.preventDefault(); // 키를 바꾸는 중에 누른 Esc는 창을 닫지 않고 취소만
  capture = -1;
  renderKeys();
});
$('#settings').addEventListener('close', () => {
  capture = -1;
  if (current === 'team') RENDER.team();
});
$$('[data-open="settings"]').forEach((b) => (b.onclick = () => {
  sound.get();
  sound.sfx('tap');
  syncSettings();
  $('#settings').showModal();
}));

/* ---------- 내 정보 · 닉네임 변경 ---------- */

function openProfile() {
  sound.sfx('tap');
  if (!state.me) {
    toast('로그인하면 내 기록이 서버에 저장돼요!');
    show('title');
    return openAuth('signup');
  }
  renderProfile();
  $('#profile').showModal();
}
function renderProfile() {
  const s = state.save, L = levelOf(s.exp), [cur, need] = expProgress(s.exp), per = perksOf(L), top = frameTier(L), mine = frameOfSave(s);
  $('#pAvatar').innerHTML = framed(s.avatar, mine, 'big');
  $('#pName').textContent = state.me.username;
  $('#renameForm').hidden = true;
  $('#pLevel').innerHTML = `<b>Lv.${fmt(L)}</b><span class="prog"><i style="width:${(cur / need) * 100}%"></i></span>
    <small>${L >= MAX_LV ? '최고 레벨!' : `다음 레벨까지 ${fmt(need - cur)} EXP`}</small>`;
  $('#pPerks').innerHTML = `<li>🪙 코인 +${per.coin}%</li><li>✨ 경험치 +${per.exp}%</li><li>👫 친구 ${per.friends}명</li><li>🎁 하루 선물 ${per.gifts}번</li><li>📅 출석 보상 +${per.attend}%</li>`;
  $('#pPlays').textContent = `${fmt(s.stats.plays)}번 연주 · 캐릭터 ${Object.keys(s.chars).length}명 · 팀 점수 ${fmt(teamPower(s))} · 멀티 1등 ${fmt(s.stats.mwins)}번`;
  $('#pFrameName').textContent = `${frameInfo(mine).name} 테두리 · 다음 테두리는 Lv.${fmt(Math.min(MAX_LV, (top + 1) * 10))}`;
  const rows = SONGS.flatMap((x) => DIFFS.map((d) => [x, d, s.best[`${x.id}:${d}`]])).filter((r) => r[2]).sort((a, b) => b[2].score - a[2].score).slice(0, 50);
  $('#pBest').innerHTML = rows.length
    ? rows.map(([x, d, b]) => `<li><span>${esc(x.title)} · ${DIFF_NAME[d]}</span><span>${fmt(b.score)} ${b.rank}</span></li>`).join('')
    : '<li>아직 기록이 없어요. 한 곡 연주해 볼까요?</li>';
  const owned = Array.from({ length: 32 }, (_, i) => i + 1).filter((n) => ownedAvatar(s, n));
  avatarGrid($('#profileAvatars'), owned, () => state.save.avatar, async (n) => {
    try {
      await doAct({ type: 'avatar', avatar: n });
      $('#pAvatar').innerHTML = framed(n, frameOfSave(state.save), 'big');
      renderTop();
    } catch (e) {
      toast(e.message);
    }
  });
}
$('#profileBtn').onclick = openProfile;

/* ---------- 레벨 혜택: 1~1000레벨 테두리 · 레벨 업 보상 · 계속 받는 혜택 (10레벨 단위로) ---------- */

function openLevels() {
  sound.get();
  sound.sfx('tap');
  const s = state.save, L = levelOf(s.exp);
  $('#lvNow').innerHTML = `지금 <b>Lv.${fmt(L)}</b> · 테두리 <b>${esc(frameInfo(frameTier(L)).name)}</b>`;
  $('#lvList').innerHTML = Array.from({ length: 101 }, (_, t) => {
    const f = frameInfo(t), at = Math.max(1, t * 10), r = levelReward(Math.max(2, at)), p = perksOf(at), open = L >= at;
    return `<li class="${open ? 'open' : ''}${frameTier(L) === t ? ' now' : ''}">${framed(s.avatar, t, 'sm')}
      <div><b>Lv.${fmt(at)} · ${esc(f.name)}</b><small>레벨 업 보상 ${reward(r)}${r.items ? ' + 부스터 3종' : ''}</small>
      <small>코인 +${p.coin}% · 경험치 +${p.exp}% · 친구 ${p.friends}명 · 선물 ${p.gifts}번${p.attend ? ` · 출석 +${p.attend}%` : ''}</small></div>
      <span class="st">${open ? '✔' : '🔒'}</span></li>`;
  }).join('');
  $('#levelDlg').showModal();
  $('#lvList li.now')?.scrollIntoView({ block: 'center' });
}
$('#pLevelBtn').onclick = openLevels;
$$('[data-ask]').forEach((b) => (b.onclick = () => {
  sound.get();
  openAsk();
}));

$('#renameBtn').onclick = () => {
  const f = $('#renameForm');
  f.hidden = !f.hidden;
  const s = state.save, ok = s.coins >= RENAME_COINS;
  $('#renameNote').textContent = `바꿀 때마다 코인 ${fmt(RENAME_COINS)}개 · ${ok ? `지금 ${fmt(s.coins)}개 있어요` : `${fmt(RENAME_COINS - s.coins)}개 더 모아야 해요`}`;
  $('#renameNote').classList.toggle('bad', !ok);
  f.querySelector('button').disabled = !ok;
  if (!f.hidden) f.username.focus();
};
$('#renameForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = e.target.username.value.trim();
  try {
    const r = await api('rename', { username: name });
    state.me.username = r.username;
    state.save = r.save;
    $('#pName').textContent = r.username;
    e.target.hidden = true;
    e.target.reset();
    sound.sfx('ok');
    toast(`이제부터 '${r.username}'(으)로 불러 줄게요!`);
    rankCache.clear();
    renderTop();
  } catch (err) {
    $('#renameNote').textContent = err.message;
  }
};

$('#logout').onclick = async () => {
  try { await api('logout', {}); } catch {}
  enter(null);
  $('#profile').close();
  toast('또 놀러 와요!');
  show('title');
  openAuth();
};

/* ---------- 친구: 닉네임으로 신청 · 받은 신청 · 목록(접속 중 · 멀티 방) · 선물 · 멀티 초대 · 프로필 보기 ---------- */

let fr = null; // 마지막으로 받은 친구 화면 데이터
const ago = (t) => {
  if (!t) return '';
  const m = Math.floor((Date.now() - new Date(t)) / 60000);
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
};
async function openFriends() {
  sound.get();
  sound.sfx('tap');
  if (!state.me) return toast('로그인하면 친구를 사귈 수 있어요');
  $('#frErr').textContent = '';
  $('#friendsDlg').showModal();
  await loadFriends();
}
async function loadFriends() {
  $('#frList').innerHTML = '<li class="empty">불러오는 중…</li>';
  try {
    fr = await api('friends');
  } catch (e) {
    return ($('#frList').innerHTML = `<li class="empty">${esc(e.message)}</li>`);
  }
  state.requests = fr.incoming.length;
  renderTop();
  renderFriends();
}
function renderFriends() {
  if (!fr) return;
  const gifted = new Set(fr.gifts), left = fr.giftMax - fr.gifts.length, inRoom = Boolean(mp.code);
  $('#frSum').innerHTML = `친구 <b>${fr.friends.length}</b> / ${fr.max}명 · 오늘 선물 <b>${Math.max(0, left)}</b>번 남음`;
  $('#frIn').hidden = !fr.incoming.length;
  $('#frIn').innerHTML = `<h3 class="sub">받은 신청 <small>${fr.incoming.length}</small></h3>` + fr.incoming.map((u) => `<li class="frow">
    ${framed(u.avatar, u.frame, 'sm')}<span class="who"><b data-user="${esc(u.username)}">${esc(u.username)}</b><small>Lv.${fmt(u.lv)} · ${ago(u.created_at)}</small></span>
    <span class="acts"><button type="button" class="btn small pink" data-accept="${u.id}">받기</button><button type="button" class="btn small plain" data-remove="${u.id}">거절</button></span></li>`).join('');
  $('#frOut').hidden = !fr.outgoing.length;
  $('#frOut').innerHTML = `<h3 class="sub">보낸 신청 <small>답을 기다리는 중</small></h3>` + fr.outgoing.map((u) => `<li class="frow">
    ${framed(u.avatar, u.frame, 'sm')}<span class="who"><b>${esc(u.username)}</b><small>Lv.${fmt(u.lv)}</small></span>
    <span class="acts"><button type="button" class="btn small plain" data-remove="${u.id}">취소</button></span></li>`).join('');
  $('#frList').innerHTML = fr.friends.map((u) => `<li class="frow${u.online ? ' on' : ''}">
    ${framed(u.avatar, u.frame, 'sm')}<span class="who"><b data-user="${esc(u.username)}">${esc(u.username)}</b>
      <small>Lv.${fmt(u.lv)} · ${u.online ? '<em class="online">● 접속 중</em>' : ago(u.last_seen)}${u.room ? ` · 👥 멀티 방 ${esc(u.room)}` : ''}</small></span>
    <span class="acts">
      ${inRoom && u.room !== mp.code ? `<button type="button" class="btn small blue" data-invite="${u.id}" title="지금 내 멀티 방으로 초대">초대</button>` : ''}
      ${u.room && u.room !== mp.code ? `<button type="button" class="btn small butter" data-joinroom="${esc(u.room)}">같이 하기</button>` : ''}
      <button type="button" class="btn small ${gifted.has(`f${u.id}`) ? 'plain' : 'pink'}" data-gift="${u.id}" ${gifted.has(`f${u.id}`) ? 'disabled' : ''}>${gifted.has(`f${u.id}`) ? '보냄' : '🎁 선물'}</button>
      <button type="button" class="more" data-menu="${u.id}" aria-label="더 보기">⋯</button></span></li>`).join('')
    || '<li class="empty">아직 친구가 없어요. 위에 닉네임을 적어 신청해 보세요! 랭킹이나 멀티 방에서 이름을 눌러도 돼요</li>';
}
$('#frAdd').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('#frName').value.trim();
  if (!name) return ($('#frErr').textContent = '친구 닉네임을 적어 주세요');
  try {
    const r = await api('friend-request', { name });
    $('#frName').value = '';
    $('#frErr').textContent = '';
    sound.sfx('ok');
    toast(r.friend ? '친구가 됐어요! 🎉' : `${r.name}님에게 친구 신청을 보냈어요`);
    loadFriends();
  } catch (err) {
    $('#frErr').textContent = err.message;
  }
};
// 선물: 무료(매일 친구마다 1번) · 코인 · 보석 중에서
let giftTo = 0;
function openGift(id) {
  const u = fr?.friends.find((x) => x.id === id);
  if (!u) return;
  giftTo = id;
  const s = state.save, freeDone = fr.gifts.includes(`f${id}`);
  $('#gfWho').innerHTML = `${framed(u.avatar, u.frame, 'sm')}<b>${esc(u.username)}</b>님에게`;
  $('#gfOpts').innerHTML = `<button type="button" class="gopt" data-kind="free" ${freeDone ? 'disabled' : ''}><span>💌</span><b>무료 선물</b>
      <small>친구에게 ${reward(GIFT.free.give)} · 나도 ${icon('coin')}${GIFT.free.back}${freeDone ? ' (오늘 보냄)' : ''}</small></button>`
    + GIFT.coins.map((n) => `<button type="button" class="gopt" data-kind="coins" data-amount="${n}" ${s.coins < n ? 'disabled' : ''}><span>${icon('coin')}</span><b>코인 ${fmt(n)}개</b><small>내 코인에서 보내요</small></button>`).join('')
    + GIFT.gems.map((n) => `<button type="button" class="gopt" data-kind="gems" data-amount="${n}" ${s.gems < n ? 'disabled' : ''}><span>${icon('gem')}</span><b>보석 ${fmt(n)}개</b><small>내 보석에서 보내요</small></button>`).join('');
  $('#gfLeft').textContent = `오늘 선물 ${Math.max(0, fr.giftMax - fr.gifts.length)}번 남음 (레벨이 오르면 늘어나요)`;
  $('#giftDlg').showModal();
}
$('#gfOpts').onclick = async (e) => {
  const b = e.target.closest('.gopt:not(:disabled)');
  if (!b) return;
  try {
    const r = await api('friend-gift', { id: giftTo, kind: b.dataset.kind, amount: b.dataset.amount ? +b.dataset.amount : undefined });
    state.save = r.save;
    sound.sfx('coin');
    toast(`선물을 보냈어요! 💝${r.back ? ` 감사 코인 ${r.back}개도 받았어요` : ''}`);
    $('#giftDlg').close();
    refresh();
    loadFriends();
  } catch (err) {
    toast(err.message);
  }
};
$('#friendsDlg').addEventListener('click', async (e) => {
  const t = e.target, id = (k) => +t.closest(`[data-${k}]`)?.dataset[k];
  try {
    if (t.closest('[data-accept]')) {
      await api('friend-accept', { id: id('accept') });
      sound.sfx('ok');
      toast('친구가 됐어요! 🎉');
      return loadFriends();
    }
    if (t.closest('[data-remove]')) {
      await api('friend-remove', { id: id('remove') });
      sound.sfx('back');
      return loadFriends();
    }
    if (t.closest('[data-gift]')) return openGift(id('gift'));
    if (t.closest('[data-invite]')) {
      await api('mp-invite', { code: mp.code, to: id('invite') });
      sound.sfx('ok');
      return toast('초대를 보냈어요! 친구 화면에 곧 알림이 떠요');
    }
    if (t.closest('[data-joinroom]')) {
      $('#friendsDlg').close();
      if (mp.code) mpGone();
      return mpEnter('mp-join', { code: t.closest('[data-joinroom]').dataset.joinroom });
    }
    if (t.closest('[data-menu]')) {
      const u = fr.friends.find((x) => x.id === id('menu'));
      return openUser(u.username);
    }
    if (t.closest('[data-user]')) return openUser(t.closest('[data-user]').dataset.user);
  } catch (err) {
    toast(err.message);
  }
});
$$('[data-friends]').forEach((b) => (b.onclick = openFriends));

// 다른 사람 프로필 (랭킹 · 멀티 방 · 친구 목록에서 이름을 누르면): 레벨 · 테두리 · 팀 · 기록 · 친구 신청 / 끊기
async function openUser(name) {
  if (!name) return;
  sound.get();
  sound.sfx('tap');
  $('#uBody').innerHTML = '<p class="empty">불러오는 중…</p>';
  $('#userDlg').showModal();
  try {
    const u = await api(`user?name=${encodeURIComponent(name)}`);
    const team = u.team.map((x) => (x ? `<span class="ut ${rcls(x.id)}"><img src="${face(x.id)}" alt=""><small>Lv.${x.lv}</small></span>` : '<span class="ut empty"></span>')).join('');
    const rel = u.me ? '<p class="hint">내 프로필이에요</p>'
      : !state.me ? '<p class="hint">로그인하면 친구 신청을 할 수 있어요</p>'
      : u.friend ? `<button type="button" class="btn small plain" data-unfriend="${u.id}">친구 끊기</button>`
      : u.got ? `<button type="button" class="btn pink" data-ufaccept="${u.id}">친구 신청 받기</button>`
      : u.sent ? '<p class="hint">친구 신청을 보냈어요 · 답을 기다리는 중</p>'
      : `<button type="button" class="btn pink" data-uadd="${esc(u.username)}">👫 친구 신청</button>`;
    $('#uBody').innerHTML = `${framed(u.avatar, u.frame, 'big')}<h2>${esc(u.username)}</h2>
      <p class="u-sub">Lv.${fmt(u.lv)} · ${esc(frameInfo(u.frame).name)} 테두리</p>
      <ul class="u-stats"><li><b>${fmt(u.total)}</b><small>종합 점수</small></li><li><b>${fmt(u.plays)}</b><small>연주</small></li>
        <li><b>${fmt(u.combo)}</b><small>최대 콤보</small></li><li><b>${fmt(u.mwins)}</b><small>멀티 1등</small></li><li><b>${fmt(u.chars)}</b><small>캐릭터</small></li></ul>
      <div class="u-team">${team}</div>${rel}`;
  } catch (e) {
    $('#uBody').innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}
$('#userDlg').addEventListener('click', async (e) => {
  const t = e.target;
  try {
    if (t.closest('[data-uadd]')) {
      const r = await api('friend-request', { name: t.closest('[data-uadd]').dataset.uadd });
      sound.sfx('ok');
      toast(r.friend ? '친구가 됐어요! 🎉' : '친구 신청을 보냈어요');
    } else if (t.closest('[data-ufaccept]')) {
      await api('friend-accept', { id: +t.closest('[data-ufaccept]').dataset.ufaccept });
      sound.sfx('ok');
      toast('친구가 됐어요! 🎉');
    } else if (t.closest('[data-unfriend]')) {
      if (!t.classList.contains('sure')) {
        t.classList.add('sure');
        t.textContent = '한 번 더 누르면 끊어요';
        return;
      }
      await api('friend-remove', { id: +t.closest('[data-unfriend]').dataset.unfriend });
      toast('친구를 끊었어요');
    } else return;
    $('#userDlg').close();
    if ($('#friendsDlg').open) loadFriends();
  } catch (err) {
    toast(err.message);
  }
});
// 랭킹 줄 · 시상대 · 멀티 방 자리에서 이름(프로필)을 누르면 프로필
document.addEventListener('click', (e) => {
  const u = e.target.closest('#rankList [data-user], #podium [data-user], #sdRankList [data-user], #roomSeats [data-user], #roomBoard [data-user]');
  if (u && !e.target.closest('button[data-kick], button[data-host]')) openUser(u.dataset.user);
});

/* ---------- 우편함 ---------- */

const MAILICON = { gift: '🎁', rank: '🏁', reply: '💌', system: '📢', friend: '💝' };
let mails = [];

async function openMail() {
  sound.get();
  sound.sfx('tap');
  if (!state.me) return toast('로그인하면 우편함을 쓸 수 있어요');
  $('#mailList').innerHTML = '<li class="empty">불러오는 중…</li>';
  $('#mailDlg').showModal();
  try {
    mails = (await api('mail')).mails;
    renderMail();
    if (mails.some((m) => !m.read)) state.unread = (await api('mail-read', {})).unread;
    renderTop();
  } catch (e) {
    $('#mailList').innerHTML = `<li class="empty">${esc(e.message)}</li>`;
  }
}

// 선물을 받았거나 선물이 없는 우편만 지울 수 있다
const deletable = (m) => m.claimed || !(m.coins || m.gems);
function renderMail() {
  const gifts = mails.filter((m) => !m.claimed && (m.coins || m.gems));
  $('#mailSum').textContent = gifts.length ? `받을 선물 ${gifts.length}개` : `우편 ${mails.length}통`;
  $('#mailAll').disabled = !gifts.length;
  $('#mailClean').disabled = !mails.some(deletable);
  $('#mailList').innerHTML = mails.map((m) => `<li class="mail${m.read ? '' : ' unread'}${m.claimed ? ' got' : ''}">
    <span class="mi">${MAILICON[m.kind] ?? '📢'}</span>
    <div><b>${esc(m.title)}</b>${m.body ? `<p>${esc(m.body)}</p>` : ''}<small>${new Date(m.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div>
    <span class="mact">${m.coins || m.gems ? `<button type="button" class="btn small ${m.claimed ? 'plain' : 'pink'}" data-mail="${m.id}" ${m.claimed ? 'disabled' : ''}>${m.claimed ? '받음' : `<span class="reward">${reward(m)}</span>`}</button>` : ''}
    ${deletable(m) ? `<button type="button" class="del" data-del="${m.id}" aria-label="우편 지우기" title="지우기">${icon('trash')}</button>` : ''}</span></li>`).join('')
    || '<li class="empty">우편이 없어요. 랭킹에서 누가 나를 제치면 여기로 알려 줘요!</li>';
}

async function deleteMail(body) {
  try {
    const r = await api('mail-delete', body), gone = new Set(r.deleted);
    mails = mails.filter((m) => !gone.has(m.id));
    state.unread = r.unread;
    sound.sfx('tap');
    toast(`우편 ${r.deleted.length}통을 지웠어요`);
    renderMail();
    renderTop();
  } catch (e) {
    toast(e.message);
  }
}
// 읽은 우편 모두 지우기는 한 번 더 눌러야 지워진다 (실수 방지)
$('#mailClean').onclick = () => {
  const b = $('#mailClean');
  if (!b.classList.contains('sure')) {
    b.classList.add('sure');
    b.textContent = '한 번 더 누르면 지워요';
    clearTimeout(b.t);
    b.t = setTimeout(() => { b.classList.remove('sure'); b.textContent = '읽은 우편 지우기'; }, 3000);
    return;
  }
  clearTimeout(b.t);
  b.classList.remove('sure');
  b.textContent = '읽은 우편 지우기';
  deleteMail({ read: true });
};

async function claimMail(body) {
  try {
    const r = await api('mail-claim', body);
    state.save = r.save;
    state.unread = r.unread;
    mails = mails.map((m) => (body.all || m.id === body.id) && (m.coins || m.gems) ? { ...m, claimed: true, read: true } : m);
    sound.sfx('coin');
    toast(`${rewardText(r)} 받았어요!`);
    renderMail();
    refresh();
  } catch (e) {
    toast(e.message);
  }
}
$('#mailBtn').onclick = openMail;
$('#mailAll').onclick = () => claimMail({ all: true });
$('#mailList').onclick = (e) => {
  const b = e.target.closest('[data-mail]:not(:disabled)');
  if (b) return claimMail({ id: +b.dataset.mail });
  const d = e.target.closest('[data-del]');
  if (d) deleteMail({ id: +d.dataset.del });
};

/* ---------- 문의하기 (노래 신청 · 오류 신고 · 건의) → 관리자 페이지 ---------- */

// 주제마다 [제목 칸 이름, 안내]. 주제 이름은 rules.js INQUIRY (관리자 페이지와 같이 쓴다)
const ASK = {
  song: ['노래 제목 · 가수', '요즘 노래는 저작권 때문에 그대로 넣기 어려워요. 저작권이 풀린 곡이나 쓸 수 있는 음원인지 확인해서 우편으로 답장할게요!'],
  bug: ['어디서 어떤 문제가 생겼나요?', '언제, 어떤 화면에서, 무엇을 눌렀을 때 생겼는지 적어 주면 빨리 고칠 수 있어요.'],
  idea: ['건의 제목', '이런 기능이 있으면 좋겠다! 자유롭게 적어 주세요.'],
  reward: ['어떤 보상 · 재화 문제인가요?', '코인 · 보석 · 우편 · 뽑기 · 출석 보상에서 생긴 일을 적어 주세요. 언제 무엇을 했는지 적어 주면 빨리 확인할 수 있어요.'],
  account: ['계정 · 닉네임 문의', '로그인 · 비밀번호 · 닉네임처럼 계정에 대한 문의를 적어 주세요.'],
  report: ['신고할 닉네임', '부적절한 닉네임이나 멀티플레이 비매너 유저를 알려 주세요. 언제 어디서 있었던 일인지 적어 주세요.'],
  etc: ['제목', '궁금한 점을 적어 주세요. 답장은 우편함으로 가요.'],
};
let askKind = 'song';
$('#askKind').innerHTML = Object.entries(INQUIRY).map(([k, name]) => `<button type="button" role="radio" data-kind="${k}">${name}</button>`).join('');

function renderAskKind() {
  $$('#askKind button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.kind === askKind));
  $('#askTitleLbl').textContent = ASK[askKind][0];
  $('#askNote').textContent = ASK[askKind][1];
}

async function openAsk() {
  if (!state.me) return toast('로그인하면 문의할 수 있어요');
  sound.sfx('tap');
  $('#askErr').textContent = '';
  renderAskKind();
  $('#askDlg').showModal();
  loadAsks();
}

async function loadAsks() {
  try {
    const list = await api('inquiries');
    $('#askList').innerHTML = list.map((q) => `<li><b><span class="cat">${INQUIRY[q.kind] ?? '기타'}</span>${esc(q.title)}</b>
      <span class="st ${q.status}">${q.status === 'done' ? '답변 완료' : '확인 중'}</span>${q.reply ? `<p>↳ ${esc(q.reply)}</p>` : ''}</li>`).join('')
      || '<li class="empty">아직 보낸 문의가 없어요</li>';
  } catch (e) {
    $('#askList').innerHTML = `<li class="empty">${esc(e.message)}</li>`;
  }
}

$('#askKind').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.sfx('tap');
  askKind = b.dataset.kind;
  renderAskKind();
};
$('#askSend').onclick = async () => {
  const title = $('#askTitle').value.trim(), body = $('#askBody').value.trim();
  if (!title) return ($('#askErr').textContent = `${ASK[askKind][0]}을(를) 적어 주세요`);
  $('#askSend').disabled = true;
  try {
    await api('inquiry', { kind: askKind, title, body });
    $('#askTitle').value = $('#askBody').value = '';
    $('#askErr').textContent = '';
    sound.sfx('ok');
    toast('보냈어요! 답장은 우편함으로 갈게요');
    loadAsks();
  } catch (e) {
    $('#askErr').textContent = e.message;
  } finally {
    $('#askSend').disabled = false;
  }
};

/* ---------- 멀티플레이 (PC): 방 만들기 · 참가 코드(숫자 4자리) · 5×2 자리(최대 10명) · 준비 · 같이 시작 · 다른 참가자 화면 · 순위표
   · 아이템 노트 공격 · 종합 점수 · 이전 판 · 1등이 방장 · 방장 넘기기 · 내보내기 · 친구 초대 ---------- */

const NO_BUFFS = { ...Object.fromEntries(Object.keys(BUFFS).map((k) => [k, 0])), synergies: [] }; // 멀티는 공평하게 버프 없이
const JN = ['perfect', 'great', 'good', 'miss'];
const atkKey = () => settings.atk; // 설정에서 바꿀 수 있다 (기본 Space)
const mpName = (id) => mp.room?.players.find((p) => p.id === id)?.name ?? '누군가';

function openMulti() {
  sound.get();
  sound.sfx('tap');
  $$('dialog[open]').forEach((d) => d.close());
  if (!state.me) return toast('멀티 플레이는 로그인하면 할 수 있어요');
  show(mp.code ? 'room' : 'multi');
}
document.addEventListener('click', (e) => e.target.closest('[data-multi]') && openMulti());
$('#roomBar').onclick = () => { sound.sfx('tap'); show('room'); };
RENDER.multi = () => ($('#mpErr').textContent = '');

async function mpEnter(path, body) {
  $('#mpErr').textContent = '';
  try {
    const r = await api(path, body);
    sound.sfx('ok');
    Object.assign(mp, { code: r.code, room: null, round: 0, since: 0, rtt: Infinity, result: null, reward: null });
    mpApply(r);
    show('room');
    mpPoll();
  } catch (e) {
    sound.sfx('back');
    $('#mpErr').textContent = e.message;
  }
}
$('#mpCreate').onclick = () => mpEnter('mp-create', { song: state.song?.id, diff: state.diff });
$('#mpCodeIn').oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4));
$('#mpJoin').onsubmit = (e) => {
  e.preventDefault();
  const code = $('#mpCodeIn').value;
  if (!/^\d{4}$/.test(code)) return ($('#mpErr').textContent = '참가 코드 숫자 4자리를 적어 주세요');
  mpEnter('mp-join', { code });
};

// 방 상태 받기: 대기 중 2초 · 게임 중 0.35초마다 (부를 때마다 새 줄을 시작하고 예전 줄은 멈춘다)
function mpPoll(token = (mp.chain = {})) {
  clearTimeout(mp.t);
  if (!mp.code || token !== mp.chain) return;
  mpSync().then(() => (mp.fails = 0), () => ++mp.fails === 4 && toast('연결이 불안정해요. 다시 연결하는 중…'))
    .finally(() => mp.code && token === mp.chain && (mp.t = setTimeout(() => mpPoll(token), mp.on ? 350 : 2000)));
}

async function mpSync(extra = {}) {
  if (!mp.code) return;
  const body = { code: mp.code, round: mp.round, since: mp.since, ...extra };
  if (mp.on && game) body.state = mpState();
  const t0 = performance.now(), r = await api('mp-sync', body), rtt = performance.now() - t0;
  if (body.code !== mp.code) return;
  if (r.gone) return mpGone(r.idle ? '30분 동안 연주가 없어서 방이 닫혔어요' : '방에서 나왔어요');
  // 서버 시계 맞추기: 왕복이 가장 짧았던 응답 기준 (내 시계 + offset = 서버 시계)
  if (rtt <= mp.rtt) {
    mp.rtt = rtt;
    mp.offset = r.now - (Date.now() - rtt / 2);
  }
  mpApply(r);
}

async function mpCmd(path, body = {}) {
  try {
    const r = await api(path, { code: mp.code, ...body });
    if (r.gone) return mpGone('방에서 나왔어요');
    mpApply(r);
  } catch (e) {
    toast(e.message);
    if (current === 'room') renderRoom();
  }
}

function mpApply(r) {
  if (!r || r.code !== mp.code) return;
  const was = mp.room;
  mp.room = r;
  for (const e of r.events) {
    if (e.id <= mp.since) continue;
    mp.since = e.id;
    if (mp.on) mpEvent(e);
  }
  if (r.status === 'playing' && r.round !== mp.round && !mp.on) return startMulti(r);
  if (mp.on) return mpLive(r);
  if (was && was.host !== r.me && r.host === r.me) toast('이제 내가 방장이에요!');
  if (was?.status === 'playing' && r.status === 'done' && mp.round === r.round) {
    const top = mpOrder(r.players.map((p) => ({ ...p, raw: Number(p.result?.raw) || 0 })))[0];
    if (top?.id === r.me) {
      sound.sfx('epic', 0.13);
      confetti();
      toast('🥇 이번 판 1등!');
    }
  }
  if (current === 'room') renderRoom();
  else renderTop();
  if (current === 'room' && was?.status !== r.status) sideAds();
}

function mpGone(msg) {
  clearTimeout(mp.t);
  const was = mp.code;
  Object.assign(mp, { code: null, room: null, chain: null });
  if (mp.on) {
    mp.on = false;
    game?.stop();
    game = null;
  }
  if (!was) return;
  if (msg) toast(msg);
  if (current === 'room' || current === 'game') show('multi');
  else renderTop();
}
$('#roomLeave').onclick = () => {
  sound.sfx('back');
  api('mp-leave', {}).catch(() => {});
  mpGone();
};
addEventListener('pagehide', () => mp.code && navigator.sendBeacon('/api/mp-leave', new Blob(['{}'], { type: 'application/json' })));
// 방 화면을 떠나면 준비를 풀어 둔다 (게임이 시작돼서 나가는 건 빼고)
LEAVE.room = (to) => {
  const me = mp.room?.players.find((p) => p.id === mp.room.me);
  if (to !== 'game' && mp.code && me?.ready && mp.room.host !== me.id) mpCmd('mp-ready', { ready: false });
};

/* 방 화면: 참가 코드 · 5×2 자리 · 곡(방장만 바꾸기) · 준비 · 시작 · 이번 판 결과 · 종합 순위(점수 합 · 1등 횟수 · 이전 판) */
RENDER.room = () => renderRoom();
function renderRoom() {
  const r = mp.room;
  if (!r) return;
  const me = r.players.find((p) => p.id === r.me), host = r.host === r.me, song = SONG[r.song], playing = r.status === 'playing';
  const others = r.players.filter((p) => p.id !== r.host), waiting = others.filter((p) => !p.ready);
  $('#roomCode').innerHTML = `참가 코드 <b>${esc(r.code)}</b><small>📋 복사</small>`;
  $('#roomCount').textContent = `${r.players.length} / ${MP.max}명`;
  $('#roomSeats').innerHTML = Array.from({ length: MP.max }, (_, i) => {
    const p = r.players.find((x) => x.seat === i);
    if (!p) return '<div class="seat empty"><span class="plus">+</span><small>빈 자리</small></div>';
    const isHost = p.id === r.host, tools = host && !isHost && !playing
      ? `<span class="seat-tools">${p.bot ? '' : `<button type="button" data-host="${p.id}" title="방장 넘기기" aria-label="${esc(p.name)}에게 방장 넘기기">👑</button>`}
          <button type="button" data-kick="${p.id}" title="${p.bot ? 'AI 빼기' : '내보내기 (다시 못 들어와요)'}" aria-label="${esc(p.name)} 내보내기">✕</button></span>` : '';
    return `<div class="seat${p.id === r.me ? ' me' : ''}${p.ready || isHost ? ' ready' : ''}${p.bot ? ' bot' : ''}"${p.bot ? '' : ` data-user="${esc(p.name)}"`}>
      ${isHost ? '<span class="crown">👑</span>' : ''}${tools}${framed(p.avatar, p.frame ?? 0)}<b>${esc(p.name)}</b><small>Lv.${fmt(+p.lv)}${p.id === r.me ? ' · 나' : ''}${p.wins ? ` · 🥇${p.wins}` : ''}</small>
      <span class="st">${isHost ? '방장' : p.bot ? `🤖 ${BOT_SKILL[p.bot]?.name ?? 'AI'}` : p.ready ? '✔ 준비 완료' : '준비 중…'}</span></div>`;
  }).join('');
  jacketTo($('#roomJacket'), song);
  $('#roomTitle').textContent = song.title;
  $('#roomDiff').textContent = `${DIFF_NAME[r.diff]} Lv.${chartLevel(song, r.diff)}`;
  $('#roomDiff').className = `tag d-${r.diff}`;
  $('#roomMeta').textContent = `${song.composer} · 방장이 고른 곡이에요${unlocked(state.save, song) ? '' : ' (안 산 곡도 이 방에서는 같이 연주할 수 있어요)'}`;
  $('#roomPick').hidden = !host || playing;
  if (host) {
    // 목록은 바뀔 때만 다시 만든다 (2초마다 다시 그려도 열어 둔 목록이 닫히지 않게)
    const sel = $('#roomSongSel'), list = SONGS.filter((x) => unlocked(state.save, x) || x.id === r.song), key = list.map((x) => x.id).join();
    if (sel.dataset.k !== key) {
      sel.innerHTML = songOptions(list);
      sel.dataset.k = key;
    }
    if (document.activeElement !== sel) sel.value = r.song;
    $('#roomDiffs').innerHTML = DIFFS.map((d) => `<button type="button" role="radio" class="d-${d}" data-diff="${d}" aria-checked="${d === r.diff}">
      <span>${DIFF_NAME[d]}</span><b>${chartLevel(song, d)}</b></button>`).join('');
  }
  $('#roomReady').hidden = host || playing;
  $('#roomReady').textContent = me?.ready ? '준비 취소' : '준비 완료!';
  $('#roomReady').classList.toggle('plain', Boolean(me?.ready));
  $('#roomStart').hidden = !host || playing;
  $('#roomStart').disabled = !others.length || waiting.length > 0;
  const closing = !playing && r.idleLeft != null && r.idleLeft < 300;
  $('#roomHint').textContent = closing ? `⏰ ${Math.max(1, Math.ceil(r.idleLeft / 60))}분 뒤에 방이 닫혀요 (연주를 시작하면 다시 30분)`
    : playing ? (mp.round === r.round ? '다른 친구들이 끝나길 기다리는 중…' : '지금 연주 중이에요. 이번 판이 끝나면 같이 해요!')
    : host ? (!others.length ? '참가 코드를 알려 주거나 친구를 초대 · AI를 넣어 주세요 (2명부터 시작)'
      : waiting.length ? `${waiting.map((p) => p.name).join(', ')}님이 아직 준비 중이에요` : '모두 준비 완료! 시작을 눌러 주세요')
      : me?.ready ? '방장이 시작하길 기다리는 중…' : '준비 완료를 누르면 방장이 시작할 수 있어요';
  $('#roomHint').classList.toggle('warn', closing);
  renderRoomResult(r);
  renderRoomBoard(r);
  renderTop();
}

// 이번 판 결과 (모두 끝나기 전에는 끝낸 사람부터)
function renderRoomResult(r) {
  const box = $('#roomResult'), mine = mp.round === r.round;
  box.hidden = r.status === 'lobby' || !r.players.some((p) => p.result);
  if (box.hidden) return;
  const rows = mpOrder(r.players.map((p) => ({ ...p, raw: Number(p.result?.raw) || 0 }))), w = mp.reward;
  box.innerHTML = `<h3>${r.status === 'done' ? '🏁 이번 판 결과' : '⏳ 다른 친구들이 끝나길 기다리는 중…'}</h3>
    <ol class="mp-result">${rows.map((p, i) => `<li class="${p.id === r.me ? 'me' : ''}">
      <span class="m">${p.result ? (['🥇', '🥈', '🥉'][i] ?? i + 1) : '…'}</span>${framed(p.avatar, p.frame ?? 0, 'sm')}<b>${esc(p.name)}</b>
      ${p.result ? `<small>${p.result.quit ? '포기' : `최대 ${fmt(+p.result.combo || 0)}콤보${p.result.fc ? ' · FULL COMBO' : ''}${p.result.cleared ? '' : ' · 클리어 실패'}`}</small>
        <span class="rk" data-r="${esc(p.result.rank)}">${esc(p.result.rank)}</span><em>${fmt(p.raw)}</em>` : '<small>연주 중…</small>'}</li>`).join('')}</ol>
    ${w && mine ? `<p class="mp-reward">내 보상 ${icon('coin')}+${fmt(w.coins)}${w.gems ? ` ${icon('gem')}+${fmt(w.gems)}` : ''} · EXP +${fmt(w.exp)}${w.newBest ? ' · 🎉 신기록!' : ''}</p>` : ''}`;
}

// 종합 순위: 이 방에서 쌓은 점수 합 · 1등 횟수 · 판 수 · 이전 판(순위 · 점수 · 랭크). 1~3등은 메달 카드, 막대는 1등 대비
function renderRoomBoard(r) {
  const box = $('#roomBoard'), any = r.players.some((p) => p.plays || p.last);
  box.hidden = !any;
  if (!any) return;
  const rows = [...r.players].sort((a, b) => Number(b.total) - Number(a.total) || b.wins - a.wins || a.seat - b.seat);
  const top = Math.max(1, Number(rows[0]?.total) || 0), rounds = Math.max(0, ...rows.map((p) => p.plays || 0));
  box.innerHTML = `<div class="rb-head"><h3>📊 종합 순위</h3><small>${fmt(rounds)}판 · 판마다 연주 점수를 더해요</small></div>
    <ol class="rb-list">${rows.map((p, i) => {
      const last = p.last, medal = ['🥇', '🥈', '🥉'][i];
      return `<li class="rb-row${i < 3 ? ` top t${i + 1}` : ''}${p.id === r.me ? ' me' : ''}${p.bot ? ' bot' : ''}"${p.bot ? '' : ` data-user="${esc(p.name)}"`}>
        <span class="rb-n">${medal ?? i + 1}</span>${framed(p.avatar, p.frame ?? 0, 'sm')}
        <span class="rb-who"><b>${esc(p.name)}${p.id === r.me ? ' <em>나</em>' : ''}</b>
          <small>${p.wins ? `<span class="rb-win">🥇×${p.wins}</span>` : ''}${fmt(p.plays || 0)}판${last ? ` · 이전 판 ${last.quit ? '<i class="q">포기</i>' : `<i class="pl p${last.place}">${last.place}위</i> ${fmt(last.raw)} <i class="rk" data-r="${esc(last.rank)}">${esc(last.rank)}</i>`}` : ''}</small>
          <span class="rb-bar"><i style="width:${((Number(p.total) || 0) / top) * 100}%"></i></span></span>
        <span class="rb-total">${fmt(Number(p.total) || 0)}<small>점</small></span></li>`;
    }).join('')}</ol>`;
}

$('#roomCode').onclick = () => {
  sound.sfx('tap');
  navigator.clipboard?.writeText(mp.code).then(() => toast(`참가 코드 ${mp.code} 복사했어요!`), () => toast(`참가 코드: ${mp.code}`));
};
$('#roomSeats').onclick = (e) => {
  const k = e.target.closest('[data-kick]'), h = e.target.closest('[data-host]');
  if (k) {
    if (!k.classList.contains('sure')) { // 실수로 누르지 않게 한 번 더
      k.classList.add('sure');
      k.textContent = '정말?';
      return setTimeout(() => k.isConnected && (k.classList.remove('sure'), (k.textContent = '✕')), 2500);
    }
    sound.sfx('back');
    return mpCmd('mp-kick', { user: +k.dataset.kick });
  }
  if (h) {
    sound.sfx('ok');
    mpCmd('mp-host', { user: +h.dataset.host });
    toast('방장을 넘겼어요');
  }
};
$('#roomInvite').onclick = openFriends;
$('#addBot').onclick = () => {
  sound.sfx('ok');
  mpCmd('mp-bot', { skill: $('#botSkill').value });
};
$('#roomReady').onclick = () => {
  const me = mp.room?.players.find((p) => p.id === mp.room.me);
  sound.sfx(me?.ready ? 'back' : 'ok');
  mpCmd('mp-ready', { ready: !me?.ready });
};
$('#roomStart').onclick = () => {
  sound.sfx('ok');
  $('#roomStart').disabled = true;
  mpCmd('mp-start');
};
// 랜덤 곡: 방장이 연 곡 중 지금 곡 말고 하나 (난이도는 그대로)
$('#roomRandom').onclick = () => {
  const r = mp.room, list = SONGS.filter((x) => unlocked(state.save, x) && x.id !== r?.song);
  if (!r || !list.length) return;
  const pick = list[Math.floor(Math.random() * list.length)];
  sound.sfx('flip', 0.1);
  toast(`🎲 ${pick.title}`);
  mpCmd('mp-set', { song: pick.id, diff: r.diff });
};
$('#roomSongSel').onchange = (e) => {
  sound.sfx('tap');
  mpCmd('mp-set', { song: e.target.value, diff: mp.room.diff });
};
$('#roomDiffs').onclick = (e) => {
  const b = e.target.closest('[data-diff]');
  if (!b) return;
  sound.sfx('tap');
  mpCmd('mp-set', { song: mp.room.song, diff: b.dataset.diff });
};

/* 게임: 모두 같은 서버 시각에 시작 · 가운데 내 화면 + 양옆 다른 참가자 화면 · 순위표 · 공격 */
async function startMulti(r) {
  Object.assign(mp, { round: r.round, on: true, charges: [], target: 0, lastFire: 0, log: [], seq: 0, result: null, reward: null });
  const song = SONG[r.song];
  $$('dialog[open]').forEach((d) => d.close());
  sound.get();
  stopMusic();
  $('#loading').hidden = false;
  let faces;
  try {
    faces = await loadRun(song, r.diff);
  } catch (e) {
    $('#loading').hidden = true;
    mp.on = false;
    return toast(e.message);
  }
  if (!mp.on || mp.round !== r.round) return void ($('#loading').hidden = true); // 그사이 방을 나갔다
  // 아이템 노트: 같은 곡 · 난이도 · 판 번호로 만들어서 모두 같은 자리에 같은 아이템 (서버도 같은 열쇠로 공격 수를 센다)
  mp.tiles = itemize(makeChart(song, r.diff).tiles, `${r.song}:${r.diff}:${r.round}`);
  playGame(song, r.diff, NO_BUFFS, faces, true, mp.tiles);
  // AI 공격 계획: 모든 화면이 같은 열쇠로 같은 계획을 만든다 (곡 시작 뒤 ms)
  const humans = mp.room.players.filter((p) => !p.bot).map((p) => p.id).sort((a, b) => a - b), dur = DUR[r.song] * 1000;
  mp.botAtk = mp.room.players.filter((p) => p.bot).flatMap((b) => botAttacks(b, `${r.song}:${r.diff}:${r.round}`, dur, humans)).sort((a, b) => a.at - b.at);
  mpBuild(mp.room);
  const at = performance.now() + (r.startAt - mp.offset - Date.now());
  readyText('다 같이 시작해요!', Math.max(600, at - performance.now() - 3000));
  for (const [n, text] of [[3, '3'], [2, '2'], [1, '1'], [0, '시작!']]) {
    const ms = at - n * 1000 - performance.now();
    if (ms > -400) setTimeout(() => current === 'game' && mp.on && readyText(text, n ? 800 : 600), Math.max(0, ms));
  }
  requestAnimationFrame(mpFrame);
  await game.start(at);
}

// 다른 참가자 카드: 작은 화면 + 순위 · 점수 · 콤보. 왼쪽 · 오른쪽에 번갈아 (오른쪽 위는 순위표 · 공격)
function mpBuild(r) {
  mp.views.clear();
  $('#mpLeft').innerHTML = $('#mpCards').innerHTML = '';
  const tiles = mp.tiles ?? makeChart(SONG[r.song], r.diff).tiles;
  // 휴대폰: 다른 사람 화면(작은 캔버스)은 그리지 않는다 (배터리 · 성능). 순위표를 눌러 목표를 고른다
  if (!isPC()) return mpLive(r);
  r.players.filter((p) => p.id !== r.me).forEach((p, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mp-card';
    el.dataset.id = p.id;
    el.title = '눌러서 공격 목표로';
    el.innerHTML = `<canvas></canvas><span class="mp-info"><span class="mp-who"><span class="mp-rk"></span>${framed(p.avatar, p.frame ?? 0, 'xs')}
      <b>${esc(p.name)}</b></span><em class="mp-sc">0</em><small class="mp-cb"></small><span class="mp-tg">🎯 목표</span></span>`;
    (i % 2 ? $('#mpCards') : $('#mpLeft')).append(el);
    mp.views.set(p.id, { el, mini: new Mini(el.querySelector('canvas'), tiles, LANE_COLORS) });
  });
  mpLive(r);
}

function mpFrame() {
  if (!mp.on || !game || current !== 'game') return;
  mpFrame.n = (mpFrame.n ?? 0) + 1;
  try {
    while (game.running && mp.botAtk?.length && game.time() * 1000 >= mp.botAtk[0].at) mpEvent(mp.botAtk.shift());
    if (game.running && mpFrame.n % 2) {
      const t = game.time() - Mini.DELAY;
      for (const v of mp.views.values()) v.mini.draw(t);
    }
  } catch (e) {
    reportError2(e);
  }
  requestAnimationFrame(mpFrame);
}

// 순위 계산용: 나는 지금 게임 값, 다른 사람은 받은 상태(끝냈으면 결과)
const mpRows = (r) => r.players.map((p) => {
  const mine = p.id === r.me && mp.on && game;
  return {
    id: p.id, seat: p.seat, name: p.name, avatar: p.avatar, done: Boolean(p.result),
    raw: mine ? game.raw : Number(p.result?.raw ?? p.state?.raw) || 0, combo: mine ? game.combo : Number(p.state?.combo) || 0,
  };
});

function mpLive(r) {
  const rows = mpRows(r), order = mpOrder(rows), target = mpTarget(rows, r.me, mp.target);
  $('#mpBoard').innerHTML = order.map((p, i) => `<li data-id="${p.id}" class="${p.id === r.me ? 'me' : ''}${p.id === target ? ' tg' : ''}"><span class="n">${i + 1}</span>
    ${framed(p.avatar, 0, 'xs')}<b>${esc(p.name)}</b><em>${fmt(p.raw)}</em></li>`).join('');
  for (const p of r.players) {
    const v = mp.views.get(p.id), row = rows.find((x) => x.id === p.id);
    if (!v) continue;
    v.mini.feed(p.state?.ev);
    v.el.querySelector('.mp-rk').textContent = `${order.indexOf(row) + 1}위`;
    v.el.querySelector('.mp-sc').textContent = fmt(row.raw);
    v.el.querySelector('.mp-cb').textContent = p.result ? (p.result.quit ? '포기했어요' : '완주!') : `${fmt(row.combo)} 콤보${p.state?.dead ? ' · 체력 0' : ''}`;
    v.el.classList.toggle('target', p.id === target);
  }
  for (const [id, v] of mp.views) {
    if (r.players.some((p) => p.id === id)) continue;
    v.el.classList.add('gone');
    v.el.querySelector('.mp-cb').textContent = '나갔어요';
  }
  mp.aim = target;
  renderAtk();
}

// 공격 칸: 모아 둔 공격(아이콘) · 발사 키 · 목표
function renderAtk(gained) {
  const n = mp.charges.length;
  $('#mpCharges').innerHTML = Array.from({ length: MP.maxCharges }, (_, i) => `<i class="${i < n ? 'on' : ''}">${i < n ? ATTACKS[mp.charges[i]].icon : ''}</i>`).join('');
  $('#mpAtkHint').textContent = n ? `${isPC() ? keyLabel(atkKey()) : '눌러서'} → ${mp.aim ? mpName(mp.aim) : '목표 없음'}` : '아이템 노트를 치면 충전';
  $('#mpAtk').classList.toggle('ready', n > 0);
  if (gained) $('#mpAtk').animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 300 });
}

// 판정마다: 다른 참가자에게 보낼 기록
function mpJudge(name, combo, lane) {
  if (!game) return;
  mp.log.push([lane, JN.indexOf(name), Math.round(game.time() * 1000), ++mp.seq]);
}
// 아이템 노트를 치면 그 공격 1번 충전 (최대 3번 모아 두기)
function onItem(kind) {
  if (!state.run?.multi || !ATTACKS[kind]) return;
  if (mp.charges.length >= MP.maxCharges) return void mpAlert('공격이 꽉 찼어요! 먼저 써 주세요', 'out');
  mp.charges.push(kind);
  sound.sfx('coin', 0.1);
  mpAlert(`${ATTACKS[kind].icon} ${ATTACKS[kind].name} 획득! ${isPC() ? `${keyLabel(atkKey())}로` : '⚡ 버튼으로'} 발사`, 'out');
  renderAtk(true);
}

function mpState() {
  const g = game, now = Math.round(g.time() * 1000);
  mp.log = mp.log.filter((e) => e[2] > now - 1500).slice(-60);
  return { raw: g.raw, combo: g.combo, max: g.maxCombo, hp: Math.round(g.hp), n: JN.map((k) => g.stats[k]), ev: mp.log, dead: g.dead };
}

function fireAttack() {
  const btn = $('#mpAtk');
  btn.blur();
  if (!mp.on || !game) return;
  if (!mp.charges.length) return void btn.animate([{ translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], { duration: 200 });
  const now = performance.now(), to = mpTarget(mpRows(mp.room), mp.room.me, mp.target);
  if (now - mp.lastFire < 1500 || !to) return;
  const kind = mp.charges.shift();
  mp.lastFire = now;
  mp.views.get(to)?.mini.attack(kind, MP.attackMs);
  mpAlert(`${ATTACKS[kind].icon} ${ATTACKS[kind].name} → ${mpName(to)}!`, 'out');
  sound.sfx('flip', 0.12);
  renderAtk();
  mpSync({ atk: { to, kind } }).catch(() => {});
}
$('#mpAtk').onclick = fireAttack;
// 순위표 줄을 눌러도 목표 바꾸기 (휴대폰은 이것만)
$('#mpBoard').onclick = (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li || !mp.on || +li.dataset.id === mp.room?.me) return;
  mp.target = +li.dataset.id;
  sound.sfx('tap', 0.08);
  mpLive(mp.room);
};
$('#mpLeft').onclick = $('#mpCards').onclick = (e) => {
  const c = e.target.closest('.mp-card');
  if (!c || !mp.on) return;
  c.blur();
  mp.target = +c.dataset.id;
  sound.sfx('tap');
  mpLive(mp.room);
};

// 받은 공격은 내 화면에, 다른 사람끼리의 공격은 그 사람 작은 화면에
function mpEvent(e) {
  const k = ATTACKS[e.kind], me = mp.room.me;
  if (!k || e.from === me) return;
  if (e.to !== me) return mp.views.get(e.to)?.mini.attack(e.kind, MP.attackMs);
  game?.attack(e.kind, MP.attackMs);
  mpAlert(`💥 ${mpName(e.from)}님의 ${k.icon} ${k.name}!`, 'in');
  sound.sfx('back', 0.14);
}

function mpAlert(text, cls) {
  const el = $('#mpAlert');
  el.textContent = text;
  el.className = `mp-alert ${cls}`;
  el.hidden = false;
  el.getAnimations().forEach((a) => (a.currentTime = 0));
  clearTimeout(el.t);
  el.t = setTimeout(() => (el.hidden = true), 1800);
}

// 곡이 끝나면: 결과를 방에 올리고 보상(코인 · 경험치 · 기록)은 싱글과 똑같이. 포기하면 보상 없음
async function finishMulti(r, quit = false) {
  const { song, diff } = state.run;
  game = null;
  mp.on = false;
  mp.result = { raw: r.raw, rank: r.rank, combo: r.combo, n: JN.map((k) => r.stats[k]), cleared: r.cleared, fc: r.fullCombo, quit };
  sound.sfx(!quit && r.cleared ? 'fan' : 'back', 0.12);
  show('room');
  mpSync({ result: mp.result }).catch(() => {});
  if (quit) return;
  try {
    mp.reward = await doAct({
      type: 'finish', multi: true, song: song.id, diff, raw: r.raw, score: r.score, combo: r.combo, rank: r.rank,
      cleared: r.cleared, fullCombo: r.fullCombo, allPerfect: r.allPerfect, perfect: r.stats.perfect,
    });
    rankCache.delete(`${song.id}:${diff}`);
  } catch (e) {
    toast(e.message);
  }
  renderTop();
  if (current === 'room') renderRoom();
}
function mpQuit() {
  const g = game;
  if (!g) return;
  g.stop();
  $('#paused').hidden = true;
  finishMulti({ raw: g.raw, score: g.score, rank: rankOf(g.raw), combo: g.maxCombo, stats: g.stats, cleared: false, fullCombo: false, allPerfect: false }, true);
}

/* ---------- 배경 파티클: 꽃잎 · 밤하늘 별 · 꽃가루 ---------- */

const fx = $('#sceneFx'), fg = fx.getContext('2d');
const rand = (a, b) => a + Math.random() * (b - a);
const PETAL = ['#ffc4da', '#ffb0cc', '#ffffff', '#ffd9e8'];
const newPetal = (top) => ({ x: rand(0, fx.clientWidth), y: top ? -20 : rand(0, fx.clientHeight), r: rand(5, 10), vy: rand(20, 46), sway: rand(0, 6.3), spin: rand(0, 6.3), c: PETAL[Math.floor(rand(0, 4))] });
let petals = [], starsBg = [], bits = [];

function sizeFx() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  fx.width = fx.clientWidth * dpr;
  fx.height = fx.clientHeight * dpr;
  fg.setTransform(dpr, 0, 0, dpr, 0, 0);
  petals = Array.from({ length: 24 }, () => newPetal(false));
  starsBg = Array.from({ length: 40 }, () => ({ x: rand(0, fx.clientWidth), y: rand(0, fx.clientHeight * 0.6), r: rand(1.5, 4), ph: rand(0, 6.3) }));
}
addEventListener('resize', sizeFx);
sizeFx();

function confetti() {
  for (let i = 0; i < 100; i++) {
    bits.push({ x: rand(0, fx.clientWidth), y: rand(-80, -10), vx: rand(-60, 60), vy: rand(80, 240), rot: rand(0, 6.3), vr: rand(-8, 8), w: rand(6, 11), h: rand(10, 16), c: ['#ff8db6', '#ffd25e', '#74c0ff', '#7fdcb5', '#b39cff', '#fff'][i % 6] });
  }
}

function sparkle(x, y, r) {
  fg.beginPath();
  fg.moveTo(x, y - r);
  fg.quadraticCurveTo(x, y, x + r, y);
  fg.quadraticCurveTo(x, y, x, y + r);
  fg.quadraticCurveTo(x, y, x - r, y);
  fg.quadraticCurveTo(x, y, x, y - r);
  fg.fill();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000), W = fx.clientWidth, H = fx.clientHeight;
  last = now;
  fg.clearRect(0, 0, W, H);
  if (current === 'game' || current === 'result') {
    fg.fillStyle = '#fff';
    for (const s of starsBg) {
      fg.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(now / 900 + s.ph));
      sparkle(s.x, s.y, s.r);
    }
  } else {
    for (const p of petals) {
      p.y += p.vy * dt;
      p.sway += dt * 1.5;
      p.spin += dt * 2.2;
      if (p.y > H + 20) Object.assign(p, newPetal(true));
      fg.save();
      fg.translate(p.x + Math.sin(p.sway) * 24, p.y);
      fg.rotate(p.spin);
      fg.scale(1, 0.45 + 0.55 * Math.abs(Math.cos(p.spin * 0.8)));
      fg.globalAlpha = 0.9;
      fg.fillStyle = p.c;
      fg.beginPath(); // 벚꽃잎 (끝이 살짝 갈라진 물방울)
      fg.moveTo(0, p.r);
      fg.bezierCurveTo(p.r, p.r * 0.4, p.r * 0.8, -p.r * 0.8, p.r * 0.2, -p.r);
      fg.lineTo(0, -p.r * 0.7);
      fg.lineTo(-p.r * 0.2, -p.r);
      fg.bezierCurveTo(-p.r * 0.8, -p.r * 0.8, -p.r, p.r * 0.4, 0, p.r);
      fg.fill();
      fg.restore();
    }
  }
  bits = bits.filter((b) => {
    b.vy += 260 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vr * dt;
    fg.save();
    fg.globalAlpha = 1;
    fg.translate(b.x, b.y);
    fg.rotate(b.rot);
    fg.scale(Math.cos(b.rot * 1.3), 1);
    fg.fillStyle = b.c;
    fg.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    fg.restore();
    return b.y < H + 30;
  });
  fg.globalAlpha = 1;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
renderTop();
$('#stall').onclick = () => sound.get();

// 팝업 바깥(어두운 배경)을 누르면 닫기 (처음 사용법 안내는 빼고)
document.addEventListener('click', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDialogElement) || !d.open || d.id === 'welcome') return;
  const r = d.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
});
