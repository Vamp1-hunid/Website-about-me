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

  // Show the short boot screen once per visit, on the home page only,
  // and never for visitors who asked their device for reduced motion.
  try {
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var seen = sessionStorage.getItem("mw-boot-seen") === "1";
    var forced = /[?&]boot=1/.test(location.search);
    if (!calm && (location.pathname === "/" || location.pathname === "/index.html") && (!seen || forced)) {
      root.classList.add("is-booting");
    }
  } catch (error) {
    // Storage blocked: skip the boot screen.
  }
})();
