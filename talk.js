// Squeeze — tekstballonnetjes (zonder AI).
// 💭 denkwolkje als het rustig is, 💬 praatballon bij momenten.
// Nooit spammen: minstens 10 sec tussen ballonnetjes, rustig hooguit om de 30-40 sec,
// bij drukte wint het belangrijkste moment.
(function () {
  "use strict";

  // hoe belangrijk (hoger = wint)
  const PRIO = {
    idle: 0, sleep: 1, firstBuy: 1, poke: 1, highfive: 1, glass: 1,
    f_fish: 1, f_minnow: 1, f_shrimp: 1, f_crabPoke: 1, f_lobster: 1, f_dolphin: 1, f_seal: 1, f_jellyDrift: 1,
    combo3: 2, combo5: 2, pump: 2, dump: 2, wake: 2, annoyed: 2, f_shark: 2,
    combo10: 3, ring: 3, reclaim: 3, milestone: 3, f_whale: 3, f_crabSteal: 3,
  };
  const THOUGHT = new Set(["idle", "sleep"]);
  // reacties op wat de bezoeker zelf doet mogen sneller na elkaar
  const QUICK = new Set(["poke", "highfive", "glass", "annoyed"]);
  const KEY = "squeeze:said";

  class Talk {
    constructor(wrap, sq, opts = {}) {
      this.wrap = wrap;
      this.sq = sq;
      this.reduced = !!opts.reducedMotion;
      this.lines = window.SQUEEZE_LINES || {};
      this.el = document.createElement("div");
      this.el.className = "bubble";
      this.el.setAttribute("aria-hidden", "true");
      wrap.appendChild(this.el);
      this.visible = false;
      this.curPrio = -1;
      this.lastAt = -99;
      this.nextIdle = 18 + Math.random() * 10;
      this.state = { rings: 0, drought: false };
      try {
        this.recent = JSON.parse(localStorage.getItem(KEY) || "[]");
      } catch {
        this.recent = [];
      }
      setInterval(() => this._tick(), 1000);
    }

    setState(st) {
      Object.assign(this.state, st);
    }

    // zeg iets uit een categorie (vars = invulwoorden)
    say(cat, vars = {}, delay = 0) {
      if (delay > 0) {
        setTimeout(() => this.say(cat, vars, 0), delay);
        return;
      }
      const now = performance.now() / 1000;
      const p = PRIO[cat] ?? 1;
      if (this.visible && p <= this.curPrio) return false;
      const gap = p >= 3 ? 0 : QUICK.has(cat) ? 3 : 10;
      if (!this.visible && now - this.lastAt < gap) return false;
      const text = this._pick(cat, { rings: this.state.rings, next: this.state.rings + 1, ...vars });
      if (!text) return false;
      this._show(text, THOUGHT.has(cat), p);
      return true;
    }

    // ---------- intern ----------
    _tick() {
      if (document.hidden) return;
      const now = performance.now() / 1000;
      if (this.visible || now - this.lastAt < this.nextIdle) return; // rustig: 30-40 sec na het vorige
      if (this.sq.athPhase || this.sq.glass) return;
      this.nextIdle = this.state.drought ? 45 + Math.random() * 15 : 30 + Math.random() * 10;
      this.say(this.state.drought ? "sleep" : "idle");
    }

    _pick(cat, vars) {
      let list = (this.lines[cat] || []).slice();
      // zinnen over ringen pas als hij er een heeft
      if (!vars.rings) list = list.filter((l) => !l.includes("{rings}"));
      if (!list.length) return null;
      let fresh = list.filter((l) => !this.recent.includes(l));
      if (!fresh.length) {
        // alles al gezien: deze categorie opnieuw beginnen
        this.recent = this.recent.filter((l) => !list.includes(l));
        fresh = list;
      }
      const line = fresh[(Math.random() * fresh.length) | 0];
      this.recent.push(line);
      if (this.recent.length > 120) this.recent.splice(0, this.recent.length - 120);
      try {
        localStorage.setItem(KEY, JSON.stringify(this.recent));
      } catch {}
      return line.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
    }

    _show(text, thought, prio) {
      const el = this.el;
      clearTimeout(this._hideT);
      el.classList.remove("show");
      el.classList.toggle("thought", thought);
      el.textContent = text;
      this._place();
      void el.offsetWidth;
      el.classList.add("show");
      this.visible = true;
      this.curPrio = prio;
      this.lastAt = performance.now() / 1000;
      const dur = Math.min(6, 2.8 + text.length * 0.05) * 1000;
      this._hideT = setTimeout(() => {
        el.classList.remove("show");
        this.visible = false;
        this.curPrio = -1;
      }, dur);
    }

    // rechtsboven naast zijn hoofd, binnen het beeld
    _place() {
      const a = this.sq.headAnchor();
      const el = this.el;
      const W = this.wrap.clientWidth;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      el.style.left = Math.max(6, Math.min(a.x, W - w - 6)) + "px";
      el.style.top = Math.max(4, a.y - h) + "px";
    }
  }

  window.Talk = Talk;
})();
