/* ══════════════════════════════════════════════════════════════════
   analytics.js — tiny Umami Cloud wrapper.

   Umami's own script is loaded in index.html / track-record.html.
   This file just exposes a safe `track(name, props?)` that no-ops
   if the script failed to load (ad-blocker, offline, localhost, …)
   so the app never throws because of analytics.

   HTML buttons can also use the zero-JS form:
     <button data-umami-event="Share Card" data-umami-event-coin="BTC">

   Both auto-track once Umami is present. Umami's collector sees only
   event name + custom props (no cookies, no IP, no fingerprint).
   ══════════════════════════════════════════════════════════════════ */
(function (g) {
  function track(name, props) {
    try {
      if (g.umami && typeof g.umami.track === 'function') {
        if (props && typeof props === 'object') g.umami.track(name, props);
        else g.umami.track(name);
      }
    } catch (_) { /* analytics must never break the app */ }
  }

  g.Analytics = { track: track };
})(window);
