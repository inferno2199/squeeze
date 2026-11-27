// tabs.js — de balk onderaan, ALLEEN als de site als app draait (2026-11-27)
//
// Wens gebruiker: alles op één plek, zodat niemand meer via een menu of een link hoeft. Maar een gewone
// bezoeker op zijn laptop moet er niets van merken, dus de balk verschijnt uitsluitend in "standalone":
// dat is wat de browser zegt als de site vanaf het beginscherm geopend is.
(function () {
  "use strict";
  var app = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (!app) return;

  var C = window.SQUEEZE_CONFIG || {};
  var TG = C.TELEGRAM_URL || "https://t.me/SqueezeOctoSquad";
  // 🐙 Make staat op een ander adres (de generator), dus die opent buiten de app-schil. Dat is onvermijdelijk
  // tot de generator hier zelf draait; de andere vier blijven binnen.
  var TABS = [
    { id: "play", naam: "Play", url: "games.html", bij: ["games", "hold", "says", "stack", "whichjar"], teken: "M4 3l10 7-10 7z" },
    { id: "make", naam: "Make", url: "https://generator.squeezeocto.com", uit: true, teken: "M10 2a8 8 0 100 16 8 8 0 000-16zm0 3v10M5 10h10" },
    { id: "me", naam: "Me", url: "me.html", bij: ["me", "id", "verify"], teken: "M3 17a7 7 0 0114 0M10 9a3.5 3.5 0 100-7 3.5 3.5 0 000 7" },
    { id: "reef", naam: "Reef", url: "reef.html", bij: ["reef", "nfts", "jar"], teken: "M3 15c3-2 3-6 7-6s4 4 7 6" },
    { id: "squad", naam: "Squad", url: TG, uit: true, teken: "M3 14a4 4 0 014-4h6a4 4 0 014 4M10 8a3 3 0 100-6 3 3 0 000 6" },
  ];

  var hier = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "");

  var css = document.createElement("style");
  css.textContent =
    // 🤖 Android geeft geen safe-area-inset (die is daar 0), dus zonder ondergrens plakken de knopjes tegen
    // de onderrand en vallen ze half onder de gebaren-balk. Op de iPhone duwt de insets ze vanzelf omhoog.
    "body{padding-bottom:calc(68px + max(env(safe-area-inset-bottom,0px),10px)) !important}" +
    ".sqz-tabs{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;" +
    "background:rgba(5,18,12,.94);backdrop-filter:blur(14px);border-top:1px solid rgba(124,255,107,.18);" +
    "padding-bottom:max(env(safe-area-inset-bottom,0px),10px)}" +
    ".sqz-tabs a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 2px 7px;" +
    "color:#8aa396;text-decoration:none;font:600 11px/1 system-ui,sans-serif;-webkit-tap-highlight-color:transparent}" +
    ".sqz-tabs a.aan{color:#7cff6b}" +
    ".sqz-tabs svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}" +
    ".sqz-tabs a:active{transform:scale(.94)}";
  document.head.appendChild(css);

  var bar = document.createElement("nav");
  bar.className = "sqz-tabs";
  bar.setAttribute("aria-label", "Squeeze");
  TABS.forEach(function (t) {
    var a = document.createElement("a");
    a.href = t.url;
    if (t.uit) { a.target = "_blank"; a.rel = "noopener"; }
    if (t.bij && t.bij.indexOf(hier) >= 0) { a.className = "aan"; a.setAttribute("aria-current", "page"); }
    a.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="' + t.teken + '"/></svg><span>' + t.naam + "</span>";
    bar.appendChild(a);
  });
  (document.body || document.documentElement).appendChild(bar);
})();
