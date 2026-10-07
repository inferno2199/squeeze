// Squeeze — instellingen. Dit is het enige bestand dat je hoeft aan te passen.
window.SQUEEZE_CONFIG = {
  TICKER: "$SQUEEZE",

  // Pump.fun mint-adres (CA). Leeg = preview-modus met nep-chart.
  MINT: "",

  // Leeg laten = automatisch https://pump.fun/coin/<MINT>
  BUY_URL: "",

  // Cloudflare Worker: dezelfde ringen/combo bij iedereen.
  WORKER_URL: "https://squeeze-state.inferno2199.workers.dev",

  // Socials (leeg = niet tonen)
  X_URL: "https://x.com/SqueezeOcto",
  TELEGRAM_URL: "https://t.me/SqueezeOcto",

  // Cloudflare Turnstile ("ben je een mens?") voor de spellen. Leeg = uit.
  TURNSTILE_SITE_KEY: "0x4AAAAAAFP8QC6dZrVG0T5L",

  POLL_MS: 10000,       // prijs ophalen, elke 10 sec

  // Ringen (zelfde getallen in worker/wrangler.toml zetten)
  GRACE_MIN: 5,         // eerste 5 min na launch: geen ringen
  RECLAIM_DIP: 0.15,    // eerst 15% onder de ATH, dan ATH breken = "Reclaim!"
  RUN_STEP: 0.3,        // doorlopende pump: ring per +30% boven de vorige ring
  RING_COOLDOWN_S: 30,  // minimaal 30 sec tussen twee ringen

  INK_USD: 250,         // buy vanaf $250 geeft inkt
  DROUGHT_MIN: 15,      // 15 min geen buy = Squeeze valt in slaap
};
