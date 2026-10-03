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
    octo: "assets/octo.png", // v2: octopus uit één stuk, zonder gezicht
    armmap: "assets/octo_map.png", // welke pixel bij welke arm hoort
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
  // ---------- v2: octopus uit één stuk ----------
  // Maten in pixels van het originele plaatje (1431 x 1152).
  const IMG_W = 1431;
  const IMG_H = 1152;
  const OC = { x: 715, y: 600 };     // waar de tentakels samenkomen
  const S = 0.91;                     // wereld-eenheden per pixel
  const R0 = 235;                     // vanaf hier buigen de tentakels
  const PAD = 320;                    // ruimte rond het plaatje om uit te zwaaien
  const toWX = (px) => (px - 715) * S;
  const toWY = (py) => (py - 365) * S - 95; // ogen-onderkant op -95, net als v1
  // 8 tentakels: hoek (graden, 0 = rechts, 90 = omlaag), lengte en grijppunt
  // k = i*2 (links) en i*2+1 (rechts), net als v1
  const TENT = [
    { k: 0, ang: -158.5, rmax: 626, grip: [266, 339] },
    { k: 2, ang: 169, rmax: 703, grip: [135, 650] },
    { k: 4, ang: 142, rmax: 668, grip: [276, 936] },
    { k: 6, ang: 110, rmax: 590, grip: [527, 1052] },
    { k: 1, ang: -15.5, rmax: 687, grip: [1223, 342] },
    { k: 3, ang: 11.5, rmax: 702, grip: [1294, 655] },
    { k: 5, ang: 37, rmax: 678, grip: [1149, 952] },
    { k: 7, ang: 68, rmax: 620, grip: [926, 1069] },
  ];
  const HEAD_ANG = -88; // het hoofd buigt nooit

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

  // ---------- het "rubberen vel" ----------
  // Een net van driehoekjes over het plaatje. Elk puntje draait om het midden
  // met een hoek die afhangt van welke tentakel het is en hoe ver naar buiten.
  const ALL_ANG = TENT.map((t) => t.ang).concat([HEAD_ANG]).sort((a, b) => a - b);

  function angDiff(a, b) {
    return ((a - b + 540) % 360) - 180;
  }

  // Eén punt van de rust-afbeelding verplaatsen voor één arm.
  // De arm buigt vanuit zijn eigen basis (waar hij uit het lijf komt),
  // met een golf die van de basis naar het puntje loopt en een apart krullend puntje.
  const TIP_U = 0.76;

  // Armenkaart: voor elk punt van het plaatje bij welke arm het hoort (255 = lijf/hoofd).
  // Zo beweegt een krulletje altijd met zijn eigen arm mee, nooit half met de buurarm.
  let ARM_MAP = null;
  let MAP_W = 0;
  let MAP_H = 0;
  const MAP_F = 2;
  function setArmMap(img) {
    try {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      ARM_MAP = new Uint8Array(c.width * c.height);
      for (let i = 0; i < ARM_MAP.length; i++) ARM_MAP[i] = d[i * 4];
      MAP_W = c.width;
      MAP_H = c.height;
    } catch (e) {
      ARM_MAP = null;
    }
  }
  function armAt(x, y) {
    if (!ARM_MAP) return 255;
    const ix = Math.max(0, Math.min(MAP_W - 1, Math.round(x / MAP_F)));
    const iy = Math.max(0, Math.min(MAP_H - 1, Math.round(y / MAP_F)));
    return ARM_MAP[iy * MAP_W + ix];
  }

  function armXY(p, x, y, r) {
    const L = p.rmax - R0;
    const sPos = r - R0;
    if (sPos <= 0) return [x, y];
    const uu = Math.min(1, sPos / L);
    // het puntje (krulletje) beweegt als één stevig geheel: daar buigt niets meer
    const u = Math.min(uu, TIP_U);
    // houding (stemming, knijpen, vasthouden)
    let th = p.A * sstep(0, 0.3, u);
    for (let j = 0; j < 3; j++) th += p.b[j] * sstep(j / 3, (j + 1) / 3, u);
    // golf: groeit naar het puntje toe, loopt van basis naar puntje
    th += p.wa * Math.pow(u, 1.2) * Math.sin(p.wt - u * (p.wl || 5.2) + p.ph);
    // puntje krult apart
    th += p.ca * sstep(0.7, 1, u) * Math.sin(p.wt * 0.63 + p.ph * 1.7);
    th *= p.sign;
    // basis van deze arm
    const a = (p.ang * Math.PI) / 180;
    const bx = OC.x + R0 * Math.cos(a);
    const by = OC.y + R0 * Math.sin(a);
    // intrekken (knijpen) vanaf de basis
    const k = 1 - p.pull * sstep(0, 0.25, u);
    const dx = (x - bx) * k;
    const dy = (y - by) * k;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    return [bx + dx * c - dy * sn, by + dx * sn + dy * c];
  }

  // Waar komt een punt terecht? Het hoofd blijft stijf;
  // alleen in de smalle ruimte tussen hoofd en arm vloeit het over.
  function warpAngle(params, x, y) {
    const dx = x - OC.x;
    const dy = y - OC.y;
    const r = Math.hypot(dx, dy);
    if (r <= R0 * 0.85) return [x, y];
    const phi = (Math.atan2(dy, dx) * 180) / Math.PI;
    let lo = null, hi = null, dlo = -999, dhi = 999;
    for (const a of ALL_ANG) {
      const d = angDiff(a, phi);
      if (d <= 0 && d > dlo) { dlo = d; lo = a; }
      if (d > 0 && d < dhi) { dhi = d; hi = a; }
    }
    if (lo === null) { lo = hi; dlo = dhi; }
    if (hi === null) { hi = lo; dhi = dlo; }
    const span = dhi - dlo || 1;
    let t = -dlo / span;
    // naast het hoofd: het hoofd wint bijna overal, alleen vlak bij de arm mengen
    if (lo === HEAD_ANG) t = sstep(0.62, 0.95, t);
    else if (hi === HEAD_ANG) t = sstep(0.05, 0.38, t);
    else t = sstep(0, 1, t);
    const pos = (a) => {
      if (a === HEAD_ANG) return [x, y];
      const pa = params.byAng[a];
      return pa ? armXY(pa, x, y, r) : [x, y];
    };
    if (t <= 0.0001) return pos(lo);
    if (t >= 0.9999) return pos(hi);
    const P = pos(lo);
    const Q = pos(hi);
    return [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
  }

  function warpXY(params, x, y) {
    const r = Math.hypot(x - OC.x, y - OC.y);
    if (r <= R0 * 0.85) return [x, y];
    const L = r > 285 ? armAt(x, y) : 255;
    const pa = L !== 255 && params.byK ? params.byK[L] : null;
    if (!pa) return warpAngle(params, x, y);
    const w = sstep(285, 345, r);
    const Q = armXY(pa, x, y, r);
    if (w >= 0.999) return Q;
    const P = warpAngle(params, x, y);
    return [P[0] + (Q[0] - P[0]) * w, P[1] + (Q[1] - P[1]) * w];
  }

  class OctoMesh {
    constructor(img) {
      this.ok = false;
      this.canvas = document.createElement("canvas");
      const gl = this.canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
      if (!gl) return;
      this.gl = gl;
      const vs = `attribute vec2 p; attribute vec2 uv; uniform vec2 size; varying vec2 v;
        void main(){ v=uv; vec2 c=(p+vec2(${PAD}.0))/size; gl_Position=vec4(c.x*2.0-1.0, 1.0-c.y*2.0, 0.0, 1.0); }`;
      const fs = `precision mediump float; varying vec2 v; uniform sampler2D tex;
        void main(){ gl_FragColor=texture2D(tex, v); }`;
      const sh = (type, src) => {
        const o = gl.createShader(type);
        gl.shaderSource(o, src);
        gl.compileShader(o);
        return o;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      gl.useProgram(prog);
      this.prog = prog;

      // polair net: spaken x ringen
      const SP = 144;
      const RG = 48;
      const RMAX = 930;
      this.rest = [];
      const rxy = [];
      const uv = [];
      for (let ri = 0; ri <= RG; ri++) {
        const r = ri === 0 ? 0.5 : (Math.pow(ri / RG, 0.95)) * RMAX;
        for (let si = 0; si < SP; si++) {
          const phi = (si / SP) * 360 - 180;
          const x = OC.x + r * Math.cos((phi * Math.PI) / 180);
          const y = OC.y + r * Math.sin((phi * Math.PI) / 180);
          this.rest.push([r, phi]);
          rxy.push(x, y);
          uv.push(x / IMG_W, y / IMG_H);
        }
      }
      const idx = [];
      for (let ri = 0; ri < RG; ri++) {
        for (let si = 0; si < SP; si++) {
          const a = ri * SP + si;
          const b = ri * SP + ((si + 1) % SP);
          const c = (ri + 1) * SP + si;
          const d = (ri + 1) * SP + ((si + 1) % SP);
          idx.push(a, c, b, b, c, d);
        }
      }
      this.count = idx.length;
      this.restXY = new Float32Array(rxy);
      // per punt vooraf: afstand tot het midden en bij welke arm het hoort
      const nv = rxy.length / 2;
      this.rr = new Float32Array(nv);
      this.lab = new Uint8Array(nv);
      for (let i = 0; i < nv; i++) {
        const x = rxy[i * 2];
        const y = rxy[i * 2 + 1];
        const r = Math.hypot(x - OC.x, y - OC.y);
        this.rr[i] = r;
        this.lab[i] = r > 285 ? armAt(x, y) : 255;
      }
      this.pos = new Float32Array(this.rest.length * 2);
      this.posBuf = gl.createBuffer();
      const uvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
      const locUV = gl.getAttribLocation(prog, "uv");
      gl.enableVertexAttribArray(locUV);
      gl.vertexAttribPointer(locUV, 2, gl.FLOAT, false, 0, 0);
      this.locP = gl.getAttribLocation(prog, "p");
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      const big = this.rest.length > 65535;
      this.idxType = gl.UNSIGNED_SHORT;
      if (big) {
        gl.getExtension("OES_element_index_uint");
        this.idxType = gl.UNSIGNED_INT;
      }
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(idx) : new Uint16Array(idx), gl.STATIC_DRAW);

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.locSize = gl.getUniformLocation(prog, "size");
      this.scale = 0;
      this.ok = true;
    }

    // één punt vervormen (voor grijppunten)
    static warpPoint(x, y, params) {
      return warpXY(params, x, y);
    }

    render(params, scale) {
      const gl = this.gl;
      if (Math.abs(scale - this.scale) > 0.05) {
        this.scale = scale;
        this.canvas.width = Math.round((IMG_W + 2 * PAD) * scale);
        this.canvas.height = Math.round((IMG_H + 2 * PAD) * scale);
      }
      const pos = this.pos;
      const rx = this.restXY;
      const rr = this.rr;
      const lab = this.lab;
      const byK = params.byK || {};
      for (let v = 0, i = 0; i < rx.length; i += 2, v++) {
        const x = rx[i];
        const y = rx[i + 1];
        const r = rr[v];
        const L = lab[v];
        // lijfkern, hoofd en de lege ruimte rond het hoofd bewegen niet: overslaan
        if (r <= R0 * 0.85 || (L === 255 && r > 345)) {
          pos[i] = x;
          pos[i + 1] = y;
          continue;
        }
        // ver genoeg in een arm: alleen die arm
        if (L !== 255 && r >= 345 && byK[L]) {
          const q = armXY(byK[L], x, y, r);
          pos[i] = q[0];
          pos[i + 1] = q[1];
          continue;
        }
        const q = warpXY(params, x, y);
        pos[i] = q[0];
        pos[i + 1] = q[1];
      }
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.locP);
      gl.vertexAttribPointer(this.locP, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(this.locSize, IMG_W + 2 * PAD, IMG_H + 2 * PAD);
      gl.drawElements(gl.TRIANGLES, this.count, this.idxType, 0);
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
      this.whipT = new Array(8).fill(9);               // tijd sinds een arm gooide
      this.gest = { k: -1, t: 9, next: 4 + Math.random() * 4 }; // af en toe zwaaien
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
      setArmMap(this.img.armmap);
      this.mesh = new OctoMesh(this.img.octo);
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
      if (this.reduced && !this.img.octo) return false;
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
      // zwiep en zwaaien bijhouden
      for (let i = 0; i < 8; i++) this.whipT[i] += dt;
      const g = this.gest;
      g.t += dt;
      g.next -= dt;
      if (g.next <= 0) {
        g.next = 6 + Math.random() * 6;
        const busy = this.athPhase || this.drowsy.v > 0.3 || (this.toy && this.toy.toss) ||
          this.mood.v < 0.42 || this.reduced || this.annoyed > 0;
        if (!busy) {
          const h = this.toy ? this.toy.holder : -1;
          const opts = [0, 1].filter((q) => q !== h);
          g.k = opts[(Math.random() * opts.length) | 0];
          g.t = 0;
        }
      }
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
      if (!this.img.octo) return;
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
      this._drawOcto(pose);
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

    // Buiging per tentakel (radialen) op afstand r van het midden.
    // Positief = omhoog krullen, net als in v1.
    _bendParams(pose) {
      const f = this.frenzy.v;
      const e = this.euph.v;
      const d = this.drowsy.v;
      // hoeveel golf: nooit te wild, ook niet als alles tegelijk gebeurt
      // 3. euforie en hoge combo: armen zwaaien wild (maar met een plafond)
      const amp = Math.min(
        0.42,
        (this.reduced ? 0.3 : 1) * (lerp(0.1, 0.2, pose.m) + f * 0.2 + e * 0.26) * (1 - 0.75 * d)
      );
      const speed = Math.min(2.6, (lerp(0.8, 1.3, pose.m) + f * 1.4 + e * 1.8) * (1 - 0.6 * d));
      const happy = sstep(0.58, 0.9, pose.m) * (1 - d);
      const N = POSE.neutral;
      // zachte overgangen: de basishouding schuift vloeiend naar de nieuwe stand
      const now = this.t;
      const dt = Math.min(0.1, Math.max(0, now - (this._bendT || now)));
      this._bendT = now;
      const follow = 1 - Math.exp(-dt * 7);
      if (!this._bend) this._bend = TENT.map(() => ({ A: 0, b: [0, 0, 0] }));
      const soft = (x, m) => m * Math.tanh(x / m);
      const out = [];
      TENT.forEach((T, n) => {
        const k = T.k;
        const i = k >> 1;
        const side = k % 2 === 0 ? 1 : -1;
        const ph = ARMS[i].ph + (side < 0 ? 0.8 : 0);
        const pulse = this.armPulse[k];
        const hold = this.hold[k];
        // doel (zonder golf)
        // 1. blij: armen duidelijk omhoog (juichen); 4. verdrietig/slapen: slap omlaag (via pose)
        // 2. squeeze-moment: armen krullen om zijn lijf heen
        // los hangen: zijarmen zakken een beetje door (alsof het water ze draagt),
        // verdrietig/slapen hangen ze echt slap; blij en euforie: wijd open en naar buiten
        const horiz = Math.abs(Math.cos((T.ang * Math.PI) / 180));
        const sad = clamp(-(pose.a - N.a) / 0.42, 0, 1.5);
        const hang = -0.16 * horiz * (1 - happy) - 0.22 * horiz * sad;
        const At =
          (pose.a - N.a) * 1.1 + hang + happy * 0.5 + e * 0.15 + this.charge * 0.35 - this.pop * 0.25 +
          this.flinch * 0.25 + pulse * 0.25 + hold * 0.32;
        // krullen alleen nog bij het squeeze-moment; anders reiken in plaats van oprollen
        const bt = [0, 1, 2].map((j) => {
          const dlt = pose.b[j] - N.b[j];
          return (dlt > 0 ? dlt * 0.35 : dlt * 1.1) + this.charge * (0.55 + j * 0.25) - this.pop * 0.3 +
            this.flinch * 0.5 + Math.abs(this.turn.v) * 0.25 + pulse * 0.6 - hold * (j === 2 ? 0.45 : 0.1) +
            (j === 2 ? hang * 0.6 : 0);
        });
        const st = this._bend[n];
        st.A += (At - st.A) * follow;
        for (let j = 0; j < 3; j++) st.b[j] += (bt[j] - st.b[j]) * follow;
        // basishouding (de golf gaat apart, als doorlopende beweging)
        let A = st.A + (this.reduced ? 0 : hold * Math.sin(this.t * 3 + k) * 0.07);
        // de hele arm slingert langzaam heen en weer, elke arm in zijn eigen ritme
        if (!this.reduced) {
          const slow = (0.55 + 0.25 * ((k * 53) % 7) / 7) * (1 - 0.5 * d);
          A += (0.1 + 0.12 * pose.m + 0.12 * e + 0.08 * f) * (1 - 0.4 * d) *
            Math.sin(this.t * slow + ph * 1.3);
        }
        const b = st.b.slice();
        // onderste armen niet naar binnen laten zakken (anders kruisen ze),
        // bovenste armen niet over zijn hoofd heen laten buigen
        const sn = Math.sin((T.ang * Math.PI) / 180);
        const down = Math.max(0, sn);
        const up = Math.max(0, -sn);
        const damp = (v) => (v < 0 ? v * (1 - 0.75 * down) : v * (1 - 0.82 * up));
        // 6. zwiep bij het gooien: kort uithalen en naveren (snel, niet afgevlakt)
        const wt = this.whipT ? this.whipT[k] : 9;
        if (wt < 1.2) {
          A += 0.7 * Math.sin(clamp(wt / 0.3, 0, 1) * Math.PI) -
            0.28 * sstep(0.25, 0.6, wt) * (1 - sstep(0.6, 1.2, wt));
        }
        // 5. zwaaien: een bovenste arm zwaait even naar je
        const gs = this.gest;
        if (gs && gs.k === k && gs.t < 2.6) {
          const env = Math.sin(clamp(gs.t / 2.6, 0, 1) * Math.PI);
          A += env * 0.6;
          b[1] += env * 0.35 * Math.sin(gs.t * 6.5);
          b[2] += env * 0.45 * Math.sin(gs.t * 6.5 - 0.8);
        }
        A = soft(damp(A * 0.85), 0.8);
        let bb = b.map((v) => soft(damp(v * 0.6), 0.5));
        // de bovenste twee armen zitten vlak naast zijn hoofd: nooit verder omhoog dan dat
        if (i === 0) {
          A = Math.min(A, 0.34);
          bb = bb.map((v) => (v > 0 ? Math.min(v * 0.5, 0.2) : v));
        }
        // elke arm een eigen tempo, zodat ze niet als één blok bewegen
        const tempo = 0.85 + ((k * 37) % 10) / 30;
        out.push({
          k: T.k, ang: T.ang, rmax: T.rmax, sign: side, A, b: bb,
          // iets rustiger: dit ziet er bij zachte, sierlijke bewegingen het mooist uit
          // bovenste armen golven minder, zodat ze nooit over zijn gezicht zwaaien
          wa: amp * 1.05 * (1 - 0.6 * up), ca: 0.05 + amp * 0.2,
          wl: 3.2, // lange golf: de arm slingert als geheel, niet alleen het puntje
          wt: this.t * speed * tempo, ph: ph + k * 0.9,
        });
      });
      // knijpen = armen naar zich toe trekken; knal = even uitschieten
      const pull = clamp(this.charge * 0.3 - this.pop * 0.12 + d * 0.06, -0.2, 0.4);
      out.pull = pull;
      out.byAng = {};
      out.byK = {};
      for (const q of out) {
        q.pull = pull;
        out.byAng[q.ang] = q;
        out.byK[q.k] = q;
      }
      return out;
    }

    _drawOcto(pose) {
      const { ctx } = this;
      const params = this._bendParams(pose);
      const mesh = this.mesh;
      if (mesh && mesh.ok) {
        mesh.render(params, this._meshScale());
        ctx.drawImage(
          mesh.canvas,
          toWX(-PAD), toWY(-PAD),
          (IMG_W + 2 * PAD) * S, (IMG_H + 2 * PAD) * S
        );
      } else {
        // geen WebGL: stilstaand plaatje (hij blijft wel ademen en knijpen)
        ctx.drawImage(this.img.octo, toWX(0), toWY(0), IMG_W * S, IMG_H * S);
      }
      // grijppunten van de tentakels bijwerken (ring, high five, glas)
      for (const T of TENT) {
        const p = OctoMesh.warpPoint(T.grip[0], T.grip[1], params);
        const q = OctoMesh.warpPoint(
          T.grip[0] + Math.cos((T.ang * Math.PI) / 180) * 12,
          T.grip[1] + Math.sin((T.ang * Math.PI) / 180) * 12,
          params
        );
        const tip = this.tips[T.k];
        tip.x = toWX(p[0]);
        tip.y = toWY(p[1]);
        tip.th = Math.atan2(q[1] - p[1], q[0] - p[0]) - Math.PI / 2;
      }
    }

    // resolutie van het vel: niet scherper dan het scherm nodig heeft
    _meshScale() {
      const px = (this._sc || 0.3) * S * (this.dpr || 1);
      return clamp(px * 1.15, 0.35, 1);
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
      if (this.whipT && t.holder >= 0 && t.holder < 8) this.whipT[t.holder] = 0;
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
      // nooit vóór zijn gezicht: opzij duwen
      if (this.charge < 0.3 && ty > -340 && ty < 10 && Math.abs(tx) < 240) {
        tx = (tx < 0 ? -1 : 1) * 240;
      }
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

    // Welke uitdrukking hoort bij dit humeur? Met speling, zodat hij niet heen en weer flitst.
    _pickExpr(me) {
      const cur = this.exprTo || "neutral";
      if (cur === "neutral") return me > 0.66 ? "happy" : me < 0.34 ? "sad" : "neutral";
      if (cur === "happy") return me < 0.34 ? "sad" : me < 0.56 ? "neutral" : "happy";
      return me > 0.66 ? "happy" : me > 0.44 ? "neutral" : "sad";
    }

    _drawFace(m, annoy = 0) {
      const { ctx, img } = this;
      const d = this.drowsy.v;
      const e = this.euph.v;
      const me = lerp(m, 0.18, annoy);
      const lookK = 1 - d;
      const lx = lerp(this.look.x * 10 * lookK, this.turn.v * 60, annoy);
      const ly = lerp(this.look.y * 7 * lookK + d * 8, -4, annoy);

      // ---- wisselen van uitdrukking: knipperen op het moment van wisselen ----
      const now = this.t;
      const fdt = Math.min(0.1, Math.max(0, now - (this._faceT || now)));
      this._faceT = now;
      if (!this.exprFrom) {
        this.exprFrom = this.exprTo = this._pickExpr(me);
        this.exprK = 1;
      }
      const want = this._pickExpr(me);
      if (this.exprK >= 1 && want !== this.exprTo) {
        this.exprFrom = this.exprTo;
        this.exprTo = want;
        this.exprK = 0;
      }
      this.exprK = Math.min(1, this.exprK + fdt / (this.reduced ? 0.12 : 0.26));
      const swapK = this.exprK < 1 ? Math.sin(this.exprK * Math.PI) : 0; // 0 → 1 → 0
      const expr = this.exprK < 0.5 ? this.exprFrom : this.exprTo;

      // ---- ogen: één set tegelijk, pupillen altijd op dezelfde hoogte ----
      const EYE = {
        happy: { im: img.eyes_happy, w: 279, fy: 0.357 },
        neutral: { im: img.eyes_neutral, w: 300, fy: 0.411 },
        sad: { im: img.eyes_sad, w: 300, fy: 0.375 },
      };
      const eyeBottom = -95 + ly;
      const pupilY = eyeBottom - 71;
      const blinkK = 1 - 0.88 * Math.sin(Math.min(1, this.blink) * Math.PI);
      const squint = 1 - 0.6 * this.charge;
      const sleepy = 1 - 0.5 * d * (this.wakeT > 0 ? 0.3 : 1);
      const surprise = 1 + 0.22 * clamp(this.wakeT / 1.3, 0, 1);
      const eyeK = blinkK * squint * sleepy * surprise * (1 - 0.94 * swapK);
      const E = EYE[expr];
      {
        const ew = E.w * lerp(1, surprise, 0.6);
        const eh = (E.im.height / E.im.width) * ew;
        ctx.save();
        ctx.translate(lx, pupilY);
        ctx.scale(1, Math.max(0.04, eyeK));
        ctx.drawImage(E.im, -ew / 2, -eh * (1 - E.fy), ew, eh);
        ctx.restore();
      }

      // sterren-ogen bij euforie (op de pupillen van de blije ogen)
      if (e > 0.05 && this.charge < 0.1 && swapK < 0.5) {
        const ew = EYE.happy.w;
        const spin = this.reduced ? 0 : Math.sin(this.t * 3) * 0.3;
        const pulse = 1 + (this.reduced ? 0 : Math.sin(this.t * 10) * 0.12);
        const cx = expr === "happy" ? [(0.284 - 0.5) * ew, (0.73 - 0.5) * ew] : [-86, 86];
        for (const px of cx) this._star(lx + px, pupilY, 54 * e * pulse, spin, e);
      }

      // ---- mond: knijpt kort samen en springt dan in de nieuwe vorm ----
      const talk = (this.frenzy.v + this.euph.v) * (0.5 + 0.5 * Math.sin(this.t * 14)) * 0.12;
      const mExpr = annoy > 0.5 ? "neutral" : expr;
      const MOUTH = {
        neutral: { im: img.mouth_neutral, w: 128 - annoy * 22 - d * 20 },
        sad: { im: img.mouth_sad, w: 138 },
        happy: { im: img.mouth_happy, w: 132 + e * 14 },
      };
      const MO = MOUTH[mExpr];
      const mw = MO.w;
      const mh = (MO.im.height / MO.im.width) * mw;
      ctx.save();
      ctx.translate(lx * 0.7, -55 + ly * 0.7);
      ctx.scale(
        (1 + talk * 0.3) * (1 - 0.18 * swapK),
        (1 + talk) * (1 - 0.25 * this.charge) * (1 - 0.55 * swapK)
      );
      ctx.drawImage(MO.im, -mw / 2, -mh / 2, mw, mh);
      ctx.restore();
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
