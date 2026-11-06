// 곡 데이터 · 악보 해석 · 채보(노트) 생성
// 악보 표기: 한 마디 = meter * sub 칸 (sub 기본 2 = 8분음표, 4 = 16분음표). 음 이름은 새 음, '-'는 앞 음 늘이기, '.'는 쉼표, 마디 구분은 '|'
// 코드: 마디를 균등하게 나눠 여러 개 적을 수 있고, '-'는 반주 쉼, 'Dm7/C'처럼 베이스음 지정 가능
// sections: { 키: [코드, 멜로디, { bpm, shift, drums }] } 또는 { from: 다른 키, bpm, shift, drums } / order: 키를 이어 붙인 순서
// 편곡: style 반주 음형 · voice 멜로디 악기 · bass 신스 베이스 · drums 드럼 패턴 (구간마다 바꿀 수 있음)
// 저작권: 모두 작곡가 사후 70년이 지났거나 작자 미상인 민요라 자유롭게 쓸 수 있는 곡만 넣는다

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const CHORD = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dim: [0, 3, 6, 9], aug: [0, 4, 8],
  sus4: [0, 5, 7], sus2: [0, 2, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], M9: [0, 4, 7, 11, 14], add9: [0, 4, 7, 14],
};

// 같은 씨앗이면 늘 같은 난수가 나오는 작은 난수 생성기 (채보 변주 · 멀티 아이템 노트를 모든 기기에서 똑같이 만들려고)
export const hashStr = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};
export const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const DIFFS = ['easy', 'normal', 'hard', 'expert', 'master', 'extreme', 'inferno', 'chaos'];
export const DIFF_NAME = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD', expert: 'EXPERT', master: 'MASTER', extreme: 'EXTREME', inferno: 'INFERNO', chaos: 'CHAOS' };

