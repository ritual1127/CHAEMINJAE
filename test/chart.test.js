// node --test : 곡 데이터 · 채보(8단계 · 변주) · 판정 · 게임 규칙(뽑기 6등급/확정 뽑기/관리자 확률/친구 레벨 업/카드 점수/환전/월간 출석/업적 트랙/미션/접속 보상)
//               · 플레이어 레벨(1~1000) · 테두리 · 레벨 혜택 · 멀티(순위 · 목표 · 아이템 노트) · 친구 선물 · 예전 저장 데이터 옮기기
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, SONG, DIFFS, compile, makeChart, chartLevel, midi, playSong, SPEED, songMatch, GENRES } from '../public/songs.js';
import { judgeOf, rankOf } from '../public/game.js';
import {
  act, newSave, normalize, teamBuffs, teamPower, powerOf, bestTeam, GameError, MAX_LEVEL, MAX_LV, CHARS, CHAR, BANNERS, BANNER, RARITY, TOP, GOD_RATE,
  ACH_TRACKS, ACH_TRACK, ACH_TOTAL, ACH_CATS, achCount, achView, claimedOf, MISSIONS, weekOf, pickupOf, pickupEnds, SERVER_ONLY, claimable, bannerOf, priceOf, SHOP,
  ATTEND, attendOf, today, copiesFor, copiesToMax, coinsFor, levelOf, expAt, expNeed, expProgress, levelReward, perksOf, frameInfo, frameTier, frameOfSave,
  mpOrder, mpTarget, INQUIRY, MP, ATTACKS, itemize, GIFT, valueAt,
} from '../public/rules.js';

const low = () => 0.01; // 가장 흔한 결과(일반 · 목록 첫 친구)가 나오는 난수

test('음 이름 → MIDI', () => {
  assert.equal(midi('A4'), 69);
  assert.equal(midi('C5'), 72);
  assert.equal(midi('F#5'), 78);
  assert.equal(midi('Bb4'), 70);
});

for (const song of SONGS) {
  test(`${song.title}: 마디 칸 수 · 노트`, () => {
    const c = compile(song); // 칸 수가 틀리면 여기서 throw
    assert.ok(c.duration > 25 && c.duration < 100, `길이 ${c.duration.toFixed(1)}초`);
    let prevCount = 0;
    for (const diff of DIFFS) {
      const { tiles } = makeChart(song, diff);
      assert.ok(tiles.length > 20, `${diff} 노트 ${tiles.length}개`);
      assert.ok(tiles.length >= prevCount, `${diff}가 더 쉬운 난이도보다 노트가 적음`);
      prevCount = tiles.length;
      assert.ok(tiles.every((n) => n.lane >= 0 && n.lane <= 3));
      assert.ok(tiles.every((n, i) => i === 0 || n.t >= tiles[i - 1].t), '시간순');
      assert.equal(new Set(tiles.map((n) => `${n.t}:${n.lane}`)).size, tiles.length, '같은 자리 노트 중복 없음');
      for (const h of tiles.filter((n) => n.hold)) {
        assert.ok(!tiles.some((n) => n !== h && n.lane === h.lane && n.t > h.t + 1e-6 && n.t < h.t + h.dur - 1e-6), `${diff} 롱노트 위에 노트가 겹침`);
      }
      assert.ok(tiles.filter((n, i) => i && n.t === tiles[i - 1].t && n.t === tiles[i - 2]?.t).length === 0, '세 개 동시치기 없음');
      const lv = chartLevel(song, diff);
      assert.ok(lv >= 1 && lv <= 30, `${diff} 레벨 ${lv}`);
    }
  });
}

test('채보는 늘 똑같이 만들어진다 (멀티에서 모두 같은 채보)', () => {
  for (const song of SONGS.slice(0, 8)) {
    for (const diff of DIFFS) {
      const a = makeChart(song, diff).tiles.map((n) => `${n.t}:${n.lane}`).join(), b = makeChart(song, diff).tiles.map((n) => `${n.t}:${n.lane}`).join();
      assert.equal(a, b, `${song.id} ${diff}`);
    }
  }
});

test('질리지 않게: 같은 가락이 다시 나오면 다른 레인 모양으로, 레인도 골고루', () => {
  let repeats = 0, changed = 0;
  for (const song of SONGS) {
    const { melody } = compile(song), bySi = new Map();
    for (const n of melody) bySi.set(n.t.toFixed(4), n);
    for (const diff of ['normal', 'hard', 'master']) {
      const tiles = makeChart(song, diff).tiles.filter((n) => !n.fill && n.midi > 0);
      const seq = new Map(); // 구간 번호 → [레인]
      for (const n of tiles) {
        const m = bySi.get(n.t.toFixed(4));
        if (!m || tiles.some((o) => o !== n && o.t === n.t && o.midi > n.midi)) continue; // 동시치기 짝은 빼고 멜로디만
        if (!seq.has(m.si)) seq.set(m.si, { rep: m.rep, lanes: [], from: m.rep });
        seq.get(m.si).lanes.push(n.lane);
      }
      const list = [...seq.entries()];
      for (const [si, v] of list) {
        if (!v.rep || v.lanes.length < 6) continue;
        const first = list.find(([sj, w]) => sj < si && w.lanes.length === v.lanes.length && !w.rep);
        if (!first) continue;
        repeats++;
        if (first[1].lanes.join() !== v.lanes.join()) changed++;
      }
    }
    // 레인을 골고루: 한 레인이 노트의 45%를 넘지 않는다
    const tiles = makeChart(song, 'master').tiles, cnt = [0, 0, 0, 0];
    for (const n of tiles) cnt[n.lane]++;
    assert.ok(Math.max(...cnt) / tiles.length < 0.45, `${song.id} 레인 쏠림 ${cnt.join(',')}`);
  }
  assert.ok(repeats > 20, `반복 구간 ${repeats}개`);
  assert.ok(changed / repeats > 0.8, `반복 구간 ${repeats}개 중 ${changed}개만 모양이 바뀜`);
});

