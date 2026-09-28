// Squeeze state — Cloudflare Worker + Durable Object.
// Eén bron van waarheid: haalt de prijs op (max 1x per 10 sec), berekent
// combo / ringen / inkt en geeft dezelfde stand aan iedere bezoeker.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname !== "/state" && url.pathname !== "/") {
      return new Response("Not found", { status: 404, headers: CORS });
    }
    // Korte edge-cache: bij drukte raakt niet elke bezoeker het object
    const cache = caches.default;
    const key = new Request(url.origin + "/state");
    const hit = await cache.match(key);
    if (hit) return hit;

    const stub = env.SQUEEZE.get(env.SQUEEZE.idFromName("main"));
    const r = await stub.fetch("https://squeeze/state");
    const res = new Response(r.body, {
      headers: { ...CORS, "content-type": "application/json", "cache-control": "public, max-age=4" },
    });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },

  // Elke minuut, ook als niemand kijkt, zodat geen ATH gemist wordt
  async scheduled(_evt, env, ctx) {
    const stub = env.SQUEEZE.get(env.SQUEEZE.idFromName("main"));
    ctx.waitUntil(stub.fetch("https://squeeze/poll"));
  },
};

export class SqueezeState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.lastPoll = 0;
    this.polling = null;
    this.s = null;
    state.blockConcurrencyWhile(async () => {
      this.s = Object.assign(fresh(), (await state.storage.get("s")) || {});
    });
  }

  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/poll") this.lastPoll = 0;
    await this.maybePoll();
    return new Response(JSON.stringify(view(this.s)), {
      headers: { "content-type": "application/json" },
    });
  }

  maybePoll() {
    const every = Number(this.env.POLL_MS) || 10000;
    if (Date.now() - this.lastPoll < every - 500) return;
    if (!this.polling) {
      this.polling = this.poll().finally(() => (this.polling = null));
    }
    return this.polling;
  }

  async poll() {
    this.lastPoll = Date.now();
    const mint = (this.env.MINT || "").trim();
    if (!mint) {
      this.s.live = false;
      return;
    }
    // Volgorde: DexScreener → GeckoTerminal → Jupiter (alleen met key)
    const sources = [() => fromDex(mint), () => fromGecko(mint)];
    if (this.env.JUP_API_KEY) sources.push(() => fromJupiter(mint, this.env.JUP_API_KEY));
    let snap = null;
    for (const get of sources) {
      try {
        snap = await get();
      } catch {
        snap = null;
      }
      if (snap && snap.price > 0) break;
    }
    if (!snap) {
      this.s.live = false;
      return;
    }
    const before = this.s.rings;
    const e = this.env;
    step(this.s, snap, {
      graceMs: (Number(e.GRACE_MIN) || 5) * 60000,
      reclaimDip: Number(e.RECLAIM_DIP) || 0.15,
      runStep: Number(e.RUN_STEP) || 0.3,
      cooldownMs: (Number(e.RING_COOLDOWN_S) || 30) * 1000,
      inkUsd: Number(e.INK_USD) || 250,
    }, Date.now());
    this.s.live = true;
    this.s.updatedAt = Date.now();
    if (this.s.rings !== before || Date.now() - (this.s.savedAt || 0) > 60000) {
      this.s.savedAt = Date.now();
      await this.state.storage.put("s", this.s);
    }
  }
}

function fresh() {
  return {
    launchAt: 0, firstSeenAt: 0, ath: 0, graceHigh: 0, graceDone: false,
    lastRingPrice: 0, lastRingAt: 0, dipped: false, rings: 0, history: [],
    combo: 0, prevPrice: 0, prevBuysH1: null, prevVolH1: null,
    priceInput: 0, h24: null, source: "",
    athSeq: 0, inkSeq: 0, live: false, updatedAt: 0, savedAt: 0,
  };
}

