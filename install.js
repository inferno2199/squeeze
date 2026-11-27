// install.js — "zet Squeeze op je beginscherm" (2026-11-27)
//
// Alleen voor wie de app NOG NIET heeft. Draait de site al als app, dan doet dit bestand niets.
// Eén keer wegklikken = weg voor 60 dagen, want niets is vervelender dan een balk die blijft terugkomen.
(function () {
  "use strict";
  var app = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (app) return;

  var SLEUTEL = "sqz-install-weg";
  try { if (Number(localStorage.getItem(SLEUTEL)) > Date.now()) return; } catch (e) {}

  var iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var safari = iOS && !/crios|fxios|edgios/i.test(navigator.userAgent);
  var prompt = null; // Android geeft ons een echte installeerknop

  function wegklikken() {
    try { localStorage.setItem(SLEUTEL, String(Date.now() + 60 * 86400000)); } catch (e) {}
    var b = document.getElementById("sqz-inst");
    if (b) b.remove();
  }

  function toon(metKnop) {
    if (document.getElementById("sqz-inst")) return;
    var css = document.createElement("style");
    css.textContent =
      "#sqz-inst{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:70;" +
      "display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;" +
      "background:rgba(5,18,12,.96);backdrop-filter:blur(14px);border:1px solid rgba(124,255,107,.3);" +
      "box-shadow:0 10px 30px rgba(0,0,0,.45);font:600 13px/1.35 system-ui,sans-serif;color:#dff3e6}" +
      "#sqz-inst img{width:34px;height:34px;border-radius:9px;flex:0 0 auto}" +
      "#sqz-inst p{margin:0;flex:1}" +
      "#sqz-inst b{color:#7cff6b}" +
      "#sqz-inst button{border:0;border-radius:10px;padding:8px 12px;font:700 13px system-ui,sans-serif;cursor:pointer}" +
      "#sqz-inst .ja{background:#7cff6b;color:#042a13}" +
      "#sqz-inst .nee{background:transparent;color:#7d9a8a;font-size:20px;line-height:1;padding:4px 6px}";
    document.head.appendChild(css);

    var bar = document.createElement("div");
    bar.id = "sqz-inst";
    bar.innerHTML =
      '<img src="/assets/pwa/icon-192.png" alt="" />' +
      "<p>" + (metKnop
        ? "Put <b>Squeeze</b> on your home screen and play fullscreen."
        : "Add <b>Squeeze</b> to your home screen: tap <b>Share</b> below, then <b>Add to Home Screen</b>.") +
      "</p>" +
      (metKnop ? '<button class="ja">Install</button>' : "") +
      '<button class="nee" aria-label="Close">&times;</button>';
    document.body.appendChild(bar);

    bar.querySelector(".nee").onclick = wegklikken;
    var ja = bar.querySelector(".ja");
    if (ja) ja.onclick = function () {
      if (!prompt) return wegklikken();
      prompt.prompt();
      prompt.userChoice.finally(wegklikken);
      prompt = null;
    };
  }

  // Android/Chrome: de browser zegt zelf wanneer het kan
  addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    prompt = e;
    setTimeout(function () { toon(true); }, 4000);
  });

  // iPhone in Safari: daar bestaat die knop niet, dus leggen we uit waar hij zit.
  // Niet aan "load" hangen: is de pagina al geladen als dit script start, dan komt dat moment nooit meer.
  function straks(fn, ms) {
    if (document.readyState === "complete") return setTimeout(fn, ms);
    addEventListener("load", function () { setTimeout(fn, ms); });
  }
  if (safari) straks(function () { toon(false); }, 6000);
  addEventListener("appinstalled", wegklikken);
})();