test('난이도 레벨은 어려운 쪽이 같거나 높고, MASTER 위 3단계는 초당 노트 · 레벨이 꼭 더 높다', () => {
  const nps = (t) => t.length / Math.max(1, t.at(-1).t - t[0].t);
  for (const song of SONGS) {
    const lv = DIFFS.map((d) => chartLevel(song, d)), d = DIFFS.map((x) => nps(makeChart(song, x).tiles));
    assert.ok(lv.every((v, i) => i === 0 || v >= lv[i - 1]), `${song.id} ${lv.join(',')}`);
    for (let i = 5; i < DIFFS.length; i++) {
      assert.ok(lv[i] > lv[i - 1], `${song.id} ${DIFFS[i]} 레벨 ${lv.join(',')}`);
      assert.ok(d[i] > d[i - 1], `${song.id} ${DIFFS[i]} 초당 노트 ${d.map((x) => x.toFixed(2)).join(',')}`);
    }
  }
});

test('EXTREME · INFERNO · CHAOS는 곡이 빨라지고, 노트도 빨라진 곡 시간에 맞는다', () => {
  for (const song of SONGS) {
    for (const [diff, sp] of Object.entries(SPEED)) {
      const tiles = makeChart(song, diff).tiles, fast = compile(playSong(song, diff));
      assert.ok(Math.abs(fast.duration - compile(song).duration / sp) < 1e-6, `${song.id} ${diff} 빨라진 곡 길이`);
      assert.ok(tiles.at(-1).t < fast.duration && tiles[0].t >= 0, `${song.id} ${diff} 노트가 곡 안에`);
      const melody = fast.melody.map((n) => n.t);
      assert.ok(tiles.filter((n) => !n.fill).every((n) => melody.some((m) => Math.abs(m - n.t) < 1e-6)), `${song.id} ${diff} 멜로디 노트가 빨라진 박자에 맞음`);
    }
  }
  assert.ok(SPEED.extreme < SPEED.inferno && SPEED.inferno < SPEED.chaos);
  assert.equal(playSong(SONG.twinkle, 'master'), SONG.twinkle, 'MASTER까지는 원래 곡');
  assert.notEqual(playSong(SONG.twinkle, 'chaos').id, playSong(SONG.twinkle, 'inferno').id, '빨라진 곡은 난이도마다 음원 캐시를 따로 쓴다');
});

test('판정 구간', () => {
  assert.equal(judgeOf(0.01).name, 'perfect');
  assert.equal(judgeOf(-0.08).name, 'great');
  assert.equal(judgeOf(0.14).name, 'good');
  assert.equal(judgeOf(0.2), null);
  assert.equal(judgeOf(0.17, 0.03).name, 'good', '우사기 판정 버프');
  assert.equal(rankOf(1e6), 'S');
  assert.equal(rankOf(100), 'D');
});

test('10회 뽑기: 보석 차감 + 희귀 이상 1장 확정', () => {
  const { save, result } = act(newSave(), { type: 'pull', banner: 'std', count: 10 }, low);
  assert.equal(result.cards.length, 10);
  assert.equal(save.gems, newSave().gems - 1000 + result.cards.reduce((a, c) => a + c.refund, 0));
  assert.ok(result.cards.slice(0, 9).every((c) => c.rarity === 1));
  assert.ok(result.cards[9].rarity >= 2);
  assert.equal(save.stats.pulls, 10);
  assert.equal(save.day.pulls, 10);
});

