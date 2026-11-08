// 🫙 Which Jar? (Game Week, 2026-11-05): Squeeze verstopt zich in een pot, de potten schuiven, tik de goede pot.
// Veilig: elke ronde kiest de SERVER de pot en de schuifjes (pas als de ronde begint) en controleert het antwoord en de tijd.
// Zonder server (offline) = oefenen met dezelfde regels hieronder (gelijk aan wjLevel in squeeze-worker/bot/minigames.js).
(function () {
  "use strict";
  const SHOW = 1300;
  // gelijk aan wjLevel in squeeze-worker/bot/minigames.js (2026-11-08: na ronde 11 moeilijker, vanaf 25 zes potten)
  const wjLevel = (score) => {
    const extra = score > 11 ? Math.min(8, Math.floor((score - 11) / 4)) : 0;
    const dur = score <= 11 ? Math.max(200, 520 - 30 * score) : Math.max(140, 200 - 3 * (score - 11));
    return { n: score >= 25 ? 6 : score >= 7 ? 5 : score >= 3 ? 4 : 3, swaps: 4 + Math.min(10, score) + extra, dur };
  };
  function localRound(score) {
    const L = wjLevel(score);
    const r = (n) => (Math.random() * n) | 0;
    const swaps = [];
    for (let k = 0; k < L.swaps; k++) { const a = r(L.n); let b = r(L.n - 1); if (b >= a) b++; swaps.push([a, b]); }
    return { n: L.n, hidden: r(L.n), swaps, dur: L.dur, show: SHOW };
  }
  const finalOf = (hidden, swaps) => { let s = hidden; for (const [a, b] of swaps) { if (s === a) s = b; else if (s === b) s = a; } return s; };

  const mini = window.SqzMini("whichjar");
  const cv = document.getElementById("c");
  const G = window.SqzGfx(cv);
  const { ctx, W, rr, text, squeezeAt, say, beep, pickOne, GREEN } = G;
  const $score = document.getElementById("score"), $best = document.getElementById("best"), $start = document.getElementById("start");
  const P_START = ["I'll shuffle so fast 🦀", "You'll never find him!", "Pinchy's shell game 🦀"];
  const P_WRONG = ["Hehe, empty jar! 🦀", "Snip snap, he's gone! 🦀", "Pinchy wins again 👑", "Did you even blink? 😂", "Wrong jar, bestie 🦀", "My claws are too fast 😎", "Squeeze is MINE now 🦀", "Grandma would've found him 😂", "Sideways shuffle never fails", "Shell game champion 🦀", "Try again… if you dare 🦀", "Too slow, too slow 🎶"];
  const S_FOUND = ["Peekaboo! 🐙", "You found me! 🎉", "Big brain move 🧠", "Octopus eyes! 👀", "Pinchy is SO mad 😂", "Ink-credible! 🖋", "Can't hide from you!", "Okay detective 🔍", "Again! Again! 🐙", "Eight arms of applause 👏", "Nice try, Pinchy 😎", "You're on fire! 🔥"];

  let n = 3, jars = [], hidden = 0, swaps = [], queue = [], dur = 520, show = SHOW, anim = null, phase = "ready", score = 0, picked = -1, t0 = 0, correct = false;
  let crab = null; // 🦀 bij een mis loopt Pinchy naar de lege pot { x0, y0, x1, y1, t0, said }
  let sid = null, ranked = false, local = true, finished = false, busy = false, res = null;
  let best = Number(localStorage.getItem("squeeze-whichjar-best-" + new Date().toISOString().slice(0, 10)) || 0);
  $best.textContent = best;
  const slotX = (i, count) => W / 2 + (i - (count - 1) / 2) * Math.min(130, (W - 60) / count);
  const jarAtSlot = (s) => jars.findIndex((j) => j.slot === s);

  async function begin() {
    if (busy) return;
    busy = true;
    phase = "wait";
    $start.disabled = true;
    $start.textContent = "…";
    const d = await mini.start();
    busy = false;
    if (d.paused) { mini.showErr("Which Jar? is paused for a moment. Try again soon. 🐙"); phase = "ready"; return endUi(); }
    local = !!d.local; sid = d.sid || null; ranked = !!d.ranked;
    score = 0; finished = false; $score.textContent = 0;
    G.clearBubbles();
    crab = null;
    say("pinchy", pickOne(P_START), W - 110, 120, 1800);
    $start.textContent = "Playing…";
    nextRound();
  }

  async function nextRound() {
    let R;
    phase = "next"; // maar één vraag per ronde (anders vraagt step() elke frame opnieuw)
    if (local) R = localRound(score);
    else {
      try { R = await mini.post("/whichjar/round", { sid }); } catch (e) { R = null; }
      if (!R || R.error || !R.n) { mini.showErr((R && R.error) || "Connection lost. Press start to play again."); phase = "ready"; return endUi(); }
    }
    n = R.n; hidden = R.hidden; swaps = R.swaps; queue = R.swaps.slice(); dur = R.dur; show = R.show || SHOW;
    jars = Array.from({ length: n }, (_, i) => ({ slot: i }));
    picked = -1; anim = null; correct = false;
    phase = "show"; t0 = performance.now();
  }

  const PICK_MS = 10000; // ⏱ max 10 s om te kiezen (zelfde als de server, 2026-11-08)
  let slow = false;
  async function pick(x) {
    let s = 0, d = 1e9;
    for (let i = 0; i < n; i++) { const dd = Math.abs(x - slotX(i, n)); if (dd < d) { d = dd; s = i; } }
    return pickSlot(s);
  }
  async function pickSlot(s) {
    slow = s < 0;
    picked = s < 0 ? -1 : jarAtSlot(s);
    phase = "check";
    if (local) {
      correct = s === finalOf(hidden, swaps);
      res = correct ? { correct: true, score: score + 1 } : { correct: false, finished: true, score };
    } else {
      try { res = await mini.post("/whichjar/answer", { sid, slot: s }); } catch (e) { res = { correct: false, finished: true, score, error: String((e && e.message) || "couldn't reach the leaderboard") }; }
      correct = !!res.correct;
    }
    if (correct) { score = res.score; $score.textContent = score; beep(660, 140, "triangle", 0.13); say("squeeze", pickOne(S_FOUND), slotX(s, n), 330, 1200); }
    else {
      beep(180, 380, "sawtooth", 0.1, -120);
      const cs = s < 0 ? finalOf(hidden, swaps) : s;
      const tx = slotX(cs, n) + (slotX(cs, n) > W / 2 ? -80 : 80);
      crab = { x0: W - 70, y0: 640, x1: tx, y1: 585, t0: performance.now(), said: false };
    }
    finished = !!res.finished;
    phase = "reveal"; t0 = performance.now();
  }

  function endRun() {
    phase = "over";
    t0 = performance.now();
    if (score > best) { best = score; localStorage.setItem("squeeze-whichjar-best-" + new Date().toISOString().slice(0, 10), String(best)); }
    $best.textContent = best;
    if (!local) mini.after(score, res, ranked);
    sid = null;
    endUi();
  }
  function endUi() {
    $start.disabled = false;
    $start.textContent = phase === "over" ? "Play again" : "Start";
  }

  function tap(x) {
    if (phase === "pick") return pick(x);
    if (phase === "over" && performance.now() - t0 < 600) return;
    if (phase === "ready" || phase === "over") begin();
  }

  function step(now) {
    const t = now - t0;
    if (phase === "pick" && t > PICK_MS) { pickSlot(-1); return; } // te laat = ronde verloren
    if (phase === "show" && t > show) { phase = "swap"; t0 = now; anim = null; }
    if (phase === "swap") {
      if (!anim) {
        if (!queue.length) { phase = "pick"; t0 = now; return; }
        const [a, b] = queue.shift();
        anim = { a: jarAtSlot(a), b: jarAtSlot(b), sa: a, sb: b, t0: now };
        beep(300 + Math.random() * 120, 40, "sine", 0.04);
      }
      if (now - anim.t0 >= dur) { jars[anim.a].slot = anim.sb; jars[anim.b].slot = anim.sa; anim = null; }
    }
    if (phase === "reveal" && t > 1200) {
      if (correct && !finished) nextRound();
      else endRun();
    }
  }

  function draw(now) {
    const baseY = 470;
    jars.forEach((j, i) => {
      let x = slotX(j.slot, n), y = baseY;
      if (phase === "swap" && anim && (i === anim.a || i === anim.b)) {
        const p = Math.min(1, (now - anim.t0) / dur), e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
        const from = slotX(i === anim.a ? anim.sa : anim.sb, n), to = slotX(i === anim.a ? anim.sb : anim.sa, n);
        x = from + (to - from) * e; y = baseY + Math.sin(e * Math.PI) * (i === anim.a ? -60 : 60);
      }
      const open = (phase === "show" && i === hidden) || ((phase === "reveal" || phase === "over") && (i === picked || i === hidden));
      const jw = Math.min(104, (W - 80) / n), jh = jw * 1.25;
      const jump = phase === "reveal" && correct && i === hidden ? Math.sin(Math.min(1, (now - t0) / 700) * Math.PI) * 70 : 0;
      if (open && i === hidden) squeezeAt(x, y + jh / 2 - 6 - jump, jw * 0.82, phase === "over" && !correct ? "sad" : "happy");
      rr(x - jw / 2, y - jh / 2, jw, jh, 18); ctx.fillStyle = "rgba(170,230,255,.22)"; ctx.fill();
      ctx.strokeStyle = "rgba(220,250,255,.75)"; ctx.lineWidth = 3; ctx.stroke();
      rr(x - jw * 0.55, y - jh / 2 - (open ? 46 : 14), jw * 1.1, 18, 6); ctx.fillStyle = "#c9862f"; ctx.fill();
      if ((phase === "reveal" || phase === "over") && i === picked && i !== hidden) text("empty", x, y + 8, 20, "#ffb4b4");
    });
    if (crab) {
      const p = Math.min(1, (now - crab.t0) / 650), e = 1 - (1 - p) ** 2;
      const cx = crab.x0 + (crab.x1 - crab.x0) * e, cy = crab.y0 + (crab.y1 - crab.y0) * e;
      const hop = p < 1 ? Math.abs(Math.sin(now / 60)) * 8 : Math.abs(Math.sin(now / 110)) * 12; // trippelen, daarna lachen
      G.drawImg(G.CRAB, cx, cy - hop, 100, crab.x1 > W / 2);
      if (p >= 1 && !crab.said) { crab.said = true; say("pinchy", pickOne(P_WRONG), cx, cy - 75, 4000); beep(520, 70, "square", 0.05); setTimeout(() => beep(620, 70, "square", 0.05), 110); setTimeout(() => beep(720, 90, "square", 0.05), 220); }
    } else G.drawImg(G.CRAB, W - 70, 640 + Math.sin(now / 300) * 2, 90, true);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 14;
    if (phase === "pick") {
      const left = Math.max(0, Math.ceil((PICK_MS - (now - t0)) / 1000));
      text("Where is Squeeze?", W / 2, 230, 32, GREEN);
      text(left + "s", W / 2, 270, 24, left <= 3 ? "#ffb4b4" : "#fff");
    }
    if (phase === "show") text("Watch closely…", W / 2, 230, 30);
    if (phase === "check") text("…", W / 2, 230, 34);
    if (phase === "reveal" && correct) text("Found him! 🎉", W / 2, 230, 34, GREEN);
    if (phase === "ready" || phase === "wait") { text("Which Jar?", W / 2, 230, 46, GREEN); text(phase === "wait" ? "Getting ready…" : "Tap to start", W / 2, 274, 24, "#fff"); text("Follow the jar with Squeeze in it", W / 2, 310, 19, "#cfe"); text("You have 10 seconds to pick", W / 2, 336, 17, "#cfe"); }
    if (phase === "over") {
      text(finished && correct ? "🏆 Max level!" : slow ? "Too slow! ⏱" : "Wrong jar!", W / 2, 150, 32, finished && correct ? GREEN : "#ffb4b4");
      text(`${score}`, W / 2, 222, 72, GREEN);
      text(`Best today ${best}`, W / 2, 262, 20, "#fff");
      if (now - t0 > 600) text("Tap to play again", W / 2, 302, 22, "#fff");
    }
    ctx.restore();
    G.drawBubbles(now);
  }

  const tapAt = (e) => { const r = cv.getBoundingClientRect(); tap(((e.clientX ?? r.left + r.width / 2) - r.left) * (W / r.width)); };
  cv.addEventListener("pointerdown", (e) => { e.preventDefault(); tapAt(e); });
  $start.addEventListener("click", () => { if (phase === "ready" || phase === "over") begin(); });
  const loop = (now) => { step(now); ctx.clearRect(0, 0, W, G.H); draw(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  window.__whichjar = () => ({ phase, hidden, swaps, n, jars, score }); // alleen voor testen
})();
