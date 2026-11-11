// prelaunch.js — staat de bot in pre-launch (/menu → 🚀 Pre-launch mode), dan zijn de spellen een oefenronde:
// geen prijzen tot de launch. Deze pagina's zeggen dat dan ook (spellen-overzicht, Hold en Says).
(function () {
  "use strict";
  var C = window.SQUEEZE_CONFIG || {};
  var API = (C.WORKER_URL || "https://squeeze-state.inferno2199.workers.dev").replace(/\/$/, "");
  // 👀 bekijken zonder launch: ?prz=hs (Hold + Says vandaag) of ?prz=sj (Stack + Which Jar? vandaag)
  var demo = (location.search.match(/[?&]prz=(hs|sj)\b/) || [])[1];
  if (demo) {
    var HS = ["hold", "says"], SJ = ["stack", "whichjar"];
    setTimeout(function () { dailyPrizes({ active: true, today: demo === "hs" ? HS : SJ, tomorrow: demo === "hs" ? SJ : HS }); }, 0);
  }
  if (!demo) fetch(API + "/settings", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
    if (d && !d.prelaunch && d.prizes && d.prizes.active) return dailyPrizes(d.prizes);
    // 🚀 launchdag (2026-11-11): token live, maar de eerste prijsronde begint pas om 20:00 CET
    if (d && !d.prelaunch && d.prizes && !d.prizes.active && d.prizes.start) return launchDay();
    if (!d || !d.prelaunch) return;
    // 🎮 Game Week (2026-11-05): 4 spellen, elke dag per spel 🥇 $25 · 🥈 $10 in SOL · 🥉 gratis NFT. Start 20:00 de avond vóór de eerste dag.
    var gw = d.gameweek && d.gameweek.on && /^\d{4}-\d{2}-\d{2}$/.test(d.gameweek.first) ? d.gameweek : null;
    if (gw) {
      var first = new Date(gw.first + "T12:00:00");
      var days = Number(gw.days) || 4;
      var pz = gw.prizes || [25, 10];
      var startMs = Date.parse(gw.first + "T20:00:00+01:00") - 86400000; // vrijdag 20:00 CET (november = wintertijd)
      var endMs = startMs + days * 86400000;
      var nowMs = Date.now();
      if (nowMs < endMs) {
        var soonGw = nowMs < startMs;
        var last = new Date(first.getTime() + (days - 1) * 86400000);
        var fmt = function (x) { return x.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };
        var head = soonGw ? "🎮 Game Week starts " + new Date(startMs).toLocaleString("en-GB", { weekday: "long", hour: "numeric", minute: "2-digit" }) + "!" : "🎮 Game Week is ON (" + fmt(first) + " – " + fmt(last) + ")";
        document.querySelectorAll(".win").forEach(function (el) { el.textContent = (soonGw ? "Practice now · " : "") + "🎮 Win $" + pz[0] + " in SOL daily"; });
        document.querySelectorAll(".card.prize").forEach(function (card) {
          var p = document.createElement("div");
          p.className = "prelaunch-note";
          p.innerHTML = head + "<span style=\"display:block;margin-top:.35rem\">Every day in this game: 🥇 $" + pz[0] + " in SOL · 🥈 $" + pz[1] + " in SOL · 🥉 a free Squeeze NFT.</span>" +
            "<span style=\"display:block;margin-top:.35rem;font-weight:500\">To win: hold a Squeeze Squad NFT in this wallet, be in our Telegram group and link + verify this same wallet with /id. Missing one = the prize goes to the next player. No NFT? You can still play for fun.</span>";
          p.style.cssText = "margin:0 0 .6rem;font-weight:800;color:var(--green,#7cff6b)";
          var h = card.querySelector("h2");
          if (h && h.nextSibling) card.insertBefore(p, h.nextSibling); else card.prepend(p);
          // Hold/Says: de gewone prijzentabel geldt niet tijdens de Game Week
          card.querySelectorAll(".split, .muted, .pool").forEach(function (x) { x.style.display = "none"; }); // hidden werkt niet tegen display:grid
        });
        return;
      }
    }
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

  function launchDay() {
    document.querySelectorAll(".win").forEach(function (el) { el.textContent = "Just for fun until 8 PM CET · first prize round starts tonight 🚀"; });
    document.querySelectorAll(".card.prize").forEach(function (card) {
      var p = document.createElement("p");
      p.className = "prelaunch-note";
      p.textContent = "🚀 Launch day: until 8 PM CET this round is just for fun, no prizes. The first prize round (Squeeze Hold + Squeeze Says) starts tonight at 8 PM CET, winners tomorrow at 8 PM CET.";
      p.style.cssText = "margin:0 0 .6rem;font-weight:800;color:var(--green,#7cff6b)";
      var h = card.querySelector("h2");
      if (h && h.nextSibling) card.insertBefore(p, h.nextSibling); else card.prepend(p);
    });
  }

  // 🏆 dagprijzen na de launch (2026-11-10): elke dag hebben 2 van de 4 spellen prijzen, de dag erna de andere 2.
  // Spellen-overzicht: per kaart "Prizes TODAY" of "Just for fun today". Spelpagina: een duidelijke regel bovenaan het prijzen-blok.
  var NAME = { hold: "🫧 Squeeze Hold", says: "🧠 Squeeze Says", stack: "🧱 Squeeze Stack", whichjar: "🫙 Which Jar?" };
  var COIN = { hold: "$PUMP", stack: "$PUMP", says: "$SQUEEZE", whichjar: "$SQUEEZE" };
  function gameOf(href) { var m = String(href || "").match(/(hold|says|stack|whichjar)\.html/); return m ? m[1] : null; }
  function dailyPrizes(P) {
    var today = P.today || [], names = function (L) { return L.map(function (g) { return NAME[g]; }).join(" + "); };
    var green = "color:var(--green,#7cff6b)";
    // spellen-overzicht
    document.querySelectorAll(".game-card").forEach(function (a) {
      var g = gameOf(a.getAttribute("href")), w = a.querySelector(".win");
      if (!g || !w) return;
      var on = today.indexOf(g) >= 0;
      w.textContent = on ? "🏆 Prizes TODAY · win " + COIN[g] : "🎮 Just for fun today · prizes tomorrow";
      w.style.cssText = on ? "font-weight:900;" + green : "opacity:.75";
    });
    var note = document.querySelector(".hub-note");
    var stat = document.getElementById("prz-static"); // vaste uitleg-regel: de live regel zegt hetzelfde, maar met de spellen van vandaag
    if (stat) stat.style.display = "none";
    if (note && !document.getElementById("prz-note")) {
      var n = document.createElement("p");
      n.id = "prz-note";
      n.className = "hub-note";
      n.style.cssText = "font-weight:700;" + green;
      n.innerHTML = "🏆 Today's prize games: <b>" + names(today) + "</b> · tomorrow: " + names(P.tomorrow || []) + "<br>" +
        "<span style=\"font-weight:500;color:inherit\">🥇🥈🥉 top 3 + 🎲 2 lucky players drawn from everyone with 5+ plays · one prize per person, then a 3-day break · " +
        "<a href=\"how.html#prizes\" style=\"" + green + ";font-weight:800\">how it works →</a></span>";
      note.parentNode.insertBefore(n, note);
    }
    // spelpagina (hold/says/stack/whichjar)
    var me = gameOf(location.pathname);
    if (!me) return;
    var on = today.indexOf(me) >= 0;
    document.querySelectorAll(".card.prize").forEach(function (card) {
      var p = document.createElement("div");
      p.className = "prelaunch-note";
      p.innerHTML = on
        ? "🏆 This game has prizes TODAY! The board closes at 8 PM CET." +
          "<span style=\"display:block;margin-top:.35rem;font-weight:500\">🥇🥈🥉 the top 3 win, plus 🎲 2 lucky players drawn from everyone who played 5+ times today.</span>"
        : "🎮 Just for fun today: this game has prizes again tomorrow." +
          "<span style=\"display:block;margin-top:.35rem;font-weight:500\">The prizes switch every day. Today's prize games: " + names(today) + ". Your score still counts on today's board.</span>";
      p.style.cssText = "margin:0 0 .6rem;font-weight:800;" + (on ? green : "color:#ffd24a");
      var h = card.querySelector("h2");
      if (h && h.nextSibling) card.insertBefore(p, h.nextSibling); else card.prepend(p);
    });
  }
})();
