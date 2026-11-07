// 게임 규칙 (브라우저 · 서버 공용)
// 캐릭터 · 등급(초월까지 6등급) · 친구 레벨(같은 친구 카드를 모아 레벨 업, 최대 20) · 카드 점수 · 시너지 · 뽑기 배너 · 상점(환전)
// 업적(트랙 · 단계, 5만 개 이상) · 월간 출석 · 일일 미션 · 접속 보상 · 플레이 보상 · 플레이어 레벨(1~1000) · 프로필 테두리 · 레벨 혜택
// 멀티(아이템 노트 · 공격) · 친구 선물
// act()가 모든 재화 변동을 처리한다. 로그인 유저는 서버가 act()를 돌려 저장하고, 게스트는 브라우저가 같은 act()를 돌려 기기에 저장한다.
import { SONGS, SONG, DIFFS, DIFF_NAME, seeded, hashStr } from './songs.js';

export const VERSION = '4.2.1'; // 사이트 맨 아래에 보이는 버전 (공지사항과 맞춰서 올린다)
export const MAX_LEVEL = 20; // 친구(캐릭터) 최고 레벨
export const MAX_LV = 1000; // 플레이어 최고 레벨
export const FREE_AVATARS = 12;
export const AVATAR_PRICE = 300; // 코인
export const RENAME_COINS = 100000; // 닉네임을 바꿀 때마다
export const RANKS = ['S', 'A', 'B', 'C', 'D'];

// 문의하기 주제 (유저 화면 · 서버 · 관리자 페이지 공용)
export const INQUIRY = { song: '노래 신청', bug: '오류 신고', idea: '건의 · 제안', reward: '보상 · 재화', account: '계정 · 닉네임', report: '유저 신고', etc: '기타' };

/* ---------- 멀티플레이 ---------- */

// 한 방 최대 10명 · 공격은 연주 중에 나오는 아이템 노트를 치면 1번 충전 (최대 3번 모아 두기) · 공격은 5초
// 30분 동안 연주가 없으면 방이 닫힌다 · 판이 끝나면 1등이 방장
export const MP = { max: 10, maxCharges: 3, attackMs: 5000, idleMin: 30, itemGap: 6.5 };
export const ATTACKS = {
  fog: { name: '먹구름', icon: '☁️', desc: '위쪽 화면을 구름으로 가려요' },
  shake: { name: '어질어질', icon: '🌀', desc: '화면이 빙글빙글 흔들려요' },
  speed: { name: '번개 속도', icon: '⚡', desc: '노트가 훨씬 빨리 내려와요' },
  bomb: { name: '폭탄', icon: '💣', desc: '펑! 판정선 근처 노트가 연기에 가려요' },
};
export const ATTACK_KINDS = Object.keys(ATTACKS);

// 아이템 노트: 같은 곡 · 난이도 · 판 번호면 모두 같은 노트가 같은 아이템이 된다 (공평하게).
// 롱노트 · 동시치기 · 반주 노트는 빼고, 약 itemGap초마다 하나
export function itemize(tiles, key) {
  const rnd = seeded(hashStr(String(key))), out = tiles.map((n) => ({ ...n }));
  let next = 3 + rnd() * 3;
  for (let i = 0; i < out.length; i++) {
    const n = out[i];
    if (n.t < next || n.hold || n.fill || out[i - 1]?.t === n.t || out[i + 1]?.t === n.t) continue;
    n.item = ATTACK_KINDS[Math.floor(rnd() * ATTACK_KINDS.length)];
    next = n.t + MP.itemGap * (0.7 + rnd() * 0.6);
  }
  return out;
}

// 멀티 순위: 연주 점수(정확도) 높은 순, 같으면 앞자리 순. players: [{ id, seat, raw }]
export const mpOrder = (players) => [...players].sort((a, b) => b.raw - a.raw || a.seat - b.seat);
// 공격 목표: 고른 사람이 아직 연주 중이면 그 사람, 아니면 바로 위 순위 (내가 1등이면 2등). done: 이미 끝낸 사람
export function mpTarget(players, me, picked) {
  const live = players.filter((p) => p.id !== me && !p.done);
  if (live.some((p) => p.id === picked)) return picked;
  const order = mpOrder(players), i = order.findIndex((p) => p.id === me);
  return (order.slice(0, Math.max(0, i)).reverse().find((p) => live.includes(p)) ?? order.find((p) => live.includes(p)))?.id ?? 0;
}

/* ---------- 멀티 AI: 방장이 빈 자리에 넣는다. 판마다 같은 열쇠(곡:난이도:판)로 정해진 실력대로 연주해서 서버 · 화면이 같은 값을 본다 ---------- */

export const BOT_SKILL = {
  easy: { name: '쉬움', acc: 0.72, jit: 0.05, keep: 0.2, atk: 1 },
  normal: { name: '보통', acc: 0.85, jit: 0.04, keep: 0.4, atk: 2 },
  hard: { name: '어려움', acc: 0.93, jit: 0.025, keep: 0.65, atk: 3 },
  pro: { name: '고수', acc: 0.975, jit: 0.015, keep: 0.9, atk: 4 },
};
export const BOT_HIT = 0.02; // AI가 공격을 한 번 맞을 때마다 정확도 -2%
const BOT_NAMES = ['하치와레', '치이카와', '우사기', '모몬가', '쿠리만쥬', '시사', '랏코', '오데코', '고블린', '포셰트'];
export const botRank = (raw) => (raw >= 950000 ? 'S' : raw >= 850000 ? 'A' : raw >= 700000 ? 'B' : raw >= 500000 ? 'C' : 'D');
export const makeBot = (seat, skill) => ({
  id: -(seat + 1), seat, skill, name: `${BOT_NAMES[seat % BOT_NAMES.length]} AI`, avatar: 1 + ((seat * 7) % 32),
  lv: { easy: 10, normal: 80, hard: 300, pro: 800 }[skill] ?? 80, frame: 0, total: 0, wins: 0, plays: 0, last: null,
});
// t: 판 시작 뒤 지난 ms · dur: 곡 길이 ms · notes: 노트 수 · hits: 이 판에 맞은 공격 수 → { state, result(끝났으면) }
export function botPlay(bot, key, t, dur, notes, hits = 0) {
  const k = BOT_SKILL[bot.skill] ?? BOT_SKILL.normal, rnd = seeded(hashStr(`bot:${key}:${bot.id}`));
  const acc = Math.max(0.3, Math.min(1, k.acc + (rnd() * 2 - 1) * k.jit - hits * BOT_HIT));
  const p = Math.max(0, Math.min(1, t / dur)), final = Math.round(acc * 1e6);
  const best = Math.max(1, Math.min(notes, Math.round(notes * Math.min(1, k.keep * (0.75 + 0.5 * rnd()))))), seen = Math.round(notes * p);
  const state = { raw: Math.round(final * p), combo: seen % (best + 1), max: Math.min(best, seen), bot: true };
  const result = p >= 1 ? { raw: final, rank: botRank(final), combo: best, fc: best >= notes, cleared: acc >= 0.6, bot: true } : null;
  return { state, result };
}
// AI 공격 계획: [{ at(ms), to, kind }] — 사람에게만, 곡의 15~90% 사이
export function botAttacks(bot, key, dur, humans) {
  if (!humans.length) return [];
  const k = BOT_SKILL[bot.skill] ?? BOT_SKILL.normal, rnd = seeded(hashStr(`botatk:${key}:${bot.id}`));
  return Array.from({ length: k.atk }, () => ({
    at: Math.round(dur * (0.15 + 0.75 * rnd())), to: humans[Math.floor(rnd() * humans.length)], kind: ATTACK_KINDS[Math.floor(rnd() * ATTACK_KINDS.length)], from: bot.id,
  })).sort((a, b) => a.at - b.at);
}

/* ---------- 등급 · 캐릭터 ---------- */

// power: 1레벨 카드 점수 / refund: 최고 레벨까지 쓸 카드가 다 모였는데 또 나오면 돌려받는 보석
export const RARITY = {
  1: { name: '일반', color: '#5cc290', power: 100, refund: 10 },
  2: { name: '희귀', color: '#4aa3f0', power: 180, refund: 30 },
  3: { name: '영웅', color: '#a066f0', power: 320, refund: 80 },
  4: { name: '전설', color: '#ffa800', power: 560, refund: 200 },
  5: { name: '신화', color: '#ff3d6e', power: 1000, refund: 500 },
  6: { name: '초월', color: '#1b1030', power: 12000, refund: 50000 },
};
export const RARITIES = [1, 2, 3, 4, 5, 6];
export const TOP = 6; // 가장 높은 등급

export const BUFFS = {
  score: (v) => `점수 +${v}%`,
  hp: (v) => `최대 체력 +${v}`,
  guard: (v) => `실수 피해 -${v}%`,
  heal: (v) => `20콤보마다 체력 +${v}`,
  window: (v) => `판정 범위 +${v}ms`,
  coin: (v) => `코인 +${v}%`,
  exp: (v) => `경험치 +${v}%`,
  revive: (v) => `쓰러지면 체력 ${v}%로 부활`,
  god: (v) => `신의 힘: 점수 +${v}% · 판정 +${Math.round(v / 4)}ms · 모든 능력 강화`,
};
const CAP = { guard: 70, window: 30, revive: 90 };
const GOD_CAP = { guard: 95, window: 60, revive: 100 }; // 초월 친구가 팀에 있으면 한계가 확 풀린다
const GOD_SCORE = 600; // 점수 한계는 초월 팀에만 (일반 팀은 전부 20레벨이어도 +339%). 기록 형식 한계(1e7)를 넘지 않게 하는 값이고, 부스터는 그 위에 더한다

