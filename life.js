// life.js — wat leven in de zee op elke pagina (niet de hoofdsite, die heeft het al):
// luchtbelletjes die opstijgen, en af en toe een vriendje (of 2-3) dat voorbij zwemt en iets zegt,
// met elkaar praat of tegen elkaar botst. Alles achter de inhoud, nooit klikbaar.
// Gebruik: <script src="https://squeezeocto.com/life.js" defer></script>   (data-friends="few" = minder vaak, voor de spellen;
//          data-bubbles="off" = geen eigen belletjes, voor de hoofdsite)
(function () {
  "use strict";
  var me = document.currentScript;
  var FEW = me && me.getAttribute("data-friends") === "few";
  var NOBUB = me && me.getAttribute("data-bubbles") === "off"; // hoofdsite: sea.js heeft al eigen belletjes
  var BASE = new URL("assets/friends/", (me && me.src) || location.href).href;
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  var bg = document.querySelector(".seabg, .bg, #seabg");
  // pagina met een vaste zee-laag: net daarboven (de inhoud ligt op laag 1); anders achter alles
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:" + (bg ? 0 : -1);
  if (bg && bg.parentNode) bg.parentNode.insertBefore(cv, bg.nextSibling);
  else document.body.insertBefore(cv, document.body.firstChild);
  var ctx = cv.getContext("2d");
  var W = 0, H = 0, DPR = 1, U = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    U = Math.max(0.6, Math.min(1.1, W / 900));
  }
  window.addEventListener("resize", resize);
  resize();

  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  var IMG = {};
  ["fish", "dolphin", "shark", "jelly", "whale", "crab", "lobster", "shrimp", "minnow", "seal"].forEach(function (k) {
    var i = new Image();
    i.src = BASE + k + ".png";
    IMG[k] = i;
  });
  var SIZE = { fish: 74, dolphin: 150, shark: 175, jelly: 70, whale: 400, crab: 74, lobster: 84, shrimp: 52, minnow: 30, seal: 130 };
  var SWIM = { fish: 95, dolphin: 150, shark: 80, jelly: 35, whale: 45, crab: 60, lobster: 50, shrimp: 70, minnow: 120, seal: 90 };
  var FLOOR = { crab: 1, lobster: 1, shrimp: 1 };

  // ---------- wat ze zeggen ----------
  var SOLO = ["Squeeze?", "has anyone seen Squeeze? 🐙", "gm! 🐙", "just keep swimming", "blub blub", "$SQUEEZE spotted 👀", "is this the way to the Reef?", "I heard Squeeze has rings now 💍", "nice website", "hi! just passing", "where's the party?", "has anyone seen the ink? 🖋", "I smell ink somewhere… 👀", "Squeeze hid something again, didn't he"];
  var FLOORSAY = ["click clack", "sideways is the best way 🦀", "*snip snip*", "hop hop!"];
  var PAIRS = [
    ["where's Squeeze?", "napping on the chart 😴"],
    ["did you buy $SQUEEZE?", "obviously 🐙"],
    ["race you!", "you're on!"],
    ["nice fins", "nice… everything"],
    ["heard about the Ink Hunt?", "I'm looking everywhere 🖋"],
    ["is the chart green today?", "greener than seaweed 🌿"],
    ["Squeeze said hi", "Squeeze says hi to everyone"],
    ["are we there yet?", "we live in the ocean, buddy"],
    ["did you find the ink?", "shhh, I'm looking 🖋"],
    ["I saw a tiny ink spot!", "where?? tell me!"],
  ];
  var POKE = ["hey!", "that tickles! 😆", "don't poke the fish 😤", "rude!", "eek!", "boop?", "I'm working here!", "again! again!"];
  var PEEK = ["you can't see me 👀", "hehe", "peekaboo!", "nope, not here", "still hiding…"];
  var LANTERN = ["night shift 🏮", "it's dark down here", "anyone need a light?", "late night swim ✨"];
  var MOUSE = ["where are we going?", "wait up!", "I'll follow you anywhere", "ooh, what's this?"];
  var BUMP = [["oops!", "sorry!"], ["bonk!", "ow!"], ["watch it!", "you watch it!"], ["hey!", "my bad 😅"]];
  var TRIO = [["follow me!", "ok!", "are we there yet?"], ["to the Reef!", "to the Reef!", "wait for me!"], ["left!", "no, right!", "I'm lost 🫠"]];

  // ---------- toestand ----------
  var bubbles = [], swimmers = [], stars = [], notes = [];
  var mouse = { x: 0, y: 0, at: -1e9 };
  window.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") { mouse.x = e.clientX; mouse.y = e.clientY; mouse.at = performance.now(); } }, { passive: true });
  var nextScene = rnd(6, 12);
  var T = 0;

  function addSwimmer(kind, dir, y, opts) {
    var s = SIZE[kind] * U;
    var o = { kind: kind, dir: dir, x: dir > 0 ? -s : W + s, y: y, s: s, v: SWIM[kind] * U * rnd(0.85, 1.15), ph: rnd(0, 6), say: null, sayT: 0, t: 0, alpha: kind === "whale" ? 0.45 : 0.95 };
    for (var k in opts) o[k] = opts[k];
    swimmers.push(o);
    return o;
  }
  function talk(o, text, at, dur) {
    setTimeout(function () { if (swimmers.indexOf(o) >= 0) { o.say = text; o.sayT = dur || 2.6; } }, at * 1000);
  }
  var SWIMMERS = ["fish", "fish", "dolphin", "shark", "jelly", "fish"];
  function nightTime() { var h = new Date().getHours(); return h >= 20 || h < 6; }
  function scene() {
    var midY = function () { return rnd(0.22, 0.7) * H; };
    var opts = [["solo", 22], ["pair", 15], ["bump", 12], ["trio", 7], ["chase", 10], ["peek", 8], ["conga", 7], ["big", 5], ["pinch", 8], ["boxer", 7], ["legday", 6], ["juggle", 7], ["approve", 7], ["lazy", 6], ["whaleplay", 6], ["jellyhug", 6], ["pumpthief", 6]];
    if (nightTime()) opts.push(["lantern", 9]);
    if (performance.now() - mouse.at < 8000) opts.push(["mouse", 8]);
    // afwisselen: de laatste 6 scènes (ook op andere pagina's van de site) komen niet meteen terug
    var recent = [];
    try { recent = JSON.parse(sessionStorage.getItem("sqz-life-recent") || "[]"); } catch (e) {}
    var fresh = opts.filter(function (o) { return recent.indexOf(o[0]) < 0; });
    if (fresh.length) opts = fresh;
    var tot = opts.reduce(function (a, o) { return a + o[1]; }, 0), roll = Math.random() * tot, kind = opts[0][0];
    for (var q = 0; q < opts.length; q++) { roll -= opts[q][1]; if (roll <= 0) { kind = opts[q][0]; break; } }
    recent.push(kind);
    try { sessionStorage.setItem("sqz-life-recent", JSON.stringify(recent.slice(-6))); } catch (e) {}
    if (kind === "chase") return chase(midY());
    if (kind === "peek") return peek();
    if (kind === "pinch") return pinch();
    if (kind === "boxer") return boxer();
    if (kind === "legday") return legday();
    if (kind === "juggle") return juggle(midY());
    if (kind === "approve") return approve(midY());
    if (kind === "lazy") return lazy(midY());
    if (kind === "whaleplay") return whalePlay();
    if (kind === "jellyhug") return jellyHug(midY());
    if (kind === "pumpthief") return pumpThief(midY());
    if (kind === "conga") return conga(midY());
    if (kind === "lantern") return lantern();
    if (kind === "mouse") return follow();
    var r = { solo: 0.1, pair: 0.4, bump: 0.7, trio: 0.85, big: 0.95 }[kind];
    if (r < 0.34) { // één vriendje
      if (Math.random() < 0.22) {
        var k = pick(["crab", "lobster", "shrimp"]);
        var f = addSwimmer(k, Math.random() < 0.5 ? 1 : -1, H - SIZE[k] * U * 0.55, {});
        talk(f, pick(FLOORSAY), rnd(2, 4));
      } else {
        var o = addSwimmer(pick(SWIMMERS), Math.random() < 0.5 ? 1 : -1, midY(), {});
        talk(o, pick(SOLO), (W * 0.35) / o.v);
      }
    } else if (r < 0.6) { // twee die praten
      var dir = Math.random() < 0.5 ? 1 : -1, y = midY(), k1 = pick(SWIMMERS);
      var a = addSwimmer(k1, dir, y, {});
      var b = addSwimmer(k1 === "jelly" ? "jelly" : pick(["fish", "fish", "dolphin"]), dir, y + rnd(50, 90) * U, { v: a.v });
      b.x -= dir * (a.s + 60 * U);
      var p = pick(PAIRS), t0 = (W * 0.3) / a.v;
      talk(a, p[0], t0);
      talk(b, p[1], t0 + 2.4);
    } else if (r < 0.8) { // twee die botsen
      var y2 = midY(), kk = pick(["fish", "fish", "dolphin", "jelly"]);
      var l = addSwimmer(kk, 1, y2, { bump: true });
      var rr = addSwimmer(kk, -1, y2, { bump: true, v: l.v });
      l.mate = rr;
      rr.mate = l;
    } else if (r < 0.93) { // drie achter elkaar
      var d3 = Math.random() < 0.5 ? 1 : -1, y3 = midY(), lines = pick(TRIO);
      for (var i = 0; i < 3; i++) {
        var m = addSwimmer("fish", d3, y3 + Math.sin(i * 2) * 26 * U, { v: SWIM.fish * U });
        m.x -= d3 * i * 95 * U;
        talk(m, lines[i], (W * 0.3) / m.v + i * 2);
      }
    } else { // soms een walvis ver weg, of een school visjes
      if (Math.random() < 0.5) addSwimmer("whale", Math.random() < 0.5 ? 1 : -1, rnd(0.25, 0.5) * H, {});
      else {
        var d5 = Math.random() < 0.5 ? 1 : -1, y5 = midY();
        for (var j = 0; j < 9; j++) { var s5 = addSwimmer("minnow", d5, y5 + rnd(-40, 40) * U, { v: SWIM.minnow * U }); s5.x -= d5 * rnd(0, 160) * U; }
      }
    }
  }

  // haai achter een visje aan… en vlak voor de rand komt het visje terug met al zijn vriendjes: nu rent de haai 😂
  var GANG = ["GET HIM! 😤", "CHAAARGE! 🐟", "nobody chases our friend!", "we ride at dawn!", "go go go!"];
  function chase(y) {
    var dir = Math.random() < 0.5 ? 1 : -1;
    var f = addSwimmer("fish", dir, y, { v: 190 * U, fast: true });
    var sh = addSwimmer("shark", dir, y + 10 * U, { v: 190 * U });
    sh.x -= dir * (f.s + sh.s * 0.6);
    f.revenge = sh;
    talk(f, "HELP! 😱", (W * 0.25) / f.v);
    talk(sh, pick(["I just want a hug 🥺", "come back, friend!", "I'm vegan, I swear!"]), (W * 0.25) / f.v + 1.6);
  }
  function revenge(f) {
    var sh = f.revenge;
    f.revenge = null;
    if (swimmers.indexOf(sh) < 0) return;
    var back = -f.dir;
    f.dir = back; f.v = 175 * U;
    f.say = "BOYS! GET HIM! 😤"; f.sayT = 2.4;
    sh.dir = back; sh.v = 235 * U;
    talk(sh, "HELP! 😱", 0.7, 2.2);
    talk(sh, pick(["I SAID I'M VEGAN!!", "it was a joke!! 😭", "mommy!! 🦈"]), 3.2, 2.4);
    var edge = back > 0 ? -1 : W + 1, n = 8 + ((Math.random() * 4) | 0);
    for (var i = 0; i < n; i++) {
      var g = addSwimmer(i % 4 === 3 ? "minnow" : "fish", back, f.y + rnd(-90, 90) * U, { v: rnd(190, 230) * U });
      g.x = edge - back * (g.s + i * rnd(30, 55) * U);
      if (i === 1 || i === 4) talk(g, pick(GANG), 0.9 + i * 0.5, 2);
    }
  }
  // een krab (of kreeft) loopt over de bodem, een dolfijn komt hallo zeggen… en de krab knijpt in zijn neus 🦀🐬
  function pinch() {
    var D = Math.random() < 0.5 ? 1 : -1, ck = Math.random() < 0.7 ? "crab" : "lobster";
    var c = addSwimmer(ck, D, H - SIZE[ck] * U * 0.55, {});
    var d = addSwimmer("dolphin", -D, H * 0.5, { v: 0 });
    d.x = D > 0 ? W + d.s : -d.s;
    var phase = 0, t1 = 0, nose = function () { return { x: d.x + d.dir * d.s * 0.46, y: d.y + d.s * 0.04 }; };
    d.update = function (o, dt) {
      if (swimmers.indexOf(c) < 0) return false;
      if (phase === 0) { // wachten tot de krab goed in beeld is
        if (D > 0 ? c.x > W * 0.3 : c.x < W * 0.7) phase = 1;
        return true;
      }
      if (phase === 1) { // naar de krab toe zwemmen, neus net boven zijn klauwen
        var tx = c.x + D * o.s * 0.46, ty = c.y - c.s * 0.42 - o.s * 0.04;
        var dx = tx - o.x, dy = ty - o.y, dist = Math.sqrt(dx * dx + dy * dy), step = 170 * U * dt;
        if (dist <= step + 2 * U) {
          o.x = tx; o.y = ty; phase = 2; t1 = o.t; c.v = 0;
          o.say = "hellooo! 👋"; o.sayT = 1.6;
        } else { o.x += (dx / dist) * step; o.y += (dy / dist) * step; }
        return true;
      }
      if (phase === 2) { // even praten… en dan SNAP
        var k = o.t - t1;
        if (k > 0.9 && !c.said) { c.said = 1; c.say = pick(["hi! 🙂", "oh hello", "…hi?"]); c.sayT = 1.2; }
        if (k > 1.9) {
          phase = 3;
          c.say = "*SNAP* 🦀"; c.sayT = 1.2;
          c.update = function (c, dt) { // hangt aan de neus van de dolfijn
            var n = nose();
            c.x = n.x; c.y = n.y + c.s * 0.42 + Math.sin(c.t * 9) * 3 * U;
            if (c.t > 0 && !c.hold && phase === 4 && o.t - t1 > 4.1) { c.hold = 1; c.say = pick(["not letting go 😤", "mine now", "nope 🦀"]); c.sayT = 2; }
            return swimmers.indexOf(o) >= 0;
          };
          o.dir = D; // omdraaien en wegwezen
        }
        return true;
      }
      if (phase >= 3) { // weg, met de krab aan zijn neus
        if (phase === 3 && o.t - t1 > 2.6) { phase = 4; o.say = "OW OW OW OW OW 😭"; o.sayT = 3.2; }
        if (phase === 3) return true; // heel even stil van de schrik
        o.x += o.dir * 240 * U * dt;
        o.y -= 55 * U * dt;
        o.fast = true;
        return o.dir > 0 ? o.x < W + o.s * 1.5 : o.x > -o.s * 1.5;
      }
      return true;
    };
  }
  // garnaal voor de garnaal-scènes (o.still = staat stil, springt dan niet)
  function shrimpTo(D) {
    return addSwimmer("shrimp", D, H - SIZE.shrimp * U * 0.55, {});
  }
  // 🥊 de bokskampioen: een vis pest het garnaaltje… BONK!
  function boxer() {
    var D = Math.random() < 0.5 ? 1 : -1, stopX = D > 0 ? W * rnd(0.3, 0.42) : W * rnd(0.58, 0.7);
    var g = shrimpTo(D);
    var f = addSwimmer("fish", -D, g.y - 26 * U, { v: 0 });
    f.x = D > 0 ? W + f.s : -f.s;
    var phase = 0, t0 = 0;
    g.update = function (o, dt) {
      if (phase === 0) { // naar zijn plekje lopen
        o.x += o.dir * o.v * dt;
        if (D > 0 ? o.x >= stopX : o.x <= stopX) { o.x = stopX; phase = 1; o.still = true; }
        return true;
      }
      if (phase === 1) { // de vis komt eraan en stopt vlak voor hem
        var tx = o.x + D * (o.s * 0.5 + f.s * 0.55);
        f.x += (tx > f.x ? 1 : -1) * Math.min(Math.abs(tx - f.x), 150 * U * dt);
        if (Math.abs(tx - f.x) < 1) { phase = 2; t0 = o.t; f.say = pick(["haha, tiny shrimp!", "aww, look at the little guy 🤭", "hey, shrimpy!"]); f.sayT = 2; }
        return true;
      }
      var k = o.t - t0;
      if (phase === 2 && k > 2) { o.say = "…"; o.sayT = 1; phase = 3; }
      if (phase === 3 && k > 3.1) { // BONK
        phase = 4;
        o.x += D * 14 * U;
        for (var i = 0; i < 12; i++) stars.push({ x: f.x - D * f.s * 0.3, y: f.y, vx: rnd(-90, 90) * U, vy: rnd(-110, 10) * U, age: 0 });
        f.say = "BONK! 💥"; f.sayT = 1.2;
        f.fly = { vx: D * 520 * U, vy: -260 * U };
      }
      if (phase === 4 && k > 3.25 && (D > 0 ? o.x > stopX : o.x < stopX)) o.x = D > 0 ? Math.max(stopX, o.x - 90 * U * dt) : Math.min(stopX, o.x + 90 * U * dt);
      if (phase === 4 && k > 3.9) { phase = 5; o.say = pick(["don't call me tiny 😤", "who's tiny now? 🦐", "mantis shrimp, baby 🥊"]); o.sayT = 2.6; }
      if (phase === 5 && k > 7) { // weer verder lopen
        o.still = false;
        o.x += o.dir * o.v * dt;
        return o.dir > 0 ? o.x < W + o.s : o.x > -o.s;
      }
      return true;
    };
    f.update = function (o, dt) {
      if (!o.fly) return swimmers.indexOf(g) >= 0;
      o.x += o.fly.vx * dt; o.y += o.fly.vy * dt; o.fly.vy += 160 * U * dt;
      o.spin = (o.spin || 0) + dt * 14;
      return o.x > -o.s * 2 && o.x < W + o.s * 2 && o.y > -o.s * 2;
    };
  }
  // 🐬🦐🐬 drie dolfijnen gooien een garnaaltje met hun neus naar elkaar
  function juggle(y) {
    var D = Math.random() < 0.5 ? 1 : -1, ds = [], gap = SIZE.dolphin * U * 1.25;
    for (var i = 0; i < 3; i++) {
      var d = addSwimmer("dolphin", D, y + (i === 1 ? 26 : 0) * U, { v: 70 * U });
      d.x -= D * i * gap;
      ds.push(d);
    }
    var g = addSwimmer("shrimp", D, y, { still: true });
    var order = [0, 1, 2, 1], step = 0, t = 0, DUR = 0.95;
    var nose = function (d) { return { x: d.x + d.dir * d.s * 0.44, y: d.y - d.s * 0.1 }; };
    var CATCH = ["got it!", "mine!", "catch! 🐬", "over to you!", "yeet!"];
    var SHRIMP = ["wheeee! 🦐", "put me down!!", "best day ever!", "I'm gonna be sick 🤢", "again! again!"];
    talk(ds[0], "wanna play catch? 🐬", 1.2, 2.2);
    g.update = function (o, dt) {
      var alive = ds.filter(function (d) { return swimmers.indexOf(d) >= 0; });
      if (!alive.length) return false;
      if (alive.length < 3) { // de eerste is al weg: het garnaaltje rijdt mee op de neus van de laatste
        var n = nose(alive[alive.length - 1]);
        o.x = n.x; o.y = n.y - o.s * 0.3; o.spin = 0;
        return true;
      }
      t += dt;
      if (t >= DUR) { // gevangen: knikje, en meteen door naar de volgende
        t -= DUR;
        step++;
        var catcher = ds[order[step % order.length]];
        catcher.hop = 0.5;
        if (step % 3 === 1) { catcher.say = pick(CATCH); catcher.sayT = 1.4; }
        if (step % 4 === 2) { o.say = pick(SHRIMP); o.sayT = 1.6; }
      }
      var a = nose(ds[order[step % order.length]]), b = nose(ds[order[(step + 1) % order.length]]), k = t / DUR;
      o.x = a.x + (b.x - a.x) * k;
      o.y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * 95 * U - o.s * 0.3;
      o.spin = (o.spin || 0) + dt * 9;
      return true;
    };
  }
  // 🦭✅ seal of approval: stopt, bekijkt de site, en keurt hem goed
  function approve(y) {
    var D = Math.random() < 0.5 ? 1 : -1, stopX = W * rnd(0.35, 0.65), phase = 0, t0 = 0;
    var o = addSwimmer("seal", D, y, {});
    o.update = function (o, dt) {
      if (phase === 0) {
        o.x += o.dir * o.v * dt;
        if (D > 0 ? o.x >= stopX : o.x <= stopX) { phase = 1; t0 = o.t; o.say = "hmm… 🧐"; o.sayT = 1.8; }
        return true;
      }
      var k = o.t - t0;
      if (phase === 1 && k > 2.2) { phase = 2; o.hop = 0.6; o.say = "this site has my seal of approval ✅🦭"; o.sayT = 3.4; }
      if (phase === 2 && k > 5.8) { phase = 3; }
      if (phase === 3) {
        o.x += o.dir * o.v * dt;
        return o.dir > 0 ? o.x < W + o.s : o.x > -o.s;
      }
      return true;
    };
  }
  // 😴 de luie zeehond: drijft op zijn rug voorbij; een visje probeert hem wakker te maken
  function lazy(y) {
    var D = Math.random() < 0.5 ? 1 : -1, phase = 0;
    var o = addSwimmer("seal", D, y, { v: 28 * U, flipY: true });
    var f = null, zT = 0;
    o.update = function (o, dt) {
      o.x += o.dir * o.v * dt;
      zT -= dt;
      if (zT <= 0 && phase !== 2) { zT = 1.1; notes.push({ x: o.x + o.dir * o.s * 0.3, y: o.y - o.s * 0.3, vy: -30 * U, vx: o.dir * 8 * U, age: 0, c: "z" }); }
      if (phase === 0 && (D > 0 ? o.x > W * 0.38 : o.x < W * 0.62)) { // een visje komt eraan
        phase = 1;
        f = addSwimmer("fish", -D, o.y - o.s * 0.15, { v: 0 });
        f.x = D > 0 ? W + f.s : -f.s;
        f.update = function (fo, dt) {
          if (phase === 1) {
            var tx = o.x + D * (o.s * 0.5 + fo.s * 0.6);
            fo.x += (tx > fo.x ? 1 : -1) * Math.min(Math.abs(tx - fo.x), 130 * U * dt);
            if (Math.abs(tx - fo.x) < 1) {
              phase = 2; fo.t0 = fo.t;
              fo.say = pick(["hey… you ok?", "wake up! 👋", "helloooo?"]); fo.sayT = 1.8;
            }
            return true;
          }
          if (phase === 2) {
            fo.x = o.x + D * (o.s * 0.5 + fo.s * 0.6);
            var k = fo.t - fo.t0;
            if (k > 0.6 && k < 0.7) o.hop = 0.35; // aangetikt
            if (k > 2.1 && !o.said) { o.said = 1; o.say = "5 more minutes… 😴"; o.sayT = 2.6; }
            if (k > 5) { phase = 3; fo.say = "ok then 🤷"; fo.sayT = 1.8; fo.v = 120 * U; }
            return true;
          }
          fo.x += fo.dir * fo.v * dt;
          return fo.dir > 0 ? fo.x < W + fo.s : fo.x > -fo.s;
        };
      }
      if (phase === 2) return true; // blijft drijven terwijl het visje praat
      return o.dir > 0 ? o.x < W + o.s : o.x > -o.s;
    };
  }
  // 🐋 een walvis zwemt dichtbij voorbij; kleine visjes botsen steeds tegen hem aan: "we wanna play!"
  function whalePlay() {
    var D = Math.random() < 0.5 ? 1 : -1;
    var w = addSwimmer("whale", D, H * rnd(0.42, 0.52), { v: 32 * U, alpha: 0.95 });
    w.s = SIZE.whale * U * 0.8;
    w.x = D > 0 ? -w.s : W + w.s;
    var PLAY = ["we wanna play!", "play with us!", "tag, you're it!", "hiii big guy!", "boop!"];
    var kids = [], next = 2.5, said = 0, n = 0;
    w.update = function (o, dt) {
      o.x += o.dir * o.v * dt;
      next -= dt;
      var onScreen = D > 0 ? o.x > W * 0.15 && o.x < W * 0.8 : o.x < W * 0.85 && o.x > W * 0.2;
      if (next <= 0 && onScreen && n < 9) { // een visje (of twee) komt aanstormen
        next = rnd(0.8, 1.6);
        n++;
        var side = Math.random() < 0.5 ? -1 : 1;
        var k = addSwimmer(Math.random() < 0.6 ? "minnow" : "fish", -side, o.y + rnd(-0.18, 0.18) * o.s, { v: 0 });
        k.x = side < 0 ? -k.s : W + k.s;
        k.st = 0;
        if (n % 2 === 1) { k.say = pick(PLAY); k.sayT = 1.8; }
        kids.push(k);
        k.update = function (q, dt) {
          if (q.st === 0) { // naar de walvis toe, BOTS
            var tx = o.x - q.dir * o.s * 0.42;
            q.x += q.dir * 230 * U * dt;
            if (q.dir > 0 ? q.x >= tx : q.x <= tx) {
              q.st = 1; q.back = 0.45;
              for (var i = 0; i < 5; i++) stars.push({ x: q.x + q.dir * q.s * 0.4, y: q.y, vx: rnd(-50, 50) * U, vy: rnd(-60, 10) * U, age: 0 });
              o.hop = 0.2;
            }
            return true;
          }
          if (q.st === 1) { // terugstuiteren, en dan weg
            q.back -= dt;
            q.x -= q.dir * 120 * U * dt;
            if (q.back <= 0) { q.st = 2; q.dir = -q.dir; }
            return true;
          }
          q.x += q.dir * 160 * U * dt;
          return q.x > -q.s * 2 && q.x < W + q.s * 2;
        };
      }
      if (n >= 5 && !said) { said = 1; o.say = pick(["…kids, I'm 200 years old 🐋", "not now, I'm migrating 😮‍💨", "five more minutes…"]); o.sayT = 3; }
      if (n >= 9 && said === 1 && next < 0.2) { said = 2; o.say = "…ok fine, ONE game 🐋💙"; o.sayT = 3; }
      return o.dir > 0 ? o.x < W + o.s : o.x > -o.s;
    };
  }
  // 🪼⚡ de kwallenknuffel: "I love you, jelly!"… ZAP
  function jellyHug(y) {
    var D = Math.random() < 0.5 ? 1 : -1, stopX = W * rnd(0.4, 0.6), phase = 0, t0 = 0;
    var j = addSwimmer("jelly", D, y, { v: 75 * U });
    var f = addSwimmer("fish", -D, y + 6 * U, { v: 0 });
    f.x = D > 0 ? W + f.s : -f.s;
    j.update = function (o, dt) {
      if (phase === 0) {
        o.x += o.dir * o.v * dt;
        if (D > 0 ? o.x >= stopX : o.x <= stopX) phase = 1;
        return true;
      }
      if (phase === 5) { o.x += o.dir * SWIM.jelly * U * dt; return o.dir > 0 ? o.x < W + o.s : o.x > -o.s; }
      return true;
    };
    f.update = function (o, dt) {
      if (phase === 1) { // erheen zwemmen
        var tx = j.x + D * (j.s * 0.42 + o.s * 0.42);
        o.x += (tx > o.x ? 1 : -1) * Math.min(Math.abs(tx - o.x), 140 * U * dt);
        if (Math.abs(tx - o.x) < 1) { phase = 2; t0 = o.t; o.say = "I love you, jelly! 💛"; o.sayT = 1.8; }
        return true;
      }
      var k = o.t - t0;
      if (phase === 2 && k > 1.6) { phase = 3; o.x -= D * 10 * U; o.hop = 0.3; } // knuffel!
      if (phase === 3 && k > 2.1) { // ZAP
        phase = 4;
        for (var i = 0; i < 14; i++) stars.push({ x: (o.x + j.x) / 2, y: o.y, vx: rnd(-120, 120) * U, vy: rnd(-120, 40) * U, age: 0 });
        j.say = "bzzzt ⚡"; j.sayT = 1.2;
        o.zap = 1.1;
        o.x += D * 26 * U;
      }
      if (o.zap > 0) o.zap -= dt;
      if (phase === 4 && k > 3.4) { phase = 5; o.say = "…worth it 😵‍💫"; o.sayT = 2.4; o.v = 70 * U; }
      if (phase === 5) {
        o.x += o.dir * o.v * dt;
        o.spin = Math.sin(o.t * 6) * 0.35; // duizelig
        return o.dir > 0 ? o.x < W + o.s * 1.5 : o.x > -o.s * 1.5;
      }
      return true;
    };
  }
  // 💰 de $PUMP-dief: een visje gapt de $PUMP-rewards uit een wallet… en iemand brengt ze netjes terug
  var PUMP_WALLETS = ["Squeeze's wallet", "the burn wallet", "the Hold prize wallet", "the Says prize wallet", "The Jar"];
  function pumpThief(y) {
    var D = Math.random() < 0.5 ? 1 : -1, wal = pick(PUMP_WALLETS);
    var thief = addSwimmer("fish", D, y, { v: 175 * U, fast: true, carry: "💰" });
    talk(thief, pick(["yoink! 🤭 $PUMP from " + wal, "free $PUMP from " + wal + "! 🏃", "nobody saw that 🤫"]), (W * 0.2) / thief.v, 2.6);
    var wait = 0;
    thief.update = function (o, dt) {
      var gone = o.dir > 0 ? o.x > W + o.s * 1.2 : o.x < -o.s * 1.2;
      if (!gone) { o.x += o.dir * o.v * dt; return true; }
      wait += dt; // even later (onzichtbaar wachten, zodat er geen andere scène tussen komt)
      if (wait < 1.8) return true;
      // de held brengt het terug, en de dief zwemt beschaamd mee
      var hero = addSwimmer(pick(["dolphin", "seal", "dolphin"]), -D, y + 10 * U, { v: 85 * U, carry: "💰" });
      talk(hero, pick(["returning the $PUMP to " + wal + " 😇", "nice try! back to " + wal + " 💚", "found it! this belongs to " + wal]), (W * 0.25) / hero.v, 3);
      var sorry = addSwimmer("fish", -D, y + 40 * U, { v: 85 * U });
      sorry.x += D * hero.s * 0.9;
      talk(sorry, "sorry… 😅", (W * 0.25) / hero.v + 3.2, 2);
      return false;
    };
  }
  // 🏋️ leg day: squats op de bodem
  function legday() {
    var D = Math.random() < 0.5 ? 1 : -1, stopX = W * rnd(0.25, 0.75);
    var g = shrimpTo(D), phase = 0, t0 = 0;
    g.update = function (o, dt) {
      if (phase === 0) {
        o.x += o.dir * o.v * dt;
        if (D > 0 ? o.x >= stopX : o.x <= stopX) { phase = 1; t0 = o.t; o.squat = true; }
        return true;
      }
      var k = o.t - t0;
      var n = Math.floor(k / 1.05); // elke squat ~1 seconde
      if (phase === 1 && n >= 1 && n <= 3 && o.count !== n) { o.count = n; o.say = n + "…"; o.sayT = 0.9; }
      if (phase === 1 && k > 4.2) { phase = 2; o.squat = false; o.still = true; o.say = "never skip leg day 🦐💦"; o.sayT = 2.8; }
      if (phase === 2 && k > 6.8) {
        o.still = false;
        o.x += o.dir * o.v * dt;
        return o.dir > 0 ? o.x < W + o.s : o.x > -o.s;
      }
      return true;
    };
  }
  // verstoppertje: kijkt een paar keer vanaf de rand van het scherm, en verdwijnt dan weer
  function peek() {
    var side = Math.random() < 0.5 ? -1 : 1, k = pick(["fish", "jelly", "dolphin"]);
    var o = addSwimmer(k, -side, rnd(0.3, 0.75) * H, {});
    var out = side < 0 ? o.s * 0.15 : W - o.s * 0.15, hid = side < 0 ? -o.s * 0.7 : W + o.s * 0.7;
    o.x = hid;
    o.update = function (o, dt) {
      var c = o.t % 3.2; // 3 keer kijken
      var k2 = c < 0.5 ? c / 0.5 : c < 2 ? 1 : c < 2.5 ? 1 - (c - 2) / 0.5 : 0;
      o.x = hid + (out - hid) * k2;
      if (c > 0.5 && c < 0.6 && !o.saidAt) { o.say = pick(PEEK); o.sayT = 1.6; o.saidAt = 1; }
      if (c > 2.5) o.saidAt = 0;
      return o.t < 9.6;
    };
  }
  // conga-rij met muzieknootjes
  function conga(y) {
    var dir = Math.random() < 0.5 ? 1 : -1, kinds = ["fish", "jelly", "dolphin", "fish", "shark", "fish", "jelly"], n = 5 + ((Math.random() * 3) | 0);
    var gap = 0;
    for (var i = 0; i < n; i++) {
      var k = kinds[i % kinds.length];
      var o = addSwimmer(k, dir, y, { v: 85 * U, conga: i });
      gap += i ? (SIZE[kinds[(i - 1) % kinds.length]] + SIZE[k]) * U * 0.5 + 10 * U : 0;
      o.x -= dir * gap;
      o.baseY = y;
      if (i === 0) talk(o, "🎵 squeeze squeeze squeeze 🎵", (W * 0.25) / o.v, 3.2);
      if (i === n - 1) talk(o, "🎵 squeeeeeeze 🎵", (W * 0.25) / o.v + 3.4, 2.8);
    }
  }
  // 's avonds: een kwal met een lampje
  function lantern() {
    var dir = Math.random() < 0.5 ? 1 : -1;
    var o = addSwimmer("jelly", dir, H * 0.85, { v: 30 * U, lantern: true });
    o.update = function (o, dt) {
      o.x += o.dir * o.v * dt;
      o.y -= 14 * U * dt;
      return o.dir > 0 ? o.x < W + o.s : o.x > -o.s;
    };
    talk(o, pick(LANTERN), 4);
  }
  // zwemt even met je muis mee (computer)
  function follow() {
    var dir = mouse.x > W / 2 ? -1 : 1;
    var o = addSwimmer("fish", dir, mouse.y, { v: 120 * U });
    talk(o, pick(MOUSE), 1.5);
    var nextLine = 8, lines = MOUSE.concat(["this is fun!", "faster! 😆", "are we lost?", "where to now?"]);
    o.update = function (o, dt) {
      // blijft volgen zolang je beweegt (max 30 s); staat je muis 5 s stil (na minstens 8 s), dan zwaait hij en gaat hij
      var idle = (performance.now() - mouse.at) / 1000;
      var stay = o.t < 30 && (o.t < 8 || idle < 5);
      if (stay || o.t - (o.byeAt || o.t) < 1.6) {
        var tx = mouse.x - o.dir * 70 * U, ty = mouse.y + 30 * U;
        o.x += (tx - o.x) * Math.min(1, dt * 1.4);
        o.y += (ty - o.y) * Math.min(1, dt * 1.4);
        if (Math.abs(tx - o.x) > 30) o.dir = tx > o.x ? 1 : -1;
        if (stay && o.t > nextLine) { nextLine = o.t + rnd(6, 9); o.say = pick(lines); o.sayT = 1.8; }
        if (!stay && !o.byeAt) { o.byeAt = o.t; o.say = "ok bye! 👋"; o.sayT = 1.8; }
        return true;
      }
      o.x += o.dir * 220 * U * dt;
      return o.dir > 0 ? o.x < W + o.s : o.x > -o.s;
    };
  }

  // aantikken: het vriendje schrikt, springt en zegt iets
  document.addEventListener("pointerdown", function (e) {
    if (e.target && e.target.closest && e.target.closest("a,button,input,textarea,select,label,[role=button],canvas:not([aria-hidden])")) return;
    var hit = null, best = 1e9;
    swimmers.forEach(function (o) {
      var d = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      if (d < o.s * 0.55 && d < best && o.kind !== "whale") { best = d; hit = o; }
    });
    if (!hit) return;
    hit.hop = 1;
    hit.say = pick(POKE);
    hit.sayT = 1.8;
    hit.boost = 1.2;
    for (var k = 0; k < 6; k++) stars.push({ x: hit.x, y: hit.y - hit.s * 0.2, vx: rnd(-70, 70) * U, vy: rnd(-90, -10) * U, age: 0 });
  }, { passive: true });

  function step(dt) {
    T += dt;
    // belletjes
    var want = (W * H) / (reduced ? 90000 : 30000);
    if (!NOBUB && bubbles.length < want && Math.random() < dt * 4) bubbles.push({ x: rnd(0, W), y: H + 10, r: rnd(1.5, 4.5) * U, vy: -rnd(18, 42) * U, ph: rnd(0, 6) });
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      b.y += b.vy * dt;
      b.x += Math.sin(T * 1.6 + b.ph) * 10 * U * dt;
    }
    bubbles = bubbles.filter(function (b) { return b.y > -10; });
    // vriendjes
    if (!reduced) {
      nextScene -= dt;
      if (nextScene <= 0 && !swimmers.length) {
        scene();
        nextScene = FEW ? rnd(60, 120) : rnd(22, 50);
      }
    }
    swimmers.forEach(function (o) {
      o.t += dt;
      if (o.revenge && (o.dir > 0 ? o.x > W * 0.86 : o.x < W * 0.14)) revenge(o);
      if (o.hop > 0) o.hop = Math.max(0, o.hop - dt * 2.2);
      if (o.boost > 0) o.boost = Math.max(0, o.boost - dt);
      if (o.sayT > 0 && o.update) o.sayT -= dt;
      if (o.update) { o.done = !o.update(o, dt); return; }
      if (o.conga != null) {
        o.y = o.baseY + Math.sin(o.t * 3 - o.conga * 0.8) * 22 * U;
        if (o.conga === 0 && Math.random() < dt * 2.5) notes.push({ x: o.x, y: o.y - o.s * 0.5, vy: -40 * U, vx: rnd(-15, 15) * U, age: 0, c: pick(["♪", "♫", "♬"]) });
      }
      if (o.bump && !o.bumped && o.mate && Math.abs(o.x - o.mate.x) < (o.s + o.mate.s) * 0.42) {
        // bots! sterretjes, iets zeggen, en terug zwemmen
        o.bumped = o.mate.bumped = true;
        var cx = (o.x + o.mate.x) / 2;
        for (var k = 0; k < 8; k++) stars.push({ x: cx, y: o.y, vx: rnd(-60, 60) * U, vy: rnd(-70, 10) * U, age: 0 });
        var line = pick(BUMP);
        o.say = line[0]; o.sayT = 2.2;
        talk(o.mate, line[1], 1.1, 2.2);
        o.back = o.mate.back = 0.5;
      }
      if (o.back > 0) {
        o.back -= dt;
        if (o.back <= 0) { o.dir = -o.dir; o.v *= 1.3; }
        o.x -= o.dir * 30 * U * dt; // even achteruit stuiteren
      } else o.x += o.dir * o.v * (1 + (o.boost || 0) * 1.5) * dt;
      if (o.sayT > 0) o.sayT -= dt;
    });
    swimmers = swimmers.filter(function (o) { return o.update ? !o.done : o.dir > 0 ? o.x < W + o.s * 1.2 : o.x > -o.s * 1.2; });
    notes.forEach(function (n) { n.age += dt; n.y += n.vy * dt; n.x += n.vx * dt; });
    notes = notes.filter(function (n) { return n.age < 2.2; });
    stars.forEach(function (s) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * U * dt; });
    stars = stars.filter(function (s) { return s.age < 0.9; });
  }

  function bubbleText(x, y, text) {
    ctx.font = "700 " + Math.round(13 * U + 2) + "px 'Bricolage Grotesque', ui-rounded, system-ui, sans-serif";
    var w = ctx.measureText(text).width + 20, h = 26 * U + 4;
    var bx = Math.max(6, Math.min(W - w - 6, x - w / 2)), by = Math.max(6, y - h);
    ctx.fillStyle = "rgba(244,251,242,.95)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 13);
    else ctx.rect(bx, by, w, h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 6, by + h - 1);
    ctx.lineTo(x + 6, by + h - 1);
    ctx.lineTo(x, by + h + 8);
    ctx.fill();
    ctx.fillStyle = "#07140c";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 10, by + h / 2 + 1);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(220,255,240,.38)";
    ctx.lineWidth = 1;
    bubbles.forEach(function (b) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 6.28);
      ctx.stroke();
    });
    // ver weg eerst (walvis), dan de rest
    swimmers.slice().sort(function (a, b) { return (a.kind === "whale" ? 0 : 1) - (b.kind === "whale" ? 0 : 1); }).forEach(function (o) {
      var im = IMG[o.kind];
      if (!(im.complete && im.naturalWidth)) return;
      var h = (im.naturalHeight / im.naturalWidth) * o.s;
      var bob = o.squat ? Math.abs(Math.sin(o.t * 3)) * 9 * U
        : o.still ? 0
        : FLOOR[o.kind] ? -Math.abs(Math.sin(o.t * (o.kind === "shrimp" ? 5 : 9))) * (o.kind === "shrimp" ? 22 : 3) * U : Math.sin(o.t * 2 + o.ph) * 7 * U;
      if (o.hop) bob -= Math.sin(o.hop * Math.PI) * 40 * U; // geschrokken sprongetje
      if (o.lantern) { // warm lampje
        var lx = o.x + o.s * 0.05, ly = o.y + bob + o.s * 0.55;
        var g = ctx.createRadialGradient(lx, ly, 0, lx, ly, o.s * 1.6);
        g.addColorStop(0, "rgba(255,210,120,.45)");
        g.addColorStop(1, "rgba(255,210,120,0)");
        ctx.fillStyle = g;
        ctx.fillRect(lx - o.s * 1.6, ly - o.s * 1.6, o.s * 3.2, o.s * 3.2);
        ctx.fillStyle = "#ffd98a";
        ctx.beginPath();
        ctx.arc(lx, ly, 5 * U, 0, 6.28);
        ctx.fill();
      }
      ctx.save();
      ctx.globalAlpha = o.zap > 0 ? (Math.sin(o.zap * 40) > 0 ? 1 : 0.25) : o.alpha; // ZAP: knipperen
      ctx.translate(o.x, o.y + bob);
      if (!FLOOR[o.kind] && o.dir < 0) ctx.scale(-1, 1); // de plaatjes kijken naar rechts
      ctx.rotate((o.spin || 0) + (FLOOR[o.kind] ? Math.sin(o.t * 10) * 0.04 : Math.sin(o.t * (o.fast ? 14 : 2.4) + o.ph) * (o.fast ? 0.12 : 0.05)));
      if (o.squat) ctx.scale(1, 1 - Math.abs(Math.sin(o.t * 3)) * 0.18); // door de knieën
      if (o.flipY) ctx.scale(1, -1); // op zijn rug
      ctx.drawImage(im, -o.s / 2, -h / 2, o.s, h);
      ctx.restore();
      if (o.carry) { // iets in de bek (de $PUMP-buidel)
        ctx.font = Math.round(26 * U + 4) + "px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(o.carry, o.x + (o.dir > 0 ? 1 : -1) * o.s * 0.5, o.y + bob + o.s * 0.08);
      }
      if (o.say && o.sayT > 0) bubbleText(o.x, o.y + bob - h / 2 - 6, o.say);
    });
    ctx.font = "700 " + Math.round(18 * U + 4) + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    notes.forEach(function (n) {
      ctx.globalAlpha = 1 - n.age / 2.2;
      ctx.fillStyle = "#dcffd5";
      ctx.fillText(n.c, n.x, n.y);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffe36b";
    stars.forEach(function (s) {
      ctx.globalAlpha = 1 - s.age / 0.9;
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * 6.283, rr = (i % 2 ? 2.5 : 6) * U;
        ctx.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
      }
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hidden) { step(dt); draw(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__life = { chase: chase, pinch: pinch, boxer: boxer, legday: legday, juggle: juggle, approve: approve, lazy: lazy, whalePlay: whalePlay, jellyHug: jellyHug, pumpThief: pumpThief, peek: peek, conga: conga, lantern: lantern, follow: follow, mouse: mouse, scene: scene, swimmers: function () { return swimmers; }, tick: function (n) { for (var i = 0; i < n; i++) step(0.05); draw(); } }; // voor een snelle controle
})();
