import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../js/matcher.js';
import { SwingTracker, evaluateSwing } from '../js/swing.js';
import { findSpell } from '../js/spells.js';

test('정확한 주문을 인식한다', () => {
  assert.equal(matchSpell('엑스펠리아르무스')?.spell.id, 'expelliarmus');
  assert.equal(matchSpell('아바다 케다브라!')?.spell.id, 'avada');
  assert.equal(matchSpell('Stupefy')?.spell.id, 'stupefy');
});

test('문장 속 주문과 받아쓰기 흔들림을 인식한다', () => {
  assert.equal(matchSpell('자 간다 익스펠리아머스')?.spell.id, 'expelliarmus');
  assert.equal(matchSpell('섹툼샘프라')?.spell.id, 'sectumsempra');
  assert.equal(matchSpell('프로테거')?.spell.id, 'protego');
  assert.equal(matchSpell('인센디요')?.spell.id, 'incendio');
});

test('관계없는 말은 무시한다', () => {
  assert.equal(matchSpell('안녕하세요 오늘 날씨 좋네요'), null);
  assert.equal(matchSpell('응'), null);
  assert.equal(matchSpell(''), null);
});

function swing(samples) {
  const tr = new SwingTracker({ maxDuration: 5000 });
  let res = null;
  let t = 0;
  for (const mag of samples) {
    res = tr.feed(mag, t) || res;
    t += 16;
  }
  return res;
}

test('휘두르기 세기와 길이를 측정한다', () => {
  const res = swing([0, 0, ...Array(40).fill(20), 25, ...Array(30).fill(0)]);
  assert.ok(res);
  assert.equal(res.peak, 25);
  assert.ok(res.duration > 600 && res.duration < 700, `duration=${res.duration}`);
});

test('약하거나 짧으면 실패, 충분하면 성공', () => {
  const avada = findSpell('avada');
  assert.equal(evaluateSwing(avada, { peak: 10, duration: 2000 }).success, false);
  assert.equal(evaluateSwing(avada, { peak: 35, duration: 500 }).success, false);
  const ok = evaluateSwing(avada, { peak: 32, duration: 1900 });
  assert.equal(ok.success, true);
  assert.ok(ok.multiplier >= 1);
  // 감도를 올리면 약한 휘두르기도 통과
  assert.equal(evaluateSwing(avada, { peak: 22, duration: 1900 }, 1.4).success, true);
});

test('위력 배율은 1.5배를 넘지 않는다', () => {
  const r = evaluateSwing(findSpell('protego'), { peak: 100, duration: 5000 });
  assert.equal(r.multiplier, 1.5);
});
