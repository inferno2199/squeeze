// Squeeze Hold — houd vast, laat los vlak voordat hij knapt.
// Eerlijk: de druk loopt op TIJD (niet per beeldje), dus elke telefoon is even snel.
// Veilig: we sturen alleen de vasthoud-tijden; de server rekent de score zelf uit.
(function () {
  "use strict";

  const C = window.SQUEEZE_CONFIG || {};
  const API = (C.WORKER_URL || "").replace(/\/$/, "");

  // moet gelijk zijn aan de server (worker.js, HOLD)
  const RATE0 = 0.42;
  const RATE_UP = 1.4;
  const EASE = 1.6; // de balk versnelt binnen een ronde
  const RATE_MAX = 3.3;
  const MAX_COMBO = 9;
  const MIN_HOLD = 80;

  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const ME_KEY = "squeeze-hold-me";

  const $ = (id) => document.getElementById(id);
  const el = {
    stage: $("stage"), wrap: $("stage-wrap"), fill: $("fill"), toast: $("toast"),
    run: $("run"), combo: $("combo"), best: $("best"), hold: $("hold"),
    clock: $("clock"), closeLocal: $("close-local"), board: $("board"), last: $("last"),
    form: $("me-form"), handle: $("me-handle"), wallet: $("me-wallet"), saved: $("me-saved"),
    name: $("me-name"), edit: $("me-edit"), err: $("me-err"), prizeWallet: $("prize-wallet"),
  };

  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sq = new window.Squeeze(el.stage, { reducedMotion: reduced });

  // ---------- spelstaat ----------
  let rate = RATE0;
  let combo = 1;
  let run = 0;
  let rounds = [];     // vasthoud-tijden (ms) van deze run
  let holding = false;
  let holdStart = 0;
  let pressure = 0;
  let sid = null;      // sessie van deze run (van de server)
  let sidPromise = null;
  let me = loadMe();
  let serverOffset = 0; // server-tijd minus eigen klok
  let closesAt = 0;
  let today = "";

  function pressureAt(h) {
    // nooit negatief (het eerste beeldje kan net vóór het indrukken getekend zijn)
    const x = Math.max(0, Math.min(1, (rate * Math.max(0, h)) / 1000));
    return Math.pow(x, EASE);
  }
  function points(p) {
    if (p >= 1 || p < 0.75) return 0;
    if (p < 0.85) return 1;
    if (p < 0.93) return 2;
    return 3;
  }

  // ---------- Squeeze ----------
  sq.load().then(() => {
    sq.setRings(0);
    sq.setPrice(0.3);
    sq.start();
  });
  function moodFor() {
    return clamp(0.25 + (combo - 1) * 0.08, -1, 0.95);
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // ---------- vasthouden en loslaten ----------
  function startSession() {
    if (!API) return null;
    sidPromise = fetch(API + "/hold/start", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (sid = d && d.sid ? d.sid : null))
      .catch(() => (sid = null));
    return sidPromise;
  }

  function press() {
    if (holding) return;
    // eerste ronde van een nieuwe run: sessie ophalen
    if (rounds.length === 0 && !sidPromise) startSession();
    holding = true;
    holdStart = performance.now();
    el.hold.classList.add("down");
    el.hold.textContent = "Let go…";
  }

  function release() {
    if (!holding) return;
    holding = false;
    el.hold.classList.remove("down");
    el.hold.textContent = "Hold";
    const h = performance.now() - holdStart;
    sq.setSqueeze(null);
    if (h < MIN_HOLD) {
      pressure = 0;
      return; // per ongeluk getikt: telt niet
    }
    finishRound(h, false);
  }

  function finishRound(h, popped) {
    rounds.push(Math.round(h));
    const p = pressureAt(h);
    const pts = popped ? 0 : points(p);
    if (pts > 0) {
      const gain = pts * combo;
      run += gain;
      combo = Math.min(MAX_COMBO, combo + 1);
      rate = Math.min(RATE_MAX, rate * RATE_UP);
      toast(`+${gain}  ·  ${Math.round(p * 100)}%${pts === 3 ? "  ·  risky!" : ""}`, "good");
      sq.pop = 0.5 + pts * 0.18;
      sq.buyPulse(1);
      if (pts === 3) sq.euphoria(1.2);
      sq.setPrice(moodFor());
    } else {
      if (popped) {
        toast(`POP! Run over · ${run}`, "bad");
        sq.inkBurst();
        sq.flinch = 1;
        sq.setPrice(-0.8);
      } else {
        toast(`Too early (${Math.round(p * 100)}%) · Run over · ${run}`, "bad");
        sq.flinch = 0.6;
        sq.setPrice(-0.4);
      }
      endRun();
      setTimeout(() => sq.setPrice(0.3), 1600);
    }
    pressure = 0;
    paintStats();
  }

  function endRun() {
    const done = { score: run, rounds: rounds.slice() };
    const mySid = sid;
    const myPromise = sidPromise;
    rate = RATE0;
    combo = 1;
    run = 0;
    rounds = [];
    sid = null;
    sidPromise = null;
    if (done.score > 0) submit(done, mySid, myPromise);
  }

  async function submit(done, mySid, myPromise) {
    if (!API) return;
    if (!me) {
      showErr("Save your X handle and wallet to enter today's leaderboard.");
      return;
    }
    if (!mySid && myPromise) mySid = await myPromise;
    if (!mySid) {
      showErr("Couldn't reach the leaderboard. Your next run will try again.");
      return;
    }
    try {
      const r = await fetch(API + "/hold/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sid: mySid, handle: me.handle, wallet: me.wallet, rounds: done.rounds }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        showErr(d.error ? cap(d.error) + "." : "Couldn't save this run.");
        return;
      }
      showErr("");
      if (d.best != null) el.best.textContent = d.best;
      if (d.rank && d.rank <= 5) toast(`You're #${d.rank} today!`, "good");
      refresh();
    } catch {
      showErr("Couldn't reach the leaderboard.");
    }
  }

  // ---------- elk beeldje ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (holding) {
      pressure = pressureAt(performance.now() - holdStart);
      sq.setSqueeze(pressure * 0.95);
      if (pressure >= 1) {
        // te lang: knap!
        holding = false;
        el.hold.classList.remove("down");
        el.hold.textContent = "Hold";
        sq.setSqueeze(null);
        finishRound(now - holdStart, true);
      }
    } else {
      pressure = Math.max(0, pressure - dt * 3);
    }
    el.fill.style.width = (pressure * 100).toFixed(1) + "%";
    el.fill.classList.toggle("danger", pressure >= 0.93);
    tickClock();
    requestAnimationFrame(frame);
  }

  function paintStats() {
    el.run.textContent = run;
    el.combo.textContent = "x" + combo;
  }

  let toastT = 0;
  function toast(text, kind) {
    el.toast.textContent = text;
    el.toast.className = "toast show " + (kind || "");
    clearTimeout(toastT);
    toastT = setTimeout(() => (el.toast.className = "toast"), 1500);
  }
  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- invoer: knop, het octopus-podium, of spatie ----------
  function bindHold(target) {
    target.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      try {
        target.setPointerCapture(e.pointerId);
      } catch {}
      press();
    });
    target.addEventListener("pointerup", release);
    target.addEventListener("pointercancel", release);
    target.addEventListener("lostpointercapture", release);
    target.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  bindHold(el.hold);
  bindHold(el.wrap);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      press();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") release();
  });
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", () => document.hidden && release());

  // ---------- jouw inschrijving ----------
  function loadMe() {
    try {
      const m = JSON.parse(localStorage.getItem(ME_KEY) || "null");
      return m && HANDLE_RE.test(m.handle) && WALLET_RE.test(m.wallet) ? m : null;
    } catch {
      return null;
    }
  }
  function paintMe() {
    if (me) {
      el.form.hidden = true;
      el.saved.hidden = false;
      el.name.textContent = "@" + me.handle;
    } else {
      el.form.hidden = false;
      el.saved.hidden = true;
    }
  }
  function showErr(text) {
    el.err.textContent = text;
    el.err.hidden = !text;
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
    paintBoardMe();
  });
  el.edit.addEventListener("click", () => {
    el.handle.value = me ? me.handle : "";
    el.wallet.value = me ? me.wallet : "";
    me = null;
    localStorage.removeItem(ME_KEY);
    paintMe();
  });

  // ---------- ranglijst ----------
  let lastRows = [];
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
      if (i < 5) li.classList.add("top5");
      if (mark && me && r.handle.toLowerCase() === me.handle.toLowerCase()) li.classList.add("me");
      const n = document.createElement("b");
      n.textContent = "@" + r.handle; // altijd als tekst, nooit als HTML
      const s = document.createElement("span");
      s.className = "score";
      s.textContent = r.score;
      li.append(n, s);
      ol.appendChild(li);
    });
  }
  function paintBoardMe() {
    paintList(el.board, lastRows, true);
    if (me) {
      const mine = lastRows.find((r) => r.handle.toLowerCase() === me.handle.toLowerCase());
      if (mine) el.best.textContent = mine.score;
    }
  }
  async function refresh() {
    if (!API) {
      el.board.textContent = "";
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Leaderboard offline.";
      el.board.appendChild(li);
      return;
    }
    try {
      const r = await fetch(API + "/hold", { cache: "no-store" });
      const d = await r.json();
      serverOffset = (d.now || Date.now()) - Date.now();
      closesAt = d.closesAt || 0;
      today = d.day || "";
      lastRows = d.top || [];
      paintBoardMe();
      paintList(el.last, d.lastTop || [], false);
      paintMe();
      if (closesAt) {
        // CET in de winter, CEST in de zomer (Amsterdamse tijd)
        let tz = "CET";
        try {
          const part = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", timeZoneName: "short" })
            .formatToParts(new Date(closesAt))
            .find((x) => x.type === "timeZoneName");
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
    if (!closesAt) return;
    let ms = closesAt - (Date.now() + serverOffset);
    if (ms <= 0) {
      el.clock.textContent = "Closing…";
      if (ms < -3000 && !tickClock.busy) {
        tickClock.busy = true;
        refresh().finally(() => (tickClock.busy = false));
      }
      return;
    }
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    el.clock.textContent = `${h}h ${String(m).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
  }

  // prijzen-wallet (optioneel in config.js: PRIZE_WALLET)
  if (el.prizeWallet) {
    const pw = String(C.PRIZE_WALLET || "");
    if (WALLET_RE.test(pw)) {
      el.prizeWallet.textContent = pw.slice(0, 6) + "…" + pw.slice(-6);
      el.prizeWallet.title = pw;
      el.prizeWallet.href = "https://solscan.io/account/" + pw;
    } else {
      el.prizeWallet.textContent = "announced on X";
      el.prizeWallet.removeAttribute("href");
    }
  }

  paintMe();
  paintStats();
  refresh();
  setInterval(refresh, 20000);
  requestAnimationFrame(frame);
})();
