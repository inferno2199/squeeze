// reef.js — Het levende aquarium: alle Squeeze Squad-NFT's zwemmen rond (Het_levende_aquarium_bouwplan.pdf).
// Gegevens: worker /tg/reef (elke 30 s). Uitgeknipt = vrij zwemmend; anders in een belletje (reserve).
// Grootte = rang van de eigenaar; kleiner = verder naar achteren. Tikken = willekeurige reactie + kaartje.
// De Reef leeft mee: weer volgens de chart, kwallen bij een ATH, walvissen bij grote buys, schat van burns,
// nacht met gloeiende octopussen (klok van de bezoeker), eitjes voor nieuwe mints (tikken telt de worker).
// Demo zonder collectie: reef.html?demo=1  (extra: &mood=red|green|ath  &night=1  &whale=1  &n=150)
(function () {
  "use strict";
  var C = window.SQUEEZE_CONFIG || {};
  var API = (C.WORKER_URL || "https://squeeze-state.inferno2199.workers.dev").replace(/\/$/, "") + "/tg/";
  var Q = new URLSearchParams(location.search);
  var DEMO = Q.get("demo") === "1";
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cv = document.getElementById("reef");
  var ctx = cv.getContext("2d");
  var W = 0, H = 0, DPR = 1, U = 1; // U = schaal t.o.v. een scherm van 900px
  var $ = function (id) { return document.getElementById(id); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, k) { return a + (b - a) * k; };

  // ---------- plaatjes ----------
  var IMG = {};
  function img(src) {
    if (IMG[src]) return IMG[src];
    var i = new Image();
    i.decoding = "async";
    i.src = src;
    IMG[src] = i;
    return i;
  }
  var SEA = img("assets/sea.jpg"), WHALE = img("assets/friends/whale.png"), JELLY = img("assets/friends/jelly.png");

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    U = clamp(Math.min(W, H * 1.3) / 900, 0.45, 1.4);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- toestand ----------
  var data = { nfts: [], live: {}, cfg: { max: 150, goldStep: 1e6, chestStep: 1e7 } };
  var fish = []; // zwemmende octopussen
  var eggs = []; // eitjes op de bodem
  var whales = [], jellies = [], parts = [], food = [], bubbles = [];
  var VENTS = [0.17, 0.63, 0.86]; // plekjes in de bodem waar belletjes uit komen
  var seenWhale = {};
  var mood = { green: 0.5, red: 0, ath: 0 }; // vloeiend
  var night = 0;
  var snap = true; // bij het openen meteen in de juiste stemming (daarna rustig veranderen)
  var t0 = performance.now(), T = 0;

  // grootte per rang (0 = geen rang … 6 = Kraken, 7 = OctoChief)
  var SIZE = [70, 76, 84, 94, 106, 120, 138, 156];
  function depthOf(size) { return clamp(0.58 + size * 0.06, 0.58, 1); } // 1 = vooraan

  function makeFish(n, x, y) {
    var size = n.size || 0;
    var d = depthOf(size);
    var f = {
      n: n, size: size, d: d, img: img(n.cut || n.img), cut: !!n.cut,
      x: x != null ? x : rnd(0.08, 0.92) * W, y: y != null ? y : rnd(0.22, 0.82) * H,
      vx: rnd(-1, 1), vy: rnd(-0.3, 0.3), tx: 0, ty: 0, face: 1, faceK: 1,
      ph: rnd(0, 6.28), sp: rnd(0.7, 1.2), act: null, actT: 0, alpha: 0, gone: false, hue: n.hue || 0, born: performance.now(), goneAt: 0,
    };
    pickTarget(f);
    return f;
  }
  function pickTarget(f) {
    f.tx = rnd(0.06, 0.94) * W;
    f.ty = rnd(0.2, 0.84) * H;
    f.wait = rnd(2, 7);
  }

  // welke NFT's zwemmen nu (hooguit max; om de minuut een paar wisselen)
  function syncFish() {
    var max = (data.cfg && data.cfg.max) || 150;
    var all = data.nfts.filter(function (n) { return !n.egg; });
    var have = {};
    fish.forEach(function (f) { have[f.n.id] = f; });
    // gegevens bijwerken (plaatje kan net uitgeknipt zijn, rang kan veranderen)
    all.forEach(function (n) {
      var f = have[n.id];
      if (f) { f.n = n; f.size = n.size || 0; f.d = depthOf(f.size); if (n.cut && !f.cut) { f.img = img(n.cut); f.cut = true; } }
    });
    var ids = {};
    all.forEach(function (n) { ids[n.id] = true; });
    fish.forEach(function (f) { if (!ids[f.n.id]) f.gone = true; });
    var swimming = fish.filter(function (f) { return !f.gone; }).length;
    var waiting = all.filter(function (n) { return !have[n.id]; });
    shuffle(waiting);
    while (swimming < max && waiting.length) { fish.push(makeFish(waiting.pop())); swimming++; }
    // eitjes
    var eggIds = {};
    data.nfts.forEach(function (n) {
      if (!n.egg) return;
      eggIds[n.id] = true;
      var e = eggs.find(function (x) { return x.n.id === n.id; });
      if (e) e.n = n;
      else eggs.push({ n: n, x: rnd(0.12, 0.88) * W, y: H - rnd(40, 90) * U, wob: 0, ph: rnd(0, 6) });
    });
    eggs.forEach(function (e) {
      if (!eggIds[e.n.id] && !e.hatched) hatch(e); // uitgekomen (bij de worker): octopus zwemt eruit
    });
  }
  function rotate() {
    var max = (data.cfg && data.cfg.max) || 150;
    var all = data.nfts.filter(function (n) { return !n.egg; });
    if (all.length <= max) return;
    var live = fish.filter(function (f) { return !f.gone; });
    shuffle(live).slice(0, Math.ceil(max * 0.15)).forEach(function (f) { f.gone = true; });
    setTimeout(syncFish, 1600);
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---------- gegevens ----------
  function demoData() {
    var n = clamp(Number(Q.get("n")) || 40, 1, 400);
    var names = ["Bubbles", "Inky", "Captain Suck", "Noodle", "Squishy", "Tako", "Pearl", "Wiggles", "Kraken Jr", "Sir Squeeze", "Dumpling", "Marshmallow", "Octavia", "Pickles", "Blob Marley"];
    var nfts = [];
    for (var i = 0; i < n; i++) {
      var cut = i % 7 !== 3;
      nfts.push({ id: "demo" + i, name: names[i % names.length] + (i >= names.length ? " " + (1 + ((i / names.length) | 0)) : ""), num: String(i + 1),
        img: cut ? "assets/reef-demo.png" : "assets/squeeze_ref.jpg", cut: cut ? "assets/reef-demo.png" : null, size: i === 0 ? 7 : (i * 37) % 7, hue: cut ? (i * 47) % 360 : 0 });
    }
    nfts.push({ id: "demoegg", name: "Fresh egg", num: String(n + 1), img: "assets/reef-demo.png", cut: "assets/reef-demo.png", size: 2, egg: { taps: 3, need: 10, hatchAt: Date.now() + 864e5 } });
    var m = Q.get("mood") || "green";
    return {
      nfts: nfts,
      live: { live: true, h24: m === "red" ? -18 : 12, ath: m === "ath", whales: Q.get("whale") === "1" ? [{ usd: 2500, at: Date.now() }] : [], whaleMin: 500, burned: 23.5e6 },
      cfg: { max: 150, goldStep: 1e6, chestStep: 1e7 },
    };
  }
  var demoTaps = 3;
  function load() {
    if (DEMO) { apply(demoData()); return; }
    fetch(API + "reef").then(function (r) { return r.json(); }).then(apply).catch(function () {
      if (!data.nfts.length) showNote("The Reef is resting. Try again in a minute. 🐙");
    });
  }
  function apply(d) {
    if (!d || !d.nfts) return;
    if (DEMO) { d.nfts.forEach(function (n) { if (n.egg) n.egg.taps = demoTaps; }); if (demoTaps >= 10) d.nfts = d.nfts.map(function (n) { return n.egg ? Object.assign({}, n, { egg: null }) : n; }); }
    data = d;
    var count = d.nfts.length;
    $("sub").textContent = count ? count + " Squeeze Squad octopus" + (count === 1 ? "" : "es") + ", swimming live." : "Every Squeeze Squad octopus, swimming live.";
    if (!count) showNote('No octopuses yet: the Squeeze Squad starts at launch.<br><a href="https://generator.squeezeocto.com/">Make yours →</a>');
    else $("note").hidden = true;
    syncFish();
    var L = d.live || {};
    (L.whales || []).forEach(function (w) {
      var k = w.at + ":" + w.usd;
      if (seenWhale[k]) return;
      seenWhale[k] = 1;
      spawnWhale(w.usd, L.whaleMin || 500);
    });
  }
  function showNote(html) { var n = $("note"); n.innerHTML = html; n.hidden = false; }
  if (DEMO) $("demo").hidden = false;

  // ---------- walvissen, kwallen, deeltjes ----------
  function spawnWhale(usd, min) {
    var k = clamp(Math.log10(Math.max(1, usd / Math.max(1, min))) * 0.9 + 1, 1, 2.4);
    var dir = Math.random() < 0.5 ? 1 : -1;
    var w = 300 * U * k;
    whales.push({ x: dir > 0 ? -w * 0.45 : W + w * 0.45, y: rnd(0.3, 0.6) * H, dir: dir, w: w, sp: 45 * U, ph: rnd(0, 6) });
  }
  function puff(x, y, n, color, spd, life, size) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, 6.28), s = rnd(0.3, 1) * spd;
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * rnd(0.7, 1.2), age: 0, r: size * rnd(0.6, 1.3), c: color });
    }
  }
  function bubbleUp(x, y, n) {
    for (var i = 0; i < n; i++) bubbles.push({ x: x + rnd(-14, 14) * U, y: y + rnd(-8, 8) * U, r: rnd(2, 6) * U, vy: -rnd(25, 60) * U, ph: rnd(0, 6), age: 0, life: rnd(2, 4) });
  }

  // ---------- tikken ----------
  var ACTS = ["ink", "flash", "camo", "puff", "spin", "bubbles"];
  function react(f) {
    var a = ACTS[(Math.random() * ACTS.length) | 0];
    f.act = a;
    f.actT = 0;
    if (a === "ink") {
      puff(f.x, f.y, 26, "rgba(8,14,10,", 70 * U, 1.6, 9 * U);
      var ang = rnd(0, 6.28);
      f.vx = Math.cos(ang) * 9;
      f.vy = Math.sin(ang) * 5;
      f.tx = clamp(f.x + Math.cos(ang) * 300 * U, 40, W - 40);
      f.ty = clamp(f.y + Math.sin(ang) * 160 * U, H * 0.2, H * 0.85);
    }
    if (a === "bubbles") bubbleUp(f.x, f.y - 20 * U, 14);
    showCard(f.n);
  }
  var cardTimer = null;
  function showCard(n) {
    $("cname").textContent = n.name || "Squeeze";
    $("cnum").textContent = n.num ? "# " + n.num : "";
    var link = $("clink");
    if (DEMO) { link.href = "#"; link.textContent = "View this NFT ↗ (demo)"; }
    else { link.href = "https://magiceden.io/item-details/" + encodeURIComponent(n.id); link.textContent = "View this NFT ↗"; }
    $("card").classList.add("on");
    clearTimeout(cardTimer);
    cardTimer = setTimeout(function () { $("card").classList.remove("on"); }, 6000);
  }

  function tapEgg(e) {
    e.wob = 1;
    puff(e.x, e.y - 10 * U, 6, "rgba(220,255,210,", 40 * U, 0.6, 3 * U);
    if (DEMO) { demoTaps++; apply(demoData()); return; }
    fetch(API + "reeftap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: e.n.id }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (!d) return;
        if (d.taps != null) e.n.egg = Object.assign({}, e.n.egg, { taps: d.taps });
        if (d.hatched) hatch(e);
      }).catch(function () {});
  }
  function hatch(e) {
    if (e.hatched) return;
    e.hatched = true;
    puff(e.x, e.y - 20 * U, 30, "rgba(240,255,235,", 120 * U, 1, 5 * U);
    bubbleUp(e.x, e.y - 20 * U, 12);
    var old = fish.find(function (x) { return x.n.id === e.n.id && !x.gone; });
    if (old) { old.x = e.x; old.y = e.y - 30 * U; old.vy = -6; old.born = performance.now(); } // zwemt al mee: laat hem uit het ei komen
    else {
      var f = makeFish(Object.assign({}, e.n, { egg: null }), e.x, e.y - 30 * U);
      f.vy = -6;
      fish.push(f);
    }
    eggs = eggs.filter(function (x) { return x !== e; });
    showCard(e.n);
  }

  function hitTest(x, y) {
    for (var i = eggs.length - 1; i >= 0; i--) {
      var e = eggs[i];
      if (Math.abs(x - e.x) < 34 * U && Math.abs(y - (e.y - 22 * U)) < 40 * U) return { egg: e };
    }
    var best = null, bd = 1e9;
    fish.forEach(function (f) {
      if (f.gone) return;
      var r = SIZE[f.size] * U * f.d * 0.55;
      var dd = Math.hypot(x - f.x, y - f.y);
      if (dd < r && (f.d > (best ? best.d : -1) || dd < bd)) { best = f; bd = dd; }
    });
    return best ? { fish: best } : null;
  }
  cv.addEventListener("pointerdown", function (ev) {
    var h = hitTest(ev.clientX, ev.clientY);
    if (!h) return;
    if (h.egg) tapEgg(h.egg);
    else react(h.fish);
  });

  // ---------- voer ----------
  $("feed").addEventListener("click", function () {
    var cx = rnd(0.2, 0.8) * W;
    for (var i = 0; i < 14; i++) food.push({ x: cx + rnd(-90, 90) * U, y: rnd(70, 120) * U, vy: rnd(18, 32) * U, ph: rnd(0, 6), age: 0 });
  });

  // ---------- tekenen ----------
  function drawSea() {
    if (SEA.complete && SEA.naturalWidth) {
      var s = Math.max(W / SEA.naturalWidth, H / SEA.naturalHeight);
      var sw = SEA.naturalWidth * s, sh = SEA.naturalHeight * s;
      var sway = reduced ? 0 : Math.sin(T * 0.15) * 8 * U * (1 + mood.red);
      ctx.drawImage(SEA, (W - sw) / 2 + sway, (H - sh) * 0.45, sw, sh);
    } else {
      ctx.fillStyle = "#06221a";
      ctx.fillRect(0, 0, W, H);
    }
    // groene dag: lichtstralen
    if (mood.green > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < 5; i++) {
        var x = W * (0.15 + i * 0.18) + Math.sin(T * 0.2 + i) * 40 * U;
        var g = ctx.createLinearGradient(x, 0, x + 120 * U, H * 0.8);
        var a = 0.05 * mood.green * (0.6 + 0.4 * Math.sin(T * 0.5 + i * 1.7));
        g.addColorStop(0, "rgba(190,255,220," + a + ")");
        g.addColorStop(1, "rgba(190,255,220,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 30 * U, 0);
        ctx.lineTo(x + 50 * U, 0);
        ctx.lineTo(x + 220 * U, H * 0.85);
        ctx.lineTo(x + 40 * U, H * 0.85);
        ctx.fill();
      }
      ctx.restore();
    }
    // rode dag: troebel water en donkere wolken aan het oppervlak
    if (mood.red > 0.02) {
      ctx.fillStyle = "rgba(48,28,12," + 0.4 * mood.red + ")";
      ctx.fillRect(0, 0, W, H);
      for (var j = 0; j < 7; j++) {
        var cx = ((j * 0.19 + T * 0.006 * (j % 2 ? 1 : -1)) % 1.2) * W - 0.1 * W;
        var cy = 18 * U + Math.sin(T * 0.4 + j) * 6 * U;
        var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 160 * U);
        gr.addColorStop(0, "rgba(8,9,11," + 0.8 * mood.red + ")");
        gr.addColorStop(1, "rgba(10,12,14,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(cx - 170 * U, cy - 170 * U, 340 * U, 340 * U);
      }
    }
  }

  // de schat van burns op de bodem: echte plaatjes (stapeltjes goud, schatkisten, losse munten), half in het zand
  var GOLD = img("assets/reef-gold.png"), CHEST = img("assets/reef-chest.png"), COIN = img("assets/reef-coin.png");
  var CHEST_X = [0.24, 0.76, 0.5, 0.08, 0.92, 0.37];
  function treasureSpot(i, chest) { // vaste, verspreide plekken langs de bodem (niet elke keer anders); verder weg = kleiner en hoger
    if (chest) return { x: W * CHEST_X[i % CHEST_X.length], s: 1, back: 0 };
    var u = ((i * 0.618034 + 0.31) % 1);
    var back = ((i * 53) % 10) / 10; // 0 = vooraan, 1 = achteraan
    return { x: W * (0.04 + u * 0.92), s: (0.55 + ((i * 37) % 10) / 20) * (1 - back * 0.35), back: back };
  }
  function drawTreasure() {
    var L = data.live || {};
    var burned = Number(L.burned) || 0;
    var cfg = data.cfg || {};
    var piles = clamp(Math.floor(burned / (cfg.goldStep || 1e6)), 0, 12);
    var chests = clamp(Math.floor(burned / (cfg.chestStep || 1e7)), 0, 6);
    if (!piles && !chests) return;
    var floor = H - 6 * U;
    var items = [];
    for (var c = 0; c < chests; c++) items.push({ im: CHEST, w: 150, i: c, chest: true });
    for (var i = 0; i < piles; i++) items.push({ im: i % 3 === 2 ? COIN : GOLD, w: i % 3 === 2 ? 34 : 110, i: i });
    items.forEach(function (it) { it.sp = treasureSpot(it.i, it.chest); });
    items.sort(function (a, b) { return b.sp.back - a.sp.back; }); // achteraan eerst
    items.forEach(function (it) {
      if (!(it.im.complete && it.im.naturalWidth)) return;
      var sp = it.sp;
      var w = it.w * U * sp.s, h = (it.im.naturalHeight / it.im.naturalWidth) * w;
      var x = sp.x, y = floor - sp.back * 34 * U - h + h * 0.08;
      var floorY = y + h * 0.92;
      // zachte schaduw eronder
      var sh = ctx.createRadialGradient(x, floorY, 0, x, floorY, w * 0.6);
      sh.addColorStop(0, "rgba(0,8,6,.55)");
      sh.addColorStop(1, "rgba(0,8,6,0)");
      ctx.fillStyle = sh;
      ctx.fillRect(x - w * 0.7, floorY - w * 0.22, w * 1.4, w * 0.4);
      ctx.drawImage(it.im, x - w / 2, y, w, h);
      if (it.chest) { // warme gloed en af en toe een belletje uit de kist
        var g = ctx.createRadialGradient(x, y + h * 0.35, 0, x, y + h * 0.35, w * 0.7);
        g.addColorStop(0, "rgba(255,215,110," + (0.16 + 0.07 * Math.sin(T * 1.7 + it.i)) + ")");
        g.addColorStop(1, "rgba(255,215,110,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - w, y - w * 0.4, w * 2, w * 1.5);
        if (!reduced && Math.random() < 0.004) bubbleUp(x, y + h * 0.3, 2);
      }
      // glinstering
      var tw = Math.sin(T * 2.3 + it.i * 1.7);
      if (tw > 0.93) {
        var gx = x + Math.sin(it.i * 7.1) * w * 0.25, gy = y + h * (it.chest ? 0.32 : 0.45);
        var k = (tw - 0.93) / 0.07;
        ctx.strokeStyle = "rgba(255,250,215," + (0.9 * k) + ")";
        ctx.lineWidth = 1.5 * U;
        ctx.beginPath();
        ctx.moveTo(gx - 7 * U * k, gy); ctx.lineTo(gx + 7 * U * k, gy);
        ctx.moveTo(gx, gy - 7 * U * k); ctx.lineTo(gx, gy + 7 * U * k);
        ctx.stroke();
      }
    });
  }

  function drawEgg(e, dt) {
    var need = (e.n.egg && e.n.egg.need) || 50, taps = (e.n.egg && e.n.egg.taps) || 0;
    var k = clamp(taps / need, 0, 1);
    e.wob = Math.max(0, e.wob - dt * 2.5);
    var rot = Math.sin(T * 2 + e.ph) * 0.05 + Math.sin(T * 30) * 0.18 * e.wob + Math.sin(T * 9) * 0.04 * k;
    var w = 30 * U, h = 40 * U;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(rot);
    var g = ctx.createRadialGradient(-w * 0.3, -h * 1.1, 2, 0, -h * 0.7, h);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#cfe9d2");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.75, w, h * 0.78, 0, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = "#7cff6b";
    [[-0.4, -1.0], [0.35, -0.7], [-0.1, -0.45], [0.45, -1.15], [-0.5, -0.6]].forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p[0] * w, p[1] * h, 3.2 * U, 0, 6.28);
      ctx.fill();
    });
    if (k > 0.2) { // barstjes
      ctx.strokeStyle = "rgba(40,60,45,.75)";
      ctx.lineWidth = 1.6 * U;
      ctx.beginPath();
      ctx.moveTo(-w * 0.6, -h * 0.85);
      var n = Math.ceil(k * 6);
      for (var i = 1; i <= n; i++) ctx.lineTo(-w * 0.6 + i * w * 0.2, -h * 0.85 + (i % 2 ? -1 : 1) * h * 0.08);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "rgba(243,247,242,.9)";
    ctx.font = "700 " + Math.round(12 * U + 3) + "px 'Bricolage Grotesque', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,.9)";
    ctx.shadowBlur = 6;
    ctx.fillText("🥚 " + taps + "/" + need, e.x, e.y + 14 * U);
    ctx.shadowBlur = 0;
  }

  var FILTER_OK = "filter" in ctx;
  // elk plaatje één keer verkleinen (max 256px) en kleuren: tekenen gaat dan veel lichter (ook met 150 grote NFT's)
  var SPR = {};
  function sprite(f) {
    var src = f.img;
    if (!(src.complete && src.naturalWidth)) return null;
    var key = src.src + "|" + (f.hue || 0);
    if (SPR[key]) return SPR[key];
    var k = Math.min(1, 256 / Math.max(src.naturalWidth, src.naturalHeight));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(src.naturalWidth * k));
    c.height = Math.max(1, Math.round(src.naturalHeight * k));
    var g = c.getContext("2d");
    if (f.hue && FILTER_OK) g.filter = "hue-rotate(" + f.hue + "deg)";
    g.drawImage(src, 0, 0, c.width, c.height);
    SPR[key] = c;
    return c;
  }
  function drawFish(f) {
    var base = SIZE[f.size] * U * f.d;
    var im = sprite(f);
    var ready = !!im;
    var bob = Math.sin(T * 1.6 * f.sp + f.ph);
    var push = Math.sin(T * 2.4 * f.sp + f.ph); // tentakels duwen: samenknijpen en uitrekken
    var sx = 1 + push * 0.05, sy = 1 - push * 0.07;
    var rot = clamp(f.vx * 0.04, -0.25, 0.25);
    var alpha = f.alpha * (0.75 + 0.25 * f.d);
    var scale = 1;
    var A = f.act, k = f.actT;
    if (A === "puff") scale = k < 0.35 ? lerp(1, 1.55, k / 0.35) : k < 0.6 ? lerp(1.55, 0.7, (k - 0.35) / 0.25) : lerp(0.7, 1, (k - 0.6) / 0.6);
    if (A === "spin") rot += clamp(k / 0.9, 0, 1) * Math.PI * 2;
    if (A === "camo") alpha *= k < 0.3 ? lerp(1, 0.07, k / 0.3) : k < 2.2 ? 0.07 : lerp(0.07, 1, (k - 2.2) / 0.6);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(f.x, f.y + bob * 6 * U);
    ctx.rotate(rot);
    var fk = f.faceK < 0 ? Math.min(-0.35, f.faceK) : Math.max(0.35, f.faceK); // nooit plat als een plankje
    ctx.scale(fk * sx * scale, sy * scale);
    var w = base, h = base;
    if (ready) h = (im.height / im.width) * w;
    var flash = A === "flash" && k < 1.2;
    if (FILTER_OK && flash) ctx.filter = "hue-rotate(" + Math.round(k * 900) + "deg) saturate(3) brightness(1.2)"; // alleen tijdens het flitsen
    if (f.cut) {
      if (ready) ctx.drawImage(im, -w / 2, -h / 2, w, h);
    } else {
      // reserve: in een rond belletje
      var r = base * 0.36;
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 6.28);
      ctx.clip();
      if (ready) {
        var s2 = Math.max((r * 2) / im.width, (r * 2) / im.height);
        ctx.drawImage(im, -im.width * s2 / 2, -im.height * s2 / 2, im.width * s2, im.height * s2);
      }
      ctx.restore();
      ctx.filter = "none";
      ctx.strokeStyle = "rgba(220,255,240,.55)";
      ctx.lineWidth = 2.5 * U;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 6.28);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.42, -r * 0.5, r * 0.22, r * 0.12, -0.6, 0, 6.28);
      ctx.fill();
    }
    if (FILTER_OK && flash) ctx.filter = "none";
    if (flash && !FILTER_OK) { // reserve zonder filters: een gekleurde gloed
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "hsla(" + Math.round(k * 900) % 360 + ",100%,60%,.35)";
      ctx.beginPath();
      ctx.arc(0, 0, base * 0.45, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }

  function step(dt) {
    T += dt;
    // stemming volgens de chart (vloeiend)
    var L = data.live || {};
    var h24 = L.h24 == null ? 0 : Number(L.h24);
    var wantRed = clamp(-h24 / 15, 0, 1), wantGreen = clamp(h24 / 10 + 0.3, 0, 1) * (1 - wantRed);
    var mk = snap && data.live && data.live.live !== undefined ? 1 : dt * 0.5;
    mood.red = lerp(mood.red, wantRed, mk);
    mood.green = lerp(mood.green, wantGreen, mk);
    mood.ath = lerp(mood.ath, L.ath ? 1 : 0, mk);
    var hr = new Date().getHours() + new Date().getMinutes() / 60;
    var wantNight = Q.get("night") === "1" ? 1 : hr >= 21 || hr < 5.5 ? 1 : hr >= 19.5 ? (hr - 19.5) / 1.5 : hr < 7 ? (7 - hr) / 1.5 : 0;
    night = lerp(night, clamp(wantNight, 0, 1), snap ? 1 : dt * 0.4);

    // kwallen bij een ATH
    var wantJ = Math.round(mood.ath * 9);
    while (jellies.length < wantJ) jellies.push({ x: rnd(0.05, 0.95) * W, y: snap ? rnd(0.15, 0.9) * H : H + rnd(20, 200), s: rnd(40, 80) * U, ph: rnd(0, 6), vy: -rnd(10, 22) * U });
    if (snap && data.live && data.live.live !== undefined) snap = false;
    if (jellies.length > wantJ && Math.random() < dt) jellies.shift();
    jellies.forEach(function (j) {
      j.y += j.vy * dt * (reduced ? 0.4 : 1);
      j.x += Math.sin(T + j.ph) * 8 * U * dt;
      if (j.y < -j.s * 2) { j.y = H + j.s; j.x = rnd(0.05, 0.95) * W; }
    });

    // octopussen
    fish.forEach(function (f) {
      var nowMs = performance.now(); // invaden op de echte klok (ook als de browser weinig beelden tekent)
      if (f.gone && !f.goneAt) f.goneAt = nowMs;
      f.alpha = f.gone ? Math.max(0, 1 - (nowMs - f.goneAt) / 1200) : Math.min(1, (nowMs - f.born) / 1400);
      if (f.act) {
        f.actT += dt;
        if (f.actT > 3) f.act = null;
      }
      // voer in de buurt?
      var tgt = null, td = 300 * U;
      food.forEach(function (p) { var d = Math.hypot(p.x - f.x, p.y - f.y); if (d < td) { td = d; tgt = p; } });
      var tx = tgt ? tgt.x : f.tx, ty = tgt ? tgt.y : f.ty;
      if (tgt && td < 18 * U * f.d + 10) { tgt.eaten = true; bubbleUp(f.x, f.y - 10 * U, 3); }
      var dx = tx - f.x, dy = ty - f.y, dist = Math.hypot(dx, dy) || 1;
      var speed = (tgt ? 130 : 58) * U * f.sp * (reduced ? 0.5 : 1) * (0.7 + 0.3 * f.d);
      if (!tgt && dist < 30 * U) {
        f.wait -= dt;
        if (f.wait <= 0) pickTarget(f);
      }
      var ax = (dx / dist) * speed, ay = (dy / dist) * speed;
      f.vx = lerp(f.vx, ax / 10, Math.min(1, dt * 2));
      f.vy = lerp(f.vy, ay / 10, Math.min(1, dt * 2));
      f.x += f.vx * dt * 10;
      f.y += f.vy * dt * 10;
      if (Math.abs(f.vx) > 1.4) f.face = f.vx > 0 ? -1 : 1; // pas omdraaien als hij echt de andere kant op zwemt
      f.faceK = lerp(f.faceK, f.face, dt * 5);
    });
    fish = fish.filter(function (f) { return !(f.gone && f.alpha <= 0); });

    food.forEach(function (p) { p.age += dt; p.y = Math.min(H - 30 * U, p.y + p.vy * dt); p.x += Math.sin(T * 2 + p.ph) * 10 * U * dt; });
    food = food.filter(function (p) { return !p.eaten && p.age < 25; });
    parts.forEach(function (p) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5; });
    parts = parts.filter(function (p) { return p.age < p.life; });
    // belletjes: overal een paar, en sliertjes uit drie plekjes in de bodem
    var want = (W * H) / (reduced ? 70000 : 22000);
    if (bubbles.length < want && Math.random() < dt * 5) bubbles.push({ x: rnd(0, W), y: H + 10, r: rnd(1.8, 5) * U, vy: -rnd(22, 48) * U, ph: rnd(0, 6), age: 0, life: 40 });
    if (!reduced) VENTS.forEach(function (v) {
      if (Math.random() < dt * 3) bubbles.push({ x: v * W + rnd(-6, 6) * U, y: H - 20 * U, r: rnd(1.5, 4.5) * U, vy: -rnd(45, 80) * U, ph: rnd(0, 6), age: 0, life: 40 });
    });
    bubbles.forEach(function (b) { b.age += dt; b.y += b.vy * dt; b.x += Math.sin(T * 2 + b.ph) * 12 * U * dt; });
    bubbles = bubbles.filter(function (b) { return b.y > -20 && b.age < b.life; });
    whales.forEach(function (w) { w.x += w.dir * w.sp * dt; });
    whales = whales.filter(function (w) { return w.dir > 0 ? w.x < W + w.w : w.x > -w.w; });
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    drawSea();
    // walvissen ver weg, achter alles
    whales.forEach(function (w) {
      if (!(WHALE.complete && WHALE.naturalWidth)) return;
      var h = (WHALE.naturalHeight / WHALE.naturalWidth) * w.w;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(w.x, w.y + Math.sin(T * 0.8 + w.ph) * 10 * U);
      ctx.scale(w.dir > 0 ? 1 : -1, 1); // het plaatje kijkt naar rechts: omdraaien als hij naar links zwemt
      ctx.drawImage(WHALE, -w.w / 2, -h / 2, w.w, h);
      ctx.restore();
    });
    drawTreasure();
    // nacht: donker water (achter de octopussen; zij blijven licht en gloeien)
    if (night > 0.02) {
      ctx.fillStyle = "rgba(0,6,22," + 0.6 * night + ")";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      fish.forEach(function (f) {
        if (f.gone) return;
        var r = SIZE[f.size] * U * f.d * 0.75;
        var y = f.y + Math.sin(T * 1.6 * f.sp + f.ph) * 6 * U;
        var g = ctx.createRadialGradient(f.x, y, 0, f.x, y, r);
        g.addColorStop(0, "rgba(124,255,107," + (0.22 + 0.06 * Math.sin(T * 1.3 + f.ph)) * night * f.alpha + ")");
        g.addColorStop(1, "rgba(124,255,107,0)");
        ctx.fillStyle = g;
        ctx.fillRect(f.x - r, y - r, r * 2, r * 2);
      });
      ctx.restore();
    }
    // kwallen
    jellies.forEach(function (j) {
      if (!(JELLY.complete && JELLY.naturalWidth)) return;
      var h = (JELLY.naturalHeight / JELLY.naturalWidth) * j.s;
      ctx.save();
      var g = ctx.createRadialGradient(j.x, j.y, 0, j.x, j.y, j.s * 1.2);
      g.addColorStop(0, "rgba(255,170,255," + (0.25 + 0.15 * Math.sin(T * 3 + j.ph)) + ")");
      g.addColorStop(1, "rgba(255,170,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(j.x - j.s * 1.3, j.y - j.s * 1.3, j.s * 2.6, j.s * 2.6);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(JELLY, j.x - j.s / 2, j.y - h / 2 + Math.sin(T * 2 + j.ph) * 4 * U, j.s, h);
      ctx.restore();
    });
    // achter naar voren: klein (ver) eerst
    fish.slice().sort(function (a, b) { return a.d - b.d; }).forEach(drawFish);
    eggs.forEach(function (e) { drawEgg(e, dt); });
    // voer
    food.forEach(function (p) {
      ctx.fillStyle = "#ffb26b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4 * U, 0, 6.28);
      ctx.fill();
    });
    // inkt en deeltjes
    parts.forEach(function (p) {
      var a = 1 - p.age / p.life;
      ctx.fillStyle = p.c + (0.75 * a).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + p.age), 0, 6.28);
      ctx.fill();
    });
    // belletjes
    ctx.strokeStyle = "rgba(225,255,245,.55)";
    ctx.lineWidth = 1.2;
    ctx.fillStyle = "rgba(225,255,245,.10)";
    bubbles.forEach(function (b) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 6.28);
      ctx.fill();
      ctx.stroke();
    });
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    draw(dt);
    requestAnimationFrame(frame);
  }
  load();
  setInterval(load, 30000);
  setInterval(rotate, 60000);
  requestAnimationFrame(frame);
  window.__reef = { data: function () { return data; }, fish: function () { return fish; }, whales: function () { return whales; }, eggs: function () { return eggs; }, spawnWhale: spawnWhale }; // voor een snelle controle
})();