test('배너마다 천장 · 비용 · 풀이 다르고, 초월은 0.00000001%', () => {
  const s = { ...newSave(), pity: { std: BANNER.std.pity - 1 } };
  const r1 = act(s, { type: 'pull', banner: 'std', count: 1 }, low);
  assert.equal(r1.result.cards[0].rarity, 4, '천장 전설');
  assert.equal(r1.save.pity.std, 0);
  assert.equal(normalize({ pity: 40 }).pity.std, 40, '예전 천장 횟수는 기본 배너로');
  const coin = act(newSave(), { type: 'pull', banner: 'coin', count: 1 }, low);
  assert.equal(coin.save.coins, newSave().coins - 1500);
  assert.equal(coin.save.gems, newSave().gems);
  const paj = act({ ...newSave(), pity: { pajama: BANNER.pajama.pity - 1 } }, { type: 'pull', banner: 'pajama', count: 1 }, low);
  assert.ok(paj.result.cards[0].id.startsWith('pajama_'), '파자마 배너 전설은 파자마만');
  const rookie = act(newSave(), { type: 'pull', banner: 'rookie', count: 10 }, low);
  assert.equal(rookie.save.gems, newSave().gems - 500 + rookie.result.cards.reduce((a, c) => a + c.refund, 0));
  assert.ok(rookie.result.cards[9].rarity >= 3, '초보자 뽑기는 영웅 이상 확정');
  assert.throws(() => act(rookie.save, { type: 'pull', banner: 'rookie', count: 10 }, low), GameError, '초보자 뽑기는 한 번만');
  assert.throws(() => act(newSave(), { type: 'pull', banner: 'rookie', count: 1 }, low), GameError, '초보자 뽑기는 10회만');
  assert.throws(() => act({ ...newSave(), gems: 50 }, { type: 'pull', banner: 'std', count: 1 }, low), GameError, '보석 부족');
  for (const b of BANNERS) {
    assert.equal(b.rates.length, 6, `${b.id} 등급 6개`);
    assert.ok(Math.abs(b.rates.reduce((a, x) => a + x, 0) - 1) < 1e-9, `${b.id} 확률 합 100%`);
    assert.equal(b.rates[5], b.cost.gems ? GOD_RATE : 0, `${b.id} 초월 확률`);
  }
  assert.equal(GOD_RATE, 0.00000001 / 100, '0.00000001%');
  assert.deepEqual(BANNER.std.rates.slice(1, 5), [0.25, 0.12, 0.028, 0.002], '확률표 그대로 (희귀 25 · 영웅 12 · 전설 2.8 · 신화 0.2)');
  const high = act(newSave(), { type: 'pull', banner: 'std', count: 1 }, () => 0.9999);
  assert.equal(high.result.cards[0].rarity, 5, '0.9999는 신화');
  assert.equal(high.save.stats.mythics, 1);
  assert.equal(high.save.pity.std, 0, '신화도 천장을 초기화');
  const god = act(newSave(), { type: 'pull', banner: 'std', count: 1 }, () => 1 - 1e-12);
  assert.equal(god.result.cards[0].rarity, 6, '맨 끝 1e-10 구간은 초월');
  assert.equal(CHAR[god.result.cards[0].id].rarity, 6);
  assert.equal(god.save.stats.gods, 1);
  const notGod = act(newSave(), { type: 'pull', banner: 'std', count: 1 }, () => 1 - 2e-10);
  assert.equal(notGod.result.cards[0].rarity, 5, '1e-10 바로 아래는 신화');
});

test('등급은 6단계, 친구 52명 · 모든 등급에 친구가 있다 · 초월은 2명', () => {
  assert.equal(CHARS.length, 52);
  assert.equal(new Set(CHARS.map((c) => c.id)).size, 52);
  for (const r of [1, 2, 3, 4, 5, 6]) assert.ok(CHARS.some((c) => c.rarity === r), `${RARITY[r].name} 친구`);
  assert.equal(CHARS.filter((c) => c.rarity === TOP).length, 2);
  for (const c of CHARS) assert.ok(c.lines.length && c.voice.length === 2 && c.values.length === 2, `${c.id} 대사 · 목소리 · 버프`);
});

test('초월 친구는 버프 한계를 풀 만큼 세다', () => {
  const s = { ...newSave(), chars: { hachiware: 1, chiikawa: 1, usagi: 1, god_usagi: 1, god_chiikawa: 1 }, team: ['god_usagi', 'god_chiikawa', 'hachiware', 'usagi'] };
  const b = teamBuffs(s);
  assert.ok(b.divine);
  assert.ok(b.score > 150, `점수 +${b.score}% (보통 한계 150%)`);
  assert.equal(b.revive, 100);
  assert.ok(b.window > 30);
  assert.ok(powerOf(s, 'god_usagi') > powerOf({ ...s, chars: { golden_usagi: 20 } }, 'golden_usagi'), '초월 1레벨이 신화 20레벨보다 세다');
});

test('관리자 확률: 올바른 값만 적용되고 이상한 값은 무시 (예전 5등급 설정도 읽는다)', () => {
  const cfg = { rates: { std: { rates: [0, 0, 0, 0, 1 - GOD_RATE, GOD_RATE], pity: 50 } } };
  assert.equal(bannerOf('std', cfg).pity, 50);
  assert.equal(act(newSave(), { type: 'pull', banner: 'std', count: 1 }, low, cfg).result.cards[0].rarity, 5, '서버 확률대로 뽑힌다');
  const old5 = bannerOf('std', { rates: { std: { rates: [0, 0, 0, 0, 1] } } }).rates;
  assert.equal(old5.length, 6);
  assert.ok(Math.abs(old5[4] - 1) < 1e-9 && old5[5] === GOD_RATE, '예전 5개짜리는 초월 확률을 붙여서');
  assert.deepEqual(bannerOf('std', { rates: { std: { rates: [0.5, 0.5, 0.5, 0, 0, 0] } } }).rates, BANNER.std.rates, '합이 100%가 아니면 기본값');
  assert.equal(bannerOf('std', { rates: { std: { rates: BANNER.std.rates, pity: 3 } } }).pity, BANNER.std.pity, '천장 범위 밖이면 기본값');
  assert.equal(bannerOf('nope').id, 'std');
});

test('등급 확정 뽑기: 고른 등급이 나오면 멈추고, 재화가 떨어지면 멈춘다', () => {
  let i = 0;
  const seq = () => [0.01, 0.5, 0.01, 0.5, 0.01, 0.5, 0.9999, 0.5][i++ % 8]; // 한 장에 난수 2개(등급 · 친구): 일반 · 일반 · 일반 · 신화 …
  const r = act(newSave(), { type: 'pullUntil', banner: 'std', rarity: 4, max: 100 }, seq);
  assert.ok(r.result.found);
  assert.ok(r.result.cards.at(-1).rarity >= 4);
  assert.equal(r.save.gems, newSave().gems - 100 * r.result.cards.length + r.result.cards.reduce((a, c) => a + c.refund, 0));
  const poor = act({ ...newSave(), gems: 250 }, { type: 'pullUntil', banner: 'std', rarity: 5, max: 100 }, low);
  assert.equal(poor.result.cards.length, 2, '보석 250개면 2장까지');
  assert.equal(poor.result.found, false);
  const capped = act(newSave(), { type: 'pullUntil', banner: 'std', rarity: 6, max: 5 }, low);
  assert.equal(capped.result.cards.length, 5, '초월도 고를 수 있고, 최대 횟수에서 멈춤');
  assert.throws(() => act(newSave(), { type: 'pullUntil', banner: 'coin', rarity: 4 }, low), GameError, '코인 뽑기엔 전설이 없음');
  assert.throws(() => act(newSave(), { type: 'pullUntil', banner: 'rookie', rarity: 3 }, low), GameError, '초보자 뽑기는 안 됨');
  assert.throws(() => act({ ...newSave(), gems: 0 }, { type: 'pullUntil', banner: 'std', rarity: 3 }, low), GameError, '보석이 없으면 오류');
});