export function midi(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`음 이름 오류: ${name}`);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const noteName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// 근음은 3옥타브, 베이스는 근음보다 낮게
export function chord(name) {
  if (name === '-') return null;
  const m = /^([A-G][#b]?)(m7|M7|m9|M9|m6|m|7|9|6|dim|aug|sus4|sus2|add9)?(?:\/([A-G][#b]?))?$/.exec(name);
  if (!m) throw new Error(`코드 이름 오류: ${name}`);
  const root = midi(m[1] + '3');
  let bass = m[3] ? midi(m[3] + '3') : root;
  if (bass > root) bass -= 12;
  return { root, bass, tones: CHORD[m[2] ?? ''] };
}

// 바흐 프렐류드처럼 '5음 → 16칸' 반복 음형을 펼친다
const figure = (bars) => bars.map((b) => {
  const [a, c, d, e, f] = b.split(' '), half = `${a} ${c} ${d} ${e} ${f} ${d} ${e} ${f}`;
  return `${half} ${half}`;
}).join(' | ');

// 화음 펼침(토카타 후반부): 코드마다 16칸 아르페지오
const sweep = (chords, oct) => chords.map((name) => {
  const { root, tones } = chord(name), t = (i) => noteName(root + 12 * (oct - 3) + tones[i % tones.length] + 12 * Math.floor(i / tones.length));
  return [3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2].map(t).join(' ');
}).join(' | ');

// 파티 곡 재료. 라 쿠카라차: 후렴(못갖춘마디 '도도도'는 앞 마디 끝에) · 후렴 사이사이 기타가 받아 치는 가락 / R16: 16칸 쉼
const CUCA = 'F5 - - A5 - C5 C5 C5 | F5 - - A5 - - - . | F5 F5 E5 E5 D5 D5 C5 - | - - - - . C5 C5 C5 |' +
  'E5 - - G5 - C5 C5 C5 | E5 - - G5 - - - . | C6 D6 C6 Bb5 A5 G5 F5 - | ';
const CUCA_ALT = '. . . . . . . . | . . . . . C6 A5 F5 | . . . . . . . . | . E5 G5 Bb5 . . . . |' +
  '. . . . . . . . | . . . . . Bb5 G5 E5 | . . . . . . . . | . A5 C6 F6 . . . .';
const R16 = '. . . . . . . . . . . . . . . .';

export const SONGS = [
  {
    id: 'twinkle', genre: 'classic', title: '작은 별 변주곡', composer: '모차르트', bpm: 104, meter: 4,
    price: 0, style: 'alberti', drums: 'light', order: 'IAVO',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|F C|F C|G C|C G7|C G|C G7|C G|C|F C|F C|G C',
        'C5 - C5 - G5 - G5 - | A5 - A5 - G5 - - - | F5 - F5 - E5 - E5 - | D5 - D5 - C5 - - - |' +
        'G5 - G5 - F5 - F5 - | E5 - E5 - D5 - - - | G5 - G5 - F5 - F5 - | E5 - E5 - D5 - - - |' +
        'C5 - C5 - G5 - G5 - | A5 - A5 - G5 - - - | F5 - F5 - E5 - E5 - | D5 - D5 - C5 - - -'],
      V: ['C|F C|F C|G C|C G7|C G|C G7|C G|C|F C|F C|G C',
        'C5 C5 C5 C5 G5 G5 G5 G5 | A5 A5 A5 A5 G5 - - - | F5 F5 F5 F5 E5 E5 E5 E5 | D5 D5 D5 D5 C5 - - - |' +
        'G5 G5 G5 G5 F5 F5 F5 F5 | E5 E5 E5 E5 D5 - - - | G5 G5 G5 G5 F5 F5 F5 F5 | E5 E5 E5 E5 D5 - - - |' +
        'C6 C6 C6 C6 G5 G5 G5 G5 | A5 A5 A5 A5 G5 - - - | F5 F5 F5 F5 E5 E5 E5 E5 | D5 D5 D5 D5 C5 - - -', { drums: 'dance' }],
      O: ['C', 'C5 E5 G5 C6 - - - -'],
    },
  },
  {
    id: 'jingle', genre: 'carol', title: '징글벨', composer: '피어폰트', bpm: 168, meter: 4,
    price: 0, style: 'stab', voice: 'bell', bass: 'walk', drums: 'dance', order: 'IVCVCO',
    jacket: 'cards/chiikawa', jc: '#ffd9e8',
    sections: {
      I: ['C|G7', '. . . . . . . . | . . . . . . . .'],
      V: ['C|C|C|F|F|G|G7|C',
        'G4 - E5 - D5 - C5 - | G4 - - - - - G4 G4 | G4 - E5 - D5 - C5 - | A4 - - - - - - - |' +
        'A4 - F5 - E5 - D5 - | B4 - - - - - - - | G5 - G5 - F5 - D5 - | E5 - - - - - - -'],
      C: ['C|C|C|C|F|C|D7|G|C|C|C|C|F|C|G7|C',
        'E5 - E5 - E5 - - - | E5 - E5 - E5 - - - | E5 - G5 - C5 - - D5 | E5 - - - - - - - |' +
        'F5 - F5 - F5 - - F5 | F5 - E5 - E5 - E5 E5 | E5 - D5 - D5 - E5 - | D5 - - - G5 - - - |' +
        'E5 - E5 - E5 - - - | E5 - E5 - E5 - - - | E5 - G5 - C5 - - D5 | E5 - - - - - - - |' +
        'F5 - F5 - F5 - - F5 | F5 - E5 - E5 - E5 E5 | G5 - G5 - F5 - D5 - | C5 - - - - - - -'],
      O: ['C', 'C5 - E5 - G5 - C6 -'],
    },
  },
  {
    id: 'saints', genre: 'folk', title: '성자의 행진', composer: '미국 민요', bpm: 168, meter: 4,
    price: 0, style: 'march', voice: 'brass', drums: 'rock', order: 'IABO',
    jacket: 'cards/shisa', jc: '#ffe2c4',
    sections: {
      I: ['C|G7', '. . . . . . . . | . . . . . . . .'],
      A: ['C|C|C|C|C|C|C|G|C|C7|C7|C7 F|C|C|G7|C',
        '. . C5 - E5 - F5 - | G5 - - - - - - - | . . C5 - E5 - F5 - | G5 - - - - - - - |' +
        '. . C5 - E5 - F5 - | G5 - - - E5 - - - | C5 - - - E5 - - - | D5 - - - - - - - |' +
        'E5 - - - E5 - D5 - | C5 - - - . . C5 - | E5 - - - G5 - - - | G5 - - - F5 - - - |' +
        '. . E5 - F5 - G5 - | E5 - - - C5 - - - | D5 - - - - - - - | C5 - - - - - - -'],
      B: { from: 'A', bpm: 184 },
      O: ['C', 'C5 - E5 - G5 - C6 -', { bpm: 184 }],
    },
  },
  {
    id: 'cucaracha', genre: 'folk', title: '라 쿠카라차', composer: '멕시코 민요', bpm: 150, meter: 4,
    price: 0, style: 'march', voice: 'brass', drums: 'rock', order: 'IAABO',
    jacket: 'cards/kani', jc: '#ffe0ec',
    sections: {
      I: ['F|C7', '. . . . . . . . | . . . . . . . .'],
      A: ['F|F|C|C|C|C|C7|F',
        'C5 C5 C5 F5 - - A5 - | C5 C5 C5 F5 - - A5 - | F5 - F5 E5 - E5 D5 - | D5 C5 - - - - . . |' +
        'C5 C5 C5 E5 - - G5 - | C5 C5 C5 E5 - - G5 - | C6 - D6 C6 Bb5 A5 G5 - | F5 - - - - - . .'],
      B: { from: 'A', bpm: 170 },
      O: ['F', 'F5 - A5 - C6 - F6 -', { bpm: 170 }],
    },
  },
  // ── 파티 · 축제: 트럼펫 두 대(3도 화음) · 기타 스트럼 · 라틴 타악기 · 조옮김 · 점점 빨라지기 ──
  {
    // 후렴 + 절(멕시코 민요 원래 가락) + 한 음 올려 더 빠르게. 전주 팡파르와 기타가 받는 가락은 이 게임용 편곡
    id: 'cucafiesta', genre: 'party', title: '라 쿠카라차 피에스타 (마리아치)', composer: '멕시코 민요', bpm: 160, meter: 4,
    price: 0, style: 'ranchera', voice: 'trumpet', voice2: 'nylon', drums: 'fiesta', harm: 'F', order: 'IBVBLKMO',
    jacket: 'cards/usagi', jc: '#fff0b8',
    sections: {
      I: ['F|F|C7|C7', 'C5 F5 A5 C6 - - - - | C6 A5 C6 F6 - - - - | E6 - D6 - C6 - Bb5 - | G5 - E5 - . C5 C5 C5'],
      A: ['F|F|F C7|C7|C7|C7|C7|F', `${CUCA}- - - - . C5 C5 C5`, { alt: CUCA_ALT }],
      B: ['F|F|F C7|C7|C7|C7|C7|F', `${CUCA}- - - - . . . .`, { alt: CUCA_ALT }],
      V: ['F|F|F|C7|C7|C7|C7|F',
        'C5 C5 F5 F5 A5 A5 . . | C6 - - A5 - - - . | C6 D6 C6 Bb5 A5 C6 . . | Bb5 - - G5 - - - . |' +
        'C5 C5 E5 E5 G5 G5 . . | Bb5 - - G5 - - - . | C6 D6 C6 Bb5 A5 G5 . . | A5 - - F5 - C5 C5 C5',
        { harm: false, drums: 'march',
          alt: '. . . . . . A4 C5 | . . . . . F5 A5 C6 | . . . . . . A4 C5 | . . . . . E5 G5 Bb5 |' +
            '. . . . . . G4 Bb4 | . . . . . G5 Bb5 C6 | . . . . . . E5 G5 | . . . . . . . .' }],
      L: ['D7', '. . . . . D5 D5 D5', { drums: 'build' }],
      K: { from: 'A', shift: 2, bpm: 176 },
      M: { from: 'B', shift: 2, bpm: 190 },
      O: ['F C7|F', 'F5 A5 C6 F6 - . C6 C6 | F6 - - - . . . .', { shift: 2, bpm: 190 }],
    },
  },
  {
    // 유대 민요 (이델손 채보 1918): 처음엔 느긋하게, 돌 때마다 빨라진다
    id: 'havanagila', genre: 'party', title: '하바 나길라 (점점 빨라져요!)', composer: '유대 민요', bpm: 132, meter: 4, sub: 4,
    price: 0, style: 'polka', voice: 'clarinet', voice2: 'accordion', drums: 'march', order: 'IAABBCDEFO',
    jacket: 'cards/kani', jc: '#ffe1c2',
    sections: {
      I: ['D|D', `${R16} | ${R16}`],
      A: ['D|D|Cm|D Cm D D',
        'D5 - - - D5 - - - - - F#5 - Eb5 - D5 - | F#5 - - - F#5 - - - - - A5 - G5 - F#5 - |' +
        'G5 - - - G5 - - - - - Bb5 - A5 - G5 - | F#5 - - - Eb5 D5 Eb5 - D5 - - - - - - -'],
      B: ['D|Cm|Cm|D Cm D D',
        'F#5 - F#5 - - - Eb5 - D5 - D5 - D5 - - - | Eb5 - Eb5 - - - D5 - C5 - C5 - C5 - - - |' +
        'C5 - - - Eb5 - - D5 C5 - C5 - G5 - - - | F#5 - - - Eb5 D5 Eb5 - D5 - - - - - - -', { bpm: 144, drums: 'fiesta' }],
      C: ['Gm|Gm|Gm|Gm|Cm|Cm|D7|D|Gm',
        'G5 - - - - - - - G5 - - - - - - - | G5 - - - G5 - - - G5 - - - G5 - - - |' +
        'G5 - G5 - Bb5 - - A5 G5 - Bb5 - A5 - G5 - | G5 - G5 - Bb5 - - A5 G5 - Bb5 - A5 - G5 - |' +
        'A5 - A5 - C6 - - Bb5 A5 - C6 - Bb5 - A5 - | A5 - A5 - C6 - - Bb5 A5 - C6 - Bb5 - A5 - |' +
        'A5 - A5 - D6 - - - D5 - D5 - D6 - - - | . . D5 - D5 - D5 - Bb5 - A5 - G5 - F#5 - | G5 - - - - - - - - - - - . . . .',
        { bpm: 152, drums: 'fiesta',
          alt: `${R16} | Bb4 - - - Bb4 - - - D5 - - - D5 - - - | ${R16} | ${R16} | ${R16} | ${R16} | ${R16} | ${R16} | ${R16}` }],
      D: { from: 'A', bpm: 168, drums: 'fiesta' },
      E: { from: 'B', bpm: 176 },
      F: { from: 'C', bpm: 188 },
      O: ['Gm', 'G5 - - - - - - - . . . . . . . .', { bpm: 188 }],
    },
  },
  {
    // 이 게임용 창작곡: 삼바 리듬(쉬었다 당겨 치기) + 트럼펫이 부르면 마림바가 받는 가락
    id: 'sambaura', genre: 'party', title: '우라! 삼바 카니발', composer: '먼작귀 사운드', bpm: 116, meter: 4, sub: 4,
    price: 0, style: 'dembow', voice: 'trumpet', voice2: 'marimba', bass: 'walk', drums: 'samba', harm: 'C', order: 'IABALKO',
    jacket: 'cards/chiikawa', jc: '#c9f2d0',
    sections: {
      I: ['C|G7', `${R16} | ${R16}`, { alt: 'C5 - - E5 - - G5 - C6 - - G5 - - E5 - | D5 - - F5 - - G5 - B5 - - G5 - - D5 -' }],
      A: ['C|C|F|G7|C|Am|Dm G7|C',
        'E5 - G5 - - E5 G5 - C6 - - - . . G5 - | A5 - G5 - - E5 - - G5 - - - . . . . |' +
        'F5 - A5 - - F5 A5 - C6 - - - . . A5 - | B5 - A5 - - G5 - - D5 - - - . . . . |' +
        'E5 - G5 - - E5 G5 - C6 - - - . . C6 - | E6 - D6 - - C6 - - A5 - - - . . . . |' +
        'F5 - A5 - - D6 - - C6 - B5 - A5 - G5 - | C6 - - - - - . . C6 - C6 - C6 - . .',
        { alt: `${R16} | . . . . . . . . . . . . E5 G5 C6 . | ${R16} | . . . . . . . . . . . . G5 B5 D6 . |` +
          `${R16} | . . . . . . . . . . . . A5 C6 E6 . | ${R16} | ${R16}` }],
      B: ['F|F|C|C|F|F|D7|G7',
        'A5 - - A5 - - A5 - C6 - - A5 - - F5 - | A5 - - - - - . . . . . . . . . . |' +
        'G5 - - G5 - - G5 - C6 - - G5 - - E5 - | G5 - - - - - . . . . . . . . . . |' +
        'A5 - - A5 - - A5 - C6 - - A5 - - F5 - | A5 - - - - - . . . . . . . . . . |' +
        'F#5 - - A5 - - C6 - D6 - - C6 - - A5 - | B5 - - - D6 - - - G6 - - - . . . .',
        { harm: false,
          alt: `${R16} | . . . . . . . . C5 - F5 - A5 - C6 - | ${R16} | . . . . . . . . G4 - C5 - E5 - G5 - |` +
            `${R16} | . . . . . . . . F5 - A5 - C6 - F6 - | ${R16} | ${R16}` }],
      L: ['A7', 'A5 - B5 - C#6 - D6 - E6 - - - . . . .', { drums: 'build', harm: false }],
      K: { from: 'A', shift: 2, bpm: 126 },
      O: ['C', 'C6 - - - . . . . . . . . . . . .', { shift: 2, bpm: 126 }],
    },
  },
  {
    id: 'ode', genre: 'classic', title: '환희의 송가', composer: '베토벤', bpm: 120, meter: 4,
    price: 0, style: 'march', drums: 'march', order: 'IABABO',
    sections: {
      I: ['D', '. . . . . . . .'],
      A: ['D|D A|D|D A|D|D A|D|A D',
        'F#5 - F#5 - G5 - A5 - | A5 - G5 - F#5 - E5 - | D5 - D5 - E5 - F#5 - | F#5 - - E5 E5 - - - |' +
        'F#5 - F#5 - G5 - A5 - | A5 - G5 - F#5 - E5 - | D5 - D5 - E5 - F#5 - | E5 - - D5 D5 - - -'],
      B: ['A D|A D|A7 A|D A|D|D A|D|A D',
        'E5 - E5 - F#5 - D5 - | E5 - F#5 G5 F#5 - D5 - | E5 - F#5 G5 F#5 - E5 - | D5 - E5 - A4 - - - |' +
        'F#5 - F#5 - G5 - A5 - | A5 - G5 - F#5 - E5 - | D5 - D5 - E5 - F#5 - | E5 - - D5 D5 - - -'],
      O: ['D', 'D5 F#5 A5 D6 - - - -'],
    },
  },
  {
    id: 'home', genre: 'classic', title: '귀향 (신세계 교향곡)', composer: '드보르자크', bpm: 72, meter: 4,
    price: 0, style: 'pad', order: 'IAHO',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|C|G C|G|C|C|G G7|C',
        'E5 - - G5 G5 - - - | E5 - - D5 C5 - - - | D5 - - E5 G5 - - E5 | D5 - - - - - - - |' +
        'E5 - - G5 G5 - - - | E5 - - D5 C5 - - - | D5 - - E5 D5 - - C5 | C5 - - - - - - -'],
      H: { from: 'A', shift: 12 },
      O: ['C', 'C5 E5 G5 C6 - - - -'],
    },
  },
  {
    id: 'minuet', genre: 'classic', title: '미뉴에트 G장조', composer: '바흐', bpm: 126, meter: 3,
    price: 0, style: 'waltz', drums: 'waltz', order: 'IABO',
    sections: {
      I: ['G', '. . . . . .'],
      A: ['G|G|C|G|C|G|D|D|G|G|C|G|C|G|D|G',
        'D5 - G4 A4 B4 C5 | D5 - G4 - G4 - | E5 - C5 D5 E5 F#5 | G5 - G4 - G4 - |' +
        'C5 - D5 C5 B4 A4 | B4 - C5 B4 A4 G4 | F#4 - G4 A4 B4 G4 | A4 - - - - - |' +
        'D5 - G4 A4 B4 C5 | D5 - G4 - G4 - | E5 - C5 D5 E5 F#5 | G5 - G4 - G4 - |' +
        'C5 - D5 C5 B4 A4 | B4 - C5 B4 A4 G4 | A4 - B4 A4 G4 F#4 | G4 - - - - -'],
      B: ['G|D|G|A|A|A7|D A|D|G|C|G|D|D|Am|G D|G',
        'B5 - G5 A5 B5 G5 | A5 - D5 E5 F#5 D5 | G5 - E5 F#5 G5 D5 | C#5 - B4 C#5 A4 - |' +
        'A4 B4 C#5 D5 E5 F#5 | G5 - F#5 - E5 - | F#5 - A4 - C#5 - | D5 - - - - - |' +
        'D5 - G4 F#4 G4 - | E5 - G4 F#4 G4 - | D5 - C5 - B4 - | A4 G4 F#4 G4 A4 - |' +
        'D4 E4 F#4 G4 A4 B4 | C5 - B4 - A4 - | B4 D5 G4 - F#4 - | G4 - - - - -'],
      O: ['G', 'G4 B4 D5 G5 - -'],
    },
  },
  {
    id: 'korobeiniki', genre: 'folk', title: '코로베이니키', composer: '러시아 민요', bpm: 150, meter: 4,
    price: 1500, style: 'stab', voice: 'lead', bass: 'oct', drums: 'dance', order: 'IAABAFO',
    jacket: 'cards/hachiware', jc: '#cfe8ff',
    sections: {
      I: ['Am', '. . . . . . . .'],
      A: ['E|Am|E|Am|Dm|C|E|Am',
        'E5 - B4 C5 D5 - C5 B4 | A4 - A4 C5 E5 - D5 C5 | B4 - - C5 D5 - E5 - | C5 - A4 - A4 - . . |' +
        '. D5 - F5 A5 - G5 F5 | E5 - - C5 E5 - D5 C5 | B4 - B4 C5 D5 - E5 - | C5 - A4 - A4 - . .'],
      B: ['Am|E|Am|E|Am|E|Am|E',
        'E5 - - - C5 - - - | D5 - - - B4 - - - | C5 - - - A4 - - - | G#4 - - - B4 - - - |' +
        'E5 - - - C5 - - - | D5 - - - B4 - - - | C5 - E5 - A5 - - - | G#5 - - - - - - -', { drums: 'half' }],
      F: { from: 'A', bpm: 172 },
      O: ['Am', 'A4 - - - . . . .', { bpm: 172 }],
    },
  },
  {
    id: 'canon', genre: 'classic', title: '캐논', composer: '파헬벨', bpm: 84, meter: 4,
    price: 1000, style: 'arp', drums: 'half', order: 'IABCDO',
    sections: {
      I: ['D A Bm F#m|G D G A', '. . . . . . . . | . . . . . . . .'],
      A: ['D A Bm F#m|G D G A|D A Bm F#m|G D G A',
        'F#5 - E5 - D5 - C#5 - | B4 - A4 - B4 - C#5 - | F#5 - E5 - D5 - C#5 - | B4 - A4 - B4 - C#5 -'],
      B: ['D A Bm F#m|G D G A|D A Bm F#m|G D G A',
        'D5 - C#5 - B4 - A4 - | G4 - F#4 - G4 - E4 - | D5 - C#5 - B4 - A4 - | G4 - F#4 - G4 - E4 -'],
      C: ['D A Bm F#m|G D G A|D A Bm F#m|G D G A',
        'D5 F#5 A5 G5 F#5 D5 F#5 E5 | D5 B4 D5 A5 G5 B5 A5 G5 | D5 F#5 A5 G5 F#5 D5 F#5 E5 | D5 B4 D5 A5 G5 B5 A5 G5', { drums: 'dance' }],
      D: ['D A Bm F#m|G D G A|D A Bm F#m|G D G A',
        'F#5 G5 F#5 E5 D5 E5 D5 C#5 | B4 C#5 B4 A4 B4 C#5 D5 C#5 | F#5 G5 F#5 E5 D5 E5 D5 C#5 | B4 C#5 B4 A4 B4 C#5 D5 C#5', { drums: 'dance' }],
      O: ['D', 'D5 - - - - - - -'],
    },
  },
  {
    id: 'elise', genre: 'classic', title: '엘리제를 위하여', composer: '베토벤', bpm: 136, meter: 3,
    price: 1500, style: 'elise', order: 'IM1M2BM3',
    sections: {
      I: ['-', '. . . . E5 D#5'],
      M: ['-|Am|E|Am|-|Am|E',
        'E5 D#5 E5 B4 D5 C5 | A4 - . C4 E4 A4 | B4 - . E4 G#4 B4 | C5 - . E4 E5 D#5 |' +
        'E5 D#5 E5 B4 D5 C5 | A4 - . C4 E4 A4 | B4 - . E4 C5 B4'],
      1: ['Am', 'A4 - . . E5 D#5'],
      2: ['Am', 'A4 - . B4 C5 D5'],
      B: ['C|G|Am|E', 'E5 - - G4 F5 E5 | D5 - - F4 E5 D5 | C5 - - E4 D5 C5 | B4 - . . E5 D#5'],
      3: ['Am', 'A4 - - - - -'],
    },
  },
  {
    id: 'turkish', genre: 'classic', title: '터키 행진곡', composer: '모차르트', bpm: 120, meter: 2, sub: 4,
    price: 2000, style: 'march', drums: 'galop', order: 'IABCO',
    jacket: 'cards/momonga', jc: '#e2e6ff',
    sections: {
      I: ['-', '. . . . B4 A4 G#4 A4'],
      A: ['Am|Am|E|Am|Em|Em|B7|Em|Am|Am|E|Am|E|Am Dm|E Am|Am',
        'C5 - . . D5 C5 B4 C5 | E5 - . . F5 E5 D#5 E5 | B5 A5 G#5 A5 B5 A5 G#5 A5 | C6 - - - A5 - C6 - |' +
        'B5 - A5 - G5 - A5 - | B5 - A5 - G5 - A5 - | B5 - A5 - G5 - F#5 - | E5 - - - B4 A4 G#4 A4 |' +
        'C5 - . . D5 C5 B4 C5 | E5 - . . F5 E5 D#5 E5 | B5 A5 G#5 A5 B5 A5 G#5 A5 | C6 - - - A5 - C6 - |' +
        'B5 - A5 - G#5 - A5 - | E5 - F5 - D5 - C5 - | B4 - - - A4 - - - | . . . . B4 A4 G#4 A4'],
      B: { from: 'A', bpm: 132 },
      C: { from: 'A', bpm: 144 },
      O: ['Am|Am', 'A5 - . . E5 - . . | A4 - - - - - . .', { bpm: 144 }],
    },
  },
  {
    id: 'mozart40', genre: 'classic', title: '교향곡 40번', composer: '모차르트', bpm: 152, meter: 4,
    price: 2000, style: 'pulse', drums: 'rock', order: 'IAPAPAC',
    sections: {
      I: ['Gm', '. . . . . . Eb5 D5'],
      A: ['Gm|Gm|Gm Cm|D7|D7|D7|D7',
        'D5 - Eb5 D5 D5 - Eb5 D5 | D5 - Bb5 - . . Bb5 A5 | G5 - G5 F5 Eb5 - Eb5 D5 | C5 - C5 - . . D5 C5 |' +
        'C5 - D5 C5 C5 - D5 C5 | C5 - A5 - . . A5 G5 | F#5 - F#5 E5 D5 - D5 C5'],
      P: ['Gm', 'Bb4 - Bb4 - . . Eb5 D5'],
      C: ['Gm D7|Gm', 'Bb4 - A4 - G4 - F#4 - | G4 - - - - - - -'],
    },
  },
  {
    id: 'prelude', genre: 'classic', title: '프렐류드 C장조', composer: '바흐', bpm: 132, meter: 8,
    price: 2500, style: 'bass', drums: 'light', order: 'IAO',
    sections: {
      I: ['C', '. . . . . . . . . . . . . . . .'],
      A: ['C|Dm7/C|G7/B|C|Am/C|D7/C|G/B|CM7/B|Am7|D7|G', figure([
        'C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5', 'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5',
        'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5', 'A3 C4 E4 G4 C5', 'D3 A3 D4 F#4 C5', 'G3 B3 D4 G4 B4'])],
      O: ['C', 'C4 E4 G4 C5 E5 G4 C5 E5 C6 - - - - - - -'],
    },
  },
  {
    id: 'cancan', genre: 'classic', title: '캉캉 (천국과 지옥)', composer: '오펜바흐', bpm: 140, meter: 2, sub: 4,
    price: 3000, style: 'march', voice: 'lead', drums: 'galop', order: 'IAABCDO',
    jacket: 'cards/usagi', jc: '#fff1b8',
    sections: {
      I: ['C|G7', '. . . . . . . . | . . . . . . . .'],
      A: ['C|C|G7|C G7|C|C|G7|G7 C',
        'C5 - - - D5 F5 E5 D5 | G5 - G5 - G5 A5 E5 F5 | D5 - D5 - D5 F5 E5 D5 | C5 C6 B5 A5 G5 F5 E5 D5 |' +
        'C5 - - - D5 F5 E5 D5 | G5 - G5 - G5 A5 E5 F5 | D5 - D5 - D5 F5 E5 D5 | C5 G5 D5 E5 C5 - - -'],
      B: { from: 'A', bpm: 150, shift: -12 },
      C: { from: 'A', bpm: 162 },
      D: { from: 'A', bpm: 176, drums: 'rock' },
      O: ['C|C', 'C6 - . . G5 - . . | C5 - - - - - . .', { bpm: 176, drums: 'rock' }],
    },
  },
  {
    id: 'toccata', genre: 'classic', title: '토카타와 푸가 d단조', composer: '바흐', bpm: 112, meter: 8, voice: 'organ',
    price: 3500, style: 'organ', order: 'IAREFO',
    sections: {
      I: ['-', '. . . . . . . . . . . . . . . .'],
      A: ['-|-|-|-|-|-',
        'A5 G5 A5 - - - - - - - - - . . . . | G5 F5 E5 D5 C#5 - - - D5 - - - - - . . |' +
        'A4 G4 A4 - - - - - - - - - . . . . | E4 F4 C#4 D4 - - - - - - - - . . . . |' +
        'A3 G3 A3 - - - - - - - - - . . . . | G3 F3 E3 D3 C#3 - - - D3 - - - - - . .'],
      R: ['C#dim|D', 'C#4 E4 G4 Bb4 C#5 E5 G5 Bb5 C#6 - - - - - . . | D5 F#5 A5 D6 - - - - - - - - . . . .', { bpm: 150 }],
      E: ['Dm|A7|Dm|Gm|C7|F|Bb|A7', sweep(['Dm', 'A7', 'Dm', 'Gm', 'C7', 'F', 'Bb', 'A7'], 5), { bpm: 200, drums: 'rock' }],
      F: ['Dm', 'D6 C#6 D6 A5 F5 D5 A4 F4 D4 - - - - - . .', { bpm: 200, drums: 'rock' }],
      O: ['Dm', 'D4 A4 D5 F5 A5 D6 - - - - - - - - - -', { bpm: 150 }],
    },
  },
  {
    id: 'mountain', genre: 'classic', title: '산왕의 궁전에서', composer: '그리그', bpm: 112, meter: 4,
    price: 5000, style: 'pizz', drums: 'march', order: 'IABCCDDEFO',
    sections: {
      I: ['Bm', '. . . . . . . .'],
      A: ['Bm|C# C|Bm|D',
        'B3 C#4 D4 E4 F#4 D4 F#4 - | F4 C#4 F4 - E4 C4 E4 - | B3 C#4 D4 E4 F#4 D4 F#4 B4 | A4 F#4 D4 F#4 A4 - - -'],
      B: { from: 'A', bpm: 128, shift: 12 },
      C: { from: 'A', bpm: 146 },
      D: { from: 'A', bpm: 164, shift: 12, drums: 'dance' },
      E: { from: 'A', bpm: 180, shift: 12, drums: 'rock' },
      F: { from: 'A', bpm: 194, shift: 12, drums: 'rock' },
      O: ['Bm|Bm', 'B4 F#4 D4 B3 . . . . | B3 - - - - - - -', { bpm: 194, drums: 'rock' }],
    },
  },
  // ---------- 2차 추가: 누구나 아는 동요 · 캐럴 · 민요 · 클래식 (모두 저작권이 끝난 곡을 댄스 · EDM으로 편곡) ----------
  {
    id: 'happybd', genre: 'kids', title: '생일 축하합니다', composer: '힐 자매', bpm: 168, meter: 3,
    price: 0, style: 'waltz', voice: 'bell', drums: 'waltz', order: 'IAKL',
    jacket: 'cards/chiikawa', jc: '#ffe3ef',
    sections: {
      I: ['C', '. . . . . .'],
      A: ['C|C|G7|G7|C|C7|F|C G7|C',
        '. . . . G4 G4 | A4 - G4 - C5 - | B4 - - - G4 G4 | A4 - G4 - D5 - | C5 - - - G4 G4 | G5 - E5 - C5 - | B4 - A4 - F5 F5 | E5 - C5 - D5 - | C5 - - - - -'],
      K: { from: 'A', shift: 2, bpm: 176 },
      L: { from: 'A', shift: 5, bpm: 186 },
    },
  },
  {
    id: 'nabiya', genre: 'kids', title: '나비야', composer: '독일 민요', bpm: 132, meter: 4,
    price: 0, style: 'stab', voice: 'lead', bass: 'oct', drums: 'dance', order: 'IAB',
    jacket: 'cards/usagi', jc: '#fff1b8',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|G7|C|C|C|G7|C|C|G7|G7|C|C|C|G7|C|C',
        'G5 - E5 - E5 - - - | F5 - D5 - D5 - - - | C5 - D5 - E5 - F5 - | G5 - G5 - G5 - - - |' +
        'G5 - E5 - E5 - - - | F5 - D5 - D5 - - - | C5 - E5 - G5 - G5 - | C5 - - - - - - - |' +
        'D5 - D5 - D5 - D5 - | D5 - E5 - F5 - - - | E5 - E5 - E5 - E5 - | E5 - F5 - G5 - - - |' +
        'G5 - E5 - E5 - - - | F5 - D5 - D5 - - - | C5 - E5 - G5 - G5 - | C5 - - - - - - -'],
      B: { from: 'A', bpm: 150, drums: 'rock' },
    },
  },
  {
    id: 'london', genre: 'kids', title: '머리 어깨 무릎 발 (런던 다리)', composer: '영국 민요', bpm: 140, meter: 4,
    price: 0, style: 'stab', voice: 'bell', bass: 'walk', drums: 'dance', order: 'IAABBCC',
    jacket: 'cards/hachiware', jc: '#d6ecff',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|G C|C|G C', 'G5 A5 G5 F5 E5 F5 G5 - | D5 E5 F5 - E5 F5 G5 - | G5 A5 G5 F5 E5 F5 G5 - | D5 - G5 - E5 C5 - -'],
      B: { from: 'A', shift: 2, bpm: 152 },
      C: { from: 'A', shift: 4, bpm: 166, drums: 'rock' },
    },
  },
  {
    id: 'mary', genre: 'kids', title: '떴다 떴다 비행기 (메리의 어린 양)', composer: '미국 민요', bpm: 150, meter: 4,
    price: 0, style: 'stab', voice: 'lead', bass: 'oct', drums: 'dance', order: 'IABC',
    jacket: 'cards/momonga', jc: '#e6e9ff',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|C|G|C|C|C|G|C',
        'E5 - D5 - C5 - D5 - | E5 - E5 - E5 - - - | D5 - D5 - D5 - - - | E5 - G5 - G5 - - - |' +
        'E5 - D5 - C5 - D5 - | E5 - E5 - E5 - E5 - | D5 - D5 - E5 - D5 - | C5 - - - - - - -'],
      B: { from: 'A', shift: 5, bpm: 164 },
      C: { from: 'A', shift: 7, bpm: 176, drums: 'rock' },
    },
  },
  {
    id: 'macdonald', genre: 'kids', title: '맥도날드 할아버지', composer: '미국 민요', bpm: 150, meter: 4,
    price: 0, style: 'march', voice: 'brass', drums: 'rock', order: 'IAB',
    jacket: 'cards/kurimanju', jc: '#ffe6c7',
    sections: {
      I: ['G', '. . . . . . . .'],
      A: ['G|C G|D|G|G|C G|D|G|G|G|G|G|G|C G|D|G',
        'G5 - G5 - G5 - D5 - | E5 - E5 - D5 - - - | B5 - B5 - A5 - A5 - | G5 - - - - - D5 - |' +
        'G5 - G5 - G5 - D5 - | E5 - E5 - D5 - - - | B5 - B5 - A5 - A5 - | G5 - - - - - D5 D5 |' +
        'G5 - G5 - G5 - D5 D5 | G5 - G5 - G5 - - - | G5 G5 G5 - G5 G5 G5 - | G5 G5 G5 G5 G5 G5 G5 - |' +
        'G5 - G5 - G5 - D5 - | E5 - E5 - D5 - - - | B5 - B5 - A5 - A5 - | G5 - - - - - - -'],
      B: { from: 'A', shift: 2, bpm: 168 },
    },
  },
  {
    id: 'hotcross', genre: 'kids', title: '핫 크로스 번', composer: '영국 민요', bpm: 150, meter: 4,
    price: 0, style: 'stab', voice: 'lead', bass: 'oct', drums: 'dance', order: 'IAABBCCDD',
    jacket: 'cards/kani', jc: '#ffe0ec',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|C|C|G C', 'E5 - D5 - C5 - - - | E5 - D5 - C5 - - - | C5 C5 C5 C5 D5 D5 D5 D5 | E5 - D5 - C5 - - -'],
      B: { from: 'A', shift: 5, bpm: 160 },
      C: { from: 'A', shift: 7, bpm: 170, drums: 'rock' },
      D: { from: 'A', shift: 12, bpm: 180, drums: 'rock' },
    },
  },
  {
    id: 'jacques', genre: 'kids', title: '자크 형제 (프레르 자크)', composer: '프랑스 민요', bpm: 150, meter: 4,
    price: 0, style: 'stab', voice: 'lead', bass: 'oct', drums: 'dance', order: 'IABC',
    jacket: 'cards/shisa', jc: '#ffe2c4',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|C|C|C|C|C|G C|G C',
        'C5 - D5 - E5 - C5 - | C5 - D5 - E5 - C5 - | E5 - F5 - G5 - - - | E5 - F5 - G5 - - - |' +
        'G5 A5 G5 F5 E5 - C5 - | G5 A5 G5 F5 E5 - C5 - | C5 - G4 - C5 - - - | C5 - G4 - C5 - - -'],
      B: { from: 'A', shift: 12, bpm: 164 },
      C: { from: 'A', bpm: 178, drums: 'rock' },
    },
  },
  {
    id: 'rowboat', genre: 'kids', title: '노를 저어라 (로 로 로 유어 보트)', composer: '미국 민요', bpm: 150, meter: 3,
    price: 0, style: 'waltz', voice: 'bell', drums: 'six', order: 'IABCD',
    jacket: 'cards/tiha', jc: '#dfeaea',
    sections: {
      I: ['C', '. . . . . .'],
      A: ['C|C|C|C|C|C|G|C', 'C5 - - C5 - - | C5 - D5 E5 - - | E5 - D5 E5 - F5 | G5 - - - - - | C6 C6 C6 G5 G5 G5 | E5 E5 E5 C5 C5 C5 | G5 - F5 E5 - D5 | C5 - - - - -'],
      B: { from: 'A', shift: 2, bpm: 160 },
      C: { from: 'A', shift: 4, bpm: 170 },
      D: { from: 'A', shift: 5, bpm: 182 },
    },
  },
  {
    id: 'merryxmas', genre: 'carol', title: '위 위시 유 어 메리 크리스마스', composer: '영국 캐럴', bpm: 168, meter: 3,
    price: 0, style: 'waltz', voice: 'bell', drums: 'waltz', order: 'IABCD',
    jacket: 'cards/pajama_pink', jc: '#ffdfe4',
    sections: {
      I: ['D', '. . . . . .'],
      A: ['D|G|C|A7|D|Em|C|D|G',
        '. . . . D5 - | G5 - G5 A5 G5 F#5 | E5 - E5 - E5 - | A5 - A5 B5 A5 G5 | F#5 - D5 - D5 - | B5 - B5 C6 B5 A5 | G5 - E5 - D5 D5 | E5 - A5 - F#5 - | G5 - - - - -'],
      B: { from: 'A', shift: 2, bpm: 176 },
      C: { from: 'A', shift: 4, bpm: 186 },
      D: { from: 'A', shift: 5, bpm: 196 },
    },
  },
  {
    id: 'deckhalls', genre: 'carol', title: '덱 더 홀스', composer: '웨일스 캐럴', bpm: 160, meter: 4,
    price: 500, style: 'stab', voice: 'bell', bass: 'walk', drums: 'dance', order: 'IAB',
    jacket: 'cards/ramen_armor', jc: '#fbf1cc',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|C|G|C G C C|C|C|G|C G C C|G|G|D|G|C|C|F|G C C C',
        'G5 - - F5 E5 - D5 - | C5 - D5 - E5 - C5 - | D5 E5 F5 D5 E5 - - D5 | C5 - B4 - C5 - - - |' +
        'G5 - - F5 E5 - D5 - | C5 - D5 - E5 - C5 - | D5 E5 F5 D5 E5 - - D5 | C5 - B4 - C5 - - - |' +
        'D5 - - E5 F5 - D5 - | E5 - - F5 G5 - D5 - | E5 F#5 G5 A5 B5 C6 B5 - | A5 - G5 - - - - - |' +
        'G5 - - F5 E5 - D5 - | C5 - D5 - E5 - C5 - | A5 A5 A5 G5 F5 - E5 - | D5 - C5 - - - - -'],
      B: { from: 'A', shift: 2, bpm: 172, drums: 'rock' },
    },
  },
  {
    id: 'silentnight', genre: 'carol', title: '고요한 밤 (로파이)', composer: '그루버', bpm: 140, meter: 3,
    price: 500, style: 'arp', voice: 'bell', drums: 'six', order: 'IABC',
    jacket: 'cards/pajama_purple', jc: '#ece2ff',
    sections: {
      I: ['C', '. . . . . .'],
      A: ['C|C|G|C|F|C|F|C|G|C|C G|C',
        'G4 A4 G4 E4 - - | G4 A4 G4 E4 - - | D5 - D5 B4 - - | C5 - C5 G4 - - | A4 - A4 C5 B4 A4 | G4 A4 G4 E4 - - |' +
        'A4 - A4 C5 B4 A4 | G4 A4 G4 E4 - - | D5 - D5 F5 D5 B4 | C5 - - E5 - - | C5 G4 E4 G4 F4 D4 | C4 - - - - -'],
      B: { from: 'A', shift: 12, bpm: 150 },
      C: { from: 'A', shift: 5, bpm: 164 },
    },
  },
  {
    id: 'yankee', genre: 'folk', title: '양키 두들', composer: '미국 민요', bpm: 160, meter: 4,
    price: 500, style: 'march', voice: 'brass', drums: 'rock', order: 'IABC',
    jacket: 'cards/rakko', jc: '#f3ead6',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|C G|C F|G C|F|C|F|G C',
        'C5 C5 D5 E5 C5 E5 D5 G4 | C5 C5 D5 E5 C5 - B4 - | C5 C5 D5 E5 F5 E5 D5 C5 | B4 G4 A4 B4 C5 - C5 - |' +
        'A4 B4 A4 G4 A4 B4 C5 - | G4 A4 G4 F4 E4 - G4 - | A4 B4 A4 G4 A4 B4 C5 A4 | G4 C5 B4 D5 C5 - C5 -'],
      B: { from: 'A', shift: 12, bpm: 172 },
      C: { from: 'A', bpm: 184 },
    },
  },
  {
    id: 'susanna', genre: 'folk', title: '오! 수재너', composer: '포스터', bpm: 160, meter: 4,
    price: 800, style: 'march', voice: 'piano', bass: 'walk', drums: 'rock', order: 'AAB',
    jacket: 'cards/pochette_armor', jc: '#f1ecf7',
    sections: {
      A: ['C|C|G|C|G C|F|C G|C|G C',
        '. . . . . . C5 D5 | E5 G5 G5 A5 G5 E5 C5 D5 | E5 E5 D5 C5 D5 - C5 D5 | E5 G5 G5 A5 G5 E5 C5 D5 | E5 E5 D5 D5 C5 - - - |' +
        'F5 - F5 - A5 - A5 - | A5 - G5 G5 E5 C5 D5 - | E5 G5 G5 A5 G5 E5 C5 D5 | E5 E5 D5 D5 C5 - - -'],
      B: { from: 'A', shift: 2, bpm: 176 },
    },
  },
  {
    id: 'clementine', genre: 'folk', title: '클레멘타인', composer: '미국 민요', bpm: 150, meter: 3,
    price: 800, style: 'waltz', voice: 'piano', drums: 'waltz', order: 'IABC',
    jacket: 'cards/pajama_white', jc: '#eef0ff',
    sections: {
      I: ['C', '. . . . . .'],
      A: ['C|C|C|G|G7|G7|C|G7|C',
        '. . . . C5 C5 | C5 - - G4 E5 E5 | E5 - - C5 C5 E5 | G5 - - G5 F5 E5 | D5 - - - D5 E5 | F5 - - F5 E5 D5 | E5 - - C5 C5 E5 | D5 - - G4 B4 D5 | C5 - - - - -'],
      B: { from: 'A', shift: 5, bpm: 162 },
      C: { from: 'A', shift: 7, bpm: 174 },
    },
  },
  {
    id: 'auldlang', genre: 'folk', title: '석별의 정 (올드 랭 사인)', composer: '스코틀랜드 민요', bpm: 132, meter: 4,
    price: 1000, style: 'stab', voice: 'lead', bass: 'oct', drums: 'dance', order: 'ABC',
    jacket: 'cards/labor_armor', jc: '#ece6df',
    sections: {
      A: ['G|C|G|C|F|C|G|Am G|C',
        '. . . . . . G4 - | C5 - - C5 C5 - E5 - | D5 - - C5 D5 - E5 - | C5 - - C5 E5 - G5 - | A5 - - - - - A5 - |' +
        'G5 - - E5 E5 - C5 - | D5 - - C5 D5 - E5 - | C5 - - A4 A4 - G4 - | C5 - - - - - - -'],
      B: { from: 'A', shift: 2, bpm: 144 },
      C: { from: 'A', shift: 5, bpm: 156, drums: 'rock' },
    },
  },
  {
    id: 'amazing', genre: 'folk', title: '어메이징 그레이스', composer: '미국 민요', bpm: 132, meter: 3,
    price: 1000, style: 'organ', voice: 'organ', drums: 'waltz', order: 'IAB',
    jacket: 'cards/pajama_green', jc: '#e1f7e6',
    sections: {
      I: ['G', '. . . . . .'],
      A: ['D|G|G|C|G|G|D|D|G|G|C|C|G|G|D|G',
        '. . . . D5 - | G5 - - - B5 G5 | B5 - - - A5 - | G5 - - - E5 - | D5 - - - D5 - | G5 - - - B5 G5 | B5 - - - A5 - | D6 - - - - - |' +
        'D6 - - - B5 D6 | D6 - - - B5 G5 | D5 - - - E5 G5 | G5 - - - E5 - | D5 - - - D5 - | G5 - - - B5 G5 | B5 - - - A5 - | G5 - - - - -'],
      B: { from: 'A', shift: 2, bpm: 148 },
    },
  },
  {
    id: 'greensleeves', genre: 'folk', title: '그린슬리브스', composer: '영국 민요', bpm: 150, meter: 3,
    price: 1500, style: 'arp', voice: 'bell', drums: 'waltz', order: 'IAB',
    jacket: 'cards/hachiware', jc: '#d9f2e2',
    sections: {
      I: ['Am', '. . . . . .'],
      A: ['Am|Am|C|G|Em|Am|F|E|E|Am|C|G|Em|Am|E|Am|Am',
        '. . . . A4 - | C5 - - - D5 - | E5 - - F5 E5 - | D5 - - - B4 - | G4 - - A4 B4 - | C5 - - - A4 - | A4 - - G#4 A4 - | B4 - - - G#4 - | E4 - - - A4 - |' +
        'C5 - - - D5 - | E5 - - F5 E5 - | D5 - - - B4 - | G4 - - A4 B4 - | C5 - - B4 A4 - | G#4 - - F#4 G#4 - | A4 - - - - - | - - - - - -', { shift: 12 }],
      B: { from: 'A', bpm: 168 },
    },
  },
  {
    id: 'alouette', genre: 'folk', title: '종달새 (알루에트)', composer: '프랑스 민요', bpm: 150, meter: 4,
    price: 1000, style: 'march', voice: 'piano', drums: 'rock', order: 'IAABBCCDD',
    jacket: 'cards/momonga', jc: '#dfe6ff',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|C G|C|G C', 'C5 - D5 E5 E5 - - - | D5 C5 D5 E5 C5 - G4 - | C5 - D5 E5 E5 - - - | D5 C5 D5 E5 C5 - - -'],
      B: { from: 'A', shift: 2, bpm: 160 },
      C: { from: 'A', shift: 4, bpm: 172 },
      D: { from: 'A', shift: 5, bpm: 184 },
    },
  },
  {
    id: 'williamtell', genre: 'classic', title: '윌리엄 텔 서곡', composer: '로시니', bpm: 140, meter: 2, sub: 4,
    price: 2500, style: 'march', voice: 'brass', drums: 'galop', order: 'IAABBCC',
    jacket: 'cards/usagi', jc: '#ffd27a',
    sections: {
      I: ['C|G7', '. . . . . . . . | . . . . . . . .'],
      A: ['C|C|C|C|C|C|G7|C',
        'G4 G4 G4 - G4 G4 G4 - | G4 G4 C5 - D5 - E5 - | G4 G4 G4 - G4 G4 G4 - | G4 G4 E5 - C5 - E5 - |' +
        'G4 G4 G4 - G4 G4 G4 - | G4 G4 C5 - D5 - E5 - | C5 G4 E4 G4 C5 - - - | . . . . . . . .'],
      B: { from: 'A', shift: 12, bpm: 152 },
      C: { from: 'A', bpm: 168, drums: 'rock' },
    },
  },
  {
    id: 'fate', genre: 'classic', title: '운명 교향곡 (리믹스)', composer: '베토벤', bpm: 200, meter: 4,
    price: 3000, style: 'pulse', voice: 'lead', bass: 'oct', drums: 'rock', order: 'ABBCCO',
    jacket: 'cards/rakko', jc: '#3d2f55',
    sections: {
      A: ['Cm|Cm|G7|G7', '. G4 G4 G4 Eb4 - - - | - - - - - - . . | . F4 F4 F4 D4 - - - | - - - - - - - .', { drums: 'none' }],
      B: ['Cm|Fm|Cm|Cm|G7|Fm|G7|Cm',
        '. G4 G4 G4 Eb4 - . . | . Ab4 Ab4 Ab4 G4 - . . | . Eb5 Eb5 Eb5 C5 - - - | - - - - . . . . |' +
        '. G4 G4 G4 D4 - . . | . Ab4 Ab4 Ab4 G4 - . . | . F5 F5 F5 D5 - - - | - - - - . . . .'],
      C: { from: 'B', shift: 12, bpm: 210 },
      O: ['Cm|Cm', '. G5 G5 G5 C6 - - - | C5 - - - - - . .', { bpm: 210 }],
    },
  },
  // ---------- 4차 추가: 누구나 아는 명곡 (저작권이 끝난 곡) ----------
  {
    id: 'nachtmusik', genre: 'classic', title: '아이네 클라이네 나흐트무지크', composer: '모차르트', bpm: 132, meter: 4,
    price: 1500, style: 'alberti', voice: 'piano', drums: 'light', order: 'IABCBO',
    jacket: 'cards/rakko', jc: '#f3e7cf',
    sections: {
      I: ['G', '. . . . . . . .'],
      A: ['G|G|D7|D7|G|D|D7|G',
        'G5 - . D5 G5 - . D5 | G5 D5 G5 B5 D6 - - - | C6 - . A5 C6 - . A5 | C6 A5 F#5 A5 D5 - - - |' +
        'G5 - G5 - B5 A5 G5 - | G5 - F#5 - F#5 - - - | A5 - A5 - C6 F#5 A5 - | G5 - G5 - G5 - - -'],
      B: ['G|C|D7|G', 'D6 C6 B5 A5 G5 A5 B5 G5 | E6 D6 C6 B5 A5 B5 C6 A5 | F#5 G5 A5 B5 C6 B5 A5 F#5 | G5 - B5 - G5 - - -', { drums: 'dance' }],
      C: { from: 'A', bpm: 144, drums: 'dance' },
      O: ['G|G', 'G5 - D5 - B4 - D5 - | G4 - - - - - - -', { bpm: 144 }],
    },
  },
  {
    id: 'danube', genre: 'classic', title: '아름답고 푸른 도나우', composer: '요한 슈트라우스 2세', bpm: 168, meter: 3,
    price: 1000, style: 'waltz', voice: 'bell', drums: 'waltz', order: 'IABO',
    jacket: 'cards/pajama_white', jc: '#dbe9ff',
    sections: {
      I: ['D|D', '. . . . . . | . . . . D4 -'],
      A: ['D|D|D|D|D|D|D|A7|A7|A7|A7|A7|A7|A7|A7|D|D|D|D|D|D|D|D|G|G|G|A7|D',
        'D4 - F#4 - A4 - | - - - - - - | . . A5 - A5 - | . . F#5 - D4 - | D4 - F#4 - A4 - | - - - - - - | . . A5 - A5 - | . . G5 - C#4 - |' +
        'C#4 - E4 - B4 - | - - - - - - | . . B5 - B5 - | . . G5 - C#4 - | C#4 - E4 - B4 - | - - - - - - | . . B5 - B5 - | . . F#5 - D4 - |' +
        'D4 - F#4 - A4 - | - - - - - - | . . D6 - D6 - | . . A5 - D4 - | D4 - F#4 - A4 - | - - - - - - | . . D6 - D6 - | . . B5 - E4 - |' +
        'E4 - G4 - B4 - | - - - - - - | G#4 - A4 - F#5 - | D5 - - - . .'],
      B: { from: 'A', bpm: 184 },
      O: ['D', 'D5 - A4 - D4 -', { bpm: 184 }],
    },
  },
  {
    id: 'bridal', genre: 'classic', title: '결혼 행진곡 (축혼가)', composer: '바그너', bpm: 96, meter: 4,
    price: 800, style: 'march', voice: 'organ', drums: 'march', order: 'IABAO',
    jacket: 'cards/pajama_pink', jc: '#fff0f6',
    sections: {
      I: ['C', '. . . . . . G4 -'],
      A: ['C|G C|F C|G G7|C|G C|F F C G7|C',
        'C5 - - C5 C5 - G4 - | D5 - - B4 C5 - G4 - | C5 - F5 - F5 - E5 D5 | C5 - B4 - C5 - D5 G4 |' +
        'C5 - - C5 C5 - G4 - | D5 - - B4 C5 - G4 - | C5 - F5 - E5 - D5 - | C5 - - - . . G4 -'],
      B: ['F|C|G|C|F|C|G7|C',
        'A4 - - A4 A4 - - - | G4 - - E4 G4 - - - | B4 - - B4 D5 - C5 B4 | C5 - - - . . G4 - |' +
        'A4 - - A4 A4 - C5 - | G4 - E4 - G4 - C5 - | D5 - C5 - B4 - D5 - | C5 - - - . . G4 -'],
      O: ['C', 'C5 - - - - - - -'],
    },
  },
  {
    id: 'morning', genre: 'classic', title: '아침의 기분 (페르 귄트)', composer: '그리그', bpm: 92, meter: 3,
    price: 0, style: 'arp', voice: 'flute', drums: 'six', order: 'IAMBO',
    jacket: 'cards/chiikawa', jc: '#fff2d6',
    sections: {
      I: ['C', '. . . . . .'],
      A: ['C|C|C|C|F|C', 'G5 - E5 D5 - C5 | D5 - E5 G5 - E5 | D5 - C5 D5 - E5 | D5 - E5 G5 - E5 | G5 - A5 E5 - A5 | G5 - E5 D5 - C5'],
      M: { from: 'A', shift: 4 },
      B: ['F|F|C|G|C|C', 'A5 - F5 E5 - D5 | E5 - F5 A5 - F5 | G5 - E5 D5 - C5 | D5 - E5 D5 - B4 | C5 - - - - - | C5 - - - . .'],
      O: ['C', 'C5 - E5 G5 - C6'],
    },
  },
  {
    id: 'moonlight', genre: 'lofi', title: '월광 소나타 (로파이)', composer: '베토벤', bpm: 64, meter: 4, sub: 3,
    price: 1000, style: 'pad2', voice: 'epiano', bass: 'sub808', drums: 'lofi', order: 'IAMO',
    jacket: 'cards/pajama_purple', jc: '#2c2550',
    sections: {
      I: ['C#m', '. . . . . . . . . . . .'],
      A: ['C#m|C#m|A D|G#7 C#m|C#m|C#m E|F#m|G#7',
        'G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 | G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 | A3 C#4 E4 A3 C#4 E4 A3 D4 F#4 A3 D4 F#4 |' +
        'G#3 C4 F#4 G#3 C#4 E4 G#3 C#4 D#4 F#3 C4 D#4 | G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 | G#3 C#4 E4 G#3 C#4 E4 B3 E4 G#4 B3 E4 G#4 |' +
        'A3 C#4 F#4 A3 C#4 F#4 A3 C#4 F#4 A3 C#4 F#4 | G#3 C4 F#4 G#3 C4 F#4 G#3 C4 D#4 G#3 C4 D#4'],
      M: { from: 'A', bpm: 70, shift: 12 },
      O: ['C#m', 'C#4 E4 G#4 C#5 - - - - - - - -', { bpm: 70 }],
    },
  },
  {
    id: 'k545', genre: 'classic', title: '피아노 소나타 16번', composer: '모차르트', bpm: 108, meter: 4, sub: 4,
    price: 1500, style: 'alberti', voice: 'piano', drums: 'light', order: 'IABO',
    jacket: 'cards/momonga', jc: '#e6ecff',
    sections: {
      I: ['C', '. . . . . . . . . . . . . . . .'],
      A: ['C|G7 C|F C|G7 C|F|C|G|G7 C',
        'C5 - - - - - - - E5 - - - G5 - - - | B4 - - - - - C5 D5 C5 - - - - - - - | A5 - - - - - - - G5 - - - C6 - - - | G5 - - - - - F5 G5 E5 - - - - - - - |' +
        'A5 G5 F5 E5 D5 C5 B4 A4 G4 A4 B4 C5 D5 E5 F5 G5 | F5 E5 D5 C5 B4 A4 G4 F4 E4 F4 G4 A4 B4 C5 D5 E5 | D5 E5 F5 G5 A5 B5 C6 D6 C6 B5 A5 G5 F5 E5 D5 C5 | B4 - - - G4 - - - C5 - - - - - - -'],
      B: { from: 'A', bpm: 124, drums: 'dance' },
      O: ['C', 'C5 - - - E5 - - - G5 - - - C6 - - -', { bpm: 124 }],
    },
  },
  {
    id: 'paganini', genre: 'edm', title: '카프리스 24번 (EDM 리믹스)', composer: '파가니니', bpm: 128, meter: 2, sub: 4,
    price: 2500, style: 'offbeat', voice: 'saw', bass: 'pump', drums: 'edm', pump: true, order: 'IABCADO',
    jacket: 'cards/hachiware', jc: '#2a2f5a',
    sections: {
      I: ['Am|Am|E|E', '. . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['Am|E|Am|E|E|E|E|E',
        'A4 - A4 C5 B4 A4 . . | E5 - . . E4 - . . | A4 - A4 C5 B4 A4 . . | E5 - . . E4 - . . |' +
        'E5 - E5 G#5 F#5 E5 . . | B5 - . . B4 - . . | E5 - E5 G#5 F#5 E5 . . | B5 - . . B4 - . .'],
      B: ['Am|Dm|G|C|F|Bdim|E|Am',
        'A4 - A4 C5 B4 A4 . . | D5 - D5 F5 E5 D5 . . | G4 - G4 B4 A4 G4 . . | C5 - C5 E5 D5 C5 . . |' +
        'F4 - F4 A4 G4 F4 . . | B4 - B4 D5 C5 B4 . . | E5 - - - E4 - - - | A4 - - - . . . .'],
      C: ['Am|E|Am|E', 'A5 A5 C6 B5 A5 E5 C5 E5 | E5 E5 G#5 F#5 E5 B4 G#4 B4 | A5 A5 C6 B5 A5 E5 C5 E5 | E5 G#5 B5 E6 - - . .', { drums: 'build' }],
      D: { from: 'B', bpm: 136 },
      O: ['Am', 'A4 - - - - - - -', { bpm: 136 }],
    },
  },
  {
    id: 'bumblebee', genre: 'edm', title: '왕벌의 비행 (드럼 앤 베이스)', composer: '림스키코르사코프', bpm: 140, meter: 2, sub: 4,
    price: 5000, style: 'offbeat', voice: 'saw', bass: 'pump', drums: 'dnb', pump: true, order: 'IABCBO',
    jacket: 'cards/ramen_armor', jc: '#ffe27a',
    sections: {
      I: ['Am|E', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['Am|Am|E|E|Am|Am|E7|E7',
        'E5 D#5 D5 C#5 D5 C#5 C5 B4 | C5 B4 A#4 A4 G#4 G4 F#4 F4 | E4 D#4 D4 C#4 C4 F4 E4 D#4 | E4 D#4 D4 C#4 C4 C#4 D4 D#4 |' +
        'E4 D#4 D4 C#4 D4 C#4 C4 B3 | C4 B3 A#3 A3 G#3 A3 B3 C4 | E4 F4 E4 D#4 E4 F4 F#4 G4 | G#4 A4 G#4 G4 G#4 A4 A#4 B4'],
      B: ['Am|Am|Dm|Dm|Am|E|Am|Am',
        'A5 - E5 - A5 - E5 - | A5 G#5 G5 F#5 F5 E5 D#5 D5 | D5 - A4 - D5 - A4 - | D5 C#5 C5 B4 A#4 A4 G#4 G4 |' +
        'A4 B4 C5 D5 E5 F5 G5 A5 | B5 G#5 E5 B4 G#4 E4 D4 B3 | A3 C4 E4 A4 C5 E5 A5 - | A5 - - - . . . .'],
      C: { from: 'A', bpm: 150 },
      O: ['Am', 'A4 - - - . . . .', { bpm: 150 }],
    },
  },
  {
    id: 'habanera', genre: 'classic', title: '하바네라 (카르멘)', composer: '비제', bpm: 100, meter: 2, sub: 4,
    price: 2000, style: 'habanera', voice: 'lead', drums: 'dembow', order: 'IAABO',
    jacket: 'cards/pajama_pink', jc: '#ffd6dc',
    sections: {
      I: ['Dm|Dm', '. . . . . . . . | . . . . . . . .'],
      A: ['Dm|Dm|Dm|A7|Dm|Dm|Dm|A7 Dm',
        'D5 - - C#5 C5 - C5 - | C5 - - B4 Bb4 - Bb4 - | A4 - - Ab4 G4 - F4 - | G4 - F4 E4 F4 - . . |' +
        'D5 - - C#5 C5 - C5 - | C5 - - B4 Bb4 - Bb4 - | A4 - - Ab4 G4 - F4 - | E4 - F4 G4 D4 - . .'],
      B: ['D|D|A7|D|D|D|A7|D',
        'A4 - - - D5 - - - | F#5 - - - - - E5 D5 | E5 - - - A4 - - - | D5 - - - . . . . |' +
        'A4 - - - D5 - - - | F#5 - - - - - E5 D5 | E5 - - - C#5 - - - | D5 - - - . . . .'],
      O: ['Dm', 'D5 - A4 - D4 - . .'],
    },
  },
  {
    id: 'jesujoy', genre: 'classic', title: '예수, 인간 소망의 기쁨', composer: '바흐', bpm: 76, meter: 3, sub: 3,
    price: 1500, style: 'pad', voice: 'bell', order: 'IABAO',
    jacket: 'cards/pochette_armor', jc: '#f2ecff',
    sections: {
      I: ['G', '. . . . . . . . .'],
      A: ['G|G|D|D|G|G|D|G',
        'G4 A4 B4 D5 C5 C5 E5 D5 D5 | G5 F#5 G5 D5 B4 G4 A4 B4 C5 | D5 E5 D5 C5 B4 A4 B4 G4 F#4 | G4 A4 D4 F#4 A4 C5 B4 A4 B4 |' +
        'G4 A4 B4 D5 C5 C5 E5 D5 D5 | G5 F#5 G5 D5 B4 G4 A4 B4 C5 | D5 E5 D5 C5 B4 A4 G4 D4 F#4 | G4 - - - - - . . .'],
      B: ['C|C|G|G|Am|D|G|G',
        'E5 F#5 G5 E5 D5 C5 B4 C5 A4 | B4 C5 D5 G4 F#4 G4 A4 B4 C5 | D5 E5 D5 B4 C5 D5 G5 F#5 E5 | D5 C5 B4 C5 D5 E5 D5 C5 B4 |' +
        'A4 B4 C5 E5 D5 C5 B4 A4 G4 | F#4 G4 A4 D4 F#4 A4 C5 B4 A4 | B4 G4 D4 B3 D4 G4 B4 D5 G5 | G5 - - - - - . . .'],
      O: ['G', 'G4 B4 D5 G5 - - - - -'],
    },
  },
  {
    id: 'lullaby', genre: 'lofi', title: '브람스 자장가 (로파이)', composer: '브람스', bpm: 76, meter: 3,
    price: 0, style: 'lofi', voice: 'epiano', drums: 'six', order: 'IABAO',
    jacket: 'cards/kurimanju', jc: '#3a3157',
    sections: {
      I: ['C', '. . . . . .'],
      A: ['C|C|C|F C|G|G|G7|C', 'E4 E4 G4 - - - | E4 E4 G4 - - - | E4 G4 C5 - B4 - | A4 - A4 - G4 - | D4 E4 F4 - D4 - | D4 E4 F4 - - - | D4 F4 B4 A4 G4 - | B4 - C5 - - -'],
      B: ['C|F|C|G|C|F|G7|C', 'C4 - C4 - C5 - | A4 - F4 - G4 - | E4 - C4 - E4 - | F4 - D4 - . . | C4 - C4 - C5 - | A4 - F4 - G4 - | E4 - C4 - D4 E4 | C4 - - - - -'],
      O: ['C', 'C4 E4 G4 C5 - -'],
    },
  },
  {
    id: 'hallelujah', genre: 'classic', title: '할렐루야 (메시아)', composer: '헨델', bpm: 104, meter: 4,
    price: 2000, style: 'march', voice: 'brass', drums: 'march', order: 'IABACO',
    jacket: 'cards/labor_armor', jc: '#fff3c4',
    sections: {
      I: ['D', '. . . . . . . .'],
      A: ['D|D|D A|D', 'D5 - A4 B4 A4 - . . | D5 - A4 B4 A4 - . . | D5 A4 B4 A4 D5 A4 B4 A4 | D5 - - - . . . .'],
      B: { from: 'A', shift: 5 },
      C: ['D|G D|A|D', 'A4 - - - A4 - A4 - | B4 - - - A4 - - - | E5 - D5 - C#5 - B4 A4 | D5 - - - - - . .'],
      O: ['D', 'D5 - A4 - D5 - - -'],
    },
  },
  {
    id: 'swan', genre: 'classic', title: '백조의 호수', composer: '차이콥스키', bpm: 92, meter: 4,
    price: 2500, style: 'arp', voice: 'lead', drums: 'half', order: 'IABO',
    jacket: 'cards/pajama_white', jc: '#e6ecff',
    sections: {
      I: ['Bm|Bm', '. . . . . . . . | . . . . . . . .'],
      A: ['Bm|Bm|G|Bm|G|Bm|Em|F#',
        'F#4 - - - B4 C#5 D5 E5 | F#5 - - - - - D5 - | F#5 - - - - - D5 - | F#5 - - - D5 - B4 - |' +
        'D5 - B4 - G4 - D5 - | B4 - - - - - - - | B4 C#5 D5 E5 F#5 - E5 D5 | C#5 - - - F#4 - - -'],
      B: { from: 'A', shift: 12, bpm: 108, drums: 'rock' },
      O: ['Bm', 'B5 - - - - - - -', { bpm: 108 }],
    },
  },
  {
    id: 'surprise', genre: 'classic', title: '놀람 교향곡 (깜짝!)', composer: '하이든', bpm: 112, meter: 4,
    price: 0, style: 'alberti', voice: 'piano', drums: 'light', order: 'IABCBO',
    jacket: 'cards/shisa', jc: '#ffe9cc',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|G7|C|G7 C', 'C5 C5 E5 E5 G5 G5 E5 - | F5 F5 D5 D5 B4 B4 G4 - | C5 C5 E5 E5 G5 G5 C6 - | A5 F5 D5 B4 C5 - . .'],
      B: { from: 'A', drums: 'rock', bpm: 120 },
      C: ['C|F G7|C|G7 C', 'E5 E5 G5 G5 C6 C6 G5 - | A5 A5 F5 F5 D5 D5 B4 - | C6 B5 A5 G5 F5 E5 D5 C5 | B4 D5 G5 B4 C5 - . .', { drums: 'dance' }],
      O: ['C', 'C5 - G4 - C4 - - -', { bpm: 120 }],
    },
  },
  {
    id: 'sailor', genre: 'folk', title: '술 취한 선원 (뱃노래)', composer: '영국 민요', bpm: 150, meter: 4,
    price: 800, style: 'march', voice: 'brass', bass: 'walk', drums: 'rock', order: 'IVCDCO',
    jacket: 'cards/kani', jc: '#cfe9ff',
    sections: {
      I: ['Dm|C', '. . . . . . . . | . . . . . . . .'],
      V: ['Dm|Dm|C|C|Dm|Dm|C|Dm',
        'A4 - A4 A4 A4 - A4 A4 | A4 - D4 - F4 - A4 - | G4 - G4 G4 G4 - G4 G4 | G4 - C4 - E4 - G4 - |' +
        'A4 - A4 A4 A4 - A4 A4 | A4 - B4 - C5 - D5 - | C5 - A4 - G4 - E4 - | D4 - - - D4 - . .'],
      C: ['Dm|Dm|C|C|Dm|Dm|C|Dm',
        'A4 - - - A4 - - - | A4 - D4 - F4 - A4 - | G4 - - - G4 - - - | G4 - C4 - E4 - G4 - |' +
        'A4 - - - A4 - - - | A4 - B4 - C5 - D5 - | C5 - A4 - G4 - E4 - | D4 - - - D4 - . .', { drums: 'dance' }],
      D: { from: 'V', bpm: 168, shift: 2 },
      O: ['Dm', 'D5 - A4 - D4 - - -'],
    },
  },
  {
    id: 'scarborough', genre: 'folk', title: '스카버러 페어', composer: '영국 민요', bpm: 100, meter: 3,
    price: 1000, style: 'arp', voice: 'koto', drums: 'six', order: 'IABO',
    jacket: 'cards/pajama_green', jc: '#e3f7e8',
    sections: {
      I: ['Dm', '. . . . . .'],
      A: ['Dm|Dm|C|Dm|F|C|Dm|Am|Dm|F|Am|C|Am|Dm|C|Dm',
        'D4 - - - D4 - | A4 - - - A4 - | E4 - F4 - E4 - | D4 - - - - - | . . A4 - C5 - | D5 - - - C5 - | A4 - B4 - G4 - | A4 - - - - - |' +
        '. . D5 - D5 - | D5 - - - C5 - | A4 - - - A4 - | G4 - F4 - E4 - | C4 - - - - - | D4 - A4 - G4 - | F4 - E4 - D4 - | D4 - - - - -'],
      B: { from: 'A', bpm: 112, drums: 'waltz' },
      O: ['Dm', 'D4 - A4 - D5 -', { bpm: 112 }],
    },
  },
  {
    id: 'camptown', genre: 'folk', title: '캠프타운 경마', composer: '포스터', bpm: 150, meter: 4,
    price: 500, style: 'march', voice: 'pluck', bass: 'walk', drums: 'rock', order: 'IVWXO',
    jacket: 'cards/shisa', jc: '#ffe6c2',
    sections: {
      I: ['D|A7', '. . . . . . . . | . . . . . . . .'],
      V: ['D|A7 D|D|A7 D|D|G|D|A7 D',
        'A4 A4 F#4 A4 B4 A4 F#4 - | F#4 E4 - - F#4 E4 - - | A4 A4 F#4 A4 B4 A4 F#4 - | E4 F#4 E4 D4 - - . . |' +
        'D4 - D4 F#4 A4 D5 - - | B4 - B4 D5 B4 A4 - - | A4 A4 F#4 A4 B4 A4 F#4 - | E4 F#4 E4 D4 - - . .'],
      W: { from: 'V', bpm: 166, shift: 2 },
      X: { from: 'V', bpm: 182, shift: 5, drums: 'dance' },
      O: ['G', 'G4 - D5 - G5 - - -', { bpm: 182 }],
    },
  },
  {
    id: 'mountain2', genre: 'folk', title: '산 넘어 그녀가 온다네', composer: '미국 민요', bpm: 150, meter: 4,
    price: 0, style: 'stab', voice: 'lead', bass: 'oct', drums: 'dance', order: 'IVWXO',
    jacket: 'cards/usagi', jc: '#fff0b8',
    sections: {
      I: ['C', '. . . . . . G4 A4'],
      V: ['C|C|C|G|C|F|C G|G C',
        'C5 - C5 - C5 - A4 G4 | A4 - C5 - - - C5 D5 | E5 - E5 - E5 - G5 E5 | D5 - - - - - E5 F5 |' +
        'G5 - G5 - G5 - F5 E5 | F5 - F5 - F5 - D5 D5 | C5 - C5 - C5 - B4 A4 | B4 - G4 - C5 - G4 A4'],
      W: { from: 'V', bpm: 164, shift: 2 },
      X: { from: 'V', bpm: 178, shift: 4, drums: 'rock' },
      O: ['C', 'C5 - G4 - C5 - - -', { bpm: 178, shift: 4 }],
    },
  },
  {
    id: 'sakura', genre: 'folk', title: '벚꽃 (사쿠라 사쿠라)', composer: '일본 민요', bpm: 96, meter: 4,
    price: 800, style: 'pad', voice: 'koto', order: 'IABO',
    jacket: 'cards/chiikawa', jc: '#ffd9e8',
    sections: {
      I: ['Am', '. . . . . . . .'],
      A: ['Am Esus4|Am Esus4|Am|Dm|Am|E|Am|Dm|Am|E|Am Esus4|Am Esus4|Dm|E',
        'A4 - A4 - B4 - - - | A4 - A4 - B4 - - - | A4 - B4 - C5 - B4 - | A4 - B4 A4 F4 - - - | E4 - C4 - E4 - F4 - | E4 - E4 C4 B3 - - - | A4 - B4 - C5 - B4 - |' +
        'A4 - B4 A4 F4 - - - | E4 - C4 - E4 - F4 - | E4 - E4 C4 B3 - - - | A4 - A4 - B4 - - - | A4 - A4 - B4 - - - | E4 - F4 - B4 A4 F4 - | E4 - - - - - - -'],
      B: { from: 'A', shift: 12, bpm: 108, drums: 'half' },
      O: ['Am', 'A5 - E5 - A4 - - -', { bpm: 108 }],
    },
  },
  {
    id: 'bonnie', genre: 'folk', title: '내 사랑 보니 (마이 보니)', composer: '스코틀랜드 민요', bpm: 132, meter: 3,
    price: 500, style: 'waltz', voice: 'piano', drums: 'waltz', order: 'IABO',
    jacket: 'cards/pajama_green', jc: '#dff6e6',
    sections: {
      I: ['C', '. . . . G4 -'],
      A: ['C|F C|C|C|C|D7|G|G|C|F C|C|C|F|G7|C|C',
        'E5 - D5 - C5 - | D5 - C5 - A4 - | G4 - E4 - - - | - - - - G4 - | E5 - D5 - C5 - | C5 - B4 - C5 - | D5 - - - - - | - - - - G4 - |' +
        'E5 - D5 - C5 - | D5 - C5 - A4 - | G4 - E4 - - - | - - - - G4 - | A4 - D5 - C5 - | B4 - A4 - B4 - | C5 - - - - - | - - - - . .'],
      B: { from: 'A', bpm: 148, shift: 2 },
      O: ['D', 'D5 - A4 - D4 -', { bpm: 148 }],
    },
  },
  {
    id: 'clairdelune', genre: 'kids', title: '달빛 아래 (오 클레르 드 라 륀)', composer: '프랑스 민요', bpm: 120, meter: 4,
    price: 0, style: 'stab', voice: 'bell', bass: 'oct', drums: 'light', order: 'IABAO',
    jacket: 'cards/momonga', jc: '#e2e6ff',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|G|C G|C|C|G|C G|C',
        'C5 - C5 - C5 - D5 - | E5 - - - D5 - - - | C5 - E5 - D5 - D5 - | C5 - - - - - - - |' +
        'C5 - C5 - C5 - D5 - | E5 - - - D5 - - - | C5 - E5 - D5 - D5 - | C5 - - - - - - -'],
      B: ['G|D|G|G|C|G|C G|C',
        'D5 - D5 - D5 - D5 - | A4 - - - A4 - - - | D5 - C5 - B4 - A4 - | G4 - - - - - - - |' +
        'C5 - C5 - C5 - D5 - | E5 - - - D5 - - - | C5 - E5 - D5 - D5 - | C5 - - - - - - -', { drums: 'dance' }],
      O: ['C', 'C5 - G4 - C4 - - -'],
    },
  },
  {
    id: 'oldman', genre: 'kids', title: '할아버지 낙낙 (디스 올드 맨)', composer: '영국 민요', bpm: 132, meter: 4,
    price: 0, style: 'stab', voice: 'lead', bass: 'oct', drums: 'dance', order: 'IAABBO',
    jacket: 'cards/kurimanju', jc: '#ffe6c7',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|C|F G|C|C|G|C|C',
        'G4 - E4 - G4 - - - | G4 - E4 - G4 - - - | A4 G4 F4 E4 D4 E4 F4 - | E4 F4 G4 C4 C4 C4 C4 - |' +
        'C4 D4 E4 F4 G4 - - - | G4 - D4 - F4 - E4 D4 | C4 - - - E4 - G4 - | C5 - G4 - E4 - C4 -'],
      B: { from: 'A', shift: 5, bpm: 146, drums: 'rock' },
      O: ['F', 'F4 - C5 - F5 - - -', { bpm: 146 }],
    },
  },
  {
    id: 'spider', genre: 'kids', title: '거미가 줄을 타고 (잇시 빗시 스파이더)', composer: '미국 동요', bpm: 120, meter: 3,
    price: 0, style: 'waltz', voice: 'bell', drums: 'six', order: 'IABO',
    jacket: 'cards/tiha', jc: '#dfeaea',
    sections: {
      I: ['C', '. . . . . G4'],
      A: ['C|C|G7|C|C|C|G7|C|C|C|G7|C|C|C|G7|C',
        'C5 - C5 C5 - D5 | E5 - - E5 - - | E5 - D5 C5 - D5 | E5 - - C5 - - | E5 - - E5 - F5 | G5 - - G5 - - | F5 - E5 F5 - G5 | E5 - - - - - |' +
        'C5 - - C5 - D5 | E5 - - E5 - - | D5 - C5 D5 - E5 | C5 - - G4 - - | C5 - C5 C5 - D5 | E5 - - E5 - - | D5 - C5 D5 - E5 | C5 - - - - G4'],
      B: { from: 'A', bpm: 138, shift: 2 },
      O: ['D', 'D5 - A4 - D4 -', { bpm: 138 }],
    },
  },
  {
    id: 'skiplou', genre: 'kids', title: '깡총깡총 스킵 투 마이 루', composer: '미국 동요', bpm: 140, meter: 4,
    price: 300, style: 'stab', voice: 'lead', bass: 'oct', drums: 'dance', order: 'IAABCO',
    jacket: 'cards/usagi', jc: '#fff1b8',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|G7|C|G7 C|C|G7|C|G7 C',
        'E4 E4 C4 C4 E4 E4 G4 - | D4 D4 B3 B3 D4 D4 F4 - | E4 E4 C4 C4 E4 E4 G4 - | D4 - G4 - C4 - - - |' +
        'G4 G4 E4 E4 G4 G4 C5 - | F4 F4 D4 D4 F4 F4 A4 - | G4 G4 E4 E4 G4 A4 G4 - | F4 - D4 - C4 - - -'],
      B: { from: 'A', shift: 5, bpm: 154 },
      C: { from: 'A', shift: 7, bpm: 168, drums: 'rock' },
      O: ['G', 'G4 - D5 - G5 - - -', { bpm: 168 }],
    },
  },
  {
    id: 'joyworld', genre: 'carol', title: '기쁘다 구주 오셨네', composer: '헨델 (편곡)', bpm: 110, meter: 4,
    price: 500, style: 'march', voice: 'bell', drums: 'march', order: 'IABO',
    jacket: 'cards/kurimanju', jc: '#ffe0e0',
    sections: {
      I: ['D', '. . . . . . . .'],
      A: ['D|G D A7 D|D G G A7|A7 D D D|D|G A7|D|D|A7|D G|D A7|D',
        'D5 - - C#5 B4 - - A4 | G4 - - F#4 E4 - D4 - | A4 - B4 - - B4 C#5 - | - C#5 D5 - - - - - | D5 D5 C#5 B4 A4 - - A4 | G4 F#4 D5 - C#5 B4 A4 - |' +
        'A4 G4 F#4 - F#4 F#4 F#4 F#4 | F#4 G4 A4 - - - G4 F#4 | E4 E4 E4 E4 E4 F#4 G4 - | - F#4 E4 D4 D5 - B4 - | A4 - - G4 F#4 - G4 - | F#4 - E4 - D4 - - -'],
      B: { from: 'A', bpm: 126, shift: 2, drums: 'dance' },
      O: ['E', 'E5 - B4 - E4 - - -', { bpm: 126 }],
    },
  },
  {
    id: 'firstnoel', genre: 'carol', title: '첫 번째 노엘', composer: '영국 캐럴', bpm: 132, meter: 3,
    price: 500, style: 'waltz', voice: 'piano', drums: 'waltz', order: 'IAACO',
    jacket: 'cards/pajama_white', jc: '#eef2ff',
    sections: {
      I: ['C', '. . . . E4 D4'],
      A: ['C|C|G|G|C|F C|G|C', 'C4 - - D4 E4 F4 | G4 - - A4 B4 C5 | B4 - A4 - G4 - | - - - A4 B4 C5 | B4 - A4 - G4 - | A4 - B4 - C5 - | G4 - F4 - E4 - | - - - - E4 D4'],
      C: ['C|C|F|C|C|F|C G|C', 'C4 - - D4 E4 F4 | G4 - - C5 B4 A4 | A4 - G4 - - - | - - - C5 B4 A4 | G4 - A4 - B4 - | C5 - G4 - F4 - | E4 - D4 - - - | C4 - - - - -', { drums: 'six' }],
      O: ['C', 'C4 E4 G4 C5 - -'],
    },
  },
  {
    id: 'wenceslas', genre: 'carol', title: '착한 임금 웬체슬라스', composer: '영국 캐럴', bpm: 120, meter: 4,
    price: 500, style: 'stab', voice: 'brass', bass: 'walk', drums: 'march', order: 'IAABCO',
    jacket: 'cards/rakko', jc: '#f3ead6',
    sections: {
      I: ['G', '. . . . . . . .'],
      A: ['G|G D|C D|G', 'G4 - G4 - G4 - A4 - | G4 - G4 - D4 - - - | E4 - D4 - E4 - F#4 - | G4 - - - G4 - - -'],
      B: ['G|G D G G|C D|G', 'D5 - C5 - B4 - A4 - | B4 - A4 - G4 - - - | E4 - D4 - E4 - F#4 - | G4 - - - G4 - - -'],
      C: ['D|G D|G C|G C G G', 'D4 - D4 - E4 - F#4 - | G4 - G4 - A4 - - - | D5 - C5 - B4 - A4 - | G4 - C5 - G4 - - -', { drums: 'rock', bpm: 132 }],
      O: ['G', 'G4 - D5 - G5 - - -', { bpm: 132 }],
    },
  },
  {
    id: 'carolbells', genre: 'carol', title: '캐럴 오브 더 벨', composer: '레온토비치', bpm: 168, meter: 3,
    price: 1500, style: 'waltz', voice: 'bell', drums: 'six', order: 'IABCBO',
    jacket: 'cards/pajama_purple', jc: '#e9dcff',
    sections: {
      I: ['Gm|Gm', '. . . . . . | . . . . . .'],
      A: ['Gm|Gm|Gm|Gm|Eb|Eb|Cm|D',
        'Bb4 - A4 Bb4 G4 - | Bb4 - A4 Bb4 G4 - | Bb4 - A4 Bb4 G4 - | Bb4 - A4 Bb4 G4 - | Bb4 - A4 Bb4 G4 - | Bb4 - A4 Bb4 G4 - | Bb4 - A4 Bb4 G4 - | A4 - G4 A4 F#4 -'],
      B: ['Gm|Gm|Cm|Gm|Eb|Cm|D|D',
        'D5 - D5 C5 Bb4 A4 | Bb4 - Bb4 A4 G4 F#4 | G4 - G4 F4 Eb4 D4 | D4 - D4 C4 Bb3 C4 | D4 - D4 Eb4 F4 G4 | G4 - G4 A4 Bb4 C5 | D5 - C5 Bb4 A4 - | D5 - - - . .', { drums: 'waltz' }],
      C: { from: 'A', shift: 12, drums: 'waltz' },
      O: ['Gm', 'G5 - D5 - G4 -'],
    },
  },
  {
    id: 'harkherald', genre: 'carol', title: '천사 찬송하기를', composer: '멘델스존 (편곡)', bpm: 112, meter: 4,
    price: 500, style: 'march', voice: 'organ', drums: 'march', order: 'IABO',
    jacket: 'cards/chiikawa', jc: '#fff3c4',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|C G7|C|G C|C|C G7|G|D G',
        'G4 - C5 - C5 - - B4 | C5 - E5 - E5 - D5 - | G5 - G5 - G5 - - F5 | E5 - D5 - E5 - - - |' +
        'G4 - C5 - C5 - - B4 | C5 - E5 - E5 - D5 - | G5 - D5 - D5 - - B4 | B4 - A4 - G4 - - -'],
      B: ['C|F C|C|F G|F|C|G7|C',
        'G5 - G5 - G5 - C5 - | F5 - E5 - E5 - D5 - | G5 - G5 - G5 - C5 - | F5 - E5 - E5 - D5 - |' +
        'A5 - A5 - A5 - G5 F5 | E5 - F5 - G5 - - - | C5 - D5 - E5 - D5 - | C5 - - - . . . .', { drums: 'dance' }],
      O: ['C', 'C5 - G4 - C5 - - -'],
    },
  },
  {
    id: 'godrest', genre: 'carol', title: '편히 쉬세요, 즐거운 신사분들', composer: '영국 캐럴', bpm: 132, meter: 4,
    price: 800, style: 'stab', voice: 'lead', bass: 'oct', drums: 'rock', order: 'IAABO',
    jacket: 'cards/tiha', jc: '#e6e0f0',
    sections: {
      I: ['Em', '. . . . . . . .'],
      A: ['Em|Em|Em D|G B7', 'E4 - E4 - B4 - B4 - | A4 - G4 - F#4 - E4 - | D4 - E4 - F#4 - G4 - | A4 - B4 - - - . .'],
      B: ['G|Em|Am B7|Em|G|Em|Am B7|B7 Em',
        'B4 - C5 - A4 - B4 - | C5 - D5 - E5 - B4 - | A4 - G4 - E4 - F#4 - | G4 - A4 - B4 - - - |' +
        'B4 - C5 - B4 - B4 - | A4 - G4 - F#4 - E4 - | G4 - F#4 - E4 - G4 - | F#4 - - - E4 - - -', { drums: 'dance' }],
      O: ['Em', 'E5 - B4 - E4 - - -'],
    },
  },
  {
    id: 'entertainer', genre: 'jazz', title: '디 엔터테이너', composer: '스콧 조플린', bpm: 84, meter: 2, sub: 4,
    price: 2000, style: 'march', voice: 'piano', bass: 'walk', drums: 'light', order: 'IAABAO',
    jacket: 'cards/rakko', jc: '#f0dcae',
    sections: {
      I: ['C|G7', '. . . . . . . . | . . . . . . D4 D#4'],
      A: ['C|C|C G7|C|C|C A7|D7|G7',
        'E4 C5 - E4 C5 - E4 C5 | - - - - - - C5 D5 | D#5 E5 C5 D5 E5 - B4 D5 | - C5 - - . . D4 D#4 |' +
        'E4 C5 - E4 C5 - E4 C5 | - - - - - A4 G4 F#4 | A4 C5 E5 - D5 C5 A4 D5 | - - - - . . D4 D#4'],
      B: ['F|F|C|C|G7|G7|C|C',
        'F4 A4 C5 - A4 C5 - F5 | - - - - . . E5 F5 | G5 E5 C5 - E5 G5 - C6 | - - - - . . B5 C6 |' +
        'D6 B5 G5 - B5 D6 - F6 | - - - - E6 D6 C6 B5 | C6 - G5 - E5 - C5 - | - - - - . . D4 D#4'],
      O: ['C', 'C5 - G4 - C4 - . .'],
    },
  },
  {
    id: 'bellaciao', genre: 'edm', title: '벨라 차오 (EDM 리믹스)', composer: '이탈리아 민요', bpm: 124, meter: 4,
    price: 2000, style: 'offbeat', voice: 'saw', bass: 'pump', drums: 'kpop', pump: true, order: 'IVBDBDO',
    jacket: 'cards/pajama_pink', jc: '#ffcfd8',
    sections: {
      I: ['Am|E', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      V: ['Am|Am|Am|Am|Dm|Dm|Am E|Am',
        'E4 A4 B4 C5 A4 - - - | E4 A4 B4 C5 A4 - - - | E4 A4 B4 C5 - - B4 A4 | C5 - - B4 A4 E5 - - |' +
        'E5 - - D5 E5 F5 F5 - | . F5 E5 D5 F5 E5 - . | E5 D5 C5 B4 - E5 C5 B4 | A4 - - - . . . .'],
      B: ['Am|C|Am|E', 'A4 A4 A4 A4 C5 C5 C5 C5 | E5 E5 E5 E5 G5 G5 G5 G5 | A5 - . . A5 - . . | E5 E5 E5 E5 E5 E5 E5 E5', { drums: 'build' }],
      D: { from: 'V', shift: 12, drums: 'edm' },
      O: ['Am', 'A5 - - - . . . .'],
    },
  },
  // ---------- 먼작귀 오리지널 (이 게임을 위해 새로 지은 곡 · 저작권은 사이트에) : EDM ----------
  {
    id: 'urajump', genre: 'edm', title: '우라! 하이퍼 점프', composer: '먼작귀 사운드', bpm: 128, meter: 4,
    price: 0, style: 'offbeat', voice: 'saw', bass: 'pump', drums: 'edm', pump: true, order: 'IABDBEO',
    jacket: 'cards/usagi', jc: '#ffd84d',
    sections: {
      I: ['Am|G', '. . . . . . . . | . . . . . . E5 G5', { drums: 'build' }],
      A: ['Am|F|C|G|Am|F|C|G',
        'A5 - A5 G5 E5 - D5 E5 | C5 - - - . . E5 G5 | A5 - A5 G5 E5 - G5 A5 | B5 - G5 - . . E5 G5 |' +
        'A5 - A5 G5 E5 - D5 E5 | C5 - - - . . C5 D5 | E5 - D5 C5 B4 - C5 D5 | E5 - - - . . . .', { drums: 'half' }],
      B: ['F|C|G|G', 'A5 A5 A5 A5 G5 G5 G5 G5 | F5 F5 F5 F5 E5 E5 E5 E5 | D5 D5 E5 E5 F5 F5 G5 G5 | A5 - B5 - C6 - D6 -', { drums: 'build' }],
      D: ['Am|F|C|G|Am|F|G|Am',
        'A5 - C6 A5 - G5 E5 - | F5 - A5 F5 - E5 C5 - | G5 - C6 G5 - E5 C5 - | D5 - G5 D5 - B4 G4 - |' +
        'A5 - C6 A5 - G5 E5 - | F5 - A5 F5 - E5 C5 - | G5 - E5 G5 - B5 G5 - | A5 - - - . . . .'],
      E: { from: 'D', shift: 2 },
      O: ['Bm', 'B5 - - - . . . .'],
    },
  },
  {
    id: 'neonkani', genre: 'edm', title: '네온 집게 (카니 하우스)', composer: '먼작귀 사운드', bpm: 126, meter: 4,
    price: 800, style: 'pluck16', voice: 'pluck', bass: 'pump', drums: 'edm', pump: true, order: 'IABDBDO',
    jacket: 'cards/kani', jc: '#3b2a5c',
    sections: {
      I: ['Cm|Ab', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['Cm|Ab|Eb|Bb|Cm|Ab|Bb|Cm',
        'G5 - Eb5 - C5 - Eb5 G5 | Ab5 - G5 - Eb5 - C5 - | G5 - Eb5 - Bb4 - Eb5 G5 | Bb5 - Ab5 - G5 - F5 - |' +
        'G5 - Eb5 - C5 - Eb5 G5 | Ab5 - G5 - Eb5 - C5 - | Bb5 - G5 - F5 - D5 - | C5 - - - . . . .', { drums: 'half' }],
      B: ['Ab|Eb|Bb|Gm G', 'C5 C5 Eb5 Eb5 G5 G5 C6 C6 | Bb5 Bb5 Ab5 Ab5 G5 G5 F5 F5 | Eb5 Eb5 F5 F5 G5 G5 Ab5 Ab5 | Bb5 - - - B5 - - -', { drums: 'build' }],
      D: ['Cm|Ab|Eb|Bb|Cm|Ab|Bb|Cm',
        'C6 - C6 Bb5 G5 - C6 - | Ab5 - Ab5 G5 Eb5 - Ab5 - | G5 - G5 F5 Eb5 - G5 - | F5 - Eb5 D5 Bb4 - D5 - |' +
        'C6 - C6 Bb5 G5 - C6 - | Ab5 - Ab5 G5 Eb5 - C6 - | D6 - C6 Bb5 G5 - F5 - | C5 - - - . . . .'],
      O: ['Cm', 'C5 - - - . . . .'],
    },
  },
  {
    id: 'starfall', genre: 'edm', title: '별똥별 드롭 (퓨처 베이스)', composer: '먼작귀 사운드', bpm: 140, meter: 4,
    price: 1500, style: 'pad2', voice: 'saw', bass: 'sub808', drums: 'trap', pump: true, order: 'IABDBDO',
    jacket: 'cards/momonga', jc: '#2b2f6b',
    sections: {
      I: ['G|A', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['G|A|F#m|Bm|G|A|F#m|Bm',
        'F#5 - E5 - D5 - E5 F#5 | A5 - - - F#5 - E5 - | D5 - B4 - D5 - E5 F#5 | E5 - - - . . . . |' +
        'F#5 - E5 - D5 - E5 F#5 | A5 - - - B5 - A5 - | F#5 - E5 - D5 - C#5 - | B4 - - - . . . .', { drums: 'half' }],
      B: ['G|A|Bm|A', 'D5 D5 E5 E5 F#5 F#5 G5 G5 | A5 A5 B5 B5 C#6 C#6 D6 D6 | B5 - - - A5 - - - | A5 A5 A5 A5 A5 A5 A5 A5', { drums: 'build' }],
      D: ['G|A|F#m|Bm|G|A|F#m Bm|D',
        'A5 B5 A5 F#5 - E5 F#5 - | A5 B5 A5 F#5 - D6 C#6 - | B5 A5 F#5 E5 - D5 E5 - | F#5 - - - . . E5 F#5 |' +
        'A5 B5 A5 F#5 - E5 F#5 - | A5 B5 A5 F#5 - D6 C#6 - | B5 A5 F#5 E5 - D5 C#5 - | D5 - - - . . . .'],
      O: ['D', 'D5 - - - . . . .'],
    },
  },
  {
    id: 'djnight', genre: 'edm', title: '모몽가 DJ 나이트', composer: '먼작귀 사운드', bpm: 132, meter: 4,
    price: 1000, style: 'offbeat', voice: 'saw', bass: 'pump', drums: 'edm', pump: true, order: 'IABDBDO',
    jacket: 'cards/momonga', jc: '#a3b4f0',
    sections: {
      I: ['Em|C', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['Em|C|G|D|Em|C|G D|Em',
        'E5 - G5 - B5 - G5 - | A5 - G5 - E5 - D5 - | E5 - G5 - B5 - D6 - | C6 - B5 - A5 - . . |' +
        'E5 - G5 - B5 - G5 - | A5 - G5 - E5 - D5 - | E5 - D5 - B4 - D5 - | E5 - - - . . . .', { drums: 'half' }],
      B: ['C|D|Em|B', 'B4 B4 B4 B4 C5 C5 C5 C5 | D5 D5 D5 D5 E5 E5 E5 E5 | F#5 F#5 G5 G5 A5 A5 B5 B5 | B5 - . . B5 - . .', { drums: 'build' }],
      D: ['Em|C|G|D|Em|C|G D|Em',
        'E6 - E6 D6 B5 - G5 - | C6 - C6 B5 G5 - E5 - | D6 - D6 B5 G5 - D6 - | F#5 - G5 A5 B5 - . . |' +
        'E6 - E6 D6 B5 - G5 - | C6 - C6 B5 G5 - E5 - | D6 - B5 G5 A5 - F#5 - | E5 - - - . . . .'],
      O: ['Em', 'E5 - - - . . . .'],
    },
  },
  {
    id: 'rainbowrave', genre: 'edm', title: '무지개 레이브', composer: '먼작귀 사운드', bpm: 136, meter: 4,
    price: 1200, style: 'offbeat', voice: 'saw', bass: 'pump', drums: 'edm', pump: true, order: 'IABDBDO',
    jacket: 'cards/pajama_green', jc: '#c4f0d0',
    sections: {
      I: ['G|D', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['G|D|Em|C|G|D|Em C|G',
        'B4 - D5 - G5 - D5 - | A4 - D5 - F#5 - D5 - | B4 - E5 - G5 - E5 - | C5 - E5 - G5 - A5 - |' +
        'B5 - A5 - G5 - D5 - | A5 - G5 - F#5 - D5 - | E5 - G5 - B5 - A5 - | G5 - - - . . . .', { drums: 'half' }],
      B: ['C|D|Em|D', 'G5 G5 A5 A5 B5 B5 C6 C6 | D6 D6 C6 C6 B5 B5 A5 A5 | G5 - A5 - B5 - C6 - | D6 - - - D6 - - -', { drums: 'build' }],
      D: ['G|D|Em|C|G|D|C D|G',
        'G5 B5 D6 B5 G5 - D5 - | F#5 A5 D6 A5 F#5 - D5 - | E5 G5 B5 G5 E5 - B4 - | C5 E5 G5 E5 C5 - D5 - |' +
        'G5 B5 D6 B5 G5 - D5 - | F#5 A5 D6 A5 F#5 - A5 - | B5 - A5 - G5 - F#5 - | G5 - - - . . . .'],
      O: ['G', 'G5 - - - . . . .'],
    },
  },
  {
    id: 'tropical', genre: 'edm', title: '트로피컬 바캉스', composer: '먼작귀 사운드', bpm: 112, meter: 4,
    price: 0, style: 'offbeat', voice: 'pluck', bass: 'pump', drums: 'edm', pump: true, order: 'IABDBDO',
    jacket: 'cards/usagi', jc: '#7fd6ff',
    sections: {
      I: ['F|C', '. . . . . . . . | . . . . . . . .', { drums: 'light' }],
      A: ['F|C|Dm|Bb|F|C|Bb C|F',
        'A5 - G5 - F5 - G5 - | A5 - - - C6 - - - | A5 - G5 - F5 - D5 - | F5 - - - . . . . |' +
        'A5 - G5 - F5 - G5 - | A5 - - - C6 - D6 - | C6 - A5 - G5 - F5 - | F5 - - - . . . .', { drums: 'half' }],
      B: ['Bb|C|Bb|C', 'C5 - D5 - E5 - F5 - | G5 - A5 - Bb5 - C6 - | D6 - C6 - Bb5 - A5 - | G5 - - - C6 - - -', { drums: 'build' }],
      D: ['F|C|Dm|Bb|F|C|Bb C|F',
        'F5 F5 A5 - C6 - A5 - | G5 G5 C6 - E6 - C6 - | F5 F5 A5 - D6 - A5 - | Bb5 - A5 - G5 - F5 - |' +
        'F5 F5 A5 - C6 - A5 - | G5 G5 C6 - E6 - C6 - | D6 - C6 - Bb5 - G5 - | F5 - - - . . . .'],
      O: ['F', 'F5 - - - . . . .'],
    },
  },
  {
    id: 'hyperspeed', genre: 'edm', title: '하이퍼 스피드 (하드스타일)', composer: '먼작귀 사운드', bpm: 150, meter: 4,
    price: 3000, style: 'offbeat', voice: 'saw', bass: 'pump', drums: 'edm', pump: true, order: 'IABDBDO',
    jacket: 'cards/hachiware', jc: '#1f2433',
    sections: {
      I: ['F#m|D', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['F#m|D|A|E|F#m|D|E|F#m',
        'F#5 - A5 - C#6 - A5 - | F#5 - A5 - D6 - A5 - | E5 - A5 - C#6 - A5 - | E5 - G#5 - B5 - G#5 - |' +
        'F#5 - A5 - C#6 - A5 - | F#5 - A5 - D6 - F#6 - | E6 - D6 - C#6 - B5 - | C#6 - - - . . . .', { drums: 'rock' }],
      B: ['D|E|E|E', 'C#5 C#5 C#5 C#5 D5 D5 D5 D5 | E5 E5 E5 E5 F#5 F#5 F#5 F#5 | G#5 G#5 A5 A5 B5 B5 C#6 C#6 | C#6 - - - C#6 - - -', { drums: 'build' }],
      D: ['F#m|D|A|E|F#m|D|E|F#m',
        'C#6 - C#6 - B5 - A5 - | D6 - D6 - C#6 - A5 - | C#6 - C#6 - B5 - A5 - | B5 - B5 - A5 - G#5 - |' +
        'C#6 - C#6 - B5 - A5 - | D6 - D6 - F#6 - E6 - | D6 - C#6 - B5 - G#5 - | F#5 - - - . . . .'],
      O: ['F#m', 'F#5 - - - . . . .'],
    },
  },
  {
    id: 'partytime', genre: 'edm', title: '치이카와 파티 타임', composer: '먼작귀 사운드', bpm: 120, meter: 4,
    price: 0, style: 'offbeat', voice: 'lead', bass: 'pump', drums: 'kpop', pump: true, order: 'IABDBDO',
    jacket: 'cards/chiikawa', jc: '#ffd0e3',
    sections: {
      I: ['Bb|F', '. . . . . . . . | . . . . . . . .', { drums: 'light' }],
      A: ['Bb|F|Gm|Eb|Bb|F|Eb F|Bb',
        'D5 - F5 - Bb5 - F5 - | C5 - F5 - A5 - F5 - | D5 - G5 - Bb5 - G5 - | Eb5 - G5 - Bb5 - C6 - |' +
        'D6 - C6 - Bb5 - F5 - | C6 - Bb5 - A5 - F5 - | G5 - Bb5 - D6 - C6 - | Bb5 - - - . . . .', { drums: 'half' }],
      B: ['Eb|F|Gm|F', 'F5 - G5 - A5 - Bb5 - | C6 - D6 - Eb6 - F6 - | D6 - - - C6 - - - | C6 C6 C6 C6 C6 C6 C6 C6', { drums: 'build' }],
      D: ['Bb|F|Gm|Eb|Bb|F|Eb F|Bb',
        'Bb5 - Bb5 C6 D6 - Bb5 - | A5 - A5 Bb5 C6 - A5 - | G5 - G5 A5 Bb5 - D6 - | Eb6 - D6 - C6 - Bb5 - |' +
        'Bb5 - Bb5 C6 D6 - Bb5 - | A5 - A5 Bb5 C6 - F6 - | Eb6 - D6 - C6 - A5 - | Bb5 - - - . . . .'],
      O: ['Bb', 'Bb5 - - - . . . .'],
    },
  },
  {
    id: 'galaxytrance', genre: 'edm', title: '은하수 트랜스', composer: '먼작귀 사운드', bpm: 138, meter: 4,
    price: 2000, style: 'pluck16', voice: 'saw', bass: 'pump', drums: 'edm', pump: true, order: 'IABDADO',
    jacket: 'cards/chiikawa', jc: '#3a2a8f',
    sections: {
      I: ['Am|F', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['Am|F|G|Em|Am|F|G|E',
        'A4 C5 E5 A5 E5 C5 A4 C5 | F4 A4 C5 F5 C5 A4 F4 A4 | G4 B4 D5 G5 D5 B4 G4 B4 | E4 G4 B4 E5 B4 G4 E4 G4 |' +
        'A4 C5 E5 A5 E5 C5 A4 C5 | F4 A4 C5 F5 C5 A4 F4 A4 | G4 B4 D5 G5 D5 B4 G4 B4 | E5 G#5 B5 E6 B5 G#5 E5 G#5', { drums: 'half' }],
      B: ['F|G|G|E', 'A5 - . . A5 - . . | C6 - . . C6 - . . | D6 - . . D6 - . . | E6 E6 E6 E6 E6 E6 E6 E6', { drums: 'build' }],
      D: ['Am|F|G|Em|Am|F|G|Am',
        'E6 - - - D6 - C6 - | C6 - - - B5 - A5 - | B5 - - - C6 - D6 - | B5 - - - G5 - - - |' +
        'E6 - - - D6 - C6 - | C6 - - - D6 - E6 - | F6 - E6 - D6 - B5 - | A5 - - - . . . .'],
      O: ['Am', 'A5 - - - . . . .'],
    },
  },
  {
    id: 'bubblebass', genre: 'edm', title: '버블 베이스 (덥스텝)', composer: '먼작귀 사운드', bpm: 140, meter: 4,
    price: 2500, style: 'pad2', voice: 'saw', bass: 'sub808', drums: 'trap', order: 'IABDBDO',
    jacket: 'cards/tiha', jc: '#2e3a4a',
    sections: {
      I: ['Em|C', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['Em|D|Em|C|Em|D|C|Em',
        'E5 - - - G5 - - - | F#5 - - - D5 - - - | E5 - - - G5 - B5 - | A5 - - - . . . . |' +
        'E5 - - - G5 - - - | F#5 - - - D5 - - - | C5 - - - D5 - - - | E5 - - - . . . .', { drums: 'half' }],
      B: ['CM7|C|Bm B|B', 'B4 - - - B4 - - - | C5 - - - C5 - - - | D5 - D5 - D#5 - D#5 - | E5 E5 E5 E5 E5 E5 E5 E5', { drums: 'build' }],
      D: ['Em|D|Em|C|Em|D|C|Em',
        'E4 E4 . E4 G4 . E4 . | F#4 F#4 . F#4 A4 . D4 . | E4 E4 . E4 G4 . B4 . | A4 - G4 - F#4 - D4 - |' +
        'E4 E4 . E4 G4 . E4 . | F#4 F#4 . F#4 A4 . D4 . | C5 - B4 - A4 - B4 - | E4 - - - . . . .'],
      O: ['Em', 'E4 - - - . . . .'],
    },
  },
  // ---------- 먼작귀 오리지널: K-POP 스타일 ----------
  {
    id: 'heartsignal', genre: 'kpop', title: '하트 시그널', composer: '먼작귀 사운드', bpm: 118, meter: 4,
    price: 0, style: 'stab', voice: 'lead', bass: 'disco', drums: 'kpop', order: 'IABCDABCO',
    jacket: 'cards/pajama_pink', jc: '#ffd0dc',
    sections: {
      I: ['F|G', '. . . . . . . . | . . . . . . . .'],
      A: ['Am|F|G|C', 'E5 - E5 D5 C5 - D5 E5 | . . G5 E5 D5 - C5 - | A4 - A4 C5 D5 - E5 D5 | C5 - - - . . . .', { drums: 'half' }],
      B: ['F|Em|Dm|G', 'F5 - E5 - D5 - C5 - | E5 - D5 - C5 - A4 - | D5 - D5 - E5 - F5 - | G5 - - - G5 - - -', { drums: 'build' }],
      C: ['F|G|Em|Am|F|G|Dm G|C',
        'C6 - B5 - G5 - E5 G5 | A5 - G5 - E5 - D5 - | C6 - B5 - G5 - E5 G5 | A5 - - - . . G5 A5 |' +
        'C6 - B5 - G5 - E5 G5 | A5 - G5 - E5 - D5 E5 | F5 - E5 - D5 - B4 - | C5 - - - . . . .'],
      D: ['F|G|Em|Am', 'C6 C6 . C6 B5 . G5 . | A5 A5 . A5 G5 . E5 . | C6 C6 . C6 B5 . G5 . | E6 - D6 - C6 - . .'],
      O: ['C', 'C6 - G5 - C5 - . .'],
    },
  },
  {
    id: 'lovepotion', genre: 'kpop', title: '러브 포션', composer: '먼작귀 사운드', bpm: 122, meter: 4,
    price: 800, style: 'offbeat', voice: 'lead', bass: 'pump', drums: 'kpop', pump: true, order: 'IABCDBCO',
    jacket: 'cards/pajama_purple', jc: '#e3d2ff',
    sections: {
      I: ['Dm|Bb', '. . . . . . . . | . . . . . . . .', { drums: 'light' }],
      A: ['Dm|Am|C|Am', 'D5 - F5 - A5 - G5 F5 | E5 - - - C5 - D5 E5 | F5 - E5 - D5 - C5 - | A4 - - - . . . .', { drums: 'half' }],
      B: ['Bb|C|Bb|A', 'Bb4 - C5 - D5 - E5 - | F5 - G5 - A5 - - - | Bb5 - A5 - G5 - F5 - | E5 - - - E5 - - -', { drums: 'build' }],
      C: ['Dm|Bb|C|Am|Dm|Bb|C A|Dm',
        'A5 - A5 G5 F5 - D5 - | F5 - F5 E5 D5 - C5 - | D5 - D5 E5 F5 - G5 - | A5 - - - . . A5 C6 |' +
        'D6 - C6 A5 G5 - F5 - | E5 - F5 G5 A5 - - - | Bb5 - A5 G5 F5 - E5 - | D5 - - - . . . .'],
      D: ['Dm|Bb|C|Dm', 'D6 . D6 . C6 . A5 . | Bb5 . Bb5 . A5 . F5 . | G5 . G5 . A5 . C6 . | D6 - - - . . . .'],
      O: ['Dm', 'D5 - - - . . . .'],
    },
  },
  {
    id: 'summerday', genre: 'kpop', title: '썸머 데이', composer: '먼작귀 사운드', bpm: 128, meter: 4,
    price: 0, style: 'pluck16', voice: 'pluck', bass: 'oct', drums: 'kpop', order: 'IABCDACO',
    jacket: 'cards/usagi', jc: '#9fe3ff',
    sections: {
      I: ['E|B', '. . . . . . . . | . . . . . . . .'],
      A: ['E|B|C#m|A', 'B4 - E5 - G#5 - F#5 E5 | D#5 - - - B4 - - - | C#5 - E5 - G#5 - A5 G#5 | F#5 - - - . . . .', { drums: 'half' }],
      B: ['A|C#m|B|B', 'A5 - G#5 - F#5 - E5 - | G#5 - F#5 - E5 - C#5 - | D#5 - E5 - F#5 - G#5 - | B5 - - - B5 - - -', { drums: 'build' }],
      C: ['E|B|C#m|AM7|E|B|A B|E',
        'B5 - G#5 - E5 - G#5 - | B5 - C#6 - B5 - F#5 - | A5 - G#5 - E5 - C#5 - | E5 - F#5 - G#5 - - - |' +
        'B5 - G#5 - E5 - G#5 - | B5 - C#6 - E6 - D#6 - | C#6 - B5 - A5 - F#5 - | E5 - - - . . . .'],
      D: ['E|C#m|B|E', 'E6 - D#6 - B5 - G#5 - | C#6 - B5 - G#5 - E5 - | A5 - G#5 - F#5 - D#5 - | E5 - - - . . . .'],
      O: ['E', 'E5 - B4 - E5 - . .'],
    },
  },
  {
    id: 'nightdrive', genre: 'kpop', title: '나이트 드라이브 (신스웨이브)', composer: '먼작귀 사운드', bpm: 108, meter: 4,
    price: 1200, style: 'pad2', voice: 'saw', bass: 'disco', drums: 'disco', order: 'IABCDBCO',
    jacket: 'cards/hachiware', jc: '#2a1f4f',
    sections: {
      I: ['F#m|D', '. . . . . . . . | . . . . . . . .'],
      A: ['F#m|D|A|E', 'F#5 - - - E5 - C#5 - | D5 - - - A4 - - - | C#5 - - - E5 - A5 - | G#5 - - - . . . .', { drums: 'half' }],
      B: ['D|A|D|Esus4 E', 'A5 - B5 - C#6 - D6 - | C#6 - B5 - A5 - F#5 - | D5 - E5 - F#5 - G#5 - | A5 - - - G#5 - - -', { drums: 'build' }],
      C: ['F#m|D|A|E|F#m|D|E|F#m',
        'C#6 - A5 - F#5 - A5 - | B5 - A5 - F#5 - D5 - | E5 - A5 - C#6 - E6 - | D6 - C#6 - B5 - - - |' +
        'C#6 - A5 - F#5 - A5 - | B5 - A5 - F#5 - D5 - | E5 - G#5 - B5 - G#5 - | F#5 - - - . . . .'],
      D: ['F#m|D|A|E', 'F#5 F#5 . A5 . C#6 . . | D6 D6 . C#6 . A5 . . | C#6 C#6 . B5 . A5 . . | G#5 - - - . . . .'],
      O: ['F#m', 'F#5 - - - . . . .'],
    },
  },
  {
    id: 'popcorn', genre: 'kpop', title: '팝콘 팡팡', composer: '먼작귀 사운드', bpm: 124, meter: 4,
    price: 500, style: 'stab', voice: 'bell', bass: 'disco', drums: 'kpop', order: 'IABCDBCO',
    jacket: 'cards/shisa', jc: '#ffe9a8',
    sections: {
      I: ['G|D', '. . . . . . . . | . . . . . . . .'],
      A: ['G|Em|C|D', 'D5 D5 B4 - D5 - G5 - | E5 E5 C5 - E5 - G5 - | A5 - G5 - E5 - D5 - | B4 - - - . . . .', { drums: 'half' }],
      B: ['C|Am|C|Dsus4 D', 'C5 - D5 - E5 - G5 - | A5 - G5 - E5 - D5 - | C5 - D5 - E5 - F#5 - | G5 - - - A5 - - -', { drums: 'build' }],
      C: ['G|D|Em|C|G|D|C D|G',
        'G5 G5 . G5 A5 . B5 . | D6 - B5 - A5 - G5 - | E5 E5 . E5 F#5 . G5 . | A5 - - - . . . . |' +
        'G5 G5 . G5 A5 . B5 . | D6 - E6 - D6 - B5 - | C6 - B5 - A5 - F#5 - | G5 - - - . . . .'],
      D: ['G|D|Em|D', 'B5 - D6 - B5 - G5 - | A5 - C6 - A5 - F#5 - | G5 - B5 - G5 - E5 - | D5 - - - . . . .'],
      O: ['G', 'G5 - D5 - G5 - . .'],
    },
  },
  {
    id: 'crown', genre: 'kpop', title: '왕관 (걸크러시)', composer: '먼작귀 사운드', bpm: 100, meter: 4,
    price: 1500, style: 'offbeat', voice: 'lead', bass: 'sub808', drums: 'trap', order: 'IABCDCO',
    jacket: 'cards/pajama_purple', jc: '#2a1838',
    sections: {
      I: ['Cm|Ab', '. . . . . . . . | . . . . . . . .'],
      A: ['Cm|Ab Eb|Bb|G', 'C5 - C5 - Eb5 - C5 - | Bb4 - Ab4 - G4 - - - | C5 - C5 - Eb5 - G5 - | F5 - Eb5 - D5 - - -', { drums: 'half' }],
      B: ['Ab|Bb|Ab|G', 'Ab4 - Bb4 - C5 - D5 - | Eb5 - F5 - G5 - - - | Ab5 - G5 - F5 - Eb5 - | D5 - - - G5 - - -', { drums: 'build' }],
      C: ['Cm|Ab|Bb|Eb|Cm|Ab|Bb G|Cm',
        'G5 - G5 - G5 Ab5 G5 - | F5 - Eb5 - C5 - - - | G5 - G5 - G5 Bb5 Ab5 - | G5 - F5 - Eb5 - - - |' +
        'C6 - Bb5 - G5 - Eb5 - | F5 - G5 - Ab5 - G5 - | F5 - Eb5 - D5 - B4 - | C5 - - - . . . .'],
      D: ['Cm|Ab|Bb|Cm', 'C6 . . C6 . . Bb5 . | Ab5 . . G5 . . F5 . | Eb5 . . F5 . . G5 . | C5 - - - . . . .'],
      O: ['Cm', 'C5 - - - . . . .'],
    },
  },
  {
    id: 'wishstar', genre: 'kpop', title: '별에게 빌어', composer: '먼작귀 사운드', bpm: 116, meter: 4,
    price: 800, style: 'pluck16', voice: 'pluck', bass: 'oct', drums: 'kpop', order: 'IABCDBCO',
    jacket: 'cards/momonga', jc: '#c9d6ff',
    sections: {
      I: ['A|E', '. . . . . . . . | . . . . . . . .'],
      A: ['A|E|F#m|D', 'C#5 - E5 - A5 - G#5 - | B4 - E5 - G#5 - F#5 - | A4 - C#5 - F#5 - E5 - | D5 - - - . . . .', { drums: 'half' }],
      B: ['D|E|F#m|E', 'D5 - E5 - F#5 - A5 - | E5 - F#5 - G#5 - B5 - | C#6 - B5 - A5 - G#5 - | E5 - - - E5 - - -', { drums: 'build' }],
      C: ['A|E|F#m|D|A|E|D E|A',
        'A5 - C#6 - E6 - C#6 - | B5 - G#5 - E5 - G#5 - | A5 - F#5 - C#5 - F#5 - | D6 - C#6 - B5 - - - |' +
        'A5 - C#6 - E6 - C#6 - | B5 - G#5 - E5 - G#5 - | F#5 - A5 - D6 - C#6 - | A5 - - - . . . .'],
      D: ['A|E|F#m|D', 'E6 E6 C#6 C#6 A5 A5 C#6 - | B5 B5 G#5 G#5 E5 E5 G#5 - | F#5 F#5 A5 A5 C#6 C#6 E6 - | D6 - - - . . . .'],
      O: ['A', 'A5 - - - . . . .'],
    },
  },
  {
    id: 'loveletter', genre: 'kpop', title: '러브 레터', composer: '먼작귀 사운드', bpm: 120, meter: 4,
    price: 500, style: 'stab', voice: 'lead', bass: 'disco', drums: 'kpop', order: 'IABCDBCO',
    jacket: 'cards/chiikawa', jc: '#ffe0ec',
    sections: {
      I: ['Eb|Bb', '. . . . . . . . | . . . . . . . .'],
      A: ['Eb|Bb|Cm|Ab Eb', 'G5 - G5 Ab5 Bb5 - G5 - | F5 - - - D5 - - - | Eb5 - Eb5 F5 G5 - C6 - | Bb5 - Ab5 - G5 - - -', { drums: 'half' }],
      B: ['Ab|Eb|Bb|Bb', 'Ab5 - G5 - F5 - Eb5 - | G5 - F5 - Eb5 - D5 - | F5 - Eb5 - D5 - C5 - | D5 - - - Bb4 - - -', { drums: 'build' }],
      C: ['Eb|Bb|Cm|Ab|Eb|Bb|Ab Bb|Eb',
        'Eb6 - D6 - Bb5 - G5 - | F5 - G5 - Bb5 - - - | C6 - Bb5 - G5 - Eb5 - | Ab5 - G5 - F5 - - - |' +
        'Eb6 - D6 - Bb5 - G5 - | F5 - G5 - Bb5 - C6 - | D6 - C6 - Bb5 - Ab5 - | G5 - - - . . . .'],
      D: ['Eb|Bb|Cm|Bb', 'Bb5 . G5 . Bb5 . Eb6 . | D6 . Bb5 . F5 . Bb5 . | C6 . G5 . C6 . Eb6 . | D6 - - - . . . .'],
      O: ['Eb', 'Eb5 - - - . . . .'],
    },
  },
  {
    id: 'shadowdance', genre: 'kpop', title: '섀도 댄스', composer: '먼작귀 사운드', bpm: 128, meter: 4,
    price: 1500, style: 'offbeat', voice: 'saw', bass: 'pump', drums: 'kpop', pump: true, order: 'IABCDBCO',
    jacket: 'cards/hachiware', jc: '#30264a',
    sections: {
      I: ['Gm|Eb', '. . . . . . . . | . . . . . . . .', { drums: 'build' }],
      A: ['Gm|F|Eb|D', 'G4 - Bb4 - D5 - C5 Bb4 | A4 - - - F4 - - - | G4 - Bb4 - D5 - F5 - | F#5 - - - . . . .', { drums: 'half' }],
      B: ['Eb|Bb|F|D', 'Eb5 - D5 - C5 - Bb4 - | D5 - C5 - Bb4 - A4 - | C5 - D5 - Eb5 - F5 - | F#5 - - - F#5 - - -', { drums: 'build' }],
      C: ['Gm|F|Eb|D|Gm|F|Eb D|Gm',
        'G5 - G5 - Bb5 - A5 G5 | F5 - - - D5 - - - | Eb5 - Eb5 - G5 - F5 Eb5 | D5 - - - . . . . |' +
        'G5 - G5 - Bb5 - A5 G5 | F5 - - - D6 - C6 - | Bb5 - A5 - G5 - F#5 - | G5 - - - . . . .'],
      D: ['Gm|F|Eb|D', 'D6 . D6 . C6 . Bb5 . | C6 . C6 . Bb5 . A5 . | Bb5 . Bb5 . A5 . G5 . | F#5 - - - . . . .'],
      O: ['Gm', 'G5 - - - . . . .'],
    },
  },
  {
    id: 'sunshine', genre: 'kpop', title: '햇살 가득', composer: '먼작귀 사운드', bpm: 104, meter: 4,
    price: 0, style: 'arp', voice: 'bell', bass: 'oct', drums: 'light', order: 'IABCBDO',
    jacket: 'cards/chiikawa', jc: '#fff3c4',
    sections: {
      I: ['C|G', '. . . . . . . . | . . . . . . . .'],
      A: ['C|G|Am|F', 'E5 - - D5 C5 - - - | D5 - - C5 B4 - - - | C5 - - B4 A4 - C5 - | A4 - - - . . . .'],
      B: ['F|C|Dm|G', 'F5 - E5 - D5 - C5 - | E5 - D5 - C5 - - - | D5 - C5 - B4 - A4 - | G4 - - - G4 - - -', { drums: 'build' }],
      C: ['C|G|Am|F|C|G|F G|C',
        'G5 - E5 - C6 - B5 - | B5 - G5 - D5 - - - | C6 - A5 - E5 - G5 - | F5 - - - . . . . |' +
        'G5 - E5 - C6 - B5 - | B5 - G5 - D6 - C6 - | A5 - G5 - F5 - D5 - | C5 - - - . . . .', { drums: 'dance' }],
      D: { from: 'C', shift: 2, drums: 'dance' },
      O: ['D', 'D5 - A4 - D5 - . .'],
    },
  },
  // ---------- 먼작귀 오리지널: 복고 · 트로트 · 디스코 ----------
  {
    id: 'trotfriend', genre: 'retro', title: '단짝 친구 트로트', composer: '먼작귀 사운드', bpm: 130, meter: 4,
    price: 0, style: 'trot', voice: 'brass', bass: 'trot', drums: 'trot', order: 'IACADO',
    jacket: 'cards/kurimanju', jc: '#ffd9a8',
    sections: {
      I: ['Am|E', '. . . . . . . . | . . . . . . . .'],
      A: ['Am|C|Dm|Am|Am|C|Dm E|Am',
        'A4 - C5 D5 E5 - E5 - | G5 - E5 - D5 - C5 - | D5 - D5 E5 D5 - C5 - | A4 - - - . . . . |' +
        'A4 - C5 D5 E5 - E5 - | G5 - A5 - G5 - E5 - | D5 - E5 - C5 - B4 - | A4 - - - . . . .'],
      C: ['Am|C|Dm|E|Am|C|Dm E|Am',
        'A5 - - - G5 - E5 - | G5 - - - E5 - D5 - | E5 - D5 - C5 - D5 - | E5 - - - . . . . |' +
        'A5 - - - G5 - E5 - | G5 - A5 - C6 - B5 - | A5 - G5 - E5 - D5 - | A4 - - - . . . .', { drums: 'disco' }],
      D: { from: 'C', shift: 2, drums: 'disco' },
      O: ['Bm', 'B4 - - - . . . .'],
    },
  },
  {
    id: 'trotjjan', genre: 'retro', title: '인생은 짠짠짠', composer: '먼작귀 사운드', bpm: 140, meter: 4,
    price: 500, style: 'trot', voice: 'brass', bass: 'trot', drums: 'trot', order: 'IACADO',
    jacket: 'cards/ramen_armor', jc: '#ffe08d',
    sections: {
      I: ['Dm|A7', '. . . . . . . . | . . . . . . . .'],
      A: ['Dm|Gm|A7|Dm|Dm|Gm|A7|Dm',
        'D5 - D5 F5 A5 - A5 - | G5 - F5 - E5 - D5 - | E5 - F5 - G5 - A5 - | D5 - - - . . . . |' +
        'D5 - D5 F5 A5 - A5 - | Bb5 - A5 - G5 - F5 - | E5 - D5 - C#5 - E5 - | D5 - - - . . . .'],
      C: ['Dm|Gm|A7|Dm|Dm|Gm|A7|Dm',
        'A5 A5 . A5 G5 . F5 . | G5 G5 . G5 F5 . E5 . | F5 - E5 - D5 - E5 - | A4 - - - . . . . |' +
        'A5 A5 . A5 G5 . F5 . | Bb5 Bb5 . Bb5 A5 . G5 . | F5 - E5 - D5 - C#5 - | D5 - - - . . . .', { drums: 'disco' }],
      D: { from: 'C', shift: 2, drums: 'disco' },
      O: ['Em', 'E5 - - - . . . .'],
    },
  },
  {
    id: 'trothome', genre: 'retro', title: '고향 가는 길', composer: '먼작귀 사운드', bpm: 120, meter: 4,
    price: 500, style: 'trot', voice: 'lead', bass: 'trot', drums: 'trot', order: 'IACADO',
    jacket: 'cards/shisa', jc: '#e9d8c2',
    sections: {
      I: ['Em|B7', '. . . . . . . . | . . . . . . . .'],
      A: ['Em|G|Am|Em|Em|Am|B7|Em',
        'B4 - E5 - G5 - F#5 E5 | D5 - - - B4 - - - | C5 - D5 - E5 - B4 - | E5 - - - . . . . |' +
        'B4 - E5 - G5 - B5 - | A5 - G5 - F#5 - E5 - | F#5 - G5 - F#5 - D#5 - | E5 - - - . . . .'],
      C: ['Em|Am|D|G|Em|Am|B7|Em',
        'B5 - - A5 G5 - - - | A5 - - G5 E5 - - - | G5 - E5 - D5 - E5 - | B4 - - - . . . . |' +
        'B5 - - A5 G5 - E5 - | A5 - B5 - C6 - B5 - | A5 - G5 - F#5 - D#5 - | E5 - - - . . . .', { drums: 'disco' }],
      D: { from: 'C', shift: 2, drums: 'disco' },
      O: ['F#m', 'F#5 - - - . . . .'],
    },
  },
  {
    id: 'trotdance', genre: 'retro', title: '오늘 밤 춤춰요', composer: '먼작귀 사운드', bpm: 128, meter: 4,
    price: 800, style: 'trot', voice: 'lead', bass: 'disco', drums: 'disco', order: 'IACADO',
    jacket: 'cards/pajama_pink', jc: '#ffc4d4',
    sections: {
      I: ['Gm|D7', '. . . . . . . . | . . . . . . . .'],
      A: ['Gm|Gm|Cm|D7|Gm|Gm|D7|Gm',
        'G5 - Bb5 - A5 G5 F5 - | G5 - D5 - - - . . | Eb5 - F5 - G5 - Bb5 - | A5 - - - . . . . |' +
        'G5 - Bb5 - A5 G5 F5 - | G5 - D6 - C6 - Bb5 - | A5 - G5 - F#5 - A5 - | G5 - - - . . . .'],
      C: ['Gm|Cm|F|Bb|Gm|Cm|D7|Gm',
        'D6 - D6 - C6 - Bb5 - | C6 - C6 - Bb5 - A5 - | Bb5 - A5 - G5 - F5 - | D5 - - - . . . . |' +
        'D6 - D6 - C6 - Bb5 - | Eb6 - D6 - C6 - Bb5 - | A5 - G5 - F#5 - D5 - | G5 - - - . . . .'],
      D: { from: 'C', shift: 2 },
      O: ['Am', 'A5 - - - . . . .'],
    },
  },
  {
    id: 'trotflower', genre: 'retro', title: '꽃길만 걸어요', composer: '먼작귀 사운드', bpm: 136, meter: 4,
    price: 800, style: 'trot', voice: 'brass', bass: 'trot', drums: 'trot', order: 'IACADO',
    jacket: 'cards/pajama_green', jc: '#ffd6e6',
    sections: {
      I: ['Am|E', '. . . . . . . . | . . . . . . . .'],
      A: ['Am|Am|F|E|Am|Am|Dm|E',
        'E5 - D5 - C5 - D5 - | E5 - A5 - G5 - - - | E5 - D5 - C5 - A4 - | B4 - - - . . . . |' +
        'E5 - D5 - C5 - D5 - | E5 - A5 - C6 - B5 - | A5 - G5 - E5 - D5 - | E5 - - - . . . .'],
      C: ['F|Am|C|G|F|Am|Dm E|Am',
        'C6 - B5 - A5 - G5 - | A5 - - - E5 - - - | G5 - A5 - G5 - E5 - | D5 - - - . . . . |' +
        'C6 - B5 - A5 - G5 - | A5 - - - C6 - D6 - | E6 - D6 - C6 - B5 - | A5 - - - . . . .', { drums: 'disco' }],
      D: { from: 'C', shift: 2, drums: 'disco' },
      O: ['Bm', 'B5 - - - . . . .'],
    },
  },
  {
    id: 'trotconfess', genre: 'retro', title: '깜짝 고백', composer: '먼작귀 사운드', bpm: 132, meter: 4,
    price: 1000, style: 'trot', voice: 'lead', bass: 'trot', drums: 'trot', order: 'IACADO',
    jacket: 'cards/chiikawa', jc: '#ffcfe0',
    sections: {
      I: ['Bm|F#', '. . . . . . . . | . . . . . . . .'],
      A: ['Bm|G|D|F#|Bm|G|Em F#|Bm',
        'F#5 - B5 - A5 - F#5 - | E5 - D5 - B4 - - - | D5 - E5 - F#5 - A5 - | F#5 - - - . . . . |' +
        'F#5 - B5 - A5 - F#5 - | E5 - F#5 - D5 - B4 - | C#5 - D5 - E5 - C#5 - | B4 - - - . . . .'],
      C: ['Bm|D|G|F#|Bm|D|Em F#|Bm',
        'B5 - B5 - A5 - F#5 - | A5 - A5 - F#5 - E5 - | F#5 - E5 - D5 - E5 - | F#5 - - - . . . . |' +
        'B5 - B5 - A5 - F#5 - | A5 - B5 - D6 - C#6 - | B5 - A5 - F#5 - E5 - | B4 - - - . . . .', { drums: 'disco' }],
      D: { from: 'C', shift: 2, drums: 'disco' },
      O: ['C#m', 'C#5 - - - . . . .'],
    },
  },
  {
    id: 'trotbus', genre: 'retro', title: '신바람 관광버스', composer: '먼작귀 사운드', bpm: 150, meter: 4,
    price: 1500, style: 'trot', voice: 'brass', bass: 'trot', drums: 'trot', order: 'IACDEO',
    jacket: 'cards/kani', jc: '#ffe3a3',
    sections: {
      I: ['Am|E', '. . . . . . . . | . . . . . . . .'],
      A: ['Am|C|Am|Am|Am|C G|C E|Am',
        'A5 A5 G5 E5 G5 - A5 - | C6 - B5 - A5 - G5 - | E5 E5 D5 C5 D5 - E5 - | A4 - - - . . . . |' +
        'A5 A5 G5 E5 G5 - A5 - | C6 - D6 - E6 - D6 - | C6 - B5 - G5 - E5 - | A5 - - - . . . .'],
      C: ['Am|Am|G|Am|Am|C|G E|Am',
        'E6 - D6 - C6 - D6 - | E6 - - - C6 - - - | D6 - C6 - B5 - G5 - | A5 - - - . . . . |' +
        'E6 - D6 - C6 - D6 - | E6 - G6 - E6 - D6 - | C6 - B5 - G5 - E5 - | A5 - - - . . . .', { drums: 'disco' }],
      D: { from: 'A', bpm: 168 },
      E: { from: 'C', bpm: 168, drums: 'disco' },
      O: ['Am', 'A5 - E5 - A4 - . .', { bpm: 168 }],
    },
  },
  {
    id: 'mirrorball', genre: 'retro', title: '미러볼 디스코', composer: '먼작귀 사운드', bpm: 118, meter: 4,
    price: 800, style: 'stab', voice: 'lead', bass: 'disco', drums: 'disco', order: 'IACADO',
    jacket: 'cards/pajama_purple', jc: '#d9c6ff',
    sections: {
      I: ['Am7|Dm7', '. . . . . . . . | . . . . . . . .'],
      A: ['Am7|Dm7|G7|CM7|Am7|Dm7|G7|CM7',
        'A5 - . A5 G5 - E5 - | D5 - . D5 E5 - G5 - | G5 - . G5 F5 - D5 - | E5 - - - . . . . |' +
        'A5 - . A5 G5 - E5 - | D5 - . D5 E5 - G5 - | B5 - A5 - G5 - D5 - | C5 - - - . . . .'],
      C: ['FM7|Dm7|G7|CM7|FM7|Dm7|G7|Am7',
        'C6 - B5 - A5 - G5 - | A5 - - - D5 - - - | B5 - A5 - G5 - F5 - | E5 - - - . . . . |' +
        'C6 - B5 - A5 - G5 - | A5 - - - D6 - - - | C6 - B5 - G5 - E5 - | A5 - - - . . . .'],
      D: { from: 'C', shift: 2 },
      O: ['Bm7', 'B5 - - - . . . .'],
    },
  },
  {
    id: 'groovebus', genre: 'retro', title: '그루브 버스 (펑크)', composer: '먼작귀 사운드', bpm: 112, meter: 4,
    price: 1000, style: 'stab', voice: 'brass', bass: 'disco', drums: 'disco', order: 'IACADO',
    jacket: 'cards/rakko', jc: '#ffcf8a',
    sections: {
      I: ['Em7|A7', '. . . . . . . . | . . . . . . . .'],
      A: ['Em7|A7|Em7|A7|Em7|A7|Em7 A7|Em7',
        'E5 . G5 . A5 . B5 . | D6 - B5 - A5 . G5 . | E5 . G5 . A5 . B5 . | A5 - G5 - E5 - - - |' +
        'E5 . G5 . A5 . B5 . | D6 - E6 - D6 . B5 . | A5 . G5 . E5 . D5 . | E5 - - - . . . .'],
      C: ['CM7|Bm7|Am7|Em7|CM7|Bm7|Am7 B7|Em7',
        'B5 - B5 - A5 - G5 - | A5 - A5 - G5 - E5 - | G5 - G5 - E5 - D5 - | E5 - - - . . . . |' +
        'B5 - B5 - A5 - G5 - | A5 - B5 - D6 - E6 - | D6 - B5 - A5 - G5 - | E5 - - - . . . .'],
      D: { from: 'C', shift: 2 },
      O: ['F#m7', 'F#5 - - - . . . .'],
    },
  },
  {
    id: 'stardisco', genre: 'retro', title: '별빛 디스코', composer: '먼작귀 사운드', bpm: 120, meter: 4,
    price: 0, style: 'stab', voice: 'lead', bass: 'disco', drums: 'disco', order: 'IACADO',
    jacket: 'cards/momonga', jc: '#b9c6ee',
    sections: {
      I: ['G|Bm', '. . . . . . . . | . . . . . . . .'],
      A: ['G|Bm|Em|C|G|Bm|C D|G',
        'B5 - B5 - A5 - G5 - | F#5 - - - D5 - - - | G5 - G5 - F#5 - E5 - | E5 - - - . . . . |' +
        'B5 - B5 - A5 - G5 - | F#5 - A5 - D6 - C6 - | B5 - A5 - G5 - F#5 - | G5 - - - . . . .'],
      C: ['G|Em|C|D Em|G|Em|C D|G',
        'D6 - B5 - D6 - E6 - | D6 - B5 - A5 - - - | C6 - A5 - C6 - D6 - | C6 - A5 - G5 - - - |' +
        'D6 - B5 - D6 - E6 - | G6 - F#6 - E6 - D6 - | C6 - B5 - A5 - F#5 - | G5 - - - . . . .'],
      D: { from: 'C', shift: 2 },
      O: ['A', 'A5 - - - . . . .'],
    },
  },
  {
    id: 'cityneon', genre: 'retro', title: '시티 네온 (시티팝)', composer: '먼작귀 사운드', bpm: 110, meter: 4,
    price: 1200, style: 'stab', voice: 'epiano', bass: 'disco', drums: 'disco', order: 'IACADO',
    jacket: 'cards/pajama_white', jc: '#ffd9c4',
    sections: {
      I: ['GM7|F#m7', '. . . . . . . . | . . . . . . . .'],
      A: ['GM7|F#m7|Em7|A7|GM7|F#m7|Em7 A7|DM7',
        'F#5 - E5 - D5 - E5 - | C#5 - - - A4 - - - | B4 - C#5 - D5 - E5 - | E5 - - - . . . . |' +
        'F#5 - E5 - D5 - E5 - | C#5 - D5 - E5 - F#5 - | G5 - F#5 - E5 - C#5 - | D5 - - - . . . .'],
      C: ['GM7|F#m7|Em7|A7|GM7|F#m7|Em7 A7|DM7',
        'A5 - - F#5 E5 - D5 - | E5 - - D5 C#5 - A4 - | B4 - D5 - F#5 - A5 - | G5 - - - . . . . |' +
        'A5 - - F#5 E5 - D5 - | E5 - F#5 - A5 - B5 - | A5 - F#5 - E5 - C#5 - | D5 - - - . . . .'],
      D: { from: 'C', shift: 2 },
      O: ['EM7', 'E5 - - - . . . .'],
    },
  },
  {
    id: 'boogie', genre: 'retro', title: '부기우기 춤바람', composer: '먼작귀 사운드', bpm: 128, meter: 4,
    price: 500, style: 'stab', voice: 'piano', bass: 'walk', drums: 'disco', order: 'IACADO',
    jacket: 'cards/kurimanju', jc: '#ffe6c7',
    sections: {
      I: ['C|G', '. . . . . . . . | . . . . . . . .'],
      A: ['C|F|G|C|C|F|G|C',
        'C5 E5 G5 A5 G5 E5 C5 - | F5 A5 C6 D6 C6 A5 F5 - | G5 B5 D6 E6 D6 B5 G5 - | C6 - - - . . . . |' +
        'C5 E5 G5 A5 G5 E5 C5 - | F5 A5 C6 D6 C6 A5 F5 - | G5 - F5 - E5 - D5 - | C5 - - - . . . .'],
      C: ['Am|C|F|G|Am|C|F G|C',
        'E6 - D6 - C6 - A5 - | G5 - - - E5 - - - | F5 - E5 - D5 - C5 - | D5 - - - . . . . |' +
        'E6 - D6 - C6 - A5 - | G5 - A5 - C6 - D6 - | E6 - D6 - C6 - B5 - | C6 - - - . . . .'],
      D: { from: 'C', shift: 2 },
      O: ['D', 'D6 - - - . . . .'],
    },
  },
  // ---------- 먼작귀 오리지널: 퐁크 · 힙합 ----------
  {
    id: 'cowbellrush', genre: 'phonk', title: '카우벨 폭주 (브라질 퐁크)', composer: '먼작귀 사운드', bpm: 130, meter: 4, sub: 4,
    price: 1500, style: 'pad2', voice: 'cow', bass: 'sub808', drums: 'phonk', order: 'IABADO',
    jacket: 'cards/labor_armor', jc: '#1d1d24',
    sections: {
      I: ['Em|Em', '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .', { drums: 'build' }],
      A: ['Em|Dm|C|B7|Em|Dm|C|B7',
        'E5 . . E5 . . G5 . . E5 . . F5 . E5 . | D5 . . D5 . . F5 . . D5 . . E5 . D5 . | C5 . . C5 . . E5 . . C5 . . D5 . C5 . | B4 . . B4 . . D5 . . F5 . . E5 . . . |' +
        'E5 . . E5 . . G5 . . E5 . . F5 . E5 . | D5 . . D5 . . F5 . . D5 . . E5 . D5 . | C5 . . C5 . . E5 . . G5 . . F5 . E5 . | B4 . . D#5 . . F#5 . . B5 . . A5 . . .'],
      B: ['Em|F|Em|Em', 'E6 - - - . . . . E6 - - - . . . . | F6 - - - . . . . E6 - - - . . . . | G6 - - - . . . . F6 - - - . . . . | E6 - . E6 - . E6 - E6 . E6 . E6 E6 E6 E6', { drums: 'build' }],
      D: { from: 'A', shift: 12 },
      O: ['Em', 'E5 - - - . . . . . . . . . . . .'],
    },
  },
  {
    id: 'driftmode', genre: 'phonk', title: '드리프트 모드', composer: '먼작귀 사운드', bpm: 125, meter: 4, sub: 4,
    price: 1200, style: 'pad2', voice: 'cow', bass: 'sub808', drums: 'phonk', order: 'IABADO',
    jacket: 'cards/hachiware', jc: '#24203a',
    sections: {
      I: ['Cm|Cm', '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .', { drums: 'build' }],
      A: ['Cm|Cm|Ab|G|Cm|Cm|Ab|G',
        'C5 . C5 . Eb5 . C5 . G5 . . F5 . Eb5 . . | C5 . C5 . Eb5 . C5 . Bb4 . . C5 . . . . | Ab4 . Ab4 . C5 . Ab4 . Eb5 . . D5 . C5 . . | G4 . G4 . B4 . D5 . F5 . . Eb5 . D5 . . |' +
        'C5 . C5 . Eb5 . C5 . G5 . . F5 . Eb5 . . | C5 . C5 . Eb5 . C5 . Bb4 . . C5 . . . . | Ab4 . Ab4 . C5 . Eb5 . Ab5 . . G5 . F5 . . | G5 . F5 . Eb5 . D5 . B4 . . . . . . .'],
      B: ['Cm|Ab|Fm|G', 'C6 - - - - - - - Bb5 - - - G5 - - - | Ab5 - - - - - - - G5 - - - F5 - - - | Eb5 - - - - - - - D5 - - - C5 - - - | B4 - - - - - - - . . . . . . . .', { drums: 'half' }],
      D: { from: 'A', bpm: 135 },
      O: ['Cm', 'C5 - - - . . . . . . . . . . . .', { bpm: 135 }],
    },
  },
  {
    id: 'metalcow', genre: 'phonk', title: '메탈릭 카우벨 (헬스장)', composer: '먼작귀 사운드', bpm: 130, meter: 4, sub: 4,
    price: 2000, style: 'pad2', voice: 'cow', bass: 'sub808', drums: 'phonk', order: 'IABADO',
    jacket: 'cards/ramen_armor', jc: '#2a2a2a',
    sections: {
      I: ['Am|Bb', '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .', { drums: 'build' }],
      A: ['Am|Bb|Am|Gm|Am|Bb|Am|Gm',
        'A5 . A5 . Bb5 . A5 . . . A5 . G5 . A5 . | A5 . A5 . C6 . Bb5 . . . A5 . G5 . F5 . | E5 . E5 . F5 . E5 . . . D5 . E5 . F5 . | G5 . F5 . E5 . D5 . . . C5 . Bb4 . A4 . |' +
        'A5 . A5 . Bb5 . A5 . . . A5 . G5 . A5 . | A5 . A5 . C6 . Bb5 . . . A5 . G5 . F5 . | E5 . E5 . F5 . G5 . . . A5 . Bb5 . C6 . | D6 . C6 . Bb5 . A5 . . . G5 . F5 . E5 .'],
      B: ['Am|Bb|C|E', 'A4 - - - A5 - - - A4 - - - A5 - - - | Bb4 - - - Bb5 - - - Bb4 - - - Bb5 - - - | C5 - - - C6 - - - C5 - - - C6 - - - | E5 E5 E5 E5 E5 E5 E5 E5 E5 E5 E5 E5 E5 E5 E5 E5', { drums: 'build' }],
      D: { from: 'A', bpm: 140 },
      O: ['Am', 'A5 - - - . . . . . . . . . . . .', { bpm: 140 }],
    },
  },
  {
    id: 'nightcruise', genre: 'phonk', title: '나이트 크루징', composer: '먼작귀 사운드', bpm: 110, meter: 4, sub: 4,
    price: 800, style: 'pad2', voice: 'cow', bass: 'sub808', drums: 'phonk', order: 'IABADO',
    jacket: 'cards/tiha', jc: '#1c2156',
    sections: {
      I: ['Dm|Dm', '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .', { drums: 'build' }],
      A: ['Dm|Dm|Bb|A|Dm|Dm|Bb|A',
        'D5 . . F5 . . A5 . G5 . . F5 . . E5 . | D5 . . F5 . . A5 . C6 . . A5 . . G5 . | Bb4 . . D5 . . F5 . E5 . . D5 . . C5 . | A4 . . C#5 . . E5 . G5 . . F5 . E5 . . |' +
        'D5 . . F5 . . A5 . G5 . . F5 . . E5 . | D5 . . F5 . . A5 . D6 . . C6 . . A5 . | Bb4 . . D5 . . F5 . Bb5 . . A5 . . G5 . | A5 . . G5 . . F5 . E5 . . C#5 . A4 . .'],
      B: ['Gm|Gm|A|A', 'G5 - - - - - - - F5 - - - E5 - - - | D5 - - - - - - - E5 - - - F5 - - - | E5 - - - - - - - C#5 - - - A4 - - - | A4 . A4 . A4 . A4 . A4 A4 A4 A4 A4 A4 A4 A4', { drums: 'half' }],
      D: { from: 'A', shift: 12, drums: 'trap' },
      O: ['Dm', 'D5 - - - . . . . . . . . . . . .'],
    },
  },
  {
    id: 'urararara', genre: 'phonk', title: '퐁크 우사기 (우라라라!)', composer: '먼작귀 사운드', bpm: 132, meter: 4, sub: 4,
    price: 2500, style: 'pad2', voice: 'cow', bass: 'sub808', drums: 'phonk', order: 'IABADO',
    jacket: 'cards/usagi', jc: '#2b2410',
    sections: {
      I: ['Gm|Gm', '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .', { drums: 'build' }],
      A: ['Gm|Gm|Eb|D|Gm|Gm|Eb|D',
        'G5 . G5 . G5 . Bb5 . A5 . G5 . F5 . G5 . | G5 . G5 . G5 . D6 . C6 . Bb5 . A5 . . . | Eb5 . Eb5 . Eb5 . G5 . F5 . Eb5 . D5 . Eb5 . | D5 . D5 . F#5 . A5 . C6 . A5 . F#5 . D5 . |' +
        'G5 . G5 . G5 . Bb5 . A5 . G5 . F5 . G5 . | G5 . G5 . G5 . D6 . C6 . Bb5 . A5 . . . | Eb5 . Eb5 . G5 . Bb5 . Eb6 . D6 . C6 . Bb5 . | A5 . G5 . F#5 . A5 . D6 . . . . . . .'],
      B: ['Gm|Cm|Eb|D', 'G4 - - - G4 - - - Bb4 - - - Bb4 - - - | C5 - - - C5 - - - D5 - - - D5 - - - | Eb5 - - - F5 - - - G5 - - - A5 - - - | D6 - - - - - - - . . . . . . . .', { drums: 'build' }],
      D: { from: 'A', bpm: 142 },
      O: ['Gm', 'G5 - - - . . . . . . . . . . . .', { bpm: 142 }],
    },
  },
  {
    id: 'boombap', genre: 'phonk', title: '올드스쿨 하치와레 (붐뱁)', composer: '먼작귀 사운드', bpm: 92, meter: 4, sub: 4,
    price: 500, style: 'swing', voice: 'epiano', bass: 'sub808', drums: 'lofi', order: 'IACACO',
    jacket: 'cards/hachiware', jc: '#3a3a52',
    sections: {
      I: ['Am7|Dm7', '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .'],
      A: ['Am7|Dm7|G7|CM7|Am7|Dm7|G7|CM7',
        'E5 . . G5 . . A5 . . . G5 . E5 . . . | D5 . . F5 . . A5 . . . C6 . A5 . . . | G5 . . B5 . . D6 . . . B5 . G5 . . . | E5 . . G5 . . C6 . B5 . G5 . E5 . . . |' +
        'E5 . . G5 . . A5 . . . G5 . E5 . . . | D5 . . F5 . . A5 . . . C6 . A5 . . . | G5 . . B5 . . D6 . . . F6 . E6 . D6 . | C6 . . B5 . . G5 . A5 . . . . . . .'],
      C: ['FM7|Em7|Dm7|Am7', 'C6 - - - B5 - A5 - G5 - - - E5 - - - | F5 - - - E5 - D5 - C5 - - - A4 - - - | B4 - - - C5 - D5 - E5 - - - G5 - - - | A5 - - - - - - - . . . . . . . .'],
      O: ['Am7', 'A5 - - - . . . . . . . . . . . .'],
    },
  },
  {
    id: 'trapbeat', genre: 'phonk', title: '트랩 하트비트', composer: '먼작귀 사운드', bpm: 140, meter: 4, sub: 4,
    price: 1500, style: 'pad2', voice: 'pluck', bass: 'sub808', drums: 'trap', order: 'IABADO',
    jacket: 'cards/pajama_pink', jc: '#2a1420',
    sections: {
      I: ['Fm|Db', '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .', { drums: 'build' }],
      A: ['Fm|Fm|Db|C|Fm|Fm|Db|C',
        'F5 . . Ab5 . . C6 . Bb5 . Ab5 . G5 . . . | F5 . . Ab5 . . C6 . Eb6 . Db6 . C6 . . . | Db5 . . F5 . . Ab5 . G5 . F5 . Eb5 . . . | C5 . . E5 . . G5 . Bb5 . G5 . E5 . . . |' +
        'F5 . . Ab5 . . C6 . Bb5 . Ab5 . G5 . . . | F5 . . Ab5 . . C6 . F6 . Eb6 . Db6 . . . | Db6 . . C6 . . Bb5 . Ab5 . G5 . F5 . . . | E5 . . G5 . . Bb5 . C6 . . . . . . .'],
      B: ['Db|Eb|Fm|C', 'Ab5 - - - G5 - - - F5 - - - Eb5 - - - | G5 - - - F5 - - - Eb5 - - - Db5 - - - | C5 - - - Db5 - - - Eb5 - - - F5 - - - | E5 - - - - - - - G5 - - - - - - -', { drums: 'half' }],
      D: { from: 'A', bpm: 150 },
      O: ['Fm', 'F5 - - - . . . . . . . . . . . .', { bpm: 150 }],
    },
  },
  {
    id: 'drillbeat', genre: 'phonk', title: '드릴 비트', composer: '먼작귀 사운드', bpm: 142, meter: 4, sub: 4,
    price: 1800, style: 'pad2', voice: 'piano', bass: 'sub808', drums: 'trap', order: 'IABADO',
    jacket: 'cards/pochette_armor', jc: '#1f1b2b',
    sections: {
      I: ['Em|C', '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .', { drums: 'build' }],
      A: ['Em|Em|C|B|Em|Em|C|B',
        'E5 . E5 . . G5 . . F#5 . E5 . D5 . . . | E5 . E5 . . G5 . . B5 . A5 . G5 . . . | C5 . C5 . . E5 . . D5 . C5 . B4 . . . | B4 . . . D#5 . . . F#5 . . . B5 . . . |' +
        'E5 . E5 . . G5 . . F#5 . E5 . D5 . . . | E5 . E5 . . G5 . . B5 . D6 . E6 . . . | C6 . C6 . . B5 . . A5 . G5 . E5 . . . | F#5 . . . D#5 . . . B4 . . . . . . .'],
      B: ['Em|C|Am|B', 'E6 - - - - - - - D6 - - - B5 - - - | C6 - - - - - - - B5 - - - G5 - - - | A5 - - - - - - - G5 - - - F#5 - - - | B5 - - - - - - - . . . . . . . .', { drums: 'half' }],
      D: { from: 'A', bpm: 150 },
      O: ['Em', 'E5 - - - . . . . . . . . . . . .', { bpm: 150 }],
    },
  },
  // ---------- 먼작귀 오리지널: 칩튠 ----------
  {
    id: 'pixeladv', genre: 'chip', title: '픽셀 어드벤처', composer: '먼작귀 사운드', bpm: 150, meter: 4,
    price: 0, style: 'chip', voice: 'chip', bass: 'chip', drums: 'chip', order: 'IABACO',
    jacket: 'cards/hachiware', jc: '#8fd3ff',
    sections: {
      I: ['C|G', '. . . . . . . . | . . . . . . . .'],
      A: ['C|G|Am|F|C|G|F G|C',
        'E5 - G5 - C6 - G5 - | D5 - G5 - B5 - G5 - | C5 - E5 - A5 - E5 - | F5 - A5 - C6 - A5 - |' +
        'E5 - G5 - C6 - E6 - | D6 - C6 - B5 - G5 - | A5 - G5 - F5 - D5 - | C5 - - - . . . .'],
      B: ['F|C|Dm|G', 'A5 - A5 B5 C6 - A5 - | G5 - G5 A5 B5 - G5 - | F5 - F5 G5 A5 - F5 - | G5 - - - G5 A5 B5 D6'],
      C: { from: 'A', shift: 5, bpm: 164 },
      O: ['F', 'F5 - C6 - F6 - . .', { bpm: 164 }],
    },
  },
  {
    id: 'bossbattle', genre: 'chip', title: '보스전 (8비트)', composer: '먼작귀 사운드', bpm: 168, meter: 4,
    price: 2000, style: 'chip', voice: 'chip', bass: 'chip', drums: 'chip', order: 'IABABO',
    jacket: 'cards/rakko', jc: '#3b1f2b',
    sections: {
      I: ['Am|E', '. . . . . . . . | . . . . . . . .'],
      A: ['Am|F|G|E|Am|F|G|E',
        'A4 A4 C5 A4 E5 A4 C5 A4 | F4 F4 A4 F4 C5 F4 A4 F4 | G4 G4 B4 G4 D5 G4 B4 G4 | E4 E4 G#4 E4 B4 E4 G#4 E4 |' +
        'A5 - G5 - E5 - C5 - | F5 - E5 - C5 - A4 - | B4 - C5 - D5 - E5 - | E5 - - - G#5 - B5 -'],
      B: ['Am|Am|F|E|Am|Am|Dm E|Am',
        'A5 - - - C6 - B5 - | A5 - - - E5 - - - | F5 - G5 - A5 - B5 - | C6 - B5 - A5 - G#5 - |' +
        'A5 - - - C6 - B5 - | A5 - - - E6 - - - | D6 - C6 - B5 - G#5 - | A5 - - - . . . .'],
      O: ['Am', 'A5 - - - . . . .'],
    },
  },
  {
    id: 'slimetown', genre: 'chip', title: '말랑말랑 슬라임 마을', composer: '먼작귀 사운드', bpm: 140, meter: 4,
    price: 0, style: 'chip', voice: 'chip', bass: 'chip', drums: 'chip', order: 'IABACO',
    jacket: 'cards/pajama_green', jc: '#b7f0c9',
    sections: {
      I: ['F|C', '. . . . . . . . | . . . . . . . .'],
      A: ['F|Bb|C|F|F|Bb|C|F',
        'C5 - F5 - A5 - F5 - | D5 - F5 - Bb5 - F5 - | C5 - E5 - G5 - Bb5 - | A5 - - - . . . . |' +
        'C5 - F5 - A5 - C6 - | D6 - C6 - Bb5 - A5 - | G5 - A5 - G5 - E5 - | F5 - - - . . . .'],
      B: ['F|C|Bb|C', 'A5 A5 . A5 Bb5 . A5 . | G5 G5 . G5 A5 . G5 . | F5 F5 . F5 G5 . A5 . | C6 - - - . . . .'],
      C: { from: 'A', shift: 2, bpm: 150 },
      O: ['G', 'G5 - D6 - G6 - . .', { bpm: 150 }],
    },
  },
  {
    id: 'spacecadet', genre: 'chip', title: '우주 비행사 시사 (칩튠)', composer: '먼작귀 사운드', bpm: 160, meter: 4,
    price: 1200, style: 'chip', voice: 'chip', bass: 'chip', drums: 'chip', order: 'IABACO',
    jacket: 'cards/shisa', jc: '#1c2156',
    sections: {
      I: ['Dm|A', '. . . . . . . . | . . . . . . . .'],
      A: ['Dm|C|Bb|A|Dm|C|Bb A|Dm',
        'D5 F5 A5 D6 A5 F5 D5 F5 | C5 E5 G5 C6 G5 E5 C5 E5 | Bb4 D5 F5 Bb5 F5 D5 Bb4 D5 | A4 C#5 E5 A5 E5 C#5 A4 C#5 |' +
        'D6 - C6 - A5 - F5 - | E5 - F5 - G5 - A5 - | Bb5 - A5 - G5 - E5 - | D5 - - - . . . .'],
      B: ['Bb|C|Dm|A', 'F5 - F5 - G5 - A5 - | G5 - G5 - A5 - Bb5 - | A5 - A5 - Bb5 - C6 - | C#6 - - - E6 - - -'],
      C: { from: 'A', bpm: 172 },
      O: ['Dm', 'D6 - - - . . . .', { bpm: 172 }],
    },
  },
  {
    id: 'treasure', genre: 'chip', title: '보물찾기 대작전', composer: '먼작귀 사운드', bpm: 144, meter: 4,
    price: 800, style: 'chip', voice: 'chip', bass: 'chip', drums: 'chip', order: 'IABACO',
    jacket: 'cards/tiha', jc: '#ffe28a',
    sections: {
      I: ['G|D', '. . . . . . . . | . . . . . . . .'],
      A: ['G|D|C|G|G|C|D|G',
        'D5 - G5 - B5 - A5 G5 | F#5 - A5 - D6 - - - | E5 - G5 - C6 - B5 A5 | G5 - - - . . . . |' +
        'D5 - G5 - B5 - D6 - | E6 - D6 - C6 - B5 - | A5 - B5 - A5 - F#5 - | G5 - - - . . . .'],
      B: ['Em|Am|C|D', 'B5 - C6 - D6 - B5 - | A5 - B5 - C6 - A5 - | G5 - A5 - B5 - G5 - | F#5 - - - D6 - - -'],
      C: { from: 'A', shift: 2, bpm: 156 },
      O: ['A', 'A5 - E6 - A6 - . .', { bpm: 156 }],
    },
  },
  {
    id: 'racing8bit', genre: 'chip', title: '8비트 레이싱', composer: '먼작귀 사운드', bpm: 176, meter: 4,
    price: 2500, style: 'chip', voice: 'chip', bass: 'chip', drums: 'chip', order: 'IABACO',
    jacket: 'cards/usagi', jc: '#ff9d4d',
    sections: {
      I: ['Em|B', '. . . . . . . . | . . . . . . . .'],
      A: ['Em|D|C|B|Em|D|C B|Em',
        'E5 E5 G5 E5 B5 E5 G5 E5 | D5 D5 F#5 D5 A5 D5 F#5 D5 | C5 C5 E5 C5 G5 C5 E5 C5 | B4 B4 D#5 B4 F#5 B4 D#5 B4 |' +
        'E5 - G5 - B5 - E6 - | D6 - C6 - B5 - A5 - | G5 - A5 - B5 - G5 - | E5 - - - . . . .'],
      B: ['C|D|Em|B', 'G5 - - - F#5 - E5 - | F#5 - - - E5 - D5 - | E5 - - - D5 - C5 - | B4 - - - D#5 - F#5 -'],
      C: { from: 'A', bpm: 188 },
      O: ['Em', 'E5 - - - . . . .', { bpm: 188 }],
    },
  },
  {
    id: 'dungeon', genre: 'chip', title: '던전 탐험', composer: '먼작귀 사운드', bpm: 132, meter: 4,
    price: 1000, style: 'chip', voice: 'chip', bass: 'chip', drums: 'chip', order: 'IABACO',
    jacket: 'cards/tiha', jc: '#2b2440',
    sections: {
      I: ['Cm|G', '. . . . . . . . | . . . . . . . .'],
      A: ['Cm|Ab|Bb|G|Cm|Fm|Ab G|Cm',
        'C5 - Eb5 - G5 - Eb5 - | Ab4 - C5 - Eb5 - C5 - | Bb4 - D5 - F5 - D5 - | G4 - B4 - D5 - F5 - |' +
        'Eb5 - - - D5 - C5 - | Ab5 - - - G5 - F5 - | Eb5 - D5 - C5 - B4 - | C5 - - - . . . .'],
      B: ['Cm|Fm|Ab|G', 'G5 - G5 - Ab5 - G5 - | F5 - F5 - G5 - F5 - | Eb5 - Eb5 - F5 - Eb5 - | D5 - - - G5 - - -'],
      C: { from: 'A', bpm: 144 },
      O: ['Cm', 'C5 - G5 - C6 - . .', { bpm: 144 }],
    },
  },
  {
    id: 'jellyjump', genre: 'chip', title: '젤리 점프', composer: '먼작귀 사운드', bpm: 150, meter: 4,
    price: 0, style: 'chip', voice: 'chip', bass: 'chip', drums: 'chip', order: 'IABACO',
    jacket: 'cards/momonga', jc: '#ffd0f0',
    sections: {
      I: ['Bb|F', '. . . . . . . . | . . . . . . . .'],
      A: ['Bb|F|Gm|Eb|Bb|Eb|F|Bb',
        'F5 - Bb5 - D6 - Bb5 - | F5 - A5 - C6 - A5 - | G5 - Bb5 - D6 - G5 - | Eb5 - G5 - Bb5 - Eb6 - |' +
        'D6 - C6 - Bb5 - F5 - | G5 - F5 - Eb5 - D5 - | C5 - D5 - Eb5 - F5 - | Bb4 - - - . . . .'],
      B: ['Bb|F|Gm|F', 'D6 D6 . D6 C6 . Bb5 . | C6 C6 . C6 Bb5 . A5 . | Bb5 Bb5 . Bb5 A5 . G5 . | F5 - - - F5 - - -'],
      C: { from: 'A', shift: 2, bpm: 162 },
      O: ['C', 'C5 - G5 - C6 - . .', { bpm: 162 }],
    },
  },
  {
    id: 'cozyvillage', genre: 'chip', title: '아늑한 마을 (칩튠 왈츠)', composer: '먼작귀 사운드', bpm: 132, meter: 3,
    price: 500, style: 'chip', voice: 'chip', bass: 'chip', drums: 'waltz', order: 'IABABO',
    jacket: 'cards/kurimanju', jc: '#ffe9c9',
    sections: {
      I: ['F', '. . . . . .'],
      A: ['F|C|F|Bb|Gm|F|C|F', 'C5 - F5 - A5 - | G5 - - - E5 - | F5 - A5 - C6 - | D6 - - - C6 - | Bb5 - A5 - G5 - | A5 - - - F5 - | G5 - A5 - E5 - | F5 - - - - -'],
      B: ['F|Bb|C|F|Gm|F|C|F', 'A5 - Bb5 - C6 - | D6 - - - C6 - | Bb5 - A5 - G5 - | A5 - - - - - | G5 - A5 - Bb5 - | C6 - - - A5 - | G5 - F5 - E5 - | F5 - - - - -'],
      O: ['F', 'F5 - C5 - F4 -'],
    },
  },
  {
    id: 'finalboss', genre: 'chip', title: '최종 보스 (하드 칩튠)', composer: '먼작귀 사운드', bpm: 184, meter: 4,
    price: 4000, style: 'chip', voice: 'chip', bass: 'chip', drums: 'chip', order: 'IABACO',
    jacket: 'cards/labor_armor', jc: '#3a0f1a',
    sections: {
      I: ['F#m|C#', '. . . . . . . . | . . . . . . . .'],
      A: ['F#m|D|E|C#|F#m|D|E C#|F#m',
        'F#5 F#5 A5 F#5 C#6 F#5 A5 F#5 | D5 D5 F#5 D5 A5 D5 F#5 D5 | E5 E5 G#5 E5 B5 E5 G#5 E5 | C#5 C#5 E#5 C#5 G#5 C#5 E#5 C#5 |' +
        'F#6 - E6 - C#6 - A5 - | D6 - C#6 - A5 - F#5 - | E6 - D6 - B5 - G#5 - | F#5 - - - . . . .'],
      B: ['D|E|F#m|C#', 'A5 - B5 - C#6 - D6 - | C#6 - B5 - A5 - G#5 - | F#5 - G#5 - A5 - B5 - | C#6 - - - E#6 - - -'],
      C: { from: 'A', bpm: 196 },
      O: ['F#m', 'F#5 - - - . . . .', { bpm: 196 }],
    },
  },
  {
    id: 'mushroom', genre: 'chip', title: '버섯 숲 산책', composer: '먼작귀 사운드', bpm: 136, meter: 4,
    price: 500, style: 'chip', voice: 'tri', bass: 'chip', drums: 'chip', order: 'IABACO',
    jacket: 'cards/kani', jc: '#ffd6c9',
    sections: {
      I: ['D|A', '. . . . . . . . | . . . . . . . .'],
      A: ['D|Bm|G|A|D|Bm|G A|D',
        'F#5 - A5 - D6 - A5 - | F#5 - D5 - B4 - D5 - | G5 - B5 - D6 - B5 - | A5 - - - E5 - - - |' +
        'F#5 - A5 - D6 - F#6 - | E6 - D6 - B5 - A5 - | G5 - F#5 - E5 - C#5 - | D5 - - - . . . .'],
      B: ['G|A|Em|Bm|G|A|G A|D', 'B5 - - - A5 - G5 - | A5 - - - G5 - F#5 - | G5 - - - F#5 - E5 - | F#5 - - - D5 - - - | B5 - - - A5 - G5 - | A5 - - - C#6 - E6 - | D6 - C#6 - B5 - A5 - | D6 - - - . . . .'],
      C: { from: 'A', shift: 5, bpm: 148 },
      O: ['G', 'G5 - D6 - G6 - . .', { bpm: 148 }],
    },
  },
  // ---------- 먼작귀 오리지널: 로파이 ----------
  {
    id: 'raincafe', genre: 'lofi', title: '비 오는 날 카페', composer: '먼작귀 사운드', bpm: 84, meter: 4,
    price: 0, style: 'lofi', voice: 'epiano', bass: 'sub808', drums: 'lofi', order: 'IABAO',
    jacket: 'cards/pajama_white', jc: '#3a3a52',
    sections: {
      I: ['Dm7|G7', '. . . . . . . . | . . . . . . . .'],
      A: ['Dm7|G7|CM7|Am7|Dm7|G7|CM7|Am7',
        'A5 - - G5 F5 - E5 - | D5 - - - . . E5 F5 | E5 - - D5 C5 - B4 - | C5 - - - . . . . |' +
        'A5 - - G5 F5 - E5 - | D5 - - - F5 - A5 - | G5 - - F5 E5 - D5 - | E5 - - - . . . .'],
      B: ['FM7|Em7|Dm7|CM7', 'C6 - B5 - A5 - G5 - | A5 - - - . . E5 G5 | G5 - F5 - E5 - D5 - | E5 - - - . . . .'],
      O: ['Dm7', 'D5 - F5 - A5 - C6 -'],
    },
  },
  {
    id: 'napnap', genre: 'lofi', title: '낮잠 자는 쿠리만쥬', composer: '먼작귀 사운드', bpm: 78, meter: 4,
    price: 0, style: 'lofi', voice: 'epiano', bass: 'sub808', drums: 'lofi', order: 'IABAO',
    jacket: 'cards/kurimanju', jc: '#4a3a2e',
    sections: {
      I: ['FM7', '. . . . . . . .'],
      A: ['FM7|Em7|Dm7|CM7|FM7|Em7|Dm7 G7|CM7',
        'E5 - - D5 C5 - - - | D5 - - C5 B4 - - - | C5 - - B4 A4 - G4 - | G4 - - - . . . . |' +
        'E5 - G5 - A5 - G5 - | F5 - E5 - D5 - E5 - | D5 - C5 - B4 - D5 - | C5 - - - . . . .'],
      B: ['Am7|Dm7|FM7|G7', 'A5 - - G5 E5 - - - | G5 - - F5 D5 - - - | F5 - - E5 C5 - - - | D5 - - - G5 - - -'],
      O: ['CM7', 'C5 - E5 - G5 - B5 -'],
    },
  },
  {
    id: 'dawncity', genre: 'lofi', title: '새벽 도시 불빛', composer: '먼작귀 사운드', bpm: 86, meter: 4,
    price: 500, style: 'lofi', voice: 'epiano', bass: 'sub808', drums: 'lofi', order: 'IABAO',
    jacket: 'cards/hachiware', jc: '#22264a',
    sections: {
      I: ['AbM7|Gm7', '. . . . . . . . | . . . . . . . .'],
      A: ['AbM7|Gm7|Fm7|Bb7|AbM7|Gm7|Fm7 Bb7|EbM7',
        'C6 - - Bb5 G5 - - - | Bb5 - - Ab5 F5 - - - | Ab5 - - G5 Eb5 - - - | F5 - - - . . . . |' +
        'C6 - - Bb5 G5 - Eb5 - | F5 - G5 - Ab5 - Bb5 - | G5 - - F5 Eb5 - D5 - | Eb5 - - - . . . .'],
      B: ['Cm7|Gm7|AbM7|Bb7', 'G5 - Ab5 - Bb5 - C6 - | Bb5 - - - G5 - - - | F5 - G5 - Ab5 - Bb5 - | G5 - - - . . . .'],
      O: ['EbM7', 'Eb5 - G5 - Bb5 - D6 -'],
    },
  },
  {
    id: 'studylofi', genre: 'lofi', title: '공부할 때 듣는 로파이', composer: '먼작귀 사운드', bpm: 80, meter: 4,
    price: 0, style: 'lofi', voice: 'epiano', bass: 'sub808', drums: 'lofi', order: 'IABAO',
    jacket: 'cards/kani', jc: '#3d3550',
    sections: {
      I: ['Am7|D7', '. . . . . . . . | . . . . . . . .'],
      A: ['Am7|D7|GM7|CM7|Am7|D7|GM7|CM7',
        'E5 - - D5 C5 - A4 - | F#5 - - E5 D5 - C5 - | B4 - - A4 G4 - B4 - | E5 - - - . . . . |' +
        'E5 - - D5 C5 - A4 - | F#5 - - E5 D5 - F#5 - | G5 - - F#5 E5 - D5 - | B4 - - - . . . .'],
      B: ['CM7|Bm7|Am7|D7', 'C5 - D5 - E5 - G5 - | F#5 - - - D5 - - - | B4 - C5 - D5 - E5 - | D5 - - - . . . .'],
      O: ['GM7', 'G5 - B5 - D6 - F#6 -'],
    },
  },
  {
    id: 'stargaze', genre: 'lofi', title: '별 보는 밤', composer: '먼작귀 사운드', bpm: 76, meter: 4,
    price: 500, style: 'lofi', voice: 'epiano', bass: 'sub808', drums: 'lofi', order: 'IABAO',
    jacket: 'cards/momonga', jc: '#1e1b45',
    sections: {
      I: ['GM7', '. . . . . . . .'],
      A: ['GM7|F#m7|Bm7|Em7|GM7|F#m7|Em7 A7|DM7',
        'B5 - - A5 F#5 - - - | A5 - - F#5 E5 - - - | F#5 - - E5 D5 - - - | E5 - - - . . . . |' +
        'B5 - - A5 F#5 - D6 - | C#6 - - B5 A5 - - - | F#5 - - E5 D5 - E5 - | D5 - - - . . . .'],
      B: ['GM7|F#m7|Em7|A7', 'D6 - C#6 - B5 - A5 - | B5 - - - F#5 - - - | A5 - G5 - F#5 - E5 - | F#5 - - - . . . .'],
      O: ['DM7', 'D5 - F#5 - A5 - C#6 -'],
    },
  },
  {
    id: 'sundaywalk', genre: 'lofi', title: '일요일 아침 산책', composer: '먼작귀 사운드', bpm: 88, meter: 4,
    price: 300, style: 'lofi', voice: 'epiano', bass: 'sub808', drums: 'lofi', order: 'IABAO',
    jacket: 'cards/chiikawa', jc: '#ffe9d6',
    sections: {
      I: ['CM7|Am7', '. . . . . . . . | . . . . . . . .'],
      A: ['CM7|Am7|Dm7|G7|CM7|Am7|Dm7 G7|CM7',
        'G5 - E5 - C5 - E5 - | A5 - - - E5 - - - | F5 - D5 - A4 - D5 - | B4 - - - . . . . |' +
        'G5 - E5 - C5 - E5 - | A5 - - - C6 - - - | B5 - A5 - G5 - F5 - | E5 - - - . . . .'],
      B: ['FM7|Em7|Dm7|G7', 'E5 - F5 - G5 - A5 - | G5 - - - E5 - - - | D5 - E5 - F5 - G5 - | G5 - - - . . . .'],
      O: ['CM7', 'C5 - E5 - G5 - B5 -'],
    },
  },
  // ---------- 먼작귀 오리지널: 록 ----------
  {
    id: 'garageband', genre: 'rock', title: '차고 밴드 결성!', composer: '먼작귀 사운드', bpm: 160, meter: 4,
    price: 0, style: 'pulse', voice: 'guitar', bass: 'oct', drums: 'rock', order: 'IACADO',
    jacket: 'cards/hachiware', jc: '#ffcf5c',
    sections: {
      I: ['Em|D', '. . . . . . . . | . . . . . . . .'],
      A: ['Em|C|G|D|Em|C|D|Em',
        'E5 - E5 - G5 - E5 - | C5 - C5 - E5 - C5 - | G5 - G5 - B5 - G5 - | D5 - D5 - F#5 - A5 - |' +
        'E5 - E5 - G5 - B5 - | C6 - B5 - A5 - G5 - | F#5 - G5 - A5 - F#5 - | E5 - - - . . . .'],
      C: ['C|D|Em|Em|C|D|C D|Em',
        'B5 - - - A5 - G5 - | A5 - - - G5 - E5 - | G5 - - - F#5 - D5 - | E5 - - - . . . . |' +
        'B5 - - - A5 - G5 - | A5 - B5 - D6 - E6 - | D6 - B5 - A5 - F#5 - | E5 - - - . . . .'],
      D: { from: 'C', shift: 2 },
      O: ['F#m', 'F#5 - - - . . . .'],
    },
  },
  {
    id: 'speedrun', genre: 'rock', title: '스피드런 (펑크 록)', composer: '먼작귀 사운드', bpm: 180, meter: 4,
    price: 1500, style: 'pulse', voice: 'guitar', bass: 'oct', drums: 'rock', order: 'IACACO',
    jacket: 'cards/usagi', jc: '#ff9d4d',
    sections: {
      I: ['A|E', '. . . . . . . . | . . . . . . . .'],
      A: ['A|D|E|A|A|D|E|A',
        'A5 A5 A5 A5 G#5 E5 - - | D5 D5 D5 D5 F#5 A5 - - | E5 E5 E5 E5 G#5 B5 - - | A5 - - - . . . . |' +
        'A5 A5 A5 A5 G#5 E5 - - | D5 D5 F#5 A5 D6 - - - | C#6 - B5 - A5 - G#5 - | A5 - - - . . . .'],
      C: ['A|D|E|E|A|D|E|A',
        'C#6 - C#6 - B5 - A5 - | D6 - D6 - C#6 - B5 - | E6 - E6 - D6 - C#6 - | B5 - - - . . . . |' +
        'C#6 - C#6 - B5 - A5 - | D6 - D6 - F#6 - E6 - | D6 - C#6 - B5 - G#5 - | A5 - - - . . . .'],
      O: ['A', 'A5 - E5 - A4 - . .'],
    },
  },
  {
    id: 'powerballad', genre: 'rock', title: '파워 발라드 (눈물의 랏코)', composer: '먼작귀 사운드', bpm: 76, meter: 4,
    price: 800, style: 'arp', voice: 'guitar', bass: 'oct', drums: 'half', order: 'IACO',
    jacket: 'cards/rakko', jc: '#c9d6e8',
    sections: {
      I: ['C', '. . . . . . . .'],
      A: ['C|G|Am|F|C|G|F|G',
        'E5 - - - D5 - C5 - | D5 - - - G4 - - - | C5 - - - B4 - A4 - | A4 - - - . . . . |' +
        'E5 - - - D5 - C5 - | D5 - - - E5 - G5 - | A5 - G5 - F5 - E5 - | D5 - - - . . . .'],
      C: ['C|F|Am|G|C|F|G|C',
        'G5 - - - E5 - G5 - | A5 - - - G5 - - - | E5 - - - D5 - C5 - | D5 - - - . . . . |' +
        'G5 - - - E5 - G5 - | C6 - - - B5 - A5 - | G5 - F5 - E5 - D5 - | C5 - - - . . . .', { drums: 'rock' }],
      O: ['C', 'C5 - G4 - C4 - . .'],
    },
  },
  {
    id: 'metalhero', genre: 'rock', title: '메탈 히어로 (기사 랏코)', composer: '먼작귀 사운드', bpm: 168, meter: 4,
    price: 2500, style: 'pulse', voice: 'guitar', bass: 'oct', drums: 'rock', order: 'IACACO',
    jacket: 'cards/rakko', jc: '#2f3440',
    sections: {
      I: ['Dm|A', '. . . . . . . . | . . . . . . . .'],
      A: ['Dm|C|Bb|A|Dm|C|Bb A|Dm',
        'D5 D5 F5 D5 A5 D5 G5 F5 | C5 C5 E5 C5 G5 C5 F5 E5 | Bb4 Bb4 D5 Bb4 F5 Bb4 E5 D5 | A4 A4 C#5 A4 E5 A4 G5 F5 |' +
        'D6 - C6 - A5 - F5 - | C6 - Bb5 - G5 - E5 - | Bb5 - A5 - G5 - E5 - | D5 - - - . . . .'],
      C: ['Dm|C|Bb|A|Dm|Gm|A|Dm',
        'A5 - - - F5 - - - | G5 - - - E5 - - - | F5 - - - D5 - - - | E5 - - - C#5 - - - |' +
        'A5 - - - F5 - - - | G5 - - - Bb5 - - - | A5 - G5 - F5 - E5 - | D5 - - - . . . .'],
      O: ['Dm', 'D5 - A4 - D4 - . .'],
    },
  },
  {
    id: 'schoolfest', genre: 'rock', title: '학교 축제 밴드', composer: '먼작귀 사운드', bpm: 150, meter: 4,
    price: 500, style: 'pulse', voice: 'guitar', bass: 'oct', drums: 'rock', order: 'IACADO',
    jacket: 'cards/chiikawa', jc: '#ffd6e6',
    sections: {
      I: ['G|D', '. . . . . . . . | . . . . . . . .'],
      A: ['G|D|Em|C|G|D|C D|G',
        'B4 - D5 - G5 - - - | A4 - D5 - F#5 - - - | B4 - E5 - G5 - - - | C5 - E5 - A5 - - - |' +
        'B4 - D5 - G5 - B5 - | A5 - G5 - F#5 - E5 - | D5 - E5 - F#5 - A5 - | G5 - - - . . . .'],
      C: ['G|D|Em|C|G|D|C D|G',
        'D6 - B5 - G5 - B5 - | C6 - A5 - F#5 - A5 - | B5 - G5 - E5 - G5 - | A5 - - - . . . . |' +
        'D6 - B5 - G5 - B5 - | C6 - A5 - F#5 - D6 - | E6 - D6 - C6 - A5 - | G5 - - - . . . .'],
      D: { from: 'C', shift: 2 },
      O: ['A', 'A5 - - - . . . .'],
    },
  },
  {
    id: 'thunderdrum', genre: 'rock', title: '천둥 드럼 (드럼 우사기)', composer: '먼작귀 사운드', bpm: 172, meter: 4,
    price: 2000, style: 'pulse', voice: 'guitar', bass: 'oct', drums: 'rock', order: 'IACACO',
    jacket: 'cards/usagi', jc: '#ffc935',
    sections: {
      I: ['F#m|C#', '. . . . . . . . | . . . . . . . .'],
      A: ['F#m|D|E|C#|F#m|D|E|F#m',
        'F#5 - F#5 F#5 A5 - F#5 - | D5 - D5 D5 F#5 - D5 - | E5 - E5 E5 G#5 - E5 - | C#5 - C#5 C#5 E5 - G#5 - |' +
        'F#5 - F#5 F#5 A5 - C#6 - | D6 - C#6 - B5 - A5 - | B5 - A5 - G#5 - E5 - | F#5 - - - . . . .'],
      C: ['F#m|D|A|E|F#m|D|E|F#m',
        'C#6 - - - A5 - C#6 - | D6 - - - B5 - D6 - | E6 - - - C#6 - B5 - | C#6 - - - . . . . |' +
        'C#6 - - - A5 - C#6 - | D6 - - - F#6 - E6 - | D6 - C#6 - B5 - G#5 - | F#5 - - - . . . .'],
      O: ['F#m', 'F#5 - C#5 - F#4 - . .'],
    },
  },
  // ---------- 먼작귀 오리지널: 재즈 · 스윙 (셋잇단 칸으로 스윙 리듬) ----------
  {
    id: 'swingcat', genre: 'jazz', title: '스윙 고양이 (12마디 블루스)', composer: '먼작귀 사운드', bpm: 150, meter: 4, sub: 3,
    price: 800, style: 'swing', voice: 'piano', bass: 'walk', drums: 'swing', order: 'IAABO',
    jacket: 'cards/momonga', jc: '#e9dcc7',
    sections: {
      I: ['F7', '. . . . . . . . . . . .'],
      A: ['F7|F7|F7|F7|Bb7|Bb7|F7|F7|C7|Bb7|F7|C7',
        'C5 - D5 F5 - D5 C5 - . . . . | F5 - F5 Eb5 - D5 C5 - . . . . | C5 - D5 F5 - D5 C5 - . . . . | A5 - G5 F5 - Eb5 C5 - . . . . |' +
        'D5 - F5 Ab5 - F5 D5 - . . . . | Bb5 - Bb5 Ab5 - F5 D5 - . . . . | C5 - D5 F5 - D5 C5 - . . . . | F5 - F5 Eb5 - D5 C5 - . . . . |' +
        'G5 - G5 E5 - C5 Bb4 - . . . . | F5 - F5 D5 - Bb4 Ab4 - . . . . | A4 - C5 F5 - A5 G5 - F5 . . . | E5 - - - - - C5 - D5 E5 - G5'],
      B: { from: 'A', shift: 5 },
      O: ['F7', 'F5 - - A5 - - C6 - - F6 - -', { shift: 5 }],
    },
  },
  {
    id: 'bigband', genre: 'jazz', title: '빅밴드 행진 (트럼펫 시사)', composer: '먼작귀 사운드', bpm: 168, meter: 4, sub: 3,
    price: 1500, style: 'swing', voice: 'brass', bass: 'walk', drums: 'swing', order: 'IACAO',
    jacket: 'cards/shisa', jc: '#ffd38a',
    sections: {
      I: ['Bb6', '. . . . . . . . . . . .'],
      A: ['Bb6|Gm7|Cm7|F7|Bb6|Gm7|Cm7 F7|Bb6',
        'D5 - F5 G5 - F5 D5 - Bb4 . . . | Bb4 - D5 F5 - G5 Bb5 - . . . . | Eb5 - G5 Bb5 - G5 Eb5 - C5 . . . | F5 - - - - - . . . F5 - G5 |' +
        'D5 - F5 G5 - F5 D5 - Bb4 . . . | Bb4 - D5 F5 - G5 Bb5 - D6 . . . | C6 - Bb5 A5 - G5 F5 - Eb5 D5 - C5 | Bb4 - - - - - . . . . . .'],
      C: ['D7|D7|G7|G7|C7|C7|F7|F7',
        'F#5 - A5 C6 - A5 F#5 - D5 . . . | C6 - A5 F#5 - D5 C5 - . . . . | B5 - D6 F6 - D6 B5 - G5 . . . | F5 - D5 B4 - G4 F4 - . . . . |' +
        'E5 - G5 Bb5 - G5 E5 - C5 . . . | Bb5 - G5 E5 - C5 Bb4 - . . . . | A5 - C6 Eb6 - C6 A5 - F5 . . . | Eb5 - C5 A4 - F4 Eb4 - . . . .'],
      O: ['Bb6', 'Bb4 - - D5 - - F5 - - Bb5 - -'],
    },
  },
  {
    id: 'bossacafe', genre: 'jazz', title: '재즈 카페 (보사노바)', composer: '먼작귀 사운드', bpm: 132, meter: 4,
    price: 500, style: 'stab', voice: 'pluck', bass: 'walk', drums: 'dembow', order: 'IABAO',
    jacket: 'cards/pajama_green', jc: '#dff0d0',
    sections: {
      I: ['CM7|Dm7', '. . . . . . . . | . . . . . . . .'],
      A: ['CM7|CM7|Dm7|G7|Em7|A7|Dm7 G7|CM7',
        'E5 - - D5 E5 - - D5 | E5 - G5 - - - . . | D5 - - C5 D5 - - C5 | D5 - F5 - - - . . |' +
        'C5 - - B4 C5 - - B4 | C5 - E5 - A5 - G5 - | F5 - E5 - D5 - C5 - | D5 - - - . . . .'],
      B: ['FM7|FM7|Fm7|Bb7|Em7|A7|Dm7 G7|CM7',
        'A5 - - G5 A5 - - G5 | A5 - C6 - - - . . | G5 - - F5 G5 - - F5 | G5 - Bb5 - - - . . |' +
        'F5 - E5 - D5 - C5 - | E5 - D5 - C5 - B4 - | D5 - C5 - B4 - G4 - | C5 - - - . . . .'],
      O: ['CM7', 'C5 - E5 - G5 - B5 -'],
    },
  },
  {
    id: 'jazzwaltz', genre: 'jazz', title: '재즈 왈츠 (공주 치이카와)', composer: '먼작귀 사운드', bpm: 132, meter: 3, sub: 3,
    price: 800, style: 'trip', voice: 'piano', bass: 'walk', order: 'IABAO',
    jacket: 'cards/chiikawa', jc: '#ffd6ea',
    sections: {
      I: ['Dm7', '. . . . . . . . .'],
      A: ['Dm7|G7|CM7|A7|Dm7|G7|CM7|CM7',
        'A5 - G5 F5 - E5 D5 - . | G5 - F5 E5 - D5 B4 - . | E5 - D5 C5 - B4 G4 - . | C#5 - E5 G5 - A5 Bb5 - . |' +
        'A5 - G5 F5 - E5 D5 - . | G5 - F5 E5 - D5 F5 - . | E5 - - D5 - C5 B4 - . | C5 - - - - - . . .'],
      B: { from: 'A', shift: 5 },
      O: ['CM7', 'C5 - - E5 - - G5 - -'],
    },
  },
  {
    id: 'nightclub', genre: 'jazz', title: '한밤의 재즈 클럽 (마이너 블루스)', composer: '먼작귀 사운드', bpm: 140, meter: 4, sub: 3,
    price: 1200, style: 'swing', voice: 'epiano', bass: 'walk', drums: 'swing', order: 'IABO',
    jacket: 'cards/pajama_purple', jc: '#2a1f3f',
    sections: {
      I: ['Cm7', '. . . . . . . . . . . .'],
      A: ['Cm7|Fm7|Cm7|Cm7|Fm7|Fm7|Cm7|Cm7|Ab7|G7|Cm7|G7',
        'G5 - Eb5 C5 - Eb5 G5 - . . . . | Bb5 - G5 F5 - Eb5 C5 - . . . . | G5 - Eb5 C5 - Eb5 G5 - Bb5 . . . | C6 - - - - - . . . . . . |' +
        'Ab5 - F5 C5 - F5 Ab5 - . . . . | C6 - Ab5 F5 - Eb5 C5 - . . . . | G5 - Eb5 C5 - Eb5 G5 - . . . . | Bb5 - G5 Eb5 - C5 Bb4 - . . . . |' +
        'Ab5 - - Gb5 - Eb5 C5 - . . . . | G5 - - F5 - D5 B4 - . . . . | C5 - Eb5 G5 - Bb5 C6 - . . . . | B5 - - - - - G5 - - . . .'],
      B: { from: 'A', bpm: 156 },
      O: ['Cm7', 'C5 - - Eb5 - - G5 - - C6 - -', { bpm: 156 }],
    },
  },
  {
    id: 'softrag', genre: 'jazz', title: '말랑 래그타임', composer: '먼작귀 사운드', bpm: 92, meter: 2, sub: 4,
    price: 500, style: 'march', voice: 'piano', bass: 'walk', drums: 'light', order: 'IABABO',
    jacket: 'cards/momonga', jc: '#efe3c8',
    sections: {
      I: ['C|G7', '. . . . . . . . | . . . . . . . .'],
      A: ['C|G7|Am|G|G7|C|G7|C',
        'E5 G5 C6 - G5 E5 C5 - | D5 F5 B5 - F5 D5 B4 - | C5 E5 A5 - E5 C5 A4 - | B4 D5 G5 - . . G4 A4 |' +
        'B4 C5 D5 E5 F5 G5 A5 B5 | C6 - G5 - E5 - C5 - | D5 - B4 - G4 - B4 - | C5 - - - . . . .'],
      B: ['F|C|Dm|C|G7|C|G7|C',
        'A5 C6 E6 - C6 A5 F5 - | G5 B5 D6 - B5 G5 E5 - | F5 A5 C6 - A5 F5 D5 - | E5 G5 C6 - . . . . |' +
        'F5 E5 D5 C5 B4 A4 G4 F4 | E4 G4 C5 E5 G5 C6 E6 - | D6 C6 B5 A5 G5 F5 E5 D5 | C5 - - - . . . .'],
      O: ['C', 'C5 - G4 - C4 - . .'],
    },
  },
];

// 요청에서 온 곡 id로 바로 찾는 표라서, 'constructor'처럼 물려받은 이름이 곡으로 보이지 않게 원형 없는 객체로 만든다
export const SONG = Object.assign(Object.create(null), Object.fromEntries(SONGS.map((s) => [s.id, s])));
export const GENRES = {
  party: '파티 · 축제', classic: '클래식', kids: '동요', folk: '민요 · 포크', carol: '캐럴',
  edm: 'EDM', kpop: 'K-POP 스타일', retro: '복고 · 트로트', phonk: '퐁크 · 힙합', chip: '칩튠', lofi: '로파이', rock: '록', jazz: '재즈 · 래그타임',
};

// 곡 검색: 제목 · 작곡가 · 장르 · 영문 id에 들어 있거나, 초성이 맞으면 (ㅋㄴ → 캐논)
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const chosung = (s) => [...s].map((c) => {
  const k = c.charCodeAt(0) - 0xac00;
  return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c;
}).join('');
export function songMatch(song, q) {
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ''), query = norm(q ?? '');
  if (!query) return true;
  const hay = norm(`${song.title}${song.composer}${GENRES[song.genre] ?? ''}${song.id}`);
  return hay.includes(query) || chosung(hay).includes(query);
}

const up = (ch, k) => (ch && k ? { ...ch, root: ch.root + k, bass: ch.bass + k } : ch);

// 곡 → 마디·멜로디 목록 (시간은 초 단위, 구간마다 템포가 바뀔 수 있음)
export function compile(song) {
  const sub = song.sub ?? 2, per = song.meter * sub;
  const bars = [], melody = [], alt = [], starts = {}, seen = {};
  let t = 0, step = 0, cur = null, acur = null, si = -1;
  for (const k of song.order) {
    const sec = song.sections[k];
    if (!sec) throw new Error(`${song.id}: 구간 ${k} 없음`);
    // si: 몇 번째 구간인지 / rep: 같은 가락(같은 구간 · from으로 빌린 구간)이 앞에서 몇 번 나왔는지 (채보 변주용)
    const from = Array.isArray(sec) ? k : sec.from, rep = (seen[from] = (seen[from] ?? -1) + 1);
    si++;
    const [chords, mel, base = {}] = Array.isArray(sec) ? sec : song.sections[sec.from];
    const opt = Array.isArray(sec) ? base : { ...base, ...sec };
    const dt = 60 / (opt.bpm ?? song.bpm) / sub, shift = opt.shift ?? 0, drums = opt.drums ?? song.drums, key = ((shift % 12) + 12) % 12;
    starts[k] ??= t;
    // alt: 멜로디가 쉬는 틈에 다른 악기가 받아 치는 가락 (소리만 · 노트로는 안 나온다). harm: 멜로디 3도 아래 화음을 같이 낼지
    const cb = chords.split('|'), mb = mel.split('|'), ab = opt.alt?.split('|');
    if (cb.length !== mb.length || (ab && ab.length !== cb.length)) throw new Error(`${song.id}/${k}: 코드 ${cb.length}마디, 멜로디 ${mb.length}마디${ab ? `, 받는 가락 ${ab.length}마디` : ''}`);
    acur = null;
    cb.forEach((c, i) => {
      const tokens = mb[i].trim().split(/\s+/), at = ab?.[i].trim().split(/\s+/);
      if (tokens.length !== per || (at && at.length !== per)) throw new Error(`${song.id}/${k} ${i + 1}마디: ${tokens.length}칸${at ? ` · 받는 가락 ${at.length}칸` : ''} (필요 ${per}칸)`);
      bars.push({ t, dt, chords: c.trim().split(/\s+/).map((n) => up(chord(n), key)), key: k, first: i === 0, last: i === cb.length - 1, drums, shift, harm: opt.harm ?? Boolean(song.harm) });
      at?.forEach((tk, j) => {
        if (tk === '-') { if (acur) acur.dur += dt; }
        else if (tk === '.') acur = null;
        else alt.push(acur = { t: t + j * dt, dur: dt, midi: midi(tk) + shift });
      });
      for (const tk of tokens) {
        if (tk === '-') { if (cur) { cur.dur += dt; cur.steps++; } }
        else if (tk === '.') cur = null;
        else melody.push(cur = { t, dur: dt, steps: 1, step, midi: midi(tk) + shift, si, rep, bar: bars.length - 1 });
        t += dt;
        step++;
      }
    });
  }
  bars.at(-1).end = true;
  return { per, sub, bars, melody, alt, starts, duration: t };
}

// 난이도별 노트 간격 하한(초). easy · normal은 예전 채보와 똑같이 나오도록 맞춘 값
const GAP = { easy: 0.28, normal: 0.14, hard: 0.1, expert: 0.075, master: 0.065, extreme: 0.065, inferno: 0.06, chaos: 0.06 };
// 반주 노트 채우기. beat: 박마다(롱노트를 누르는 동안엔 안 넣음) / slow: 칸 길이가 이보다 긴(느린) 마디는 반 칸까지 / pair: 박 위 반주에도 동시치기
const FILL = {
  expert: { beat: true },
  master: { slow: Infinity },
  extreme: { slow: 0.28 },
  inferno: { slow: 0.28, pair: 'beat' },
  chaos: { slow: 0.28, pair: 'beat' },
};
// MASTER 위 3단계는 노트를 덜 빽빽하게 하는 대신 곡 자체를 빠르게 (음악도 같이 빨라진다)
export const SPEED = { extreme: 1.1, inferno: 1.15, chaos: 1.25 };
const FAST = new Map();
// 실제로 연주되는 곡 (빠른 난이도면 빨라진 판)
export function playSong(song, diff) {
  const sp = SPEED[diff];
  if (!sp) return song;
  const k = `${song.id}@${diff}`, faster = (o) => (o?.bpm ? { ...o, bpm: o.bpm * sp } : o);
  if (!FAST.has(k)) {
    FAST.set(k, { ...song, id: k, bpm: song.bpm * sp,
      sections: Object.fromEntries(Object.entries(song.sections).map(([key, sec]) => [key, Array.isArray(sec) ? [sec[0], sec[1], faster(sec[2])] : faster(sec)])) });
  }
  return FAST.get(k);
}

// 멜로디 → 노트. 음이 올라가면 오른쪽, 내려가면 왼쪽 칸으로. 같은 곡 · 난이도면 언제나 같은 채보 (씨앗 난수)
// easy: 박 위 음만 / normal: 모든 음 + 두 마디마다 동시치기 / hard: 마디마다 동시치기 / expert: 반 마디마다 + 박마다 반주 노트
// master: 박마다 동시치기 + 빈 칸마다 반주 노트 / extreme: + 느린 곡은 반 칸까지 · 1.1배 빠르게
// inferno: + 박 위 반주도 동시치기 · 1.15배 / chaos: 모든 음 동시치기 · 1.25배
// 질리지 않게: 같은 가락이 다시 나오면 레인을 뒤집거나 밀어서 다른 모양으로 · 칸 끝에서 넘어가거나 튕기기를 구간마다 바꾸기
//             · 빠른 같은 음 연타는 옆 칸과 번갈아(트릴) · 동시치기 짝과 반주 노트 자리를 골고루
const LANE_TF = [(l) => l, (l) => 3 - l, (l) => (l + 1) % 4, (l) => (l + 3) % 4, (l) => (l + 2) % 4, (l) => [1, 0, 3, 2][l], (l) => [2, 3, 0, 1][l]];
const bounce = (l, d) => {
  let x = l + d;
  if (x > 3) x = 6 - x;
  if (x < 0) x = -x;
  return Math.max(0, Math.min(3, x));
};
// 칸 c를 붙이면 끝이 두 칸만 오가는 트릴(…ABAB + A)로 몇 개째인지
function trillLen(h, c) {
  const k = h.length;
  if (!k || h[k - 1] === c) return 1;
  let m = 2;
  while (k - m >= 0 && h[k - m] === (m % 2 ? h[k - 1] : c)) m++;
  return m;
}
// 칸 c를 붙이면 끝의 p개짜리 모양이 r번 연달아 똑같이 나오는지
function repeats(h, c, p, r) {
  if (h.length < p * r - 1) return false;
  const s = [...h.slice(-(p * r - 1)), c];
  for (let i = p; i < s.length; i++) if (s[i] !== s[i - p]) return false;
  return true;
}
const COUNT = new Map(); // 곡:난이도 → 노트 수
const countOf = (song, diff) => COUNT.get(`${song.id}:${diff}`) ?? makeChart(song, diff).tiles.length;
export function makeChart(song, diff, thin = true) {
  const { melody, per, sub, bars } = compile(song), sp = SPEED[diff] ?? 1, di = DIFFS.indexOf(diff);
  // W: 같은 칸을 이 시간(빨라진 곡 기준 초) 안에 또 치지 않게. 어려운 난이도일수록 조금 짧게 허용
  const rnd = seeded(hashStr(`${song.id}:${diff}`)), W = ({ master: 0.16, extreme: 0.15, inferno: 0.14, chaos: 0.13 }[diff] ?? 0.2) * sp;
  const gap = GAP[diff], dbl = { normal: per * 2, hard: per, expert: per / 2, master: sub, extreme: sub, inferno: sub, chaos: 1 }[diff];
  // 마디마다 가락 모양: 음 높이가 아니라 오르내림 · 박자로 본다 (한 음씩 올려 되풀이하는 가락도 같은 모양으로 쳐서 레인 모양을 바꾼다)
  const sig = new Map(), head = new Map(), span = new Map();
  for (const n of melody) {
    const b = Math.floor(n.step / per), r = span.get(b >> 1);
    if (!head.has(b)) head.set(b, n.midi);
    sig.set(b, `${sig.get(b) ?? ''}${n.step % per}:${n.midi - head.get(b)},`);
    span.set(b >> 1, r ? [Math.min(r[0], n.midi), Math.max(r[1], n.midi)] : [n.midi, n.midi]); // 구절(두 마디)의 가장 낮은 · 높은 음
  }
  const mel = [], hist = [], TR = di < 2 ? 4 : 6; // hist: 지금까지 멜로디 레인 / TR: 두 칸만 오가는 트릴 최대 길이
  let base = 1, prev = null, lastT = -1, si = -1, tf = LANE_TF[0], wrap = true, lastTf = 0, trill = 1, accent = false;
  let bar = -1, btf = LANE_TF[0], lastB = 0, run = 0, dir = 0, used = new Map(), phrase = -1, mode = -1, roll = 1;
  for (const n of melody) {
    if (n.si !== si) {
      // 새 구간 첫 노트는 동시치기로 '쾅' (드롭 · 후렴이 시작되는 느낌, HARD부터)
      accent = si >= 0 && di >= 2;
      si = n.si;
      used = new Map(); // 이 구간에서 나온 마디 가락 → 마지막에 쓴 레인 모양
      // 처음 나오는 가락은 그대로, 반복이면 바로 앞 구간과 다른 모양으로
      let k = 0;
      if (n.rep) do k = 1 + Math.floor(rnd() * (LANE_TF.length - 1)); while (k === lastTf);
      tf = LANE_TF[k];
      lastTf = k;
      wrap = rnd() < 0.5;
    }
    const b = Math.floor(n.step / per);
    if (b !== bar) {
      // 이 구간에서 같은 가락의 마디가 앞에 있었으면 (붙어 있든 떨어져 있든) 그때와 다른 레인 모양으로
      const before = used.get(sig.get(b));
      let k = 0;
      if (before !== undefined) do k = Math.floor(rnd() * LANE_TF.length); while (k === before || k === lastB);
      used.set(sig.get(b), k);
      btf = LANE_TF[k];
      lastB = k;
      bar = b;
    }
    // 구절(두 마디)마다 노트가 움직이는 방식을 바꾼다 (곡마다 · 구절마다 손 모양이 달라지게)
    // 0 가락 따라 한 칸씩(크게 뛰면 두 칸) · 1 넓게 건너뛰기 · 2 한쪽으로 쓸어 가기 · 3 음 높이대로 자리 잡기
    if (b >> 1 !== phrase) {
      phrase = b >> 1;
      const last = mode;
      do mode = [0, 0, 1, 2, 3, 3][Math.floor(rnd() * 6)]; while (mode === last);
      roll = rnd() < 0.5 ? 1 : -1;
    }
    if (prev && n.midi !== prev.midi) {
      const big = Math.abs(n.midi - prev.midi) > 4, [lo, hi] = span.get(phrase);
      let step = mode === 2 ? roll : Math.sign(n.midi - prev.midi) * ((mode === 1) !== big ? 2 : 1);
      run = Math.sign(step) === dir ? run + 1 : 1;
      dir = Math.sign(step);
      if (run > 4) { // 한 방향 계단이 길어지면 한 번 꺾는다
        step = -step;
        dir = -dir;
        run = 1;
        roll = -roll;
      }
      base = mode === 3 && hi > lo ? Math.round((3 * (n.midi - lo)) / (hi - lo)) : wrap ? (base + step + 4) % 4 : bounce(base, step);
      if (mode === 2 && !wrap) roll = base === 3 ? -1 : base === 0 ? 1 : roll; // 끝에 닿으면 돌아온다
    } else if (prev && di >= 1 && n.t - (prev.t + prev.dur) < 0.3) {
      // 같은 음이 쉼 없이 이어지면 (롱노트 끝 포함) 한 칸 연타(잭) 대신 옆 칸과 번갈아 (트릴)
      base = bounce(base, trill);
      trill = -trill;
    }
    prev = n;
    if ((diff === 'easy' && n.step % 2) || n.t - lastT < gap - 1e-6) continue;
    let lane = btf(tf(base));
    // 똑같은 모양이 이어지지 않게: 같은 칸 연타(빠르면 한 번도 · 느려도 세 번은 안 됨) · 긴 트릴 · 같은 3 ~ 4개 모양 세 번 · 같은 8개 모양 두 번
    const quick = n.t - lastT < W;
    const dull = (c) => (hist.length > 0 && c === hist.at(-1) && (quick || c === hist.at(-2)))
      || trillLen(hist, c) > TR || repeats(hist, c, 3, 3) || repeats(hist, c, 4, 3) || repeats(hist, c, 8, 2);
    if (dull(lane)) {
      const ok = [0, 1, 2, 3].filter((c) => !dull(c)).sort((x, y) => Math.abs(x - lane) - Math.abs(y - lane)); // 원래 자리에서 가까운 칸부터
      if (ok.length) lane = ok[Math.floor(rnd() * Math.min(2, ok.length))];
      else if (quick && lane === hist.at(-1)) lane = bounce(lane, rnd() < 0.5 ? 1 : -1);
    }
    hist.push(lane);
    lastT = n.t;
    // CHAOS: 아주 빠른 음이 이어질 때 모든 음을 동시치기로 하면 두 손이 같은 모양만 번갈아 치게 된다 → 빠른 음은 하나 건너 하나만 동시치기
    const pair = (Boolean(dbl && n.step % dbl === 0) && !(thin && diff === 'chaos' && quick && mel.at(-1)?.pair)) || accent;
    mel.push({ t: n.t, dur: n.dur, lane, midi: n.midi, hold: n.steps >= 3 && n.dur >= 0.5, pair });
    accent = false;
  }
  // 동시치기 짝: 쉬운 난이도는 멀리(두 손), 어려운 난이도는 아무 칸이나. 앞뒤 W초 안의 노트 · 끝나는 롱노트와 같은 칸은 피한다
  const tiles = [];
  for (let i = 0; i < mel.length; i++) {
    const n = mel[i];
    tiles.push(n);
    if (!n.pair) continue;
    const banOf = (w) => {
      const ban = new Set([n.lane]);
      for (const m of tiles) if (m !== n && (n.t - m.t < w || (m.hold && m.t + m.dur > n.t - w))) ban.add(m.lane);
      for (let j = i + 1; j < mel.length && mel[j].t - n.t < w; j++) ban.add(mel[j].lane);
      return ban;
    };
    let ban = banOf(W);
    if (ban.size === 4) ban = banOf(W * 0.7); // 빽빽해서 자리가 없으면 조금 너그럽게
    const any = [0, 1, 2, 3].filter((l) => !ban.has(l)), far = any.filter((l) => Math.abs(l - n.lane) >= 2);
    const pool = (di < 4 || rnd() < 0.5) && far.length ? far : any;
    if (pool.length) tiles.push({ t: n.t, dur: Math.min(n.dur, 0.3), lane: pool[Math.floor(rnd() * pool.length)], midi: n.midi - 12, hold: false });
  }
  if (FILL[diff]) fill(tiles, bars, per, sub, FILL[diff], gap, rnd, W);
  // 어려운 난이도가 바로 아래 난이도보다 노트가 적으면 안 된다: 모자라면 자리가 없어 비워 둔 칸을 조금 너그럽게 채운다
  const need = di > 0 && FILL[diff] ? countOf(song, DIFFS[di - 1]) - tiles.length : 0;
  if (need > 0) fill(tiles, bars, per, sub, { ...FILL[diff], max: need }, gap, rnd, W * 0.5);
  if (thin && diff === 'chaos' && tiles.length < countOf(song, DIFFS[di - 1])) return makeChart(song, diff, false); // 그래도 모자라면 예전처럼 모든 음을 동시치기로
  COUNT.set(`${song.id}:${diff}`, tiles.length);
  for (const n of tiles) delete n.pair;
  tiles.sort((a, b) => a.t - b.t || a.lane - b.lane);
  if (sp !== 1) for (const n of tiles) { n.t /= sp; n.dur /= sp; } // 빨라진 곡 시간에 맞춘다
  return { tiles };
}

// 멜로디가 쉬거나 길게 끄는 칸에 반주(코드) 박자 노트를 끼워 넣는다. 롱노트를 누르는 동안엔 그 레인을 피하고, 앞뒤 W초 안의 노트와 같은 칸도 피한다
function fill(tiles, bars, per, sub, opt, gap, rnd, W) {
  const first = Math.min(...tiles.map((n) => n.t)), last = Math.max(...tiles.map((n) => n.t)), n0 = tiles.length;
  for (const bar of bars) {
    if (!bar.chords[0]) continue;
    const step = opt.beat ? sub : bar.dt > opt.slow ? 0.5 : 1;
    for (let s = 0; s < per; s += step) {
      if (tiles.length - n0 >= (opt.max ?? Infinity)) return; // 모자란 만큼만 더 채울 때
      const t = bar.t + s * bar.dt;
      if (t <= first || t >= last || tiles.some((n) => Math.abs(n.t - t) < gap)) continue;
      const held = tiles.filter((n) => n.hold && t > n.t - 0.01 && t < n.t + n.dur + 0.05).map((n) => n.lane);
      if (opt.beat && held.length) continue;
      const banOf = (w) => {
        const ban = new Set(held);
        for (const n of tiles) if (Math.abs(n.t - t) < w) ban.add(n.lane);
        return ban;
      };
      let ban = banOf(W);
      if (ban.size === 4) ban = banOf(W * 0.7);
      const lanes = [0, 1, 2, 3].filter((l) => !ban.has(l));
      if (!lanes.length) continue;
      const lane = lanes[Math.floor(rnd() * lanes.length)];
      tiles.push({ t, dur: bar.dt * step, lane, midi: 0, hold: false, fill: true });
      const others = lanes.filter((l) => l !== lane);
      if (opt.pair === 'beat' && s % sub === 0 && others.length) {
        tiles.push({ t, dur: bar.dt * step, lane: others[Math.floor(rnd() * others.length)], midi: 0, hold: false, fill: true });
      }
    }
  }
}

// 노트 밀도(초당 노트 수)로 레벨 계산. 12 위로는 완만하게 올라간다 (MASTER는 대략 10~16, CHAOS는 20 안팎)
// MASTER 위 난이도는 노트가 항상 더 많으니 바로 아래 난이도보다 최소 1 높게 보여 준다
const LV = new Map();
export function chartLevel(song, diff) {
  const k = `${song.id}:${diff}`;
  if (!LV.has(k)) {
    const { tiles } = makeChart(song, diff), span = Math.max(1, (tiles.at(-1)?.t ?? 0) - (tiles[0]?.t ?? 0));
    const dbl = tiles.filter((n, i) => i && n.t === tiles[i - 1].t).length;
    const v = ((tiles.length + dbl * 0.5) / span) * 1.45, i = DIFFS.indexOf(diff);
    const lv = Math.round(v <= 12 ? v : 12 + (v - 12) * 0.45);
    LV.set(k, Math.max(1, Math.min(30, i > 4 ? Math.max(lv, chartLevel(song, DIFFS[i - 1]) + 1) : lv)));
  }
  return LV.get(k);
}

export const fmtTime = (sec) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
