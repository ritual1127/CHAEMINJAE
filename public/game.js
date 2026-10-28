// 곡 데이터 · 소리 합성 · 채보 생성 · 리듬게임 엔진
// 음원 파일 없이 Web Audio로 곡을 직접 합성하고, 멜로디 음 하나하나를 노트로 만든다.

export const LANES = [
  { char: 'chiikawa', color: '#ff9fc4', key: 'KeyD' },
  { char: 'hachiware', color: '#84c4ff', key: 'KeyF' },
  { char: 'usagi', color: '#ffd35c', key: 'KeyJ' },
  { char: 'momonga', color: '#b9a3ff', key: 'KeyK' },
];

// 멜로디 표기: 한 마디 = 8칸(8분음표). 음 이름은 새 음, '-'는 앞 음 늘이기, '.'는 쉼표, 마디는 '|'
// sections: [코드 진행, 멜로디]. order 글자 순서대로 이어 붙인다 (I=인트로, O=아웃트로)
export const SONGS = [
  {
    id: 'picnic', title: '말랑말랑 피크닉', bpm: 112, jacket: 'assets/jacket-picnic.webp',
    level: { easy: 1, normal: 3 },
    drums: { k: 'x...x...', s: '..x...x.', h: '.x.x.x.x', b: 'x...x.x.' },
    order: 'IABAO',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|G|Am|F|C|G|F G|C',
        'E5 - E5 G5 C6 - G5 - | D5 - D5 G5 B5 - G5 - | C5 - C5 E5 A5 - G5 E5 | F5 - E5 D5 C5 - - - |' +
        'E5 - G5 - C6 - D6 - | B5 - G5 - D6 - B5 - | A5 G5 F5 E5 D5 - G5 - | C6 - - - . . . .'],
      B: ['F|G|Em|Am|Dm|G|C|G7',
        'A5 - A5 C6 A5 - F5 - | B5 - B5 D6 B5 - G5 - | G5 - E5 G5 B5 - G5 - | A5 - C6 - E6 - - - |' +
        'F5 - A5 F5 D5 - F5 - | G5 - B5 G5 D5 - B5 - | C6 - G5 E5 C6 - E6 - | D6 - B5 G5 F5 - D5 -'],
      O: ['C', 'C5 E5 G5 C6 - - - -'],
    },
  },
  {
    id: 'roll', title: '데굴데굴 퍼레이드', bpm: 128, jacket: 'assets/jacket-roll.webp',
    level: { easy: 2, normal: 5 },
    drums: { k: 'x...x...', s: '..x...xx', h: 'xxxxxxxx', b: 'x.x.x.x.' },
    order: 'IABABO',
    sections: {
      I: ['G', '. . . . . . . .'],
      A: ['G|C|D|G|G|C|D|G',
        'D5 G5 . G5 B5 . G5 . | E5 G5 . G5 C6 . G5 . | F#5 A5 . A5 D6 . C6 A5 | B5 - G5 - . . D5 - |' +
        'B5 B5 A5 G5 D6 - B5 - | C6 C6 B5 A5 E6 - C6 - | D6 C6 B5 A5 F#5 G5 A5 - | G5 - D5 - G5 - . .'],
      B: ['Em|C|G|D|Em|C|A7|D',
        'G5 - B5 - E6 - D6 B5 | C6 - E5 - G5 - C6 - | B5 - D6 - G6 - F#6 D6 | A5 - - - F#5 - A5 - |' +
        'E5 G5 B5 E6 . E6 D6 B5 | C6 E6 G6 E6 C6 - G5 - | C#6 - A5 - E5 - G5 - | F#5 - A5 - D6 - . .'],
      O: ['G', 'G5 B5 D6 G6 - - - -'],
    },
  },
  {
    id: 'pajama', title: '별빛 파자마 파티', bpm: 150, jacket: 'assets/jacket-pajama.webp',
    level: { easy: 4, normal: 8 },
    drums: { k: 'x..x..x.', s: '..x...x.', h: 'xxxxxxxx', b: 'x..x..x.' },
    order: 'IABABO',
    sections: {
      I: ['Am', '. . . . . . . .'],
      A: ['Am|F|C|G|Am|F|G|E',
        'E5 A5 C6 A5 E6 - C6 A5 | F5 A5 C6 A5 F6 - C6 A5 | G5 C6 E6 C6 G6 - E6 C6 | D6 - B5 - G5 - B5 D6 |' +
        'E6 - D6 C6 B5 - A5 B5 | C6 - B5 A5 G5 - F5 G5 | A5 B5 C6 D6 E6 D6 C6 B5 | G#5 - B5 - E6 - - -'],
      B: ['F|G|Em|Am|Dm|G|C|E7',
        'A5 - C6 - F6 E6 C6 A5 | B5 - D6 - G6 F6 D6 B5 | G5 B5 E6 B5 G5 B5 E6 G6 | E6 - C6 - A5 - . . |' +
        'F5 A5 D6 A5 F6 - D6 A5 | G5 B5 D6 B5 G6 - D6 B5 | C6 E6 G6 E6 D6 C6 B5 A5 | G#5 - B5 - D6 - E6 -'],
      O: ['Am', 'A5 C6 E6 A6 - - - -'],
    },
  },
];

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHORD = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10] };

