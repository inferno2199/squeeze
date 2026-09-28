// Squeeze renderer — tekent de octopus op een canvas.
// Armen buigen via 3 "botten" per arm (rubber), gezichten blenden soepel.
(function () {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutBack = (t) => {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };

  const ASSETS = {
    body: "assets/body.png",
    arm: "assets/arm.png",
    eyes_happy: "assets/eyes_happy.png",
    eyes_neutral: "assets/eyes_neutral.png",
    eyes_sad: "assets/eyes_sad.png",
    mouth_happy: "assets/mouth_happy.png",
    mouth_neutral: "assets/mouth_neutral.png",
    mouth_sad: "assets/mouth_sad.png",
  };

  // Wereld = pixels van body.png, oorsprong midden-onder van het hoofd.
  const BODY_W = 497;
  const BODY_H = 652;
  const OY = 380; // wereld-y 0 ligt op y=380 in body.png
  const SCENE = 1440; // zichtbare breedte in wereld-eenheden

  // Linkerarmen (rechts = gespiegeld). a = richting (0 omlaag, π/2 links).
  const ARMS = [
    { x: -170, y: 150, a: 1.95, len: 0.56, ph: 0.0 },
    { x: -140, y: 200, a: 1.38, len: 0.6, ph: 1.4 },
    { x: -85, y: 225, a: 0.92, len: 0.58, ph: 2.6 },
    { x: -30, y: 235, a: 0.48, len: 0.54, ph: 3.9 },
  ];

  // Houding per humeur: extra hoek + buiging per bot.
  const POSE = {
    happy: { a: 0.3, b: [0.28, 0.5, 0.95] },
    neutral: { a: 0.0, b: [0.14, 0.26, 0.6] },
    sad: { a: -0.3, b: [-0.08, -0.02, 0.32] },
  };

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Kon " + src + " niet laden"));
      img.src = src;
    });
  }

  class Spring {
    constructor(v, k = 120, d = 14) {
      this.v = v;
      this.vel = 0;
      this.target = v;
      this.k = k;
      this.d = d;
    }
    step(dt) {
      this.vel += ((this.target - this.v) * this.k - this.vel * this.d) * dt;
      this.v += this.vel * dt;
      return this.v;
    }
  }

  class Squeeze {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.reduced = !!opts.reducedMotion;
      this.onRing = opts.onRing || (() => {});
      this.img = {};
      this.t = 0;
      this.mood = new Spring(0.5, 18, 8);
      this.frenzy = new Spring(0, 10, 6);
      this.sx = new Spring(1, 170, 11);
      this.sy = new Spring(1, 170, 11);
      this.look = { x: 0, y: 0, tx: 0, ty: 0 };
      this.taps = [];
      this.flinch = 0;
      this.annoyed = 0;
      this.turnDir = 1;
      this.turn = new Spring(0, 60, 10);
      this._sc = 1;
      this.rings = 0;
      this.ringBorn = -10;
      this.charge = 0;
      this.athPhase = null;
      this.athQueue = 0;
      this.pop = 0;
      this.shock = null;
      this.inkParts = [];
      this.sparks = [];
      this.blink = 0;
      this.nextBlink = 1.5 + Math.random() * 3;
      this._last = 0;
      this._raf = 0;
    }

    async load() {
      const entries = await Promise.all(
        Object.entries(ASSETS).map(async ([k, src]) => [k, await loadImage(src)])
      );
      for (const [k, img] of entries) this.img[k] = img;
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    // ---- publieke API ----
    setPrice(p) {
      this.mood.target = clamp((clamp(p, -1, 1) + 1) / 2, 0, 1);
    }
    setMood(m) {
      this.mood.target = clamp(m, 0, 1);
    }
    setCombo(n) {
      this.frenzy.target = clamp(n / 6, 0, 1);
    }
    setRings(n) {
      this.rings = Math.max(0, n | 0);
    }
    ath() {
      if (this.athPhase) {
        this.athQueue++;
        return;
      }
      this.athPhase = { t: 0, dur: this.reduced ? 0.35 : 1.0 };
    }
    inkBurst() {
      if (this.reduced) return;
      for (let i = 0; i < 34; i++) {
        const ang = Math.PI * (0.15 + 0.7 * Math.random());
        const sp = 90 + Math.random() * 260;
        this.inkParts.push({
          x: (Math.random() - 0.5) * 120,
          y: 230 + Math.random() * 50,
          vx: Math.cos(ang) * sp * (Math.random() < 0.5 ? -1 : 1),
          vy: Math.sin(ang) * sp * 0.8 + 40,
          r: 30 + Math.random() * 40,
          life: 0,
          max: 1.4 + Math.random() * 0.9,
        });
      }
      this.sy.vel -= 1.2;
      this.sx.vel += 0.8;
    }
    // Aantikken: inknijpen en terugveren. 5 snelle tikken = geirriteerd, draait weg.
    poke() {
      if (this.annoyed > 0) return "ignored";
      const now = this.t;
      this.taps = this.taps.filter((t) => now - t < 2.5);
      this.taps.push(now);
      const k = this.reduced ? 0.4 : 1;
      this.sx.vel -= 2.8 * k;
      this.sy.vel += 2.0 * k;
      this.flinch = 1;
      if (this.taps.length >= 5) {
        this.taps = [];
        this.annoyed = 2.6;
        this.turnDir = Math.random() < 0.5 ? -1 : 1;
        return "annoyed";
      }
      return "poke";
    }
    hitTest(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const x = (clientX - r.left - this.w / 2) / this._sc;
      const y = (clientY - r.top - this.h * 0.47) / this._sc;
      return (x / 270) ** 2 + ((y + 70) / 340) ** 2 <= 1;
    }
    lookAt(nx, ny) {
      this.look.tx = clamp(nx, -1, 1);
      this.look.ty = clamp(ny, -1, 1);
    }

    start() {
      if (this._raf) return;
      this._last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this.update(dt);
        this.draw();
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.canvas.getBoundingClientRect();
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.dpr = dpr;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
    }

    // ---- simulatie ----
    update(dt) {
      this.t += dt;
      this.mood.step(dt);
      this.frenzy.step(dt);
      this.flinch *= Math.exp(-dt * 5);
      this.annoyed = Math.max(0, this.annoyed - dt);
      this.turn.target = this.annoyed > 0 ? this.turnDir : 0;
      this.turn.step(dt);
      this.look.x = lerp(this.look.x, this.look.tx, 1 - Math.exp(-dt * 4));
      this.look.y = lerp(this.look.y, this.look.ty, 1 - Math.exp(-dt * 4));

      // ATH: 1 sec samenknijpen, dan knal + ring
      if (this.athPhase) {
        const ph = this.athPhase;
        ph.t += dt;
        this.charge = sstep(0, 1, ph.t / ph.dur);
        if (ph.t >= ph.dur) {
          this.athPhase = null;
          this.charge = 0;
          this.pop = 1;
          this.rings++;
          this.ringBorn = this.t;
          this.shock = { t: 0 };
          this.sx.vel += 5;
          this.sy.vel -= 4;
          if (!this.reduced) this._sparkBurst();
          this.onRing(this.rings);
          if (this.athQueue > 0) {
            this.athQueue--;
            setTimeout(() => this.ath(), 450);
          }
        }
      }
      this.pop *= Math.exp(-dt * 3.2);

      const m = this.mood.v;
      const breathe = this.reduced ? 0 : Math.sin(this.t * 1.7) * 0.012;
      this.sx.target = 1 - 0.13 * this.charge - breathe * 0.5;
      this.sy.target = 1 + 0.07 * this.charge + breathe - (1 - m) * 0.02;
      this.sx.step(dt);
      this.sy.step(dt);

      // knipperen
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blink = 1;
        this.nextBlink = 2.2 + Math.random() * 3.5;
      }
      this.blink = Math.max(0, this.blink - dt * 7);

      if (this.shock) {
        this.shock.t += dt;
        if (this.shock.t > 1.1) this.shock = null;
      }
      for (const p of this.inkParts) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-dt * 1.8);
        p.vy *= Math.exp(-dt * 1.8);
        p.r += dt * 55;
      }
      this.inkParts = this.inkParts.filter((p) => p.life < p.max);
      for (const s of this.sparks) {
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 260 * dt;
        s.vx *= Math.exp(-dt * 1.5);
      }
      this.sparks = this.sparks.filter((s) => s.life < s.max);
    }

    _sparkBurst() {
      for (let i = 0; i < 34; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 260 + Math.random() * 420;
        this.sparks.push({
          x: Math.cos(ang) * 120,
          y: -140 + Math.sin(ang) * 120,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          r: 5 + Math.random() * 7,
          life: 0,
          max: 0.7 + Math.random() * 0.6,
          white: Math.random() < 0.3,
        });
      }
    }

    _pose() {
      const m = this.mood.v;
      let a, b;
      if (m >= 0.5) {
        const k = (m - 0.5) * 2;
        a = lerp(POSE.neutral.a, POSE.happy.a, k);
        b = POSE.neutral.b.map((v, i) => lerp(v, POSE.happy.b[i], k));
      } else {
        const k = m * 2;
        a = lerp(POSE.sad.a, POSE.neutral.a, k);
        b = POSE.sad.b.map((v, i) => lerp(v, POSE.neutral.b[i], k));
      }
      return { a, b, m };
    }

    // ---- tekenen ----
    draw() {
      const { ctx, dpr, w, h } = this;
      if (!this.img.body) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const sc = Math.min(w, h * 1.02) / SCENE;
      this._sc = sc;
      ctx.save();
      ctx.translate(w / 2, h * 0.47);
      ctx.scale(sc, sc);

      this._drawRings();
      this._drawInk();

      const bob = this.reduced ? 0 : Math.sin(this.t * 1.25) * 10;
      ctx.save();
      ctx.translate(0, bob);
      ctx.rotate(this.turn.v * 0.09);
      // squash & stretch rond de voet van het lijf
      ctx.translate(0, 240);
      ctx.scale(this.sx.v * (1 - 0.08 * Math.abs(this.turn.v)), this.sy.v);
      ctx.translate(0, -240);

      const pose = this._pose();
      for (let i = 0; i < ARMS.length; i++) {
        this._drawArm(ARMS[i], 1, pose, i);
        this._drawArm(ARMS[i], -1, pose, i);
      }
      ctx.drawImage(this.img.body, -BODY_W / 2, -OY, BODY_W, BODY_H);
      this._drawFace(pose.m, Math.abs(this.turn.v));
      ctx.restore();

      this._drawSparks();
      ctx.restore();
    }

    _drawArm(def, side, pose, idx) {
      const { ctx } = this;
      const img = this.img.arm;
      const f = this.frenzy.v;
      const amp = (this.reduced ? 0.3 : 1) * (lerp(0.1, 0.2, pose.m) + f * 0.26);
      const speed = lerp(1.1, 1.8, pose.m) + f * 2.6;
      const ph = def.ph + (side < 0 ? 0.8 : 0);

      const L = img.height * def.len;
      const W = img.width * def.len;
      const A =
        def.a + pose.a + this.charge * 0.45 - this.pop * 0.35 + this.flinch * 0.3 +
        amp * 0.35 * Math.sin(this.t * speed * 0.6 + ph);
      const b = [0, 1, 2].map(
        (i) =>
          pose.b[i] + this.charge * 0.8 - this.pop * 0.6 +
          this.flinch * 0.7 + Math.abs(this.turn.v) * 0.35 +
          amp * Math.sin(this.t * speed + ph - i * 0.95)
      );

      ctx.save();
      ctx.scale(side, 1);
      ctx.translate(def.x, def.y);

      const N = 34;
      const ds = L / N;
      const srcH = img.height / N;
      let x = 0;
      let y = 0;
      for (let j = 0; j < N; j++) {
        const s = (j + 0.5) * ds;
        let th = A;
        for (let i = 0; i < 3; i++) th += b[i] * sstep((i * L) / 3, ((i + 1) * L) / 3, s);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(th);
        ctx.drawImage(img, 0, j * srcH, img.width, srcH + 2, -W / 2, 0, W, ds + 2 * def.len + 1);
        ctx.restore();
        x += -Math.sin(th) * ds;
        y += Math.cos(th) * ds;
      }
      ctx.restore();
    }

    _drawFace(m, annoy = 0) {
      const { ctx, img } = this;
      const me = lerp(m, 0.18, annoy);
      const wh = sstep(0.56, 0.84, me);
      const ws = sstep(0.44, 0.16, me);
      const wn = Math.max(0, 1 - wh - ws);
      const lx = lerp(this.look.x * 10, this.turn.v * 60, annoy);
      const ly = lerp(this.look.y * 7, -4, annoy);

      // ogen (onderkant op één lijn), knipperen = in hoogte knijpen
      const eyeW = 300;
      const eyeBottom = -95 + ly;
      const blinkK = 1 - 0.88 * Math.sin(Math.min(1, this.blink) * Math.PI);
      const eyes = [
        [img.eyes_neutral, wn],
        [img.eyes_sad, ws],
        [img.eyes_happy, wh],
      ];
      for (const [im, a] of eyes) {
        if (a < 0.01) continue;
        const ew = eyeW * (im === img.eyes_happy ? 0.93 : 1);
        const eh = (im.height / im.width) * ew;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(lx, eyeBottom - eh * 0.36);
        ctx.scale(1, blinkK);
        ctx.drawImage(im, -ew / 2, -eh * 0.64, ew, eh);
        ctx.restore();
      }

      // mond
      const talk = this.frenzy.v * (0.5 + 0.5 * Math.sin(this.t * 14)) * 0.12;
      const mh0 = sstep(0.56, 0.84, m) * (1 - annoy);
      const ms0 = sstep(0.44, 0.16, m) * (1 - annoy);
      const mouths = [
        [img.mouth_neutral, Math.max(0, 1 - mh0 - ms0), 128 - annoy * 22],
        [img.mouth_sad, ms0, 138],
        [img.mouth_happy, mh0, 132],
      ];
      for (const [im, a, mw] of mouths) {
        if (a < 0.01) continue;
        const mh = (im.height / im.width) * mw;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(lx * 0.7, -55 + ly * 0.7);
        ctx.scale(1 + talk * 0.3, 1 + talk);
        ctx.drawImage(im, -mw / 2, -mh / 2, mw, mh);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    _ringRadius(k) {
      return 330 + 300 * (1 - Math.exp(-k / 6));
    }

    _drawRings() {
      const { ctx } = this;
      const n = this.rings;
      const cy = -40;
      const since = this.t - this.ringBorn;
      for (let k = 0; k < n; k++) {
        let r = this._ringRadius(k);
        const newest = k === n - 1;
        let alpha = lerp(0.35, 0.8, n > 1 ? k / (n - 1) : 1);
        let lw = 7;
        if (newest && since < 1.2) {
          const e = easeOutBack(clamp(since / 0.8, 0, 1));
          r = lerp(160, r, e);
          alpha = 1;
          lw = lerp(16, 7, clamp(since / 1.2, 0, 1));
        }
        const pulse = this.reduced ? 0 : Math.sin(this.t * 1.6 - k * 0.5) * 3;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, cy, r + pulse, 0, Math.PI * 2);
        ctx.lineWidth = lw;
        ctx.strokeStyle = `rgba(124,255,107,${alpha})`;
        if (newest) {
          ctx.shadowColor = "rgba(124,255,107,0.7)";
          ctx.shadowBlur = 28 * (this.w / SCENE);
        }
        ctx.stroke();
        ctx.restore();
      }
      if (this.shock) {
        const t = this.shock.t / 1.1;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, cy, lerp(180, 760, t), 0, Math.PI * 2);
        ctx.lineWidth = lerp(40, 2, t);
        ctx.strokeStyle = `rgba(214,255,208,${(1 - t) * 0.55})`;
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawInk() {
      const { ctx } = this;
      for (const p of this.inkParts) {
        const a = (1 - p.life / p.max) * 0.7;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(80,230,70,${a})`);
        g.addColorStop(0.6, `rgba(30,140,40,${a * 0.6})`);
        g.addColorStop(1, "rgba(10,60,20,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _drawSparks() {
      const { ctx } = this;
      for (const s of this.sparks) {
        const a = 1 - s.life / s.max;
        ctx.fillStyle = s.white ? `rgba(245,255,243,${a})` : `rgba(124,255,107,${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.5 + a * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  window.Squeeze = Squeeze;
})();
