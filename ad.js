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
        ".sqz-ad{display:flex;align-items:center;gap:.6rem;max-width:100%;box-sizing:border-box;padding:.55rem .6rem .55rem .9rem;" +
        "border-radius:999px;background:rgba(3,12,8,.82);border:1px solid rgba(124,255,107,.28);color:#f3f7f2;" +
        "font:600 .9rem ui-rounded,system-ui,sans-serif;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}" +
        ".sqz-ad a{color:#7cff6b;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
        ".sqz-ad small{opacity:.6;font-weight:500;white-space:nowrap}" +
        ".sqz-ad button{margin-left:auto;background:none;border:0;color:#8fa596;font-size:1.05rem;cursor:pointer;padding:0 .3rem}" +
        ".sqz-ad-float{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);" +
        "z-index:50;width:min(92vw,460px)}" +
        "[data-ad-slot] .sqz-ad{margin:1rem auto 0;width:min(100%,460px)}";
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
