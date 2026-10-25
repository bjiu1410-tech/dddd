import { SPELLS, ENEMIES } from './spells.js';
import { matchSpell } from './matcher.js';
import { SwingTracker, evaluateSwing, createMotionReader } from './swing.js';
import { sfx, unlockAudio, vibrate } from './audio.js';
import { Effects } from './effects.js';

const $ = (s) => document.querySelector(s);
const now = () => performance.now();
const rand = (a, b) => a + Math.random() * (b - a);
// 받침에 맞는 조사: josa('볼드모트 경', '이', '가') → '볼드모트 경이'
const josa = (word, withBatchim, without) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code < 11172 && code % 28 ? withBatchim : without);
};

const CAST_WINDOW = 4000; // 주문을 외친 뒤 휘두를 수 있는 시간
const PLAYER_MAX = { hp: 100, mana: 100 };
const MANA_REGEN = 7; // 초당

// ---------- 설정 ----------
const settings = { sensitivity: 1, lang: 'ko-KR', enemy: 'draco' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('hogwarts-settings') || '{}')); } catch { /* 무시 */ }
const saveSettings = () => { try { localStorage.setItem('hogwarts-settings', JSON.stringify(settings)); } catch { /* 무시 */ } };

// ---------- 상태 ----------
let G = null;
let fx = null;

function newGame(enemyDef) {
  const t = now();
  return {
    over: false,
    def: enemyDef,
    player: { hp: PLAYER_MAX.hp, mana: PLAYER_MAX.mana, shieldUntil: 0, stunnedUntil: 0 },
    enemy: {
      hp: enemyDef.hp, shieldUntil: 0, stunnedUntil: 0, casting: null,
      nextCastAt: enemyDef.interval ? t + rand(...enemyDef.interval) + 1500 : Infinity,
    },
    phase: 'idle', // idle | charge | cooldown
    charge: null,
    cooldownUntil: 0,
    lastT: t,
  };
}

// ---------- 센서 입력 ----------
const readMotion = createMotionReader();
let lastSampleT = 0;
let liveMag = 0;
let motionSeen = false;

function onMotionSample(mag) {
  const t = now();
  lastSampleT = t;
  liveMag = Math.max(mag, liveMag * 0.9);
  if (G?.phase === 'charge') {
    const res = G.charge.tracker.feed(mag, t);
    if (G.charge.tracker.started) fx?.sparkle(G.charge.spell.color, mag * settings.sensitivity);
    if (res) resolveCast(res);
  }
}

window.addEventListener('devicemotion', (e) => {
  const mag = readMotion(e);
  if (mag > 0) motionSeen = true;
  onMotionSample(mag);
});

// 센서가 없는 기기용: 전투 화면을 빠르게 문지르면 휘두르기로 친다 (px/ms → m/s² 근사)
let lastPtr = null;
const arena = $('#arena');
arena.addEventListener('pointerdown', (e) => { lastPtr = { x: e.clientX, y: e.clientY, t: now() }; });
arena.addEventListener('pointermove', (e) => {
  if (!lastPtr) return;
  const t = now();
  const dt = Math.max(t - lastPtr.t, 1);
  const speed = Math.hypot(e.clientX - lastPtr.x, e.clientY - lastPtr.y) / dt;
  lastPtr = { x: e.clientX, y: e.clientY, t };
  onMotionSample(speed * 12);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => arena.addEventListener(n, () => { lastPtr = null; }));

async function requestMotionPermission() {
  // iOS 13+ 는 사용자 제스처 안에서 권한을 받아야 한다
  const DME = window.DeviceMotionEvent;
  if (DME && typeof DME.requestPermission === 'function') {
    try { return (await DME.requestPermission()) === 'granted'; } catch { return false; }
  }
  return !!DME;
}

// ---------- 음성 인식 ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let recSession = 0;
const consumed = new Set();
let micWanted = false;

function setMic(state, text) {
  const el = $('#mic');
  el.className = `mic ${state}`;
  if (text != null) $('#transcript').textContent = text;
}

function startSpeech() {
  micWanted = true;
  if (!SR) { setMic('off', '이 브라우저는 음성 인식 미지원 — 📖 주문서를 눌러 시전'); return; }
  if (rec) { try { rec.start(); } catch { /* 이미 실행 중 */ } return; }
  rec = new SR();
  rec.lang = settings.lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  rec.onstart = () => setMic('on', '듣는 중…');
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const key = `${recSession}:${i}`;
      setMic('on', res[0].transcript);
      if (consumed.has(key)) continue;
      for (let k = 0; k < res.length; k++) {
        const m = matchSpell(res[k].transcript);
        if (m) {
          consumed.add(key);
          onSpellSpoken(m.spell);
          break;
        }
      }
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      micWanted = false;
      setMic('off', '마이크 권한이 없어요 — 📖 주문서를 눌러 시전');
    }
  };
  rec.onend = () => {
    recSession++;
    if (micWanted) setTimeout(() => { if (micWanted) { try { rec.start(); } catch { /* 무시 */ } } }, 200);
  };
  try { rec.start(); } catch { /* 무시 */ }
}