// values: [1레벨, 5레벨] 버프 수치. 6~20레벨은 같은 기울기로 계속 오른다 / voice: [목소리 음높이(미디), 음색]
// img: 그림을 빌려 쓰는 원래 캐릭터 / badge: 의상 표시 / fx: 카드 배경 · 색감 테마 (style.css의 .fx-*) / card: 카드 그림을 따로 쓸 때
const C = (id, name, rarity, color, buff, values, voice, lines, more = {}) => ({ id, name, rarity, color, buff, values, voice, lines, ...more });
export const CHARS = [
  // 원래 친구들
  C('hachiware', '하치와레', 2, '#86c5ff', 'score', [6, 15], [67, 'triangle'], ['어떻게든 돼라~!', '같이 하면 하나도 안 무서워!', '오늘도 신나게 가 보자!']),
  C('chiikawa', '치이카와', 2, '#ffb3cf', 'heal', [2, 5], [77, 'sine'], ['와…!', '흐에… 할 수 있어…!', '해냈다…!']),
  C('usagi', '우사기', 2, '#ffd35c', 'window', [8, 18], [82, 'square'], ['우라!', '야하!', '하아?', '후웅~']),
  C('rakko', '랏코', 2, '#eadbbd', 'score', [4, 9], [48, 'triangle'], ['…좋은 리듬이다.', '단련이 부족하군.', '따라와라.']),
  C('momonga', '모몽가', 1, '#b9c6ee', 'window', [4, 12], [80, 'triangle'], ['귀여운 나를 봐!', '칭찬해 줘!', '흥, 내가 최고야!']),
  C('kurimanju', '쿠리만쥬', 1, '#f2c48a', 'hp', [10, 30], [52, 'sine'], ['하아~ 좋다…', '푸하~!', '천천히 즐기자…']),
  C('shisa', '시사', 1, '#ffb36b', 'guard', [8, 22], [72, 'sine'], ['열심히 할게요~!', '와아, 대단해요~!', '시사도 노력하는 거예요~!']),
  C('kani', '카니', 1, '#ff9fc4', 'heal', [1, 3], [70, 'square'], ['집게 박수! 짝짝!', '옆으로 옆으로~', '카니카니~!']),
  C('tiha', '티하', 1, '#7f9a9a', 'coin', [5, 15], [86, 'sine'], ['티하티하~', '반짝반짝 줄게!', '코인 냄새가 나!']),
  C('labor_armor', '노동 갑옷 씨', 3, '#c4b8ac', 'revive', [30, 55], [55, 'square'], ['일하는 건 즐거워!', '땀 흘린 만큼 보람차!', '쓰러져도 다시 일어나!']),
  C('pochette_armor', '포쉐트 갑옷 씨', 3, '#d8cfe6', 'heal', [3, 8], [60, 'triangle'], ['포쉐트 안에 간식 있어!', '같이 먹을래?', '냠냠, 힘이 난다!']),
  C('ramen_armor', '라멘 갑옷 씨', 3, '#e3c95a', 'score', [8, 20], [57, 'sawtooth'], ['라멘 한 그릇 어때?', '국물까지 완벽하게!', '뜨끈하게 가자!']),
  C('pajama_green', '파자마 초록이', 4, '#8fe0a0', 'score', [10, 22], [74, 'triangle'], ['파자마 파티 시작이야!', '초록이 등장!', '밤새 놀자~!']),
  C('pajama_pink', '파자마 빨강이', 4, '#ff8f9f', 'hp', [30, 70], [78, 'square'], ['빨강이 파워!', '절대 안 져!', '끝까지 가 보자!']),
  C('pajama_purple', '파자마 보라', 4, '#c3a6ff', 'coin', [15, 40], [68, 'sawtooth'], ['보라는 부자야~', '코인 와르르!', '후후, 계산 끝!']),
  C('pajama_white', '파자마 하양이', 4, '#e6e6f2', 'guard', [20, 40], [72, 'sine'], ['하양이가 지켜 줄게.', '괜찮아, 천천히.', '포근포근~']),
  // 무대 의상 (밴드 · 오케스트라)
  C('violin_kurimanju', '바이올린 쿠리만쥬', 2, '#e8b27a', 'hp', [18, 40], [55, 'sawtooth'], ['하아~ 선율이 좋다…', '바이올린 한 곡…', '푸하~ 브라보!'], { img: 'kurimanju', badge: '🎻', fx: 'music' }),
  C('trumpet_shisa', '트럼펫 시사', 2, '#ff9d4d', 'guard', [12, 28], [74, 'sawtooth'], ['빰빠라밤~!', '시사 나팔 출동이에요~!', '힘차게 불어요~!'], { img: 'shisa', badge: '🎺', fx: 'music' }),
  C('conductor_kani', '지휘자 카니', 2, '#ff86b5', 'heal', [2, 4], [69, 'triangle'], ['자, 다 같이!', '박자를 맞춰~!', '집게 지휘 시작!'], { img: 'kani', badge: '🪄', fx: 'music' }),
  C('vocal_chiikawa', '보컬 치이카와', 3, '#ff9ec4', 'heal', [3, 7], [79, 'sine'], ['라라라…♪', '노래… 해 볼게…!', '와…! 박수…!'], { img: 'chiikawa', badge: '🎤', fx: 'music' }),
  C('guitar_hachiware', '기타 하치와레', 3, '#6fb5ff', 'score', [9, 18], [65, 'sawtooth'], ['기타 소리 들려?', '어떻게든 돼라~ 쾅!', '한 곡 더!'], { img: 'hachiware', badge: '🎸', fx: 'music' }),
  C('drum_usagi', '드럼 우사기', 3, '#ffc935', 'window', [10, 20], [84, 'square'], ['우라! 쿵쿵따!', '야하! 비트 업!', '하아? 더 빠르게!'], { img: 'usagi', badge: '🥁', fx: 'music' }),
  C('dj_momonga', 'DJ 모몽가', 3, '#a3b4f0', 'exp', [15, 35], [81, 'square'], ['DJ 모몽가 등장!', '볼륨 업! 귀여움 업!', '다들 나만 봐!'], { img: 'momonga', badge: '🎧', fx: 'music' }),
  C('piano_rakko', '피아니스트 랏코', 4, '#f0dcae', 'score', [12, 24], [50, 'triangle'], ['…피아노도 단련이다.', '건반 위의 사냥꾼.', '완벽한 연주를 보여 주지.'], { img: 'rakko', badge: '🎹', fx: 'music' }),
  C('idol_pajama', '아이돌 빨강이', 4, '#ff7fa3', 'score', [12, 24], [80, 'square'], ['다들 응원해 줘!', '센터는 나야!', '사랑해요 여러분~!'], { img: 'pajama_pink', badge: '🎀', fx: 'idol' }),
  // 계절 · 테마 의상
  C('sakura_momonga', '벚꽃 모몽가', 1, '#ffc4da', 'exp', [5, 12], [80, 'sine'], ['벚꽃보다 내가 더 귀엽지?', '꽃잎 샤워~!', '봄이 왔어!'], { img: 'momonga', badge: '🌸', fx: 'sakura' }),
  C('watermelon_kani', '수박 카니', 1, '#7fd88f', 'hp', [12, 30], [70, 'square'], ['수박 한 조각 먹을래?', '시원하다~!', '여름엔 수박이지!'], { img: 'kani', badge: '🍉', fx: 'summer' }),
  C('sakura_chiikawa', '벚꽃 치이카와', 2, '#ffb7d2', 'heal', [2, 5], [77, 'sine'], ['꽃이… 예뻐…!', '와… 벚꽃…!', '봄바람…'], { img: 'chiikawa', badge: '🌸', fx: 'sakura' }),
  C('ghost_tiha', '유령 티하', 2, '#c9d6e8', 'guard', [10, 24], [88, 'sine'], ['우~ 놀랐지?', '티하티하… 유령이야~', '깜짝!'], { img: 'tiha', badge: '👻', fx: 'ghost' }),
  C('rudolph_shisa', '루돌프 시사', 2, '#ff6b6b', 'coin', [8, 20], [72, 'triangle'], ['빨간 코가 반짝~!', '썰매 끌어요~!', '메리 크리스마스예요~!'], { img: 'shisa', badge: '🦌', fx: 'xmas' }),
  C('pudding_momonga', '푸딩 모몽가', 2, '#ffd98a', 'hp', [15, 36], [79, 'triangle'], ['말랑말랑 푸딩 모몽가!', '한 입만 줄게…', '달콤해!'], { img: 'momonga', badge: '🍮', fx: 'dessert' }),
  C('gamer_momonga', '게이머 모몽가', 2, '#8ad1ff', 'window', [6, 14], [81, 'square'], ['콤보 신기록 간다!', '이 정도는 쉽지!', '게임은 내가 최고야!'], { img: 'momonga', badge: '🎮', fx: 'gamer' }),
  C('librarian_kani', '사서 카니', 2, '#c7a6ff', 'exp', [8, 20], [70, 'sine'], ['조용히… 책 읽어요.', '이 책 추천해요!', '지식이 쑥쑥!'], { img: 'kani', badge: '📚', fx: 'book' }),
  C('chef_kurimanju', '요리사 쿠리만쥬', 2, '#ffcf8a', 'heal', [2, 5], [53, 'triangle'], ['오늘의 요리는…!', '푸하~ 맛있다!', '간이 딱 좋아…'], { img: 'kurimanju', badge: '🍳', fx: 'chef' }),
  C('summer_usagi', '바캉스 우사기', 3, '#5cc8ff', 'score', [9, 19], [83, 'square'], ['우라! 바다다!', '야하! 파도 타자!', '하아? 선크림?'], { img: 'usagi', badge: '🏖️', fx: 'summer' }),
  C('pumpkin_hachiware', '호박 하치와레', 3, '#ff9a3c', 'guard', [14, 30], [66, 'triangle'], ['트릭 오어 트릿!', '사탕 주면 안 놀래킬게!', '호박 모자 어때?'], { img: 'hachiware', badge: '🎃', fx: 'halloween' }),
  C('santa_kurimanju', '산타 쿠리만쥬', 3, '#ff5c5c', 'coin', [15, 35], [52, 'sine'], ['선물 왔어요~', '착한 아이에게만!', '푸하~ 메리 크리스마스!'], { img: 'kurimanju', badge: '🎅', fx: 'xmas' }),
  C('cake_chiikawa', '케이크 치이카와', 3, '#ffc2d6', 'heal', [4, 8], [78, 'sine'], ['케이크…! 와…!', '생일 축하해…!', '딸기 올려 줘…'], { img: 'chiikawa', badge: '🍰', fx: 'dessert' }),
  C('knight_rakko', '기사 랏코', 3, '#b8c4d6', 'revive', [35, 60], [49, 'sawtooth'], ['검은 마음으로 쥔다.', '지켜 주겠다.', '…각오해라.'], { img: 'rakko', badge: '⚔️', fx: 'knight' }),
  C('hero_hachiware', '용사 하치와레', 3, '#7fb0ff', 'hp', [25, 55], [66, 'sawtooth'], ['모험을 떠나자!', '어떻게든 될 거야, 용사니까!', '무섭지만 갈 거야!'], { img: 'hachiware', badge: '🛡️', fx: 'knight' }),
  C('astro_shisa', '우주비행사 시사', 3, '#9db6ff', 'window', [10, 21], [73, 'sine'], ['발사 준비 완료예요~!', '별까지 날아가요~', '무중력 신나요~!'], { img: 'shisa', badge: '🚀', fx: 'space' }),
  C('detective_tiha', '탐정 티하', 3, '#a88f6a', 'exp', [18, 40], [85, 'triangle'], ['범인은 바로…!', '단서를 찾았어!', '진실은 하나!'], { img: 'tiha', badge: '🔍', fx: 'detective' }),
  C('ninja_hachiware', '닌자 하치와레', 3, '#5e6a8a', 'window', [11, 22], [64, 'square'], ['닌닌!', '소리 없이 빠르게!', '분신술!'], { img: 'hachiware', badge: '🥷', fx: 'ninja' }),
  C('wizard_hachiware', '마법사 하치와레', 4, '#8f7bff', 'score', [13, 26], [67, 'sine'], ['마법의 리듬~!', '어떻게든 돼라~ 얍!', '별가루 뿌려 줄게!'], { img: 'hachiware', badge: '🧙', fx: 'magic' }),
  C('witch_usagi', '마녀 우사기', 4, '#b06bff', 'window', [14, 26], [84, 'sawtooth'], ['우라! 빗자루 출발!', '야하! 마법 비트!', '하아? 주문 외운다?'], { img: 'usagi', badge: '🧹', fx: 'magic' }),
  C('prince_rakko', '왕자 랏코', 4, '#ffd36b', 'score', [12, 25], [50, 'sine'], ['…왕관은 무겁군.', '무대 위의 왕자.', '따라올 수 있겠나.'], { img: 'rakko', badge: '🤴', fx: 'royal' }),
  C('princess_chiikawa', '공주 치이카와', 4, '#ffb0d0', 'heal', [5, 10], [79, 'sine'], ['공주… 됐어…!', '반짝반짝…', '와… 드레스…!'], { img: 'chiikawa', badge: '👸', fx: 'royal' }),
  // 신화
  C('star_trio', '슈퍼스타 삼인방', 5, '#ffd76a', 'score', [20, 36], [76, 'triangle'], ['우리 셋이 함께라면!', '우라! 와…! 어떻게든 돼라!', '슈퍼스타 등장!'], { img: 'chiikawa', card: 'assets/trio.webp', badge: '🌟', fx: 'myth' }),
  C('golden_usagi', '황금 우사기', 5, '#ffcc33', 'score', [18, 34], [84, 'square'], ['우라라라라!', '야하! 황금빛!', '하아? 눈부셔?'], { img: 'usagi', badge: '👑', fx: 'gold' }),
  C('galaxy_chiikawa', '은하수 치이카와', 5, '#7a6cff', 'hp', [40, 90], [80, 'sine'], ['별이… 가득…!', '우주… 끝까지…!', '반짝… 반짝…!'], { img: 'chiikawa', badge: '🌌', fx: 'galaxy' }),
  // 초월 (0.00000001%): 말도 안 되게 센 친구 둘. 팀에 있으면 버프 한계도 풀린다
  C('god_chiikawa', '창조신 치이카와', 6, '#fff1a8', 'god', [80, 140], [81, 'sine'], ['세상을… 새로 만들었어…!', '모두… 빛나라…!', '와…! 우주가 박수를 쳐…!'], { img: 'chiikawa', badge: '🪐', fx: 'creator' }),
  C('god_usagi', '파괴신 우사기', 6, '#ff2d55', 'god', [100, 170], [86, 'sawtooth'], ['우라라라라라라!!', '야하! 전부 다 부숴 버려!', '하아? 이게 끝이야?'], { img: 'usagi', badge: '☄️', fx: 'destroyer' }),
];
// 요청에서 온 이름으로 바로 찾는 표는 원형 없는 객체로 ('constructor' 같은 물려받은 이름이 친구 · 배너 · 업적으로 보이지 않게)
const table = (pairs) => Object.assign(Object.create(null), Object.fromEntries(pairs));
export const CHAR = table(CHARS.map((c) => [c.id, c]));
export const ofRarity = (r) => CHARS.filter((c) => c.rarity === r).map((c) => c.id);

// 레벨별 버프 수치 (1레벨 values[0], 5레벨 values[1], 그 뒤로도 같은 기울기)
export const valueAt = (c, level) => Math.round(c.values[0] + ((c.values[1] - c.values[0]) * (level - 1)) / 4);

/* ---------- 친구 레벨 업: 같은 친구 카드를 모아서 ---------- */

// 레벨 L → L+1에 드는 같은 친구 카드 수(기본) · 등급별 배율 (흔한 친구는 더 많이, 귀한 친구는 덜)
const LV_COPIES = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 9, 10];
const LV_SCALE = { 1: 1.5, 2: 1.2, 3: 1, 4: 0.7, 5: 0.4, 6: 0.2 };
export const copiesFor = (r, L) => (L >= MAX_LEVEL ? Infinity : Math.max(1, Math.round(LV_COPIES[L - 1] * LV_SCALE[r])));
export const coinsFor = (r, L) => Math.round((300 * L * (1 + (r - 1) * 0.5)) / 100) * 100;
// 지금 레벨에서 최고 레벨까지 더 필요한 카드 수 (이만큼 모였는데 또 나오면 보석으로 돌려준다)
export const copiesToMax = (r, L) => {
  let n = 0;
  for (let l = L; l < MAX_LEVEL; l++) n += copiesFor(r, l);
  return n;
};
// 지금 바로 레벨 업할 수 있는지
export const canLevel = (s, id) => {
  const c = CHAR[id], L = s.chars[id];
  return Boolean(c && L && L < MAX_LEVEL && (s.dup[id] ?? 0) >= copiesFor(c.rarity, L) && s.coins >= coinsFor(c.rarity, L));
};

// 같은 group 안에서는 조건을 채운 것 중 마지막(더 강한) 하나만 적용
const PAJAMAS = ['pajama_green', 'pajama_pink', 'pajama_purple', 'pajama_white'];
const ARMORS = ['labor_armor', 'pochette_armor', 'ramen_armor'];
const BAND = ['vocal_chiikawa', 'guitar_hachiware', 'drum_usagi'];
export const SYNERGIES = [
  { id: 'samin', group: 'samin', name: '삼인방', chars: ['chiikawa', 'hachiware', 'usagi'], buff: 'score', value: 10 },
  { id: 'samin4', group: 'samin', name: '삼인방 + 랏코', chars: ['chiikawa', 'hachiware', 'usagi', 'rakko'], buff: 'score', value: 20 },
  { id: 'book', group: 'book', name: '책방 친구', chars: ['momonga', 'kani'], buff: 'coin', value: 15 },
  { id: 'book3', group: 'book', name: '책방 + 랏코', chars: ['momonga', 'kani', 'rakko'], buff: 'coin', value: 25 },
  { id: 'teacher', group: 'teacher', name: '스승과 제자', chars: ['kurimanju', 'shisa'], buff: 'hp', value: 30 },
  { id: 'pajama', group: 'pajama', name: '파자마파티즈', chars: PAJAMAS, buff: 'score', value: 25 },
  { id: 'armor', group: 'armor', name: '갑옷 씨들', chars: ARMORS, buff: 'guard', value: 25 },
  { id: 'band', group: 'band', name: '먼작귀 밴드', chars: BAND, buff: 'score', value: 20 },
  { id: 'band4', group: 'band', name: '먼작귀 밴드 + DJ', chars: [...BAND, 'dj_momonga'], buff: 'score', value: 30 },
  { id: 'orch', group: 'orch', name: '숲속 오케스트라', chars: ['piano_rakko', 'violin_kurimanju', 'trumpet_shisa', 'conductor_kani'], buff: 'hp', value: 50 },
  { id: 'star', group: 'star', name: '슈퍼스타', chars: ['star_trio', 'piano_rakko'], buff: 'exp', value: 30 },
  { id: 'spring', group: 'spring', name: '벚꽃 놀이', chars: ['sakura_chiikawa', 'sakura_momonga'], buff: 'exp', value: 20 },
  { id: 'summer', group: 'summer', name: '여름 바캉스', chars: ['summer_usagi', 'watermelon_kani'], buff: 'coin', value: 20 },
  { id: 'halloween', group: 'halloween', name: '할로윈 파티', chars: ['pumpkin_hachiware', 'ghost_tiha'], buff: 'guard', value: 20 },
  { id: 'xmas', group: 'xmas', name: '메리 크리스마스', chars: ['santa_kurimanju', 'rudolph_shisa'], buff: 'coin', value: 30 },
  { id: 'dessert', group: 'dessert', name: '디저트 카페', chars: ['cake_chiikawa', 'pudding_momonga', 'chef_kurimanju'], buff: 'heal', value: 4 },
  { id: 'magic', group: 'magic', name: '마법 학교', chars: ['wizard_hachiware', 'witch_usagi'], buff: 'score', value: 20 },
  { id: 'royal', group: 'royal', name: '왕궁 무도회', chars: ['prince_rakko', 'princess_chiikawa'], buff: 'score', value: 25 },
  { id: 'quest', group: 'quest', name: '모험가 파티', chars: ['knight_rakko', 'hero_hachiware', 'ninja_hachiware'], buff: 'hp', value: 40 },
  { id: 'myth', group: 'myth', name: '신화의 무대', chars: ['star_trio', 'golden_usagi', 'galaxy_chiikawa'], buff: 'score', value: 40 },
  { id: 'gods', group: 'gods', name: '창조와 파괴', chars: ['god_chiikawa', 'god_usagi'], buff: 'score', value: 150 },
];

