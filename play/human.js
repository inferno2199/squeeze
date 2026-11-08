// human.js — onzichtbare "ben je een mens?"-controle (Cloudflare Turnstile) voor runs die meetellen.
// Zet TURNSTILE_SITE_KEY in config.js. Leeg = geen controle (alles werkt gewoon).
(function () {
  "use strict";
  const C = window.SQUEEZE_CONFIG || {};
  const KEY = (C.TURNSTILE_SITE_KEY || "").trim();
  let ready = null;
  let wid = null;
  let pending = null;

  function load() {
    if (!KEY) return Promise.resolve(false);
    if (ready) return ready;
    ready = new Promise((res) => {
      window.__sqzTsReady = () => res(true);
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__sqzTsReady&render=explicit";
      s.async = true;
      s.onerror = () => res(false);
      document.head.appendChild(s);
    });
    return ready;
  }

  let hintEl = null;
  const HINT1 = "Checking you're human… tick the box if it shows up 🐙";
  const HINT2 = "Taking long? Open this page in Chrome or Safari (not inside Telegram or X) 🐙";
  function showHint(on, txt) {
    if (!on) { if (hintEl) hintEl.style.display = "none"; return; }
    if (!hintEl) {
      hintEl = document.createElement("div");
      hintEl.style.cssText = "position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:61;background:rgba(7,20,11,.92);color:#7cff6b;font:700 14px/1.3 system-ui,sans-serif;padding:8px 14px;border-radius:12px;text-align:center;max-width:90vw";
      document.body.appendChild(hintEl);
    }
    hintEl.textContent = txt || HINT1;
    hintEl.style.display = "block";
  }

  // geeft een eenmalige token terug (of null)
  async function token() {
    if (!KEY) return null;
    const ok = await load();
    if (!ok || !window.turnstile) return null;
    return new Promise((resolve) => {
      let settled = false;
      // ⏳ 2026-11-08 (Noel: "it takes a long while for the Cloudflare check to come"): duurt de check langer dan 3 s,
      // dan een regeltje boven het vakje, zodat je weet dat je moet wachten (of het vakje aanvinken).
      const hint = setTimeout(() => showHint(true, HINT1), 3000);
      // 💡 2026-11-08: na 10 s de tip voor in-app browsers (Telegram/X), waar het vakje vaak nooit komt
      const hint2 = setTimeout(() => showHint(true, HINT2), 10000);
      const done = (t) => {
        if (settled) return;
        settled = true;
        pending = null;
        clearTimeout(hint);
        clearTimeout(hint2);
        showHint(false);
        resolve(t || null);
      };
      pending = done;
      try {
        if (wid === null) {
          const box = document.createElement("div");
          box.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:60";
          document.body.appendChild(box);
          wid = window.turnstile.render(box, {
            sitekey: KEY,
            execution: "execute",
            appearance: "interaction-only", // alleen zichtbaar als Cloudflare twijfelt
            callback: (t) => pending && pending(t),
            "error-callback": () => pending && pending(null),
            "timeout-callback": () => pending && pending(null),
          });
        } else {
          window.turnstile.reset(wid);
        }
        window.turnstile.execute(wid);
      } catch (e) {
        done(null);
      }
      setTimeout(() => done(null), 60000); // was 20 s: te kort voor trage verbindingen (2026-11-08)
    });
  }

  load();
  window.SqzHuman = { token, enabled: !!KEY };
})();