function stopSpeech() {
  micWanted = false;
  try { rec?.stop(); } catch { /* 무시 */ }
}

// ---------- 플레이어 시전 ----------
function onSpellSpoken(spell) {
  if (!G || G.over) return;
  const t = now();
  if (G.phase !== 'idle') return;
  if (G.player.stunnedUntil > t) { log('기절해서 주문을 쓸 수 없다!', 'foe'); return; }
  if (G.player.mana < spell.mana) { log(`마나가 부족하다! (${spell.name}: ${spell.mana} 필요)`); float('마나 부족', '#4da3ff', 'player'); return; }
  G.phase = 'charge';
  G.charge = {
    spell, start: t, deadline: t + CAST_WINDOW,
    tracker: new SwingTracker({ maxDuration: spell.duration * 1.6 }),
  };
  sfx.ready();
  vibrate(30);
  log(`"${spell.name}!"`, 'me');
}

function resolveCast(swing) {
  const { spell } = G.charge;
  const ev = evaluateSwing(spell, swing, settings.sensitivity);
  G.charge = null;
  G.phase = 'cooldown';
  G.cooldownUntil = now() + 500;

  if (!ev.success) {
    G.player.mana -= Math.round(spell.mana * 0.3);
    sfx.fizzle();
    log(`${spell.name} 실패… ${ev.reason}`, 'foe');
    float('실패', '#999', 'player');
    return;
  }

  G.player.mana -= spell.mana;
  const mult = ev.multiplier;
  sfx.cast(mult);
  vibrate(Math.round(60 + 80 * mult));
  float(ev.grade, ev.grade === '완벽!' ? '#f4c95d' : '#fff', 'player');

  if (spell.type === 'shield') {
    G.player.shieldUntil = now() + 2500 * Math.min(mult, 1.3);
    sfx.shield();
    log(`프로테고! 방패가 펼쳐졌다 (${(2.5 * Math.min(mult, 1.3)).toFixed(1)}초)`, 'good');
    return;
  }
  if (spell.type === 'heal') {
    const amt = Math.round(spell.power * mult);
    G.player.hp = Math.min(PLAYER_MAX.hp, G.player.hp + amt);
    sfx.heal();
    fx.burstAt('player', spell.color, 50, 3);
    float(`+${amt}`, '#6dff9a', 'player');
    log(`에피스키! 체력 ${amt} 회복`, 'good');
    return;
  }

  const size = 4 + spell.power / 6;
  fx.bolt('player', spell.color, size, 450, () => playerSpellHits(spell, mult));
}

function playerSpellHits(spell, mult) {
  if (!G || G.over) return;
  const t = now();
  const e = G.enemy;
  if (e.shieldUntil > t && !spell.unblockable) {
    e.shieldUntil = 0;
    sfx.shield();
    float('막힘!', '#7fd8ff', 'enemy');
    log(`${josa(G.def.name, '이', '가')} 방패로 막았다!`, 'foe');
    return;
  }
  const dmg = Math.round(spell.power * mult);
  e.hp = Math.max(0, e.hp - dmg);
  sfx.hit();
  hurt('#enemyAvatar');
  float(`-${dmg}`, spell.color, 'enemy');
  let msg = `${spell.name} 적중! ${dmg} 피해`;

  if ((spell.type === 'disarm' || spell.type === 'stun') && e.casting) {
    msg += ` · ${e.casting.spell.name} 시전을 끊었다!`;
    e.casting = null;
    e.nextCastAt = t + rand(1500, 2500);
  }
  if (spell.type === 'stun') {
    e.stunnedUntil = t + 2500 * Math.min(mult, 1.3);
    e.nextCastAt = Math.max(e.nextCastAt, e.stunnedUntil + 800);
  }
  log(msg, 'good');
  if (e.hp <= 0) endGame(true);
}