/* ---------- 뽑기 ---------- */

// 초월 확률 0.00000001% (= 1e-10). 서버 난수는 48비트라 이 확률도 그대로 뽑힌다
export const GOD_RATE = 1e-10;
const R = (a, b, c, d, e) => [a - GOD_RATE, b, c, d, e, GOD_RATE];
// 뽑기 배너. rates: 일반 · 희귀 · 영웅 · 전설 · 신화 · 초월 / ten: 10회 뽑기 최소 등급 / pity: 이 횟수 안에 전설 이상 확정 / pools: 등급별로 나오는 친구를 좁힘
const SEASON = {
  5: ['golden_usagi', 'galaxy_chiikawa'],
  4: ['wizard_hachiware', 'witch_usagi', 'prince_rakko', 'princess_chiikawa'],
  3: ['summer_usagi', 'pumpkin_hachiware', 'santa_kurimanju', 'cake_chiikawa', 'knight_rakko', 'hero_hachiware', 'astro_shisa', 'detective_tiha', 'ninja_hachiware'],
  2: ['sakura_chiikawa', 'ghost_tiha', 'rudolph_shisa', 'pudding_momonga', 'gamer_momonga', 'librarian_kani', 'chef_kurimanju'],
  1: ['sakura_momonga', 'watermelon_kani'],
};
export const BANNERS = [
  { id: 'std', name: '클래식 콘서트', icon: '🎵', desc: '모든 친구를 만날 수 있는 기본 뽑기', cost: { gems: 100 }, rates: R(0.6, 0.25, 0.12, 0.028, 0.002), ten: 2, pity: 100 },
  { id: 'pickup', name: '이번 주 픽업', icon: '⭐', desc: '전설이 나오면 절반은 이번 주 픽업 친구!', cost: { gems: 120 }, rates: R(0.58, 0.25, 0.13, 0.037, 0.003), ten: 2, pity: 90, pickup: true },
  { id: 'season', name: '시즌 축제', icon: '🎪', desc: '계절 · 테마 의상 친구들만 나와요 (신화 포함)', cost: { gems: 150 }, rates: R(0.58, 0.25, 0.13, 0.037, 0.003), ten: 2, pity: 90, pools: SEASON },
  { id: 'pajama', name: '파자마 파티', icon: '🌙', desc: '전설은 파자마파티즈, 영웅은 갑옷 씨들만!', cost: { gems: 150 }, rates: R(0.58, 0.25, 0.13, 0.04, 0), ten: 2, pity: 90, pools: { 4: [...PAJAMAS, 'idol_pajama'], 3: ARMORS } },
  { id: 'band', name: '밴드 콘서트', icon: '🎸', desc: '무대 의상을 입은 친구들만 나와요', cost: { gems: 150 }, rates: R(0.58, 0.25, 0.13, 0.04, 0), ten: 2, pity: 90,
    pools: { 4: ['piano_rakko', 'idol_pajama'], 3: [...BAND, 'dj_momonga'], 2: ['violin_kurimanju', 'trumpet_shisa', 'conductor_kani'] } },
  { id: 'coin', name: '코인 뽑기', icon: '🪙', desc: '보석 대신 코인으로! (전설 · 신화 · 초월은 안 나와요)', cost: { coins: 1500 }, rates: [0.82, 0.16, 0.02, 0, 0, 0], ten: 2 },
  { id: 'rookie', name: '초보자 응원', icon: '🔰', desc: '딱 한 번! 10회 뽑기 반값 + 영웅 이상 확정', cost: { gems: 50 }, rates: R(0.6, 0.25, 0.12, 0.028, 0.002), ten: 3, once: true },
];
export const BANNER = table(BANNERS.map((b) => [b.id, b]));

// 관리자가 바꾼 확률 · 천장 (cfg.rates = { 배너 id: { rates: [6개], pity } }). 예전 5개짜리는 가장 큰 확률에서 초월 확률만큼 떼어 붙인다. 형식이 이상하면 기본값
export function bannerOf(id, cfg = {}) {
  const b = BANNER[id] ?? BANNER.std, o = cfg?.rates?.[b.id];
  if (!o) return b;
  let r = Array.isArray(o.rates) ? o.rates : null;
  if (r?.length === 5 && r.every((x) => typeof x === 'number')) {
    const big = r.indexOf(Math.max(...r));
    r = [...r.map((x, i) => (i === big ? x - b.rates[5] : x)), b.rates[5]];
  }
  const rates = r?.length === 6 && r.every((x) => typeof x === 'number' && x >= 0 && x <= 1) && Math.abs(r.reduce((a, x) => a + x, 0) - 1) < 1e-6 ? r : b.rates;
  const pity = b.pity && Number.isInteger(o.pity) && o.pity >= 10 && o.pity <= 1000 ? o.pity : b.pity;
  return { ...b, rates, pity };
}

// 픽업은 매주 월요일 0시(한국 시간)에 다음 전설로 바뀐다
const LEGENDS = ofRarity(4), WEEK = 7 * 86400e3, SHIFT = 4 * 86400e3 - 9 * 3600e3;
export const weekOf = (t = Date.now()) => Math.floor((t - SHIFT) / WEEK);
export const pickupOf = (t = Date.now()) => LEGENDS[((weekOf(t) % LEGENDS.length) + LEGENDS.length) % LEGENDS.length];
export const pickupEnds = (t = Date.now()) => (weekOf(t) + 1) * WEEK + SHIFT;

export const BOOSTERS = {
  heart: { name: '하트 쿠키', icon: '🍪', buff: 'hp', value: 30 },
  star: { name: '반짝 별사탕', icon: '🍬', buff: 'score', value: 10 },
  feather: { name: '부활 깃털', icon: '🪶', buff: 'revive', value: 50 },
  shield: { name: '방패 젤리', icon: '🛡️', buff: 'guard', value: 30 },
  glasses: { name: '정확 안경', icon: '👓', buff: 'window', value: 15 },
  purse: { name: '코인 주머니', icon: '💰', buff: 'coin', value: 100 },
  book: { name: '경험치 책', icon: '📘', buff: 'exp', value: 100 },
};
// 행운 상자: 코인 5,000 → 아래 중 하나 (w: 뽑힐 비중). 평균은 값보다 조금 낮다 (코인을 쓰는 재미 · 가끔 대박)
export const LUCKY = { price: 5000, max: 10, table: [
  { w: 30, coins: 2500 }, { w: 22, coins: 6000 }, { w: 6, coins: 25000 }, { w: 1, coins: 100000 },
  { w: 14, gems: 80 }, { w: 4, gems: 400 },
  { w: 12, items: { shield: 1, glasses: 1 } }, { w: 8, items: { purse: 1, book: 1 } }, { w: 3, card: true },
] };

// 환전: 같은 날 여러 번 할수록 보석은 비싸지고 코인은 덜 준다. 보석→코인(최대 15)이 코인→보석(최소 20)보다 항상 싸서 돌려도 손해 (돈 복사 방지)
export const EXCHANGE = {
  gem100: { max: 10, coins: (n) => 2000 + 500 * n },
  gem1100: { max: 3, coins: (n) => 20000 + 5000 * n },
  coin: { max: 10, gems: 100, give: (n) => Math.max(300, 1500 - 150 * n) },
};
// price: 코인 / gems: 보석으로 사는 상품 / ex: 환전 상품 (가격이 하루 사용 횟수에 따라 바뀜)
export const SHOP = [
  { id: 'gem100', name: '보석 100개', desc: '살 때마다 오늘 가격이 올라요', ex: 'gem100', give: { gems: 100 } },
  { id: 'gem1100', name: '보석 1,100개', desc: '10% 더 주는 묶음 · 하루 3번', ex: 'gem1100', give: { gems: 1100 } },
  { id: 'coin', name: '코인 바꾸기', desc: '보석 100개 → 코인 (바꿀수록 줄어요)', ex: 'coin', give: {} },
  { id: 'heart', name: '하트 쿠키', desc: '부스터 · 최대 체력 +30', price: 400, give: { item: 'heart' } },
  { id: 'star', name: '반짝 별사탕', desc: '부스터 · 점수 +10%', price: 700, give: { item: 'star' } },
  { id: 'feather', name: '부활 깃털', desc: '부스터 · 쓰러지면 50%로 부활', price: 1000, give: { item: 'feather' } },
  { id: 'shield', name: '방패 젤리', desc: '부스터 · 실수 피해 -30%', price: 800, give: { item: 'shield' } },
  { id: 'glasses', name: '정확 안경', desc: '부스터 · 판정 범위 +15ms', price: 1500, give: { item: 'glasses' } },
  { id: 'purse', name: '코인 주머니', desc: '부스터 · 이번 연주 코인 2배', price: 1500, give: { item: 'purse' } },
  { id: 'book', name: '경험치 책', desc: '부스터 · 이번 연주 경험치 2배', price: 1500, give: { item: 'book' } },
  { id: 'bundle', name: '부스터 세트', desc: '쿠키 · 별사탕 · 깃털 · 젤리 · 안경 하나씩 (25% 할인)', price: 3300, give: { items: { heart: 1, star: 1, feather: 1, shield: 1, glasses: 1 } } },
  { id: 'lucky', name: '행운 상자', desc: '코인 · 보석 · 부스터 · 캐릭터 카드 중 하나! (가끔 코인 10만)', price: LUCKY.price, give: { lucky: true } },
];
// 지금 이 상품의 가격과 주는 양 { coins, gems, give, left }
export function priceOf(s, item) {
  if (!item.ex) return { coins: item.price ?? 0, gems: item.gems ?? 0, give: item.give, left: Infinity };
  const e = EXCHANGE[item.ex], n = dayOf(s).ex[item.ex] ?? 0;
  return item.ex === 'coin'
    ? { coins: 0, gems: e.gems, give: { coins: e.give(n) }, left: e.max - n }
    : { coins: e.coins(n), gems: 0, give: item.give, left: e.max - n };
}

// 연주 테마: 코인으로 사서 연주 화면을 바꾼다 (보기만 바뀌고 점수 · 판정은 그대로). 한 번 사면 계속 쓴다
// bg: 판 바깥 배경(CSS) / board · a: 판 색 · 진하기 / jl: 판정선 색 / r: 노트 모서리 둥글기 / ink: 테두리 색 / dark: 속이 어두운 네온 노트
// fx: 떠다니는 무늬 { kind, n: 개수, speed: 화면을 지나는 초, dir: 1 떨어짐 · -1 올라감 · 0 제자리, size, c: 색 } / deco: 배경 그림 (game.js SHAPE · DECO)
const TH = (id, name, icon, price, desc, o) => ({ id, name, icon, price, desc, r: 0.35, ink: '#4a3953', a: 0.5, ...o });
export const THEMES = [
  TH('default', '기본 무대', '🎵', 0, '처음부터 쓰는 밤하늘 무대', { bg: '', board: '28, 18, 52', fever: '60, 24, 70', a: 0.64, jl: '255,141,182' }),
  TH('sakura', '벚꽃 밤', '🌸', 200000, '분홍 밤하늘에 꽃잎이 흩날려요', {
    bg: 'linear-gradient(#2b1b3d, #6b2f5f 55%, #e58fb0)', board: '60, 20, 56', jl: '255,170,205',
    fx: { kind: 'petal', n: 22, speed: 14, dir: 1, size: 6, c: ['#ffc4da', '#ffb0cc', '#ffe3ee'] } }),
  TH('ocean', '깊은 바다', '🐠', 200000, '푸른 바닷속에서 물방울이 올라와요', {
    bg: 'linear-gradient(#0a6a8a, #0a2a55 55%, #071637)', board: '6, 34, 70', jl: '110,225,255',
    fx: { kind: 'bubble', n: 18, speed: 16, dir: -1, size: 7, c: ['#9fe8ff', '#d6f6ff'] } }),
  TH('forest', '반딧불 숲', '🌲', 250000, '깜깜한 숲에 반딧불이 깜빡여요', {
    bg: 'linear-gradient(#071f1c, #123f30 60%, #0f3322)', board: '10, 40, 30', jl: '190,240,120', deco: 'pines',
    fx: { kind: 'firefly', n: 20, speed: 30, dir: -1, size: 3, c: ['#e6ff8a', '#c8f56a'] } }),
  TH('snow', '눈 오는 밤', '❄️', 250000, '조용한 겨울밤에 함박눈이 내려요', {
    bg: 'linear-gradient(#0e1b3d, #2b4478 60%, #8fb0d9)', board: '18, 34, 78', jl: '190,225,255',
    fx: { kind: 'snow', n: 36, speed: 18, dir: 1, size: 3.2, c: ['#fff', '#dcecff'] } }),
  TH('sunset', '노을 해변', '🌅', 300000, '해가 지는 바다 위에서 연주해요', {
    bg: 'linear-gradient(#2a1a4a, #a13c6a 40%, #ff8a5c 58%, #ffc46b 66%)', board: '70, 22, 60', jl: '255,190,120', deco: 'sun' }),
  TH('candy', '사탕 나라', '🍭', 300000, '알록달록 달콤한 나라 · 동글동글 노트', {
    bg: 'linear-gradient(#ffb3d9, #c9a8ff 55%, #8fd8ff)', board: '110, 50, 130', jl: '255,235,130', r: 0.5,
    fx: { kind: 'sprinkle', n: 26, speed: 20, dir: 1, size: 5, c: ['#fff', '#ffe08d', '#9ff0d0', '#ff8db6', '#8fd3ff'] } }),
  TH('neon', '네온 시티', '🌃', 400000, '빛나는 도시 · 테두리만 빛나는 네온 노트', {
    bg: 'linear-gradient(#0a0420, #1c0a3f 50%, #3a0f5e)', board: '12, 6, 34', jl: '0,240,255', r: 0.2, ink: '#00f0ff', dark: true, deco: 'grid' }),
  TH('arcade', '8비트 오락실', '👾', 400000, '옛날 오락실 화면 · 네모난 픽셀 노트', {
    bg: 'repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 2px, transparent 2px 6px), linear-gradient(#0c0c28, #1a1450)', board: '14, 14, 44', jl: '120,255,120', r: 0.04, ink: '#000',
    fx: { kind: 'pixel', n: 22, speed: 22, dir: 1, size: 8, c: ['#ff5d8f', '#4ec3ff', '#ffe14d', '#7dff7a'] } }),
  TH('fiesta', '피에스타', '🎉', 500000, '라 쿠카라차가 절로 나오는 축제 거리', {
    bg: 'linear-gradient(#5a1240, #b8322f 50%, #f29a2e)', board: '70, 16, 40', a: 0.6, jl: '255,210,90', deco: 'bunting',
    fx: { kind: 'sprinkle', n: 14, speed: 24, dir: 1, size: 5, c: ['#ffd25e', '#3fd4a6', '#ff5d8f', '#4ec3ff'] } }),
  TH('galaxy', '은하수', '🌌', 1000000, '별이 쏟아지는 우주 한가운데 · 최고급 테마', {
    bg: 'radial-gradient(ellipse at 70% 20%, rgba(160,90,255,.5), transparent 55%), radial-gradient(ellipse at 20% 70%, rgba(60,160,255,.4), transparent 50%), #060417',
    board: '10, 6, 34', jl: '200,170,255', ink: '#2a1f55',
    fx: { kind: 'star', n: 60, dir: 0, size: 2.2, c: ['#fff', '#cfe4ff', '#ffe9c4'] } }),
];
export const THEME = table(THEMES.map((t) => [t.id, t]));
export const ownedTheme = (s, id) => id === 'default' || s.themes.includes(id);

