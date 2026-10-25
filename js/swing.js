// 지팡이(폰) 휘두르기 감지.
// 가속도 크기(m/s²) 샘플을 받아 한 번의 휘두르기가 끝나면 { peak, duration } 을 돌려준다.
//  - startThreshold 이상이 되면 휘두르기 시작
//  - sustainThreshold 이상인 동안을 "휘두른 시간"으로 누적
//  - endGap 동안 잠잠하거나 maxDuration 만큼 휘두르면 종료
export class SwingTracker {
  constructor({ startThreshold = 6, sustainThreshold = 3.5, endGap = 300, maxDuration = Infinity } = {}) {
    Object.assign(this, { startThreshold, sustainThreshold, endGap, maxDuration });
    this.started = false;
    this.done = false;
    this.peak = 0;
    this.activeMs = 0;
    this.lastT = null;
    this.quietSince = null;
  }

  feed(mag, t) {
    if (this.done) return null;
    const dt = this.lastT == null ? 0 : Math.min(Math.max(t - this.lastT, 0), 100);
    this.lastT = t;
    if (!this.started) {
      if (mag < this.startThreshold) return null;
      this.started = true;
      this.peak = mag;
      return null;
    }
    this.peak = Math.max(this.peak, mag);
    if (mag >= this.sustainThreshold) {
      this.activeMs += dt;
      this.quietSince = null;
      if (this.activeMs >= this.maxDuration) return this.finish();
    } else if (this.quietSince == null) {
      this.quietSince = t;
    } else if (t - this.quietSince >= this.endGap) {
      return this.finish();
    }
    return null;
  }

  finish() {
    this.done = true;
    return { peak: this.peak, duration: this.activeMs };
  }
}

// 휘두르기를 주문 요구치와 비교해 성공 여부와 위력 배율을 정한다.
// 요구치의 60% 미만이면 실패, 넘치게 휘두르면 최대 1.5배.
export function evaluateSwing(spell, swing, sensitivity = 1) {
  const forceRatio = (swing.peak * sensitivity) / spell.force;
  const durRatio = swing.duration / spell.duration;
  if (forceRatio < 0.6 || durRatio < 0.6) {
    return {
      success: false, forceRatio, durRatio, multiplier: 0, grade: '실패',
      reason: forceRatio < 0.6 ? '너무 약하게 휘둘렀다!' : '너무 짧게 휘둘렀다!',
    };
  }
  const multiplier = Math.min(1.5, Math.min(forceRatio, 1.5) * Math.min(durRatio, 1.2));
  const grade = multiplier >= 1.15 ? '완벽!' : multiplier >= 0.85 ? '좋아!' : '약함';
  return { success: true, forceRatio, durRatio, multiplier, grade };
}

// DeviceMotionEvent → 중력을 뺀 가속도 크기.
// acceleration 이 없는 기기는 accelerationIncludingGravity 에서 저역 통과로 중력을 추정해 뺀다.
// 손목 스냅은 회전이 커서 rotationRate 도 함께 반영한다.
export function createMotionReader() {
  const g = { x: 0, y: 0, z: 9.8 };
  return (e) => {
    let lin = 0;
    const a = e.acceleration;
    if (a && a.x != null && (a.x || a.y || a.z)) {
      lin = Math.hypot(a.x, a.y, a.z);
    } else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
      const ag = e.accelerationIncludingGravity;
      g.x = 0.9 * g.x + 0.1 * ag.x;
      g.y = 0.9 * g.y + 0.1 * ag.y;
      g.z = 0.9 * g.z + 0.1 * ag.z;
      lin = Math.hypot(ag.x - g.x, ag.y - g.y, ag.z - g.z);
    }
    const r = e.rotationRate;
    const rot = r ? Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0) / 30 : 0;
    return Math.max(lin, rot);
  };
}