// ---------- 적 AI ----------
function pickEnemySpell(def) {
  const total = def.spells.reduce((s, sp) => s + sp.w, 0);
  let r = Math.random() * total;
  for (const sp of def.spells) { if ((r -= sp.w) <= 0) return sp; }
  return def.spells[0];
}

function updateEnemy(t) {
  const e = G.enemy;
  const def = G.def;
  if (!def.interval || e.stunnedUntil > t) return;

  if (!e.casting && t >= e.nextCastAt) {
    const sp = pickEnemySpell(def);
    if (sp.effect === 'shield') {
      e.shieldUntil = t + 2500;
      sfx.shield();
      log(`${def.name}: "${sp.name}!" — 방패를 펼쳤다`, 'foe');
      e.nextCastAt = t + rand(...def.interval);
      return;
    }
    const dur = def.telegraph * (sp.telegraphMul || 1);
    e.casting = { spell: sp, start: t, end: t + dur };
    sfx.enemyCharge();
    log(`${josa(def.name, '이', '가')} "${josa(sp.name, '을', '를')}" 외우고 있다!${sp.unblockable ? ' (막을 수 없다! 끊어라!)' : ''}`, 'foe');
  }

  if (e.casting && t >= e.casting.end) {
    const sp = e.casting.spell;
    e.casting = null;
    e.nextCastAt = t + rand(...def.interval);
    fx.bolt('enemy', sp.color, 4 + sp.power / 6, 380, () => enemySpellHits(sp));
  }
}

function enemySpellHits(sp) {
  if (!G || G.over) return;
  const t = now();
  const p = G.player;
  if (p.shieldUntil > t && !sp.unblockable) {
    p.shieldUntil = 0;
    sfx.shield();
    vibrate([40, 40, 40]);
    float('방어!', '#7fd8ff', 'player');
    log(`${josa(sp.name, '을', '를')} 프로테고로 막았다!`, 'good');
    return;
  }
  if (p.shieldUntil > t && sp.unblockable) log('방패가 아바다 케다브라를 막지 못했다!', 'foe');
  p.hp = Math.max(0, p.hp - sp.power);
  sfx.hit();
  vibrate(250);
  float(`-${sp.power}`, '#ff4d6d', 'player');
  const battle = $('#battle');
  battle.classList.remove('shake', 'flash-red');
  void battle.offsetWidth;
  battle.classList.add('shake', 'flash-red');
  let msg = `${sp.name}에 맞았다! ${sp.power} 피해`;

  if (sp.effect === 'stun') {
    p.stunnedUntil = t + 1500;
    msg += ' · 기절!';
  }
  if ((sp.effect === 'disarm' || sp.effect === 'stun') && G.phase === 'charge') {
    msg += ` · ${G.charge.spell.name} 시전이 끊겼다`;
    G.charge = null;
    G.phase = 'cooldown';
    G.cooldownUntil = t + 600;
  }
  if (sp.effect === 'disarm') {
    p.stunnedUntil = Math.max(p.stunnedUntil, t + 1000);
    msg += ' · 지팡이를 놓쳤다!';
  }
  log(msg, 'foe');
  if (p.hp <= 0) endGame(false);
}

// ---------- 메인 루프 ----------
function loop() {
  const t = now();
  if (G && !G.over) {
    const dt = Math.min(t - G.lastT, 100) / 1000;
    G.lastT = t;
    G.player.mana = Math.min(PLAYER_MAX.mana, G.player.mana + MANA_REGEN * dt);

    if (G.phase === 'charge') {
      // 센서 이벤트가 끊긴 경우(문지르기를 멈춤 등)에도 휘두르기가 끝나도록 0을 넣어준다
      if (t - lastSampleT > 60) {
        const res = G.charge.tracker.feed(0, t);
        if (res) resolveCast(res);
      }
      if (G.phase === 'charge' && !G.charge.tracker.started && t > G.charge.deadline) {
        G.phase = 'cooldown';
        G.cooldownUntil = t + 400;
        log(`${G.charge.spell.name}… 휘두르지 않아 주문이 흩어졌다`);
        G.charge = null;
        sfx.fizzle();
      }
    } else if (G.phase === 'cooldown' && t >= G.cooldownUntil) {
      G.phase = 'idle';
    }
    updateEnemy(t);
    render(t);
  }
  liveMag *= 0.97;
  $('#liveMag').textContent = (liveMag * settings.sensitivity).toFixed(1);
  if (fx) {
    fx.shields.player = G && G.player.shieldUntil > t;
    fx.shields.enemy = G && G.enemy.shieldUntil > t;
    fx.draw(t);
  }
  requestAnimationFrame(loop);
}