test('픽업은 매주 월요일 0시(한국 시간)에 바뀐다', () => {
  const mon = Date.UTC(2026, 10, 1, 15, 0); // 2026-11-02 월요일 00:00 KST
  assert.equal(weekOf(mon), weekOf(mon - 1) + 1);
  assert.equal(weekOf(mon), weekOf(mon + 7 * 86400e3 - 1));
  assert.equal(pickupEnds(mon - 1), mon);
  assert.notEqual(pickupOf(mon), pickupOf(mon - 1));
  assert.equal(CHAR[pickupOf(mon)].rarity, 4);
});

test('친구 레벨: 같은 친구 카드를 모아서 레벨 업 (최대 20), 다 모이면 보석 환급', () => {
  const first = CHARS.find((c) => c.rarity === 1).id;
  let s = newSave();
  s = act(s, { type: 'pull', banner: 'std', count: 1 }, low).save; // 처음 만남 → 1레벨
  assert.equal(s.chars[first], 1);
  s = act(s, { type: 'pull', banner: 'std', count: 1 }, low).save; // 또 만남 → 카드 +1 (자동으로 레벨이 오르진 않는다)
  assert.equal(s.chars[first], 1);
  assert.equal(s.dup[first], 1);
  const need = copiesFor(1, 1);
  assert.ok(need >= 1);
  while ((s.dup[first] ?? 0) < need) s = act(s, { type: 'pull', banner: 'std', count: 1 }, low).save;
  const up = act(s, { type: 'levelUp', id: first });
  assert.equal(up.save.chars[first], 2);
  assert.equal(up.save.coins, s.coins - coinsFor(1, 1));
  assert.equal(up.save.dup[first] ?? 0, s.dup[first] - need);
  assert.equal(up.save.stats.levelUps, 1);
  assert.throws(() => act(up.save, { type: 'levelUp', id: first }), GameError, '카드가 모자라면 못 올린다');
  assert.throws(() => act(newSave(), { type: 'levelUp', id: 'god_usagi' }), GameError, '없는 친구');
  // 최고 레벨까지 쓸 카드가 다 모였으면 그 뒤로는 보석 환급
  const full = { ...newSave(), chars: { [first]: 1 }, dup: { [first]: copiesToMax(1, 1) } };
  const refund = act(full, { type: 'pull', banner: 'std', count: 1 }, low);
  assert.equal(refund.result.cards[0].refund, RARITY[1].refund);
  assert.equal(refund.save.dup[first], copiesToMax(1, 1));
  // 모두 레벨 업: 카드와 코인이 되는 만큼
  const all = act({ ...full, coins: 1e7 }, { type: 'levelUpAll' });
  assert.equal(all.save.chars[first], MAX_LEVEL);
  assert.equal(all.result.count, MAX_LEVEL - 1);
  assert.throws(() => act(all.save, { type: 'levelUp', id: first }), GameError, '최고 레벨');
  assert.ok(copiesToMax(6, 1) < copiesToMax(1, 1), '귀한 등급은 카드가 덜 든다');
  assert.equal(valueAt(CHAR.hachiware, 5), 15);
  assert.ok(valueAt(CHAR.hachiware, 20) > valueAt(CHAR.hachiware, 10));
});

test('팀 · 시너지 · 버프 · 카드 점수', () => {
  const s = newSave();
  const b = teamBuffs(s);
  assert.ok(b.synergies.some((x) => x.id === 'samin'), '시작 팀은 삼인방 시너지');
  assert.equal(b.score, 6 + 10, '하치와레 1레벨 + 삼인방');
  assert.equal(powerOf(s, 'hachiware'), 180);
  assert.equal(teamPower(s), Math.round(540 * 1.1));
  assert.throws(() => act(s, { type: 'team', team: ['pajama_green', null, null, null] }), GameError, '없는 캐릭터는 못 넣음');
  assert.throws(() => act(s, { type: 'team', team: ['usagi', 'usagi', null, null] }), GameError, '중복 불가');
  const rich = { ...newSave(), chars: { hachiware: 1, chiikawa: 1, usagi: 1, rakko: 1, kani: 1, pajama_green: 3 } };
  const best = bestTeam(rich);
  assert.ok(best.includes('pajama_green'));
  assert.ok(teamPower(rich, best) >= teamPower(rich, ['hachiware', 'chiikawa', 'usagi', 'rakko']));
  assert.deepEqual(bestTeam(newSave()).filter(Boolean).sort(), ['chiikawa', 'hachiware', 'usagi']);
});

