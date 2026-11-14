// js/flair.js
// Extra motion on top of js/fx.js. Pure decoration: if it fails, nothing breaks.
//
//  1. Decode text      - headings scramble through random glyphs, then settle
//  2. Role cycle       - the hero "whoami --role" types and deletes a list of roles
//  3. Micro-glitch     - your name jolts every few seconds (short, never flashing)
//  4. Scroll progress  - pink-to-cyan bar along the top
//  5. Tilt             - cards and photos lean towards the mouse, with a glare
//  6. Pixel burst      - clicking a button or link throws a few coloured pixels
//  7. Access stamp     - "ACCESS GRANTED" when a project file is hacked open
//  8. Reticle          - a targeting ring that trails the mouse (desktop only)
//  9. Page wipe        - a quick glitch wipe when moving between pages
//
// Everything stays off for visitors who ask their device for reduced motion.

(function () {
  "use strict";

  var MW = (window.MW = window.MW || {});
  var root = document.documentElement;
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var GLYPHS = "!<>-_\\/[]{}=+*^?#ABCDEF0123456789@$%&";

  // The page-wipe cover must always be removed, even with reduced motion.
  function endWipe() {
    if (!root.classList.contains("is-wiping")) return;
    root.classList.add("wipe-out");
    window.setTimeout(function () {
      root.classList.remove("is-wiping", "wipe-out");
    }, calm ? 0 : 420);
  }
  try { sessionStorage.removeItem("mw-wipe"); } catch (error) { /* ignore */ }
  if (calm) {
    endWipe();
    return;
  }

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function safe(fn) {
    try { fn(); } catch (error) { console.warn("flair:", error); }
  }

  /* ---------- 1. Decode text ---------- */

  function decode(node, duration) {
    if (!node || node._decoding) return;
    var finalText = node.getAttribute("data-final") || node.textContent;
    node.setAttribute("data-final", finalText);
    if (!node.hasAttribute("aria-label")) node.setAttribute("aria-label", finalText);
    node._decoding = true;
    var start = performance.now();
    duration = duration || 700;

    (function frame(now) {
      var progress = Math.min(1, (now - start) / duration);
      var settled = Math.floor(progress * finalText.length);
      var out = "";
      for (var i = 0; i < finalText.length; i++) {
        var ch = finalText.charAt(i);
        out += i < settled || ch === " " ? ch : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
      }
      node.textContent = out;
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        node.textContent = finalText;
        node._decoding = false;
      }
    })(start);
  }
  MW.decode = decode;

  function initDecode() {
    var nodes = document.querySelectorAll("[data-decode]");
    if (!("IntersectionObserver" in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        // The hero name waits for the boot screen to finish.
        var wait = root.classList.contains("is-booting") ? 2600 : 120;
        window.setTimeout(function () {
          decode(entry.target, entry.target.tagName === "H1" ? 1000 : 650);
        }, wait);
      });
    }, { threshold: 0.6 });
    nodes.forEach(function (node) { observer.observe(node); });
  }

  /* ---------- 2. Role cycle ---------- */

  function initRoles() {
    var node = document.querySelector(".role-cycle");
    if (!node) return;
    var roles;
    try { roles = JSON.parse(node.getAttribute("data-roles")); } catch (error) { return; }
    if (!roles || roles.length < 2) return;

    // Screen readers hear one steady sentence instead of the typing.
    var line = node.closest(".cmd");
    if (line) line.setAttribute("aria-label", "whoami: " + roles.join(", "));
    node.setAttribute("aria-hidden", "true");
    node.classList.add("is-typing");

    var index = 0;
    var text = roles[0];

    function wait(ms, next) { window.setTimeout(next, ms); }

    function erase() {
      if (text.length) {
        text = text.slice(0, -1);
        node.textContent = text;
        wait(28, erase);
      } else {
        index = (index + 1) % roles.length;
        wait(260, type);
      }
    }

    function type() {
      var target = roles[index];
      if (text.length < target.length) {
        text = target.slice(0, text.length + 1);
        node.textContent = text;
        wait(55 + Math.random() * 45, type);
      } else {
        wait(2200, erase);
      }
    }

    wait(root.classList.contains("is-booting") ? 4500 : 2600, erase);
  }

  /* ---------- 3. Micro-glitch on the hero name ---------- */

  function initMicroGlitch() {
    var name = document.querySelector(".hero h1");
    if (!name || !MW.glitch) return;
    (function loop() {
      window.setTimeout(function () {
        if (!document.hidden && !name._decoding) MW.glitch(name);
        loop();
      }, 6500 + Math.random() * 5000);
    })();
  }

  /* ---------- 4. Scroll progress ---------- */

  function initProgress() {
    var bar = el("div", "scroll-progress");
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    var queued = false;
    function update() {
      queued = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, window.scrollY / max) : 0).toFixed(4) + ")";
    }
    window.addEventListener("scroll", function () {
      if (!queued) {
        queued = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* ---------- 5. Tilt ---------- */

  var TILT_SELECTOR = ".card, .work-card, .gallery figure, .chips li, .stat";

  function initTilt() {
    if (!finePointer) return;
    var current = null;
    var frame = null;
    var last = null;

    function apply() {
      frame = null;
      if (!current || !last) return;
      var rect = current.getBoundingClientRect();
      var x = (last.clientX - rect.left) / rect.width - 0.5;
      var y = (last.clientY - rect.top) / rect.height - 0.5;
      var strength = current.matches(".chips li, .stat") ? 10 : 7;
      current.style.setProperty("--tilt-x", (-y * strength).toFixed(2) + "deg");
      current.style.setProperty("--tilt-y", (x * strength).toFixed(2) + "deg");
      current.style.setProperty("--glare-x", ((x + 0.5) * 100).toFixed(1) + "%");
      current.style.setProperty("--glare-y", ((y + 0.5) * 100).toFixed(1) + "%");
    }

    function reset(node) {
      node.classList.remove("is-tilting");
      node.style.removeProperty("--tilt-x");
      node.style.removeProperty("--tilt-y");
    }

    document.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse") return;
      var target = event.target.closest ? event.target.closest(TILT_SELECTOR) : null;
      if (target !== current) {
        if (current) reset(current);
        current = target;
        if (current) current.classList.add("tilt", "is-tilting");
      }
      last = event;
      if (current && !frame) frame = window.requestAnimationFrame(apply);
    }, { passive: true });

    document.addEventListener("pointerleave", function () {
      if (current) reset(current);
      current = null;
    });
  }

  /* ---------- 6. Pixel burst ---------- */

  var COLOURS = ["#ff2e97", "#19e3ff", "#ffe23d", "#4dffb0"];

  function burst(x, y, count, spread) {
    count = count || 10;
    spread = spread || 60;
    for (var i = 0; i < count; i++) {
      var px = el("span", "pixel");
      var size = 4 + Math.round(Math.random() * 5);
      px.style.width = size + "px";
      px.style.height = size + "px";
      px.style.left = x + "px";
      px.style.top = y + "px";
      px.style.background = COLOURS[i % COLOURS.length];
      document.body.appendChild(px);
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      var distance = spread * (0.5 + Math.random() * 0.7);
      var animation = px.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          {
            transform: "translate(calc(-50% + " + (Math.cos(angle) * distance).toFixed(1) + "px), calc(-50% + " +
              (Math.sin(angle) * distance + 18).toFixed(1) + "px)) scale(0.4)",
            opacity: 0
          }
        ],
        { duration: 520 + Math.random() * 220, easing: "cubic-bezier(.2,.7,.3,1)" }
      );
      animation.onfinish = px.remove.bind(px);
    }
  }
  MW.burst = burst;

  function initBurst() {
    document.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      var hit = event.target.closest && event.target.closest("a, button, .btn, summary, [role='button']");
      if (!hit || hit.classList.contains("hack-btn")) return;
      burst(event.clientX, event.clientY, 8, 46);
    }, { passive: true });
  }

  /* ---------- 7. Access stamp when a project file is hacked open ---------- */

  function initStamps() {
    document.querySelectorAll(".hack-btn").forEach(function (button) {
      new MutationObserver(function () {
        if (button.getAttribute("aria-expanded") !== "true") return;
        var card = button.closest(".card");
        if (!card || card.querySelector(".stamp")) return;
        var stamp = el("span", "stamp");
        stamp.setAttribute("aria-hidden", "true");
        stamp.textContent = "ACCESS GRANTED";
        card.appendChild(stamp);
        var rect = button.getBoundingClientRect();
        burst(rect.left + 18, rect.top + rect.height / 2, 16, 80);
        window.setTimeout(function () { stamp.remove(); }, 1900);
      }).observe(button, { attributes: true, attributeFilter: ["aria-expanded"] });
    });
  }

  /* ---------- 8. Reticle ---------- */

  function initReticle() {
    if (!finePointer) return;
    var ring = el("div", "reticle");
    ring.setAttribute("aria-hidden", "true");
    document.body.appendChild(ring);
    var x = -100, y = -100, rx = -100, ry = -100;
    var running = false;

    function loop() {
      rx += (x - rx) * 0.22;
      ry += (y - ry) * 0.22;
      ring.style.transform = "translate(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px)";
      if (Math.abs(x - rx) > 0.3 || Math.abs(y - ry) > 0.3) {
        window.requestAnimationFrame(loop);
      } else {
        running = false;
      }
    }

    document.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse") return;
      x = event.clientX;
      y = event.clientY;
      ring.classList.add("is-on");
      var hot = event.target.closest && event.target.closest("a, button, input, select, textarea, label, [data-profile], .hack-btn");
      ring.classList.toggle("is-hot", Boolean(hot));
      if (!running) {
        running = true;
        window.requestAnimationFrame(loop);
      }
    }, { passive: true });

    document.addEventListener("pointerleave", function () { ring.classList.remove("is-on"); });
    document.addEventListener("pointerdown", function () { ring.classList.add("is-down"); });
    document.addEventListener("pointerup", function () { ring.classList.remove("is-down"); });
  }

  /* ---------- 9. Page wipe ---------- */

  function initPageWipe() {
    // Coming in: theme-boot.js covered the page if we arrived from another page of this site.
    window.setTimeout(endWipe, 60);

    document.addEventListener("click", function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target.closest && event.target.closest("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      var url;
      try { url = new URL(link.href, location.href); } catch (error) { return; }
      if (url.origin !== location.origin) return;
      if (/^\/(auth|api)\//.test(url.pathname)) return;            // Google sign-in, API links
      if (url.pathname === location.pathname && url.search === location.search) return; // same page / #anchor
      if (/\.(jpe?g|png|gif|webp|mp4|mp3|pdf)$/i.test(url.pathname)) return;

      event.preventDefault();
      try { sessionStorage.setItem("mw-wipe", "1"); } catch (error) { /* ignore */ }
      root.classList.add("is-wiping", "wipe-in");
      window.setTimeout(function () { location.href = url.href; }, 230);
    });

    // Coming back with the browser's Back button can restore a covered page from memory.
    window.addEventListener("pageshow", function (event) {
      if (event.persisted) {
        root.classList.remove("wipe-in");
        endWipe();
      }
    });
  }

  safe(initPageWipe);
  safe(initDecode);
  safe(initRoles);
  safe(initMicroGlitch);
  safe(initProgress);
  safe(initTilt);
  safe(initBurst);
  safe(initStamps);
  safe(initReticle);
})();