// ---------- 화면 ----------
function setBar(id, ratio) { $(id).style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`; }

function render(t) {
  const { player: p, enemy: e, def } = G;
  setBar('#enemyHp', e.hp / def.hp);
  $('#enemyHpText').textContent = `${Math.ceil(e.hp)} / ${def.hp}`;
  setBar('#playerHp', p.hp / PLAYER_MAX.hp);
  $('#playerHpText').textContent = `${Math.ceil(p.hp)} / ${PLAYER_MAX.hp}`;
  setBar('#playerMana', p.mana / PLAYER_MAX.mana);
  $('#playerManaText').textContent = `마나 ${Math.floor(p.mana)}`;

  const es = [];
  if (e.stunnedUntil > t) es.push('💫 기절');
  if (e.shieldUntil > t) es.push('🛡️ 방패');
  $('#enemyStatus').textContent = es.join(' ');
  const ps = [];
  if (p.stunnedUntil > t) ps.push('💫 기절');
  if (p.shieldUntil > t) ps.push(`🛡️ ${((p.shieldUntil - t) / 1000).toFixed(1)}s`);
  $('#playerStatus').textContent = ps.join(' ');

  const castEl = $('#enemyCast');
  castEl.hidden = !e.casting;
  if (e.casting) {
    $('#enemyCastLabel').textContent = `⚠ ${e.casting.spell.name}${e.casting.spell.unblockable ? ' (방어 불가)' : ''}`;
    setBar('#enemyCastBar', (t - e.casting.start) / (e.casting.end - e.casting.start));
  }

  const main = $('#promptMain');
  const sub = $('#promptSub');
  const meters = $('#meters');
  if (G.phase === 'charge') {
    const { spell, tracker } = G.charge;
    main.textContent = `${spell.name} — 휘둘러라!`;
    main.className = 'swing';
    main.style.color = spell.color;
    sub.textContent = tracker.started ? '계속! 멈추면 발사' : `💪 ${'★'.repeat(stars(spell.force))}  ⏱ ${(spell.duration / 1000).toFixed(1)}초 이상`;
    meters.hidden = false;
    const fr = (tracker.peak * settings.sensitivity) / (spell.force * 1.5);
    const dr = tracker.activeMs / (spell.duration * 1.2);
    setBar('#forceBar', fr);
    setBar('#durBar', dr);
    $('#forceBar').classList.toggle('met', fr >= 1 / 1.5);
    $('#durBar').classList.toggle('met', dr >= 1 / 1.2);
    setBar('#timerBar', tracker.started ? 0 : (G.charge.deadline - t) / CAST_WINDOW);
  } else {
    main.className = '';
    main.style.color = '';
    meters.hidden = true;
    if (p.stunnedUntil > t) { main.textContent = '💫 기절!'; sub.textContent = ''; }
    else if (e.casting) {
      main.textContent = e.casting.spell.unblockable ? '끊어라!' : '막거나 끊어라!';
      sub.textContent = e.casting.spell.unblockable ? '엑스펠리아르무스 / 스투페파이' : '프로테고 / 엑스펠리아르무스 / 스투페파이';
    } else { main.textContent = '주문을 외쳐라!'; sub.textContent = '📖 주문서에서 주문 확인'; }
  }
}

const stars = (force) => Math.max(1, Math.min(5, Math.round(force / 6)));

function log(msg, cls = '') {
  const box = $('#log');
  const d = document.createElement('div');
  d.textContent = msg;
  if (cls) d.className = cls;
  box.appendChild(d);
  while (box.children.length > 4) box.firstChild.remove();
}

function float(text, color, who) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.color = color;
  el.style.top = who === 'enemy' ? '12%' : '68%';
  $('#floaters').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function hurt(sel) {
  const el = $(sel);
  el.classList.remove('hurt');
  void el.offsetWidth;
  el.classList.add('hurt');
}

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

function endGame(won) {
  G.over = true;
  G.phase = 'idle';
  G.charge = null;
  render(now());
  stopSpeech();
  (won ? sfx.win : sfx.lose)();
  vibrate(won ? [80, 60, 80, 60, 200] : 600);
  $('#resultTitle').textContent = won ? '🏆 승리!' : '💀 패배…';
  $('#resultText').textContent = won
    ? `${josa(G.def.name, '을', '를')} 쓰러뜨렸다! 남은 체력 ${Math.ceil(G.player.hp)}`
    : `${G.def.name}에게 졌다. 더 세게, 더 오래 휘둘러 보자!`;
  setTimeout(() => { $('#result').hidden = false; }, 700);
}

// ---------- 메뉴 ----------
function buildMenu() {
  const box = $('#enemySelect');
  for (const en of ENEMIES) {
    const b = document.createElement('button');
    b.dataset.id = en.id;
    b.innerHTML = `<span class="av">${en.avatar}</span><span>${en.name}<small>${en.title}</small></span>`;
    b.addEventListener('click', () => { settings.enemy = en.id; saveSettings(); markEnemy(); });
    box.appendChild(b);
  }
  markEnemy();

  const sens = $('#sensitivity');
  sens.value = settings.sensitivity;
  $('#sensOut').textContent = Number(settings.sensitivity).toFixed(1);
  sens.addEventListener('input', () => {
    settings.sensitivity = Number(sens.value);
    $('#sensOut').textContent = settings.sensitivity.toFixed(1);
    saveSettings();
  });
  const lang = $('#lang');
  lang.value = settings.lang;
  lang.addEventListener('change', () => {
    settings.lang = lang.value;
    saveSettings();
    if (rec) rec.lang = settings.lang;
  });

  const list = $('#spellList');
  for (const sp of SPELLS) {
    const li = document.createElement('li');
    li.style.setProperty('--c', sp.color);
    li.innerHTML = `<div><span class="t"></span><span class="en"></span></div><div class="d"></div>
      <div class="req"><span>💪 ${'★'.repeat(stars(sp.force))}${'☆'.repeat(5 - stars(sp.force))}</span>
      <span>⏱ ${(sp.duration / 1000).toFixed(1)}초</span><span>💧 ${sp.mana}</span>
      ${sp.power ? `<span>${sp.type === 'heal' ? '💚' : '⚔️'} ${sp.power}</span>` : ''}</div>`;
    li.querySelector('.t').textContent = sp.name;
    li.querySelector('.en').textContent = sp.en;
    li.querySelector('.d').textContent = sp.desc;
    li.addEventListener('click', () => { $('#spellbook').hidden = true; onSpellSpoken(sp); });
    list.appendChild(li);
  }

  const notes = [];
  if (!window.isSecureContext) notes.push('⚠ HTTPS(또는 localhost)에서 열어야 마이크·모션 센서가 동작합니다.');
  if (!SR) notes.push('⚠ 이 브라우저는 음성 인식을 지원하지 않아요. 안드로이드 Chrome 또는 iOS Safari를 권장합니다.');
  $('#envNote').textContent = notes.join(' ');
}

function markEnemy() {
  document.querySelectorAll('#enemySelect button').forEach((b) => b.classList.toggle('sel', b.dataset.id === settings.enemy));
}

async function startBattle() {
  unlockAudio();
  await requestMotionPermission();
  const def = ENEMIES.find((e) => e.id === settings.enemy) || ENEMIES[1];
  G = newGame(def);
  $('#enemyAvatar').textContent = def.avatar;
  $('#enemyName').textContent = def.name;
  $('#log').innerHTML = '';
  $('#result').hidden = true;
  show('battle');
  fx.resize();
  log(`${josa(def.name, '과', '와')}의 결투 시작!`);
  startSpeech();
  const game = G;
  setTimeout(() => {
    if (!motionSeen && G === game && !G.over) log('모션 센서가 감지되지 않아요 — 화면을 빠르게 문질러 휘두르세요');
  }, 2500);
}

function toMenu() {
  if (G) G.over = true;
  stopSpeech();
  $('#result').hidden = true;
  show('menu');
}

$('#startBtn').addEventListener('click', startBattle);
$('#againBtn').addEventListener('click', startBattle);
$('#menuBtn').addEventListener('click', toMenu);
$('#quitBtn').addEventListener('click', toMenu);
$('#bookBtn').addEventListener('click', () => { $('#spellbook').hidden = false; });
$('#closeBook').addEventListener('click', () => { $('#spellbook').hidden = true; });
// 메뉴에서도 센서 세기를 볼 수 있게 첫 터치 때 권한 요청 (iOS)
$('#menu').addEventListener('click', () => { requestMotionPermission(); }, { once: true });

fx = new Effects($('#fx'));
buildMenu();
requestAnimationFrame(loop);