// 코인 쓸 곳 1) 오늘의 카드: 매일 0시(한국 시간)에 등급별(희귀 · 영웅 · 전설 · 신화) 한 명씩 바뀐다. 칸마다 하루 3장, 살수록 비싸진다.
// 없는 캐릭터면 그 캐릭터를 얻고(1레벨), 있으면 레벨 업 카드 1장. 초월은 팔지 않는다
export const CARD_SHOP = { rarities: [2, 3, 4, 5], max: 3, price: { 2: 3000, 3: 12000, 4: 60000, 5: 250000 } };
export function cardsOf(day = today()) {
  const rnd = seeded(hashStr(`cards:${day}`));
  return CARD_SHOP.rarities.map((r) => {
    const list = CHARS.filter((c) => c.rarity === r);
    return list[Math.floor(rnd() * list.length)].id;
  });
}
export const cardPrice = (id, n) => Math.round(CARD_SHOP.price[CHAR[id].rarity] * (1 + 0.5 * n));
// 코인 쓸 곳 2) 경험치 물약: 경험치 +100 · 하루 5번. 가격은 레벨이 높을수록 · 오늘 많이 살수록 오른다 (레벨은 내려가지 않아서 10레벨 보상 차익은 한 번뿐 · 하루 5번)
export const POTION = { exp: 100, max: 5, coins: (L, n) => Math.round((4000 + 150 * L) * (1 + 0.5 * n)) };
// 레벨 before → after 사이에 받는 레벨 업 보상 합
export function levelGifts(before, after) {
  const g = { coins: 0, gems: 0, items: {} };
  for (let L = before + 1; L <= after; L++) {
    const r = levelReward(L);
    g.coins += r.coins;
    g.gems += r.gems;
    for (const [k, n] of Object.entries(r.items ?? {})) g.items[k] = (g.items[k] ?? 0) + n;
  }
  return g;
}

// 친구 선물: 무료 선물(친구마다 하루 한 번, 받는 친구 코인 500 + 보석 10 · 보낸 나도 감사 코인 100) · 코인 · 보석 선물(보내는 사람이 낸다)
export const GIFT = {
  free: { give: { coins: 500, gems: 10 }, back: 100 },
  coins: [1000, 5000, 10000],
  gems: [30, 100],
  getMax: 30, // 하루에 받을 수 있는 무료 선물 수
};

// 친구 코드: 코드 = base + 회원 번호. 코드로 가입하면 가입한 친구는 바로 보석 join개 + 서로 친구,
// 그 친구가 plays곡을 연주하면 초대한 사람도 보석 invite개 (초대한 사람마다 max명까지 · 가짜 계정으로 불리기 방지)
export const REF = { base: 100000, join: 300, invite: 300, plays: 3, max: 30 };
export const BOAST_MAX = 5; // 친구들에게 점수 자랑: 하루 횟수

// 난이도별 보상 배율 · 첫 클리어 보석
export const DIFF_MULT = { easy: 0.8, normal: 1, hard: 1.3, expert: 1.6, master: 2, extreme: 2.5, inferno: 3, chaos: 4 };
const FIRST_GEMS = { easy: 30, normal: 50, hard: 80, expert: 120, master: 200, extreme: 300, inferno: 450, chaos: 700 };

// 월간 출석: 이번 달 n번째 출석에 받는 보상. 날이 갈수록 커지고 7 · 14 · 21 · 28일째는 특별 보상
export const ATTEND = Array.from({ length: 31 }, (_, i) => {
  const d = i + 1;
  if (d % 7 === 0) return { gems: [300, 500, 800, 1500][d / 7 - 1] };
  if (d >= 29) return { coins: 5000, gems: 300 };
  return d % 2 ? { gems: 50 + d * 5 } : { coins: 500 + d * 150 };
});
const monthOf = () => today().slice(0, 7);
export const attendOf = (s) => (s.attend.month === monthOf() ? s.attend.count : 0);

/* ---------- 플레이어 레벨 (1~1000) · 프로필 테두리 · 레벨 혜택 ---------- */

// 레벨 L → L+1 경험치: 100레벨까지 100, 그 뒤로는 레벨마다 2씩 늘어난다 (1000레벨까지 총 910,800)
export const expNeed = (L) => (L < 100 ? 100 : 100 + (L - 99) * 2);
export const expAt = (L) => (L <= 100 ? (L - 1) * 100 : 9900 + (L - 100) ** 2 + 101 * (L - 100));
export function levelOf(exp) {
  const e = Math.max(0, Number(exp) || 0);
  if (e < 9900) return 1 + Math.floor(e / 100);
  let L = 100 + Math.floor((-101 + Math.sqrt(101 * 101 + 4 * (e - 9900))) / 2);
  while (L < MAX_LV && expAt(L + 1) <= e) L++;
  while (L > 100 && expAt(L) > e) L--;
  return Math.min(MAX_LV, L);
}
// 지금 레벨 안에서 [쌓은 경험치, 다음 레벨까지 필요한 경험치]
export const expProgress = (exp) => {
  const L = levelOf(exp);
  return L >= MAX_LV ? [1, 1] : [Math.max(0, exp - expAt(L)), expNeed(L)];
};

// 레벨 L에 처음 오르면 받는 보상: 코인 · 보석, 10레벨마다 부스터 3종 + 보너스 보석, 50 · 100레벨마다 큰 보너스
export function levelReward(L) {
  const r = { coins: 300 + L * 30, gems: 50 + Math.floor(L / 10) * 5 };
  if (L % 10 === 0) {
    r.gems += 100 + L;
    r.items = { heart: 1, star: 1, feather: 1 };
  }
  if (L % 50 === 0) { r.coins += L * 200; r.gems += 300; }
  if (L % 100 === 0) r.gems += 1000 + L * 2;
  return r;
}

// 레벨 혜택 (계속 유지): 코인 · 경험치 보너스 · 친구 수 · 하루 선물 횟수 · 출석 보상
export const perksOf = (L) => ({
  coin: Math.floor(L / 10), // 10레벨마다 코인 +1% (1000레벨 +100%)
  exp: Math.floor(L / 25), // 25레벨마다 경험치 +1%
  friends: Math.min(200, 30 + Math.floor(L / 5)), // 친구 최대 수
  gifts: 5 + Math.floor(L / 50), // 하루 선물 보내기 횟수
  attend: Math.floor(L / 100) * 10, // 100레벨마다 출석 보상 +10%
});

// 프로필 테두리: 10레벨마다 새 테두리 (1~1000레벨 = 101개). 100레벨마다 새 재질, 그 안에서 무늬 10가지
export const FRAME_FAMILIES = [
  { name: '새싹', icon: '🌱', c: ['#8fdcaa', '#e3fbd8', '#4fae7c'] },
  { name: '벚꽃', icon: '🌸', c: ['#ffa6c8', '#fff0f6', '#f0679a'] },
  { name: '하늘', icon: '☁️', c: ['#7cc8ff', '#eaf6ff', '#3a8fe0'] },
  { name: '별빛', icon: '⭐', c: ['#ffd04a', '#fff6cf', '#e8a100'] },
  { name: '라벤더', icon: '🔮', c: ['#b99bff', '#f2ebff', '#7f58f0'] },
  { name: '불꽃', icon: '🔥', c: ['#ff7a3d', '#ffe08a', '#e0303f'] },
  { name: '에메랄드', icon: '💚', c: ['#20cf94', '#c4ffe6', '#0a8a60'] },
  { name: '사파이어', icon: '💎', c: ['#4c74ff', '#cddaff', '#2236a8'] },
  { name: '황금', icon: '👑', c: ['#ffc928', '#fff7cf', '#b97c00'] },
  { name: '무지개', icon: '🌈', c: ['#ff5d8f', '#4ec3ff', '#a66bff'] },
  { name: '우주', icon: '🪐', c: ['#8a7bff', '#1d1546', '#ff8ff0'] },
];
export const FRAME_STYLES = ['테두리', '두 줄', '점선', '물방울', '그라데이션', '줄무늬', '반짝임', '보석', '회전', '전설'];
export const frameTier = (L) => Math.min(100, Math.floor(L / 10));
export const frameInfo = (tier) => {
  const t = Math.max(0, Math.min(100, Math.floor(tier) || 0)), f = FRAME_FAMILIES[Math.floor(t / 10)], st = t === 100 ? 9 : t % 10;
  return { tier: t, family: Math.floor(t / 10), style: st, name: t === 100 ? '무한의 우주' : `${f.name} ${FRAME_STYLES[st]}`, icon: f.icon, c: f.c, level: Math.max(1, t * 10) };
};
// 지금 쓰는 테두리: 고른 테두리가 열려 있으면 그것, 아니면 가장 높은 테두리
export const frameOfSave = (s) => frameTier(levelOf(s.exp)); // 테두리는 늘 지금 레벨의 가장 높은 것 (고르지 않음)

/* ---------- 카드 점수 · 팀 ---------- */

// 등급 기본 점수 × 레벨(1레벨마다 +15%)
export const powerOf = (s, id) => {
  const c = CHAR[id], L = s.chars[id];
  return c && L ? Math.round(RARITY[c.rarity].power * (1 + (L - 1) * 0.15)) : 0;
};

const members = (s, team) => team.filter((id) => CHAR[id] && s.chars[id]);

// 팀 점수 = 카드 점수 합 × (1 + 시너지 개수 × 10%)
export const teamPower = (s, team = s.team) =>
  Math.round(members(s, team).reduce((a, id) => a + powerOf(s, id), 0) * (1 + 0.1 * teamBuffs(s, [], team).synergies.length));

export function teamBuffs(s, boosters = [], team = s.team) {
  const b = Object.fromEntries(Object.keys(BUFFS).filter((k) => k !== 'god').map((k) => [k, 0]));
  const add = (buff, v) => (b[buff] = buff === 'revive' ? Math.max(b.revive, v) : b[buff] + v);
  const ids = members(s, team);
  let divine = false;
  for (const id of ids) {
    const c = CHAR[id], v = valueAt(c, s.chars[id]);
    if (c.buff !== 'god') {
      add(c.buff, v);
      continue;
    }
    divine = true; // 신의 힘: 모든 능력이 한꺼번에
    add('score', v);
    add('window', Math.round(v / 4));
    add('guard', Math.round(v / 2));
    add('heal', Math.round(v / 20));
    add('hp', v);
    add('coin', v);
    add('exp', v);
    add('revive', 100);
  }
  const synergies = [];
  for (const group of new Set(SYNERGIES.map((x) => x.group))) {
    const hit = SYNERGIES.filter((x) => x.group === group && x.chars.every((id) => ids.includes(id))).at(-1);
    if (hit) { synergies.push(hit); add(hit.buff, hit.value); }
  }
  if (divine) b.score = Math.min(b.score, GOD_SCORE);
  for (const k of boosters) add(BOOSTERS[k].buff, BOOSTERS[k].value);
  for (const [k, v] of Object.entries(divine ? GOD_CAP : CAP)) b[k] = Math.min(b[k], v);
  return { ...b, synergies, divine };
}

// 더해도 팀 버프가 그대로인 부스터(이미 한계 · 부활은 더 큰 값이 있음)는 곡 창에서 고를 수 없고, 시작할 때 차감하지도 않는다
export const boosterWorks = (s, k) => {
  const buff = BOOSTERS[k].buff;
  return teamBuffs(s, [k])[buff] > teamBuffs(s)[buff];
};

// 팀 점수가 가장 높은 4명
// ponytail: 카드 점수 상위 16명 안에서만 4명 조합을 전수 조사(1,820가지). 시너지 조합은 시너지 버튼으로 따로 편성
export function bestTeam(s, must = []) {
  const ids = Object.keys(s.chars).filter((id) => CHAR[id] && !must.includes(id)).sort((a, b) => powerOf(s, b) - powerOf(s, a)).slice(0, 16);
  const k = Math.min(4 - must.length, ids.length);
  let best = null, top = -1;
  const pick = (from, chosen) => {
    if (chosen.length === k) {
      const team = [...must, ...chosen];
      const p = teamPower(s, team);
      if (p > top) { top = p; best = team; }
      return;
    }
    for (let i = from; i <= ids.length - (k - chosen.length); i++) pick(i + 1, [...chosen, ids[i]]);
  };
  pick(0, []);
  return [...(best ?? must), null, null, null, null].slice(0, 4);
}

