// 캔버스 위의 마법 광선·파티클·방패 연출
export class Effects {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bolts = [];
    this.particles = [];
    this.shields = { player: 0, enemy: 0 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.max(1, r.width * dpr);
    this.canvas.height = Math.max(1, r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  points(from) {
    const p = { x: this.w / 2, y: this.h - 10 };
    const e = { x: this.w / 2, y: 10 };
    return from === 'player' ? [p, e] : [e, p];
  }

  // 광선 발사. 도착하면 onHit 호출
  bolt(from, color, size, dur, onHit) {
    const [a, b] = this.points(from);
    const wobble = (Math.random() - 0.5) * this.w * 0.5;
    this.bolts.push({ a, b, wobble, color, size, t0: performance.now(), dur, onHit, trail: [] });
  }

  burst(x, y, color, count = 40, speed = 4) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = Math.random() * speed + 1;
      this.particles.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 1, color, r: Math.random() * 3 + 1 });
    }
  }

  burstAt(target, color, count, speed) {
    const y = target === 'enemy' ? 30 : this.h - 30;
    this.burst(this.w / 2, y, color, count, speed);
  }

  // 휘두르는 동안 지팡이 끝 반짝임
  sparkle(color, intensity) {
    const n = Math.min(6, Math.floor(intensity / 4));
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: this.w / 2 + (Math.random() - 0.5) * 60, y: this.h - 20,
        vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 3 - 1, life: 0.7, color, r: Math.random() * 2 + 1,
      });
    }
  }

  draw(now) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = 'lighter';

    this.bolts = this.bolts.filter((bl) => {
      const k = Math.min(1, (now - bl.t0) / bl.dur);
      const x = bl.a.x + (bl.b.x - bl.a.x) * k + Math.sin(k * Math.PI) * bl.wobble;
      const y = bl.a.y + (bl.b.y - bl.a.y) * k;
      bl.trail.push({ x, y });
      if (bl.trail.length > 18) bl.trail.shift();
      c.strokeStyle = bl.color;
      c.lineCap = 'round';
      bl.trail.forEach((p, i) => {
        if (!i) return;
        const q = bl.trail[i - 1];
        c.globalAlpha = i / bl.trail.length;
        c.lineWidth = bl.size * (i / bl.trail.length);
        c.beginPath();
        c.moveTo(q.x, q.y);
        c.lineTo(p.x, p.y);
        c.stroke();
      });
      c.globalAlpha = 1;
      const grad = c.createRadialGradient(x, y, 0, x, y, bl.size * 2.5);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.3, bl.color);
      grad.addColorStop(1, 'transparent');
      c.fillStyle = grad;
      c.beginPath();
      c.arc(x, y, bl.size * 2.5, 0, Math.PI * 2);
      c.fill();
      if (k >= 1) {
        this.burst(x, y, bl.color, 30 + bl.size * 4, 3 + bl.size / 3);
        bl.onHit?.();
        return false;
      }
      return true;
    });

    this.particles = this.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= 0.02;
      if (p.life <= 0) return false;
      c.globalAlpha = p.life;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
      return true;
    });
    c.globalAlpha = 1;

    for (const who of ['player', 'enemy']) {
      if (!this.shields[who]) continue;
      const y = who === 'player' ? this.h + 20 : -20;
      const pulse = 0.5 + 0.2 * Math.sin(now / 120);
      c.strokeStyle = `rgba(127,216,255,${pulse})`;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(this.w / 2, y, Math.min(this.w * 0.45, 170), 0, Math.PI * 2);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  }
}
