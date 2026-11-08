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

  function showErr(code) {
    try { console.warn("turnstile error", code); } catch (e) {}
    setTimeout(() => {
      showHint(true, "Cloudflare check failed (error " + String(code || "?").slice(0, 12) + "). Try mobile data or another browser, and tell us the code 🐙");
      setTimeout(() => showHint(false), 9000);
    }, 0);
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
          // 👀 2026-11-08 (Noel, SPOOKY: "no box comes up", 70% van de checks nooit af): het vakje staat nu ALTIJD zichtbaar
          // onder de knop van het spel (na #tries-line), zodat niets het kan verbergen; geen plek = vast onderaan zoals eerst.
          const box = document.createElement("div");
          box.className = "sqz-human";
          const anchor = document.getElementById("tries-line");
          if (anchor && anchor.parentNode) { box.style.cssText = "display:flex;justify-content:center;margin:10px auto 4px;min-height:70px"; anchor.parentNode.insertBefore(box, anchor.nextSibling); }
          else { box.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:60"; document.body.appendChild(box); }
          wid = window.turnstile.render(box, {
            sitekey: KEY,
            execution: "execute",
            appearance: "always",
            callback: (t) => pending && pending(t),
            // foutcode van Cloudflare tonen (bv. 300030), zodat we weten waar het aan ligt
            "error-callback": (code) => { showErr(code); if (pending) pending(null); return true; },
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
