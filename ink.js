// ink.js — Ink Hunt: een klein klikbaar inktvlekje op deze pagina (alleen als Squeeze de inkt hier verstopte).
// Gebruik: <script src="https://squeezeocto.com/ink.js" data-page="wallet" defer></script>
// De code komt pas na een klik en een "ben je een mens?"-controle (Turnstile) van de worker.
(function () {
  "use strict";
  var me = document.currentScript;
  var page = me && me.getAttribute("data-page");
  if (!page) return;
  var C = window.SQUEEZE_CONFIG || {};
  var API = (C.WORKER_URL || "https://squeeze-state.inferno2199.workers.dev").replace(/\/$/, "") + "/tg/";
  var KEY = (C.TURNSTILE_SITE_KEY || "0x4AAAAAAFP8QC6dZrVG0T5L").trim();

  // ---- Turnstile (onzichtbaar; alleen zichtbaar als Cloudflare twijfelt) ----
  var tsReady = null, wid = null, pending = null;
  function loadTs() {
    if (window.turnstile) return Promise.resolve(true);
    if (tsReady) return tsReady;
    tsReady = new Promise(function (res) {
      window.__sqzInkTs = function () { res(true); };
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__sqzInkTs&render=explicit";
      s.async = true;
      s.onerror = function () { res(false); };
      document.head.appendChild(s);
    });
    return tsReady;
  }
  function token() {
    if (window.SqzHuman && window.SqzHuman.token) return window.SqzHuman.token(); // spelpagina's hebben er al een
    return loadTs().then(function (ok) {
      if (!ok || !window.turnstile) return null;
      return new Promise(function (resolve) {
        var settled = false;
        var done = function (t) { if (settled) return; settled = true; pending = null; resolve(t || null); };
        pending = done;
        try {
          if (wid === null) {
            var box = document.createElement("div");
            box.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:10001";
            document.body.appendChild(box);
            wid = window.turnstile.render(box, {
              sitekey: KEY, execution: "execute", appearance: "interaction-only",
              callback: function (t) { pending && pending(t); },
              "error-callback": function () { pending && pending(null); },
              "timeout-callback": function () { pending && pending(null); },
            });
          } else window.turnstile.reset(wid);
          window.turnstile.execute(wid);
        } catch (e) { done(null); }
        setTimeout(function () { done(null); }, 20000);
      });
    });
  }

  var css = "" +
    ".sqz-ink{position:absolute;width:30px;height:30px;z-index:9999;cursor:pointer;border:0;padding:0;background:none;opacity:.88;" +
    "filter:drop-shadow(0 0 6px rgba(0,0,0,.6));animation:sqzInkWob 5s ease-in-out infinite;-webkit-tap-highlight-color:transparent}" +
    ".sqz-ink:hover{opacity:1;transform:scale(1.15)}" +
    "@keyframes sqzInkWob{0%,100%{rotate:0deg}50%{rotate:14deg}}" +
    ".sqz-inkpop{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px}" +
    ".sqz-inkpop>div{max-width:360px;width:100%;text-align:center;color:#f3f7f2;font:600 1rem 'Bricolage Grotesque',ui-rounded,system-ui,sans-serif;text-shadow:0 2px 14px rgba(0,0,0,.9)}" +
    ".sqz-inkpop b.code{display:block;font:800 2rem ui-monospace,Menlo,monospace;color:#7cff6b;letter-spacing:.06em;margin:.5rem 0;text-shadow:0 0 24px rgba(124,255,107,.45)}" +
    ".sqz-inkpop button{font:800 1rem inherit;font-family:inherit;border:0;border-radius:999px;padding:.7rem 1.3rem;margin:.3rem;cursor:pointer;background:#7cff6b;color:#031006}" +
    ".sqz-inkpop button.ghost{background:rgba(3,12,8,.5);color:#7cff6b}" +
    "@media (prefers-reduced-motion:reduce){.sqz-ink{animation:none}}";

  function blob() {
    return '<svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true"><path fill="#0b130e" d="M33 6c6 0 7 7 12 9s12-1 13 6-6 9-5 15 7 10 2 15-11 0-15 4-5 9-11 8-6-8-11-10-12 2-14-4 5-9 4-15-8-10-3-15 11 1 15-4S27 6 33 6z"/>' +
      '<circle cx="56" cy="8" r="3.4" fill="#0b130e"/><circle cx="7" cy="54" r="2.6" fill="#0b130e"/><ellipse cx="26" cy="24" rx="5" ry="3" fill="#2c3a31" opacity=".7"/></svg>';
  }

  function popup(html) {
    var el = document.createElement("div");
    el.className = "sqz-inkpop";
    el.innerHTML = "<div>" + html + "</div>";
    el.addEventListener("click", function (e) { if (e.target === el || e.target.getAttribute("data-close") !== null) el.remove(); });
    document.body.appendChild(el);
    return el;
  }

  function claim(btn) {
    btn.style.pointerEvents = "none";
    var wait = popup("🖋 Checking you're human…");
    token().then(function (t) {
      return fetch(API + "inkclaim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: page, token: t }) })
        .then(function (r) { return r.json(); });
    }).then(function (d) {
      wait.remove();
      btn.style.pointerEvents = "";
      if (!d || !d.code) { popup("🖋 " + String((d && d.error) || "Something went wrong. Try again.").replace(/[<>&]/g, "") + '<br><button class="ghost" data-close>OK</button>'); return; }
      var code = String(d.code).replace(/[^A-Z0-9-]/g, "");
      var p = popup("🐙 You found Squeeze's ink!<b class=\"code\">" + code + "</b>Be the first to type<br><b>/ink " + code + "</b><br>in the $SQUEEZE Telegram group.<br><br>" +
        '<button data-copy>Copy</button><button class="ghost" data-close>Close</button>');
      var cp = p.querySelector("[data-copy]");
      cp.addEventListener("click", function () {
        try { navigator.clipboard.writeText("/ink " + code); cp.textContent = "Copied ✓"; } catch (e) {}
      });
    }).catch(function () {
      wait.remove();
      btn.style.pointerEvents = "";
      popup('🖋 Something went wrong. Try again.<br><button class="ghost" data-close>OK</button>');
    });
  }

  function place(spot) {
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sqz-ink";
    b.setAttribute("aria-label", "A tiny ink spot");
    b.innerHTML = blob();
    var pos = function () {
      var W = document.documentElement.scrollWidth, H = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      b.style.left = Math.round(Math.min(W - 40, (spot.x / 100) * W)) + "px";
      b.style.top = Math.round(Math.min(H - 40, (spot.y / 100) * H)) + "px";
    };
    document.body.appendChild(b);
    pos();
    window.addEventListener("resize", pos);
    setTimeout(pos, 1500); // na het laden van plaatjes is de pagina soms langer
    b.addEventListener("click", function () { claim(b); });
  }

  function go() {
    fetch(API + "inkspot?page=" + encodeURIComponent(page)).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.spot && typeof d.spot.x === "number") place(d.spot);
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
  else go();
})();
