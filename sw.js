// sw.js — de service worker van de PWA (2026-11-27)
//
// BEWUST VOORZICHTIG. Een service worker kan een site voor terugkerende bezoekers "vastzetten" op een oude
// versie, en dat is hier het laatste wat we willen: de spellen en de teksten veranderen bijna dagelijks, en
// de pagina's hangen aan ?v=<datum> om juist oude versies te vermijden.
//
// Daarom: ALTIJD EERST HET NET, de cache is alleen een vangnet als je offline bent. Hij maakt de site dus
// niet sneller, hij maakt hem installeerbaar en hij laat iets zien in plaats van een foutpagina als de
// verbinding wegvalt. Sneller maken kan later, als dit een tijdje goed draait.
const CACHE = "sqz-v2";                       // bij elke verandering hieronder: nummer ophogen
const OFFLINE = "/games.html";                 // wat we tonen als er niets is

self.addEventListener("install", (e) => {
  // de schil alvast binnenhalen, zodat offline meteen werkt
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).catch(() => null));
  self.skipWaiting();                          // nooit wachten op een oude worker
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();                // meteen de baas, ook over open tabbladen
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;            // alleen ophalen, nooit versturen
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;  // niets van andere sites aanraken
  // 🚫 de bot, de generator en de borden nooit uit de cache: dat zijn live cijfers
  if (/^\/(tg|settings|top|hold|says|stack|whichjar|tries|prize)(\/|$)/.test(url.pathname)) return;

  e.respondWith((async () => {
    try {
      const vers = await fetch(req);
      // de kopie METEEN maken: wacht je daarmee tot de pagina het antwoord al leest, dan mislukt clone()
      // stilletjes en blijft de cache leeg (gezien bij de eerste test: alleen games.html stond erin).
      if (vers && vers.ok) {
        const kopie = vers.clone();
        caches.open(CACHE).then((c) => c.put(req, kopie)).catch(() => null);
      }
      return vers;
    } catch (err) {
      const uit = await caches.match(req);
      if (uit) return uit;
      if (req.mode === "navigate") {
        const val = await caches.match(OFFLINE);
        if (val) return val;
      }
      throw err;
    }
  })());
});
