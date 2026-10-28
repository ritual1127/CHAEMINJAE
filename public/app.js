// 화면 전환 · 로그인 · 곡 선택 · 결과/랭킹 UI
import { SONGS, LANES, sound, Game } from './game.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const scene = $('#scene');
const settings = { speed: 5, offset: 0, music: true, hitsfx: true, ...load('settings', {}) };
const state = { me: null, guestBest: load('guestBest', {}), song: 0, diff: 'normal', rankSong: 0, rankDiff: 'normal', from: 'lobby' };
let current = 'title';
let game = null;

async function api(path, body) {
  const res = await fetch(`/api/${path}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '연결이 불안정해요. 잠시 후 다시 시도해 주세요');
  return data;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

const bestOf = (song, diff) => (state.me ? state.me.best : state.guestBest)[`${song}:${diff}`];

const loadImg = (src) => new Promise((ok, fail) => Object.assign(new Image(), { onload() { ok(this); }, onerror: fail, src }));
const laneImages = Promise.all(LANES.map((l) => loadImg(`assets/${l.char}.webp`)));

/* ---------- 화면 전환 ---------- */

function show(id) {
  if (id === 'back') id = state.from;
  if (id === 'rank' && current !== 'rank') state.from = current;
  current = id;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  scene.dataset.mode = id;
  ({ lobby: renderMe, select: renderSelect, rank: renderRank })[id]?.();
  music();
}

function music() {
  if (!sound.ctx) return;
  if (!settings.music || current === 'game' || current === 'result' || current === 'title') return sound.stopBgm();
  sound.bgm(SONGS[current === 'select' ? state.song : 0]);
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  sound.get();
  sound.sfx(['back', 'lobby'].includes(go.dataset.go) ? 'back' : 'tap');
  show(go.dataset.go);
});

/* ---------- 타이틀 · 로그인 ---------- */

const meReady = api('me').then((me) => (state.me = me)).catch(() => null);
let authMode = 'login';
let pickAvatar = 1 + Math.floor(Math.random() * 32);

function avatarGrid(el, get, set) {
  el.innerHTML = Array.from({ length: 32 }, (_, i) =>
    `<button type="button" class="av" data-n="${i + 1}" aria-label="프로필 ${i + 1}번"><img src="assets/avatars/${i + 1}.webp" alt="" loading="lazy"></button>`).join('');
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
avatarGrid($('#signupAvatars'), () => pickAvatar, (n) => (pickAvatar = n));

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
    show('lobby');
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
    state.me = await api(authMode, body);
    sound.sfx('ok');
    f.reset();
    $('#auth').hidden = true;
    $('#touch').hidden = false;
    toast(authMode === 'signup' ? `반가워요, ${state.me.username}!` : `어서 와요, ${state.me.username}!`);
    show('lobby');
  } catch (err) {
    sound.sfx('back');
    $('#auth .err').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$('#guest').onclick = () => {
  sound.sfx('tap');
  state.me = null;
  $('#auth').hidden = true;
  $('#touch').hidden = false;
  toast('게스트 기록은 이 기기에만 저장돼요');
  show('lobby');
};

/* ---------- 로비 ---------- */

function renderMe() {
  const me = state.me, plays = me?.plays ?? 0;
  $('#meName').textContent = me ? me.username : '게스트';
  $('#meAvatar').src = `assets/avatars/${me?.avatar ?? 1}.webp`;
  $('#meLv').textContent = `Lv.${1 + Math.floor(plays / 3)}`;
  $('#meExp').style.width = `${((plays % 3) / 3) * 100}%`;
}

const LINES = ['와아!', '야하!', '우라!', '같이 놀자!', '리듬 타자~', '두근두근!', '헤헤', '플레이 눌러 줘!'];
const trio = $('.trio'), bubble = $('.bubble');
trio.addEventListener('click', () => {
  if (current !== 'lobby') return;
  sound.sfx('tap');
  trio.classList.remove('jump');
  void trio.offsetWidth;
  trio.classList.add('jump');
  bubble.textContent = LINES[Math.floor(Math.random() * LINES.length)];
  bubble.hidden = false;
  bubble.getAnimations().forEach((a) => (a.currentTime = 0));
  clearTimeout(bubble.t);
  bubble.t = setTimeout(() => (bubble.hidden = true), 1600);
});
trio.addEventListener('animationend', (e) => e.animationName === 'jump' && trio.classList.remove('jump'));

/* ---------- 설정 ---------- */

const setEl = { speed: $('#speed'), offset: $('#offset'), music: $('#music'), hitsfx: $('#hitsfx') };
function syncSettings() {
  setEl.speed.value = settings.speed;
  setEl.offset.value = settings.offset;
  setEl.music.checked = settings.music;
  setEl.hitsfx.checked = settings.hitsfx;
  $('#speedVal').textContent = settings.speed.toFixed(1);
  $('#offsetVal').textContent = `${settings.offset > 0 ? '+' : ''}${settings.offset}ms`;
}
$('#settings').addEventListener('input', () => {
  const musicChanged = settings.music !== setEl.music.checked;
  Object.assign(settings, { speed: +setEl.speed.value, offset: +setEl.offset.value, music: setEl.music.checked, hitsfx: setEl.hitsfx.checked });
  save('settings', settings);
  syncSettings();
  if (musicChanged) music();
});
$$('[data-open="settings"]').forEach((b) => (b.onclick = () => {
  sound.sfx('tap');
  syncSettings();
  $('#settings').showModal();
}));

/* ---------- 내 정보 ---------- */

const syncProfileAvatars = avatarGrid($('#profileAvatars'), () => state.me?.avatar, async (n) => {
  const prev = state.me.avatar;
  state.me.avatar = n;
  $('#pAvatar').src = $('#meAvatar').src = `assets/avatars/${n}.webp`;
  try { await api('avatar', { avatar: n }); } catch (err) {
    state.me.avatar = prev;
    $('#pAvatar').src = $('#meAvatar').src = `assets/avatars/${prev}.webp`;
    syncProfileAvatars();
    toast(err.message);
  }
});

function openProfile() {
  sound.sfx('tap');
  const me = state.me;
  if (!me) {
    toast('로그인하면 내 정보와 랭킹 기록이 생겨요!');
    show('title');
    return openAuth('signup');
  }
  $('#pAvatar').src = `assets/avatars/${me.avatar}.webp`;
  $('#pName').textContent = me.username;
  $('#pPlays').textContent = `Lv.${1 + Math.floor(me.plays / 3)} · ${me.plays}번 플레이`;
  const rows = SONGS.flatMap((s) => ['easy', 'normal'].map((d) => [s, d, me.best[`${s.id}:${d}`]])).filter((r) => r[2]);
  $('#pBest').innerHTML = rows.length
    ? rows.map(([s, d, b]) => `<li><span>${esc(s.title)} · ${d.toUpperCase()}</span><span>${b.score.toLocaleString()} ${b.rank}</span></li>`).join('')
    : '<li>아직 기록이 없어요. 한 곡 해 볼까요?</li>';
  syncProfileAvatars();
  $('#profile').showModal();
}
$('#profileBtn').onclick = openProfile;
$('#profileBtn2').onclick = openProfile;

$('#logout').onclick = async () => {
  try { await api('logout', {}); } catch {}
  state.me = null;
  $('#profile').close();
  toast('또 놀러 와요!');
  show('title');
  openAuth();
};

/* ---------- 곡 선택 ---------- */

const car = $('#carousel');
car.innerHTML = SONGS.map((s, i) => `
  <article class="card" style="--tilt:${[-2, 1.5, -1][i]}deg">
    <img src="${s.jacket}" alt="">
    <h3>${esc(s.title)}</h3>
    <div class="meta"><span class="tag">BPM ${s.bpm}</span><span class="tag lvtag">Lv.<span class="lvn"></span></span></div>
  </article>`).join('');
$('#dots').innerHTML = SONGS.map(() => '<i></i>').join('');
const cardStep = () => car.children[1].offsetLeft - car.children[0].offsetLeft;

car.addEventListener('scroll', () => {
  clearTimeout(car.t);
  car.t = setTimeout(() => pickSong(Math.round(car.scrollLeft / cardStep())), 90);
}, { passive: true });
car.addEventListener('click', (e) => {
  const i = [...car.children].indexOf(e.target.closest('.card'));
  if (i >= 0) car.scrollTo({ left: i * cardStep(), behavior: 'smooth' });
});

function pickSong(i) {
  if (i === state.song || !SONGS[i]) return;
  state.song = i;
  sound.sfx('tap');
  updateSelect();
  music();
}

function renderSelect() {
  car.scrollTo({ left: state.song * cardStep() });
  updateSelect();
}

function updateSelect() {
  const s = SONGS[state.song], b = bestOf(s.id, state.diff);
  [...car.children].forEach((c, i) => c.classList.toggle('on', i === state.song));
  $$('#dots i').forEach((d, i) => d.classList.toggle('on', i === state.song));
  $$('.card .lvn').forEach((el, i) => (el.textContent = SONGS[i].level[state.diff]));
  $$('#diffSeg button').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.diff === state.diff);
    btn.querySelector('small').textContent = `Lv.${s.level[btn.dataset.diff]}`;
  });
  $('#best').innerHTML = b ? `최고 기록 <b>${b.score.toLocaleString()}</b> · ${b.rank}` : '아직 기록이 없어요';
}

$('#diffSeg').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.sfx('tap');
  state.diff = b.dataset.diff;
  updateSelect();
};

/* ---------- 게임 ---------- */

const judgeEl = $('#gJudge'), comboEl = $('#gCombo'), field = $('#field');
const LABEL = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };

function onJudge(name, combo, score) {
  judgeEl.textContent = LABEL[name];
  judgeEl.className = `judge ${name}`;
  judgeEl.animate([
    { opacity: 1, transform: 'scale(1.4)' },
    { opacity: 1, transform: 'scale(1)', offset: 0.25 },
    { opacity: 0, transform: 'translateY(-16px)' },
  ], { duration: 520, easing: 'ease-out' });
  comboEl.hidden = combo < 2;
  if (combo >= 2) {
    comboEl.firstElementChild.textContent = combo;
    comboEl.animate([{ transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 160 });
  }
  $('#gScore').textContent = score.toLocaleString();
}

function readyText(text, ms) {
  const r = $('#ready'), p = r.firstElementChild;
  p.textContent = text;
  r.hidden = false;
  p.getAnimations().forEach((a) => (a.currentTime = 0));
  clearTimeout(r.t);
  r.t = setTimeout(() => (r.hidden = true), ms);
}

async function startGame() {
  sound.get();
  sound.bgm(null);
  const song = SONGS[state.song];
  $('#loading').hidden = false;
  let images;
  try { [images] = await Promise.all([laneImages, sound.load(song)]); } catch {
    $('#loading').hidden = true;
    return toast('곡을 준비하지 못했어요. 다시 시도해 주세요');
  }
  $('#loading').hidden = true;
  game?.stop();
  show('game');
  $('#gTitle').textContent = `${song.title} · ${state.diff.toUpperCase()}`;
  $('#gScore').textContent = '0';
  $('#gProg').style.width = '0';
  $('#paused').hidden = true;
  comboEl.hidden = true;
  judgeEl.className = 'judge';
  game = new Game(field, {
    song, diff: state.diff, speed: settings.speed, offset: settings.offset, hitSound: settings.hitsfx, images,
    onJudge,
    onTick: (p) => ($('#gProg').style.width = `${p * 100}%`),
    onEnd: finish,
  });
  readyText('준비~', 1100);
  setTimeout(() => current === 'game' && readyText('시작!', 600), 1100);
  await game.start();
}
$('#start').onclick = () => { sound.sfx('ok'); startGame(); };

const pointers = new Map();
field.addEventListener('pointerdown', (e) => {
  if (!game) return;
  e.preventDefault();
  const lane = game.laneAt(e.clientX - field.getBoundingClientRect().left);
  pointers.set(e.pointerId, lane);
  game.press(lane);
});
const lift = (e) => {
  if (!pointers.has(e.pointerId)) return;
  game?.release(pointers.get(e.pointerId));
  pointers.delete(e.pointerId);
};
field.addEventListener('pointerup', lift);
field.addEventListener('pointercancel', lift);
field.addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (current !== 'game' || !game || e.repeat) return;
  const lane = LANES.findIndex((l) => l.key === e.code);
  if (lane >= 0) {
    e.preventDefault();
    game.press(lane);
  } else if (e.code === 'Escape') {
    $('#paused').hidden ? pauseGame() : resumeGame();
  }
});
addEventListener('keyup', (e) => {
  const lane = LANES.findIndex((l) => l.key === e.code);
  if (lane >= 0) game?.release(lane);
});
addEventListener('resize', () => game?.resize());
document.addEventListener('visibilitychange', () => document.hidden && pauseGame());

function pauseGame() {
  if (current === 'game' && game?.pause()) $('#paused').hidden = false;
}
function resumeGame() {
  $('#paused').hidden = true;
  game.resume();
  readyText('다시 시작!', 1300);
}
$('#pauseBtn').onclick = () => { sound.sfx('tap'); pauseGame(); };
$('#resume').onclick = resumeGame;
$('#retryP').onclick = () => { game.stop(); startGame(); };
$('#retry').onclick = () => { sound.sfx('ok'); startGame(); };
$('#quit').onclick = () => {
  game.stop();
  game = null;
  sound.sfx('back');
  show('select');
};

/* ---------- 결과 ---------- */

const MSG = { S: '완벽해! 야하~!', A: '대단해! 박수 짝짝짝', B: '좋아좋아, 리듬 탔다!', C: '조금만 더 하면 돼!', D: '울지 마… 다시 해 보자' };

async function finish(r) {
  const song = SONGS[state.song], key = `${song.id}:${state.diff}`, prev = bestOf(song.id, state.diff);
  const newBest = !prev || r.score > prev.score;
  game = null;
  show('result');
  $('#rJacket').src = song.jacket;
  $('#rTitle').textContent = song.title;
  $('#rDiff').textContent = `${state.diff.toUpperCase()} Lv.${song.level[state.diff]}`;
  $('#rRank').textContent = r.rank;
  $('#rRank').className = `stamp r-${r.rank}`;
  $('#rMsg').textContent = MSG[r.rank];
  $('#rNew').hidden = !newBest;
  $('#rFc').hidden = r.stats.miss > 0;
  $('#rFc').textContent = r.stats.perfect === r.total ? 'ALL PERFECT' : 'FULL COMBO';
  $('#rStats').innerHTML = ['perfect', 'great', 'good', 'miss']
    .map((k) => `<li class="${k}"><span>${LABEL[k]}</span><b>${r.stats[k]}</b></li>`).join('') +
    `<li><span>MAX COMBO</span><b>${r.combo} / ${r.total}</b></li>`;
  countUp($('#rScore'), r.score);
  sound.sfx('fan', 0.12);
  if ('SA'.includes(r.rank)) confetti();

  const rec = { score: r.score, combo: r.combo, rank: r.rank };
  if (!state.me) {
    if (newBest) save('guestBest', Object.assign(state.guestBest, { [key]: rec }));
    $('#rNote').textContent = '로그인하면 랭킹에 내 기록이 올라가요!';
    return;
  }
  $('#rNote').textContent = '기록 저장 중…';
  try {
    await api('score', { song: song.id, diff: state.diff, ...rec });
    state.me.plays++;
    if (newBest) state.me.best[key] = rec;
    $('#rNote').textContent = newBest ? '랭킹에 새 기록이 올라갔어요!' : '플레이 기록이 저장됐어요';
  } catch (err) {
    $('#rNote').textContent = err.message;
  }
}

function countUp(el, to) {
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 900);
    el.textContent = Math.round(to * (1 - (1 - p) ** 3)).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- 랭킹 ---------- */

$('#rankSongs').innerHTML = SONGS.map((s, i) => `<button type="button" data-i="${i}"><img src="${s.jacket}" alt="">${esc(s.title)}</button>`).join('');
$('#rankSongs').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.sfx('tap');
  state.rankSong = +b.dataset.i;
  renderRank();
};
$('#rankDiff').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sound.sfx('tap');
  state.rankDiff = b.dataset.diff;
  renderRank();
};

async function renderRank() {
  $$('#rankSongs button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.i === state.rankSong));
  $$('#rankDiff button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.diff === state.rankDiff));
  const list = $('#rankList'), want = `${state.rankSong}:${state.rankDiff}`;
  list.innerHTML = '<li class="empty">불러오는 중…</li>';
  let html;
  try {
    const rows = await api(`rank?song=${SONGS[state.rankSong].id}&diff=${state.rankDiff}`);
    html = rows.length
      ? rows.map((r) => `<li class="${r.username === state.me?.username ? 'me' : ''}"><img src="assets/avatars/${+r.avatar}.webp" alt=""><span class="nm">${esc(r.username)}</span><span class="sc">${r.score.toLocaleString()}</span><span class="rk">${esc(r.rank)}</span></li>`).join('')
      : '<li class="empty">아직 아무도 없어요. 첫 1등이 되어 보세요!</li>';
  } catch (err) {
    html = `<li class="empty">${esc(err.message)}</li>`;
  }
  if (want === `${state.rankSong}:${state.rankDiff}`) list.innerHTML = html;
}

/* ---------- 배경 파티클: 꽃잎 · 밤하늘 별 · 꽃가루 ---------- */

const fx = $('#sceneFx'), fg = fx.getContext('2d');
const rand = (a, b) => a + Math.random() * (b - a);
const PETAL = ['#ffc4da', '#ffb0cc', '#ffffff', '#ffd9e8'];
const newPetal = (top) => ({ x: rand(0, fx.clientWidth), y: top ? -20 : rand(0, fx.clientHeight), r: rand(5, 10), vy: rand(20, 46), sway: rand(0, 6.3), spin: rand(0, 6.3), c: PETAL[Math.floor(rand(0, 4))] });
let petals = [], stars = [], bits = [];

function sizeFx() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  fx.width = fx.clientWidth * dpr;
  fx.height = fx.clientHeight * dpr;
  fg.setTransform(dpr, 0, 0, dpr, 0, 0);
  petals = Array.from({ length: 22 }, () => newPetal(false));
  stars = Array.from({ length: 34 }, () => ({ x: rand(0, fx.clientWidth), y: rand(0, fx.clientHeight * 0.6), r: rand(1.5, 4), ph: rand(0, 6.3) }));
}
addEventListener('resize', sizeFx);
sizeFx();

function confetti() {
  const W = fx.clientWidth;
  for (let i = 0; i < 90; i++) {
    bits.push({ x: rand(0, W), y: rand(-80, -10), vx: rand(-60, 60), vy: rand(80, 240), rot: rand(0, 6.3), vr: rand(-8, 8), w: rand(6, 11), h: rand(10, 16), c: ['#ff8db6', '#ffd25e', '#74c0ff', '#7fdcb5', '#b39cff', '#fff'][i % 6] });
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
    for (const s of stars) {
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

// 첫 화면 이후 남은 곡들을 미리 합성해 둔다
meReady.then(() => setTimeout(() => SONGS.reduce((p, s) => p.then(() => sound.load(s)).catch(() => {}), Promise.resolve()), 1500));
