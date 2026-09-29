// Squeeze — data + UI. Leest config.js, stuurt de octopus aan.
(function () {
  "use strict";

  const C = Object.assign(
    {
      TICKER: "$SQUEEZE", MINT: "", BUY_URL: "", WORKER_URL: "", X_URL: "", TELEGRAM_URL: "",
      POLL_MS: 10000, DROUGHT_MIN: 15, GRACE_MIN: 5, RECLAIM_DIP: 0.15, RUN_STEP: 0.3, RING_COOLDOWN_S: 30, INK_USD: 250,
    },
    window.SQUEEZE_CONFIG || {}
  );
  const params = new URLSearchParams(location.search);
  const DEV = params.has("dev");
  const FORCE_DEMO = params.has("demo");
  const MINT = (C.MINT || "").trim();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const RULES = {
    graceMs: C.GRACE_MIN * 60000,
    reclaimDip: C.RECLAIM_DIP,
    runStep: C.RUN_STEP,
    cooldownMs: C.RING_COOLDOWN_S * 1000,
    inkUsd: C.INK_USD,
    droughtMs: C.DROUGHT_MIN * 60000,
    sampleMs: 60000,
  };

  const $ = (id) => document.getElementById(id);
  const MILESTONES = [1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7, 2.5e7, 5e7, 1e8];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- opmaak ----------
  function fmtSince(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 60) return "+" + min + " min";
    const h = Math.floor(min / 60);
    if (h < 24) return "+" + h + " h " + String(min % 60).padStart(2, "0") + " min";
    return "+" + Math.floor(h / 24) + " d " + (h % 24) + " h";
  }
  function fmtUsd(v) {
    if (!(v > 0)) return "";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + "M";
    if (v >= 1e3) return "$" + Math.round(v / 1e3) + "k";
    return "$" + Math.round(v);
  }

  // ---------- UI ----------
  const ui = {
    change: $("stat-change"),
    combo: $("stat-combo"),
    rings: $("stat-rings"),
    status: $("status"),
    statusText: $("status-text"),
    comboChip: $("combo-chip"),
    ringChip: $("ring-chip"),
    pokeChip: $("poke-chip"),
    timeline: $("timeline"),
    list: $("timeline-list"),
    more: $("timeline-more"),
    mcap: $("stat-mcap"),
    chart: $("chart"),
    spark: $("spark"),
    range: $("chart-range"),
  };

  function pop(el, text) {
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  function setChange(pct) {
    if (pct == null || !isFinite(pct)) {
      ui.change.textContent = "–";
      ui.change.className = "";
      return;
    }
    ui.change.textContent = (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct).toFixed(1) + "%";
    ui.change.className = pct > 0 ? "up" : pct < 0 ? "down" : "";
  }

  let shownCombo = 0;
  function setCombo(n) {
    ui.combo.textContent = "x" + n;
    if (n >= 2 && n > shownCombo) pop(ui.comboChip, "x" + n);
    shownCombo = n;
  }

  // Tijdlijn: nieuwste bovenaan, laatste 5 zichtbaar, rest uitklapbaar
  let history = [];
  let shownRings = 0;
  let expanded = false;
  function renderTimeline() {
    const visible = history.filter((r) => r.n <= shownRings);
    ui.timeline.hidden = visible.length === 0;
    const rows = visible.slice().reverse();
    const list = expanded ? rows : rows.slice(0, 5);
    ui.list.textContent = "";
    for (const r of list) {
      const li = document.createElement("li");
      if (r.n === shownRings) li.className = "newest";
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = "Ring " + r.n;
      li.appendChild(n);
      if (r.kind === "reclaim") {
        const b = document.createElement("span");
        b.className = "badge";
        b.textContent = "Reclaim";
        li.appendChild(b);
      }
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = fmtSince(r.t);
      li.appendChild(t);
      const m = document.createElement("span");
      m.className = "m";
      m.textContent = fmtUsd(r.mcap);
      li.appendChild(m);
      ui.list.appendChild(li);
    }
    ui.more.hidden = rows.length <= 5;
    ui.more.textContent = expanded ? "Show fewer" : "Show all " + rows.length + " rings";
  }
  ui.more.addEventListener("click", () => {
    expanded = !expanded;
    renderTimeline();
  });

  function setRingsShown(n) {
    shownRings = n;
    ui.rings.textContent = String(n);
    renderTimeline();
  }

  // Aangeroepen door Squeeze op het moment van de knal
  function onRing(n) {
    if (typeof sea !== "undefined" && sea) sea.wave();
    if (typeof friends !== "undefined" && friends) friends.onRing();
    const r = history.find((x) => x.n === n);
    pop(ui.ringChip, r && r.kind === "reclaim" ? "Reclaim!" : "Ring " + n);
    setRingsShown(n);
  }

  // ---------- marketcap + mini-chart ----------
  function setMcap(v) {
    ui.mcap.textContent = v > 0 ? fmtUsd(v) : "–";
  }

  let chartData = { hist: [], rings: [], launchAt: 0 };
  function drawChart() {
    const h = chartData.hist;
    ui.chart.hidden = !h || h.length < 3;
    if (ui.chart.hidden) return;
    const cv = ui.spark;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const t0 = h[0][0];
    const t1 = h[h.length - 1][0];
    const span = Math.max(1, t1 - t0);
    // log-schaal: een x10 ziet er even groot uit bij $10k als bij $1M
    const logs = h.map((d) => Math.log(d[1]));
    let lo = Math.min(...logs);
    let hi = Math.max(...logs);
    if (hi - lo < 0.02) { hi += 0.01; lo -= 0.01; }
    const pad = 8;
    const X = (t) => pad + ((t - t0) / span) * (W - pad * 2);
    const Y = (p) => pad + (1 - (Math.log(p) - lo) / (hi - lo)) * (H - pad * 2);

    // vlak
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(124,255,107,0.22)");
    g.addColorStop(1, "rgba(124,255,107,0)");
    ctx.beginPath();
    h.forEach((d, i) => (i ? ctx.lineTo(X(d[0]), Y(d[1])) : ctx.moveTo(X(d[0]), Y(d[1]))));
    ctx.lineTo(X(t1), H);
    ctx.lineTo(X(t0), H);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    // lijn
    ctx.beginPath();
    h.forEach((d, i) => (i ? ctx.lineTo(X(d[0]), Y(d[1])) : ctx.moveTo(X(d[0]), Y(d[1]))));
    ctx.strokeStyle = "#7cff6b";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // ringen als stipjes op de lijn (reclaim = witte rand)
    const priceAt = (t) => {
      for (let i = 1; i < h.length; i++) {
        if (h[i][0] >= t) {
          const a = h[i - 1];
          const b = h[i];
          const k = (t - a[0]) / Math.max(1, b[0] - a[0]);
          return a[1] + (b[1] - a[1]) * k;
        }
      }
      return h[h.length - 1][1];
    };
    for (const r of chartData.rings) {
      if (r.n > shownRings) continue;
      const t = chartData.launchAt + r.t;
      if (t < t0 || t > t1 + 60000) continue;
      const x = X(Math.min(t, t1));
      const y = Y(r.p > 0 ? r.p : priceAt(t));
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#7cff6b";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = r.kind === "reclaim" ? "#f3f7f2" : "#030604";
      ctx.stroke();
    }

    // nu
    const last = h[h.length - 1];
    ctx.beginPath();
    ctx.arc(X(last[0]), Y(last[1]), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#f3f7f2";
    ctx.fill();

    ui.range.textContent = span >= 23 * 3600000 ? "Last 24h" : "Since launch";
  }
  window.addEventListener("resize", drawChart);

  // Full chart-link
  if (MINT) {
    const fc = $("full-chart");
    fc.href = "https://dexscreener.com/solana/" + MINT;
    fc.hidden = false;
  }

  function setStatus(kind, text) {
    ui.status.dataset.kind = kind;
    ui.statusText.textContent = text;
  }

  // Buy-knop, CA, socials
  const buyUrl = C.BUY_URL || (MINT ? "https://pump.fun/coin/" + MINT : "");
  const buy = $("buy");
  if (buyUrl) {
    buy.href = buyUrl;
  } else {
    buy.setAttribute("aria-disabled", "true");
    buy.removeAttribute("href");
    buy.textContent = "Buy on Pump.fun (soon)";
  }
  document.querySelectorAll("[data-ticker]").forEach((el) => (el.textContent = C.TICKER));

  if (MINT) {
    $("ca").hidden = false;
    $("ca-text").textContent = MINT.slice(0, 4) + "…" + MINT.slice(-4);
    $("ca-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(MINT);
        $("ca-copy").textContent = "Copied";
      } catch {
        $("ca-copy").textContent = "Copy failed";
      }
      setTimeout(() => ($("ca-copy").textContent = "Copy CA"), 1600);
    });
  }
  const links = [["X", C.X_URL], ["Telegram", C.TELEGRAM_URL]].filter(([, u]) => u);
  if (links.length) {
    const nav = $("links");
    nav.hidden = false;
    for (const [label, url] of links) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = label;
      nav.appendChild(a);
    }
  }

  // ---------- regels (identiek aan worker/worker.js) ----------
  function freshState() {
    return {
      launchAt: 0, firstSeenAt: 0, ath: 0, graceHigh: 0, graceDone: false,
      lastRingPrice: 0, lastRingAt: 0, dipped: false, rings: 0, history: [],
      combo: 0, prevPrice: 0, prevBuysH1: null, prevVolH1: null, prevBuysM5: null,
      lastBuyAt: 0, lastBuys: 0, drought: false,
      priceInput: 0, h24: null, source: "", mcap: null, hist: [],
    };
  }

  function step(s, snap, rules, now) {
    const ev = [];
    if (s.source && snap.source !== s.source) {
      s.prevBuysH1 = null;
      s.prevVolH1 = null;
      s.prevBuysM5 = null;
    }
    s.source = snap.source;
    if (!s.firstSeenAt) s.firstSeenAt = now;
    if (snap.createdAt > 0 && (!s.launchAt || snap.createdAt < s.launchAt)) s.launchAt = snap.createdAt;
    const launch = s.launchAt || s.firstSeenAt;

    const p = snap.price;
    const delta = s.prevPrice ? (p / s.prevPrice - 1) * 100 : 0;
    const m5 = isFinite(snap.m5) ? snap.m5 : delta;
    const tot = (snap.buysM5 || 0) + (snap.sellsM5 || 0);
    const pressure = tot ? snap.buysM5 / tot : 0.5;
    const newBuys =
      s.prevBuysH1 != null && snap.buysH1 != null ? Math.max(0, snap.buysH1 - s.prevBuysH1) : 0;
    const dVol = s.prevVolH1 != null && snap.volH1 != null ? snap.volH1 - s.prevVolH1 : 0;

    // combo + inkt
    const up = delta > 0.05 || (delta > -0.05 && newBuys > 0 && pressure > 0.55);
    if (up) s.combo = Math.min(s.combo + 1, 99);
    else if (delta < -0.3) s.combo = 0;
    if (dVol >= rules.inkUsd && newBuys > 0 && delta >= 0) ev.push("ink");

    // buys: knijpjes, droogte (15 min geen buy) en wakker worden
    const m5Up =
      s.prevBuysM5 != null && snap.buysM5 != null ? Math.max(0, snap.buysM5 - s.prevBuysM5) : 0;
    const buysNow = Math.max(newBuys, m5Up);
    const hasBuyData = snap.buysM5 != null && snap.source !== "jupiter";
    if (!s.lastBuyAt) s.lastBuyAt = now;
    if (buysNow > 0) s.lastBuyAt = now;
    else if ((snap.buysM5 || 0) > 0) s.lastBuyAt = Math.max(s.lastBuyAt, now - 5 * 60000);
    s.lastBuys = buysNow;
    if (buysNow > 0) ev.push("buy");
    if (s.drought && buysNow > 0) {
      s.drought = false;
      ev.push("wake");
    } else if (!s.drought && hasBuyData && now - s.lastBuyAt >= rules.droughtMs) {
      s.drought = true;
    }

    // ringen
    if (now - launch < rules.graceMs) {
      // eerste minuten: alleen de high onthouden, geen ringen
      s.graceHigh = Math.max(s.graceHigh, p);
      s.ath = Math.max(s.ath, p);
    } else {
      if (!s.graceDone) {
        s.graceDone = true;
        const base = Math.max(s.graceHigh, s.ath) || p;
        s.ath = base;
        s.lastRingPrice = base;
      }
      if (p <= s.ath * (1 - rules.reclaimDip)) s.dipped = true;
      if (p > s.ath) {
        const kind = s.dipped ? "reclaim" : p >= s.lastRingPrice * (1 + rules.runStep) ? "run" : null;
        if (kind && now - s.lastRingAt >= rules.cooldownMs) {
          s.rings++;
          s.lastRingPrice = p;
          s.lastRingAt = now;
          s.dipped = false;
          s.history.push({ n: s.rings, kind, t: now - launch, mcap: snap.mcap || null, p });
          if (s.history.length > 100) s.history.shift();
          ev.push("ath");
        }
        s.ath = p;
      }
    }

    // prijsgeschiedenis voor de mini-chart (1 punt per minuut, max 24 uur)
    if (snap.mcap > 0) s.mcap = snap.mcap;
    const lastH = s.hist[s.hist.length - 1];
    if (!lastH || now - lastH[0] >= rules.sampleMs) s.hist.push([now, p]);
    else if (p > 0) lastH[1] = p;
    while (s.hist.length > 2 && now - s.hist[0][0] > 24 * 3600000) s.hist.shift();

    // mijlpalen voor de kwal (marketcap)
    if (snap.mcap > 0) {
      let hit = 0;
      for (const v of MILESTONES) if (snap.mcap >= v && v > (s.milestone || 0)) hit = v;
      if (hit) {
        if (s.msInit) ev.push("milestone");
        s.milestone = hit;
      }
      s.msInit = true;
    }

    s.priceInput = clamp(0.65 * Math.tanh(m5 / 6) + 0.35 * Math.tanh(delta / 1.5), -1, 1);
    s.h24 = isFinite(snap.h24) ? snap.h24 : null;
    s.prevPrice = p;
    s.prevBuysH1 = snap.buysH1 ?? null;
    s.prevVolH1 = snap.volH1 ?? null;
    s.prevBuysM5 = snap.buysM5 ?? null;
    return ev;
  }

  // ---------- zee ----------
  const sea = window.Sea
    ? new window.Sea($("sea"), { reducedMotion: reduced, anchor: $("stage") })
    : null;
  if (sea) sea.start();

  // ---------- octopus ----------
  const sq = new window.Squeeze($("stage"), { reducedMotion: reduced, onRing });
  const friends = window.Friends
    ? new window.Friends(sq, {
        reducedMotion: reduced,
        onChip: (t) => {
          // kwal zweeft bovenaan: chipje onderaan tonen
          ui.ringChip.classList.add("low");
          pop(ui.ringChip, t);
          setTimeout(() => ui.ringChip.classList.remove("low"), 1500);
        },
      })
    : null;

  let lastCombo = 0;
  function apply(s, events, instant = false) {
    sq.setPrice(s.priceInput);
    sq.setCombo(s.combo);
    setCombo(s.combo);
    if (s.combo >= 10 && lastCombo < 10 && !instant) sq.euphoria(3);
    lastCombo = s.combo;
    sq.setDrought(!!s.drought);
    if (friends) {
      friends.onState({ priceInput: s.priceInput || 0, combo: s.combo || 0, drought: !!s.drought });
      if (events.includes("buy")) friends.onBuy(s.lastBuys || 1);
      if (events.includes("milestone")) friends.onMilestone(s.milestone);
    }
    if (sea) {
      sea.setPrice(s.priceInput || 0);
      sea.setDrought(!!s.drought);
      sea.setCombo(s.combo || 0);
      if (events.includes("buy")) sea.puff(s.lastBuys || 1);
    }
    if (events.includes("wake")) {
      sq.wake();
      pop(ui.ringChip, "He's awake!");
    }
    if (events.includes("buy")) sq.buyPulse(Math.min(1, (s.lastBuys || 1) / 5));
    setMcap(s.mcap);
    chartData = { hist: s.hist || [], rings: s.history || [], launchAt: s.launchAt || s.firstSeenAt || 0 };
    drawChart();
    setChange(s.h24);
    history = s.history || [];
    if (instant) {
      sq.setRings(s.rings);
      setRingsShown(s.rings);
    }
    for (const e of events) if (e === "ath") sq.ath();
    if (events.includes("ink")) sq.inkBurst();
  }

  function idle() {
    sq.setPrice(0);
    sq.setCombo(0);
    if (sea) {
      sea.setPrice(0);
      sea.setCombo(0);
    }
  }

  // Aantikken
  const stage = $("stage");
  stage.addEventListener("pointerdown", (e) => {
    if (friends && friends.hit(e.clientX, e.clientY)) return;
    if (!sq.hitTest(e.clientX, e.clientY)) return;
    const r = sq.poke();
    if (r === "poke" && navigator.vibrate) navigator.vibrate(12);
    if (r === "annoyed") {
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
      pop(ui.pokeChip, "Stop poking.");
    }
  });
  stage.addEventListener("pointermove", (e) => {
    stage.style.cursor = sq.hitTest(e.clientX, e.clientY) ? "pointer" : "default";
  });

  // ---------- bronnen ----------
  async function fetchJSON(url, ms = 6000) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(to);
    }
  }

  function parseDex(json, mint) {
    const pairs = ((json && json.pairs) || []).filter((p) => p.baseToken && p.baseToken.address === mint);
    if (!pairs.length) return null;
    const created = Math.min(...pairs.map((p) => p.pairCreatedAt || Infinity));
    pairs.sort(
      (a, b) =>
        ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0) ||
        ((b.volume && b.volume.h24) || 0) - ((a.volume && a.volume.h24) || 0)
    );
    const p = pairs[0];
    const price = Number(p.priceUsd);
    if (!(price > 0)) return null;
    const pc = p.priceChange || {};
    const tx = p.txns || {};
    const vol = p.volume || {};
    return {
      price, m5: Number(pc.m5), h24: Number(pc.h24),
      buysM5: tx.m5 ? tx.m5.buys : 0, sellsM5: tx.m5 ? tx.m5.sells : 0,
      buysH1: tx.h1 ? tx.h1.buys : null, volH1: vol.h1 != null ? Number(vol.h1) : null,
      mcap: Number(p.marketCap || p.fdv) || null,
      createdAt: isFinite(created) ? created : 0,
      source: "dexscreener",
    };
  }

  function parseGecko(json, mint) {
    const pools = ((json && json.data) || []).filter(
      (p) => p.relationships && p.relationships.base_token &&
        p.relationships.base_token.data && p.relationships.base_token.data.id === "solana_" + mint
    );
    if (!pools.length) return null;
    const created = Math.min(...pools.map((p) => Date.parse(p.attributes.pool_created_at) || Infinity));
    pools.sort((a, b) => Number(b.attributes.reserve_in_usd || 0) - Number(a.attributes.reserve_in_usd || 0));
    const a = pools[0].attributes;
    const price = Number(a.base_token_price_usd);
    if (!(price > 0)) return null;
    const pc = a.price_change_percentage || {};
    const tx = a.transactions || {};
    const vol = a.volume_usd || {};
    return {
      price, m5: Number(pc.m5), h24: Number(pc.h24),
      buysM5: tx.m5 ? tx.m5.buys : 0, sellsM5: tx.m5 ? tx.m5.sells : 0,
      buysH1: tx.h1 ? tx.h1.buys : null, volH1: vol.h1 != null ? Number(vol.h1) : null,
      mcap: Number(a.market_cap_usd || a.fdv_usd) || null,
      createdAt: isFinite(created) ? created : 0,
      source: "geckoterminal",
    };
  }

  // Prijs direct uit de browser: DexScreener, anders GeckoTerminal
  async function directSnapshot() {
    try {
      const snap = parseDex(await fetchJSON("https://api.dexscreener.com/latest/dex/tokens/" + MINT), MINT);
      if (snap) return snap;
    } catch {}
    const g = await fetchJSON("https://api.geckoterminal.com/api/v2/networks/solana/tokens/" + MINT + "/pools?page=1");
    return parseGecko(g, MINT);
  }

  // Poller die stopt als het tabblad verborgen is
  function poller(fn, ms) {
    let timer = 0;
    const run = async () => {
      clearTimeout(timer);
      if (document.hidden) return;
      await fn();
      timer = setTimeout(run, ms);
    };
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) run();
    });
    run();
  }

  // A) Worker: gedeelde stand voor iedereen
  function startWorker() {
    const base = C.WORKER_URL.replace(/\/+$/, "");
    let seen = null;
    let fails = 0;
    poller(async () => {
      try {
        const d = await fetchJSON(base + "/state");
        if (!d || !d.live) throw new Error("not live");
        fails = 0;
        const s = {
          priceInput: d.priceInput, combo: d.combo, h24: d.h24, rings: d.rings,
          history: d.history || [], drought: d.drought, lastBuys: d.lastBuys,
          mcap: d.mcap, hist: d.hist || [], launchAt: d.launchAt, milestone: d.milestone,
        };
        if (!seen) {
          apply(s, [], true);
        } else {
          const ev = [];
          const anim = Math.min(Math.max(0, d.athSeq - seen.athSeq), 3);
          if (anim > 0) {
            sq.setRings(d.rings - anim);
            setRingsShown(d.rings - anim);
            for (let i = 0; i < anim; i++) ev.push("ath");
          }
          if (d.inkSeq > seen.inkSeq) ev.push("ink");
          if (d.buySeq > seen.buySeq) ev.push("buy");
          if (d.wakeSeq > seen.wakeSeq) ev.push("wake");
          if ((d.milestoneSeq || 0) > seen.milestoneSeq) ev.push("milestone");
          apply(s, ev);
        }
        seen = {
          athSeq: d.athSeq, inkSeq: d.inkSeq, buySeq: d.buySeq || 0,
          wakeSeq: d.wakeSeq || 0, milestoneSeq: d.milestoneSeq || 0,
        };
        setStatus("live", "Live");
      } catch {
        if (++fails < 2) return;
        // Worker even weg: ringen/tijdlijn bevriezen (blijft voor iedereen gelijk),
        // alleen humeur + % direct ophalen zodat Squeeze blijft leven.
        try {
          const snap = await directSnapshot();
          if (!snap) throw new Error("no data");
          sq.setPrice(clamp(Math.tanh((isFinite(snap.m5) ? snap.m5 : 0) / 6), -1, 1));
          setChange(isFinite(snap.h24) ? snap.h24 : null);
          setStatus("wait", "Live price, shared rings reconnecting");
        } catch {
          idle();
          setStatus("wait", "Price feed paused, retrying");
        }
      }
    }, C.POLL_MS);
  }

  // B) Direct (zonder Worker): ringen per bezoeker, onthouden in deze browser
  function startDirect() {
    const key = "squeeze:v2:" + MINT;
    let s = freshState();
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved) s = Object.assign(freshState(), saved, { prevPrice: 0, prevBuysH1: null, prevVolH1: null, combo: 0 });
    } catch {}
    apply(s, [], true);
    let fails = 0;
    poller(async () => {
      try {
        const snap = await directSnapshot();
        if (!snap) throw new Error("no pair yet");
        fails = 0;
        apply(s, step(s, snap, RULES, Date.now()));
        try {
          localStorage.setItem(key, JSON.stringify(s));
        } catch {}
        setStatus("live", "Live");
      } catch {
        if (++fails >= 2) {
          idle();
          setStatus("wait", "Waiting for chart data");
        }
      }
    }, C.POLL_MS);
  }

  // C) Preview: nep-chart zodat Squeeze al leeft voor de launch
  function startDemo() {
    const s = freshState();
    const rules = Object.assign({}, RULES, { graceMs: 15000 * 20, cooldownMs: 4000 * 20 });
    const t0 = Date.now();
    let price = 0.00001;
    const start = price;
    const hist = [];
    let buysH1 = 0;
    let volH1 = 0;
    const buyWin = [];
    let regime = "chop";
    let left = 4;
    const tick = () => {
      if (--left <= 0) {
        const r = Math.random();
        if (regime === "chop" && r < 0.14) { regime = "dead"; left = 38 + ((Math.random() * 6) | 0); }
        else if (regime !== "pump" && r < 0.5) { regime = "pump"; left = 10 + ((Math.random() * 8) | 0); }
        else if (regime === "pump" && r < 0.45) { regime = "dump"; left = 4 + ((Math.random() * 4) | 0); }
        else { regime = "chop"; left = 4 + ((Math.random() * 5) | 0); }
      }
      const drift = regime === "pump" ? 0.024 : regime === "dump" ? -0.04 : 0;
      const noise = (Math.random() - 0.5) * (regime === "chop" ? 0.012 : regime === "dead" ? 0.003 : 0.01);
      price *= Math.exp(drift + noise);
      hist.push(price);
      if (hist.length > 12) hist.shift();
      buyWin.push(0);
      const buys = regime === "pump" ? 3 + ((Math.random() * 5) | 0) : regime === "chop" ? (Math.random() * 3) | 0 : 0;
      const sells = regime === "dump" ? 3 + ((Math.random() * 4) | 0) : regime === "dead" ? 0 : (Math.random() * 2) | 0;
      buysH1 += buys;
      buyWin[buyWin.length - 1] = buys;
      if (buyWin.length > 10) buyWin.shift();
      const buysM5 = buyWin.reduce((a, b) => a + b, 0);
      volH1 += buys * (30 + Math.random() * 60);
      if (regime === "pump" && Math.random() < 0.12) volH1 += 260 + Math.random() * 400;
      const snap = {
        price, m5: (price / hist[0] - 1) * 100, h24: (price / start - 1) * 100,
        buysM5, sellsM5: sells * 4, buysH1, volH1,
        mcap: price * 1e9, createdAt: t0, source: "demo",
      };
      // demo-tijd loopt 20x sneller, zodat de tijdlijn realistisch oogt
      apply(s, step(s, snap, rules, t0 + (Date.now() - t0) * 20));
    };
    setStatus("demo", "Preview. Squeeze goes live with the token.");
    tick();
    setInterval(() => {
      if (!document.hidden) tick();
    }, reduced ? 2600 : 1500);
  }

  // D) ?dev=1 — handbediening voor clips
  function startDev() {
    $("dev").hidden = false;
    const s = freshState();
    const t0 = Date.now();
    let mcap = 12000;
    const slider = $("dev-price");
    slider.addEventListener("input", () => {
      s.priceInput = Number(slider.value);
      s.h24 = s.priceInput * 40;
      apply(s, []);
    });
    $("dev").addEventListener("click", (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      if (act === "ath" || act === "reclaim") {
        s.rings++;
        const last = s.hist[s.hist.length - 1];
        const np = last[1] * (act === "ath" ? 1.3 : 1.15);
        const tNow = last[0] + 60000;
        s.hist.push([tNow, np]);
        s.mcap = np * 1e9;
        s.history.push({ n: s.rings, kind: act === "ath" ? "run" : "reclaim", t: tNow - s.launchAt, mcap: s.mcap, p: np });
        apply(s, ["ath"]);
      }
      if (act === "ink") apply(s, ["ink"]);
      if (act === "combo") { s.combo++; s.lastBuys = 2; apply(s, ["buy"]); }
      if (act === "buy") { s.lastBuys = 3; apply(s, ["buy"]); }
      if (act.startsWith("f-") && friends) {
        const kind = act.slice(2);
        if (kind === "crab-steal") friends.force("crab", { steal: true });
        else if (kind === "jelly") friends.force("jelly", { value: 1e6 });
        else if (kind === "jelly-drift") friends.force("jelly", { drift: true });
        else friends.force(kind);
      }
      if (act === "sleep") { s.drought = true; apply(s, []); }
      if (act === "wake") { if (s.drought) { s.drought = false; apply(s, ["wake"]); } }
      if (act === "reset") { s.combo = 0; apply(s, []); }
    });
    // nep-geschiedenis zodat de mini-chart in clips al gevuld is
    const now0 = Date.now();
    let pr = 0.000012;
    for (let i = 60; i >= 0; i--) {
      pr *= Math.exp((Math.random() - 0.42) * 0.06);
      s.hist.push([now0 - i * 60000, pr]);
    }
    s.mcap = pr * 1e9;
    s.launchAt = now0 - 60 * 60000;
    setStatus("demo", "Dev mode");
    apply(s, [], true);
  }

  // Squeeze kijkt een beetje mee met je muis/vinger
  window.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    sq.lookAt(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  });

  // ---------- start ----------
  sq.load()
    .then(() => {
      if (friends) friends.load();
      sq.start();
      document.body.classList.add("ready");
      if (DEV) startDev();
      else if (!MINT || FORCE_DEMO) startDemo();
      else if (C.WORKER_URL) startWorker();
      else startDirect();
    })
    .catch((err) => {
      setStatus("wait", "Squeeze could not load. Check the assets folder.");
      console.error(err);
    });
})();