function view(s) {
  return {
    live: s.live, priceInput: s.priceInput, combo: s.combo, rings: s.rings,
    h24: s.h24, athSeq: s.athSeq, inkSeq: s.inkSeq, launchAt: s.launchAt || s.firstSeenAt,
    history: s.history.slice(-100), updatedAt: s.updatedAt, source: s.source,
  };
}

// Zelfde regels als app.js in de site
function step(s, snap, rules, now) {
  if (s.source && snap.source !== s.source) {
    s.prevBuysH1 = null;
    s.prevVolH1 = null;
  }
  s.source = snap.source;
  if (!s.firstSeenAt) s.firstSeenAt = now;
  if (snap.createdAt > 0 && (!s.launchAt || snap.createdAt < s.launchAt)) s.launchAt = snap.createdAt;
  const launch = s.launchAt || s.firstSeenAt;

  const p = snap.price;
  const delta = s.prevPrice ? (p / s.prevPrice - 1) * 100 : 0;
  const m5 = Number.isFinite(snap.m5) ? snap.m5 : delta;
  const tot = (snap.buysM5 || 0) + (snap.sellsM5 || 0);
  const pressure = tot ? snap.buysM5 / tot : 0.5;
  const newBuys =
    s.prevBuysH1 != null && snap.buysH1 != null ? Math.max(0, snap.buysH1 - s.prevBuysH1) : 0;
  const dVol = s.prevVolH1 != null && snap.volH1 != null ? snap.volH1 - s.prevVolH1 : 0;

  // combo + inkt
  const up = delta > 0.05 || (delta > -0.05 && newBuys > 0 && pressure > 0.55);
  if (up) s.combo = Math.min(s.combo + 1, 99);
  else if (delta < -0.3) s.combo = 0;
  if (dVol >= rules.inkUsd && newBuys > 0 && delta >= 0) s.inkSeq++;

  // ringen
  if (now - launch < rules.graceMs) {
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
        s.athSeq++;
        s.lastRingPrice = p;
        s.lastRingAt = now;
        s.dipped = false;
        s.history.push({ n: s.rings, kind, t: now - launch, mcap: snap.mcap || null });
        if (s.history.length > 100) s.history.shift();
      }
      s.ath = p;
    }
  }

  s.priceInput = clamp(0.65 * Math.tanh(m5 / 6) + 0.35 * Math.tanh(delta / 1.5), -1, 1);
  s.h24 = Number.isFinite(snap.h24) ? snap.h24 : null;
  s.prevPrice = p;
  s.prevBuysH1 = snap.buysH1 ?? null;
  s.prevVolH1 = snap.volH1 ?? null;
}

async function getJSON(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// DexScreener: werkt op de bonding curve én na migratie (ander pair, zelfde call)
async function fromDex(mint) {
  const j = await getJSON("https://api.dexscreener.com/latest/dex/tokens/" + mint);
  const pairs = (j.pairs || []).filter((p) => p.baseToken && p.baseToken.address === mint);
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
    createdAt: Number.isFinite(created) ? created : 0,
    source: "dexscreener",
  };
}

// Backup 1: GeckoTerminal (geen key nodig, ±30 calls/min gratis)
async function fromGecko(mint) {
  const j = await getJSON(
    "https://api.geckoterminal.com/api/v2/networks/solana/tokens/" + mint + "/pools?page=1",
    { accept: "application/json" }
  );
  const pools = (j.data || []).filter(
    (p) => p.relationships?.base_token?.data?.id === "solana_" + mint
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
    createdAt: Number.isFinite(created) ? created : 0,
    source: "geckoterminal",
  };
}

// Backup 2: alleen prijs (geen buys), dus combo/inkt pauzeren dan
async function fromJupiter(mint, key) {
  const j = await getJSON("https://api.jup.ag/price/v3?ids=" + mint, { "x-api-key": key });
  const d = j[mint];
  if (!d || !(d.usdPrice > 0)) return null;
  return {
    price: d.usdPrice, m5: NaN, h24: Number(d.priceChange24h),
    buysM5: 0, sellsM5: 0, buysH1: null, volH1: null, mcap: null, createdAt: 0, source: "jupiter",
  };
}