/* ---------- 업적: 트랙(같은 기록을 쌓는 묶음)마다 목표가 여러 단계. 단계는 순서대로 받는다 ---------- */
// 받은 단계 수만 저장: 일반 트랙은 s.ach[트랙 id] = n, 곡 × 난이도 트랙은 s.achS[곡 id] = 난이도 8개 × 종류 7개 글자(36진수 한 글자 = 받은 단계 수)

export const ACH_CATS = { play: '연주', song: '곡별', skill: '실력', collect: '수집', char: '캐릭터', grow: '성장', wealth: '재화', daily: '출석', rank: '경쟁', multi: '멀티', social: '친구' };

// 단계가 오를수록 커지는 보상 (예전 업적과 같은 표)
const TIER = [
  { coins: 500 }, { gems: 50 }, { coins: 1500 }, { gems: 100 }, { coins: 3000, gems: 100 }, { gems: 200 },
  { coins: 6000, gems: 200 }, { gems: 400 }, { coins: 12000, gems: 400 }, { gems: 800 }, { coins: 25000, gems: 1000 }, { gems: 2000 },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const n0 = (n) => n.toLocaleString('ko-KR');
const r100 = (n) => Math.max(100, Math.round(n / 100) * 100);
const upTo = (from, to, step) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const TRACKS = [];
// 트랙 하나: goals 오름차순 / stat(s, x): 지금 기록 (x = 한 번 계산해 둔 집계) / reward(i, goal) / legacy: 예전 업적 id (단계 순서대로)
function track(cat, id, name, desc, goals, stat, opt = {}) {
  const t = { cat, id, name, desc, goals, stat, ...opt };
  t.reward ??= (i) => TIER[Math.min(TIER.length - 1, (opt.t0 ?? 0) + i)];
  TRACKS.push(t);
  return t;
}
// 예전 tiers() 업적과 같은 id(`key + 목표`) · 같은 보상으로 시작해서 목표를 더 늘린 트랙
const tiers = (cat, key, name, desc, goals, stat, t0 = 0, names) =>
  track(cat, key, name, desc, goals, stat, { t0, names, legacy: goals.map((g) => `${key}${g}`) });
// 예전 one() 업적: 단계 하나짜리
const one = (cat, id, name, desc, goal, stat, t) =>
  track(cat, id, name, () => desc, [goal], stat, { legacy: [id], reward: () => (typeof t === 'number' ? TIER[t] : t) });

export const tierName = (t, i) => t.names?.[i] ?? t.label?.(t.goals[i]) ?? (t.goals.length === 1 ? t.name : t.goals.length <= ROMAN.length ? `${t.name} ${ROMAN[i]}` : `${t.name} ${i + 1}단계`);

// 한 번 계산해 두면 여러 트랙이 같이 쓰는 집계
function ctxOf(s) {
  const cleared = DIFFS.map(() => new Set()), any = new Set(), sSet = new Set();
  for (const k of Object.keys(s.stats.clears)) {
    const [song, diff] = k.split(':'), d = DIFFS.indexOf(diff);
    if (d >= 0 && SONG[song]) { cleared[d].add(song); any.add(song); }
  }
  for (const [k, b] of Object.entries(s.best)) if (b?.rank === 'S' && SONG[k.split(':')[0]]) sSet.add(k.split(':')[0]);
  const ids = Object.keys(s.chars).filter((id) => CHAR[id]), byR = {};
  for (const id of ids) byR[CHAR[id].rarity] = (byR[CHAR[id].rarity] ?? 0) + 1;
  return {
    lv: levelOf(s.exp), cleared: cleared.map((c) => c.size), any: any.size, sSongs: sSet.size, owned: ids.length, byR,
    atLeast: (n) => ids.filter((id) => s.chars[id] >= n).length,
    power: teamPower(s), syn: teamBuffs(s).synergies.length,
  };
}
const dexGroups = [...new Set(SYNERGIES.map((x) => x.group))].map((g) => {
  const list = SYNERGIES.filter((x) => x.group === g);
  return { group: g, name: list[0].name, chars: list.at(-1).chars };
});
const N = SONGS.length;

// ── 연주 · 실력 · 성장 · 재화 · 출석 · 경쟁 (예전 업적은 그대로 앞 단계에) ──
tiers('play', 'play', '연주', (g) => `곡을 ${n0(g)}번 연주하기`,
  [1, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000], (s) => s.stats.plays, 0,
  ['첫 연주', '다섯 번의 연주', '연습벌레', '스무 번의 연주', '꾸준한 연주자', '무대 체질', '75번의 무대', '콘서트 피아니스트', '150번의 박수', '박수갈채', '300번의 무대',
    '연주 중독', '천 번의 연주', '이천 번의 연주', '삼천 번의 연주', '전설의 연주자', '7,500번의 무대', '만 번의 연주', '연주의 신', '이만 번의 연주', '삼만 번의 연주', '영원한 연주자']);
tiers('play', 'clear', '곡 정복', (g) => `서로 다른 곡 ${g}개 클리어`, upTo(5, N - 1, 5), (s, x) => x.any, 2);
one('play', 'clearAll', '모든 곡 정복', `${N}곡 모두 클리어`, N, (s, x) => x.any, 9);
const DIFF_TIERS = { easy: [1, 10, 50, 100, 300], normal: [1, 10, 50, 100, 300], hard: [1, 10, 50, 100, 300], expert: [1, 10, 50, 100, 300], master: [1, 10, 30, 100, 300], extreme: [1, 10, 50, 100], inferno: [1, 10, 50, 100], chaos: [1, 10, 30, 100] };
const DIFF_TITLE = { easy: 'EASY 연주자', normal: 'NORMAL 연주자', hard: 'HARD 도전자', expert: 'EXPERT 정복자', master: 'MASTER 신', extreme: 'EXTREME 돌파', inferno: 'INFERNO 생존자', chaos: 'CHAOS 지배자' };
const DIFF_T0 = { easy: 0, normal: 0, hard: 1, expert: 3, master: 5, extreme: 6, inferno: 7, chaos: 8 };
DIFFS.forEach((d, di) => {
  tiers('skill', d, DIFF_TITLE[d], (g) => `${DIFF_NAME[d]} 난이도 ${n0(g)}번 클리어`, [...DIFF_TIERS[d], 500, 1000, 2000, 3000, 5000, 10000].filter((g, i, a) => a.indexOf(g) === i),
    (s) => s.stats.diffClears[d] ?? 0, DIFF_T0[d]);
  // 난이도마다 서로 다른 곡 n개 클리어 (MASTER는 예전 'MASTER 곡 수집' 5 · 10 · 20개가 앞 단계)
  if (d === 'master') tiers('skill', 'mastersong', 'MASTER 곡 수집', (g) => `서로 다른 곡 ${g}개를 MASTER로 클리어`, [5, 10, 20, ...upTo(30, N - 1, 10)], (s, x) => x.cleared[di], 6);
  else track('skill', `dsong:${d}`, `${DIFF_NAME[d]} 곡 수집`, (g) => `서로 다른 곡 ${g}개를 ${DIFF_NAME[d]}로 클리어`, upTo(5, N - 1, 5), (s, x) => x.cleared[di],
    { reward: (i) => ({ coins: r100(300 * (1 + di * 0.5) * (1 + i * 0.3)), gems: i % 2 ? Math.round(20 * (1 + di * 0.3)) : 0 }) });
  // 난이도마다 모든 곡 클리어 (예전 id: 모든 곡 MASTER · CHAOS)
  const allId = { master: 'masterAll', chaos: 'chaosAll' }[d] ?? `${d}All`;
  one('skill', allId, d === 'master' ? '마스터 오브 마스터' : d === 'chaos' ? '혼돈의 끝' : `${DIFF_NAME[d]} 완전 정복`, `${N}곡 모두 ${DIFF_NAME[d]} 클리어`, N, (s, x) => x.cleared[di],
    d === 'chaos' ? { gems: 30000 } : d === 'master' ? 11 : { gems: 2000 + di * 1000 });
});
one('skill', 'masterGift', 'MASTER 클리어 축하금', 'MASTER 난이도를 처음 클리어하면 보석 10,000개!', 1, (s, x) => x.cleared[4], { gems: 10000 });
tiers('skill', 'ssong', 'S 랭크 곡 수집', (g) => `서로 다른 곡 ${g}개에서 S 랭크`, [5, 10, 20, ...upTo(30, N - 1, 10)], (s, x) => x.sSongs, 5);
one('skill', 'rankS', '완벽한 연주', 'S 랭크 받기', 1, (s) => s.stats.sRanks, 1);
tiers('skill', 'srank', 'S 랭크 수집가', (g) => `S 랭크 ${n0(g)}번 받기`, [10, 30, 100, 300, 1000, 3000, 10000], (s) => s.stats.sRanks, 2);
one('skill', 'sAll', '모든 곡 S', `${N}곡 모두 S 랭크 받기`, N, (s, x) => x.sSongs, 10);
one('skill', 'fc1', '한 번도 안 틀렸어', '풀콤보로 클리어', 1, (s) => s.stats.fullCombos, 1);
tiers('skill', 'fc', '풀콤보 장인', (g) => `풀콤보 ${n0(g)}번`, [5, 20, 50, 100, 300, 500, 1000, 3000], (s) => s.stats.fullCombos, 2);
tiers('skill', 'ap', 'ALL PERFECT', (g) => `ALL PERFECT ${n0(g)}번`, [1, 5, 20, 50, 100, 300, 1000], (s) => s.stats.allPerfects, 4);
tiers('skill', 'combo', '콤보', (g) => `한 곡에서 ${n0(g)}콤보`, [50, 100, 200, 300, 500, 700, 1000, 1500, 2000, 3000], (s) => s.stats.maxCombo);
tiers('skill', 'perfect', '퍼펙트 장인', (g) => `PERFECT 누적 ${n0(g)}개`,
  [100, 1000, 5000, 10000, 30000, 100000, 300000, 1000000, 2000000, 3000000, 5000000, 10000000], (s) => s.stats.perfects);

tiers('collect', 'collect', '친구 수집', (g) => `친구 ${g}명 모으기`, [5, 8, 12, 16, 20, 30, 40, 50], (s, x) => x.owned);
one('collect', 'collectAll', '모두 모였다!', `친구 ${CHARS.length}명 모두 모으기`, CHARS.length, (s, x) => x.owned, 11);
tiers('collect', 'legend', '전설 수집', (g) => `전설 친구 ${g}명 모으기`, [1, 3, 6, LEGENDS.length], (s, x) => x.byR[4] ?? 0, 3);
tiers('collect', 'myth', '신화 수집', (g) => `신화 친구 ${g}명 모으기`, [1, ofRarity(5).length], (s, x) => x.byR[5] ?? 0, 9);
track('collect', 'god', '초월 수집', (g) => `초월 친구 ${g}명 모으기 (0.00000001%!)`, [1, 2], (s, x) => x.byR[6] ?? 0, { reward: (i) => ({ gems: 100000 * (i + 1) }) });
one('collect', 'heroAll', '영웅 집합', `영웅 친구 ${ofRarity(3).length}명 모두 모으기`, ofRarity(3).length, (s, x) => x.byR[3] ?? 0, 8);
for (const g of dexGroups) {
  one('collect', `dex_${g.group}`, `${g.name} 도감`, `${g.chars.map((id) => CHAR[id].name).join(' · ')} 모으기`, g.chars.length,
    (s) => g.chars.filter((id) => s.chars[id]).length, Math.min(9, g.chars.length + 2));
}
tiers('collect', 'lpull', '전설과의 만남', (g) => `뽑기에서 전설 이상 ${g}번 만나기`, [1, 5, 10, 30, 50, 100, 300], (s) => s.stats.legends, 3);
tiers('collect', 'mpull', '신화와의 만남', (g) => `뽑기에서 신화 이상 ${g}번 만나기`, [1, 3, 10, 30, 100], (s) => s.stats.mythics, 9);
tiers('collect', 'avatar', '프로필 수집', (g) => `프로필 사진 ${g}개 모으기`, [15, 20, 32], (s) => FREE_AVATARS + s.avatars.length, 2);

// 플레이어 레벨: 2~1000레벨 모든 레벨이 업적 (예전 5 · 10 · 20 · 30 · 40 · 50 · 75 · 100레벨 id는 그대로)
const OLD_LV = new Set([5, 10, 20, 30, 40, 50, 75, 100]);
track('grow', 'level', '레벨', (g) => `플레이어 레벨 ${g} 달성`, upTo(2, MAX_LV, 1), (s, x) => x.lv, {
  label: (g) => `Lv.${g} 달성`,
  legacy: upTo(2, MAX_LV, 1).map((g) => (OLD_LV.has(g) ? `level${g}` : null)),
  reward: (i, g) => (OLD_LV.has(g) ? TIER[Math.min(TIER.length - 1, 1 + [...OLD_LV].indexOf(g))] : g % 10 ? { coins: r100(100 + g * 5) } : { coins: r100(500 + g * 20), gems: 20 + Math.floor(g / 10) }),
});
one('grow', 'stage5', '5레벨 달성', '친구 1명을 5레벨로', 1, (s, x) => x.atLeast(5), 3);
one('grow', 'stage7', '7레벨 달성', '친구 1명을 7레벨로', 1, (s, x) => x.atLeast(7), 5);
one('grow', 'stage10', '10레벨 달성', '친구 1명을 10레벨로', 1, (s, x) => x.atLeast(10), 7);
one('grow', 'stage15', '15레벨 달성', '친구 1명을 15레벨로', 1, (s, x) => x.atLeast(15), 9);
one('grow', 'stage20', '최고 레벨', '친구 1명을 20레벨로', 1, (s, x) => x.atLeast(20), 11);
tiers('grow', 'max', '10레벨 군단', (g) => `10레벨 이상 친구 ${g}명`, [3, 5, 10, 20, 30, 40, CHARS.length], (s, x) => x.atLeast(10), 8);
track('grow', 'max20', '만렙 군단', (g) => `20레벨 친구 ${g}명`, [1, 3, 5, 10, 20, 30, 40, CHARS.length], (s, x) => x.atLeast(20), { t0: 6 });
track('grow', 'lvup', '레벨 업 장인', (g) => `친구 레벨 업 ${n0(g)}번`, [1, 5, 10, 30, 50, 100, 300, 500, 1000], (s) => s.stats.levelUps);
tiers('grow', 'power', '팀 점수', (g) => `팀 점수 ${n0(g)} 달성`, [1000, 2000, 3000, 4000, 6000, 9000, 12000, 15000, 20000, 30000, 50000, 100000], (s, x) => x.power, 1);
one('grow', 'teamFull', '4인 밴드 결성', '팀 4칸 모두 채우기', 4, (s) => s.team.filter(Boolean).length, 1);
one('grow', 'synergy', '찰떡궁합', '팀 시너지 발동하기', 1, (s, x) => x.syn, 1);

one('wealth', 'rich', '코인 부자', '코인 누적 10,000개 벌기', 10000, (s) => s.stats.coinsEarned, 1);
tiers('wealth', 'earn', '코인 재벌', (g) => `코인 누적 ${n0(g)}개 벌기`, [50000, 200000, 1000000, 5000000, 10000000, 30000000, 100000000], (s) => s.stats.coinsEarned, 3);
tiers('wealth', 'pull', '뽑기', (g) => `뽑기 ${n0(g)}번`, [10, 50, 100, 300, 500, 1000, 3000, 5000, 10000, 30000, 100000], (s) => s.stats.pulls);
tiers('wealth', 'buy', '쇼핑', (g) => `상점에서 ${g}번 구매`, [1, 10, 50, 100, 200, 500, 1000], (s) => s.stats.buys);
tiers('daily', 'day', '출석', (g) => `출석 ${g}일`, [1, 7, 14, 30, 60, 100, 200, 365, 500, 730, 1000, 1500, 2000, 3650], (s) => s.stats.days);
tiers('daily', 'mission', '일일 미션', (g) => `일일 미션 ${n0(g)}개 완료`, [10, 50, 100, 300, 1000, 3000, 10000], (s) => s.stats.missions, 1);
tiers('daily', 'online', '접속 보상', (g) => `접속 보상 ${g}번 받기`, [10, 50, 200, 500, 1000, 3000, 5000], (s) => s.stats.onlines, 1);
tiers('rank', 'best', '신기록', (g) => `신기록 ${n0(g)}번 세우기`, [1, 10, 50, 100, 300, 1000, 3000, 10000], (s) => s.stats.newBests);
tiers('rank', 'first', '랭킹 1위', (g) => `곡 랭킹 1위 ${g}번 차지하기`, [1, 5, 20, 50, 100, 300], (s) => s.stats.firsts, 3);
track('multi', 'mplay', '멀티 연주', (g) => `멀티 플레이 ${n0(g)}판`, [1, 5, 10, 30, 50, 100, 300, 500, 1000, 3000], (s) => s.stats.mplays);
track('multi', 'mwin', '멀티 1등', (g) => `멀티 플레이에서 ${n0(g)}번 1등`, [1, 3, 5, 10, 30, 50, 100, 300, 1000], (s) => s.stats.mwins, { t0: 1 });
track('social', 'friend', '친구 사귀기', (g) => `친구 ${g}명 사귀기`, [1, 3, 5, 10, 20, 30, 50, 100], (s) => s.stats.friends);
track('social', 'gift', '선물 천사', (g) => `친구에게 선물 ${n0(g)}번 보내기`, [1, 5, 10, 30, 50, 100, 300, 1000], (s) => s.stats.gifts);

// ── 캐릭터마다: 만나기 · 레벨 2~20 · 뽑은 횟수 · 팀으로 연주한 판 수 (예전 id: 만나기 · 3 · 5 · 7 · 10단계) ──
const OLD_ST = { 3: 'st3', 5: 'st5', 7: 'st7', 10: 'st10' };
for (const c of CHARS) {
  const r = c.rarity;
  track('char', `ch:${c.id}:own`, c.name, () => '처음 만나기', [1], (s) => (s.chars[c.id] ? 1 : 0), { legacy: [`ch:${c.id}:own`], reward: () => ({ coins: 300 * r }), char: c.id });
  const lv = upTo(2, MAX_LEVEL, 1);
  track('char', `ch:${c.id}:lv`, c.name, (g) => `${g}레벨 달성`, lv, (s) => s.chars[c.id] ?? 0, {
    char: c.id, legacy: lv.map((g) => (OLD_ST[g] ? `ch:${c.id}:${OLD_ST[g]}` : null)),
    reward: (i, g) => ({ gems: OLD_ST[g] ? [10, 25, 50, 100][[3, 5, 7, 10].indexOf(g)] * r : Math.round(5 * r * (1 + (g - 1) / 3)) }),
  });
  track('char', `ch:${c.id}:pull`, c.name, (g) => `뽑기에서 ${n0(g)}번 만나기`, [1, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500], (s) => s.stats.cp[c.id] ?? 0,
    { char: c.id, reward: (i) => ({ coins: r100(200 * r * (1 + i * 0.5)) }) });
  track('char', `ch:${c.id}:team`, c.name, (g) => `팀에 넣고 ${n0(g)}번 연주`, [1, 5, 10, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000], (s) => s.stats.tp[c.id] ?? 0,
    { char: c.id, reward: (i) => (i % 3 === 2 ? { gems: 10 * r + 5 * i } : { coins: r100(150 * (1 + i)) }) });
}

// ── 곡마다: 연주 횟수 · 클리어한 난이도 수 · S 난이도 수 · 풀콤보 난이도 수 (예전 id: 처음 · 10번 연주) ──
const G_SPLAY = [1, 3, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000];
const DONE8 = [1, 2, 3, 4, 5, 6, 7, 8];
const sdOf = (s, song) => s.stats.sd[song] ?? [];
for (const song of SONGS) {
  track('song', `sp:${song.id}`, song.title, (g) => `${n0(g)}번 연주하기`, G_SPLAY, (s) => s.stats.songPlays[song.id] ?? 0, {
    song: song.id, legacy: G_SPLAY.map((g) => (g === 1 || g === 10 ? `sp:${song.id}:${g}` : null)),
    reward: (i, g) => (g === 1 ? { coins: 200 } : g === 10 ? { coins: 1000 } : i % 4 === 3 ? { gems: 10 + i * 2 } : { coins: r100(100 * (1 + i)) }),
  });
  const cnt = (s, f) => DIFFS.filter((d) => f(`${song.id}:${d}`)).length;
  track('song', `sa:${song.id}`, song.title, (g) => `난이도 ${g}개 클리어`, DONE8, (s) => cnt(s, (k) => s.stats.clears[k]),
    { song: song.id, reward: (i) => (i % 2 ? { gems: 10 * (i + 1) } : { coins: r100(300 * (i + 1)) }) });
  track('song', `ss:${song.id}`, song.title, (g) => `난이도 ${g}개에서 S 랭크`, DONE8, (s) => cnt(s, (k) => s.stats.ss[k] || s.best[k]?.rank === 'S'),
    { song: song.id, reward: (i) => (i % 2 ? { gems: 15 * (i + 1) } : { coins: r100(400 * (i + 1)) }) });
  track('song', `sf:${song.id}`, song.title, (g) => `난이도 ${g}개 풀콤보`, DONE8, (s) => cnt(s, (k) => s.stats.fc[k]),
    { song: song.id, reward: (i) => (i % 2 ? { gems: 15 * (i + 1) } : { coins: r100(400 * (i + 1)) }) });
}

// ── 곡 × 난이도마다 7종류 (클리어 횟수 · 최고 점수 · S · 풀콤보 · ALL PERFECT · 연주 횟수 · 최대 콤보) ──
// 받은 단계는 s.achS[곡] 문자열의 (난이도 × 7 + 종류) 번째 글자. 예전 id: 기본 5난이도의 클리어 · S · 풀콤보
export const SD_KINDS = ['clear', 'score', 'srank', 'fc', 'ap', 'plays', 'combo'];
const SDK = SD_KINDS.length;
const G_SD = {
  clear: [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 75, 100],
  score: [500000, 700000, 800000, 900000, 1000000, 1100000, 1200000, 1400000, 1600000, 1800000, 2000000],
  srank: [1], fc: [1], ap: [1],
  plays: [1, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500],
  combo: [50, 100, 150, 200, 300, 400, 500],
};
const SD_DESC = {
  clear: (d) => (g) => `${d} ${n0(g)}번 클리어`, score: (d) => (g) => `${d} 최고 점수 ${n0(g)}점`, srank: (d) => () => `${d} S 랭크`,
  fc: (d) => () => `${d} 풀콤보`, ap: (d) => () => `${d} ALL PERFECT`, plays: (d) => (g) => `${d} ${n0(g)}번 연주`, combo: (d) => (g) => `${d} ${n0(g)}콤보`,
};
const OLD_SD = { clear: 'sc', srank: 'ss', fc: 'sf' };
const OLD_REWARD = {
  clear: { easy: { coins: 300 }, normal: { coins: 500 }, hard: { gems: 20 }, expert: { gems: 40 }, master: { gems: 80 }, extreme: { gems: 120 }, inferno: { gems: 160 }, chaos: { gems: 220 } },
  srank: { easy: { coins: 500 }, normal: { coins: 800 }, hard: { gems: 40 }, expert: { gems: 80 }, master: { gems: 150 }, extreme: { gems: 200 }, inferno: { gems: 260 }, chaos: { gems: 350 } },
  fc: { easy: { gems: 10 }, normal: { gems: 20 }, hard: { gems: 40 }, expert: { gems: 80 }, master: { gems: 150 }, extreme: { gems: 200 }, inferno: { gems: 260 }, chaos: { gems: 350 } },
};
const DM = [1, 1.2, 1.5, 2, 3, 3.5, 4, 5];
const SD_STAT = {
  clear: (s, song, d) => Math.max(sdOf(s, song)[8 + d] ?? 0, s.stats.clears[`${song}:${DIFFS[d]}`] ? 1 : 0),
  score: (s, song, d) => s.best[`${song}:${DIFFS[d]}`]?.score ?? 0,
  srank: (s, song, d) => (s.stats.ss[`${song}:${DIFFS[d]}`] || s.best[`${song}:${DIFFS[d]}`]?.rank === 'S' ? 1 : 0),
  fc: (s, song, d) => (s.stats.fc[`${song}:${DIFFS[d]}`] ? 1 : 0),
  ap: (s, song, d) => (s.stats.ap[`${song}:${DIFFS[d]}`] ? 1 : 0),
  plays: (s, song, d) => sdOf(s, song)[d] ?? 0,
  combo: (s, song, d) => sdOf(s, song)[16 + d] ?? 0,
};
for (const song of SONGS) {
  DIFFS.forEach((d, di) => SD_KINDS.forEach((kind, ki) => {
    const old = OLD_SD[kind] && di < 5 ? `${OLD_SD[kind]}:${song.id}:${d}` : null;
    track('song', `${kind}:${song.id}:${d}`, song.title, SD_DESC[kind](DIFF_NAME[d]), G_SD[kind], (s) => SD_STAT[kind](s, song.id, di), {
      song: song.id, diff: d, sd: [song.id, di * SDK + ki], legacy: old ? [old] : undefined,
      reward: OLD_REWARD[kind] ? () => OLD_REWARD[kind][d]
        : (i) => (i % 3 === 2 ? { coins: r100(80 * DM[di] * (1 + i * 0.4)), gems: Math.round(4 * DM[di] * (1 + i / 3)) } : { coins: r100(80 * DM[di] * (1 + i * 0.4)) }),
    });
  }));
}

export const ACH_TRACKS = TRACKS;
export const ACH_TRACK = table(TRACKS.map((t) => [t.id, t]));
export const ACH_TOTAL = TRACKS.reduce((a, t) => a + t.goals.length, 0); // 업적 개수 (단계 하나 = 업적 하나)

// 받은 단계 수 읽기 · 쓰기
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
export const claimedOf = (s, t) => (t.sd ? B36.indexOf(s.achS[t.sd[0]]?.[t.sd[1]] ?? '0') : s.ach[t.id] ?? 0);
function setClaimed(s, t, n) {
  if (!t.sd) return void (s.ach[t.id] = n);
  const str = (s.achS[t.sd[0]] ?? '').padEnd(DIFFS.length * SDK, '0').split('');
  str[t.sd[1]] = B36[n];
  s.achS[t.sd[0]] = str.join('').replace(/0+$/, '');
}
// 받은 업적 수 (단계 합)
export const achCount = (s) => TRACKS.reduce((a, t) => a + claimedOf(s, t), 0);
// 트랙의 지금 단계 { i(다음 단계 번호 · 다 받았으면 goals.length), goal, value, ready, done }
export function achView(s, t, x = ctxOf(s)) {
  const i = claimedOf(s, t), value = t.stat(s, x), done = i >= t.goals.length;
  return { i, goal: t.goals[Math.min(i, t.goals.length - 1)], value, done, ready: !done && value >= t.goals[i] };
}
export const achCtx = (s) => ctxOf(s);
// 지금 받을 수 있는 트랙들
export const claimable = (s) => {
  const x = ctxOf(s);
  return TRACKS.filter((t) => achView(s, t, x).ready);
};

/* ---------- 오늘의 미션 · 접속 보상 ---------- */

// 오늘의 미션 (매일 한국 시간 0시에 초기화)
export const MISSIONS = [
  { id: 'm_play', name: '3곡 연주하기', goal: 3, stat: (d) => d.plays, reward: { coins: 1000 } },
  { id: 'm_clear', name: '2곡 클리어하기', goal: 2, stat: (d) => d.clears, reward: { gems: 30 } },
  { id: 'm_hard', name: 'HARD 이상 1곡 클리어', goal: 1, stat: (d) => d.hard, reward: { gems: 50 } },
  { id: 'm_perfect', name: 'PERFECT 300개', goal: 300, stat: (d) => d.perfects, reward: { coins: 1500 } },
  { id: 'm_combo', name: '한 곡에서 100콤보', goal: 100, stat: (d) => d.combo, reward: { gems: 30 } },
  { id: 'm_pull', name: '뽑기 1번 하기', goal: 1, stat: (d) => d.pulls, reward: { coins: 500 } },
  { id: 'm_all', name: '오늘의 미션 모두 완료', goal: 6, stat: (d) => d.claimed.filter((x) => x !== 'm_all').length, reward: { gems: 100 } },
];

// 접속 시간 보상: 오늘 처음 들어온 뒤 min분이 지나면 받을 수 있다
export const ONLINE = [
  { id: 'o5', min: 5, reward: { coins: 300 } },
  { id: 'o15', min: 15, reward: { gems: 30 } },
  { id: 'o30', min: 30, reward: { coins: 1000 } },
  { id: 'o60', min: 60, reward: { gems: 60 } },
  { id: 'o120', min: 120, reward: { coins: 2500, gems: 100 } },
];

export class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };
const cheat = (msg) => { throw Object.assign(new GameError(msg), { cheat: true }); }; // 화면에서는 나올 수 없는 기록 (서버가 보안 기록에 남긴다)
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

