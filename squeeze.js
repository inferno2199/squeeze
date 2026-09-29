// Squeeze renderer — tekent de octopus op een canvas.
// Armen buigen via 3 "botten" per arm (rubber), gezichten blenden soepel.
// Regel: rustig als er niks gebeurt, overdreven als er wél iets gebeurt.
(function () {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

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
  const OY = 380;
  const SCENE = 1440;

  // Kleuren (alleen Pump-groen en wit)
  const GREEN = "124,255,107";
  const GREEN_DARK = "#2c9a27";
  const GREEN_MID = "#7cff6b";

  // Linkerarmen (rechts = gespiegeld). a = richting (0 omlaag, π/2 links).
  const ARMS = [
    { x: -170, y: 150, a: 1.95, len: 0.56, ph: 0.0 },
    { x: -140, y: 200, a: 1.38, len: 0.6, ph: 1.4 },
    { x: -85, y: 225, a: 0.92, len: 0.58, ph: 2.6 },
    { x: -30, y: 235, a: 0.48, len: 0.54, ph: 3.9 },
  ];

  const POSE = {
    happy: { a: 0.3, b: [0.28, 0.5, 0.95] },
    neutral: { a: 0.0, b: [0.14, 0.26, 0.6] },
    sad: { a: -0.42, b: [-0.1, -0.06, 0.3] },
    sleep: { a: -0.62, b: [-0.16, -0.08, 0.12] },
    wild: { a: 0.62, b: [0.45, 0.7, 1.1] },
  };

  // Speelring: klein, hij speelt ermee met zijn tentakels
  const TOY = { r: 72, lw: 15 };
  const UPPER = [0, 1, 2, 3]; // bovenste armen (even = links, oneven = rechts)
  const RING_CY = -40;
  const FLY_T = 0.75;

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
      this.onEvent = opts.onEvent || (() => {});
      this.img = {};
      this.t = 0;

      this.mood = new Spring(0.5, 18, 8);
      this.frenzy = new Spring(0, 10, 6);
      this.sx = new Spring(1, 170, 11);
      this.sy = new Spring(1, 170, 11);
      this.turn = new Spring(0, 60, 10);
      this.euph = new Spring(0, 30, 9);
      this.drowsy = new Spring(0, 3, 3.5);
      this.toyScale = new Spring(1, 140, 9);
      this.friends = null;   // zie friends.js
      this.focus = null;     // punt waar hij naar kijkt (een vriendje)
      this.scare = new Spring(0, 20, 8);
      this.tips = new Array(8).fill(null).map(() => ({ x: 0, y: 0, th: 0 }));
      this.hold = new Array(8).fill(0);
      this.toy = {
        holder: 0,
        x: -300, y: -120,
        spin: 0,
        toss: null,        // { t, T, x0, y0, to, h }
        tossTimer: 3,
        drop: 0,
        hang: 0,
        swing: 0,
      };

      this.look = { x: 0, y: 0, tx: 0, ty: 0 };
      this.rings = 0;
      this.ringBorn = -10;

      this.charge = 0;
      this.athPhase = null;
      this.athQueue = 0;
      this.pop = 0;
      this.fly = null;
      this.shock = null;

      this.euphLeft = 0;
      this.drought = false;
      this.wakeT = 0;
      this.armPulse = new Array(8).fill(0);

      this.taps = [];
      this.flinch = 0;
      this.annoyed = 0;
      this.turnDir = 1;

      this.inkParts = [];
      this.fx = [];          // high-five flitsen en tikken op het glas
      this.idle = 0;         // seconden zonder dat de bezoeker iets doet
      this.glass = null;     // { t, k } tijdens het tikken op het glas
      this.shake = 0;
      this.sparks = [];
      this.zParts = [];
      this.zTimer = 0;
      this.blink = 0;
      this.nextBlink = 1.5 + Math.random() * 3;
      this._sc = 1;
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

    // ---------- publieke API ----------
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

    // Nieuwe ATH: plat drukken, ogen dicht, ring klemmen, knal, ring vliegt naar zijn plek
    ath() {
      if (this.athPhase) {
        this.athQueue++;
        return;
      }
      this.athPhase = { t: 0, dur: this.reduced ? 0.4 : 1.0 };
    }

    // Korte euforie (na nieuwe ring of combo x10)
    euphoria(sec = 3.5) {
      if (this.reduced) sec = Math.min(sec, 1.5);
      this.euphLeft = Math.max(this.euphLeft, sec);
    }

    // Droogte: 15 min geen buy
    setDrought(on) {
      this.drought = !!on;
    }

    // Eerste buy na droogte: schrikken en wakker worden
    wake() {
      this.drought = false;
      this.drowsy.v = Math.min(this.drowsy.v, 0.5);
      this.drowsy.vel = -2;
      this.wakeT = 1.3;
      if (!this.reduced) this._toss(this._pickCatcher(), 300);
      this.sy.vel -= this.reduced ? 1.5 : 5;
      this.sx.vel += this.reduced ? 1 : 3;
      this.flinch = 1;
      this.euphoria(1.4);
    }

    // Nieuwe buys in deze meting: een arm knijpt even (0..1)
    buyPulse(strength = 0.5) {
      const s = clamp(strength, 0.2, 1);
      const n = s > 0.7 ? 3 : s > 0.4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const k = (Math.random() * 8) | 0;
        this.armPulse[k] = Math.max(this.armPulse[k], s);
      }
      this.sx.vel -= 0.8 * s;
      this.sy.vel += 0.6 * s;
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

    // Aantikken: inknijpen en terugveren. 5 snelle tikken = geïrriteerd, draait weg.
    poke() {
      if (this.annoyed > 0) return "ignored";
      const now = this.t;
      this.taps = this.taps.filter((t) => now - t < 2.5);
      this.taps.push(now);
      const k = this.reduced ? 0.4 : 1;
      this.sx.vel -= 2.8 * k;
      this.sy.vel += 2.0 * k;
      this.flinch = 1;
      if (this.drowsy.v > 0.5) {
        // Slapend aantikken: hij doet één oog open en slaapt verder
        this.wakeT = 0.5;
        return "poke";
      }
      if (this.taps.length >= 5) {
        this.taps = [];
        this.annoyed = 2.6;
        if (!this.toy.toss) this.toy.drop = 0.6;
        this.turnDir = Math.random() < 0.5 ? -1 : 1;
        return "annoyed";
      }
      return "poke";
    }

    // punt rechtsboven naast zijn hoofd, in pixels van het podium (voor ballonnetjes)
    headAnchor() {
      const sc = this._sc || 1;
      return { x: this.w / 2 + 120 * sc, y: this.h * 0.47 - 300 * sc };
    }

    // zichtbaar gebied in wereld-eenheden (voor de vriendjes)
    bounds() {
      const sc = this._sc || 1;
      return { hw: this.w / 2 / sc, top: (-this.h * 0.47) / sc, bot: (this.h * 0.53) / sc };
    }

    hitTest(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const x = (clientX - r.left - this.w / 2) / this._sc;
      const y = (clientY - r.top - this.h * 0.47) / this._sc;
      return (x / 270) ** 2 + ((y + 70) / 340) ** 2 <= 1;
    }

    // De bezoeker doet iets (muis, tik, scroll, toets)
    activity() {
      this.idle = 0;
    }

    // Tik op een tentakelpuntje: high five!
    highFiveAt(clientX, clientY) {
      if (this.reduced && !this.img.body) return false;
      const r = this.canvas.getBoundingClientRect();
      const x = (clientX - r.left - this.w / 2) / this._sc;
      const y = (clientY - r.top - this.h * 0.47) / this._sc;
      let best = -1;
      let bestD = 95;
      for (let k = 0; k < 8; k++) {
        const t = this.tips[k];
        const d = Math.hypot(x - t.x, y - t.y);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      if (best < 0) return false;
      const tip = this.tips[best];
      this.armPulse[best] = 1;
      this.hold[best] = 1;
      this.fx.push({ type: "five", x: tip.x, y: tip.y, t: 0 });
      this.euphoria(0.9);
      this.sy.vel -= 1.5;
      this.idle = 0;
      return true;
    }

    lookAt(nx, ny) {
      if (this.toy && this.toy.toss) return;
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

    // ---------- simulatie ----------
    update(dt) {
      this.t += dt;
      this.mood.step(dt);
      this.frenzy.step(dt);

      // euforie / droogte
      this.euphLeft = Math.max(0, this.euphLeft - dt);
      this.euph.target = this.euphLeft > 0 ? 1 : 0;
      this.euph.step(dt);
      this.drowsy.target = this.drought && this.euphLeft <= 0 ? 1 : 0;
      this.drowsy.step(dt);
      this.drowsy.v = clamp(this.drowsy.v, 0, 1);
      this.wakeT = Math.max(0, this.wakeT - dt);

      // aantikken
      this._updateGlass(dt);
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter((f) => f.t < 0.9);
      this.shake *= Math.exp(-dt * 18);
      this.flinch *= Math.exp(-dt * 5);
      this.annoyed = Math.max(0, this.annoyed - dt);
      this.turn.target = this.annoyed > 0 ? this.turnDir : 0;
      this.turn.step(dt);
      for (let i = 0; i < 8; i++) this.armPulse[i] *= Math.exp(-dt * 3.5);

      this._updateToy(dt);
      if (this.glass) this.hold[this.glass.k] = 1;
      this.scare.step(dt);
      if (this.friends) this.friends.update(dt);
      if (this.focus && !(this.toy && this.toy.toss)) {
        this.look.tx = clamp(this.focus.x / 450, -1, 1);
        this.look.ty = clamp((this.focus.y + 150) / 400, -1, 1);
      }
      this.look.x = lerp(this.look.x, this.look.tx, 1 - Math.exp(-dt * 4));
      this.look.y = lerp(this.look.y, this.look.ty, 1 - Math.exp(-dt * 4));

      // ATH-moment
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
          this.fly = { t: 0, x: this.toy.x, y: this.toy.y };
          this.shock = { t: 0 };
          this.toy.toss = null;
          this.toyScale.v = 0;
          this.toyScale.vel = 0;
          this.toy.tossTimer = 2.2;
          this.sx.vel -= 4;
          this.sy.vel += 5;
          if (!this.reduced) this._sparkBurst();
          this.euphoria(3.5);
          this.onRing(this.rings);
          if (this.athQueue > 0) {
            this.athQueue--;
            setTimeout(() => this.ath(), 600);
          }
        }
      }
      this.pop *= Math.exp(-dt * 3.2);
      if (this.fly) {
        this.fly.t += dt;
        if (this.fly.t > FLY_T) this.fly = null;
      }
      this.toyScale.step(dt);

      // lijf: plat bij het knijpen, trillen, ademen
      const d = this.drowsy.v;
      const breatheSpeed = lerp(1.7, 0.8, d);
      const breatheAmp = this.reduced ? 0 : lerp(0.012, 0.022, d);
      const breathe = Math.sin(this.t * breatheSpeed) * breatheAmp;
      const trem = this.reduced ? 0 : Math.sin(this.t * 70) * 0.012 * this.charge;
      const m = this.mood.v;
      this.sx.target = 1 + 0.12 * this.charge - breathe * 0.5 + trem + 0.03 * d;
      this.sy.target = 1 - 0.15 * this.charge + breathe - (1 - m) * 0.02 - 0.04 * d - trem - 0.05 * this.scare.v;
      this.sx.step(dt);
      this.sy.step(dt);

      // knipperen (niet tijdens slapen of euforie)
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        if (d < 0.3 && this.euph.v < 0.3) this.blink = 1;
        this.nextBlink = 2.2 + Math.random() * 3.5;
      }
      this.blink = Math.max(0, this.blink - dt * 7);

      if (this.shock) {
        this.shock.t += dt;
        if (this.shock.t > 1.1) this.shock = null;
      }

      // Zzz tijdens droogte
      if (d > 0.6 && !this.reduced) {
        this.zTimer -= dt;
        if (this.zTimer <= 0) {
          this.zTimer = 1.3;
          this.zParts.push({ x: 175, y: -250, life: 0, max: 3, s: 52 + Math.random() * 14 });
        }
      }
      for (const z of this.zParts) {
        z.life += dt;
        z.x += dt * 26;
        z.y -= dt * 52;
      }
      this.zParts = this.zParts.filter((z) => z.life < z.max);

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

    // effectief humeur: euforie trekt naar blij, slaap naar lusteloos
    _moodEff() {
      let m = this.mood.v;
      m = lerp(m, 1, this.euph.v);
      m = lerp(m, 0.34, this.drowsy.v);
      return clamp(m, 0, 1);
    }

    _pose() {
      const m = this._moodEff();
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
      const e = this.euph.v;
      const d = this.drowsy.v;
      a = lerp(lerp(a, POSE.wild.a, e), POSE.sleep.a, d);
      b = b.map((v, i) => lerp(lerp(v, POSE.wild.b[i], e), POSE.sleep.b[i], d));
      // bang (haai): armen dicht tegen zich aan
      const fear = this.scare.v;
      a += fear * 0.35;
      b = b.map((v) => v + fear * 0.7);
      return { a, b, m };
    }

    // ---------- tekenen ----------
    draw() {
      const { ctx, dpr, w, h } = this;
      if (!this.img.body) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const sc = Math.min(w, h * 1.02) / SCENE;
      this._sc = sc;
      ctx.save();
      ctx.translate(w / 2, h * 0.47);
      if (this.shake > 0.01 && !this.reduced) {
        ctx.translate((Math.random() - 0.5) * 6 * this.shake, (Math.random() - 0.5) * 6 * this.shake);
      }
      ctx.scale(sc, sc);

      this._drawRings();
      this._drawInk();
      if (this.friends) this.friends.draw(ctx, "back");

      const d = this.drowsy.v;
      const e = this.euph.v;
      let bob = 0;
      if (!this.reduced) {
        bob = Math.sin(this.t * lerp(1.25, 0.7, d)) * lerp(10, 5, d) + d * 14;
        bob -= Math.abs(Math.sin(this.t * 7)) * 16 * e; // hupjes van blijdschap
      }

      ctx.save();
      ctx.translate(0, bob);
      ctx.rotate(this.turn.v * 0.09 + (this.reduced ? 0 : Math.sin(this.t * 9) * 0.035 * e));
      ctx.translate(0, 240);
      ctx.scale(this.sx.v * (1 - 0.08 * Math.abs(this.turn.v)), this.sy.v);
      ctx.translate(0, -240);

      const pose = this._pose();
      for (let i = 0; i < ARMS.length; i++) {
        this._drawArm(ARMS[i], 1, pose, i * 2);
        this._drawArm(ARMS[i], -1, pose, i * 2 + 1);
      }
      ctx.drawImage(this.img.body, -BODY_W / 2, -OY, BODY_W, BODY_H);
      this._drawFace(pose.m, Math.abs(this.turn.v));
      this._drawToy();
      this._drawFx();
      ctx.restore();

      this._drawFly();
      this._drawZ(bob);
      if (this.friends) this.friends.draw(ctx, "front");
      this._drawSparks();
      ctx.restore();
    }

    _drawArm(def, side, pose, k) {
      const { ctx } = this;
      const img = this.img.arm;
      const f = this.frenzy.v;
      const e = this.euph.v;
      const d = this.drowsy.v;
      const amp =
        (this.reduced ? 0.3 : 1) *
        (lerp(0.1, 0.2, pose.m) + f * 0.26 + e * 0.35) *
        (1 - 0.7 * d);
      const speed = (lerp(1.1, 1.8, pose.m) + f * 2.6 + e * 4) * (1 - 0.6 * d);
      const ph = def.ph + (side < 0 ? 0.8 : 0);
      const pulse = this.armPulse[k];
      const hold = this.hold[k];

      const L = img.height * def.len;
      const W = img.width * def.len;
      const A =
        def.a + pose.a + this.charge * 0.55 - this.pop * 0.35 + this.flinch * 0.3 + pulse * 0.25 +
        hold * (0.32 + (this.reduced ? 0 : Math.sin(this.t * 3 + k) * 0.07)) +
        amp * 0.35 * Math.sin(this.t * speed * 0.6 + ph);
      const b = [0, 1, 2].map(
        (i) =>
          pose.b[i] + this.charge * 0.95 - this.pop * 0.6 +
          this.flinch * 0.7 + Math.abs(this.turn.v) * 0.35 + pulse * 0.9 -
          hold * (i === 2 ? 0.45 : 0.1) +
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
      const grip = Math.floor(N * 0.8);
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
        if (j === grip) {
          // grijppunt in lichaamscoördinaten (voor de speelring)
          const tip = this.tips[k];
          tip.x = side * (def.x + x);
          tip.y = def.y + y;
          tip.th = side > 0 ? th : -th;
        }
      }
      ctx.restore();
    }

    // ---------- tikken op het glas ----------
    // Doet de bezoeker ~25 sec niks, dan tikt Squeeze met een tentakel tegen je scherm.
    _updateGlass(dt) {
      this.idle += dt;
      const busy =
        this.athPhase || this.drowsy.v > 0.3 || this.annoyed > 0 || (this.toy && (this.toy.toss || this.toy.stolen));
      if (!this.glass && this.idle > 25 && !busy && !this.reduced) {
        const h = this.toy ? this.toy.holder : 0;
        const k = h % 2 === 0 ? 1 : 0; // bovenste arm aan de andere kant
        this.glass = { t: 0, k, taps: [0.9, 1.25, 1.6], done: 0 };
        this.onEvent("glass");
      }
      if (!this.glass) return;
      const g = this.glass;
      g.t += dt;
      // hij kijkt je recht aan
      this.look.tx = 0;
      this.look.ty = 0.15;
      if (g.done < g.taps.length && g.t >= g.taps[g.done]) {
        const tip = this.tips[g.k];
        this.armPulse[g.k] = 0.7;
        this.fx.push({ type: "glass", k: g.k, x: tip.x, y: tip.y, t: 0 });
        this.shake = 1;
        g.done++;
      }
      if (g.t > 2.6) {
        this.glass = null;
        this.idle = -20; // volgende keer pas na ~45 sec
      }
    }

    _drawFx() {
      const { ctx } = this;
      for (const f of this.fx) {
        if (f.type === "five") {
          // high five: groen-witte flits met straaltjes
          const k = f.t / 0.9;
          const a = 1 - k;
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.strokeStyle = `rgba(${GREEN},${a})`;
          ctx.lineWidth = 7;
          ctx.lineCap = "round";
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const r0 = 40 + k * 60;
            const r1 = r0 + 34 * (1 - k);
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
            ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(0, 0, 26 + k * 40, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(245,255,243,${0.55 * a})`;
          ctx.fill();
          ctx.restore();
        } else if (f.type === "glass") {
          // tik op het glas: kringen alsof hij tegen je scherm tikt
          const k = f.t / 0.9;
          const tp = this.tips[f.k];
          ctx.save();
          ctx.translate(tp.x, tp.y);
          for (let i = 0; i < 2; i++) {
            const kk = clamp(k - i * 0.15, 0, 1);
            if (kk <= 0) continue;
            ctx.beginPath();
            ctx.arc(0, 0, 24 + kk * 150, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(240,255,240,${0.9 * (1 - kk)})`;
            ctx.lineWidth = 7;
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(0, 0, 26, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(240,255,240,${0.55 * (1 - k)})`;
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // ---------- speelring ----------
    _pickCatcher() {
      const h = this.toy.holder;
      const other = UPPER.filter((k) => k !== h && (k % 2) !== (h % 2));
      const pool = other.length ? other : UPPER.filter((k) => k !== h);
      return pool[(Math.random() * pool.length) | 0];
    }

    _toss(to, height) {
      const t = this.toy;
      t.toss = { t: 0, T: 0.5 + height / 700, x0: t.x, y0: t.y, to, h: height };
    }

    _updateToy(dt) {
      const t = this.toy;
      if (t.stolen) return; // de krab heeft hem
      const m = this._moodEff();
      const f = this.frenzy.v;
      const d = this.drowsy.v;
      t.spin += dt * (t.toss ? 14 : lerp(2.2, 6, clamp(m + f, 0, 1)) * (1 - 0.8 * d));
      t.swing = Math.sin(this.t * 1.8) * 0.35;
      t.hang += (sstep(0.42, 0.24, m) * (1 - d) - t.hang) * (1 - Math.exp(-dt * 4));
      t.drop = Math.max(0, t.drop - dt);

      // wie houdt de ring vast (armen tillen hem een beetje op)
      for (let k = 0; k < 8; k++) {
        let target = 0;
        if (!t.toss && k === t.holder) target = (1 - t.hang) * (1 - d) * (1 - this.charge);
        if (t.toss && k === t.toss.to) target = 0.8;
        this.hold[k] += (target - this.hold[k]) * (1 - Math.exp(-dt * 6));
      }

      // gooien en vangen
      if (t.toss) {
        t.toss.t += dt;
        const u = clamp(t.toss.t / t.toss.T, 0, 1);
        const tip = this.tips[t.toss.to];
        t.x = lerp(t.toss.x0, tip.x, u);
        t.y = lerp(t.toss.y0, tip.y, u) - 4 * t.toss.h * u * (1 - u);
        // ogen volgen de ring
        this.look.tx = clamp(t.x / 320, -1, 1);
        this.look.ty = clamp((t.y + 150) / 320, -1, 1);
        if (u >= 1) {
          t.holder = t.toss.to;
          t.toss = null;
          this.armPulse[t.holder] = Math.max(this.armPulse[t.holder], 0.6);
        }
        return;
      }

      // volgende worp plannen (alleen als hij wakker, niet verdrietig en niet aan het knijpen is)
      t.tossTimer -= dt;
      if (t.tossTimer <= 0) {
        const canPlay = !this.reduced && !this.athPhase && !this.glass && d < 0.3 && t.hang < 0.4 && this.annoyed <= 0;
        if (canPlay) {
          const happy = m > 0.58 || f > 0.3;
          const height = happy ? lerp(170, 400, clamp(f + (m - 0.58) * 1.5, 0, 1)) : 70 + Math.random() * 50;
          this._toss(this._pickCatcher(), height);
          t.tossTimer = happy ? lerp(4.5, 1.2, f) + Math.random() : 6 + Math.random() * 4;
        } else {
          t.tossTimer = 1.5;
        }
        return;
      }

      // doelpositie: aan zijn tentakel, hangend, knuffelend of samengeknepen
      const tip = this.tips[t.holder];
      let tx = tip.x;
      let ty = tip.y;
      // hangend (verdrietig): ring bungelt onder het puntje
      tx = lerp(tx, tip.x + Math.sin(t.swing) * TOY.r * 0.9, t.hang);
      ty = lerp(ty, tip.y + Math.cos(t.swing) * TOY.r * 0.9, t.hang);
      // knuffelen (slaap): tegen zijn buik
      tx = lerp(tx, -40, d);
      ty = lerp(ty, 60, d);
      // squeeze-moment: vooraan, samengeknepen
      tx = lerp(tx, 0, this.charge);
      ty = lerp(ty, 40, this.charge);
      // laten vallen (geïrriteerd) en net op tijd vangen
      if (t.drop > 0) ty += Math.sin((1 - t.drop / 0.6) * Math.PI) * 170;
      const k = 1 - Math.exp(-dt * 14);
      t.x += (tx - t.x) * k;
      t.y += (ty - t.y) * k;
      if (this.charge <= 0) {
        this.look.tx = lerp(this.look.tx, clamp(t.x / 500, -1, 1), 0.02);
      }
    }

    _drawToy() {
      const { ctx } = this;
      const t = this.toy;
      if (t.stolen) return;
      const sc = clamp(this.toyScale.v, 0, 1.3);
      if (sc < 0.03) return;
      const c = this.charge;
      const d = this.drowsy.v;
      const tip = this.tips[t.holder];
      const r = TOY.r * sc;
      const trem = this.reduced ? 0 : Math.sin(this.t * 70) * 4 * c;

      // vorm: tollend om de arm, bungelend, knuffel, samengeknepen
      const twirlRy = r * Math.max(0.22, Math.abs(Math.cos(t.spin)));
      let rx = r;
      let ry = lerp(twirlRy, r * 0.9, Math.max(t.hang, d));
      let rot = t.toss ? t.spin * 0.5 : lerp(tip.th, t.swing * 0.4, t.hang);
      rot = lerp(rot, -0.3, d);
      rx = lerp(rx, r * 0.45, c);
      ry = lerp(ry, r * 1.15, c);
      rot = lerp(rot, 0, c);

      ctx.save();
      ctx.translate(t.x + trem, t.y);
      ctx.rotate(rot);
      ctx.lineCap = "round";
      const lw = TOY.lw * (1 + 0.3 * c) * clamp(sc, 0.4, 1.2);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = GREEN_DARK;
      ctx.lineWidth = lw * 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -1, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = GREEN_MID;
      ctx.lineWidth = lw * 0.8;
      if (c > 0.05 || this.euph.v > 0.1 || t.toss) {
        ctx.shadowColor = `rgba(${GREEN},0.85)`;
        ctx.shadowBlur = (14 + 30 * c) * this._sc * 2;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(0, -lw * 0.2, rx, ry, 0, Math.PI + 0.5, Math.PI * 2 - 0.5);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = lw * 0.2;
      ctx.stroke();
      ctx.restore();
    }

    // Na de knal: een ring vliegt van zijn middel naar zijn plek in de halo
    _drawFly() {
      if (!this.fly) return;
      const { ctx } = this;
      const t = easeOutCubic(clamp(this.fly.t / FLY_T, 0, 1));
      const target = this._ringRadius(this.rings - 1);
      const r = lerp(TOY.r, target, t);
      const cx = lerp(this.fly.x, 0, t);
      const cy = lerp(this.fly.y, RING_CY, t);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = lerp(18, 9, t);
      ctx.strokeStyle = `rgba(${GREEN},1)`;
      ctx.shadowColor = `rgba(${GREEN},0.8)`;
      ctx.shadowBlur = 30 * this._sc * 2;
      ctx.stroke();
      ctx.restore();
    }

    _drawFace(m, annoy = 0) {
      const { ctx, img } = this;
      const d = this.drowsy.v;
      const e = this.euph.v;
      const me = lerp(m, 0.18, annoy);
      const wh = sstep(0.56, 0.84, me);
      const ws = sstep(0.44, 0.16, me);
      const wn = Math.max(0, 1 - wh - ws);
      const lookK = 1 - d;
      const lx = lerp(this.look.x * 10 * lookK, this.turn.v * 60, annoy);
      const ly = lerp(this.look.y * 7 * lookK + d * 8, -4, annoy);

      // ogen: dichtknijpen bij ATH, half dicht bij slaap, groot bij wakker schrikken
      const eyeW = 300;
      const eyeBottom = -95 + ly;
      const blinkK = 1 - 0.88 * Math.sin(Math.min(1, this.blink) * Math.PI);
      const squint = 1 - 0.6 * this.charge;
      const sleepy = 1 - 0.5 * d * (this.wakeT > 0 ? 0.3 : 1);
      const surprise = 1 + 0.22 * clamp(this.wakeT / 1.3, 0, 1);
      const eyeK = blinkK * squint * sleepy * surprise;

      const eyes = [
        [img.eyes_neutral, wn],
        [img.eyes_sad, ws],
        [img.eyes_happy, wh],
      ];
      for (const [im, a] of eyes) {
        if (a < 0.01) continue;
        const ew = eyeW * (im === img.eyes_happy ? 0.93 : 1) * lerp(1, surprise, 0.6);
        const eh = (im.height / im.width) * ew;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(lx, eyeBottom - eh * 0.36);
        ctx.scale(1, eyeK);
        ctx.drawImage(im, -ew / 2, -eh * 0.64, ew, eh);
        ctx.restore();
      }

      // sterren-ogen bij euforie
      if (e > 0.05 && this.charge < 0.1) {
        const ew = eyeW * 0.93;
        const eh = (img.eyes_happy.height / img.eyes_happy.width) * ew;
        const py = eyeBottom - eh * 0.357;
        const spin = this.reduced ? 0 : Math.sin(this.t * 3) * 0.3;
        const pulse = 1 + (this.reduced ? 0 : Math.sin(this.t * 10) * 0.12);
        for (const px of [(0.284 - 0.5) * ew, (0.73 - 0.5) * ew]) {
          this._star(lx + px, py, 54 * e * pulse, spin, e);
        }
      }

      // mond
      const talk = (this.frenzy.v + this.euph.v) * (0.5 + 0.5 * Math.sin(this.t * 14)) * 0.12;
      const mh0 = sstep(0.56, 0.84, m) * (1 - annoy);
      const ms0 = sstep(0.44, 0.16, m) * (1 - annoy);
      const mouths = [
        [img.mouth_neutral, Math.max(0, 1 - mh0 - ms0), 128 - annoy * 22 - d * 20],
        [img.mouth_sad, ms0, 138],
        [img.mouth_happy, mh0, 132 + e * 14],
      ];
      for (const [im, a, mw] of mouths) {
        if (a < 0.01) continue;
        const mh = (im.height / im.width) * mw;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(lx * 0.7, -55 + ly * 0.7);
        ctx.scale(1 + talk * 0.3, (1 + talk) * (1 - 0.25 * this.charge));
        ctx.drawImage(im, -mw / 2, -mh / 2, mw, mh);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    _star(x, y, r, rot, alpha) {
      const { ctx } = this;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = clamp(alpha, 0, 1);
      // klassieke 5-puntige ster (geen kruisje: X-ogen betekenen "dood")
      const path = () => {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 === 0 ? r : r * 0.46;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
      };
      ctx.shadowColor = `rgba(${GREEN},0.95)`;
      ctx.shadowBlur = 22 * this._sc * 2;
      path();
      ctx.fillStyle = GREEN_MID;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.scale(0.62, 0.62);
      path();
      ctx.fillStyle = "#f8fff6";
      ctx.fill();
      ctx.restore();
    }

    _ringRadius(k) {
      return 330 + 300 * (1 - Math.exp(-k / 6));
    }

    _drawRings() {
      const { ctx } = this;
      const n = this.rings;
      const since = this.t - this.ringBorn;
      for (let k = 0; k < n; k++) {
        const newest = k === n - 1;
        if (newest && this.fly) continue; // die is nog onderweg
        const r = this._ringRadius(k);
        let alpha = lerp(0.35, 0.8, n > 1 ? k / (n - 1) : 1);
        let lw = 7;
        if (newest && since < FLY_T + 0.8) {
          const t = clamp((since - FLY_T) / 0.8, 0, 1);
          alpha = lerp(1, alpha, t);
          lw = lerp(11, 7, t);
        }
        const pulse = this.reduced ? 0 : Math.sin(this.t * 1.6 - k * 0.5) * 3;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, RING_CY, r + pulse, 0, Math.PI * 2);
        ctx.lineWidth = lw;
        ctx.strokeStyle = `rgba(${GREEN},${alpha})`;
        if (newest) {
          ctx.shadowColor = `rgba(${GREEN},0.7)`;
          ctx.shadowBlur = 28 * (this.w / SCENE);
        }
        ctx.stroke();
        ctx.restore();
      }
      if (this.shock) {
        const t = this.shock.t / 1.1;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, RING_CY, lerp(180, 760, t), 0, Math.PI * 2);
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

    _drawZ(bob) {
      const { ctx } = this;
      for (const z of this.zParts) {
        const t = z.life / z.max;
        const a = Math.sin(Math.min(1, t) * Math.PI) * 0.9;
        ctx.save();
        ctx.translate(z.x, z.y + bob);
        ctx.rotate(-0.15);
        ctx.font = `800 ${z.s * (0.8 + t * 0.6)}px "Bricolage Grotesque", system-ui, sans-serif`;
        ctx.fillStyle = `rgba(${GREEN},${a})`;
        ctx.fillText("z", 0, 0);
        ctx.restore();
      }
    }

    _drawSparks() {
      const { ctx } = this;
      for (const s of this.sparks) {
        const a = 1 - s.life / s.max;
        ctx.fillStyle = s.white ? `rgba(245,255,243,${a})` : `rgba(${GREEN},${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.5 + a * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  window.Squeeze = Squeeze;
})();
