// ad.js — toont de advertentie van dat moment (of je eigen link als er geen advertentie is).
// Staat er een <div data-ad-slot></div> op de pagina, dan komt hij daar; anders als klein balkje onderaan.
(function () {
  try {
    if (sessionStorage.getItem("sqz-ad-closed")) return; // weggeklikt in dit bezoek
  } catch (e) {}
  var cfg = window.SQUEEZE_CONFIG || {};
  var worker = (cfg.WORKER_URL || "https://squeeze-state.inferno2199.workers.dev").replace(/\/$/, "");
  fetch(worker + "/tg/ad", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (a) {
      if (!a || !a.url || !a.label) return;
      var css = document.createElement("style");
      css.textContent =
        // geen balk: los zwevende tekst in het midden, met een kruisje om weg te klikken
        ".sqz-ad{display:flex;align-items:center;justify-content:center;gap:.6rem;max-width:100%;box-sizing:border-box;padding:.4rem .5rem;" +
        "background:none;border:0;color:#f3f7f2;text-shadow:0 1px 12px rgba(0,0,0,.95),0 0 18px rgba(0,0,0,.6);" +
        "font:700 .95rem ui-rounded,system-ui,sans-serif}" +
        ".sqz-ad a{color:#7cff6b;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
        ".sqz-ad small{opacity:.6;font-weight:500;white-space:nowrap}" +
        ".sqz-ad button{background:none;border:0;color:#a9bfb0;font-size:1.15rem;cursor:pointer;padding:0 .3rem;text-shadow:inherit}" +
        ".sqz-ad-float{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);" +
        "z-index:50;width:max-content;max-width:92vw}" +
        "[data-ad-slot] .sqz-ad{margin:1rem auto 0;width:max-content;max-width:min(100%,460px)}";
      document.head.appendChild(css);
      var box = document.createElement("div");
      box.className = "sqz-ad";
      var link = document.createElement("a");
      link.href = a.url;
      link.target = "_blank";
      link.rel = "noopener sponsored";
      link.textContent = a.label;
      box.appendChild(link);
      if (a.sponsored) {
        var tag = document.createElement("small");
        tag.textContent = "Sponsored";
        box.appendChild(tag);
      }
      var x = document.createElement("button");
      x.setAttribute("aria-label", "Close");
      x.textContent = "×";
      x.onclick = function () {
        box.remove();
        try { sessionStorage.setItem("sqz-ad-closed", "1"); } catch (e) {}
      };
      box.appendChild(x);
      var slot = document.querySelector("[data-ad-slot]");
      if (slot) slot.appendChild(box);
      else {
        box.classList.add("sqz-ad-float");
        document.body.appendChild(box);
      }
    })
    .catch(function () {});
})();