test('플레이어 레벨 1~1000: 100레벨까지 예전과 같고, 그 뒤로 조금씩 더 필요', () => {
  for (const e of [0, 99, 100, 950, 5000, 9899]) assert.equal(levelOf(e), 1 + Math.floor(e / 100), `exp ${e}`);
  for (let L = 1; L < MAX_LV; L++) {
    assert.equal(levelOf(expAt(L)), L);
    assert.equal(levelOf(expAt(L + 1) - 1), L);
    assert.equal(expAt(L + 1) - expAt(L), expNeed(L));
  }
  assert.equal(levelOf(1e9), MAX_LV);
  assert.deepEqual(expProgress(expAt(500) + 7), [7, expNeed(500)]);
  // 레벨 업 보상 · 혜택
  assert.ok(levelReward(10).items && levelReward(10).gems > levelReward(9).gems, '10레벨마다 보너스');
  assert.ok(levelReward(100).gems > levelReward(99).gems + 1000);
  assert.ok(perksOf(1000).coin === 100 && perksOf(1).coin === 0);
  assert.ok(perksOf(500).friends > perksOf(1).friends && perksOf(500).gifts > perksOf(1).gifts);
  // 경험치가 올라 레벨이 오르면 보상을 받는다
  const s = { ...newSave(), exp: expAt(10) - 5 };
  const r = act(s, { type: 'finish', song: 'twinkle', diff: 'normal', raw: 900000, score: 1000000, combo: 50, rank: 'A', cleared: true, perfect: 40 });
  assert.equal(r.result.levelUp, 10);
  assert.ok(r.save.items.heart === s.items.heart + 1, '10레벨 부스터 선물');
});

test('프로필 테두리: 10레벨마다 새 테두리, 1000레벨까지 101개 · 고르기', () => {
  const names = new Set(Array.from({ length: 101 }, (_, t) => frameInfo(t).name));
  assert.equal(names.size, 101, '테두리 이름이 모두 다르다');
  assert.equal(frameTier(1), 0);
  assert.equal(frameTier(10), 1);
  assert.equal(frameTier(999), 99);
  assert.equal(frameTier(1000), 100);
  const s = { ...newSave(), exp: expAt(55) };
  assert.equal(frameOfSave(s), 5);
  const pick = act(s, { type: 'frame', tier: 2 });
  assert.equal(frameOfSave(pick.save), 2, '열린 테두리는 고를 수 있다');
  assert.throws(() => act(s, { type: 'frame', tier: 6 }), GameError, '안 열린 테두리');
  assert.equal(frameOfSave(act(pick.save, { type: 'frame', tier: -1 }).save), 5, '-1은 가장 높은 테두리');
});

test('업적: 5만 개 이상 · 트랙마다 단계는 순서대로 · 예전 업적 id도 이어진다', () => {
  assert.ok(ACH_TOTAL >= 50000, `업적 ${ACH_TOTAL}개`);
  assert.equal(new Set(ACH_TRACKS.map((t) => t.id)).size, ACH_TRACKS.length, '트랙 id 중복 없음');
  for (const t of ACH_TRACKS) {
    assert.ok(ACH_CATS[t.cat], `${t.id} 분류`);
    assert.ok(t.goals.length && t.goals.every((g, i) => g > 0 && (i === 0 || g > t.goals[i - 1])), `${t.id} 목표가 오름차순`);
    assert.equal(typeof t.stat(newSave(), { lv: 1, cleared: DIFFS.map(() => 0), any: 0, sSongs: 0, owned: 3, byR: { 2: 3 }, atLeast: () => 0, power: 0, syn: 1 }), 'number', t.id);
    for (let i = 0; i < Math.min(3, t.goals.length); i++) {
      const r = t.reward(i, t.goals[i]);
      assert.ok(r && (r.coins > 0 || r.gems > 0), `${t.id} ${i}단계 보상`);
    }
  }
  const legacy = new Set(ACH_TRACKS.flatMap((t) => t.legacy ?? []).filter(Boolean));
  for (const id of ['play1', 'play10', 'play50', 'clear5', 'clearAll', 'rankS', 'fc1', 'combo100', 'combo200', 'pull10', 'pull100',
    'collect8', 'collectAll', 'stage5', 'teamFull', 'synergy', 'buy1', 'rich', 'level5', 'masterGift', 'sc:twinkle:easy', 'ss:canon:master', 'sf:ode:hard',
    'sp:twinkle:1', 'sp:twinkle:10', 'ch:usagi:own', 'ch:usagi:st10']) assert.ok(legacy.has(id), `예전 업적 ${id}`);
  assert.equal(ACH_TRACK.masterGift.reward(0).gems, 10000, 'MASTER 첫 클리어 보석 1만 개');
  assert.deepEqual(claimable(newSave()).map((q) => q.id).sort(), ['ch:chiikawa:own', 'ch:hachiware:own', 'ch:usagi:own', 'synergy'], '새 계정은 시작 친구 · 시너지 업적을 바로 받을 수 있다');
  // 단계는 순서대로, 곡 × 난이도 업적은 압축 저장
  let s = { ...newSave(), stats: { ...newSave().stats, plays: 25 } };
  s = act(s, { type: 'claim', id: 'play' }).save;
  assert.equal(claimedOf(s, ACH_TRACK.play), 1);
  assert.equal(achView(s, ACH_TRACK.play).goal, 5);
  const all = act(s, { type: 'claimAll' });
  assert.equal(claimedOf(all.save, ACH_TRACK.play), 4, '25번 연주 → 1 · 5 · 10 · 20번 단계');
  assert.equal(achCount(all.save), achCount(s) + all.result.count);
  const f = act(newSave(), { type: 'finish', song: 'canon', diff: 'chaos', raw: 990000, score: 1200000, combo: 300, rank: 'S', cleared: true, fullCombo: true, allPerfect: true, perfect: 300 }).save;
  const got = act(f, { type: 'claimAll' }).save;
  assert.ok(claimedOf(got, ACH_TRACK['clear:canon:chaos']) === 1 && claimedOf(got, ACH_TRACK['ap:canon:chaos']) === 1 && claimedOf(got, ACH_TRACK['score:canon:chaos']) >= 7);
  assert.ok(JSON.stringify(got.achS).length < 80, `곡 × 난이도 업적 저장 크기 ${JSON.stringify(got.achS)}`);
});