// 한국 시간 기준 날짜 (출석 · 미션 · 접속 보상 · 환전 · 선물 횟수용)
export const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const freshDay = () => ({ date: today(), plays: 0, clears: 0, hard: 0, perfects: 0, combo: 0, pulls: 0, claimed: [], ex: {}, gifts: [] });
export const dayOf = (s) => (s.day.date === today() ? s.day : freshDay());

export function newSave() {
  return {
    v: 4, coins: 3000, gems: 1500, exp: 0, avatar: 1, frame: -1,
    chars: { hachiware: 1, chiikawa: 1, usagi: 1 }, dup: {},
    team: ['hachiware', 'chiikawa', 'usagi', null],
    items: { heart: 1, star: 1, feather: 1 },
    songs: [], avatars: [], themes: [], theme: 'default', best: {}, ach: {}, achS: {}, daily: '', pity: {}, rookie: false, renames: 0,
    attend: { month: '', count: 0 },
    day: { ...freshDay(), date: '' },
    online: { date: '', start: 0, claimed: [] },
    stats: {
      plays: 0, clears: {}, sRanks: 0, fullCombos: 0, allPerfects: 0, maxCombo: 0, perfects: 0, pulls: 0, legends: 0, mythics: 0, gods: 0, coinsEarned: 0, buys: 0,
      days: 0, missions: 0, onlines: 0, levelUps: 0, newBests: 0, firsts: 0, mplays: 0, mwins: 0, friends: 0, gifts: 0,
      diffClears: Object.fromEntries(DIFFS.map((d) => [d, 0])),
      songPlays: {}, fc: {}, ss: {}, ap: {}, sd: {}, cp: {}, tp: {},
    },
  };
}