export function midi(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`음 이름 오류: ${name}`);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

function chord(name) {
  const m = /^([A-G][#b]?)(m7|M7|m|7)?$/.exec(name);
  if (!m) throw new Error(`코드 이름 오류: ${name}`);
  return { root: midi(m[1] + '3'), tones: CHORD[m[2] ?? ''] };
}

const freq = (m) => 440 * 2 ** ((m - 69) / 12);

// 곡 → 마디/멜로디 목록. 마디 칸 수가 틀리면 바로 에러
export function compile(song) {
  const stepSec = 60 / song.bpm / 2;
  const bars = [], melody = [], starts = {};
  let step = 0, cur = null;
  for (const key of song.order) {
    const [chords, mel] = song.sections[key];
    starts[key] ??= step;
    const chordBars = chords.split('|'), melBars = mel.split('|');
    if (chordBars.length !== melBars.length) throw new Error(`${song.id}/${key}: 코드 ${chordBars.length}마디, 멜로디 ${melBars.length}마디`);
    chordBars.forEach((cb, i) => {
      const tokens = melBars[i].trim().split(/\s+/);
      if (tokens.length !== 8) throw new Error(`${song.id}/${key} ${i + 1}마디: ${tokens.length}칸`);
      bars.push({ step, chords: cb.trim().split(/\s+/).map(chord), end: key === 'O' });
      for (const tk of tokens) {
        if (tk === '-') { if (cur) cur.len++; }
        else if (tk === '.') cur = null;
        else melody.push(cur = { step, len: 1, midi: midi(tk) });
        step++;
      }
    });
  }
  return { stepSec, barSec: stepSec * 8, bars, melody, starts, duration: step * stepSec };
}

// 멜로디 → 노트. 음이 올라가면 오른쪽, 내려가면 왼쪽 레인으로 (끝을 넘으면 반대편 끝으로)
export function makeChart(song, diff) {
  const { melody, stepSec } = compile(song);
  const notes = [];
  let lane = 1, prev = null;
  for (const n of melody) {
    if (prev && n.midi !== prev.midi) {
      const d = n.midi - prev.midi;
      lane = (lane + Math.sign(d) * (Math.abs(d) > 4 ? 2 : 1) + 4) % 4;
    }
    prev = n;
    if (diff === 'easy' && n.step % 2) continue; // 쉬움: 박 위의 음만
    notes.push({ t: n.step * stepSec, lane });
    if (diff === 'normal' && n.step % 16 === 0) notes.push({ t: n.step * stepSec, lane: 3 - lane }); // 두 마디마다 동시치기
  }
  return notes;
}

export const JUDGES = [
  { name: 'perfect', w: 0.045, v: 1 },
  { name: 'great', w: 0.09, v: 0.7 },
  { name: 'good', w: 0.135, v: 0.4 },
];
const GOOD = JUDGES[2].w;
export const judgeOf = (dt) => JUDGES.find((j) => Math.abs(dt) <= j.w) ?? null;
export const rankOf = (s) => (s >= 950000 ? 'S' : s >= 850000 ? 'A' : s >= 700000 ? 'B' : s >= 500000 ? 'C' : 'D');

/* ---------- 소리 합성 (OfflineAudioContext로 곡 전체를 미리 렌더링) ---------- */

function env(ctx, out, t, peak, decay, attack = 0.004) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function osc(ctx, type, f, t, len, dest) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.connect(dest);
  o.start(t);
  o.stop(t + len);
  return o;
}

function bell(ctx, out, f, t, dur, vol) {
  const d = Math.min(dur + 0.45, 1.5);
  osc(ctx, 'triangle', f, t, d + 0.05, env(ctx, out, t, vol, d));
  osc(ctx, 'sine', f * 2, t, d, env(ctx, out, t, vol * 0.35, d * 0.5));
  osc(ctx, 'sine', f * 4, t, 0.25, env(ctx, out, t, vol * 0.1, 0.12));
}

function hiss(ctx, out, noise, t, vol, decay, hp) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  s.connect(f).connect(env(ctx, out, t, vol, decay, 0.001));
  s.start(t, Math.random() * 0.5);
  s.stop(t + decay + 0.05);
}

