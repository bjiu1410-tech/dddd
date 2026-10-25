// 음성 인식 결과(문장)에서 주문을 찾는다.
// 한국어 음성 인식은 "엑스펠리아르무스"를 "익스펠리아무스"처럼 조금씩 다르게 받아쓰므로
// 한글을 자모 단위로 풀어서 편집 거리로 비교한다.
import { SPELLS } from './spells.js';

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export function toJamo(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) {
      out += CHO[Math.floor(code / 588)] + JUNG[Math.floor((code % 588) / 28)] + JONG[code % 28];
    } else {
      out += ch;
    }
  }
  return out;
}

// 소문자화, 공백·문장부호 제거 후 자모 분해
export function normalize(text) {
  return toJamo(text.toLowerCase().replace(/[^a-z가-힣]/g, ''));
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// 문장 안의 부분 문자열 중 alias와 가장 비슷한 것의 유사도 (0~1)
function bestSimilarity(text, alias) {
  if (text.includes(alias)) return 1;
  const n = alias.length;
  const slack = Math.max(1, Math.round(n * 0.25));
  // 문장이 짧으면 통째로도 비교
  let best = text.length <= n + slack ? 1 - levenshtein(text, alias) / Math.max(n, text.length) : 0;
  for (let len = Math.max(1, n - slack); len <= Math.min(n + slack, text.length); len++) {
    for (let i = 0; i + len <= text.length; i++) {
      const sim = 1 - levenshtein(text.slice(i, i + len), alias) / Math.max(n, len);
      if (sim > best) best = sim;
    }
  }
  return best;
}

const PREPARED = SPELLS.map((spell) => ({
  spell,
  aliases: [...new Set(spell.aliases.map(normalize))].filter((a) => a.length >= 3),
}));

// 가장 잘 맞는 주문을 돌려준다. 없으면 null.
export function matchSpell(transcript, threshold = 0.74) {
  const text = normalize(transcript || '');
  if (text.length < 3) return null;
  let best = null;
  for (const { spell, aliases } of PREPARED) {
    for (const alias of aliases) {
      const score = bestSimilarity(text, alias);
      // 같은 점수면 더 긴 표기(더 구체적인 주문)를 우선
      if (!best || score > best.score || (score === best.score && alias.length > best.len)) {
        best = { spell, score, len: alias.length };
      }
    }
  }
  return best && best.score >= threshold ? { spell: best.spell, score: best.score } : null;
}
