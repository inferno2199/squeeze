// prelaunch.js — staat de bot in pre-launch (/menu → 🚀 Pre-launch mode), dan zijn de spellen een oefenronde:
// geen prijzen tot de launch. Deze pagina's zeggen dat dan ook (spellen-overzicht, Hold en Says).
(function () {
  "use strict";
  var C = window.SQUEEZE_CONFIG || {};
  var API = (C.WORKER_URL || "https://squeeze-state.inferno2199.workers.dev").replace(/\/$/, "");
  fetch(API + "/settings", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
    if (!d || !d.prelaunch) return;
    // spellen-overzicht: "Win … daily" → oefenen
    document.querySelectorAll(".win").forEach(function (el) { el.textContent = "Practice now · prizes start at launch 🚀"; });
    // Hold / Says: een duidelijke regel bovenaan het prijzen-blok
    document.querySelectorAll(".card.prize").forEach(function (card) {
      var p = document.createElement("p");
      p.className = "prelaunch-note";
      p.textContent = "🏋️ Practice round: real prizes start at launch. Your scores still count on the daily board!";
      p.style.cssText = "margin:0 0 .6rem;font-weight:800;color:var(--green,#7cff6b)";
      var h = card.querySelector("h2");
      if (h && h.nextSibling) card.insertBefore(p, h.nextSibling); else card.prepend(p);
    });
  }).catch(function () {});
})();
