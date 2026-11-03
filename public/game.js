// 리듬게임 엔진 + 소리 (곡 합성, 타격음, 캐릭터 목소리, 효과음)
// 곡(멜로디 · 반주 · 베이스 · 드럼)은 미리 한 번에 합성해 틀어 두고, 납작한 노트가 판정선에 닿을 때 누른다.
import { compile, makeChart, playSong } from './songs.js';

// 구형 iOS Safari(15 이하) · 일부 안드로이드 웹뷰에는 roundRect가 없어서, 없으면 그리기가 통째로 멈춘다 → 직접 만든다
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r = 0) {
    r = Math.max(0, Math.min(Array.isArray(r) ? r[0] ?? 0 : r, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

export const JUDGES = [
  { name: 'perfect', w: 0.05, v: 1 },
  { name: 'great', w: 0.1, v: 0.7 },
  { name: 'good', w: 0.15, v: 0.4 },
];
export const judgeOf = (dt, bonus = 0) => JUDGES.find((j) => Math.abs(dt) <= j.w + bonus) ?? null;
export const rankOf = (raw) => (raw >= 950000 ? 'S' : raw >= 850000 ? 'A' : raw >= 700000 ? 'B' : raw >= 500000 ? 'C' : 'D');

const INK = '#4a3953';
const ITEM_ICON = { fog: '☁️', shake: '🌀', speed: '⚡', bomb: '💣' }; // 멀티 아이템 노트 (rules.js ATTACKS와 같은 종류)
const freq = (m) => 440 * 2 ** ((m - 69) / 12);

// '#rrggbb' 두 색을 섞기 (노트 윗면 하이라이트용)
function mix(a, b, k) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`;
}

/* ---------- 곡 합성 ---------- */
// Web Audio 노드를 음마다 만들면 노드가 수천 개라 느리다 (긴 곡은 10초+). 그래서 샘플을 자바스크립트로 직접 더한다.
// 음 하나 = 파형표를 읽으며 엔벌로프를 곱해 더하기, 드럼 = 한 번 만들어 둔 샘플을 더하기, 끝에 리버브 · 소프트 클립 · 음량 맞춤

const SR = 32000, TAB = 2048;

// 음색: 배음 세기 목록(h) / sub: 한 옥타브 아래부터 배음을 센다(오르간) / a: 어택(초) / d: 감쇠 시간상수 (없으면 계속 울림)
// ring: 윗배음 하나를 짧게 더한다 (ringAt 반음 위 · ringVol 세기, 기본은 종소리) / det: 살짝 어긋난 음 여러 개를 겹친다(센트, 슈퍼소우)
const odd = (n, k) => Array.from({ length: n }, (_, i) => ((i + 1) % 2 ? k / (i + 1) : 0));
const saw = (n, k) => Array.from({ length: n }, (_, i) => k / (i + 1));
const INSTR = {
  piano: { h: [1, 0.35, 0.23, 0.03, 0.05, 0.02], a: 0.005, d: 0.55 },
  organ: { h: [0.35, 1, 0, 0.55, 0, 0.22, 0, 0.28, 0, 0, 0, 0, 0, 0, 0, 0.1], sub: true, a: 0.03 },
  bell: { h: [1, 0.22, 0.12, 0.05, 0, 0.04], a: 0.003, d: 0.8, ring: true },
  lead: { h: odd(11, 0.45).map((v, i) => v + saw(11, 0.3)[i]), a: 0.008, d: 1.6 },
  brass: { h: saw(9, 0.7).map((v, i) => v * (1 - i * 0.06)), a: 0.03, d: 1.2 },
  bass: { h: saw(6, 1), a: 0.008, d: 0.6 },
  ring: { h: [1], a: 0.003, d: 0.25 },
  // EDM · 칩튠 · 퐁크 · 로파이 · 민요용
  saw: { h: saw(12, 1), a: 0.012, d: 2.4, det: [-14, 0, 14] },
  pluck: { h: saw(8, 1).map((v, i) => v * (1 - i * 0.09)), a: 0.002, d: 0.2 },
  chip: { h: odd(11, 1), a: 0.002, d: 4 },
  tri: { h: [1, 0, 0.11, 0, 0.04, 0, 0.02], a: 0.004, d: 2.5 },
  pad: { h: [1, 0.5, 0.3, 0.2, 0.12, 0.08], a: 0.18, det: [-8, 8] },
  sub: { h: [1, 0.12, 0.04], a: 0.006, d: 1.1 },
  cow: { h: [1, 0.3, 0.12], a: 0.001, d: 0.1, ring: true, ringAt: 6.8, ringVol: 0.55 },
  epiano: { h: [1, 0.3, 0.08, 0.03], a: 0.004, d: 0.9, ring: true, ringAt: 28, ringVol: 0.07 },
  flute: { h: [1, 0.18, 0.05, 0.02], a: 0.05, d: 3 },
  koto: { h: [1, 0.55, 0.35, 0.18, 0.1, 0.05], a: 0.002, d: 0.32, ring: true, ringAt: 12, ringVol: 0.12 },
  guitar: { h: saw(10, 1).map((v, i) => v * (i % 2 ? 0.75 : 1)), a: 0.004, d: 1.3, det: [-7, 7] },
};

// 한 주기 파형표. 높은 음은 나이퀴스트를 넘는 배음을 빼서 거친 소리(앨리어싱)를 막는다
const tables = new Map();
function tableOf(kind, f) {
  const h = INSTR[kind].h, n = Math.max(1, Math.min(h.length, Math.floor(SR / 2 / f))), key = `${kind}:${n}`;
  if (!tables.has(key)) {
    const t = new Float32Array(TAB + 1);
    let max = 0;
    for (let i = 0; i < TAB; i++) {
      let v = 0;
      for (let k = 0; k < n; k++) if (h[k]) v += h[k] * Math.sin((2 * Math.PI * (k + 1) * i) / TAB);
      t[i] = v;
      max = Math.max(max, Math.abs(v));
    }
    for (let i = 0; i < TAB; i++) t[i] /= max || 1;
    t[TAB] = t[0];
    tables.set(key, t);
  }
  return tables.get(key);
}

// 음 하나를 out에 더한다: t초에 시작해 dur초 동안 누르고 있다가 뗀다
function addNote(out, kind, m, t, dur, vol, cents = null) {
  const ins = INSTR[kind];
  if (ins.det && cents === null) {
    for (const c of ins.det) addNote(out, kind, m, t, dur, vol / Math.sqrt(ins.det.length), c);
    return;
  }
  const f = freq(m + (cents ?? 0) / 100) * (ins.sub ? 0.5 : 1), tab = tableOf(kind, f), inc = (f * TAB) / SR;
  const start = Math.floor(t * SR), hold = Math.floor(Math.max(dur, 0.12) * SR), atk = Math.max(1, Math.floor(ins.a * SR));
  const decK = ins.d ? Math.exp(-1 / (ins.d * SR)) : 1, sus = ins.d ? 0.05 : 1, relK = Math.exp(-1 / ((ins.d ? 0.08 : 0.06) * SR));
  const len = Math.min(out.length - start, hold + Math.floor(0.45 * SR));
  let ph = 0, dec = 1, rel = 1;
  for (let i = 0; i < len; i++) {
    const j = ph | 0, s = tab[j] + (tab[j + 1] - tab[j]) * (ph - j);
    let a;
    if (i < atk) a = i / atk;
    else {
      a = sus + (1 - sus) * dec;
      dec *= decK;
    }
    if (i >= hold) {
      rel *= relK;
      a *= rel;
    }
    out[start + i] += s * a * vol;
    if ((ph += inc) >= TAB) ph -= TAB;
  }
  if (ins.ring && !cents) addNote(out, 'ring', m + (ins.ringAt ?? 17.58), t, 0.05, vol * (ins.ringVol ?? 0.18)); // 종소리: 2.76배 음 = 17.58 반음 위
}

const peakNorm = (x, to = 1) => {
  let max = 0;
  for (let i = 0; i < x.length; i++) max = Math.max(max, Math.abs(x[i]));
  if (max) for (let i = 0; i < x.length; i++) x[i] *= to / max;
  return x;
};

// 2차 필터 (RBJ 쿡북): 'band' 대역 통과 · 'high' 고역 통과
function filter(x, type, f0, Q) {
  const w = (2 * Math.PI * f0) / SR, al = Math.sin(w) / (2 * Q), c = Math.cos(w);
  const [b0, b1, b2] = type === 'band' ? [al, 0, -al] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al, y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y[i] = v;
  }
  return peakNorm(y);
}

// 드럼 샘플은 한 번만 만든다
let kit = null;
function drumKit() {
  if (kit) return kit;
  const make = (sec, fn) => Float32Array.from({ length: Math.floor(sec * SR) }, (_, i) => fn(i / SR));
  const noise = () => Math.random() * 2 - 1;
  let p1 = 0, p2 = 0;
  const kick = make(0.32, (t) => Math.sin((p1 += (2 * Math.PI * (45 + 105 * Math.exp(-t / 0.035))) / SR)) * Math.exp(-t / 0.075));
  const body = filter(make(0.18, (t) => noise() * Math.exp(-t / 0.045)), 'band', 1900, 0.7);
  const snare = peakNorm(body.map((v, i) => {
    const t = i / SR;
    p2 += (140 + 80 * Math.exp(-t / 0.03)) / SR;
    return v + (1 - 4 * Math.abs((p2 % 1) - 0.5)) * 0.5 * Math.exp(-t / 0.03);
  }));
  const hat = filter(make(0.05, (t) => noise() * Math.exp(-t / 0.012)), 'high', 7000, 0.7);
  const crash = filter(make(1.2, (t) => noise() * Math.exp(-t / 0.32)), 'high', 4500, 0.7);
  // 박수(짧은 소음 세 번) · 열린 하이햇 · 808 킥(길게 우는 저음)
  const clap = filter(make(0.2, (t) => noise() * (t < 0.03 ? Math.exp(-(t % 0.01) / 0.003) : Math.exp(-(t - 0.03) / 0.06))), 'band', 1400, 0.9);
  const ohat = filter(make(0.32, (t) => noise() * Math.exp(-t / 0.09)), 'high', 6500, 0.7);
  let p3 = 0;
  const boom = make(0.9, (t) => Math.sin((p3 += (2 * Math.PI * (42 + 60 * Math.exp(-t / 0.04))) / SR)) * Math.exp(-t / 0.35));
  return (kit = { kick, snare, hat, crash, clap, ohat, boom });
}

function addSample(out, smp, t, vol) {
  const start = Math.floor(t * SR), len = Math.min(smp.length, out.length - start);
  for (let i = 0; i < len; i++) out[start + i] += smp[i] * vol;
}

// 가벼운 리버브 (Freeverb 축소판: 콤 필터 4개 + 올패스 2개). spread로 왼쪽 · 오른쪽을 살짝 다르게
function reverb(x, spread) {
  const k = SR / 44100, combs = [1116, 1188, 1277, 1356].map((d) => new Float32Array(Math.floor((d + spread) * k)));
  const alls = [556, 441].map((d) => new Float32Array(Math.floor((d + spread) * k)));
  const ci = [0, 0, 0, 0], ai = [0, 0], lp = [0, 0, 0, 0], y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    const inp = x[n] * 0.18;
    let acc = 0;
    for (let c = 0; c < 4; c++) {
      const b = combs[c], o = b[ci[c]];
      lp[c] = o * 0.65 + lp[c] * 0.35;
      b[ci[c]] = inp + lp[c] * 0.82;
      if (++ci[c] >= b.length) ci[c] = 0;
      acc += o;
    }
    for (let a = 0; a < 2; a++) {
      const b = alls[a], o = b[ai[a]];
      b[ai[a]] = acc + o * 0.5;
      if (++ai[a] >= b.length) ai[a] = 0;
      acc = o - acc;
    }
    y[n] = acc;
  }
  return y;
}

// 마디 칸 수(6 · 8 · 12 · 16)별 [킥, 스네어, 하이햇, 박수, 열린 하이햇, 808] 패턴 (뒤쪽 줄은 없어도 된다)
const DRUMS = {
  light: { 6: ['x.....', '......', 'x.x.x.'], 8: ['x.......', '....x...', 'x.x.x.x.'], 16: ['x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.'] },
  dance: { 8: ['x.x.x.x.', '..x...x.', '.x.x.x.x'], 16: ['x...x...x...x...', '....x.......x...', '..x...x...x...x.'] },
  half: { 8: ['x.....x.', '....x...', 'x.x.x.x.'], 16: ['x...........x...', '........x.......', 'x.x.x.x.x.x.x.x.'] },
  rock: { 8: ['x...x.x.', '..x...x.', 'xxxxxxxx'], 16: ['x...x...x...x...', '..x...x...x...x.', 'x.x.x.x.x.x.x.x.'] },
  march: { 6: ['x.....', '..x.x.', '......'], 8: ['x...x...', '..x...x.', 'x.x.x.x.'], 16: ['x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.'] },
  waltz: { 6: ['x.....', '..x.x.', 'x.x.x.'] },
  six: { 6: ['x.....', '...x..', 'x.xx.x'] }, // 6/8 박자
  galop: { 8: ['x...x...', '..x...x.', 'x.x.x.x.'] },
  // 새 장르
  edm: { 8: ['x.x.x.x.', '........', 'xxxxxxxx', '..x...x.', '.x.x.x.x'], 16: ['x...x...x...x...', '................', 'x.x.x.x.x.x.x.x.', '....x.......x...', '..x...x...x...x.'] },
  build: { 8: ['x.x.x.x.', 'xxxxxxxx', '........'], 16: ['x...x...x...x...', 'x.x.x.x.xxxxxxxx', '................'] },
  trap: { 8: ['x....x..', '....x...', 'xxxxxxxx', '....x...', '.......x', 'x....x..'], 16: ['x......x..x.....', '........x.......', 'x.x.x.xxx.x.x.xx', '........x.......', '..............x.', 'x......x..x.....'] },
  phonk: { 8: ['x..x.x..', '..x...x.', 'xxxxxxxx', '..x...x.', '', 'x..x.x..'], 16: ['x..x..x...x..x..', '....x.......x...', 'xxxxxxxxxxxxxxxx', '....x.......x...', '', 'x..x..x...x..x..'] },
  disco: { 8: ['x.x.x.x.', '..x...x.', 'xxxxxxxx', '', '.x.x.x.x'], 16: ['x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '', '..x...x...x...x.'] },
  kpop: { 8: ['x..x..x.', '..x...x.', 'xxxxxxxx', '..x...x.'], 16: ['x.....x...x.....', '....x.......x...', 'x.xxx.xxx.xxx.xx', '....x.......x...', '..............x.'] },
  lofi: { 8: ['x...x.x.', '..x...x.', 'x.x.x.x.'], 12: ['x.....x..x..', '...x.....x..', 'x.xx.xx.xx.x'], 16: ['x.......x.x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.'] },
  swing: { 12: ['x.....x.....', '...x.....x..', 'x..x.xx..x.x'], 6: ['x.....', '...x..', 'x..x.x'] },
  chip: { 8: ['x...x...', '..x...x.', 'x.x.x.x.'], 16: ['x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.'] },
  trot: { 8: ['x...x...', '..x...x.', 'xxxxxxxx'], 16: ['x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '', '..x...x...x...x.'] },
  dnb: { 8: ['x....x..', '..x...x.', 'xxxxxxxx'], 16: ['x.........x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.'] },
  dembow: { 8: ['x.x.x.x.', '...x..x.', 'xxxxxxxx'], 16: ['x...x...x...x...', '...x..x....x..x.', 'x.x.x.x.x.x.x.x.'] },
};

// 구간 마지막 마디는 뒤쪽을 스네어 연타로 채워 다음 구간을 알려 준다
function drumPattern(bar, per) {
  const p = DRUMS[bar.drums]?.[per];
  if (!p || !bar.last || bar.end) return p ?? null;
  const q = per - Math.max(2, per / 4);
  return [p[0].slice(0, q).padEnd(per, '.'), p[1].slice(0, q).padEnd(per, 'x'), p[2], ...p.slice(3)];
}

// 코드의 i번째 구성음 (근음부터 위로 쌓기)
const tone = (ch, i) => ch.root + ch.tones[i % ch.tones.length] + 12 * Math.floor(i / ch.tones.length);

// 반주 음형: 마디 안 s번째 칸에서 칠 음들 [미디, 길이(칸), 세기]. first = 코드가 바뀐 첫 칸, len = 코드 길이(칸)
const STYLES = {
  alberti: (ch, s) => [[tone(ch, [0, 2, 1, 2][s % 4]), 1.6, 0.1]],
  waltz: (ch, s) => (s === 0 ? [[ch.bass - 12, 4, 0.15]] : s % 2 ? [] : [[tone(ch, 1) + 12, 1, 0.07], [tone(ch, 2) + 12, 1, 0.07]]),
  march: (ch, s) => (s % 4 === 0 ? [[ch.bass - 12, 2, 0.15]] : s % 4 === 2 ? [[tone(ch, 1) + 12, 1, 0.07], [tone(ch, 2) + 12, 1, 0.07]] : []),
  pulse: (ch, s) => [...(s % 4 === 0 ? [[ch.bass - 12, 2, 0.14]] : []), [tone(ch, 1) + 12, 0.8, 0.045], [tone(ch, 2) + 12, 0.8, 0.045]],
  stab: (ch, s) => (s % 2 ? [[tone(ch, 0) + 12, 0.6, 0.05], [tone(ch, 1) + 12, 0.6, 0.05], [tone(ch, 2) + 12, 0.6, 0.05]] : []),
  arp: (ch, s, first, len) => [...(first ? [[ch.bass - 12, len, 0.13]] : []), [tone(ch, [2, 3, 4, 3][s % 4]), 1.4, 0.06]],
  elise: (ch, s) => (s < 3 ? [[[ch.bass - 12, ch.bass - 5, ch.bass][s], 3 - s, 0.11]] : []),
  pad: (ch, s, first, len) => (first ? [[ch.bass - 12, len, 0.12], [tone(ch, 1), len, 0.05], [tone(ch, 2), len, 0.05], [tone(ch, 3), len, 0.04]] : []),
  bass: (ch, s, first, len) => (first ? [[ch.bass - 12, len, 0.13]] : []),
  organ: (ch, s, first, len) => (first ? [[ch.bass - 24, len, 0.09], [tone(ch, 0), len, 0.05], [tone(ch, 1), len, 0.05], [tone(ch, 2), len, 0.05]] : []),
  pizz: (ch, s) => (s % 2 ? [] : [[s % 4 ? ch.bass - 5 : ch.bass - 12, 0.6, 0.15]]),
  // 새 장르 (sub: 한 박을 몇 칸으로 나눴는지)
  offbeat: (ch, s, first, len, sub) => (s % sub === sub >> 1 ? [0, 1, 2].map((i) => [tone(ch, i) + 12, sub * 0.4, 0.05, 'saw']) : []),
  pluck16: (ch, s) => [[tone(ch, [0, 1, 2, 3, 2, 1][s % 6]) + 12, 0.9, 0.05, 'pluck']],
  chip: (ch, s) => [[tone(ch, s % 3) + 12, 0.7, 0.045, 'chip']],
  lofi: (ch, s, first, len, sub) => (first ? [[ch.bass - 12, len, 0.1], ...[1, 2, 3].map((i) => [tone(ch, i), len, 0.04, 'epiano'])]
    : s % (sub * 2) === sub + (sub >> 1) ? [1, 2, 3].map((i) => [tone(ch, i), sub * 0.5, 0.025, 'epiano']) : []),
  trot: (ch, s, first, len, sub) => (s % (sub * 2) === sub ? [0, 1, 2].map((i) => [tone(ch, i) + 12, sub * 0.6, 0.05]) : []),
  swing: (ch, s, first, len, sub) => (s % (sub * 2) === sub ? [1, 2, 3].map((i) => [tone(ch, i), sub * 0.6, 0.05, 'epiano']) : []),
  dembow: (ch, s, first, len, sub) => ([0, 3, 6].includes((s / (sub >> 1)) % 8) && s % (sub >> 1) === 0 ? [0, 1, 2].map((i) => [tone(ch, i) + 12, sub * 0.5, 0.045, 'pluck']) : []),
  pad2: (ch, s, first, len) => (first ? [0, 1, 2, 3].map((i) => [tone(ch, i) + 12, len, 0.035, 'pad']) : []),
  habanera: (ch, s, first, len, sub) => ([0, 3, 4, 6].includes(s % (sub * 2)) ? [[ch.bass - 12, 1, 0.13], ...(s % (sub * 2) === 4 ? [1, 2].map((i) => [tone(ch, i) + 12, 1.5, 0.05]) : [])] : []),
  trip: (ch, s) => [[tone(ch, s % 3) + (s % 6 < 3 ? 0 : 12), 1.2, 0.05]], // 셋잇단 아르페지오
};

// 신스 베이스: [미디, 길이(칸), 악기]
const BASS = {
  oct: (ch, s) => [[ch.bass - (s % 2 ? 0 : 12), 0.9]],
  walk: (ch, s, sub) => (s % sub ? [] : [[ch.bass - 12 + [0, 7, 12, 7][(s / sub) % 4], sub * 0.9]]),
  pump: (ch, s, sub) => (s % sub === sub >> 1 ? [[ch.bass - 12, sub * 0.45]] : []), // EDM: 박 사이마다
  sub808: (ch, s, sub) => (s % (sub * 2) === 0 ? [[ch.bass - 12, sub * 1.9, 'sub']] : []),
  disco: (ch, s, sub) => (s % (sub >> 1 || 1) ? [] : [[ch.bass - (Math.floor(s / (sub >> 1 || 1)) % 2 ? 0 : 12), Math.max(0.5, (sub >> 1) * 0.8)]]),
  trot: (ch, s, sub) => (s % (sub * 2) === 0 ? [[ch.bass - 12 + ((s / (sub * 2)) % 2 ? 7 : 0), sub * 0.9]] : []),
  chip: (ch, s, sub) => (s % (sub >> 1 || 1) ? [] : [[ch.bass - (Math.floor(s / (sub >> 1 || 1)) % 2 ? 0 : 12), Math.max(0.5, (sub >> 1) * 0.8), 'tri']]),
};

// 곡 전체(멜로디 + 반주 + 베이스 + 드럼)를 한 번에 합성해 AudioBuffer로 돌려준다
// 곡 합성: 왼쪽 · 오른쪽 소리(Float32Array)만 만든다 (Worker에서도 돈다)
export function renderPCM(song) {
  const c = compile(song), kind = song.voice ?? 'piano', back = kind === 'organ' ? 'organ' : 'piano';
  const len = Math.ceil((c.duration + 3) * SR), bus = new Float32Array(len), drums = new Float32Array(len), kit = drumKit();
  const style = STYLES[song.style], bass = BASS[song.bass], kicks = [];
  for (const bar of c.bars) {
    const seg = c.per / bar.chords.length, pat = drumPattern(bar, c.per);
    if (bar.end) {
      const ch = bar.chords[0];
      if (ch) for (const [m, v] of [[ch.bass - 12, 0.14], [tone(ch, 0), 0.06], [tone(ch, 1), 0.06], [tone(ch, 2), 0.06], [tone(ch, 3), 0.05]]) addNote(bus, back, m, bar.t, 2.5, v);
      if (pat) {
        addSample(drums, kit.kick, bar.t, 0.7);
        addSample(drums, kit.crash, bar.t, 0.22);
      }
      continue;
    }
    if (pat && bar.first && bar.key !== 'I') addSample(drums, kit.crash, bar.t, 0.18);
    for (let s = 0; s < c.per; s++) {
      const ch = bar.chords[Math.floor(s / seg)], t = bar.t + s * bar.dt;
      if (ch) for (const [m, l, v, ins] of style(ch, s, s % seg === 0, seg, c.sub)) addNote(bus, ins ?? back, m, t, l * bar.dt, v);
      if (ch && bass) for (const [m, l, ins] of bass(ch, s, c.sub)) addNote(bus, ins ?? 'bass', m, t, l * bar.dt, ins === 'sub' ? 0.2 : 0.11);
      if (!pat) continue;
      if (pat[0][s] === 'x') { addSample(drums, kit.kick, t, 0.7); kicks.push(t); }
      if (pat[1][s] === 'x') addSample(drums, kit.snare, t, 0.3);
      if (pat[2][s] === 'x') addSample(drums, kit.hat, t, 0.08);
      if (pat[3]?.[s] === 'x') addSample(drums, kit.clap, t, 0.26);
      if (pat[4]?.[s] === 'x') addSample(drums, kit.ohat, t, 0.07);
      if (pat[5]?.[s] === 'x') addSample(drums, kit.boom, t, 0.5);
    }
  }
  for (const n of c.melody) addNote(bus, kind, n.midi, n.t, n.dur, kind === 'organ' ? 0.2 : kind === 'saw' || kind === 'chip' ? 0.17 : 0.25);
  // EDM 펌핑: 킥이 칠 때마다 반주 · 멜로디 소리를 잠깐 줄였다가 올린다 (사이드체인)
  if (song.pump && kicks.length) {
    let k = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      while (k + 1 < kicks.length && kicks[k + 1] <= t) k++;
      if (t >= kicks[k]) bus[i] *= 1 - 0.55 * Math.exp(-(t - kicks[k]) / 0.11);
    }
  }
  const wl = reverb(bus, 0), wr = reverb(bus, 23), L = new Float32Array(len), R = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    L[i] = bus[i] + wl[i] + drums[i];
    R[i] = bus[i] + wr[i] + drums[i];
  }
  // 작은 소리를 키우는 소프트 클립 (곡이 잘 들리게) → 최대 0.92
  let max = 0;
  for (let i = 0; i < len; i++) max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  const k = max ? 1 / max : 1;
  for (const ch of [L, R]) for (let i = 0; i < len; i++) { const x = ch[i] * k; ch[i] = (1.5 * x - 0.5 * x * x * x) * 0.92; }
  return [L, R];
}
const toBuffer = ([L, R]) => {
  const buf = new AudioBuffer({ numberOfChannels: 2, length: L.length, sampleRate: SR });
  buf.copyToChannel(L, 0);
  buf.copyToChannel(R, 1);
  return buf;
};
export const renderSong = (song) => toBuffer(renderPCM(song));

// 합성은 무거워서(휴대폰 1~3초) 화면이 멈추지 않게 Worker에서. Worker를 못 쓰는 브라우저는 그냥 화면에서
let synthWorker = null, synthSeq = 0;
const synthWait = new Map();
function synth(song) {
  try {
    if (!synthWorker && synthWorker !== false) {
      synthWorker = new Worker(new URL('./synth-worker.js', import.meta.url), { type: 'module' });
      synthWorker.onmessage = ({ data }) => {
        const w = synthWait.get(data.id);
        synthWait.delete(data.id);
        if (!w) return;
        if (data.pcm) w.ok(toBuffer(data.pcm));
        else w.ok(renderSong(w.song)); // Worker에서 실패하면 화면에서 다시
      };
      synthWorker.onerror = (e) => { // 모듈 Worker를 못 쓰면 앞으로는 화면에서
        e.preventDefault?.();
        synthWorker = false;
        for (const [id, w] of synthWait) { synthWait.delete(id); try { w.ok(renderSong(w.song)); } catch (err) { w.fail(err); } }
      };
    }
    if (synthWorker) {
      return new Promise((ok, fail) => {
        const id = ++synthSeq;
        synthWait.set(id, { ok, fail, song });
        synthWorker.postMessage({ id, song });
      });
    }
  } catch { synthWorker = false; }
  return new Promise((ok) => setTimeout(ok, 30)).then(() => renderSong(song));
}

const noiseBuffer = (ctx, sec) => {
  const b = ctx.createBuffer(1, Math.ceil(sec * ctx.sampleRate), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
};

function noiseHit(ctx, out, noise, t, vol, type, hz, len) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  f.type = type;
  f.frequency.value = hz;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.4);
  s.stop(t + len + 0.02);
}

/* ---------- 실시간 소리 ---------- */

export const sound = {
  ctx: null,
  out: null,
  noise: null,
  buffers: new Map(),
  bgmNode: null,
  bgmToken: null,
  vol: { music: 0.9, sfx: 0.8 },

  get() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.out = this.ctx.createDynamicsCompressor();
      this.out.connect(this.ctx.destination);
      this.noise = noiseBuffer(this.ctx, 0.5);
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS 무음 스위치에도 소리 나게
    }
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {}); // iOS는 'interrupted'도 있다
    return this.ctx;
  },

  // 스피커에서 지금 실제로 나오는 시각 (출력 지연 보정)
  // 일부 기기는 getOutputTimestamp가 튀거나(0 · 먼 값) 멈춰 있어서, currentTime 기준과 0.25초 넘게 다르면 currentTime을 쓴다. 뒤로 가지 않게 한다
  now() {
    const c = this.ctx, est = c.currentTime - (c.outputLatency || c.baseLatency || 0), ts = c.getOutputTimestamp?.();
    let t = est;
    if (ts?.contextTime > 0 && ts.performanceTime > 0) {
      const v = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      if (Math.abs(v - est) < 0.25) t = v;
    }
    if (this.last && t < this.last && this.last - t < 0.05) t = this.last; // 아주 조금 뒤로 가는 떨림은 무시
    return (this.last = t);
  },

  // 합성은 동기라서, '곡 준비 중' 화면이 먼저 그려지도록 한 박자 쉬고 시작한다
  // 합성한 곡은 최근 3곡만 기억한다 (한 곡이 수십 MB라 다 들고 있으면 휴대폰에서 탭이 튕긴다)
  load(song) {
    let p = this.buffers.get(song.id);
    if (p) this.buffers.delete(song.id); // 맨 뒤(최근)로
    else {
      p = synth(song);
      p.catch(() => this.buffers.get(song.id) === p && this.buffers.delete(song.id));
    }
    this.buffers.set(song.id, p);
    while (this.buffers.size > 3) this.buffers.delete(this.buffers.keys().next().value);
    return p;
  },

  // 로비 음악 · 미리듣기: 곡 전체를 합성해 from 구간부터 끝까지 반복
  // once: 한 번만 끝까지 틀고 onEnd (로비 재생목록) · 아니면 from 구간부터 반복 (미리듣기)
  async bgm(song, from = 'A', { once = false, onEnd } = {}) {
    const token = (this.bgmToken = {});
    this.stopBgm();
    if (!song) return;
    const buf = await this.load(song);
    if (this.bgmToken !== token) return;
    const ctx = this.get(), c = compile(song), t = ctx.currentTime;
    const src = ctx.createBufferSource(), g = ctx.createGain(), v = (once ? 0.4 : 0.5) * this.vol.music;
    src.buffer = buf;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + (once ? 2 : 0.8));
    src.connect(g).connect(ctx.destination);
    if (once) {
      const end = t + c.duration;
      g.gain.setValueAtTime(v, Math.max(t + 2.1, end - 2.5));
      g.gain.linearRampToValueAtTime(0, end);
      src.onended = () => { if (this.bgmNode?.src === src) { this.bgmNode = null; onEnd?.(); } };
      src.start(t, 0);
      src.stop(end + 0.05);
    } else {
      src.loop = true;
      src.loopStart = c.starts[from] ?? 0;
      src.loopEnd = c.duration;
      src.start(t, src.loopStart);
    }
    this.bgmNode = { src, g, v };
  },

  stopBgm() {
    const n = this.bgmNode;
    if (!n) return;
    const t = this.ctx.currentTime;
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setValueAtTime(n.g.gain.value, t);
    n.g.gain.linearRampToValueAtTime(0, t + 0.3);
    n.src.stop(t + 0.35);
    this.bgmNode = null;
  },

  // 화면을 벗어나면(앱 전환 · 탭 닫기 · 화면 끄기) 소리를 통째로 멈추고, 돌아오면 다시 켠다
  sleep(on) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend();
    else if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMusic(v) {
    this.vol.music = v;
    if (this.bgmNode) this.bgmNode.g.gain.setTargetAtTime(0.45 * v, this.ctx.currentTime, 0.05);
  },

  sfx(kind, vol = 0.14) {
    if (!this.ctx) return;
    const notes = {
      tap: [988, 1319], ok: [784, 1175, 1568], back: [784, 523], flip: [1047], coin: [1319, 1976],
      fan: [523, 659, 784, 1047, 1319], rare: [784, 988, 1175, 1568, 1976, 2349], epic: [523, 784, 1047, 1319, 1568, 2093, 2637],
    }[kind];
    const ctx = this.ctx, step = notes.length > 3 ? 0.08 : 0.055;
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * step, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * this.vol.sfx, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.2);
    });
  },

  // 노트를 쳤을 때 '틱' 소리. 판정이 좋을수록 밝게
  hit(name) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, v = 0.22 * this.vol.sfx;
    noiseHit(ctx, this.out, this.noise, t, v * (name === 'good' ? 0.5 : 0.8), 'highpass', 3800, 0.035);
    if (name === 'good') return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = name === 'perfect' ? 1760 : 1318;
    g.gain.setValueAtTime(v * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.08);
  },

  // 캐릭터 목소리: 글자 수만큼 음절을 옹알옹알 (캐릭터마다 음높이 · 음색이 다르다)
  voice(c, text) {
    const ctx = this.get(), [base, wave] = c.voice, out = ctx.createGain();
    out.gain.value = 0.32 * this.vol.sfx;
    out.connect(ctx.destination);
    const n = Math.min(9, Math.max(2, (text.match(/[가-힣a-zA-Z]/g) ?? []).length)), up = /[!?]\s*$/.test(text);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      const m = base + [0, 3, 5, 2, 7, 4, 9, 5, 12][(i + base) % 9] * 0.6 + (Math.random() - 0.5) * 1.2 + (up && i === n - 1 ? 5 : 0);
      o.type = wave;
      o.frequency.setValueAtTime(freq(m), t);
      o.frequency.exponentialRampToValueAtTime(freq(m - 2), t + 0.08);
      bp.type = 'bandpass';
      bp.frequency.value = 700 + ((i * 5) % 3) * 550;
      bp.Q.value = 1.1;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
      o.connect(bp).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.1);
      t += 0.08 + Math.random() * 0.025;
    }
  },
};

/* ---------- 게임 ---------- */

// 멀티플레이 방해 효과의 세기 0~1 (0.25초 동안 켜지고, 끝나기 0.4초 전부터 꺼진다). e: { from, to } (performance.now ms)
const jamLevel = (e, now) => (e && now < e.to ? Math.max(0, Math.min(1, (now - e.from) / 250, (e.to - now) / 400)) : 0);
const jamAdd = (jam, kind, ms) => {
  const now = performance.now(), e = jam[kind];
  jam[kind] = e && now < e.to ? { from: e.from, to: Math.min(e.to + ms, now + 2 * ms) } : { from: now, to: now + ms };
};

// 먹구름: 판정선 위쪽(bottom까지)을 몽글몽글한 구름으로 가린다
function drawFog(g, x, w, bottom, k, now) {
  g.save();
  g.beginPath();
  g.rect(x, 0, w, bottom + w * 0.2);
  g.clip();
  g.globalAlpha = k;
  const grad = g.createLinearGradient(0, 0, 0, bottom);
  grad.addColorStop(0, '#d9d1ee');
  grad.addColorStop(1, '#f6f2ff');
  g.fillStyle = grad;
  g.fillRect(x, 0, w, bottom);
  g.fillStyle = '#f6f2ff';
  for (let i = 0; i <= 6; i++) {
    g.beginPath();
    g.arc(x + (i / 6) * w, bottom + Math.sin(now / 320 + i * 1.7) * w * 0.02, w * (0.1 + 0.025 * Math.sin(now / 410 + i)), 0, Math.PI * 2);
    g.fill();
  }
  g.font = `${Math.round(w * 0.16)}px sans-serif`;
  g.textAlign = 'center';
  g.globalAlpha = k * 0.7;
  g.fillText('☁️', x + w / 2 + Math.sin(now / 500) * w * 0.2, bottom * 0.5);
  g.restore();
}

// 폭탄: 판정선 근처(top~bottom)를 뭉게뭉게 연기로 가린다 (터지는 순간엔 번쩍)
function drawSmoke(g, x, w, top, bottom, k, now, born) {
  g.save();
  g.beginPath();
  g.rect(x, top - w * 0.1, w, bottom - top + w * 0.2);
  g.clip();
  g.globalAlpha = k * 0.92;
  const grad = g.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, 'rgba(80, 74, 92, 0)');
  grad.addColorStop(0.25, '#5f586b');
  grad.addColorStop(1, '#3d3747');
  g.fillStyle = grad;
  g.fillRect(x, top, w, bottom - top);
  g.fillStyle = '#6c6578';
  for (let i = 0; i < 9; i++) {
    const px = x + ((i * 0.37 + now / 2600) % 1) * w, py = top + (bottom - top) * (0.3 + 0.6 * ((i * 0.53) % 1));
    g.beginPath();
    g.arc(px, py + Math.sin(now / 400 + i) * 6, w * (0.09 + 0.04 * Math.sin(now / 520 + i * 2)), 0, Math.PI * 2);
    g.fill();
  }
  const age = now - born;
  if (age < 260) { // 터지는 순간 번쩍
    g.globalAlpha = (1 - age / 260) * 0.8;
    g.fillStyle = '#fff3c4';
    g.fillRect(x, top, w, bottom - top);
  }
  g.globalAlpha = k * 0.85;
  g.font = `${Math.round(w * 0.14)}px sans-serif`;
  g.textAlign = 'center';
  g.fillText('💣', x + w / 2 + Math.sin(now / 300) * w * 0.15, top + (bottom - top) * 0.45);
  g.restore();
}

// 어질어질: 판정선 가운데를 축으로 좌우로 흔들고 살짝 기울인다
function sway(g, cx, cy, w, k, now) {
  g.translate(cx, cy);
  g.rotate(Math.sin(now / 160) * 0.07 * k);
  g.translate(-cx + Math.sin(now / 95) * w * 0.07 * k, -cy);
}

function faceSprite(img, px, badge) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(px);
  const g = c.getContext('2d'), r = px / 2;
  g.beginPath();
  g.arc(r, r, r * 0.92, 0, Math.PI * 2);
  g.fillStyle = '#fff';
  g.fill();
  g.save();
  g.clip();
  g.drawImage(img, r * 0.08, r * 0.08, px * 0.92, px * 0.92);
  g.restore();
  g.lineWidth = px * 0.07;
  g.strokeStyle = INK;
  g.stroke();
  if (badge) {
    g.font = `${px * 0.36}px sans-serif`;
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.fillText(badge, px, px);
  }
  return c;
}

export class Game {
  // opts: { song, diff, speed, offset(ms), buffs, hitsound, multi, lanes: [{ color, face(Image|null), badge, key }],
  //         onJudge(name, combo, score, dt, lane), onHp(hp, max, event), onTick(progress), onCombo(combo), onEnd(result) }
  // multi: 멀티플레이 (멈추기 없음 · 체력이 0이 돼도 끝까지 연주하고 클리어만 실패 · 방해 효과를 받는다)
  constructor(canvas, opts) {
    Object.assign(this, opts);
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.audio = playSong(this.song, this.diff); // CHAOS는 빨라진 곡
    this.chart = compile(this.audio);
    // 0 대기 · 1 누르는 중 · 2 끝 · 3 놓침. 멀티는 아이템 노트가 붙은 채보(opts.tiles)를 받는다
    this.tiles = (opts.tiles ?? makeChart(this.song, this.diff).tiles).map((n) => ({ ...n, state: 0 }));
    this.byLane = [0, 1, 2, 3].map((l) => this.tiles.filter((n) => n.lane === l));
    this.ptr = [0, 0, 0, 0];
    this.holding = [null, null, null, null];
    this.flash = [0, 0, 0, 0];
    this.fx = [];
    this.bi = 0;
    this.total = this.tiles.length + this.tiles.filter((n) => n.hold).length; // 롱노트는 누름 + 뗌 두 번 판정
    this.stats = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.combo = this.maxCombo = this.acc = 0;
    this.maxHp = 100 + this.buffs.hp;
    this.hp = this.maxHp;
    this.revive = this.buffs.revive;
    this.bonus = this.buffs.window / 1000;
    this.mult = 1 + this.buffs.score / 100;
    this.approach = 2.6 - this.speed * 0.2; // 노트가 화면 위에서 판정선까지 오는 시간(초)
    this.endT = this.chart.duration + 1;
    this.jam = {}; // 받은 방해 효과 { fog | shake | speed: { from, to } }
    this.dead = false;
    this.light = this.lanes.map((l) => mix(l.color, '#ffffff', 0.6));
    this.loop = this.loop.bind(this);
    this.resize();
  }

  get raw() { return Math.round((1e6 * this.acc) / this.total); }
  get score() { return Math.round(this.raw * this.mult); }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2), r = this.cv.getBoundingClientRect();
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = r.width;
    this.H = r.height;
    this.wide = matchMedia('(orientation: landscape) and (min-width: 640px)').matches;
    this.fw = this.wide ? Math.min(440, this.W * 0.36) : this.W; // style.css의 .gside 위치와 같은 식
    this.left = (this.W - this.fw) / 2;
    this.cw = this.fw / 4;
    this.nw = this.cw * 0.84; // 노트 가로
    this.nh = Math.min(this.nw / 2, 42); // 노트 세로 (가로 2 : 세로 1)
    this.jy = this.H - Math.min(150, Math.max(96, this.H * 0.19)); // 판정선
    this.pps = (this.jy + this.nh) / this.approach;
    this.fs = Math.min(this.cw * 0.62, (this.H - this.jy) * 0.62);
    this.faces = this.lanes.map((l) => l.face && faceSprite(l.face, this.fs * dpr, l.badge));
  }

  laneAt(x) {
    const l = Math.floor((x - this.left) / this.cw);
    return l >= 0 && l < 4 ? l : -1;
  }

  // at: 곡을 시작할 performance.now() 시각 (멀티는 모두 같은 시각). 이미 지났으면 그만큼 곡 중간부터
  async start(at) {
    this.buf = await sound.load(this.audio);
    if (this.stopped) return; // 기다리는 사이 그만뒀다 (다시하기 연타 · 화면 이동)
    const lead = at ? (at - performance.now()) / 1000 : 1.8;
    if (lead >= 0.05) this.play(0, lead);
    else this.play(0.05 - lead, 0.05);
  }

  attack(kind, ms) { jamAdd(this.jam, kind, ms); }
  level(kind) { return jamLevel(this.jam[kind], performance.now()); }

  // 곡 버퍼의 pos 위치를 lead초 뒤에 재생. 게임 시각 = 스피커 시각 - base - 싱크 보정
  play(pos, lead) {
    if (this.stopped) return;
    const ctx = sound.get(), at = ctx.currentTime + lead;
    this.src = ctx.createBufferSource();
    this.src.buffer = this.buf;
    this.gain = ctx.createGain();
    this.gain.gain.value = sound.vol.music;
    this.src.connect(this.gain).connect(ctx.destination);
    if (pos >= 0) this.src.start(at, pos);
    else this.src.start(at - pos, 0);
    this.base = at - pos;
    this.running = true;
    this.raf = requestAnimationFrame(this.loop);
  }

  time() { return sound.now() - this.base - this.offset / 1000; }

  pause() {
    if (!this.running || this.multi) return false;
    for (let l = 0; l < 4; l++) if (this.holding[l]) this.endHold(l, this.time(), true);
    this.running = false;
    this.pausedAt = this.time();
    this.src.stop();
    cancelAnimationFrame(this.raf);
    return true;
  }

  // 다시 시작: lead초 동안 3 · 2 · 1을 세고, 멈춘 자리부터 이어서 (그사이 노트는 멈춘 자리 앞에서부터 다시 내려온다)
  resume(lead = 3) {
    if (this.running || this.stopped) return;
    this.play(this.pausedAt + this.offset / 1000, lead);
  }

  stop() {
    this.stopped = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    try { this.src?.stop(); } catch {}
  }

  // lag: 손가락 · 키가 눌린 뒤 이 코드가 불리기까지 걸린 초 (화면이 바빠 늦게 불려도 실제 누른 순간으로 판정 = 씹힘 방지)
  press(lane, lag = 0) {
    if (lane < 0) return;
    this.flash[lane] = 1;
    if (!this.running) return;
    const t = this.time() - Math.max(0, Math.min(0.12, lag || 0)), n = this.byLane[lane][this.ptr[lane]], j = n && judgeOf(t - n.t, this.bonus);
    if (!j) {
      // 너무 일찍 누름(판정 범위 바로 앞 0.1초): 그 노트는 MISS로 사라진다 → 마구 연타하면 점수가 오르지 않는다
      if (n && n.t > t && n.t - t <= JUDGES[2].w + this.bonus + 0.1) {
        this.ptr[lane]++;
        n.state = 3;
        this.judge(lane, 'miss', 0);
        if (n.hold) this.judge(lane, 'miss', 0, true);
        return;
      }
      // 다가오는 노트가 없는 칸을 누르면 헛손질 (조금 일찍 누른 건 봐준다). 첫 노트가 오기 전에는 눌러도 괜찮다
      if (t < (this.tiles[0]?.t ?? 0) - 0.45) return;
      if (!n || n.t - t > 0.45) {
        this.damage(3);
        this.burst(lane, 'wrong');
      }
      return;
    }
    this.ptr[lane]++;
    n.hitAt = performance.now();
    if (this.hitsound) sound.hit(j.name);
    if (n.hold) {
      n.state = 1;
      this.holding[lane] = n;
    } else n.state = 2;
    this.judge(lane, j.name, j.v, false, t - n.t);
    if (n.item) this.onItem?.(n.item); // 아이템 노트를 치면 공격 충전 (멀티)
  }

  release(lane, lag = 0) {
    if (lane >= 0 && this.holding[lane] && this.running) this.endHold(lane, this.time() - Math.max(0, Math.min(0.12, lag || 0)));
  }

  // 롱노트는 끝까지 누르고 있어야 인정 (끝나기 0.1초 전까지는 봐준다). 일찍 떼면 MISS, 남은 꼬리는 회색으로 떨어진다
  // paused: 일시정지로 끊긴 건 플레이어 잘못이 아니니 GOOD으로
  endHold(lane, t, paused = false) {
    const n = this.holding[lane];
    this.holding[lane] = null;
    const name = t >= n.t + n.dur - 0.1 ? 'perfect' : paused ? 'good' : 'miss';
    n.state = name === 'miss' ? 4 : 2;
    n.cut = t;
    this.judge(lane, name, JUDGES.find((j) => j.name === name)?.v ?? 0, true);
  }

  judge(lane, name, v, tail = false, dt = 0) {
    this.stats[name]++;
    if (name === 'miss') {
      this.combo = 0;
      this.damage(tail ? 4 : 8);
    } else {
      this.combo++;
      this.acc += this.dead ? v * 0.1 : v; // 멀티에서 체력이 0이 된 뒤에는 점수가 10%만 오른다 (연타로 점수 올리기 막기)
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (this.buffs.heal && this.combo % 20 === 0) {
        this.hp = Math.min(this.maxHp, this.hp + this.buffs.heal);
        this.onHp(this.hp, this.maxHp, 'heal');
      }
      if (!tail) this.burst(lane, name);
      if (this.combo % 50 === 0) this.onCombo?.(this.combo);
    }
    if (this.running) this.onJudge(name, this.combo, this.score, dt, lane);
  }

  damage(x) {
    if (!this.running) return;
    this.hp -= x * (1 - this.buffs.guard / 100);
    this.shakeAt = performance.now();
    if (this.hp > 0) return this.onHp(this.hp, this.maxHp, 'hurt');
    if (this.revive) {
      this.hp = (this.maxHp * this.revive) / 100;
      this.revive = 0;
      return this.onHp(this.hp, this.maxHp, 'revive');
    }
    this.hp = 0;
    this.onHp(0, this.maxHp, this.dead ? 'hurt' : 'down');
    if (!this.multi) return this.finish(false);
    this.dead = true; // 멀티는 끝까지 연주 (클리어만 실패)
  }

  finish(cleared) {
    this.stop();
    const raw = this.raw;
    this.onEnd({
      raw, score: this.score, rank: rankOf(raw), combo: this.maxCombo, stats: this.stats, total: this.total,
      cleared, fullCombo: cleared && this.stats.miss === 0, allPerfect: cleared && this.stats.perfect === this.total,
    });
  }

  burst(lane, name) {
    const x = this.left + (lane + 0.5) * this.cw, y = this.jy, now = performance.now();
    const color = name === 'wrong' ? '#b9adc4' : this.lanes[lane].color;
    this.fx.push({ ring: true, x, y, color, born: now });
    if (name === 'wrong') return;
    for (let i = 0; i < (name === 'perfect' ? 10 : 5); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 160 + Math.random() * 280;
      this.fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: i % 3 ? color : '#fff', size: 5 + Math.random() * 6, born: now });
    }
  }

  // 지금 박자 안에서 얼마나 지났는지 (0 → 1). 판정선 · 얼굴이 박자에 맞춰 통통 튄다
  beat(t) {
    const bars = this.chart.bars;
    let i = this.bi;
    while (i + 1 < bars.length && bars[i + 1].t <= t) i++;
    while (i > 0 && bars[i].t > t) i--;
    this.bi = i;
    const b = bars[i], len = b.dt * this.chart.sub;
    return t < 0 ? 0.99 : (((t - b.t) / len) % 1 + 1) % 1;
  }

  loop() {
    if (!this.running) return;
    // 그리기 · 판정 중 에러가 나도 다음 프레임은 계속 (한 번의 에러로 게임이 멈추지 않게)
    try { this.step(); } catch (e) {
      if (!this.errAt || performance.now() - this.errAt > 5000) { this.errAt = performance.now(); this.onError?.(e); }
      if (this.running) this.raf = requestAnimationFrame(this.loop);
    }
  }

  step() {
    // 소리가 멈춰 있으면(전화 · 다른 앱 소리 · 블루투스 끊김) 게임 시계도 멈춘다 → 다시 켜 보고, 안 되면 화면에 알린다
    const ctx = sound.ctx;
    if (ctx && ctx.state !== 'running') {
      if (!this.wakeAt || performance.now() - this.wakeAt > 700) { this.wakeAt = performance.now(); sound.get(); this.onStall?.(true); }
    } else if (this.wakeAt) { this.wakeAt = 0; this.onStall?.(false); }
    const t = this.time(), late = JUDGES[2].w + this.bonus;
    // 자동 연주 (영상 촬영용 · 로컬에서 ?auto 일 때만): 노트가 판정선에 닿는 순간 누르고 롱노트 끝에서 뗀다
    if (this.auto) for (let l = 0; l < 4; l++) {
      const n = this.byLane[l][this.ptr[l]];
      if (!this.holding[l] && n && t >= n.t - 0.004) this.press(l);
    }
    for (let l = 0; l < 4 && this.running; l++) {
      const h = this.holding[l];
      if (h && t >= h.t + h.dur) this.endHold(l, t);
      const lane = this.byLane[l];
      while (this.running && this.ptr[l] < lane.length && lane[this.ptr[l]].t < t - late) {
        const n = lane[this.ptr[l]++];
        n.state = 3;
        this.judge(l, 'miss', 0);
        if (n.hold) this.judge(l, 'miss', 0, true);
      }
    }
    if (!this.running) return; // 체력이 다 떨어져 끝남
    this.draw(t);
    this.onTick(Math.min(1, Math.max(0, t / this.chart.duration)));
    if (t > this.endT) return this.finish(!this.dead);
    this.raf = requestAnimationFrame(this.loop);
  }

  draw(t) {
    const { g, W, H, left, fw, cw, jy, nw, nh } = this, now = performance.now();
    const pulse = (1 - this.beat(t)) ** 3, fever = this.combo >= 100;
    const shake = jamLevel(this.jam.shake, now), fog = jamLevel(this.jam.fog, now), pps = this.pps * (1 + 0.8 * jamLevel(this.jam.speed, now));
    const bomb = jamLevel(this.jam.bomb, now);
    g.clearRect(0, 0, W, H);
    g.save();
    if (now - (this.shakeAt ?? 0) < 160) g.translate((Math.random() - 0.5) * 8, 0);
    if (shake) sway(g, left + fw / 2, jy, fw, shake, now);

    // 무대 판
    g.fillStyle = fever ? `rgba(60, 24, 70, ${0.66 + pulse * 0.08})` : 'rgba(28, 18, 52, .64)';
    g.beginPath();
    g.roundRect(left, -20, fw, H + 40, this.wide ? 22 : 0);
    g.fill();
    if (this.wide) {
      g.lineWidth = 4;
      g.strokeStyle = INK;
      g.stroke();
    }
    for (let l = 0; l < 4; l++) {
      const x = left + l * cw;
      if (l % 2) {
        g.fillStyle = 'rgba(255,255,255,.035)';
        g.fillRect(x, 0, cw, H);
      }
      if (this.flash[l] > 0.02) {
        const lg = g.createLinearGradient(0, jy, 0, jy - H * 0.6);
        lg.addColorStop(0, this.lanes[l].color);
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = this.flash[l] * 0.5;
        g.fillStyle = lg;
        g.fillRect(x, jy - H * 0.6, cw, H * 0.6);
        g.globalAlpha = 1;
        this.flash[l] *= this.holding[l] ? 0.95 : 0.86;
      }
    }
    g.fillStyle = 'rgba(255,255,255,.12)';
    for (let i = 1; i < 4; i++) g.fillRect(left + i * cw - 1, 0, 2, H);

    // 마디 줄 (노트와 같이 내려와서 박자를 읽기 쉽게)
    g.fillStyle = 'rgba(255,255,255,.13)';
    for (const b of this.chart.bars) {
      const y = jy - (b.t - t) * pps;
      if (y > 0 && y < jy - nh / 2) g.fillRect(left, y - 1, fw, 2);
    }

    // 판정선 + 노트 받침
    g.fillStyle = `rgba(255,141,182,${0.16 + pulse * 0.22})`;
    g.fillRect(left, jy - nh / 2 - 7, fw, nh + 14);
    for (let l = 0; l < 4; l++) {
      const x = left + (l + 0.5) * cw, p = this.flash[l], s = 1 + p * 0.1;
      g.beginPath();
      g.roundRect(x - (nw * s) / 2, jy - (nh * s) / 2, nw * s, nh * s, nh * 0.35);
      g.globalAlpha = p > 0.05 ? 0.3 + p * 0.55 : 1;
      g.fillStyle = p > 0.05 ? this.lanes[l].color : 'rgba(255,255,255,.08)';
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 3;
      g.strokeStyle = this.light[l];
      g.stroke();
    }

    // 노트
    for (const n of this.tiles) {
      const y = jy - (n.t - t) * pps;
      if (y < -nh) break;
      const x = left + (n.lane + 0.5) * cw;
      if (n.state === 2) {
        const age = now - (n.hitAt ?? 0);
        if (n.hold || age > 160) continue;
        const k = age / 160;
        g.globalAlpha = 1 - k;
        g.fillStyle = '#fff';
        g.beginPath();
        g.roundRect(x - (nw * (1 + k * 0.3)) / 2, jy - (nh * (1 + k * 0.6)) / 2, nw * (1 + k * 0.3), nh * (1 + k * 0.6), nh * 0.35);
        g.fill();
        g.globalAlpha = 1;
        continue;
      }
      if (n.hold) {
        // 누르는 중이면 머리가 판정선에 붙어 있고, 일찍 떼서 끊긴(4) 롱노트는 남은 꼬리만 회색으로 떨어진다
        const end = jy - (n.t + n.dur - t) * pps;
        if (end - nh > H) continue;
        const cut = n.state === 4, dead = cut || n.state === 3, bw = nw * 0.44;
        const head = n.state === 1 ? jy : cut ? jy - (n.cut - t) * pps : y, tail = Math.max(-nh, end);
        if (head - tail > 2) {
          g.globalAlpha = dead ? 0.35 : n.state === 1 ? 0.95 : 0.7;
          g.fillStyle = dead ? '#8f839c' : n.state === 1 ? this.light[n.lane] : this.lanes[n.lane].color;
          g.beginPath();
          g.roundRect(x - bw / 2, tail - nh * 0.25, bw, head - tail + nh * 0.25, bw / 2);
          g.fill();
          g.lineWidth = 2.5;
          g.strokeStyle = INK;
          g.stroke();
          g.globalAlpha = 1;
        }
        if (!cut) this.note(n, x, head);
        if (n.state === 1 && now - (n.spark ?? 0) > 110) { // 누르고 있는 동안 판정선에서 계속 반짝
          n.spark = now;
          this.fx.push({ ring: true, x, y: jy, color: this.lanes[n.lane].color, born: now });
        }
        continue;
      }
      if (y - nh > H) continue;
      this.note(n, x, y);
    }
    if (fog) drawFog(g, left, fw, jy * 0.58, fog, now);
    if (bomb) drawSmoke(g, left, fw, jy - H * 0.36, jy + nh, bomb, now, this.jam.bomb.from);

    // 캐릭터 얼굴 (각 레인의 주인)
    const ky = jy + (H - jy) * 0.56;
    for (let l = 0; l < 4; l++) {
      const x = left + (l + 0.5) * cw, s = this.fs * (1 + this.flash[l] * 0.15 + pulse * 0.05), face = this.faces[l];
      if (face) g.drawImage(face, x - s / 2, ky - s / 2, s, s);
      else {
        g.beginPath();
        g.arc(x, ky, s * 0.42, 0, Math.PI * 2);
        g.fillStyle = this.lanes[l].color;
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = INK;
        g.stroke();
      }
      if (this.wide) {
        g.font = '15px Jua, sans-serif';
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillText(this.lanes[l].key, x, Math.min(H - 6, ky + s / 2 + 16));
      }
    }

    // 타격 이펙트
    this.fx = this.fx.filter((f) => {
      const age = (now - f.born) / 1000;
      if (f.ring) {
        if (age > 0.35) return false;
        g.beginPath();
        g.arc(f.x, f.y, cw * 0.32 * (1 + age * 3), 0, Math.PI * 2);
        g.strokeStyle = f.color;
        g.globalAlpha = 1 - age / 0.35;
        g.lineWidth = 5 * (1 - age / 0.35) + 1;
        g.stroke();
      } else {
        if (age > 0.55) return false;
        const x = f.x + f.vx * age, y = f.y + f.vy * age + 700 * age * age, r = f.size * (1 - age / 0.55);
        g.globalAlpha = 1 - age / 0.55;
        g.fillStyle = f.color;
        g.beginPath();
        g.moveTo(x, y - r);
        g.quadraticCurveTo(x, y, x + r, y);
        g.quadraticCurveTo(x, y, x, y + r);
        g.quadraticCurveTo(x, y, x - r, y);
        g.quadraticCurveTo(x, y, x, y - r);
        g.fill();
      }
      return true;
    });
    g.globalAlpha = 1;
    g.restore();
  }

  // 납작한 노트 하나 (가로 2 : 세로 1). 가운데에 레인 주인 얼굴
  note(n, x, y) {
    const { g, nw, nh } = this, missed = n.state === 3, color = missed ? '#8f839c' : this.lanes[n.lane].color;
    const x0 = x - nw / 2, y0 = y - nh / 2;
    if (missed) g.globalAlpha = 0.55;
    g.beginPath();
    g.roundRect(x0, y0, nw, nh, nh * 0.35);
    const grad = g.createLinearGradient(0, y0, 0, y0 + nh);
    grad.addColorStop(0, missed ? '#b9adc4' : this.light[n.lane]);
    grad.addColorStop(1, color);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath();
    g.roundRect(x0 + nw * 0.1, y0 + nh * 0.14, nw * 0.8, nh * 0.22, nh * 0.11);
    g.fill();
    const face = this.faces[n.lane], s = nh * 0.8;
    if (n.item && !missed) {
      // 아이템 노트: 무지개 테두리 + 공격 아이콘 (멀티)
      g.lineWidth = 4;
      g.strokeStyle = `hsl(${(performance.now() / 4) % 360}, 90%, 62%)`;
      g.beginPath();
      g.roundRect(x0 - 3, y0 - 3, nw + 6, nh + 6, nh * 0.4);
      g.stroke();
      g.font = `${Math.round(nh * 0.78)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ITEM_ICON[n.item] ?? '⭐', x, y + 1);
      g.textBaseline = 'alphabetic';
    } else if (face && !n.fill) g.drawImage(face, x - s / 2, y - s / 2, s, s);
    else if (n.fill) {
      g.fillStyle = INK;
      g.beginPath();
      g.arc(x, y, nh * 0.12, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

// 멀티플레이: 다른 참가자의 작은 화면. 같은 채보를 같은 시각에 그리고, 받은 판정으로 칸을 반짝인다.
// 판정이 도착하는 데 시간이 걸리니 실제보다 DELAY초 늦은 시각으로 그린다 (노트가 판정선에 닿을 때 반짝이 맞게)
const MINI_JUDGE = [['PERFECT', '#ffe08d'], ['GREAT', '#ffd6e6'], ['GOOD', '#c4f3dc'], ['MISS', '#b9adc4']];
export class Mini {
  static DELAY = 0.6;

  constructor(canvas, tiles, colors) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.tiles = tiles; // 시각 순
    this.colors = colors;
    this.flash = [0, 0, 0, 0];
    this.hue = [0, 0, 0, 0];
    this.queue = [];
    this.seq = 0;
    this.i = 0;
    this.pop = null;
    this.jam = {};
  }

  // 받은 판정 [칸, 판정 번호(0 PERFECT ~ 3 MISS), 시각(ms), 번호] 중 새것만
  feed(ev) {
    for (const e of Array.isArray(ev) ? ev : []) {
      if (!Array.isArray(e) || !(e[3] > this.seq)) continue;
      this.seq = e[3];
      this.queue.push(e);
    }
  }

  attack(kind, ms) { jamAdd(this.jam, kind, ms); }

  draw(t) {
    const { cv, g } = this, dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight, now = performance.now();
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    while (this.queue.length && this.queue[0][2] / 1000 <= t) {
      const [l, j] = this.queue.shift();
      if (l >= 0 && l < 4) {
        this.flash[l] = 1;
        this.hue[l] = j;
      }
      this.pop = { j, at: now };
    }
    const cw = W / 4, jy = H * 0.86, nh = Math.max(4, Math.min(cw * 0.36, 12)), nw = cw * 0.78;
    const shake = jamLevel(this.jam.shake, now), fog = jamLevel(this.jam.fog, now), pps = (jy / 1.15) * (1 + 0.8 * jamLevel(this.jam.speed, now));
    const bomb = jamLevel(this.jam.bomb, now);
    g.clearRect(0, 0, W, H);
    g.save();
    if (shake) sway(g, W / 2, jy, W, shake, now);
    g.fillStyle = 'rgba(28, 18, 52, .88)';
    g.fillRect(-W, 0, W * 3, H);
    for (let l = 0; l < 4; l++) {
      if (this.flash[l] > 0.03) {
        const lg = g.createLinearGradient(0, jy, 0, jy - H * 0.5);
        lg.addColorStop(0, this.hue[l] === 3 ? '#8f839c' : this.colors[l]);
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = this.flash[l] * 0.7;
        g.fillStyle = lg;
        g.fillRect(l * cw, jy - H * 0.5, cw, H * 0.5);
        g.globalAlpha = 1;
        this.flash[l] *= 0.88;
      }
      if (l) {
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.fillRect(l * cw - 0.5, 0, 1, H);
      }
    }
    g.fillStyle = 'rgba(255,141,182,.5)';
    g.fillRect(0, jy - 1.5, W, 3);
    // 이미 지나간 노트는 건너뛴다 (판정선에 닿으면 사라진다)
    while (this.i < this.tiles.length && this.tiles[this.i].t + (this.tiles[this.i].hold ? this.tiles[this.i].dur : 0) < t - 2) this.i++;
    for (let k = this.i; k < this.tiles.length; k++) {
      const n = this.tiles[k], y = jy - (n.t - t) * pps;
      if (y < -nh) break;
      const x = (n.lane + 0.5) * cw;
      g.fillStyle = this.colors[n.lane];
      if (n.hold) {
        const end = Math.max(-nh, jy - (n.t + n.dur - t) * pps), head = Math.min(y, jy);
        if (head - end > 1) {
          g.globalAlpha = 0.7;
          g.fillRect(x - nw * 0.2, end, nw * 0.4, head - end);
          g.globalAlpha = 1;
        }
      }
      if (n.t < t) continue;
      g.beginPath();
      g.roundRect(x - nw / 2, y - nh / 2, nw, nh, nh * 0.35);
      g.fill();
      if (n.item) {
        g.strokeStyle = '#fff3a0';
        g.lineWidth = 2;
        g.stroke();
      }
    }
    if (fog) drawFog(g, 0, W, jy * 0.58, fog, now);
    if (bomb) drawSmoke(g, 0, W, jy - H * 0.36, jy + nh, bomb, now, this.jam.bomb.from);
    const age = this.pop ? now - this.pop.at : 1e9;
    if (age < 450) {
      const [text, color] = MINI_JUDGE[this.pop.j] ?? MINI_JUDGE[3];
      g.globalAlpha = 1 - age / 450;
      g.font = `${Math.round(Math.min(W * 0.17, 18))}px Jua, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.strokeText(text, W / 2, H * 0.46 - age / 40);
      g.fillStyle = color;
      g.fillText(text, W / 2, H * 0.46 - age / 40);
      g.globalAlpha = 1;
    }
    g.restore();
  }
}
