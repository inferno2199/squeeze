// Squeeze — instellingen. Dit is het enige bestand dat je hoeft aan te passen.
window.SQUEEZE_CONFIG = {
  TICKER: "$SQUEEZE",

  // Pump.fun mint-adres (CA). Leeg = preview-modus met nep-chart.
  MINT: "",

  // Leeg laten = automatisch https://pump.fun/coin/<MINT>
  BUY_URL: "",

  // Cloudflare Worker (map /worker) voor dezelfde ringen/combo bij iedereen.
  // Leeg = site haalt DexScreener zelf op (werkt, maar ringen per bezoeker).
  WORKER_URL: "",

  // Socials (leeg = niet tonen)
  X_URL: "",
  TELEGRAM_URL: "",

  POLL_MS: 10000,       // prijs ophalen, elke 10 sec

  // Ringen (zelfde getallen in worker/wrangler.toml zetten)
  GRACE_MIN: 5,         // eerste 5 min na launch: geen ringen
  RECLAIM_DIP: 0.15,    // eerst 15% onder de ATH, dan ATH breken = "Reclaim!"
  RUN_STEP: 0.3,        // doorlopende pump: ring per +30% boven de vorige ring
  RING_COOLDOWN_S: 30,  // minimaal 30 sec tussen twee ringen

  INK_USD: 250,         // buy vanaf $250 geeft inkt
};