function kick(ctx, out, t) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  o.connect(env(ctx, out, t, 0.8, 0.24, 0.002));
  o.start(t);
  o.stop(t + 0.3);
}

function makeNoise(ctx, sec, decayPow = 0) {
  const len = Math.ceil(sec * ctx.sampleRate), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decayPow;
  }
  return b;
}

export async function renderSong(song) {
  const c = compile(song), sr = 44100, S = c.stepSec;
  const ctx = new OfflineAudioContext(2, Math.ceil((c.duration + 2.5) * sr), sr);
  const out = ctx.createDynamicsCompressor();
  out.connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = makeNoise(ctx, 1.8, 3);
  const wet = ctx.createGain();
  wet.gain.value = 0.2;
  verb.connect(wet).connect(out);
  const bus = ctx.createGain();
  bus.connect(out);
  bus.connect(verb);
  const noise = makeNoise(ctx, 1);
  const { k, s, h, b } = song.drums;

  for (const n of c.melody) bell(ctx, bus, freq(n.midi), n.step * S, n.len * S, 0.22);

  for (const bar of c.bars) {
    const t0 = bar.step * S, per = 8 / bar.chords.length;
    if (bar.end) { // 마지막 마디: 화음 한 번 + 심벌
      const ch = bar.chords[0];
      ch.tones.forEach((iv, i) => bell(ctx, bus, freq(ch.root + 12 + iv), t0 + i * 0.03, 1.2, 0.07));
      osc(ctx, 'triangle', freq(ch.root), t0, 1.6, env(ctx, out, t0, 0.3, 1.5));
      kick(ctx, out, t0);
      hiss(ctx, out, noise, t0, 0.16, 1.4, 4000);
      continue;
    }
    let bassHit = 0;
    for (let st = 0; st < 8; st++) {
      const t = t0 + st * S, ch = bar.chords[Math.floor(st / per)];
      const tones = [...ch.tones, 12];
      osc(ctx, 'triangle', freq(ch.root + 12 + tones[[0, 2, 1, 2, 3, 2, 1, 2][st] % tones.length]), t, 0.3, env(ctx, bus, t, 0.05, 0.2));
      if (b[st] === 'x') {
        const f = freq(ch.root + (bassHit++ % 2 ? 7 : 0));
        osc(ctx, 'triangle', f, t, 0.35, env(ctx, out, t, 0.3, 0.3, 0.006));
        osc(ctx, 'sine', f / 2, t, 0.35, env(ctx, out, t, 0.25, 0.3, 0.006));
      }
      if (k[st] === 'x') kick(ctx, out, t);
      if (s[st] === 'x') {
        hiss(ctx, out, noise, t, 0.22, 0.13, 1500);
        osc(ctx, 'triangle', 190, t, 0.1, env(ctx, out, t, 0.12, 0.07));
      }
      if (h[st] === 'x') hiss(ctx, out, noise, t, st % 2 ? 0.07 : 0.04, 0.035, 7000);
    }
  }
  return ctx.startRendering();
}

