// 플레이어가 쓸 수 있는 주문.
// force    : 필요한 최소 휘두르기 세기 (m/s², 감도 보정 전)
// duration : 필요한 최소 휘두르기 시간 (ms)
// power    : 기본 위력 (공격은 피해량, 치유는 회복량)
// aliases  : 음성 인식 결과와 비교할 표기들 (한국어 표기 흔들림 + 영어)
export const SPELLS = [
  {
    id: 'protego', name: '프로테고', en: 'Protego', type: 'shield',
    desc: '방패 마법. 짧게 휙! 적의 주문을 막는다 (아바다 케다브라는 못 막음)',
    power: 0, mana: 10, force: 8, duration: 150, color: '#7fd8ff',
    aliases: ['프로테고', '프로태고', '프로떼고', '플로테고', 'protego'],
  },
  {
    id: 'expelliarmus', name: '엑스펠리아르무스', en: 'Expelliarmus', type: 'disarm',
    desc: '무장해제. 적이 주문을 외우는 중이면 끊어버린다',
    power: 8, mana: 12, force: 11, duration: 300, color: '#ff5050',
    aliases: ['엑스펠리아르무스', '익스펠리아르무스', '엑스펠리아무스', '익스펠리아무스', '엑스펠리아머스', 'expelliarmus'],
  },
  {
    id: 'stupefy', name: '스투페파이', en: 'Stupefy', type: 'stun',
    desc: '기절 마법. 적을 잠시 기절시키고 시전을 끊는다',
    power: 12, mana: 18, force: 14, duration: 450, color: '#ff8a3d',
    aliases: ['스투페파이', '스튜페파이', '스투페화이', '스튜피파이', '스투피파이', 'stupefy'],
  },
  {
    id: 'episkey', name: '에피스키', en: 'Episkey', type: 'heal',
    desc: '치유 마법. 세기보다는 천천히 오래 흔들어라',
    power: 22, mana: 22, force: 6, duration: 900, color: '#8dff9a',
    aliases: ['에피스키', '에피스케이', '에피스퀴', '애피스키', 'episkey'],
  },
  {
    id: 'incendio', name: '인센디오', en: 'Incendio', type: 'attack',
    desc: '불꽃 마법. 적당히 세게',
    power: 18, mana: 16, force: 16, duration: 600, color: '#ffb02e',
    aliases: ['인센디오', '인샌디오', '인쎈디오', '인센지오', 'incendio'],
  },
  {
    id: 'confringo', name: '컨프링고', en: 'Confringo', type: 'attack',
    desc: '폭발 마법. 세게, 조금 길게',
    power: 25, mana: 24, force: 20, duration: 800, color: '#ff6a00',
    aliases: ['컨프링고', '콘프링고', '컨프링거', '컨플링고', 'confringo'],
  },
  {
    id: 'sectumsempra', name: '섹튬셈프라', en: 'Sectumsempra', type: 'attack',
    desc: '어둠의 베기 마법. 아주 세게, 길게 베어라',
    power: 33, mana: 32, force: 24, duration: 1100, color: '#d0d0ff',
    aliases: ['섹튬셈프라', '섹툼셈프라', '섹텀셈프라', '셉툼셈프라', '섹투셈프라', 'sectumsempra'],
  },
  {
    id: 'avada', name: '아바다 케다브라', en: 'Avada Kedavra', type: 'attack', unblockable: true,
    desc: '용서받지 못할 저주. 온 힘을 다해 오래 휘둘러라. 방패로 막을 수 없다',
    power: 60, mana: 60, force: 30, duration: 1800, color: '#3dff6a',
    aliases: ['아바다케다브라', '아바다 케다브라', '아바다카다브라', '아브라카다브라', '아바다 커다브라', 'avadakedavra', 'avada kedavra'],
  },
];

// 적 주문. effect: damage | disarm | stun | shield
// unblockable 이면 프로테고로 못 막고, 시전 중에 끊어야 한다.
export const ENEMIES = [
  {
    id: 'dummy', name: '연습용 허수아비', title: '연습 모드 · 공격하지 않음', avatar: '🎯',
    hp: 300, interval: null, telegraph: 0, spells: [],
  },
  {
    id: 'draco', name: '드레이코 말포이', title: '슬리데린 · 쉬움', avatar: '🐍',
    hp: 90, interval: [4500, 6500], telegraph: 2200,
    spells: [
      { name: '엑스펠리아르무스', power: 6, effect: 'disarm', color: '#ff5050', w: 2 },
      { name: '스투페파이', power: 10, effect: 'stun', color: '#ff8a3d', w: 2 },
      { name: '리크투셈프라', power: 7, effect: 'damage', color: '#e0e0ff', w: 2 },
      { name: '프로테고', effect: 'shield', color: '#7fd8ff', w: 1 },
    ],
  },
  {
    id: 'bellatrix', name: '벨라트릭스 레스트레인지', title: '죽음을 먹는 자 · 보통', avatar: '🖤',
    hp: 140, interval: [3300, 4800], telegraph: 1700,
    spells: [
      { name: '크루시오', power: 20, effect: 'damage', color: '#ff2d6f', w: 3 },
      { name: '스투페파이', power: 12, effect: 'stun', color: '#ff8a3d', w: 2 },
      { name: '봄바르다', power: 16, effect: 'damage', color: '#ffb02e', w: 2 },
      { name: '프로테고', effect: 'shield', color: '#7fd8ff', w: 1 },
    ],
  },
  {
    id: 'voldemort', name: '볼드모트 경', title: '어둠의 왕 · 어려움', avatar: '💀',
    hp: 200, interval: [2800, 4200], telegraph: 1500,
    spells: [
      { name: '아바다 케다브라', power: 45, effect: 'damage', unblockable: true, color: '#3dff6a', w: 1, telegraphMul: 1.4 },
      { name: '크루시오', power: 22, effect: 'damage', color: '#ff2d6f', w: 3 },
      { name: '엑스펠리아르무스', power: 8, effect: 'disarm', color: '#ff5050', w: 2 },
      { name: '피엔드파이어', power: 28, effect: 'damage', color: '#ff4500', w: 2 },
      { name: '프로테고 막시마', effect: 'shield', color: '#7fd8ff', w: 1 },
    ],
  },
];

export const findSpell = (id) => SPELLS.find((s) => s.id === id);
