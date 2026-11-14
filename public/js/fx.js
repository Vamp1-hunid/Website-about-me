// js/fx.js
// The MWAMBA//NET effects layer. Everything here is decoration: the site still
// works (and all content stays readable) if this file fails or never loads.
//
//  1. Boot screen         (home page, once per visit)
//  2. Network map         (the moving node web behind the page)
//  3. Profiler            (scan card over photos and works)
//  4. Hold-to-hack        (press and hold to open a project file)
//  5. Console             (type commands: help, goto, works, theme, hack ...)
//  6. Scroll reveal, typing effect, glitch and the "hack" easter egg
//
// Visitors with "reduce motion" switched on get no boot screen, a still page,
// and instant hack buttons.

(function () {
  "use strict";

  var MW = (window.MW = window.MW || {});
  var root = document.documentElement;
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function calm() {
    return reduceQuery.matches;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function glitch(node) {
    if (!node || calm()) return;
    node.classList.remove("is-glitching");
    void node.offsetWidth; // restart the animation
    node.classList.add("is-glitching");
    window.setTimeout(function () { node.classList.remove("is-glitching"); }, 360);
  }
  MW.glitch = glitch;

  /* =========================================================
     1. BOOT SCREEN
     ========================================================= */

  function runBoot() {
    if (!root.classList.contains("is-booting")) return;

    var boot = el("div", "boot");
    boot.setAttribute("aria-hidden", "true");
    boot.innerHTML =
      '<div class="boot-frame">' +
      '<p class="boot-logo">MWAMBA//NET</p>' +
      '<pre class="boot-log"></pre>' +
      '<div class="boot-bar"><span></span></div>' +
      '<p class="boot-hint">TAP OR PRESS ANY KEY TO SKIP</p>' +
      "</div>";
    document.body.appendChild(boot);

    var log = boot.querySelector(".boot-log");
    var bar = boot.querySelector(".boot-bar span");
    var lines = [
      "> connecting to node network ...",
      "> loading profile: MULENGA_MWAMBA",
      "> unlocking works archive ...",
      "> ACCESS GRANTED"
    ];
    var lineIndex = 0;
    var charIndex = 0;
    var done = false;

    function finish() {
      if (done) return;
      done = true;
      try { sessionStorage.setItem("mw-boot-seen", "1"); } catch (error) { /* ignore */ }
      boot.classList.add("is-done");
      window.removeEventListener("keydown", finish);
      boot.removeEventListener("pointerdown", finish);
      window.setTimeout(function () {
        root.classList.remove("is-booting");
        boot.remove();
        glitch(document.querySelector("h1.glitch"));
      }, 380);
    }

    boot.addEventListener("pointerdown", finish);
    window.addEventListener("keydown", finish);

    (function type() {
      if (done) return;
      if (lineIndex >= lines.length) {
        bar.style.width = "100%";
        window.setTimeout(finish, 350);
        return;
      }
      var line = lines[lineIndex];
      charIndex += 2;
      log.textContent = lines.slice(0, lineIndex).join("\n") + (lineIndex ? "\n" : "") + line.slice(0, charIndex);
      bar.style.width = Math.round(((lineIndex + Math.min(1, charIndex / line.length)) / lines.length) * 100) + "%";
      if (charIndex >= line.length) {
        lineIndex += 1;
        charIndex = 0;
        window.setTimeout(type, 160);
      } else {
        window.setTimeout(type, 18);
      }
    })();
  }

  /* =========================================================
     2. NETWORK MAP (canvas behind the page)
     ========================================================= */

  function initNetMap() {
    var canvas = el("canvas");
    canvas.id = "net-map";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);

    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var nodes = [];
    var width = 0;
    var height = 0;
    var ratio = 1;
    var pointer = { x: -9999, y: -9999 };
    var colours = readColours();
    var running = false;
    var lastFrame = 0;
    var pulses = [];

    function readColours() {
      var style = getComputedStyle(root);
      return {
        node: style.getPropertyValue("--map-node").trim() || "255, 46, 151",
        line: style.getPropertyValue("--map-line").trim() || "25, 227, 255"
      };
    }

    function resize() {
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      var count = Math.max(18, Math.min(64, Math.round((width * height) / 26000)));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          r: Math.random() < 0.15 ? 2.6 : 1.5
        });
      }
      if (!running) draw(0, true);
    }

    function draw(time, still) {
      ctx.clearRect(0, 0, width, height);
      var maxDist = 150;
      var scrollShift = (window.scrollY * 0.04) % height;

      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        if (!still) {
          a.x += a.vx;
          a.y += a.vy;
          if (a.x < -20) a.x = width + 20;
          if (a.x > width + 20) a.x = -20;
          if (a.y < -20) a.y = height + 20;
          if (a.y > height + 20) a.y = -20;
        }
        var ay = (a.y - scrollShift + height) % height;

        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var by = (b.y - scrollShift + height) % height;
          var dx = a.x - b.x;
          var dy = ay - by;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            var near = Math.hypot(pointer.x - (a.x + b.x) / 2, pointer.y - (ay + by) / 2) < 120;
            var alpha = (1 - dist / maxDist) * (near ? 0.8 : 0.36);
            ctx.strokeStyle = "rgba(" + colours.line + "," + alpha.toFixed(3) + ")";
            ctx.lineWidth = near ? 1.2 : 0.8;
            ctx.beginPath();
            ctx.moveTo(a.x, ay);
            ctx.lineTo(b.x, by);
            ctx.stroke();

            // Now and then, send a data "packet" along a link.
            if (!still && pulses.length < 4 && Math.random() < 0.0006) {
              pulses.push({ a: i, b: j, t: 0 });
            }
          }
        }

        ctx.fillStyle = "rgba(" + colours.node + "," + (a.r > 2 ? 0.9 : 0.6) + ")";
        ctx.fillRect(a.x - a.r, ay - a.r, a.r * 2, a.r * 2);
      }

      for (var p = pulses.length - 1; p >= 0; p--) {
        var pulse = pulses[p];
        var n1 = nodes[pulse.a];
        var n2 = nodes[pulse.b];
        if (!n1 || !n2) { pulses.splice(p, 1); continue; }
        var y1 = (n1.y - scrollShift + height) % height;
        var y2 = (n2.y - scrollShift + height) % height;
        var px = n1.x + (n2.x - n1.x) * pulse.t;
        var py = y1 + (y2 - y1) * pulse.t;
        ctx.fillStyle = "rgba(" + colours.node + ",0.95)";
        ctx.fillRect(px - 2, py - 2, 4, 4);
        pulse.t += 0.02;
        if (pulse.t >= 1 || Math.abs(y2 - y1) > maxDist) pulses.splice(p, 1);
      }
    }

    function loop(time) {
      if (!running) return;
      // About 30 frames a second is plenty for a background, and kinder to phone batteries.
      if (time - lastFrame > 33) {
        lastFrame = time;
        draw(time, false);
      }
      window.requestAnimationFrame(loop);
    }

    function start() {
      if (running || calm() || document.hidden) return;
      running = true;
      window.requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
    }

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }, { passive: true });
    window.addEventListener("scroll", function () {
      if (!running) draw(0, true);
    }, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });
    reduceQuery.addEventListener("change", function () {
      if (calm()) stop(); else start();
    });

    // Re-read the colours when the theme button switches light/dark.
    new MutationObserver(function () {
      colours = readColours();
      if (!running) draw(0, true);
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    resize();
    start();
  }

  /* =========================================================
     3. PROFILER
     Any element with data-profile='{"name": "...", "rows": [["LABEL", "value"], ...]}'
     (or one registered with MW.profile(element, data)) shows a scan card on hover,
     keyboard focus, or tap on touch screens.
     ========================================================= */

  var profilerCard = null;
  var profiledNow = null;
  var profileCounter = 0;
  var openedAt = 0;

  function buildProfiler() {
    profilerCard = el("div", "profiler");
    profilerCard.setAttribute("aria-hidden", "true");
    document.body.appendChild(profilerCard);
  }

  function fillProfiler(data) {
    profilerCard.textContent = "";
    profilerCard.appendChild(el("span", "profiler-scan"));
    var head = el("div", "profiler-head");
    head.appendChild(el("span", "", data.kicker || "PROFILER"));
    head.appendChild(el("span", "", data.id || "ID " + Math.random().toString(16).slice(2, 8).toUpperCase()));
    profilerCard.appendChild(head);
    profilerCard.appendChild(el("p", "profiler-name", data.name || "UNKNOWN"));
    var list = el("dl");
    (data.rows || []).forEach(function (row) {
      list.appendChild(el("dt", "", row[0]));
      list.appendChild(el("dd", "", row[1]));
    });
    profilerCard.appendChild(list);
  }

  function placeProfiler(target) {
    var rect = target.getBoundingClientRect();
    var card = profilerCard.getBoundingClientRect();
    var gap = 12;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var left = rect.right + gap;
    if (left + card.width > vw - 8) left = rect.left - card.width - gap;
    if (left < 8) left = Math.min(Math.max(8, rect.left), vw - card.width - 8);

    var top = rect.top + 12;
    if (left === Math.min(Math.max(8, rect.left), vw - card.width - 8)) {
      // Not enough room at the sides: put it below (or above) the element.
      top = rect.bottom + gap;
      if (top + card.height > vh - 8) top = rect.top - card.height - gap;
    }
    top = Math.min(Math.max(8, top), vh - card.height - 8);

    profilerCard.style.left = Math.round(left) + "px";
    profilerCard.style.top = Math.round(top) + "px";
  }

  function getProfile(target) {
    if (target._mwProfile) return target._mwProfile;
    try {
      return JSON.parse(target.getAttribute("data-profile"));
    } catch (error) {
      return null;
    }
  }

  function openProfiler(target) {
    var data = getProfile(target);
    if (!data) return;
    if (profiledNow && profiledNow !== target) profiledNow.classList.remove("is-profiled");
    profiledNow = target;
    openedAt = Date.now();
    target.classList.add("is-profiled");
    fillProfiler(data);
    profilerCard.classList.remove("is-open");
    void profilerCard.offsetWidth;
    placeProfiler(target);
    profilerCard.classList.add("is-open");
  }

  function closeProfiler() {
    if (!profilerCard) return;
    profilerCard.classList.remove("is-open");
    if (profiledNow) profiledNow.classList.remove("is-profiled");
    profiledNow = null;
  }

  // Screen readers get the same details as plain text.
  function describeForScreenReaders(target, data) {
    if (target.getAttribute("aria-describedby")) return;
    profileCounter += 1;
    var id = "profile-text-" + profileCounter;
    var text = el("span", "sr-only");
    text.id = id;
    text.textContent = (data.rows || []).map(function (row) { return row[0] + ": " + row[1]; }).join(". ");
    target.appendChild(text);
    target.setAttribute("aria-describedby", id);
  }

  function wireProfile(target) {
    if (target._mwProfileWired) return;
    target._mwProfileWired = true;
    var data = getProfile(target);
    if (!data) return;

    var isLink = target.tagName === "A" || target.tagName === "BUTTON";
    if (!isLink && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "0");
    if (!isLink) describeForScreenReaders(target, data);

    target.addEventListener("pointerenter", function (event) {
      if (event.pointerType === "mouse") openProfiler(target);
    });
    target.addEventListener("pointerleave", function (event) {
      if (event.pointerType === "mouse" && profiledNow === target) closeProfiler();
    });
    target.addEventListener("focus", function () { openProfiler(target); });
    target.addEventListener("blur", function () { if (profiledNow === target) closeProfiler(); });

    // On touch screens a tap on a photo toggles the card (links just open as normal).
    if (!isLink) {
      target.addEventListener("click", function (event) {
        if (event.pointerType === "mouse") return;
        // A tap also focuses the photo, which has just opened the card: keep it open.
        if (profiledNow === target && Date.now() - openedAt < 400) return;
        if (profiledNow === target) closeProfiler(); else openProfiler(target);
      });
    }
  }

  // Lets other scripts (the works grid) register cards they create.
  MW.profile = function (target, data) {
    target._mwProfile = data;
    target.setAttribute("data-profile", "");
    wireProfile(target);
  };

  function initProfiler() {
    buildProfiler();
    document.querySelectorAll("[data-profile]").forEach(wireProfile);
    // Keep the card next to its target while the page scrolls; close it once the target leaves the screen.
    var moveQueued = false;
    window.addEventListener("scroll", function () {
      if (!profiledNow || moveQueued) return;
      moveQueued = true;
      window.requestAnimationFrame(function () {
        moveQueued = false;
        if (!profiledNow) return;
        var rect = profiledNow.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) closeProfiler();
        else placeProfiler(profiledNow);
      });
    }, { passive: true });
    window.addEventListener("resize", closeProfiler);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeProfiler();
    });
    document.addEventListener("pointerdown", function (event) {
      if (profiledNow && !profiledNow.contains(event.target)) closeProfiler();
    });
  }

  /* =========================================================
     4. HOLD-TO-HACK
     <button class="hack-btn" aria-controls="id-of-hidden-panel" aria-expanded="false">
     Press and hold for 0.8 s to open. Keyboard (Enter/Space) opens straight away.
     ========================================================= */

  var HOLD_MS = 800;

  function wireHack(button) {
    var target = document.getElementById(button.getAttribute("aria-controls"));
    if (!target) return;
    var ring = button.querySelector(".hack-ring");
    var label = button.querySelector(".hack-label");
    var startLabel = label ? label.textContent : "";
    var holding = false;
    var startTime = 0;
    var frame = null;
    var pointerUsed = false;

    function setProgress(value) {
      if (ring) ring.style.setProperty("--progress", value.toFixed(3));
    }

    function open() {
      holding = false;
      window.cancelAnimationFrame(frame);
      setProgress(1);
      target.hidden = false;
      button.setAttribute("aria-expanded", "true");
      button.classList.add("is-done");
      if (label) label.textContent = "Access granted";
      glitch(button.closest(".card") && button.closest(".card").querySelector("h3"));
      MW.log && MW.log((button.getAttribute("data-file") || "FILE") + " // DECRYPTED", "ok");
    }

    function close() {
      target.hidden = true;
      button.setAttribute("aria-expanded", "false");
      button.classList.remove("is-done");
      if (label) label.textContent = startLabel;
      setProgress(0);
    }

    function tick(now) {
      if (!holding) return;
      var progress = Math.min(1, (now - startTime) / HOLD_MS);
      setProgress(progress);
      if (progress >= 1) open();
      else frame = window.requestAnimationFrame(tick);
    }

    function cancel() {
      if (!holding) return;
      holding = false;
      window.cancelAnimationFrame(frame);
      setProgress(0);
      if (label) label.textContent = startLabel;
    }

    var wasOpen = false;

    button.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      pointerUsed = true;
      wasOpen = button.getAttribute("aria-expanded") === "true";
      if (wasOpen) return; // the click that follows closes it
      if (calm()) { open(); return; }
      holding = true;
      startTime = performance.now();
      if (label) label.textContent = "Hold ...";
      frame = window.requestAnimationFrame(tick);
    });
    button.addEventListener("pointerup", cancel);
    button.addEventListener("pointerleave", cancel);
    button.addEventListener("pointercancel", cancel);
    button.addEventListener("contextmenu", function (event) { event.preventDefault(); });

    // Mouse/touch: opening is done by holding (above); a press on an open file closes it.
    // Keyboard and screen readers (a click with no pointer press) open or close at once.
    button.addEventListener("click", function () {
      if (pointerUsed) {
        pointerUsed = false;
        if (wasOpen) {
          wasOpen = false;
          close();
        }
        return;
      }
      if (button.getAttribute("aria-expanded") === "true") close(); else open();
    });
  }

  function initHack() {
    document.querySelectorAll(".hack-btn").forEach(wireHack);
  }

  /* =========================================================
     5. CONSOLE
     ========================================================= */

  var consoleEl = null;
  var consoleLog = null;
  var consoleToggle = null;
  var consoleInput = null;

  MW.log = function (message, type) {
    if (!consoleLog) return;
    var line = el("li", type || "info", message);
    consoleLog.appendChild(line);
    while (consoleLog.children.length > 80) consoleLog.removeChild(consoleLog.firstChild);
    consoleLog.scrollTop = consoleLog.scrollHeight;
  };

  function setConsoleOpen(open) {
    consoleEl.classList.toggle("is-open", open);
    consoleToggle.setAttribute("aria-expanded", String(open));
    if (open) window.setTimeout(function () { consoleInput.focus(); }, 60);
  }

  var SECTIONS = ["about", "hobbies", "plan", "projects", "photos", "media", "contact", "works"];

  function runCommand(raw) {
    var text = String(raw || "").trim();
    if (!text) return;
    MW.log("> " + text, "you");
    var parts = text.toLowerCase().split(/\s+/);
    var cmd = parts[0];
    var arg = parts[1] || "";

    switch (cmd) {
      case "help":
        MW.log("help | whoami | goto <section> | works [art|anime|writing] | theme [dark|light] | login | hack | clear", "ok");
        MW.log("sections: " + SECTIONS.join(", "), "info");
        break;
      case "whoami":
        if (MW.me) {
          MW.me().then(function (user) {
            MW.log(user ? "LOGGED IN AS @" + user.username + " (" + user.role + ")" : "GUEST // type login to sign in", user ? "ok" : "warn");
          });
        }
        break;
      case "goto":
      case "go":
        if (SECTIONS.indexOf(arg) === -1) {
          MW.log("UNKNOWN SECTION // try: goto projects", "warn");
        } else if (arg === "works") {
          window.location.href = "/gallery";
        } else if (document.getElementById(arg)) {
          document.getElementById(arg).scrollIntoView({ behavior: calm() ? "auto" : "smooth" });
          MW.log("ROUTE // #" + arg.toUpperCase(), "ok");
        } else {
          window.location.href = "/#" + arg;
        }
        break;
      case "works": {
        var map = { art: "story-art", story: "story-art", "story-art": "story-art", anime: "anime", writing: "writing" };
        window.location.href = "/gallery" + (map[arg] ? "?category=" + map[arg] : "");
        break;
      }
      case "theme": {
        var toggle = document.getElementById("theme-toggle");
        var current = root.getAttribute("data-theme") || "dark";
        var wanted = arg === "light" || arg === "dark" ? arg : current === "dark" ? "light" : "dark";
        if (wanted !== current && toggle) toggle.click();
        MW.log("THEME // " + wanted.toUpperCase(), "ok");
        break;
      }
      case "login":
        window.location.href = "/login?next=" + encodeURIComponent(location.pathname + location.search);
        break;
      case "hack":
        breach();
        break;
      case "clear":
        consoleLog.textContent = "";
        break;
      default:
        MW.log("UNKNOWN COMMAND // type help", "warn");
    }
  }

  function initConsole() {
    consoleToggle = el("button", "console-toggle", ">_ CONSOLE");
    consoleToggle.type = "button";
    consoleToggle.setAttribute("aria-expanded", "false");
    consoleToggle.setAttribute("aria-controls", "mw-console");
    consoleToggle.setAttribute("aria-label", "Open the site console");

    consoleEl = el("section", "console");
    consoleEl.id = "mw-console";
    consoleEl.setAttribute("aria-label", "Site console");

    var header = el("header");
    header.appendChild(el("span", "", "MWAMBA//NET CONSOLE"));
    var close = el("button", "", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close console");
    header.appendChild(close);

    consoleLog = el("ol", "console-log");
    consoleLog.setAttribute("aria-live", "polite");

    var form = el("form");
    form.setAttribute("autocomplete", "off");
    var labelEl = el("label", "sr-only", "Console command");
    labelEl.setAttribute("for", "mw-console-input");
    consoleInput = el("input");
    consoleInput.id = "mw-console-input";
    consoleInput.type = "text";
    consoleInput.placeholder = "type help";
    consoleInput.spellcheck = false;
    var run = el("button", "", "RUN");
    run.type = "submit";
    form.append(labelEl, consoleInput, run);

    consoleEl.append(header, consoleLog, form);
    document.body.append(consoleEl, consoleToggle);

    consoleToggle.addEventListener("click", function () {
      setConsoleOpen(!consoleEl.classList.contains("is-open"));
    });
    close.addEventListener("click", function () {
      setConsoleOpen(false);
      consoleToggle.focus();
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = consoleInput.value;
      consoleInput.value = "";
      runCommand(value);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && consoleEl.classList.contains("is-open")) {
        setConsoleOpen(false);
        consoleToggle.focus();
      }
    });

    MW.log("MWAMBA//NET ONLINE", "ok");
    MW.log("type help to see commands", "info");
  }

  /* =========================================================
     6. REVEAL, TYPING, GLITCH, EASTER EGG
     ========================================================= */

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window) || calm()) {
      items.forEach(function (item) { item.classList.add("is-in"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -5% 0px" });
    items.forEach(function (item) { observer.observe(item); });
    // Fail-safe: never leave a section invisible.
    window.setTimeout(function () {
      items.forEach(function (item) { item.classList.add("is-in"); });
    }, 4000);
  }
  MW.reveal = function (node) {
    node.classList.add("reveal", "is-in");
  };

  function initTyping() {
    if (calm()) return;
    document.querySelectorAll("[data-typing]").forEach(function (node) {
      var full = node.textContent;
      var i = 0;
      node.textContent = "";
      node.setAttribute("aria-label", full);
      (function type() {
        i += 1;
        node.textContent = full.slice(0, i);
        if (i < full.length) window.setTimeout(type, 34 + Math.random() * 30);
      })();
    });
  }

  function breach() {
    MW.log("BREACH SIMULATION // nothing real was touched", "warn");
    var targets = Array.prototype.slice.call(document.querySelectorAll("h1, h2")).slice(0, 10);
    targets.forEach(function (node, i) {
      node.classList.add("glitch");
      window.setTimeout(function () { glitch(node); }, i * 90);
    });
    if (MW.toast) MW.toast("Breach simulated. Your files are safe.");
  }

  function initEasterEgg() {
    var buffer = "";
    document.addEventListener("keydown", function (event) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key && event.key.length === 1) {
        buffer = (buffer + event.key.toLowerCase()).slice(-4);
        if (buffer === "hack") {
          buffer = "";
          breach();
        }
      }
    });
    // (Hovering the brand and titles is handled in js/flair.js.)
  }

  /* ---------- Start ---------- */
  function safe(fn) {
    try { fn(); } catch (error) { console.warn("fx:", error); }
  }

  safe(runBoot);
  safe(initNetMap);
  safe(initProfiler);
  safe(initHack);
  safe(initConsole);
  safe(initReveal);
  safe(initTyping);
  safe(initEasterEgg);
  if (!root.classList.contains("is-booting")) {
    window.setTimeout(function () { glitch(document.querySelector("h1.glitch")); }, 300);
  }
})();