test('상점 · 업적 · 출석 · 미션 · 접속 보상 · 플레이 보상', () => {
  let s = newSave();
  s = act(s, { type: 'buy', item: 'song:canon' }).save;
  assert.ok(s.songs.includes('canon'));
  assert.throws(() => act(s, { type: 'buy', item: 'song:canon' }), GameError);
  assert.throws(() => act(s, { type: 'start', song: 'elise', diff: 'normal', boosters: [] }), GameError, '잠긴 곡');
  assert.throws(() => act(s, { type: 'start', song: 'twinkle', diff: 'insane', boosters: [] }), GameError, '없는 난이도');
  // 환전: 같은 날 할수록 보석은 비싸지고 코인은 덜 준다. 사고팔기를 반복하면 늘 손해 (돈 복사 불가)
  let ex = { ...s, coins: 1e6, gems: 1e5 };
  const gives = [];
  for (let i = 0; i < 10; i++) {
    const before = ex.coins;
    ex = act(ex, { type: 'buy', item: 'coin' }).save;
    gives.push(ex.coins - before);
  }
  assert.ok(gives.every((g, i) => i === 0 || g <= gives[i - 1]), `바꿀수록 코인이 줄어든다 ${gives.join(',')}`);
  assert.throws(() => act(ex, { type: 'buy', item: 'coin' }), GameError, '하루 횟수 제한');
  let loop = { ...s, coins: 100000, gems: 0 };
  for (let i = 0; i < 10; i++) loop = act(act(loop, { type: 'buy', item: 'gem100' }).save, { type: 'buy', item: 'coin' }).save;
  assert.ok(loop.coins < 100000 && loop.gems === 0, `보석 사서 다시 코인으로 바꾸면 손해 (${loop.coins})`);
  const gem100 = SHOP.find((x) => x.id === 'gem100');
  assert.ok(priceOf(loop, gem100).coins > priceOf(s, gem100).coins, '보석은 살수록 비싸진다');

  // 월간 출석: 이번 달 n번째 출석에 ATTEND[n-1], 날이 갈수록 커진다
  const d1 = act(s, { type: 'daily' });
  assert.deepEqual({ coins: d1.result.coins, gems: d1.result.gems }, { coins: ATTEND[0].coins, gems: ATTEND[0].gems });
  assert.equal(attendOf(d1.save), 1);
  assert.throws(() => act(d1.save, { type: 'daily' }), GameError, '출석은 하루 한 번');
  const mon = today().slice(0, 7), d7 = act({ ...s, attend: { month: mon, count: 6 } }, { type: 'daily' });
  assert.equal(d7.result.day, 7);
  assert.equal(d7.result.gems, ATTEND[6].gems, '7일째 특별 보상');
  assert.equal(act({ ...s, attend: { month: '2000-01', count: 20 } }, { type: 'daily' }).result.day, 1, '달이 바뀌면 1일째부터');
  assert.equal(act({ ...s, exp: expAt(200) }, { type: 'daily' }).result.gems, Math.round(ATTEND[0].gems * 1.2), '200레벨은 출석 보상 +20%');
  const total = (r) => (r.coins ?? 0) + (r.gems ?? 0) * 20;
  assert.ok(total(ATTEND[27]) > total(ATTEND[0]) && total(ATTEND[20]) > total(ATTEND[6]), '뒤로 갈수록 보상이 크다');

  const claimed = act(s, { type: 'claim', id: 'synergy' });
  assert.equal(claimed.save.gems, s.gems + 50);
  assert.throws(() => act(claimed.save, { type: 'claim', id: 'synergy' }), GameError, '이미 받음');

  const fin = (save, extra = {}) => act(save, { type: 'finish', song: 'twinkle', diff: 'normal', raw: 900000, score: 1044000, combo: 120, rank: 'A', cleared: true, fullCombo: false, perfect: 110, ...extra });
  const f1 = fin(s);
  assert.ok(f1.result.coins > 0);
  assert.equal(f1.result.gems, 50, '첫 클리어 보석');
  assert.equal(f1.save.best['twinkle:normal'].score, 1044000);
  assert.equal(f1.save.stats.perfects, 110);
  assert.equal(f1.save.stats.diffClears.normal, 1);
  assert.equal(f1.save.stats.songPlays.twinkle, 1);
  assert.deepEqual([f1.save.stats.sd.twinkle[1], f1.save.stats.sd.twinkle[9], f1.save.stats.sd.twinkle[17]], [1, 1, 120], '곡 × 난이도 연주 · 클리어 · 최대 콤보');
  assert.equal(f1.save.stats.tp.hachiware, 1, '팀 친구 연주 횟수');
  assert.ok(claimable(f1.save).some((q) => q.id === 'clear:twinkle:normal'), '곡별 클리어 업적');
  const fc = fin(s, { fullCombo: true, rank: 'S', raw: 990000, score: 1100000 });
  assert.ok(fc.save.stats.fc['twinkle:normal'] && fc.save.stats.ss['twinkle:normal']);
  const all = act(fc.save, { type: 'claimAll' });
  assert.ok(all.result.count >= 4 && claimable(all.save).length === 0, `한 번에 모두 받기 ${all.result.count}개`);
  assert.throws(() => act(all.save, { type: 'claimAll' }), GameError, '받을 게 없으면 오류');
  const master = fin(s, { diff: 'master' });
  assert.equal(master.result.gems, 200, 'MASTER 첫 클리어 보석');
  assert.ok(master.result.coins > f1.result.coins, 'MASTER는 코인을 더 준다');
  assert.throws(() => fin(s, { raw: 2e6 }), GameError);
  assert.throws(() => fin(s, { perfect: -1 }), GameError);
  assert.ok(fin({ ...s, exp: expAt(500) }).result.coins > f1.result.coins, '레벨 혜택: 코인 보너스');
  assert.equal(fin(s, { multi: true }).save.stats.mplays, 1);

  let m = s;
  for (let i = 0; i < 3; i++) m = fin(m).save;
  const got = act(m, { type: 'mission', id: 'm_play' });
  assert.equal(got.result.coins, 1000);
  assert.throws(() => act(got.save, { type: 'mission', id: 'm_play' }), GameError, '미션 보상은 하루 한 번');
  assert.throws(() => act(m, { type: 'mission', id: 'm_hard' }), GameError, '아직 못 한 미션');
  assert.ok(MISSIONS.some((x) => x.id === 'm_all'));

  const hello = act(s, { type: 'hello' }).save;
  assert.ok(hello.online.start > 0);
  assert.throws(() => act(hello, { type: 'online', id: 'o5' }), GameError, '5분 전에는 못 받음');
  const later = { ...hello, online: { ...hello.online, start: Date.now() - 121 * 60e3 } };
  const o = act(later, { type: 'online', id: 'o120' });
  assert.equal(o.result.gems, 100);
  assert.throws(() => act(o.save, { type: 'online', id: 'o120' }), GameError, '접속 보상은 하루 한 번');
  for (const k of ['first', 'mpWin', 'friends', 'gift', 'grant']) assert.ok(SERVER_ONLY.has(k), `${k}는 서버만`);
  assert.equal(act(s, { type: 'first' }).save.stats.firsts, 1);
  assert.equal(act(s, { type: 'mpWin' }).save.stats.mwins, 1);
});

