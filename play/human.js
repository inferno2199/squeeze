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

  // geeft een eenmalige token terug (of null)
  async function token() {
    if (!KEY) return null;
    const ok = await load();
    if (!ok || !window.turnstile) return null;
    return new Promise((resolve) => {
      let settled = false;
      const done = (t) => {
        if (settled) return;
        settled = true;
        pending = null;
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
      setTimeout(() => done(null), 20000);
    });
  }

  load();
  window.SqzHuman = { token, enabled: !!KEY };
})();