// 예전 저장 데이터에 새 항목이 없어도 기본값으로 채운다. v4 전 데이터는 한 번 옮긴다 (진화 → 레벨, 받은 업적 목록 → 트랙 단계)
export function normalize(s) {
  const d = newSave();
  if (!s || typeof s !== 'object') return d;
  const st = s.stats ?? {};
  const out = {
    ...d, ...s,
    pity: typeof s.pity === 'number' ? { std: s.pity } : { ...s.pity },
    chars: { ...s.chars }, dup: { ...s.dup }, items: { ...d.items, ...s.items }, ach: { ...s.ach }, achS: { ...s.achS },
    attend: { ...d.attend, ...s.attend },
    day: { ...d.day, ...s.day, ex: { ...s.day?.ex }, gifts: Array.isArray(s.day?.gifts) ? [...s.day.gifts] : [] },
    online: { ...d.online, ...s.online },
    stats: { ...d.stats, ...st, diffClears: { ...d.stats.diffClears, ...st.diffClears }, ap: { ...st.ap }, sd: { ...st.sd }, cp: { ...st.cp }, tp: { ...st.tp } },
  };
  if ((Number(s.v) || 1) < 4) migrate(out, s);
  return out;
}

function migrate(out, s) {
  // 진화 1번 = 3레벨 (최고 20레벨). 진화 기록 · 진화 재료 개념은 없어진다
  for (const [id, lv] of Object.entries(out.chars)) {
    if (CHAR[id] && Number.isInteger(lv)) out.chars[id] = Math.min(MAX_LEVEL, Math.max(1, lv + 3 * (Number(s.evo?.[id]) || 0)));
  }
  out.stats.levelUps = Number(s.stats?.evos) || 0;
  // 곡 × 난이도 클리어 기록 → 클리어 횟수 1번부터
  for (const k of Object.keys(out.stats.clears)) {
    const [song, diff] = k.split(':'), di = DIFFS.indexOf(diff);
    if (!SONG[song] || di < 0) continue;
    const sd = (out.stats.sd[song] = Array.from({ length: 24 }, (_, i) => out.stats.sd[song]?.[i] ?? 0));
    sd[8 + di] = Math.max(sd[8 + di], 1);
  }
  delete out.evo;
  delete out.stats.evos;
  delete out.stats.evoFails;
  // 받은 업적 목록 → 트랙마다 받은 단계 수 (예전에 받은 가장 높은 단계까지 받은 것으로)
  const got = new Set(Array.isArray(s.claimed) ? s.claimed : []);
  if (got.size) {
    for (const t of TRACKS) {
      if (!t.legacy) continue;
      let n = 0;
      t.legacy.forEach((id, i) => { if (id && got.has(id)) n = i + 1; });
      if (n > claimedOf(out, t)) setClaimed(out, t, n);
    }
  }
  delete out.claimed;
  out.v = 4;
}

export const unlocked = (s, song) => song.price === 0 || s.songs.includes(song.id);
export const ownedAvatar = (s, n) => n <= FREE_AVATARS || s.avatars.includes(n);
export const missionsReady = (s) => { const d = dayOf(s); return MISSIONS.filter((m) => !d.claimed.includes(m.id) && m.stat(d) >= m.goal); };
export const onlineReady = (s, now = Date.now()) =>
  s.online.date === today() ? ONLINE.filter((o) => !s.online.claimed.includes(o.id) && now - s.online.start >= o.min * 60e3) : [];

function rollRarity(rates, min, rand) {
  const w = rates.map((r, i) => (i + 1 >= min ? r : 0)), sum = w.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i + 1;
  return w.findLastIndex((x) => x > 0) + 1;
}

function pickChar(b, r, rand) {
  if (b.pickup && r === 4 && rand() < 0.5) return pickupOf();
  const pool = b.pools?.[r] ?? ofRarity(r);
  return pool[Math.floor(rand() * pool.length)];
}

// 한 장 뽑기 (천장 · 최소 등급 반영). 처음 만나면 1레벨, 또 만나면 레벨 업 재료 카드 +1. 최고 레벨까지 쓸 카드가 다 모였으면 보석으로 돌려준다
function pullOne(s, b, rand, atLeast = 1) {
  const pityHit = b.pity && (s.pity[b.id] ?? 0) + 1 >= b.pity;
  const r = rollRarity(b.rates, pityHit ? 4 : atLeast, rand);
  if (b.pity) s.pity[b.id] = r >= 4 ? 0 : (s.pity[b.id] ?? 0) + 1;
  const id = pickChar(b, r, rand), lv = s.chars[id] ?? 0;
  let refund = 0;
  if (!lv) s.chars[id] = 1;
  else if ((s.dup[id] ?? 0) >= copiesToMax(r, lv)) {
    refund = RARITY[r].refund;
    s.gems += refund;
  } else s.dup[id] = (s.dup[id] ?? 0) + 1;
  s.stats.cp[id] = (s.stats.cp[id] ?? 0) + 1;
  if (r >= 4) s.stats.legends++;
  if (r >= 5) s.stats.mythics++;
  if (r === 6) s.stats.gods++;
  s.stats.pulls++;
  s.day.pulls++;
  const L = s.chars[id];
  return { id, rarity: r, isNew: !lv, level: L, dup: s.dup[id] ?? 0, need: L < MAX_LEVEL ? copiesFor(r, L) : 0, refund };
}

function pay(s, coins, gems = 0) {
  if (s.coins < coins) fail('코인이 부족해요');
  if (s.gems < gems) fail('보석이 부족해요');
  s.coins -= coins;
  s.gems -= gems;
}

function give(s, r) {
  s.coins += r.coins ?? 0;
  s.gems += r.gems ?? 0;
  if (r.coins) s.stats.coinsEarned += r.coins;
  if (r.item) s.items[r.item] = (s.items[r.item] ?? 0) + 1;
  for (const [k, n] of Object.entries(r.items ?? {})) s.items[k] = (s.items[k] ?? 0) + n;
}

function levelUpOnce(s, id) {
  const c = CHAR[id], L = s.chars[id];
  const need = copiesFor(c.rarity, L), coins = coinsFor(c.rarity, L);
  pay(s, coins);
  s.dup[id] -= need;
  if (!s.dup[id]) delete s.dup[id];
  s.chars[id] = L + 1;
  s.stats.levelUps++;
  return coins;
}