test('친구 선물: 무료는 친구마다 하루 한 번, 하루 횟수 제한, 코인 · 보석은 보내는 사람이 낸다', () => {
  let s = newSave();
  const free = act(s, { type: 'gift', to: 7, kind: 'free' });
  assert.deepEqual(free.result.give, GIFT.free.give);
  assert.equal(free.save.coins, s.coins + GIFT.free.back);
  assert.throws(() => act(free.save, { type: 'gift', to: 7, kind: 'free' }), GameError, '같은 친구 무료 선물은 하루 한 번');
  const coin = act(free.save, { type: 'gift', to: 7, kind: 'coins', amount: 1000 });
  assert.equal(coin.save.coins, free.save.coins - 1000);
  assert.throws(() => act(coin.save, { type: 'gift', to: 8, kind: 'coins', amount: 777 }), GameError, '정해진 금액만');
  assert.throws(() => act({ ...coin.save, gems: 0 }, { type: 'gift', to: 8, kind: 'gems', amount: 30 }), GameError, '보석 부족');
  s = coin.save;
  for (let i = 0; s.day.gifts.length < perksOf(1).gifts; i++) s = act(s, { type: 'gift', to: 100 + i, kind: 'free' }).save;
  assert.throws(() => act(s, { type: 'gift', to: 999, kind: 'free' }), GameError, '하루 횟수 제한');
  assert.equal(s.stats.gifts, perksOf(1).gifts);
});

test('예전(지금 DB에 있는) 저장 데이터도 그대로 이어서 쓸 수 있다 (진화 → 레벨, 받은 업적 → 트랙)', () => {
  // 업데이트 전 형식: 천장은 숫자, 단계 · 진화, 받은 업적 id 목록
  const old = {
    v: 3, coins: 12345, gems: 678, exp: 950, avatar: 4,
    chars: { hachiware: 5, chiikawa: 3, usagi: 1, momonga: 4, pajama_green: 2 }, evo: { hachiware: 2 },
    team: ['hachiware', 'chiikawa', 'usagi', 'pajama_green'],
    items: { heart: 0, star: 2, feather: 1 }, songs: ['canon'], avatars: [13], claimed: ['play1', 'synergy', 'level5', 'sc:twinkle:normal', 'ch:hachiware:st5'], daily: '2026-10-01', pity: 37,
    best: { 'twinkle:normal': { score: 987654, rank: 'S', combo: 210 }, 'ode:easy': { score: 700000, rank: 'B', combo: 80 } },
    stats: { plays: 42, clears: { 'twinkle:normal': true, 'ode:easy': true }, sRanks: 3, fullCombos: 1, maxCombo: 210, pulls: 55, coinsEarned: 30000, buys: 4, evos: 2, evoFails: 1 },
  };
  const s = normalize(old);
  assert.equal(s.v, 4);
  assert.equal(s.pity.std, 37);
  assert.equal(s.coins, 12345);
  assert.equal(s.stats.diffClears.master, 0);
  assert.equal(s.chars.hachiware, 5 + 6, '진화 2번 = +6레벨');
  assert.equal(s.evo, undefined);
  assert.equal(s.claimed, undefined);
  assert.equal(s.stats.levelUps, 2);
  assert.equal(claimedOf(s, ACH_TRACK.play), 1);
  assert.equal(claimedOf(s, ACH_TRACK.synergy), 1);
  assert.equal(claimedOf(s, ACH_TRACK.level), 4, '레벨 5 업적까지 (2 · 3 · 4 · 5)');
  assert.equal(claimedOf(s, ACH_TRACK['clear:twinkle:normal']), 1);
  assert.equal(claimedOf(s, ACH_TRACK['ch:hachiware:lv']), 4);
  assert.equal(s.stats.sd.twinkle[9], 1, '예전 클리어는 클리어 1번으로');
  assert.equal(normalize(s).chars.hachiware, 11, '두 번 옮겨도 그대로');
  assert.equal(teamBuffs(s).score, valueAt(CHAR.hachiware, 11) + 13 + 10, '하치와레 11레벨 + 파자마 초록이 2레벨(13) + 삼인방(10)');
  assert.equal(achView(s, ACH_TRACK.play).goal, 5, '이미 받은 단계(첫 연주)는 건너뛰고 다음 단계부터');
  let x = act(old, { type: 'pull', banner: 'std', count: 1 }, low).save;
  x = act(x, { type: 'finish', song: 'twinkle', diff: 'hard', raw: 900000, score: 1000000, combo: 100, rank: 'A', cleared: true, perfect: 70 }).save;
  assert.equal(x.best['twinkle:normal'].score, 987654, '예전 최고 기록 유지');
  assert.ok(claimable(x).length > 3, '오래 한 유저는 새 업적을 바로 여러 개 받을 수 있다');
});

