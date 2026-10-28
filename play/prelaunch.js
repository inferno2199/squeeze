// prelaunch.js — staat de bot in pre-launch (/menu → 🚀 Pre-launch mode), dan zijn de spellen een oefenronde:
// geen prijzen tot de launch. Deze pagina's zeggen dat dan ook (spellen-overzicht, Hold en Says).
(function () {
  "use strict";
  var C = window.SQUEEZE_CONFIG || {};
  var API = (C.WORKER_URL || "https://squeeze-state.inferno2199.workers.dev").replace(/\/$/, "");
  fetch(API + "/settings", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
    if (!d || !d.prelaunch) return;
    // 🎟 Squeeze Week (7 dagen): elke dag winnen de beste Hold- én de beste Says-speler elk een gratis NFT
    var pm = d.premint && d.premint.on && /^\d{4}-\d{2}-\d{2}$/.test(d.premint.start) ? d.premint : null;
    if (pm) {
      var start = new Date(pm.start + "T00:00:00");
      var days = Math.floor((Date.now() - start.getTime()) / 86400000);
      var soon = days < 0, live = days >= 0 && days < 7;
      if (soon || live) {
        var line = soon ? "🎟 Squeeze Week starts " + start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }) + "!" : "🎟 Squeeze Week: every day the best Hold player AND the best Says player each win a free Squeeze NFT (mint it from Wed 4 Nov)!";
        document.querySelectorAll(".win").forEach(function (el) { el.textContent = soon ? "Practice now · free mints from " + start.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " 🎟" : "🎟 Win a free NFT mint this week"; });
        document.querySelectorAll(".card.prize").forEach(function (card) {
          var p = document.createElement("p");
          p.className = "prelaunch-note";
          p.innerHTML = line + " <span style=\"font-weight:500\">To win: be in our Telegram group and link this same wallet once with /id. Each contest once per person.</span>" +
            (soon ? "" : " <span style=\"display:block;margin-top:.35rem\">🎮 Bonus: playing with your X name = DOUBLE chance in our daily $50 SOL giveaway on X (@SqueezeOcto)!</span>"); // idee Zuko 2026-10-28
          p.style.cssText = "margin:0 0 .6rem;font-weight:800;color:var(--green,#7cff6b)";
          var h = card.querySelector("h2");
          if (h && h.nextSibling) card.insertBefore(p, h.nextSibling); else card.prepend(p);
        });
        return;
      }
    }
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