// 모든 재화 변동은 여기서만. 잘못된 요청은 GameError(한국어 메시지). cfg: 관리자 설정 (뽑기 확률 등)
export function act(input, a, rand = Math.random, cfg = {}) {
  const s = structuredClone(normalize(input));
  const done = (result = {}) => ({ save: s, result });
  if (s.day.date !== today()) s.day = freshDay();
  switch (a?.type) {
    case 'pull': {
      const b = bannerOf(a.banner, cfg), n = a.count === 10 ? 10 : 1;
      if (b.once && (s.rookie || n !== 10)) fail(s.rookie ? '초보자 뽑기는 이미 썼어요' : '초보자 뽑기는 10회만 돼요');
      pay(s, (b.cost.coins ?? 0) * n, (b.cost.gems ?? 0) * n);
      if (b.once) s.rookie = true;
      const cards = [];
      for (let i = 0; i < n; i++) cards.push(pullOne(s, b, rand, n === 10 && i === 9 && cards.every((c) => c.rarity < b.ten) ? b.ten : 1));
      return done({ cards });
    }

    // 원하는 등급 이상이 나올 때까지 1장씩 뽑기 (재화가 떨어지거나 max장이 되면 멈춘다)
    case 'pullUntil': {
      const b = bannerOf(a.banner, cfg), want = a.rarity, max = isInt(a.max, 1, 500) ? a.max : 300;
      if (b.once) fail('초보자 뽑기는 이 기능을 못 써요');
      if (!isInt(want, 2, TOP) || !b.rates.slice(want - 1).some((r) => r > 0)) fail('이 뽑기에서는 나오지 않는 등급이에요');
      const cards = [], cost = b.cost;
      while (cards.length < max && s.coins >= (cost.coins ?? 0) && s.gems >= (cost.gems ?? 0)) {
        pay(s, cost.coins ?? 0, cost.gems ?? 0);
        const c = pullOne(s, b, rand);
        cards.push(c);
        if (c.rarity >= want) break;
      }
      if (!cards.length) fail(cost.coins ? '코인이 부족해요' : '보석이 부족해요');
      return done({ cards, found: cards.at(-1).rarity >= want, want });
    }

    case 'team': {
      const t = a.team;
      if (!Array.isArray(t) || t.length !== 4) fail('팀 구성이 이상해요');
      const ids = t.filter(Boolean);
      if (ids.some((id) => !s.chars[id] || !CHAR[id]) || new Set(ids).size !== ids.length) fail('팀 구성이 이상해요');
      s.team = t.map((id) => id || null);
      return done();
    }

    // 같은 친구 카드를 모아 레벨 업 (카드 + 코인)
    case 'levelUp': {
      const c = CHAR[a.id], L = s.chars[a.id];
      if (!c || !L) fail('아직 없는 친구예요');
      if (L >= MAX_LEVEL) fail('이미 최고 레벨이에요');
      const need = copiesFor(c.rarity, L);
      if ((s.dup[a.id] ?? 0) < need) fail(`같은 친구 카드가 ${need}장 필요해요 (지금 ${s.dup[a.id] ?? 0}장)`);
      const coins = levelUpOnce(s, a.id);
      return done({ id: a.id, level: L + 1, coins });
    }

    // 레벨 업할 수 있는 친구를 모두 (코인이 떨어질 때까지, 카드 점수 높은 친구부터)
    case 'levelUpAll': {
      let count = 0, coins = 0;
      const ups = {};
      const ids = Object.keys(s.chars).filter((id) => CHAR[id]).sort((x, y) => CHAR[y].rarity - CHAR[x].rarity || powerOf(s, y) - powerOf(s, x));
      for (const id of ids) {
        while (canLevel(s, id)) {
          coins += levelUpOnce(s, id);
          count++;
          ups[id] = s.chars[id];
        }
      }
      if (!count) fail('지금 레벨 업할 수 있는 친구가 없어요');
      return done({ count, coins, ups });
    }

    case 'buy': {
      const id = String(a.item ?? '');
      if (id.startsWith('song:')) {
        const song = SONG[id.slice(5)];
        if (!song || unlocked(s, song)) fail('살 수 없는 곡이에요');
        pay(s, song.price);
        s.songs.push(song.id);
      } else if (id.startsWith('avatar:')) {
        const n = Number(id.slice(7));
        if (!isInt(n, FREE_AVATARS + 1, 32) || s.avatars.includes(n)) fail('살 수 없는 프로필이에요');
        pay(s, AVATAR_PRICE);
        s.avatars.push(n);
      } else if (id.startsWith('theme:')) {
        const t = THEME[id.slice(6)];
        if (!t?.price || s.themes.includes(t.id)) fail('살 수 없는 테마예요');
        pay(s, t.price);
        s.themes.push(t.id);
        s.theme = t.id; // 사면 바로 쓴다
      } else if (id.startsWith('card:')) {
        const cid = id.slice(5), n = s.day.cards?.[cid] ?? 0;
        if (!cardsOf().includes(cid)) fail('오늘은 팔지 않는 카드예요');
        if (n >= CARD_SHOP.max) fail('오늘은 이 카드를 다 샀어요. 내일 다시 와 주세요');
        pay(s, cardPrice(cid, n));
        if (s.chars[cid]) s.dup[cid] = (s.dup[cid] ?? 0) + 1;
        else s.chars[cid] = 1;
        s.day.cards = { ...s.day.cards, [cid]: n + 1 };
        s.stats.buys++;
        return done({ card: cid });
      } else if (id === 'potion') {
        const n = s.day.potion ?? 0, before = levelOf(s.exp);
        if (n >= POTION.max) fail('오늘은 물약을 다 샀어요. 내일 다시 와 주세요');
        if (before >= MAX_LV) fail('이미 최고 레벨이에요');
        pay(s, POTION.coins(before, n));
        s.exp += POTION.exp;
        s.day.potion = n + 1;
        const after = levelOf(s.exp), g = levelGifts(before, after);
        give(s, g);
        s.stats.buys++;
        return done({ levelUp: after > before ? after : 0, levelGift: after > before ? g : null });
      } else {
        const item = SHOP.find((x) => x.id === id);
        if (!item) fail('없는 상품이에요');
        const p = priceOf(s, item);
        if (p.left <= 0) fail('오늘은 더 바꿀 수 없어요. 내일 다시 와 주세요');
        if (item.give.lucky) {
          const n = s.day.lucky ?? 0;
          if (n >= LUCKY.max) fail(`행운 상자는 하루 ${LUCKY.max}번까지예요`);
          pay(s, p.coins);
          s.day.lucky = n + 1;
          let x = rand() * LUCKY.table.reduce((a, t) => a + t.w, 0), got = LUCKY.table[0];
          for (const t of LUCKY.table) if ((x -= t.w) < 0) { got = t; break; }
          let card = null;
          if (got.card) { // 가진 친구 중 하나의 레벨 업 카드 (초월 빼고)
            const own = Object.keys(s.chars).filter((id) => CHAR[id] && CHAR[id].rarity < TOP);
            card = own[Math.floor(rand() * own.length)];
            s.dup[card] = (s.dup[card] ?? 0) + 1;
          } else give(s, got);
          s.stats.buys++;
          return done({ lucky: { coins: got.coins ?? 0, gems: got.gems ?? 0, items: got.items ?? null, card } });
        }
        pay(s, p.coins, p.gems);
        s.coins += p.give.coins ?? 0;
        s.gems += p.give.gems ?? 0;
        if (p.give.item) s.items[p.give.item] = (s.items[p.give.item] ?? 0) + 1;
        if (item.ex) s.day.ex[item.ex] = (s.day.ex[item.ex] ?? 0) + 1;
      }
      s.stats.buys++;
      return done();
    }

    // 업적 트랙의 다음 단계 받기
    case 'claim': {
      const t = ACH_TRACK[a.id];
      if (!t) fail('없는 업적이에요');
      const v = achView(s, t);
      if (v.done) fail('이미 다 받은 업적이에요');
      if (!v.ready) fail('아직 조건을 채우지 못했어요');
      const reward = t.reward(v.i, t.goals[v.i]);
      setClaimed(s, t, v.i + 1);
      give(s, reward);
      return done({ ...reward, name: tierName(t, v.i) });
    }

    // 받을 수 있는 업적을 모두 받기 (보상으로 코인이 늘어 다음 업적이 열릴 수 있어서 더 없을 때까지 반복)
    case 'claimAll': {
      const sum = { coins: 0, gems: 0, count: 0 };
      for (let round = 0; round < 50; round++) {
        const x = ctxOf(s);
        let got = 0;
        for (const t of TRACKS) {
          for (let v = achView(s, t, x); v.ready; v = achView(s, t, x)) {
            const r = t.reward(v.i, t.goals[v.i]);
            setClaimed(s, t, v.i + 1);
            give(s, r);
            sum.coins += r.coins ?? 0;
            sum.gems += r.gems ?? 0;
            sum.count++;
            got++;
          }
        }
        if (!got) break;
      }
      if (!sum.count) fail('받을 업적이 없어요');
      return done(sum);
    }

    case 'mission': {
      const m = MISSIONS.find((x) => x.id === a.id);
      if (!m) fail('없는 미션이에요');
      if (s.day.claimed.includes(m.id)) fail('이미 받은 보상이에요');
      if (m.stat(s.day) < m.goal) fail('아직 미션을 다 못 했어요');
      s.day.claimed.push(m.id);
      s.stats.missions++;
      give(s, m.reward);
      return done(m.reward);
    }

    case 'hello': {
      if (s.online.date !== today()) s.online = { date: today(), start: Date.now(), claimed: [] };
      return done();
    }

    case 'online': {
      const o = ONLINE.find((x) => x.id === a.id);
      if (!o) fail('없는 보상이에요');
      if (s.online.date !== today()) fail('오늘 접속 시간을 새로 재고 있어요');
      if (s.online.claimed.includes(o.id)) fail('이미 받은 보상이에요');
      if (Date.now() - s.online.start < o.min * 60e3) fail(`접속 ${o.min}분이 지나면 받을 수 있어요`);
      s.online.claimed.push(o.id);
      s.stats.onlines++;
      give(s, o.reward);
      return done(o.reward);
    }

    // 월간 출석: 이번 달 출석 횟수가 늘수록 보상이 커진다 (100레벨마다 +10%)
    case 'daily': {
      if (s.daily === today()) fail('오늘 출석 보상은 이미 받았어요');
      if (s.attend.month !== monthOf()) s.attend = { month: monthOf(), count: 0 };
      s.daily = today();
      s.attend.count++;
      s.stats.days++;
      const base = ATTEND[Math.min(ATTEND.length, s.attend.count) - 1], k = 1 + perksOf(levelOf(s.exp)).attend / 100;
      const reward = Object.fromEntries(Object.entries(base).map(([key, v]) => [key, Math.round(v * k)]));
      give(s, reward);
      return done({ ...reward, day: s.attend.count });
    }

    case 'avatar': {
      if (!isInt(a.avatar, 1, 32) || !ownedAvatar(s, a.avatar)) fail('아직 없는 프로필이에요');
      s.avatar = a.avatar;
      return done({ avatar: a.avatar });
    }

    // 가진 연주 테마로 바꾸기
    case 'theme': {
      if (!THEME[a.id] || !ownedTheme(s, a.id)) fail('아직 없는 테마예요');
      s.theme = a.id;
      return done();
    }

    // 프로필 테두리 고르기 (-1 = 늘 가장 높은 테두리)
    case 'frame': {
      if (a.tier !== -1 && !(isInt(a.tier, 0, 100) && a.tier <= frameTier(levelOf(s.exp)))) fail('아직 열리지 않은 테두리예요');
      s.frame = a.tier;
      return done({ frame: frameOfSave(s) });
    }

    case 'start': {
      const song = SONG[a.song];
      if (!song || !DIFFS.includes(a.diff)) fail('없는 곡이에요');
      if (!unlocked(s, song)) fail('아직 잠긴 곡이에요');
      const boosters = [...new Set(Array.isArray(a.boosters) ? a.boosters : [])].filter((k) => BOOSTERS[k] && boosterWorks(s, k));
      for (const k of boosters) if (!(s.items[k] > 0)) fail(`${BOOSTERS[k].name}이(가) 없어요`);
      for (const k of boosters) s.items[k]--;
      s.pend = boosters; // 끝낼 때 서버가 다시 본다 (코인 · 경험치 적용 + 가능한 점수 계산)
      s.run = { k: `${song.id}:${a.diff}`, at: Date.now() }; // 언제 무슨 곡을 시작했는지 (끝낼 때 걸린 시간을 확인)
      return done({ boosters });
    }

    // ponytail: 점수는 클라이언트 계산값을 범위만 검사해 믿는다. 상금이 걸린 랭킹이 되면 입력 로그 서버 재검증 필요
    case 'finish': {
      const song = SONG[a.song], { diff, raw, score, combo, rank, perfect = 0 } = a;
      if (!song || !DIFFS.includes(diff) || !RANKS.includes(rank) || !isInt(raw, 0, 1e6) ||
          !isInt(score, 0, 1e7) || !isInt(combo, 0, 5000) || !isInt(perfect, 0, 5000)) fail('기록 형식이 이상해요');
      const cleared = a.cleared === true, multi = a.multi === true, key = `${song.id}:${diff}`, m = DIFF_MULT[diff], di = DIFFS.indexOf(diff);
      const b = teamBuffs(s, multi ? [] : (s.pend ?? []).filter((k) => BOOSTERS[k]));
      // 서버에서만 (cfg.chart가 있을 때): 화면을 거치지 않고 기록만 보내는 걸 막는다
      // 시작한 기록(싱글은 start · 멀티는 방의 판)이 있어야 하고, 그 뒤 지난 시간 안에 나올 수 있는 노트 수 · 팀 버프로 가능한 점수여야 한다
      // ponytail: 실제 곡 길이만큼 기다렸다가 그럴듯한 기록을 보내는 자동 프로그램까지는 못 막는다. 상금이 걸리면 입력 기록을 받아 서버에서 다시 채점
      if (cfg.chart) {
        const run = multi ? cfg.mrun : s.run, c = cfg.chart(song.id, diff), E = run?.k === key ? run.e ?? Date.now() - run.at : -1; // E: 시작한 뒤 지난 ms
        if (E < 0) cheat('연주를 시작한 기록이 없어요. 곡을 다시 시작해 주세요');
        if (multi && s.mrun === run.m) cheat('이 판의 보상은 이미 받았어요');
        const n = c.at(E / 1000); // 지금까지 나올 수 있었던 판정 수
        if (E < 2500 || ((cleared || multi) && E < c.ms) || raw > (1e6 * n) / c.total + 1 || combo > n || perfect > n
          || raw > (1e6 * (perfect + 0.7 * (c.total - perfect))) / c.total + 1 || score > Math.round(raw * (1 + (multi ? 0 : b.score) / 100)) + 1
          || rank !== botRank(raw) || (a.fullCombo === true && combo !== c.total) || (a.allPerfect === true && perfect !== c.total)) cheat('기록이 이상해서 저장하지 못했어요');
        if (multi) s.mrun = run.m;
      }
      delete s.run;
      s.pend = [];
      const before = levelOf(s.exp), perk = perksOf(before);
      const coins = Math.round((Math.round((raw / 1e6) * 600) + (cleared ? 150 : 0)) * m * (1 + (b.coin + perk.coin) / 100) * (cleared ? 1 : 0.4));
      let gems = cleared && !s.stats.clears[key] ? FIRST_GEMS[diff] : 0;
      const exp = Math.round((cleared ? 20 + { S: 30, A: 20, B: 12, C: 6, D: 0 }[rank] : 8) * m * (1 + (b.exp + perk.exp) / 100));
      s.exp += exp;
      const after = levelOf(s.exp), levelUp = after > before ? after : 0, levelGift = levelGifts(before, after);
      const st = s.stats, d = s.day;
      st.plays++;
      st.songPlays[song.id] = (st.songPlays[song.id] ?? 0) + 1;
      const sd = (st.sd[song.id] = Array.from({ length: 24 }, (_, i) => st.sd[song.id]?.[i] ?? 0));
      sd[di]++;
      sd[16 + di] = Math.max(sd[16 + di], combo);
      for (const id of s.team) if (id && CHAR[id] && s.chars[id]) st.tp[id] = (st.tp[id] ?? 0) + 1;
      if (multi) st.mplays++;
      st.coinsEarned += coins;
      st.maxCombo = Math.max(st.maxCombo, combo);
      st.perfects += perfect;
      d.plays++;
      d.perfects += perfect;
      d.combo = Math.max(d.combo, combo);
      if (cleared) {
        st.clears[key] = true;
        st.diffClears[diff] = (st.diffClears[diff] ?? 0) + 1;
        sd[8 + di]++;
        d.clears++;
        if (di >= 2) d.hard++;
        if (rank === 'S') { st.sRanks++; st.ss[key] = true; }
        if (a.fullCombo === true) { st.fullCombos++; st.fc[key] = true; }
        if (a.allPerfect === true) { st.allPerfects++; st.ap[key] = true; }
      }
      const prev = s.best[key], newBest = cleared && (!prev || score > prev.score);
      if (newBest) {
        s.best[key] = { score, rank, combo };
        st.newBests++;
      }
      s.coins += coins;
      s.gems += gems;
      if (levelUp) {
        give(s, levelGift);
        gems += levelGift.gems;
      }
      return done({ coins: coins + (levelUp ? levelGift.coins : 0), gems, exp, levelUp, levelFrom: before, levelGift: levelUp ? levelGift : null, newBest, cleared, prev: prev?.score ?? 0 });
    }

    // ---------- 서버만 부르는 행동 ----------
    // 곡 랭킹 1위를 차지했을 때
    case 'first': {
      s.stats.firsts++;
      return done();
    }
    // 멀티 판에서 1등
    case 'mpWin': {
      s.stats.mwins++;
      return done();
    }
    // 친구 수 기록 (업적용: 지금까지 가장 많았던 친구 수)
    case 'friends': {
      if (isInt(a.n, 0, 10000)) s.stats.friends = Math.max(s.stats.friends, a.n);
      return done();
    }
    // 친구에게 선물 보내기 (보내는 사람 쪽): free(무료 · 친구마다 하루 1번) · coins · gems. 하루 보낼 수 있는 횟수는 레벨 혜택
    case 'gift': {
      const per = perksOf(levelOf(s.exp)), to = a.to;
      if (!isInt(to, 1, 2 ** 31 - 1)) fail('선물 받을 친구를 골라 주세요');
      if (s.day.gifts.length >= per.gifts) fail(`선물은 하루 ${per.gifts}번까지 보낼 수 있어요 (레벨이 오르면 늘어나요)`);
      let give2 = null;
      if (a.kind === 'free') {
        if (s.day.gifts.includes(`f${to}`)) fail('오늘 이 친구에게는 이미 무료 선물을 보냈어요');
        s.coins += GIFT.free.back;
        s.stats.coinsEarned += GIFT.free.back;
        give2 = GIFT.free.give;
      } else if (a.kind === 'coins' && GIFT.coins.includes(a.amount)) {
        pay(s, a.amount);
        give2 = { coins: a.amount, gems: 0 };
      } else if (a.kind === 'gems' && GIFT.gems.includes(a.amount)) {
        pay(s, 0, a.amount);
        give2 = { coins: 0, gems: a.amount };
      } else fail('선물 종류가 이상해요');
      s.day.gifts.push(`${a.kind[0]}${to}`);
      s.stats.gifts++;
      return done({ give: give2, back: a.kind === 'free' ? GIFT.free.back : 0, left: per.gifts - s.day.gifts.length });
    }
    // 친구들에게 점수 자랑 (하루 BOAST_MAX번 · 우편은 서버가 보낸다)
    case 'boast': {
      const n = s.day.boasts ?? 0;
      if (n >= BOAST_MAX) fail(`자랑은 하루 ${BOAST_MAX}번까지 할 수 있어요. 내일 또 자랑해요!`);
      s.day.boasts = n + 1;
      return done({ left: BOAST_MAX - n - 1 });
    }
    // 관리자가 친구(캐릭터) 선물하기: 없으면 1레벨로, 있으면 카드 +1
    case 'grant': {
      const c = CHAR[a.id];
      if (!c) fail('없는 친구예요');
      if (!s.chars[a.id]) s.chars[a.id] = 1;
      else s.dup[a.id] = (s.dup[a.id] ?? 0) + 1;
      return done({ id: a.id, level: s.chars[a.id] });
    }

    default:
      fail('알 수 없는 요청이에요');
  }
}

// 클라이언트가 /api/act로 직접 보내면 안 되는 행동
export const SERVER_ONLY = new Set(['first', 'mpWin', 'friends', 'gift', 'grant', 'boast']);