test('모든 곡의 자켓 정보 · 장르', () => {
  for (const song of SONGS) assert.ok(song.jacket ? song.jc : true, `${song.id} 대체 자켓 배경색`);
  assert.ok(SONG.cancan && SONG.korobeiniki && SONG.jingle);
  assert.ok(SONGS.every((s) => GENRES[s.genre]), '모든 곡이 장르 목록에 있어야 랭킹 곡 고르기에 나온다');
  assert.equal(new Set(SONGS.map((s) => s.id)).size, SONGS.length, '곡 id 중복 없음');
});

test('곡 검색: 제목 · 작곡가 · 영문 · 초성 · 띄어쓰기 무시', () => {
  const find = (q) => SONGS.filter((s) => songMatch(s, q)).map((s) => s.id);
  assert.equal(find('').length, SONGS.length);
  assert.ok(find('캐논').includes('canon'));
  assert.ok(find('ㅋㄴ').includes('canon'));
  assert.ok(find('모차르트').includes('twinkle'));
  assert.ok(find('CANON').includes('canon'));
  assert.ok(find('엘리제 를').includes('elise'));
  assert.deepEqual(find('없는곡이름'), []);
});

test('멀티: 순위는 연주 점수 순, 공격 목표는 바로 위 사람 (내가 1등이면 2등, 끝낸 사람은 빼고)', () => {
  const p = (id, raw, seat, done = false) => ({ id, raw, seat, done });
  const players = [p(1, 500, 0), p(2, 900, 1), p(3, 700, 2), p(4, 700, 3)];
  assert.deepEqual(mpOrder(players).map((x) => x.id), [2, 3, 4, 1]); // 같은 점수는 앞자리 먼저
  assert.equal(mpTarget(players, 1, 0), 4); // 4등이면 바로 위 3등
  assert.equal(mpTarget(players, 2, 0), 3); // 1등이면 2등
  assert.equal(mpTarget(players, 1, 2), 2); // 직접 고른 목표
  assert.equal(mpTarget([p(1, 500, 0), p(2, 900, 1, true), p(3, 700, 2)], 1, 2), 3); // 고른 사람이 끝냈으면 다음
  assert.equal(mpTarget([p(1, 500, 0), p(2, 900, 1, true)], 1, 0), 0); // 연주 중인 상대가 없으면 없음
  assert.ok(INQUIRY.etc && Object.keys(INQUIRY).length === 7);
  assert.equal(MP.max, 10);
});

test('멀티 아이템 노트: 같은 판이면 모두 같은 자리 · 약 6.5초마다 · 롱노트 · 동시치기 · 반주는 빼고', () => {
  for (const song of SONGS.slice(0, 10)) {
    const tiles = makeChart(song, 'hard').tiles, a = itemize(tiles, `${song.id}:hard:3`), b = itemize(tiles, `${song.id}:hard:3`);
    const items = a.filter((n) => n.item);
    assert.deepEqual(items.map((n) => `${n.t}:${n.item}`), b.filter((n) => n.item).map((n) => `${n.t}:${n.item}`), '같은 씨앗이면 같은 아이템');
    const span = tiles.at(-1).t - tiles[0].t;
    assert.ok(items.length >= Math.floor(span / 12) && items.length <= Math.ceil(span / 3), `${song.id} 아이템 ${items.length}개 / ${span.toFixed(0)}초`);
    assert.ok(items.every((n) => ATTACKS[n.item] && !n.hold && !n.fill));
    assert.ok(items.every((n) => !a.some((o) => o !== n && o.t === n.t)), '동시치기에는 아이템 없음');
    assert.equal(tiles.filter((n) => n.item).length, 0, '원래 채보는 그대로');
  }
  const other = itemize(makeChart(SONG.canon, 'hard').tiles, 'canon:hard:4').filter((n) => n.item).map((n) => n.t).join();
  assert.notEqual(other, itemize(makeChart(SONG.canon, 'hard').tiles, 'canon:hard:3').filter((n) => n.item).map((n) => n.t).join(), '판이 바뀌면 자리도 바뀐다');
});
