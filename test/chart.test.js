// node --test : 곡 데이터가 깨지지 않았는지, 채보·판정이 맞는지 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, compile, makeChart, judgeOf, rankOf, midi } from '../public/game.js';

test('음 이름 → MIDI', () => {
  assert.equal(midi('A4'), 69);
  assert.equal(midi('C5'), 72);
  assert.equal(midi('F#5'), 78);
});

for (const song of SONGS) {
  test(`${song.title}: 마디 칸 수·채보`, () => {
    const c = compile(song); // 칸 수가 틀리면 여기서 throw
    assert.ok(c.duration > 40 && c.duration < 80, `길이 ${c.duration.toFixed(1)}초`);
    for (const diff of ['easy', 'normal']) {
      const notes = makeChart(song, diff);
      assert.ok(notes.length > 40, `${diff} 노트 ${notes.length}개`);
      assert.ok(notes.every((n) => n.lane >= 0 && n.lane <= 3));
      assert.ok(notes.every((n, i) => i === 0 || n.t >= notes[i - 1].t), '시간순');
      assert.ok(notes[0].t >= c.barSec, '첫 노트는 인트로 뒤');
      const key = new Set(notes.map((n) => `${n.t}:${n.lane}`));
      assert.equal(key.size, notes.length, '같은 자리 노트 중복 없음');
    }
    assert.ok(makeChart(song, 'easy').length < makeChart(song, 'normal').length);
  });
}

test('판정 구간', () => {
  assert.equal(judgeOf(0.01).name, 'perfect');
  assert.equal(judgeOf(-0.07).name, 'great');
  assert.equal(judgeOf(0.12).name, 'good');
  assert.equal(judgeOf(0.2), null);
  assert.equal(rankOf(1e6), 'S');
  assert.equal(rankOf(860000), 'A');
  assert.equal(rankOf(100), 'D');
});
