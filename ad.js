// ad.js — toont de betaalde advertentie van dat moment; geen betaalde advertentie = niets (wens gebruiker 2026-10-31: onze eigen links niet meer in dit blok).
// Staat er een <div data-ad-slot></div> op de pagina, dan komt hij daar; anders als klein balkje onderaan.
(function () {
  var cfg = window.SQUEEZE_CONFIG || {};
  var worker = (cfg.WORKER_URL || "https://squeeze-state.inferno2199.workers.dev").replace(/\/$/, "");
  fetch(worker + "/tg/ad", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (a) {
      if (!a || !a.url || !a.label || !a.sponsored) return;
      var css = document.createElement("style");
      css.textContent =
        // geen balk: los zwevende tekst in het midden
        ".sqz-ad{display:flex;align-items:center;justify-content:center;gap:.6rem;max-width:100%;box-sizing:border-box;padding:.4rem .5rem;" +
        "background:none;border:0;color:#f3f7f2;text-shadow:0 1px 12px rgba(0,0,0,.95),0 0 18px rgba(0,0,0,.6);" +
        "font:800 1.15rem ui-rounded,system-ui,sans-serif}" +
        ".sqz-ad a{color:#f3f7f2;text-decoration:none;text-align:center}" +
        ".sqz-ad small{color:#7cff6b;font-weight:800;white-space:nowrap}" +
        ".sqz-ad-float{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);" +
        "z-index:50;width:max-content;max-width:92vw}" +
        "[data-ad-slot] .sqz-ad{margin:1rem auto 0;width:max-content;max-width:min(100%,460px)}" +
        // altijd boven de zee-achtergrond (op games.html lag die eroverheen)
        "[data-ad-slot]{position:relative;z-index:2}";
      document.head.appendChild(css);
      var box = document.createElement("div");
      box.className = "sqz-ad";
      var link = document.createElement("a");
      link.href = a.url;
      link.target = "_blank";
      link.rel = "noopener sponsored";
      link.textContent = a.label;
      var tag = document.createElement("small");
      tag.textContent = "📣 AD ·";
      box.appendChild(tag);
      box.appendChild(link);
      // geen kruisje: een (betaalde) advertentie kan niet weggeklikt worden
      var slot = document.querySelector("[data-ad-slot]");
      if (slot) slot.appendChild(box);
      else {
        box.classList.add("sqz-ad-float");
        document.body.appendChild(box);
      }
    })
    .catch(function () {});
})();
