// 🧱 Squeeze Stack (Game Week, 2026-11-05): tik om de laag te laten vallen; alleen het stuk op de toren blijft.
// Veilig: de site stuurt alleen de tijden tussen het verschijnen van elke laag en jouw tik; de server speelt de toren
// zelf na (stackSim in squeeze-worker/bot/minigames.js). De formules hieronder MOETEN daar gelijk aan zijn.
(function () {
  "use strict";
  const ST = { W: 480, BASE_W: 300, PERFECT: 7, GROW: 12, SPEED0: 2.6, SPEED_UP: 0.22, SPEED_MAX: 10, PX_MS: 0.06, MAX_LAYERS: 150, MIN_DT: 120, AUTO_DT: 19000 };
  function moverX(x0, dir, w, v, t) {
    const L = ST.W - w;
    if (L <= 0) return 0;
    let u = (dir > 0 ? x0 : L - x0) + v * t;
    u %= 2 * L;
    const p = u <= L ? u : 2 * L - u;
    return dir > 0 ? p : L - p;
  }

  const mini = window.SqzMini("stack");
  const cv = document.getElementById("c");
  const G = window.SqzGfx(cv);
  const { ctx, W, H, GREEN, rr, text, drawImg, squeezeAt, say, beep, pickOne } = G;
  const $score = document.getElementById("score"), $best = document.getElementById("best"), $start = document.getElementById("start");
  const LH = 30, BASE_Y = H - 70;
  const S_PERFECT = ["Perfect! 😎", "Smooth!", "Like a pro!", "Ink-credible!"];
  const P_WOBBLY = ["That's gonna fall 🦀", "Wobbly wobbly!", "Hehe, so thin!", "One more and BOOM"];
  const P_START = ["Bet you can't reach 10 🦀", "Pinchy is watching…", "Build it, I'll snip it!"];
  const S_REPLY = ["Watch me!", "Easy!", "Not today, Pinchy!"];
  const P_FALL = ["TIMBER! 😂", "Told you! 🦀", "Snip snap, it's over!"];

  let layers, mover, spawnT, dts, cam, state = "ready", falling, parts, fx, combo, perfects, shake, land, blink, mood, lastTalk, deadAt;
  let sid = null, ranked = false, local = true, finalScore = 0, saving = false;
  let best = Number(localStorage.getItem("squeeze-stack-best-" + new Date().toISOString().slice(0, 10)) || 0);
  $best.textContent = best;

  const yOf = (i) => BASE_Y - i * LH + cam;
  const STOPS = [[205, 75, 42], [178, 70, 46], [150, 65, 50], [18, 85, 62], [340, 75, 66], [45, 95, 58]];
  const hueOf = (i) => { const t = Math.min(STOPS.length - 1.001, i / 7); const a = STOPS[Math.floor(t)], b = STOPS[Math.floor(t) + 1], k = t % 1; return a.map((v, j) => v + (b[j] - v) * k); };
  const block = (x, y, w, i, alpha = 1) => {
    const [hh, s, l] = i === 0 ? [30, 35, 32] : hueOf(i);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,.28)"; rr(x + 3, y + 6, w, LH - 2, 10); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + LH); g.addColorStop(0, `hsl(${hh} ${s}% ${l + 14}%)`); g.addColorStop(0.55, `hsl(${hh} ${s}% ${l}%)`); g.addColorStop(1, `hsl(${hh} ${s}% ${l - 14}%)`);
    rr(x, y, w, LH - 2, 10); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = `hsl(${hh} ${s}% ${l - 22}%)`; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.28)"; rr(x + 6, y + 4, Math.max(0, w - 12), 5, 3); ctx.fill();
    if (w > 40) for (let k = 18; k < w - 10; k += 34) { ctx.beginPath(); ctx.arc(x + k, y + LH * 0.62, 3, 0, 7); ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fill(); }
    ctx.restore();
  };
  const burst = (x, y, n, col) => { for (let k = 0; k < n; k++) parts.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4 - 1, r: 2 + Math.random() * 4, life: 1, col }); };
  const talk = (now, who, t, x, y) => { say(who, t, x, y, 1700); lastTalk = now; };
  const setScore = (n) => { $score.textContent = n; };

  function reset() {
    layers = [{ x: (W - ST.BASE_W) / 2, w: ST.BASE_W }];
    cam = 0; falling = []; parts = []; fx = []; combo = 0; perfects = 0; shake = 0; land = 0; blink = 0; mood = "happy"; lastTalk = 0; deadAt = 0; dts = [];
    setScore(0);
  }
  // nieuwe bewegende laag: k = de hoeveelste tik (0 = eerste), zelfde richting en snelheid als de server
  function spawn(now) {
    const k = layers.length - 1;
    const top = layers[layers.length - 1];
    const fromLeft = k % 2 === 1;
    mover = { x0: fromLeft ? 0 : W - top.w, dir: fromLeft ? 1 : -1, w: top.w, v: Math.min(ST.SPEED_MAX, ST.SPEED0 + ST.SPEED_UP * k) * ST.PX_MS, x: fromLeft ? 0 : W - top.w };
    spawnT = now;
  }

  async function begin() {
    if (state === "wait") return;
    state = "wait";
    $start.disabled = true;
    $start.textContent = "…";
    const d = await mini.start();
    if (d.paused) { mini.showErr("Squeeze Stack is paused for a moment. Try again soon. 🐙"); state = "ready"; return endUi(); }
    local = !!d.local; sid = d.sid || null; ranked = !!d.ranked;
    reset();
    G.clearBubbles();
    const now = performance.now();
    spawn(now);
    state = "play";
    $start.textContent = "Drop";
    $start.disabled = false;
    talk(now, "pinchy", pickOne(P_START), W - 90, 120);
    setTimeout(() => state === "play" && say("squeeze", pickOne(S_REPLY), 120, 160, 1500), 1200);
    beep(520, 80);
  }

  function drop(now) {
    const dt = now - spawnT;
    if (dt < ST.MIN_DT) return; // te snel na de vorige laag: telt niet (ook niet bij de server)
    dts.push(dt);
    const top = layers[layers.length - 1];
    let x = moverX(mover.x0, mover.dir, mover.w, mover.v, dt);
    mover.x = x;
    const l = Math.max(x, top.x), r = Math.min(x + top.w, top.x + top.w);
    if (r - l <= 2) {
      falling.push({ x, w: mover.w, y: yOf(layers.length), vy: 0, vx: mover.dir * 2, rot: 0, vr: mover.dir * 0.05, i: layers.length });
      shake = 10; beep(180, 380, "sawtooth", 0.1, -120);
      say("pinchy", pickOne(P_FALL), W - 90, 120, 2200);
      return over(now);
    }
    const perfect = Math.abs(x - top.x) < ST.PERFECT;
    if (perfect) x = top.x;
    let nl = Math.max(x, top.x), nr = Math.min(x + top.w, top.x + top.w);
    const cut = perfect ? null : x < nl ? { x, w: nl - x } : { x: nr, w: x + top.w - nr };
    if (cut && cut.w > 1) falling.push({ ...cut, y: yOf(layers.length), vy: -1, vx: cut.x < nl ? -1.5 : 1.5, rot: 0, vr: (cut.x < nl ? -1 : 1) * (0.03 + Math.random() * 0.04), i: layers.length });
    const y = yOf(layers.length);
    if (perfect) {
      combo++; perfects++;
      if (combo >= 3) { const g = Math.min(ST.GROW, ST.BASE_W - (nr - nl)); nl -= g / 2; nr += g / 2; }
      fx.push({ t: now, x: (nl + nr) / 2, y, txt: combo > 1 ? `PERFECT x${combo}` : "PERFECT!" });
      burst((nl + nr) / 2, y, 14, "#ffffff");
      beep(660 + combo * 80, 120, "triangle", 0.13);
      if (combo >= 2 && now - lastTalk > 2500) talk(now, "squeeze", pickOne(S_PERFECT), 120, 160);
    } else {
      combo = 0; beep(330, 70, "square", 0.06);
    }
    layers.push({ x: nl, w: nr - nl });
    setScore(layers.length - 1);
    shake = perfect ? 3 : 5; land = 1;
    const w = nr - nl;
    mood = w < 60 ? "sad" : w < 140 ? "neutral" : "happy";
    if (w < 90 && now - lastTalk > 3000) talk(now, "pinchy", pickOne(P_WOBBLY), W - 90, 120);
    if (layers.length - 1 >= ST.MAX_LAYERS) return over(now);
    spawn(now);
  }

  async function over(now) {
    state = "over"; deadAt = now; mood = "sad";
    finalScore = layers.length - 1;
    endUi();
    if (local || !sid) return saveBest(finalScore);
    saving = true;
    let res = null;
    try {
      res = await mini.post("/stack/submit", { sid, dts });
    } catch (e) {
      res = { error: String((e && e.message) || "couldn't reach the leaderboard") };
    }
    saving = false;
    sid = null;
    if (res && Number.isFinite(res.score)) finalScore = res.score; // de server rekent, die telt
    saveBest(finalScore);
    mini.after(finalScore, res, ranked);
    if (ranked && res && res.rank && res.rank <= 3 && !res.error) fx.push({ t: performance.now() + 400, x: W / 2, y: 340, txt: `You're #${res.rank} today!` });
  }
  function saveBest(v) {
    if (v > best) { best = v; localStorage.setItem("squeeze-stack-best-" + new Date().toISOString().slice(0, 10), String(v)); }
    $best.textContent = best;
  }
  function endUi() {
    $start.disabled = false;
    $start.textContent = state === "over" ? "Play again" : "Start";
  }

  function tap() {
    const now = performance.now();
    if (state === "play") return drop(now);
    if (state === "over" && now - deadAt < 600) return; // niet per ongeluk meteen opnieuw
    if (state === "ready" || state === "over") begin();
  }

  let bg = null;
  function step(now) {
    if (!bg) bg = Array.from({ length: 26 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 3, v: 0.3 + Math.random() * 0.8 }));
    for (const b of bg) { b.y -= b.v; b.x += Math.sin(now / 900 + b.r) * 0.2; if (b.y < -10) { b.y = H + 10; b.x = Math.random() * W; } }
    if (state === "play") {
      mover.x = moverX(mover.x0, mover.dir, mover.w, mover.v, now - spawnT);
      if (now - spawnT > ST.AUTO_DT) drop(now); // niet eeuwig wachten
    }
    if (layers) {
      const want = Math.max(0, (layers.length - 11) * LH);
      cam += (want - cam) * 0.1;
      for (const f of falling) { f.vy += 0.6; f.y += f.vy; f.x += f.vx; f.rot += f.vr; }
      falling = falling.filter((f) => f.y < H + 160);
      for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.025; }
      parts = parts.filter((p) => p.life > 0);
      fx = fx.filter((f) => now - f.t < 900);
      shake *= 0.85; land *= 0.86;
      blink = Math.max(0, blink - 0.12); if (Math.random() < 0.006) blink = 1;
    }
  }
  function draw(now) {
    for (const b of bg || []) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.strokeStyle = "rgba(220,255,255,.3)"; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.save();
    if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const rockY = BASE_Y + LH - 2 + cam;
    if (rockY < H + 60) {
      const rg = ctx.createRadialGradient(W / 2, rockY, 10, W / 2, rockY + 10, 210); rg.addColorStop(0, "rgba(60,80,70,.95)"); rg.addColorStop(1, "rgba(20,35,30,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(W / 2, rockY + 14, 200, 34, 0, 0, 7); ctx.fill();
      drawImg(G.CRAB, W / 2 + 190, rockY - 4 + Math.sin(now / 300) * 2, 86, true); // Pinchy kijkt toe
    }
    layers.forEach((L, i) => { const y = yOf(i); if (y > -LH && y < H + LH) block(L.x, y, L.w, i); });
    const top = layers[layers.length - 1];
    if (state === "play") block(mover.x, yOf(layers.length), mover.w, layers.length);
    for (const f of falling) { ctx.save(); ctx.translate(f.x + f.w / 2, f.y + LH / 2); ctx.rotate(f.rot); block(-f.w / 2, -LH / 2, f.w, f.i, 0.95); ctx.restore(); }
    for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fillStyle = p.col; ctx.fill(); ctx.globalAlpha = 1; }
    const ride = state === "play" ? mover : top;
    const sw = Math.min(118, Math.max(80, ride.w * 0.7));
    const sy = yOf(state === "play" ? layers.length : layers.length - 1) + 2 - Math.abs(Math.sin(now / 260)) * (state === "play" ? 2 : 1);
    squeezeAt(ride.x + ride.w / 2 + Math.sin(now / 700) * (ride.w < 90 ? 6 : 1.5), sy, sw, mood, land, blink);
    ctx.restore();
    for (const f of fx) { if (now < f.t) continue; const k = (now - f.t) / 900; ctx.globalAlpha = 1 - k; text(f.txt, f.x, f.y - 30 - k * 50, 30 + (1 - k) * 6, "#fff"); ctx.globalAlpha = 1; }
    if (combo >= 2 && state === "play") text(`🔥 combo x${combo}`, W / 2, 46, 22, "#ffd24a");
    G.drawBubbles(now);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 14;
    if (state === "ready" || state === "wait") {
      text("Squeeze Stack", W / 2, 200, 46, GREEN); text(state === "wait" ? "Getting ready…" : "Tap to start", W / 2, 244, 24, "#fff");
      text("Land it perfectly for a combo 🔥", W / 2, 280, 19, "#cfe");
    }
    if (state === "over") {
      text("Tower fell!", W / 2, 150, 32, "#ffb4b4");
      text(`${finalScore}`, W / 2, 222, 72, GREEN);
      text(saving ? "Saving…" : `Best today ${best} · Perfects ${perfects}`, W / 2, 262, 20, "#fff");
      if (now - deadAt > 600) text("Tap to play again", W / 2, 302, 22, "#fff");
    }
    ctx.restore();
  }

  reset();
  cv.addEventListener("pointerdown", (e) => { e.preventDefault(); tap(); });
  $start.addEventListener("click", tap);
  addEventListener("keydown", (e) => { if (e.code === "Space" && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || "")) { e.preventDefault(); tap(); } });
  const loop = (now) => { step(now); ctx.clearRect(0, 0, W, H); draw(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  window.__stack = () => ({ state, dts, layers, mover, spawnT }); // alleen voor testen
})();
