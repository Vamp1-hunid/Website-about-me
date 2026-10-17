// js/effects.js
// Small decorative layer: typewriter effect for elements marked with [data-typing].
// Core site behaviour remains in js/script.js. This file does nothing when
// prefers-reduced-motion is set, and it never hides content permanently.

(function () {
  "use strict";

  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function start() {
    if (reduceQuery.matches) return;

    var spans = document.querySelectorAll("[data-typing]");

    Array.prototype.forEach.call(spans, function (span) {
      if (span.dataset.wdTyped === "true") return;
      span.dataset.wdTyped = "true";

      var full = span.textContent;
      var i = 0;

      span.textContent = "";

      (function type() {
        i += 1;
        span.textContent = full.slice(0, i);

        if (i < full.length) {
          window.setTimeout(type, 42 + Math.random() * 30);
        }
      })();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
