/* Theme mode: Auto (light by day, dark by night), Light or Dark.
   Daniel, 2026-10-21: "add dark and light theme button, and make it switch
   dynamically depending on time of the day". Loaded in <head> of index.html
   and board.html, before anything paints, so there is no flash.
   - rot_theme_mode: 'auto' | 'light' | 'dark' (the visitor's choice)
   - rot_theme:      'light' | 'dark' (what is showing now; the board's
                     older code still reads this one)
   A visitor who already picked a theme on the board keeps it (manual);
   a new visitor starts on Auto. Auto = light 07:00-18:59 local time. */
(function () {
  var D = document.documentElement;
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function byClock() { var h = new Date().getHours(); return h >= 7 && h < 19 ? 'light' : 'dark'; }
  function mode() {
    var m = get('rot_theme_mode');
    if (m === 'auto' || m === 'light' || m === 'dark') return m;
    m = get('rot_theme');
    if (m === 'light' || m === 'dark') return m;
    /* Stored, because apply() writes rot_theme and that would read as a choice next visit. */
    put('rot_theme_mode', 'auto');
    return 'auto';
  }
  function apply() {
    var m = mode(), t = m === 'auto' ? byClock() : m;
    put('rot_theme', t);
    var was = D.classList.contains('light');
    D.classList.toggle('light', t === 'light');
    D.setAttribute('data-theme-mode', m);
    /* On the board, let its own toggle refresh icons and the swap canvas. */
    if (was !== (t === 'light') && typeof window.toggleTheme === 'function' && window.toggleTheme.length >= 2) window.toggleTheme(t === 'light', true);
    var b = document.querySelectorAll('[data-theme-btn]');
    for (var i = 0; i < b.length; i++) {
      b[i].textContent = m === 'auto' ? '◐ AUTO' : m === 'light' ? '☀ LIGHT' : '☾ DARK';
      b[i].title = m === 'auto' ? 'Theme: Auto (light by day, dark by night). Click for Light.' : m === 'light' ? 'Theme: Light. Click for Dark.' : 'Theme: Dark. Click for Auto.';
    }
    return t;
  }
  window.RotTheme = {
    mode: mode,
    apply: apply,
    set: function (m) { put('rot_theme_mode', m); return apply(); },
    /* Auto → Light → Dark → Auto */
    cycle: function () { var m = mode(); return this.set(m === 'auto' ? 'light' : m === 'light' ? 'dark' : 'auto'); }
  };
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  /* Auto follows the clock while the page stays open. */
  setInterval(function () { if (mode() === 'auto') apply(); }, 60000);
})();
