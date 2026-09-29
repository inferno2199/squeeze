// Squeeze — zijn vriendjes in de zee.
// Regel: elk dier is zeldzaam en hoort bij een moment. Nooit een drukke zee.
(function () {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const rnd = (a, b) => a + Math.random() * (b - a);

  const KINDS = ["fish", "minnow", "shrimp", "crab", "lobster", "dolphin", "shark", "seal", "jelly", "whale"];
  // breedte in wereld-eenheden (Squeeze zelf is ~500 breed)
  const SIZE = {
    fish: 250, minnow: 105, shrimp: 150, crab: 250, lobster: 215,
    dolphin: 380, shark: 480, seal: 360, jelly: 230, whale: 1000,
  };
  // dieren die "een moment" zijn: er is er steeds hooguit één tegelijk
  const EVENT = new Set(["minnow", "shrimp", "crab", "lobster", "dolphin", "shark"]);

  class Friends {
    constructor(sq, opts = {}) {
      this.sq = sq;
      sq.friends = this;
      this.reduced = !!opts.reducedMotion;
      this.onSay = opts.onSay || (() => {});
      this.img = {};
      this.active = [];
      this.cool = {};
      this.t = 0;
      this.fishTimer = rnd(40, 80);
      this.crabTimer = rnd(200, 320);
      this.jellyTimer = rnd(90, 180);
      this.prev = { price: 0, combo: 0, drought: false };
    }

    async load() {
      await Promise.all(
        KINDS.map(
          (k) =>
            new Promise((res) => {
              const im = new Image();
              im.onload = () => {
                this.img[k] = im;
                if (k === "whale") this.img.whaleFar = tintFar(im);
                res();
              };
              im.onerror = () => res(); // ontbreekt er een, dan komt dat dier gewoon niet
              im.src = "assets/friends/" + k + ".png";
            })
        )
      );
    }

    // ---------- signalen van de chart ----------
    onState({ priceInput = 0, combo = 0, drought = false }) {
      const p = this.prev;
      if (p.price < 0.7 && priceInput >= 0.7) this.try("dolphin", 240);
      if (p.price > -0.7 && priceInput <= -0.7) {
        if (Math.random() < 0.5) this.try("shark", 360);
        else if (Math.random() < 0.6) this.try("crab", 300, { steal: true });
      }
      if (p.combo < 5 && combo >= 5) this.try("minnow", 180);
      if (!p.drought && drought) this._seal(true);
      if (p.drought && !drought) this._seal(false);
      this.prev = { price: priceInput, combo, drought };
    }
    onBuy(n) {
      if (n <= 2 && Math.random() < 0.12) this.try("shrimp", 90);
    }
    onRing() {
      if (Math.random() < 0.45) this.try("lobster", 300);
    }
    // grote buy: een walvis zwemt groot en langzaam door de achtergrond
    onWhale() {
      if (this.try("whale", 120, { priority: true })) this.onSay("f_whale", {}, 1200);
    }
    onMilestone(value) {
      this.force("jelly", { value });
    }

    // ---------- spawnen ----------
    try(kind, cooldownSec, extra) {
      if (this.reduced || !this.img[kind]) return false;
      if ((this.cool[kind] || 0) > this.t) return false;
      if (!(extra && extra.priority) && EVENT.has(kind) && this.active.some((a) => EVENT.has(a.kind))) return false;
      if (kind === "whale" && this.active.some((a) => a.kind === "whale")) return false;
      this.cool[kind] = this.t + cooldownSec;
      this._spawn(kind, extra || {});
      return true;
    }
    force(kind, extra) {
      if (!this.img[kind]) return;
      if (kind === "seal") return this._seal(!this.active.some((a) => a.kind === "seal" && !a.leaving));
      if (this.reduced && kind !== "jelly") return;
      this._spawn(kind, extra || {});
    }

    _bounds() {
      const b = this.sq.bounds();
      return { ...b, floor: Math.min(b.bot - 60, 620) };
    }

    _spawn(kind, extra) {
      const b = this._bounds();
      const dir = Math.random() < 0.5 ? 1 : -1;
      const a = { kind, t: 0, dir, ...extra };
      const edge = b.hw + SIZE[kind];
      if (kind === "fish") {
        a.x = -dir * edge;
        a.y = rnd(b.top + 140, 120);
        a.v = 170;
      } else if (kind === "minnow") {
        a.n = 9;
        a.base = rnd(0, 6.28);
      } else if (kind === "shrimp") {
        a.x0 = -dir * edge;
        a.hops = 0;
      } else if (kind === "crab") {
        a.x = -dir * edge;
        a.v = extra.steal ? 260 : 110;
        a.poke = !!this.prev.drought && !extra.steal;
        if (extra.steal) {
          const toy = this.sq.toy;
          a.ring = { x: toy.x, y: toy.y, vy: 0, held: false, back: false };
          toy.stolen = true;
          a.targetX = clamp(toy.x, -b.hw + 120, b.hw - 120);
        }
      } else if (kind === "lobster") {
        a.x = -dir * edge;
        a.v = 95;
      } else if (kind === "dolphin") {
        a.dur = 2.6;
      } else if (kind === "whale") {
        a.x = -dir * (b.hw + 520);
        a.y = rnd(-330, -230);
        a.v = 150;
      } else if (kind === "shark") {
        a.x = -dir * edge;
        a.y = rnd(-160, -40);
        a.v = 125;
      } else if (kind === "jelly" && extra.drift) {
        // van onder aan één kant, schuin omhoog naar de andere kant
        // langs één zijkant omhoog, zodat hij niet achter Squeeze verdwijnt
        a.x0 = dir * b.hw * 0.78;
        a.x1 = dir * b.hw * 0.55;
        a.y0 = b.floor - 120;
        a.y1 = b.top - 260;
        a.dur = 18;
      } else if (kind === "jelly") {
        a.stage = "down";
        this.sq.focus = null;
      }
      this.active.push(a);
      this._lineFor(a);
    }

    // soms zegt Squeeze iets over het vriendje (niet altijd, anders wordt het spam)
    _lineFor(a) {
      const map = {
        fish: ["f_fish", 1500, 0.6],
        minnow: ["f_minnow", 900, 1],
        shrimp: ["f_shrimp", 1200, 0.7],
        lobster: ["f_lobster", 1800, 0.8],
        dolphin: ["f_dolphin", 1000, 1],
        shark: ["f_shark", 1600, 1],
      };
      if (a.kind === "crab" && a.steal) return this.onSay("f_crabSteal", {}, 300);
      if (a.kind === "jelly" && a.drift && Math.random() < 0.6) return this.onSay("f_jellyDrift", {}, 3000);
      const m = map[a.kind];
      if (m && Math.random() < m[2]) this.onSay(m[0], {}, m[1]);
    }

    _seal(on) {
      if (this.reduced || !this.img.seal) return;
      const cur = this.active.find((a) => a.kind === "seal");
      if (on && !cur) {
        const b = this._bounds();
        const side = Math.random() < 0.5 ? -1 : 1;
        this.active.push({
          kind: "seal", t: 0, side,
          x: side * (b.hw + SIZE.seal), home: side * Math.min(380, b.hw - 170), leaving: false,
        });
        this.onSay("f_seal", {}, 2600);
      } else if (!on && cur) {
        cur.leaving = true;
      }
    }

    // tik op een dier: het visje schiet geschrokken weg
    hit(clientX, clientY) {
      const sq = this.sq;
      const r = sq.canvas.getBoundingClientRect();
      const x = (clientX - r.left - sq.w / 2) / sq._sc;
      const y = (clientY - r.top - sq.h * 0.47) / sq._sc;
      for (const a of this.active) {
        if (a.kind === "fish" && !a.dart && Math.hypot(x - a.x, y - a.y) < 110) {
          a.dart = true;
          a.v = 900;
          a.jump = 1;
          return true;
        }
      }
      return false;
    }

    // ---------- update ----------
    update(dt) {
      this.t += dt;
      if (this.reduced) {
        // alleen de kwal mag (als felicitatie), al de rest niet
        this.active = this.active.filter((a) => a.kind === "jelly" && this._step(a, dt));
        return;
      }
      // omgevingsdieren
      this.fishTimer -= dt;
      if (this.fishTimer <= 0) {
        this.fishTimer = rnd(150, 270);
        if (!this.active.some((a) => a.kind === "fish" || a.kind === "shark")) this._spawn("fish", {});
      }
      // kwal zweeft af en toe gewoon rustig voorbij (zonder felicitatie)
      this.jellyTimer -= dt;
      if (this.jellyTimer <= 0) {
        this.jellyTimer = rnd(240, 420);
        if (!this.active.some((a) => a.kind === "jelly")) this._spawn("jelly", { drift: true });
      }
      this.crabTimer -= dt;
      if (this.crabTimer <= 0) {
        this.crabTimer = rnd(240, 420);
        this.try("crab", 120);
      }

      let focus = null;
      this.active = this.active.filter((a) => {
        const alive = this._step(a, dt);
        if (alive && a.focus) focus = a.focus;
        return alive;
      });
      this.sq.focus = focus;
      const shark = this.active.find((a) => a.kind === "shark");
      this.sq.scare.target = shark && Math.abs(shark.x) < this._bounds().hw + 150 ? 1 : 0;
    }

    // één dier een stapje verder; false = weg
    _step(a, dt) {
      const b = this._bounds();
      const sq = this.sq;
      a.t += dt;
      a.focus = null;
      const edge = b.hw + SIZE[a.kind];

      switch (a.kind) {
        case "fish": {
          a.x += a.dir * a.v * dt;
          if (a.jump) {
            a.y -= 220 * dt * a.jump;
            a.jump *= Math.exp(-dt * 4);
          }
          if (!a.dart && Math.abs(a.x) < b.hw) a.focus = { x: a.x, y: a.y };
          return Math.abs(a.x) < edge + 10 || a.t < 1;
        }
        case "minnow": {
          // binnenkomen, 6 sec rond Squeeze zwieren, weer weg
          const inT = ease(clamp(a.t / 1.2, 0, 1));
          const outT = ease(clamp((a.t - 7.2) / 1.4, 0, 1));
          a.r = lerp(1300, 470, inT) + outT * 900;
          a.base += dt * 1.6;
          return a.t < 8.8;
        }
        case "shrimp": {
          // 4 hupjes over de bodem
          const hop = 0.55;
          const k = a.t / hop;
          const dist = (2 * edge) / 5;
          a.x = a.x0 + a.dir * k * dist;
          a.y = b.floor - 70 - Math.abs(Math.sin(k * Math.PI)) * 140;
          a.rot = Math.cos(k * Math.PI) * 0.3 * a.dir;
          return k < 5.2;
        }
        case "crab": {
          if (a.ring && !a.ring.back) {
            const r = a.ring;
            if (!r.held) {
              // ring valt naar de bodem, krab rent erheen
              r.vy += 900 * dt;
              r.y = Math.min(b.floor - 40, r.y + r.vy * dt);
              const dx = r.x - a.x;
              a.x += Math.sign(dx) * Math.min(Math.abs(dx), a.v * dt);
              if (Math.abs(dx) < 10 && r.y >= b.floor - 41) {
                r.held = true;
                a.grabT = a.t;
                a.dir = a.x > 0 ? 1 : -1; // wegrennen naar dichtstbijzijnde kant
              }
            } else {
              a.x += a.dir * 170 * dt;
              r.x = a.x + a.dir * 60;
              r.y = b.floor - 150;
              if (a.t - a.grabT > 1.1) {
                // Squeeze grist hem terug!
                r.back = true;
                const toy = sq.toy;
                toy.x = r.x;
                toy.y = r.y;
                toy.stolen = false;
                sq._toss(toy.holder, 220);
                sq.flinch = 1;
                sq.sx.vel -= 2;
                a.v = 330;
              }
            }
            a.focus = { x: r.x, y: r.y };
          } else if (a.poke) {
            // naar Squeeze lopen, porren, weer weg
            const stop = a.dir * -170;
            if (!a.poked) {
              const dx = stop - a.x;
              a.x += Math.sign(dx) * Math.min(Math.abs(dx), a.v * dt);
              if (Math.abs(dx) < 4) {
                a.poked = a.t;
                this.onSay("f_crabPoke", {}, 300);
                sq.flinch = 1;
                sq.wakeT = 0.5;
                sq.sx.vel -= 1.5;
              }
            } else if (a.t - a.poked > 1.4) {
              a.x += -a.dir * a.v * dt;
            }
            if (a.poked && a.t - a.poked > 1.4 && Math.abs(a.x) > edge) return false;
            return true;
          } else {
            a.x += a.dir * a.v * dt;
          }
          a.y = b.floor - 95 - Math.abs(Math.sin(a.t * 12)) * 6;
          if (a.ring && a.ring.back) return Math.abs(a.x) < edge + 10;
          return Math.abs(a.x) < edge + 10 || a.t < 1;
        }
        case "lobster": {
          a.x += a.dir * a.v * dt;
          a.y = b.floor - 150 - Math.abs(Math.sin(a.t * 6)) * 10;
          return Math.abs(a.x) < edge + 10 || a.t < 1;
        }
        case "dolphin": {
          const u = a.t / a.dur;
          a.x = lerp(-a.dir * edge, a.dir * edge, u);
          const base = b.top + 520;
          a.y = base - Math.sin(u * Math.PI) * 360;
          const dy = -Math.cos(u * Math.PI) * 360 * Math.PI / a.dur;
          const dx = (2 * edge) / a.dur;
          a.rot = Math.atan2(dy, dx) * a.dir;
          if (Math.abs(a.x) < b.hw) a.focus = { x: a.x, y: a.y };
          return u < 1;
        }
        case "shark": {
          a.x += a.dir * a.v * dt;
          a.y += Math.sin(a.t * 1.2) * 8 * dt;
          if (Math.abs(a.x) < b.hw + 100) a.focus = { x: a.x, y: a.y };
          return Math.abs(a.x) < edge + 10 || a.t < 1;
        }
        case "whale": {
          a.x += a.dir * a.v * dt;
          a.y += Math.sin(a.t * 0.6) * 10 * dt;
          if (Math.abs(a.x) < b.hw) a.focus = { x: a.x, y: a.y };
          return Math.abs(a.x) < b.hw + 540 || a.t < 1;
        }
        case "seal": {
          if (!a.leaving) {
            const dx = a.home - a.x;
            a.x += dx * (1 - Math.exp(-dt * 1.4));
          } else {
            a.x += a.side * 260 * dt;
          }
          a.y = b.floor - 90 + Math.sin(a.t * 0.9) * 3;
          return !(a.leaving && Math.abs(a.x) > edge + 10);
        }
        case "jelly": {
          if (a.drift) {
            const u = a.t / a.dur;
            // stuwen en glijden, zoals een echte kwal
            const push = u + Math.max(0, Math.sin(a.t * 2.2)) * 0.012;
            a.x = lerp(a.x0, a.x1, push) + Math.sin(a.t * 0.7) * 30;
            a.y = lerp(a.y0, a.y1, push);
            return u < 1.03;
          }
          const target = -470;
          if (a.stage === "down") {
            a.y = lerp(b.top - 300, target, ease(clamp(a.t / 2.2, 0, 1)));
            if (a.t >= 2.2) {
              a.stage = "pat";
              a.st = a.t;
            }
          } else if (a.stage === "pat") {
            const k = a.t - a.st;
            a.y = target + Math.sin(clamp(k / 0.5, 0, 1) * Math.PI) * 40;
            if (!a.patted && k > 0.25) {
              a.patted = true;
              sq.sy.vel += 3.5;
              sq.sx.vel -= 2;
              sq.euphoria(2);
              const v = a.value;
              if (v) this.onSay("milestone", { mcap: fmt(v) }, 200);
            }
            if (k > 2.4) {
              a.stage = "up";
              a.st = a.t;
            }
          } else {
            a.y = lerp(target, b.top - 400, ease(clamp((a.t - a.st) / 2.4, 0, 1)));
            if (a.t - a.st > 2.4) return false;
          }
          a.x = Math.sin(a.t * 0.8) * 20;
          a.focus = { x: a.x, y: a.y + 100 };
          return true;
        }
      }
      return false;
    }

    // ---------- tekenen ----------
    draw(ctx, layer) {
      for (const a of this.active) {
        switch (a.kind) {
          case "fish":
            if (layer === "back") this._img(ctx, "fish", a.x, a.y + Math.sin(a.t * 3) * 10, { flip: a.dir < 0, rot: Math.sin(a.t * 6) * 0.05 });
            break;
          case "minnow":
            for (let i = 0; i < a.n; i++) {
              const th = a.base + (i / a.n) * Math.PI * 2 + Math.sin(i * 7.3) * 0.2;
              const front = Math.sin(th) > 0;
              if ((layer === "front") !== front) continue;
              const x = Math.cos(th) * a.r;
              const y = -60 + Math.sin(th) * a.r * 0.42 + Math.sin(this.t * 4 + i) * 8;
              const sc = front ? 1.1 : 0.85;
              // zwemrichting: tegen de klok in
              this._img(ctx, "minnow", x, y, { flip: Math.sin(th) < 0 ? false : true, s: sc, alpha: front ? 1 : 0.8 });
            }
            break;
          case "shrimp":
            if (layer === "front") this._img(ctx, "shrimp", a.x, a.y, { flip: a.dir < 0, rot: a.rot || 0 });
            break;
          case "crab":
            if (layer === "front") {
              this._img(ctx, "crab", a.x, a.y, { rot: Math.sin(a.t * 12) * 0.04 });
              if (a.ring && !a.ring.back) this._ring(ctx, a.ring.x, a.ring.y);
            }
            break;
          case "lobster":
            if (layer === "front") {
              const clap = 1 + Math.max(0, Math.sin(a.t * 6)) * 0.04;
              this._img(ctx, "lobster", a.x, a.y, { s: clap, rot: Math.sin(a.t * 6) * 0.04 });
            }
            break;
          case "dolphin":
            if (layer === "back") this._img(ctx, "dolphin", a.x, a.y, { flip: a.dir < 0, rot: a.rot || 0 });
            break;
          case "whale":
            if (layer === "back") {
              // groot en ver weg: iets doorzichtig, rustig op en neer
              this._img(ctx, "whale", a.x, a.y, {
                flip: a.dir < 0, rot: Math.sin(a.t * 0.6) * 0.03, im: this.img.whaleFar,
              });
            }
            break;
          case "shark":
            if (layer === "back") this._img(ctx, "shark", a.x, a.y, { flip: a.dir < 0, rot: Math.sin(a.t * 2) * 0.03 });
            break;
          case "seal":
            if (layer === "front") {
              const breathe = 1 + Math.sin(a.t * 0.9) * 0.02;
              // kijkt naar Squeeze toe (zeehond kijkt standaard naar rechts)
              this._img(ctx, "seal", a.x, a.y, { flip: a.side > 0, sy: breathe });
            }
            break;
          case "jelly":
            if (a.drift) {
              if (layer === "back") {
                const pulse = 1 + Math.sin(a.t * 2.2) * 0.05;
                this._img(ctx, "jelly", a.x, a.y, { s: 0.8, sx: 1 / pulse, sy: pulse, alpha: 0.85 });
              }
            } else if (layer === "front") {
              const pulse = 1 + Math.sin(a.t * 3) * 0.04;
              this._img(ctx, "jelly", a.x, a.y, { sx: 1 / pulse, sy: pulse });
            }
            break;
        }
      }
    }

    _img(ctx, kind, x, y, o = {}) {
      const im = o.im || this.img[kind];
      if (!im) return;
      const w = SIZE[kind] * (o.s || 1);
      const h = (im.height / im.width) * w;
      ctx.save();
      ctx.translate(x, y);
      if (o.rot) ctx.rotate(o.rot);
      ctx.scale((o.flip ? -1 : 1) * (o.sx || 1), o.sy || 1);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    _ring(ctx, x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.ellipse(0, 0, 72, 30, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#2c9a27";
      ctx.lineWidth = 18;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -1, 72, 30, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#7cff6b";
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.restore();
    }
  }

  // "ver weg in de zee": donkerder en groener, werkt in elke browser
  function tintFar(im) {
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext("2d");
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = "source-atop";
    x.fillStyle = "rgba(4,34,24,0.55)";
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = "destination-in";
    x.globalAlpha = 0.9;
    x.drawImage(im, 0, 0);
    return c;
  }

  function fmt(v) {
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + "M";
    return "$" + Math.round(v / 1e3) + "k"; // 25k, 50k, 75k, …
  }

  window.Friends = Friends;
})();