/* ---------- 실시간 오디오: 로비 음악, 효과음, 게임 재생 ---------- */

export const sound = {
  ctx: null,
  buffers: new Map(),
  bgmNode: null,
  bgmToken: null,

  get() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS 무음 스위치에도 소리 나게
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  // 스피커에서 지금 실제로 나오고 있는 시각 (출력 지연 보정)
  now() {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts?.contextTime) return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    return this.ctx.currentTime - (this.ctx.outputLatency || 0);
  },

  load(song) {
    if (!this.buffers.has(song.id)) {
      this.buffers.set(song.id, renderSong(song).catch((e) => { this.buffers.delete(song.id); throw e; }));
    }
    return this.buffers.get(song.id);
  },

  async bgm(song, section = 'A') {
    const token = (this.bgmToken = {});
    this.stopBgm();
    if (!song) return;
    const buf = await this.load(song);
    if (this.bgmToken !== token) return;
    const ctx = this.get(), c = compile(song), t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = c.starts[section] * c.stepSec;
    src.loopEnd = src.loopStart + c.barSec * 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.8);
    src.connect(g).connect(ctx.destination);
    src.start(t, src.loopStart);
    this.bgmNode = { src, g };
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

  sfx(kind, vol = 0.16) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const notes = { tap: [988, 1319], ok: [784, 1175, 1568], back: [784, 523], hit: [1760], fan: [523, 659, 784, 1047, 1319] }[kind];
    notes.forEach((f, i) => {
      const t = t0 + i * (kind === 'fan' ? 0.09 : 0.055);
      osc(ctx, 'sine', f, t, 0.2, env(ctx, ctx.destination, t, vol, kind === 'hit' ? 0.05 : 0.14, 0.003));
    });
  },
};

/* ---------- 게임 엔진 ---------- */

const PERSPECTIVE = 1.3; // 클수록 멀리 있는 노트가 작아짐

function noteSprite(img, color, px) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(px);
  const g = c.getContext('2d'), r = px / 2;
  g.beginPath();
  g.arc(r, r, r * 0.9, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = px * 0.07;
  g.strokeStyle = '#fff';
  g.stroke();
  g.beginPath();
  g.arc(r, r, r * 0.97, 0, Math.PI * 2);
  g.lineWidth = px * 0.035;
  g.strokeStyle = '#4a3953';
  g.stroke();
  const w = px * 0.74, h = (w * img.height) / img.width;
  g.drawImage(img, r - w / 2, r - h / 2 + px * 0.03, w, h);
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.beginPath();
  g.ellipse(r * 0.55, r * 0.42, r * 0.2, r * 0.1, -0.7, 0, Math.PI * 2);
  g.fill();
  return c;
}

export class Game {
  // opts: { song, diff, speed, offset(ms), hitSound, images[lane], onJudge, onTick, onEnd }
  constructor(canvas, opts) {
    Object.assign(this, opts);
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.approach = 2.4 - this.speed * 0.18; // 노트가 화면 끝에서 판정선까지 오는 시간(초)
    this.chart = compile(this.song);
    this.notes = makeChart(this.song, this.diff);
    this.byLane = LANES.map((_, l) => this.notes.filter((n) => n.lane === l));
    this.ptr = [0, 0, 0, 0];
    this.flash = [0, 0, 0, 0];
    this.pop = [0, 0, 0, 0];
    this.held = [false, false, false, false];
    this.fx = [];
    this.stats = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.combo = this.maxCombo = this.acc = 0;
    this.endT = this.chart.duration + 0.8;
    this.loop = this.loop.bind(this);
    this.resize();
  }

