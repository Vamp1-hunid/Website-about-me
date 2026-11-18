// js/theme-boot.js
// Runs in <head>, before the page is drawn (so it is NOT deferred):
// 1. applies the saved light/dark theme, so there is no flash of the wrong theme;
// 2. marks the page as "JavaScript is on" so the effects in css/styles.css can switch on.

(function () {
  var root = document.documentElement;
  root.classList.add("fx");
  try {
    if (localStorage.getItem("theme") === "light") {
      root.setAttribute("data-theme", "light");
    }
  } catch (error) {
    // Storage blocked: script.js falls back to the dark theme.
  }

  // (The cover shown between pages was removed.)
  try { sessionStorage.removeItem("mw-wipe"); } catch (error) { /* ignore */ }

})();
