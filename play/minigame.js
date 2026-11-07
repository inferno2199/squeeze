// minigame.js — gedeelde basis voor 🧱 Squeeze Stack en 🫙 Which Jar? (2026-11-05, Game Week):
// inschrijving (dezelfde als Hold/Says), ranglijst van vandaag + gisteren, klok tot 20:00, pogingen per dag,
// en de tekenhulpjes uit het prototype (Squeeze met ogen/mond, tekstwolkjes van Pinchy en Squeeze, geluidjes).
(function () {
  "use strict";
  const C = window.SQUEEZE_CONFIG || {};
  const API = (C.WORKER_URL || "").replace(/\/$/, "");
  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const ME_KEY = "squeeze-hold-me"; // dezelfde inschrijving als bij Hold en Says
  const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

  // 🤫 de nieuwe spellen blijven geheim tot de Game Week start (vr 6 nov 2026 20:00 CET). Testen kan met ?test=1.
  const REVEAL = Date.UTC(2026, 10, 6, 19);
  const testing = /[?&]test=1\b/.test(location.search);
  window.SqzOpen = () => testing || Date.now() >= REVEAL;

  function loadMe() {
    try {
      const m = JSON.parse(localStorage.getItem(ME_KEY) || "null");
      return m && HANDLE_RE.test(m.handle) && WALLET_RE.test(m.wallet) ? m : null;
    } catch {
      return null;
    }
  }

  // ---------- 🎮 pogingen per dag (ook gebruikt op Hold en Says via data-game) ----------
  function triesText(t) {
    if (!t || !t.limit) return ""; // geen grens (of nog geheim) = niets tonen
    if (t.unlimited) return t.nft ? "🥚 Squeeze Squad NFT holder: unlimited tries" : "";
    if (t.left <= 0) return `🎮 You used your ${t.limit} tries for today. You can still practice · NFT holders play unlimited 🥚`;
    return `🎮 ${t.left} of ${t.limit} tries left today · NFT holders play unlimited 🥚`;
  }
  function paintTries(t) {
    const p = document.getElementById("tries-line");
    if (!p) return;
    const txt = loadMe() ? triesText(t) : "";
    p.textContent = txt;
    p.hidden = !txt;
  }
  async function loadTries(game) {
    const me = loadMe();
    if (!API || !me) return paintTries(null);
    try {
      const d = await (await fetch(API + "/tries?handle=" + encodeURIComponent(me.handle), { cache: "no-store" })).json();
      paintTries(d && d.games ? d.games[game] : null);
    } catch {}
  }
  window.SqzTries = { paint: paintTries, load: loadTries, text: triesText };
  // Hold/Says: <script src="play/minigame.js" data-game="hold"> zet alleen de pogingen-regel
  const tag = document.currentScript;
  const tagGame = tag && tag.dataset ? tag.dataset.game : "";
  if (tagGame) {
    const go = () => loadTries(tagGame);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
    setInterval(go, 15000);
    addEventListener("focus", go);
  }

  // ---------- de pagina: inschrijving, bord, klok ----------
  window.SqzMini = function (game) {
    if (!window.SqzOpen()) { // nog dicht: niets laten zien, om 20:00 vanzelf open
      document.body.innerHTML = '<div class="seabg" aria-hidden="true"></div><header class="top"><a class="back" href="games.html">← All games</a><h1>Coming soon 👀</h1><p class="sub">Nothing to see here yet.</p></header>';
      const t = setInterval(() => { if (Date.now() >= REVEAL) { clearInterval(t); location.reload(); } }, 15000);
      throw new Error("not open yet");
    }
    const $ = (id) => document.getElementById(id);
    const el = {
      clock: $("clock"), closeLocal: $("close-local"), board: $("board"), last: $("last"),
      form: $("me-form"), handle: $("me-handle"), wallet: $("me-wallet"), saved: $("me-saved"),
      name: $("me-name"), edit: $("me-edit"), err: $("me-err"),
    };
    let me = loadMe();
    let lastRows = [];
    let closesAt = 0;
    let serverOffset = 0;

    async function post(path, body) {
      const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "error");
      return d;
    }
    function showErr(text) {
      el.err.textContent = text;
      el.err.hidden = !text;
    }
    function browserBlocked() {
      showErr("⚠️ Your browser blocked the human check, so this run won't count. Open " + location.host + location.pathname + " in Chrome or Safari to get on the leaderboard.");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "📋 Copy link";
      b.style.cssText = "margin-left:.5rem;padding:.15rem .6rem;border-radius:999px;border:1px solid currentColor;background:none;color:inherit;font:inherit;cursor:pointer";
      b.onclick = () => { try { navigator.clipboard.writeText(location.origin + location.pathname); b.textContent = "✅ Copied"; } catch {} };
      el.err.appendChild(b);
    }
    function paintMe() {
      el.form.hidden = !!me;
      el.saved.hidden = !me;
      if (me) el.name.textContent = "@" + me.handle;
    }
    function autoSave() {
      if (me) return true;
      const handle = el.handle.value.trim().replace(/^@/, "");
      const wallet = el.wallet.value.trim();
      if (!HANDLE_RE.test(handle) || !WALLET_RE.test(wallet)) return false;
      me = { handle, wallet };
      try { localStorage.setItem(ME_KEY, JSON.stringify(me)); } catch {}
      paintMe();
      return true;
    }
    el.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const handle = el.handle.value.trim().replace(/^@/, "");
      const wallet = el.wallet.value.trim();
      if (!HANDLE_RE.test(handle)) return showErr("X handle: 1–15 letters, numbers or _ (without @).");
      if (!WALLET_RE.test(wallet)) return showErr("That doesn't look like a Solana address.");
      me = { handle, wallet };
      localStorage.setItem(ME_KEY, JSON.stringify(me));
      showErr("");
      paintMe();
      paintList(el.board, lastRows, true);
      loadTries(game);
    });
    el.edit.addEventListener("click", () => {
      el.handle.value = me ? me.handle : "";
      el.wallet.value = me ? me.wallet : "";
      me = null;
      localStorage.removeItem(ME_KEY);
      paintMe();
      paintTries(null);
    });

    // 🧑 mens-check VOORAF (zoals Hold, 2026-11-06: Danie op Safari): bij het laden en na elke run alvast een token halen,
    // zodat Cloudflare tijd heeft (en een eventueel vinkje kan tonen) vóór je op Start tikt. Een token is 5 min geldig en maar 1x bruikbaar.
    let tsCache = null;
    function prefetchHuman() {
      if (!API || !window.SqzHuman || !window.SqzHuman.enabled || tsCache) return;
      tsCache = { at: Date.now(), p: window.SqzHuman.token().catch(() => null) };
    }
    async function humanToken(fresh) {
      if (!window.SqzHuman) return null;
      const c = tsCache;
      tsCache = null;
      if (!fresh && c && Date.now() - c.at < 240000) { const t = await c.p; if (t) return t; }
      return window.SqzHuman.token();
    }
    // een run beginnen bij de server: { sid, ranked } · { local: true } (geen server = oefenen) · { paused: true }
    async function start() {
      showErr("");
      if (!API) return { local: true };
      autoSave();
      try {
        const go = async (fresh) => post("/" + game + "/start", me ? { handle: me.handle, wallet: me.wallet, turnstile: await humanToken(fresh) } : {});
        let d = await go(false);
        if (d.human === false) d = await go(true); // mens-check mislukt: één keer opnieuw, met een verse check
        if (d.tries) paintTries(d.tries);
        if (d.human === false) browserBlocked();
        else if (!d.ranked) showErr(me && d.tries && d.tries.limit && !d.tries.unlimited && d.tries.left <= 0
          ? `You used your ${d.tries.limit} tries for today, so this is a practice run. Squeeze Squad NFT holders play unlimited 🥚`
          : "Practice run. Save your X handle and wallet to enter the leaderboard.");
        return d;
      } catch (e) {
        if (String(e && e.message).includes("paused")) return { paused: true };
        showErr("Leaderboard offline. Practice run.");
        return { local: true };
      }
    }
    // na een run: fout tonen, pogingen bijwerken, bord verversen
    function after(score, res, ranked) {
      if (res && res.error) showErr(`⚠️ Your run of ${score} wasn't saved: ` + cap(res.error) + ".");
      if (res && res.tries) paintTries(res.tries);
      if (ranked) refresh();
      setTimeout(prefetchHuman, 0); // mens-check voor de volgende run alvast
    }

    function paintList(ol, rows, mark) {
      ol.textContent = "";
      if (!rows || !rows.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "No scores yet.";
        ol.appendChild(li);
        return;
      }
      rows.forEach((r, i) => {
        const li = document.createElement("li");
        if (i < 3) li.classList.add("top5");
        if (mark && me && r.handle.toLowerCase() === me.handle.toLowerCase()) li.classList.add("me");
        const n = document.createElement("b");
        n.textContent = "@" + r.handle; // altijd als tekst
        const s = document.createElement("span");
        s.className = "score";
        s.textContent = r.score;
        if (r.nc) { li.classList.add("nc"); const w = document.createElement("small"); w.className = "nc-tag"; w.textContent = " ⚠️ not counted"; n.appendChild(w); } // 🚫 verdacht: geen prijs
        li.append(n, s);
        ol.appendChild(li);
      });
    }
    async function refresh() {
      if (!API) return paintList(el.board, [], false);
      try {
        const d = await (await fetch(API + "/" + game, { cache: "no-store" })).json();
        serverOffset = (d.now || Date.now()) - Date.now();
        closesAt = d.closesAt || 0;
        lastRows = d.top || [];
        paintList(el.board, lastRows, true);
        paintList(el.last, d.lastTop || [], false);
        if (closesAt) {
          let tz = "CET";
          try {
            const part = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", timeZoneName: "short" }).formatToParts(new Date(closesAt)).find((x) => x.type === "timeZoneName");
            if (part && /^CES?T$/.test(part.value)) tz = part.value;
          } catch {}
          const label = "8:00 PM " + tz;
          document.querySelectorAll(".tz").forEach((n) => (n.textContent = label));
          const local = new Date(closesAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          el.closeLocal.textContent = `Closes daily at ${label} (${local} your time).`;
        }
      } catch {}
    }
    function tickClock() {
      if (closesAt) {
        const ms = closesAt - (Date.now() + serverOffset);
        if (ms <= 0) {
          el.clock.textContent = "Closing…";
          if (ms < -3000 && !tickClock.busy) { tickClock.busy = true; refresh().finally(() => (tickClock.busy = false)); }
        } else {
          const s = Math.floor(ms / 1000);
          el.clock.textContent = `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
        }
      }
      requestAnimationFrame(tickClock);
    }

    paintMe();
    refresh();
    loadTries(game);
    setTimeout(prefetchHuman, 800); // mens-check alvast, vóór de eerste Start
    setInterval(refresh, 20000);
    requestAnimationFrame(tickClock);
    return { API, post, start, after, refresh, showErr, get me() { return me; } };
  };

  // ---------- tekenen (uit het prototype) ----------
  window.SqzGfx = function (cv) {
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const GREEN = "#7cff6b";
    const img = (s) => { const i = new Image(); i.src = s; return i; };
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
    const text = (t, x, y, size = 30, col = "#f3f7f2", align = "center") => {
      ctx.font = `800 ${size}px "Bricolage Grotesque", system-ui`; ctx.fillStyle = col; ctx.textAlign = align; ctx.fillText(t, x, y);
    };
    const drawImg = (im, x, y, w, flip) => {
      if (!im.complete || !im.naturalWidth) return;
      const h = (w * im.naturalHeight) / im.naturalWidth;
      ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
    };
    // de echte Squeeze (lichaam + ogen + mond, zoals squeeze.js); x, y = midden-onderkant, w = breedte
    const SQ = {
      body: img("assets/octo.png"),
      eyes: { happy: img("assets/eyes_happy.png"), neutral: img("assets/eyes_neutral.png"), sad: img("assets/eyes_sad.png") },
      mouth: { happy: img("assets/mouth_happy.png"), neutral: img("assets/mouth_neutral.png"), sad: img("assets/mouth_sad.png") },
    };
    const EYE_FY = { happy: 0.688, neutral: 0.677, sad: 0.724 };
    const squeezeAt = (x, y, w, mood = "happy", sq = 0, blink = 0) => {
      const B = SQ.body; if (!B.complete || !B.naturalWidth) return;
      const h = (w * B.naturalHeight) / B.naturalWidth;
      ctx.save(); ctx.translate(x, y); ctx.scale(1 + sq * 0.18, 1 - sq * 0.22); ctx.translate(-w / 2, -h);
      ctx.drawImage(B, 0, 0, w, h);
      const E = SQ.eyes[mood], M = SQ.mouth[mood];
      if (E.complete && E.naturalWidth) {
        const ew = w * 0.257, eh = (ew * E.naturalHeight) / E.naturalWidth, ky = Math.max(0.06, 1 - 0.9 * blink);
        ctx.save(); ctx.translate(w / 2, h * 0.225); ctx.scale(1, ky); ctx.drawImage(E, -ew / 2, -eh * (1 - EYE_FY[mood]), ew, eh); ctx.restore();
      }
      if (M.complete && M.naturalWidth) { const mw = w * 0.101, mh = (mw * M.naturalHeight) / M.naturalWidth; ctx.drawImage(M, w / 2 - mw / 2, h * 0.401 - mh / 2, mw, mh); }
      ctx.restore();
    };
    // 💬 tekstwolkjes (Pinchy oranje, Squeeze wit)
    let bubbles = [];
    const say = (who, t, x, y, ms = 1500) => { bubbles = bubbles.filter((b) => b.who !== who); bubbles.push({ who, t, x, y, until: performance.now() + ms }); };
    const clearBubbles = () => { bubbles = []; };
    const drawBubbles = (now) => {
      bubbles = bubbles.filter((b) => b.until > now);
      for (const b of bubbles) {
        ctx.font = `800 20px "Bricolage Grotesque", system-ui`;
        const w = Math.min(320, ctx.measureText(b.t).width + 24), x = Math.max(8, Math.min(W - w - 8, b.x - w / 2));
        rr(x, b.y - 22, w, 36, 12); ctx.fillStyle = b.who === "pinchy" ? "#ff8a5c" : "#f3f7f2"; ctx.fill();
        text(b.t, x + w / 2, b.y + 3, 20, b.who === "pinchy" ? "#3a0d00" : "#05230a");
      }
    };
    // 🔊 kleine geluidjes (WebAudio, geen bestanden)
    let muted = localStorage.getItem("sqz-mute") === "1", actx = null;
    const beep = (freq, ms = 90, type = "sine", vol = 0.12, slide = 0) => {
      if (muted) return;
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + ms / 1000);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
      } catch {}
    };
    const muteBtn = document.getElementById("mute");
    if (muteBtn) {
      muteBtn.textContent = muted ? "🔇" : "🔊";
      muteBtn.addEventListener("click", () => { muted = !muted; localStorage.setItem("sqz-mute", muted ? "1" : "0"); muteBtn.textContent = muted ? "🔇" : "🔊"; });
    }
    const pickOne = (a) => a[(Math.random() * a.length) | 0];
    return { ctx, W, H, GREEN, img, rr, text, drawImg, squeezeAt, say, clearBubbles, drawBubbles, beep, pickOne, CRAB: img("assets/friends/crab.png") };
  };
})();