  get score() { return Math.round((1e6 * this.acc) / this.notes.length); }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const { width: W, height: H } = this.cv.getBoundingClientRect();
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    Object.assign(this, { W, H, lw: Math.min(W - 20, 440) / 4, jy: H - Math.max(110, H * 0.15), ty: Math.max(84, H * 0.11) });
    this.sprites = this.images.map((img, l) => noteSprite(img, LANES[l].color, this.lw * 0.86 * dpr));
  }

  // 원근 투영: z=0 판정선, z=1 길 끝
  s(z) { return 1 / (1 + PERSPECTIVE * z); }
  y(z) { return this.jy - ((this.jy - this.ty) * (1 - this.s(z))) / (1 - this.s(1)); }
  x(pos, z) { return this.W / 2 + (pos - 2) * this.lw * this.s(z); }
  laneAt(px) { return Math.max(0, Math.min(3, Math.floor((px - this.W / 2) / this.lw + 2))); }

  async start() {
    this.buf = await sound.load(this.song);
    this.play(0, 1.8);
  }

  // 버퍼 위치 pos를 lead초 뒤에 재생. 게임 시각 = 스피커 시각 - base - 싱크 보정
  play(pos, lead) {
    const ctx = sound.get(), at = ctx.currentTime + lead;
    this.src = ctx.createBufferSource();
    this.src.buffer = this.buf;
    this.src.connect(ctx.destination);
    if (pos >= 0) this.src.start(at, pos);
    else this.src.start(at - pos, 0);
    this.base = at - pos;
    this.running = true;
    this.raf = requestAnimationFrame(this.loop);
  }

  time() { return sound.now() - this.base - this.offset / 1000; }

  pause() {
    if (!this.running) return false;
    this.running = false;
    this.pausedAt = this.time();
    this.src.stop();
    cancelAnimationFrame(this.raf);
    return true;
  }

  resume() { this.play(this.pausedAt + this.offset / 1000, 1.5); } // 1.5초 되감아서 다시 시작

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    try { this.src?.stop(); } catch {}
  }

  release(lane) { this.held[lane] = false; }

  press(lane) {
    this.flash[lane] = 1;
    this.held[lane] = true;
    if (!this.running) return;
    const t = this.time(), n = this.byLane[lane][this.ptr[lane]];
    const j = n && judgeOf(t - n.t);
    if (j) this.judge(lane, j.name, j.v);
  }

  judge(lane, name, v) {
    this.byLane[lane][this.ptr[lane]++].done = true;
    this.stats[name]++;
    if (name === 'miss') this.combo = 0;
    else {
      this.combo++;
      this.acc += v;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.pop[lane] = 1;
      this.burst(lane, name);
      if (this.hitSound) sound.sfx('hit', 0.07);
    }
    this.onJudge(name, this.combo, this.score);
  }

  burst(lane, name) {
    const x = this.x(lane + 0.5, 0), y = this.jy, now = performance.now(), color = LANES[lane].color;
    this.fx.push({ ring: true, x, y, color, born: now });
    const count = name === 'perfect' ? 9 : 5;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 160 + Math.random() * 260;
      this.fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: i % 3 ? color : '#fff', size: 5 + Math.random() * 6, born: now });
    }
  }

  loop() {
    if (!this.running) return;
    const t = this.time();
    for (let l = 0; l < 4; l++) {
      const lane = this.byLane[l];
      while (this.ptr[l] < lane.length && lane[this.ptr[l]].t < t - GOOD) this.judge(l, 'miss', 0);
    }
    this.draw(t);
    this.onTick(Math.min(1, Math.max(0, t / this.chart.duration)));
    if (t > this.endT) {
      this.stop();
      const s = this.score;
      return this.onEnd({ score: s, rank: rankOf(s), combo: this.maxCombo, stats: this.stats, total: this.notes.length });
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  draw(t) {
    const { g, W, H } = this;
    g.clearRect(0, 0, W, H);
    const zb = -0.3, zt = 1;

    // 길
    const body = g.createLinearGradient(0, this.ty, 0, H);
    body.addColorStop(0, 'rgba(46,30,86,.05)');
    body.addColorStop(0.5, 'rgba(46,30,86,.4)');
    body.addColorStop(1, 'rgba(46,30,86,.62)');
    g.fillStyle = body;
    this.quad(0, 4, zb, zt);
    g.fill();

    // 눌린 레인 빛기둥
    for (let l = 0; l < 4; l++) {
      if (this.flash[l] < 0.02) continue;
      const lg = g.createLinearGradient(0, this.jy, 0, this.y(0.7));
      lg.addColorStop(0, LANES[l].color);
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = this.flash[l] * 0.75;
      g.fillStyle = lg;
      this.quad(l, l + 1, 0, 0.7);
      g.fill();
      this.flash[l] *= this.held[l] ? 0.93 : 0.82;
    }
    g.globalAlpha = 1;

    // 레인 구분선
    g.lineCap = 'round';
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(this.x(i, zb), this.y(zb));
      g.lineTo(this.x(i, zt), this.y(zt));
      g.strokeStyle = i % 4 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.75)';
      g.lineWidth = i % 4 ? 1.5 : 3;
      g.stroke();
    }

    // 마디선
    const bs = this.chart.barSec;
    for (let bt = Math.ceil(t / bs) * bs; bt < t + this.approach; bt += bs) {
      const z = (bt - t) / this.approach, y = this.y(z);
      g.beginPath();
      g.moveTo(this.x(0, z), y);
      g.lineTo(this.x(4, z), y);
      g.strokeStyle = `rgba(255,255,255,${0.3 * (1 - z)})`;
      g.lineWidth = 2;
      g.stroke();
    }

    // 판정선
    g.save();
    g.shadowColor = '#fff';
    g.shadowBlur = 14;
    g.beginPath();
    g.moveTo(this.x(0, 0), this.jy);
    g.lineTo(this.x(4, 0), this.jy);
    g.strokeStyle = '#fff';
    g.lineWidth = 5;
    g.stroke();
    g.restore();

    // 패드
    const pr = this.lw * 0.42;
    for (let l = 0; l < 4; l++) {
      const x = this.x(l + 0.5, 0), sc = 1 + this.pop[l] * 0.18;
      this.pop[l] *= 0.85;
      g.beginPath();
      g.arc(x, this.jy, pr * sc, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,.2)';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = LANES[l].color;
      g.stroke();
      g.globalAlpha = 0.45 + this.flash[l] * 0.55;
      const img = this.images[l], w = pr * 1.35 * sc, h = (w * img.height) / img.width;
      g.drawImage(img, x - w / 2, this.jy - h / 2, w, h);
      g.globalAlpha = 1;
    }

    // 노트 (먼 것부터)
    const size = this.lw * 0.86;
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i], z = (n.t - t) / this.approach;
      if (n.done || z > 1) continue;
      const s = this.s(z), sz = size * s;
      g.globalAlpha = z > 0.85 ? (1 - z) / 0.15 : 1;
      g.drawImage(this.sprites[n.lane], this.x(n.lane + 0.5, z) - sz / 2, this.y(z) - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;

    // 타격 이펙트
    const now = performance.now();
    this.fx = this.fx.filter((f) => {
      const age = (now - f.born) / 1000;
      if (f.ring) {
        if (age > 0.35) return false;
        g.beginPath();
        g.arc(f.x, f.y, pr * (1 + age * 2.6), 0, Math.PI * 2);
        g.strokeStyle = f.color;
        g.globalAlpha = 1 - age / 0.35;
        g.lineWidth = 5 * (1 - age / 0.35) + 1;
        g.stroke();
      } else {
        if (age > 0.55) return false;
        const x = f.x + f.vx * age, y = f.y + f.vy * age + 700 * age * age, r = f.size * (1 - age / 0.55);
        g.globalAlpha = 1 - age / 0.55;
        g.fillStyle = f.color;
        g.beginPath(); // 반짝이(4각 별)
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
  }

  quad(a, b, z0, z1) {
    const g = this.g;
    g.beginPath();
    g.moveTo(this.x(a, z0), this.y(z0));
    g.lineTo(this.x(b, z0), this.y(z0));
    g.lineTo(this.x(b, z1), this.y(z1));
    g.lineTo(this.x(a, z1), this.y(z1));
    g.closePath();
  }
}
