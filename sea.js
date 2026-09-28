// Squeeze — de zee op de achtergrond.
// Donkere diepzee in Pump-groen die meeleeft met de chart:
// buys = belletjes, pump = feller licht, dump = troebeler, droogte = stil en schemerig, ring = lichtgolf.
(function () {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  class Sea {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.reduced = !!opts.reducedMotion;
      this.anchor = opts.anchor || null; // element waar Squeeze staat (voor gloed en belletjes)
      this.t = 0;
      this.price = 0;      // -1..1
      this.priceV = 0;
      this.drought = 0;    // 0..1 (zacht)
      this.droughtT = 0;
      this.combo = 0;
      this.waves = [];
      this.bubbles = [];
      this.snow = [];
      this.weeds = [];
      this._last = 0;
      this._acc = 0;
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    // ---------- publieke API ----------
    setPrice(p) {
      this.price = clamp(p, -1, 1);
    }
    setDrought(on) {
      this.droughtT = on ? 1 : 0;
    }
    setCombo(n) {
      this.combo = clamp(n / 8, 0, 1);
    }
    // wolkje belletjes vanaf Squeeze (n = aantal buys)
    puff(n = 1) {
      if (this.reduced) return;
      const { x, y } = this._anchor();
      const count = Math.min(26, 6 + n * 4);
      for (let i = 0; i < count; i++) {
        this.bubbles.push(this._bubble(x + (Math.random() - 0.5) * 120, y + Math.random() * 40, true));
      }
    }
    // lichtgolf bij een nieuwe ring
    wave() {
      this.waves.push({ t: 0 });
      if (!this.reduced) this.puff(3);
      if (this.reduced) this.draw();
    }

    start() {
      if (this.reduced) {
        this.draw();
        return;
      }
      this._last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        // max ~30 fps: de zee hoeft niet sneller, spaart telefoons
        this._acc += dt;
        if (this._acc >= 1 / 30) {
          this.update(this._acc);
          this.draw();
          this._acc = 0;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    // ---------- intern ----------
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.w = Math.max(1, window.innerWidth);
      this.h = Math.max(1, window.innerHeight);
      this.dpr = dpr;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      // zeesneeuw: kleine deeltjes die rustig zweven
      const n = Math.round(clamp((this.w * this.h) / 26000, 18, 60));
      this.snow = Array.from({ length: n }, () => ({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 0.6 + Math.random() * 1.4,
        s: 4 + Math.random() * 10,
        ph: Math.random() * 6.28,
      }));
      // zeewier langs de bodem
      const wn = Math.round(clamp(this.w / 110, 5, 14));
      this.weeds = Array.from({ length: wn }, (_, i) => ({
        x: ((i + 0.5) / wn) * this.w + (Math.random() - 0.5) * 60,
        h: 50 + Math.random() * 90,
        wd: 5 + Math.random() * 5,
        ph: Math.random() * 6.28,
        sp: 0.5 + Math.random() * 0.5,
      }));
      if (this.reduced) this.draw();
    }

    _anchor() {
      if (this.anchor) {
        const r = this.anchor.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.55, r: Math.max(r.width, r.height) };
      }
      return { x: this.w / 2, y: this.h * 0.4, r: Math.min(this.w, this.h) };
    }

    _bubble(x, y, burst) {
      return {
        x,
        y,
        r: burst ? 2 + Math.random() * 5 : 1.5 + Math.random() * 3.5,
        vy: burst ? 40 + Math.random() * 70 : 14 + Math.random() * 22,
        ph: Math.random() * 6.28,
        wob: 6 + Math.random() * 10,
      };
    }

    update(dt) {
      this.t += dt;
      this.priceV += (this.price - this.priceV) * (1 - Math.exp(-dt * 1.2));
      this.drought += (this.droughtT - this.drought) * (1 - Math.exp(-dt * 0.5));

      // losse belletjes vanaf de bodem (minder bij droogte, meer bij combo)
      const rate = (0.9 + this.combo * 2.5) * (1 - 0.9 * this.drought);
      if (Math.random() < rate * dt) {
        this.bubbles.push(this._bubble(Math.random() * this.w, this.h + 10, false));
      }
      for (const b of this.bubbles) {
        b.y -= b.vy * dt;
        b.ph += dt * 2;
      }
      this.bubbles = this.bubbles.filter((b) => b.y > -20);
      if (this.bubbles.length > 140) this.bubbles.splice(0, this.bubbles.length - 140);

      for (const s of this.snow) {
        s.y -= s.s * dt * 0.25;
        s.x += Math.sin(this.t * 0.3 + s.ph) * dt * 3;
        if (s.y < -5) {
          s.y = this.h + 5;
          s.x = Math.random() * this.w;
        }
      }
      for (const w of this.waves) w.t += dt;
      this.waves = this.waves.filter((w) => w.t < 2.2);
    }

    draw() {
      const { ctx, w, h, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const p = this.priceV;
      const d = this.drought;
      const pump = clamp(p, 0, 1);
      const dump = clamp(-p, 0, 1);
      const a = this._anchor();

      // 1. water: van donker groen-blauw boven naar bijna zwart onder
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgb(${lerp(7, 4, d) | 0},${lerp(38, 22, d + dump * 0.5) | 0},${lerp(30, 18, d) | 0})`);
      g.addColorStop(0.45, "rgb(3,18,13)");
      g.addColorStop(1, "rgb(2,8,6)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 2. gloed achter Squeeze
      const glowA = (0.3 + pump * 0.18) * (1 - 0.55 * d) * (1 - 0.35 * dump);
      const rg = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r * 0.75);
      rg.addColorStop(0, `rgba(30,120,70,${glowA})`);
      rg.addColorStop(1, "rgba(30,120,70,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      // 3. lichtstralen van boven
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const rays = 6;
      const rayA = (0.05 + pump * 0.06) * (1 - 0.8 * d) * (1 - 0.5 * dump);
      for (let i = 0; i < rays; i++) {
        const baseX = ((i + 0.5) / rays) * w * 1.3 - w * 0.15;
        const sway = this.reduced ? 0 : Math.sin(this.t * 0.25 + i * 1.7) * 40;
        const topW = 30 + (i % 3) * 22;
        const botW = topW * 3.2;
        const skew = h * 0.28;
        const lg = ctx.createLinearGradient(0, 0, 0, h * 0.85);
        const flick = this.reduced ? 1 : 0.75 + 0.25 * Math.sin(this.t * 0.6 + i * 2.3);
        lg.addColorStop(0, `rgba(170,255,190,${rayA * flick})`);
        lg.addColorStop(1, "rgba(170,255,190,0)");
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(baseX + sway - topW / 2, 0);
        ctx.lineTo(baseX + sway + topW / 2, 0);
        ctx.lineTo(baseX + sway + skew + botW / 2, h * 0.85);
        ctx.lineTo(baseX + sway + skew - botW / 2, h * 0.85);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 4. zeesneeuw
      ctx.fillStyle = `rgba(200,255,210,${0.22 * (1 - 0.4 * d)})`;
      for (const s of this.snow) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. bodem: zandheuvels en zeewier
      this._drawBed();

      // 6. belletjes
      for (const b of this.bubbles) {
        const x = b.x + (this.reduced ? 0 : Math.sin(b.ph) * b.wob * 0.3);
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(210,255,215,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(240,255,240,0.45)";
        ctx.fill();
      }

      // 7. lichtgolf bij een nieuwe ring
      for (const wv of this.waves) {
        const t = wv.t / 2.2;
        const rr = lerp(a.r * 0.2, Math.hypot(w, h), t);
        const wg = ctx.createRadialGradient(a.x, a.y, Math.max(0, rr - 120), a.x, a.y, rr);
        wg.addColorStop(0, "rgba(124,255,107,0)");
        wg.addColorStop(0.7, `rgba(124,255,107,${0.12 * (1 - t)})`);
        wg.addColorStop(1, "rgba(124,255,107,0)");
        ctx.fillStyle = wg;
        ctx.fillRect(0, 0, w, h);
      }

      // 8. troebel bij dump, schemerig bij droogte
      const murk = dump * 0.22 + d * 0.28;
      if (murk > 0.01) {
        ctx.fillStyle = `rgba(1,6,4,${murk})`;
        ctx.fillRect(0, 0, w, h);
      }

      // 9. vignet: randen donker, zodat tekst leesbaar blijft
      const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.max(w, h) * 0.8);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    _drawBed() {
      const { ctx, w, h } = this;
      const base = h - Math.min(70, h * 0.08);

      // zeewier (achter het zand)
      for (const wd of this.weeds) {
        const sway = this.reduced ? 0.2 : Math.sin(this.t * wd.sp + wd.ph) * (0.25 + 0.15 * (1 - this.drought));
        ctx.beginPath();
        ctx.moveTo(wd.x - wd.wd, base + 20);
        const tipX = wd.x + sway * wd.h;
        const tipY = base - wd.h;
        ctx.quadraticCurveTo(wd.x - wd.wd + sway * wd.h * 0.3, base - wd.h * 0.5, tipX, tipY);
        ctx.quadraticCurveTo(wd.x + wd.wd + sway * wd.h * 0.3, base - wd.h * 0.5, wd.x + wd.wd, base + 20);
        ctx.closePath();
        ctx.fillStyle = "rgba(14,52,30,0.85)";
        ctx.fill();
      }

      // zandheuvels
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, base);
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * w;
        const y = base + Math.sin(i * 1.9) * 10;
        const cx = ((i - 0.5) / n) * w;
        ctx.quadraticCurveTo(cx, y - 14, x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      const sg = ctx.createLinearGradient(0, base - 20, 0, h);
      sg.addColorStop(0, "rgb(12,34,24)");
      sg.addColorStop(1, "rgb(4,12,8)");
      ctx.fillStyle = sg;
      ctx.fill();
    }
  }

  window.Sea = Sea;
})();
