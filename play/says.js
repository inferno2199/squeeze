// Squeeze Says — kijk welke vriendjes oplichten en tik ze in dezelfde volgorde na.
// Veilig: de server kiest elke ronde een nieuwe volgorde en rekent de punten uit.
(function () {
  "use strict";

  const C = window.SQUEEZE_CONFIG || {};
  const API = (C.WORKER_URL || "").replace(/\/$/, "");
  let PRIZES = Array.isArray(C.SAYS_PRIZES) && C.SAYS_PRIZES.length
    ? C.SAYS_PRIZES
    : [500000, 250000, 100000, 50000, 50000];

  // 8 vriendjes in een kring rond Squeeze (hoek in graden: 0 = rechts, 90 = omlaag)
  const FRIENDS = [
    { k: "fish", ang: -140 },
    { k: "jelly", ang: -40 },
    { k: "crab", ang: 180 },
    { k: "dolphin", ang: 0 },
    { k: "seal", ang: 143 },
    { k: "whale", ang: 37 },
    { k: "lobster", ang: 108 },
    { k: "shrimp", ang: 72 },
  ];
  const RX = 0.4;
  const RY = 0.39;
  const START_LEN = 3;

  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const ME_KEY = "squeeze-hold-me"; // dezelfde inschrijving als bij Hold

  const $ = (id) => document.getElementById(id);
  const el = {
    stage: $("stage"), wrap: $("stage-wrap"), tiles: $("tiles"), toast: $("toast"), status: $("status"),
    score: $("score"), round: $("round"), start: $("start"),
    badge: $("best-badge"), bestToday: $("best-today"), bestAll: $("best-all"),
    friend: $("friend"), friendImg: $("friend-img"), friendText: $("friend-text"),
    clock: $("clock"), closeLocal: $("close-local"), board: $("board"), last: $("last"),
    form: $("me-form"), handle: $("me-handle"), wallet: $("me-wallet"), saved: $("me-saved"),
    name: $("me-name"), edit: $("me-edit"), err: $("me-err"),
  };

  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sq = new window.Squeeze(el.stage, { reducedMotion: reduced });
  sq.load().then(() => {
    sq.setRings(0);
    sq.setPrice(0.3);
    sq.start();
  });

  // ---------- tegels ----------
  const tiles = FRIENDS.map((f, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tile";
    b.setAttribute("aria-label", f.k);
    const a = (f.ang * Math.PI) / 180;
    b.style.left = (50 + Math.cos(a) * RX * 100).toFixed(2) + "%";
    b.style.top = (50 + Math.sin(a) * RY * 100).toFixed(2) + "%";
    const img = document.createElement("img");
    img.src = "assets/friends/" + f.k + ".png";
    img.alt = "";
    img.draggable = false;
    b.appendChild(img);
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      tap(i);
    });
    el.tiles.appendChild(b);
    return b;
  });
  function lightUp(i, ms) {
    const t = tiles[i];
    t.classList.add("lit");
    setTimeout(() => t.classList.remove("lit"), ms);
    const f = FRIENDS[i];
    const a = (f.ang * Math.PI) / 180;
    sq.pointAt(Math.cos(a), Math.sin(a), ms / 1000 + 0.15);
  }
  function setTilesEnabled(on) {
    el.tiles.classList.toggle("off", !on);
  }

  // ---------- spelstaat ----------
  let phase = "idle"; // idle | show | input | wait
  let sid = null;
  let ranked = false;
  let seq = [];
  let taps = [];
  let round = 0;
  let score = 0;
  let localMode = false; // geen server: oefenen zonder ranglijst
  let me = loadMe();
  let bestToday = 0;
  let bestAll = 0;
  let newBestShown = false;
  let today = "";
  let closesAt = 0;
  let serverOffset = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function post(path, body) {
    const r = await fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "error");
    return d;
  }

  async function startRun() {
    if (phase !== "idle") return;
    phase = "wait";
    el.start.disabled = true;
    el.start.textContent = "…";
    score = 0;
    round = 0;
    newBestShown = false;
    paintStats();
    showErr("");
    localMode = !API;
    if (!localMode) {
      try {
        const d = await post("/says/start", me ? { handle: me.handle, wallet: me.wallet } : {});
        sid = d.sid;
        ranked = d.ranked;
        if (!ranked) showErr("Practice run. Save your X handle and wallet to enter the leaderboard.");
      } catch (e) {
        if (String(e && e.message).includes("paused")) {
          showErr("");
          status("Squeeze Says is paused for a moment. Try again soon. 🐙");
          return endUi();
        }
        localMode = true;
      }
    }
    if (localMode) showErr("Leaderboard offline. Practice run.");
    nextRound();
  }

  async function nextRound() {
    phase = "wait";
    setTilesEnabled(false);
    let step;
    if (localMode) {
      round++;
      const len = START_LEN + round - 1;
      seq = Array.from({ length: len }, () => (Math.random() * FRIENDS.length) | 0);
      step = Math.max(320, 760 - (round - 1) * 45);
    } else {
      try {
        const d = await post("/says/round", { sid });
        round = d.round;
        seq = d.seq;
        step = d.step;
      } catch (e) {
        status("Connection lost. Press start to play again.");
        return endUi();
      }
    }
    paintStats();
    // tonen
    phase = "show";
    status("Watch…");
    await sleep(500);
    for (const i of seq) {
      lightUp(i, step * 0.68);
      await sleep(step);
    }
    // jouw beurt
    taps = [];
    phase = "input";
    setTilesEnabled(true);
    status(`Your turn · 0 / ${seq.length}`);
  }

  function tap(i) {
    if (phase !== "input") return;
    lightUp(i, 220);
    taps.push(i);
    const pos = taps.length - 1;
    if (taps[pos] !== seq[pos]) return finishRound(false);
    status(`Your turn · ${taps.length} / ${seq.length}`);
    if (taps.length === seq.length) finishRound(true);
  }

  async function finishRound(okLocal) {
    phase = "wait";
    setTilesEnabled(false);
    let res;
    if (localMode) {
      res = okLocal ? { correct: true, gained: seq.length * 10, score: score + seq.length * 10 } : { correct: false, score };
    } else {
      try {
        res = await post("/says/answer", { sid, taps });
      } catch (e) {
        status("Couldn't check your answer. Press start to play again.");
        return endUi();
      }
    }
    if (res.correct) {
      score = res.score;
      paintStats();
      sq.buyPulse(1);
      sq.pop = 0.6;
      sq.setPrice(Math.min(0.95, 0.35 + round * 0.06));
      if (!newBestShown && bestToday > 0 && score > bestToday) {
        newBestShown = true;
        toast(`New best! ${score}`, "good");
      } else {
        toast(`+${res.gained}`, "good");
      }
      status("Nice!");
      await sleep(850);
      return nextRound();
    }
    // fout: laat de juiste volgorde zien
    const record = score > 0 && score > bestToday;
    status(record ? `New high score: ${score}!` : `Wrong friend. Run over · ${score}`);
    toast(record ? `New high score: ${score}` : `Run over · ${score}`, record ? "good" : "bad");
    sq.flinch = 1;
    sq.setPrice(record ? 0.7 : -0.6);
    const right = res.seq || seq;
    const wrongAt = taps.length - 1;
    if (right[wrongAt] != null) {
      tiles[right[wrongAt]].classList.add("hint");
      setTimeout(() => tiles[right[wrongAt]].classList.remove("hint"), 1400);
    }
    celebrate(score);
    if (res.error) showErr(res.error.charAt(0).toUpperCase() + res.error.slice(1) + ".");
    else if (ranked && res.rank && res.rank <= 5) setTimeout(() => toast(`You're #${res.rank} today!`, "good"), 1600);
    if (res.best != null) setBest(res.best);
    if (!localMode && ranked) refresh();
    setTimeout(() => sq.setPrice(0.3), record ? 3200 : 1600);
    endUi();
  }

  function endUi() {
    phase = "idle";
    sid = null;
    el.start.disabled = false;
    el.start.textContent = "Play again";
    setTilesEnabled(true);
  }

  function paintStats() {
    el.score.textContent = score;
    el.round.textContent = round || "–";
  }
  function status(t) {
    el.status.textContent = t;
  }
  let toastT = 0;
  function toast(text, kind) {
    el.toast.textContent = text;
    el.toast.className = "toast show " + (kind || "");
    clearTimeout(toastT);
    toastT = setTimeout(() => (el.toast.className = "toast"), 1500);
  }

  el.start.addEventListener("click", startRun);

  // ---------- high scores + feliciterend vriendje ----------
  function dayKeyLocal() {
    return today || new Date().toISOString().slice(0, 10);
  }
  function paintBest() {
    el.bestToday.textContent = bestToday;
    el.bestAll.textContent = bestAll;
  }
  function setBest(v) {
    if (v > bestToday) {
      bestToday = v;
      localStorage.setItem("squeeze-says-best-" + dayKeyLocal(), String(bestToday));
    }
    if (v > bestAll) {
      bestAll = v;
      localStorage.setItem("squeeze-says-alltime", String(bestAll));
    }
    paintBest();
  }
  const CHEER = [
    { k: "jelly", line: "New high score!" },
    { k: "dolphin", line: "What a memory!" },
    { k: "seal", line: "New high score! 👏" },
    { k: "whale", line: "A whale of a score!" },
    { k: "crab", line: "Okay, that's a new best." },
    { k: "fish", line: "You remembered us all!" },
    { k: "lobster", line: "Fancy! New best!" },
    { k: "shrimp", line: "Tiny me, big score!" },
    { k: "shark", line: "Even I'm impressed." },
  ];
  let friendT = 0;
  function celebrate(v) {
    if (v <= 0) return;
    const wasToday = bestToday;
    const wasAll = bestAll;
    setBest(v);
    if (v <= wasToday) return;
    const allTime = v > wasAll && wasAll > 0;
    const n = Number(localStorage.getItem("squeeze-says-friend") || 0);
    const f = CHEER[n % CHEER.length];
    localStorage.setItem("squeeze-says-friend", String(n + 1));
    el.friendImg.src = "assets/friends/" + f.k + ".png";
    el.friendText.textContent = allTime ? `New all-time best! ${v} 🏆` : `${f.line} ${v} 🎉`;
    el.friend.hidden = false;
    el.friend.className = "friend " + (n % 2 === 0 ? "from-right" : "from-left");
    void el.friend.offsetWidth;
    el.badge.classList.remove("pulse");
    void el.badge.offsetWidth;
    el.badge.classList.add("pulse");
    sq.euphoria(2.5);
    clearTimeout(friendT);
    friendT = setTimeout(() => (el.friend.hidden = true), 3500);
  }

  // ---------- inschrijving (gedeeld met Hold) ----------
  function loadMe() {
    try {
      const m = JSON.parse(localStorage.getItem(ME_KEY) || "null");
      return m && HANDLE_RE.test(m.handle) && WALLET_RE.test(m.wallet) ? m : null;
    } catch {
      return null;
    }
  }
  function paintMe() {
    el.form.hidden = !!me;
    el.saved.hidden = !me;
    if (me) el.name.textContent = "@" + me.handle;
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
    paintList(el.board, lastRows, true);
  });
  el.edit.addEventListener("click", () => {
    el.handle.value = me ? me.handle : "";
    el.wallet.value = me ? me.wallet : "";
    me = null;
    localStorage.removeItem(ME_KEY);
    paintMe();
  });

  // ---------- prijzen ----------
  function fmtTokens(n) {
    if (n >= 1e6) return +(n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return +(n / 1e3).toFixed(1) + "k";
    return String(n);
  }
  function paintPrizes() {
    document.querySelectorAll("#says-prizes li span").forEach((s, i) => {
      s.textContent = PRIZES[i] != null ? fmtTokens(Number(PRIZES[i])) : "–";
    });
  }
  paintPrizes();
  // de bedragen stel je in via de bot (/prizes); die gaan voor
  if (API) {
    fetch(API + "/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.saysPrizes) && d.saysPrizes.length) {
          PRIZES = d.saysPrizes;
          paintPrizes();
        }
      })
      .catch(() => {});
  }

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
      n.textContent = "@" + r.handle; // altijd als tekst
      const s = document.createElement("span");
      s.className = "score";
      s.textContent = r.score;
      li.append(n, s);
      ol.appendChild(li);
    });
  }
  async function refresh() {
    if (!API) {
      paintList(el.board, [], false);
      return;
    }
    try {
      const r = await fetch(API + "/says", { cache: "no-store" });
      const d = await r.json();
      serverOffset = (d.now || Date.now()) - Date.now();
      closesAt = d.closesAt || 0;
      if (d.day && d.day !== today) {
        today = d.day;
        bestToday = Number(localStorage.getItem("squeeze-says-best-" + today) || 0);
        paintBest();
      }
      lastRows = d.top || [];
      paintList(el.board, lastRows, true);
      paintList(el.last, d.lastTop || [], false);
      if (me) {
        const mine = lastRows.find((x) => x.handle.toLowerCase() === me.handle.toLowerCase());
        if (mine) setBest(mine.score);
      }
      if (closesAt) {
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
    if (closesAt) {
      const ms = closesAt - (Date.now() + serverOffset);
      if (ms <= 0) {
        el.clock.textContent = "Closing…";
        if (ms < -3000 && !tickClock.busy) {
          tickClock.busy = true;
          refresh().finally(() => (tickClock.busy = false));
        }
      } else {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        el.clock.textContent = `${h}h ${String(m).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
      }
    }
    requestAnimationFrame(tickClock);
  }

  bestAll = Number(localStorage.getItem("squeeze-says-alltime") || 0);
  bestToday = Number(localStorage.getItem("squeeze-says-best-" + dayKeyLocal()) || 0);
  paintBest();
  paintMe();
  paintStats();
  refresh();
  setInterval(refresh, 20000);
  requestAnimationFrame(tickClock);
})();
