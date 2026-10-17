// js/cinematic.js
// Watch Dogs-inspired maximum cinematic mode.
// Decorative layer. Core site behaviour remains in js/script.js.

(function () {
  "use strict";

  var root = document.documentElement;
  var body = document.body;
  var main = document.getElementById("main") || document.querySelector("main");
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  root.classList.add("wd-cine-js");

  function motionOK() {
    return !reduceQuery.matches;
  }

  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function randomHex(length) {
    var chars = "0123456789ABCDEF";
    var out = "";
    for (var i = 0; i < length; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function formatDateTime(date) {
    return (
      date.getFullYear() +
      "-" +
      pad2(date.getMonth() + 1) +
      "-" +
      pad2(date.getDate()) +
      " " +
      pad2(date.getHours()) +
      ":" +
      pad2(date.getMinutes()) +
      ":" +
      pad2(date.getSeconds())
    );
  }

  function truncate(text, max) {
    text = String(text || "").trim().replace(/\s+/g, " ");
    if (text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 1)) + "…";
  }

  function on(el, type, fn, opts) {
    if (el) el.addEventListener(type, fn, opts || false);
  }

  function off(el, type, fn, opts) {
    if (el) el.removeEventListener(type, fn, opts || false);
  }

  var sessionId = randomHex(4) + "-" + randomHex(4);
  var startedAt = Date.now();

  var bootDone = false;
  var systemsStarted = false;
  var overdriveActive = false;

  var audioEnabled = false;
  var audioCtx = null;
  var masterGain = null;

  var removeBootListeners = function () {};
  var camItems = [];
  var lastFocused = null;
  var cursorHideTimer = null;
  var cursorRAF = null;
  var pendingCursorEvent = null;

  var camTargets = [
    "SUBJECT_01",
    "FACE_PRINT",
    "MOBILE_DEVICE",
    "MOTION_SIG",
    "UNKNOWN",
    "OPERATOR",
    "STUDENT_ID",
    "DEVICE_LINK"
  ];

  var bootLines = [
    "> INITIALIZING SECURE SHELL...",
    "> BYPASSING FIREWALL...",
    "> LOADING OPERATOR PROFILE...",
    "> MOUNTING PERSONAL DATABASE...",
    "> DECRYPTING MISSION FILES...",
    "> CALIBRATING SURVEILLANCE FEEDS...",
    "> ACCESS GRANTED"
  ];

  // Existing HTML elements
  var boot = document.getElementById("wd-boot");
  var bootLog = document.getElementById("wd-boot-log");
  var bootBar = document.getElementById("wd-boot-bar");

  var consoleEl = document.getElementById("wd-console");
  var consoleLogEl = document.getElementById("wd-console-log");
  var consoleToggleEl = document.getElementById("wd-console-toggle");
  var consoleCloseEl = document.getElementById("wd-console-close");
  var consoleStatusEl = document.getElementById("wd-console-status");
  var consoleFormEl = document.getElementById("wd-console-form");
  var consoleInputEl = document.getElementById("wd-console-input");
  var audioToggleEl = document.getElementById("wd-audio-toggle");

  var cursorEl = document.getElementById("wd-cursor");
  var cursorLabelEl = cursorEl ? cursorEl.querySelector(".wd-cursor-label") : null;

  var dossierEl = document.getElementById("wd-dossier");
  var dossierPanelEl = dossierEl ? dossierEl.querySelector(".wd-dossier-panel") : null;
  var dossierTitleEl = document.getElementById("wd-dossier-title");
  var dossierBodyEl = document.getElementById("wd-dossier-body");
  var dossierTagsEl = document.getElementById("wd-dossier-tags");
  var dossierMetaEl = document.getElementById("wd-dossier-meta");
  var dossierKickerEl = document.getElementById("wd-dossier-kicker");
  var dossierCloseEl = document.getElementById("wd-dossier-close");
  var dossierAccessEl = document.getElementById("wd-dossier-access");

  var themeToggleEl = document.getElementById("theme-toggle");
  var contactFormEl = document.getElementById("contact-form");
  var hoursFormEl = document.getElementById("hours-form");

  var progressEl = null;
  var staticFlashEl = null;

  /* =========================================================
     AUDIO SYSTEM
     Muted by default. Uses WebAudio synthesis, no external files.
     ========================================================= */

  function ensureAudio() {
    if (!audioEnabled) return null;

    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;

      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.085;
      masterGain.connect(audioCtx.destination);
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    return audioCtx;
  }

  function tone(freq, duration, type, vol, delay) {
    if (!audioEnabled) return;

    var ctx = ensureAudio();
    if (!ctx) return;

    var t = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol || 0.15, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  function noise(duration, vol, cutoff) {
    if (!audioEnabled) return;

    var ctx = ensureAudio();
    if (!ctx) return;

    var size = Math.floor(ctx.sampleRate * duration);
    var buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    var data = buffer.getChannelData(0);

    for (var i = 0; i < size; i++) {
      var envelope = Math.pow(1 - i / size, 2);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    var src = ctx.createBufferSource();
    src.buffer = buffer;

    var filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = cutoff || 1400;

    var gain = ctx.createGain();
    gain.gain.value = vol || 0.12;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    src.start();
  }

  function sfx(name) {
    if (!audioEnabled) return;

    switch (name) {
      case "enable":
        tone(880, 0.08, "square", 0.10);
        tone(1320, 0.10, "square", 0.08, 0.08);
        break;

      case "access":
        tone(520, 0.12, "triangle", 0.14);
        tone(780, 0.18, "triangle", 0.12, 0.10);
        break;

      case "unlock":
        tone(660, 0.08, "sine", 0.10);
        tone(990, 0.10, "sine", 0.08, 0.07);
        break;

      case "decrypt":
        noise(0.18, 0.10, 1700);
        tone(180, 0.16, "sawtooth", 0.07);
        break;

      case "track":
        tone(1200, 0.04, "square", 0.05);
        break;

      case "error":
        tone(220, 0.16, "sawtooth", 0.10);
        tone(160, 0.20, "sawtooth", 0.08, 0.08);
        break;

      case "alarm":
        tone(440, 0.12, "square", 0.10);
        tone(330, 0.16, "square", 0.10, 0.12);
        tone(440, 0.12, "square", 0.10, 0.28);
        break;

      case "click":
        tone(1400, 0.025, "square", 0.035);
        break;
    }
  }

  function setAudio(enabled) {
    audioEnabled = !!enabled;

    if (audioToggleEl) {
      audioToggleEl.textContent = audioEnabled ? "AUDIO ON" : "AUDIO OFF";
      audioToggleEl.setAttribute("aria-pressed", String(audioEnabled));
      audioToggleEl.classList.toggle("is-on", audioEnabled);
    }

    if (audioEnabled) {
      ensureAudio();
      sfx("enable");
      logToConsole("AUDIO // ENABLED", "ok");
    } else {
      logToConsole("AUDIO // MUTED", "warn");
    }

    updateStatus();
  }

  /* =========================================================
     CONSOLE SYSTEM
     ========================================================= */

  function logToConsole(message, type) {
    if (!consoleLogEl) return;

    var li = document.createElement("li");
    li.className = type || "info";
    li.textContent = message;
    consoleLogEl.appendChild(li);

    while (consoleLogEl.children.length > 120) {
      consoleLogEl.removeChild(consoleLogEl.firstChild);
    }

    consoleLogEl.scrollTop = consoleLogEl.scrollHeight;
  }

  function setConsoleOpen(open) {
    if (!consoleEl || !consoleToggleEl) return;

    consoleEl.classList.toggle("is-open", open);
    consoleEl.setAttribute("aria-hidden", String(!open));
    consoleToggleEl.setAttribute("aria-expanded", String(open));
    consoleToggleEl.textContent = open ? "CLOSE CONSOLE" : "SYS CONSOLE";

    if (open && consoleInputEl) {
      window.setTimeout(function () {
        consoleInputEl.focus();
      }, 80);
    }
  }

  function updateStatus() {
    if (!consoleStatusEl) return;

    var up = Math.floor((Date.now() - startedAt) / 1000);
    var mm = pad2(Math.floor(up / 60));
    var ss = pad2(up % 60);

    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var pct = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;

    consoleStatusEl.textContent =
      "SID " +
      sessionId +
      " // UP " +
      mm +
      ":" +
      ss +
      " // DECRYPTED " +
      pct +
      "% // AUDIO " +
      (audioEnabled ? "ON" : "OFF");
  }

  function ensureProgress() {
    if (progressEl) return progressEl;

    progressEl = document.querySelector(".wd-progress");

    if (!progressEl) {
      progressEl = document.createElement("div");
      progressEl.className = "wd-progress";
      progressEl.setAttribute("aria-hidden", "true");
      body.appendChild(progressEl);
    }

    return progressEl;
  }

  function ensureStaticFlash() {
    if (staticFlashEl) return staticFlashEl;

    staticFlashEl = document.querySelector(".wd-static-flash");

    if (!staticFlashEl) {
      staticFlashEl = document.createElement("div");
      staticFlashEl.className = "wd-static-flash";
      staticFlashEl.setAttribute("aria-hidden", "true");
      body.appendChild(staticFlashEl);
    }

    return staticFlashEl;
  }

  function initScrollProgress() {
    var bar = ensureProgress();

    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? (window.scrollY / max) * 100 : 0;

      if (bar) {
        bar.style.width = pct.toFixed(2) + "%";
      }

      updateStatus();
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  /* =========================================================
     GLITCH UTILITIES
     ========================================================= */

  function hardGlitch(el, duration) {
    if (!el || !motionOK()) return;

    el.classList.add("wd-glitch-hard");

    if (el.classList.contains("glitch")) {
      el.classList.add("is-glitching");
    }

    window.setTimeout(function () {
      el.classList.remove("wd-glitch-hard");
      el.classList.remove("is-glitching");
    }, duration || 320);
  }

  function shakeMain() {
    if (!main || !motionOK()) return;

    main.classList.add("wd-main-shake");

    window.setTimeout(function () {
      main.classList.remove("wd-main-shake");
    }, 360);
  }

  function pageGlitch() {
    if (!motionOK()) return;

    var flash = ensureStaticFlash();
    flash.classList.add("is-on");

    window.setTimeout(function () {
      flash.classList.remove("is-on");
    }, 520);
  }

  /* =========================================================
     BOOT SEQUENCE
     ========================================================= */

  function finishBoot(reason) {
    if (bootDone) return;
    bootDone = true;

    removeBootListeners();

    if (boot) {
      boot.classList.add("is-done");
    }

    body.classList.remove("wd-booting");

    if (!systemsStarted) {
      startSystems();
    }

    if (reason === "skip") {
      logToConsole("BOOT SKIPPED BY OPERATOR", "warn");
    } else {
      logToConsole("BOOT SEQUENCE COMPLETE", "ok");
    }

    if (motionOK()) {
      pageGlitch();
      shakeMain();
      sfx("access");
    }
  }

  function runBoot() {
    if (!boot) {
      finishBoot("complete");
      return;
    }

    var seen = false;

    try {
      seen = window.sessionStorage.getItem("wd-cine-boot-seen") === "1";
    } catch (error) {
      seen = false;
    }

    var force =
      window.location.hash === "#boot" ||
      window.location.search.indexOf("boot=1") !== -1;

    if (!motionOK() || (seen && !force)) {
      finishBoot("skip");
      return;
    }

    body.classList.add("wd-booting");

    var lineIndex = 0;
    var charIndex = 0;
    var prefix = "";
    var cancelled = false;

    function markSeen() {
      try {
        window.sessionStorage.setItem("wd-cine-boot-seen", "1");
      } catch (error) {
        // Storage may be blocked. Boot still finishes.
      }
    }

    function skipBoot() {
      if (cancelled) return;
      cancelled = true;
      markSeen();
      finishBoot("skip");
    }

    on(boot, "click", skipBoot);
    on(window, "keydown", skipBoot);
    on(window, "pointerdown", skipBoot);

    removeBootListeners = function () {
      off(boot, "click", skipBoot);
      off(window, "keydown", skipBoot);
      off(window, "pointerdown", skipBoot);
    };

    if (!bootLog) {
      finishBoot("complete");
      return;
    }

    function setProgress(value) {
      if (bootBar) {
        bootBar.style.width = clamp(value, 0, 100) + "%";
      }
    }

    function typeNext() {
      if (cancelled) return;

      if (lineIndex >= bootLines.length) {
        setProgress(100);

        window.setTimeout(function () {
          if (cancelled) return;
          cancelled = true;
          markSeen();
          finishBoot("complete");
        }, 520);

        return;
      }

      var current = bootLines[lineIndex];

      if (charIndex <= current.length) {
        bootLog.textContent = prefix + current.slice(0, charIndex);

        var lineProgress = current.length ? charIndex / current.length : 1;
        var totalProgress =
          ((lineIndex + lineProgress) / bootLines.length) * 100;

        setProgress(totalProgress);

        charIndex += 1;
        window.setTimeout(typeNext, 14 + Math.random() * 26);
      } else {
        prefix += current + "\n";
        bootLog.textContent = prefix;
        lineIndex += 1;
        charIndex = 0;
        window.setTimeout(typeNext, 120 + Math.random() * 160);
      }
    }

    window.setTimeout(typeNext, 220);
  }

  /* =========================================================
     HERO TYPING FALLBACK
     ========================================================= */

  function initHeroTyping() {
    var span = document.querySelector("#intro .cmd span");

    if (!span) return;

    // effects.js already handles [data-typing]. Do not duplicate.
    if (span.hasAttribute("data-typing")) return;

    if (!motionOK()) return;

    var full = span.textContent;
    var i = 0;

    span.textContent = "";

    (function type() {
      i += 1;
      span.textContent = full.slice(0, i);

      if (i < full.length) {
        window.setTimeout(type, 38 + Math.random() * 28);
      }
    })();
  }

  /* =========================================================
     SECTION UNLOCK / DECRYPT HEADINGS
     ========================================================= */

  function unlockAllSections() {
    toArray(document.querySelectorAll(".content-section")).forEach(function (section) {
      section.classList.add("wd-unlocked");
      section.classList.remove("wd-unlocking");
      section.dataset.wdUnlocked = "true";
    });
  }

  function scrambleHeading(el) {
    if (!el || el.dataset.wdHeadingScrambled === "true") return;

    var finalText = el.textContent.trim();

    if (!finalText) return;

    el.dataset.wdHeadingScrambled = "true";
    el.setAttribute("data-text", finalText);

    if (!motionOK()) return;

    var chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!<>-_\\/[]{}=+*^?#";
    var iteration = 0;

    var timer = window.setInterval(function () {
      var output = "";

      for (var i = 0; i < finalText.length; i++) {
        var ch = finalText.charAt(i);

        if (ch === " ") {
          output += " ";
        } else if (i < Math.floor(iteration)) {
          output += ch;
        } else {
          output += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      }

      el.textContent = output;
      el.setAttribute("data-text", output);

      iteration += 0.85;

      if (iteration >= finalText.length) {
        window.clearInterval(timer);
        el.textContent = finalText;
        el.setAttribute("data-text", finalText);
      }
    }, 34);
  }

  function unlockSection(section) {
    if (section.dataset.wdUnlocked === "true") return;

    section.dataset.wdUnlocked = "true";
    section.classList.add("wd-unlocking");

    var heading = section.querySelector("h2");

    if (heading) {
      scrambleHeading(heading);
      hardGlitch(heading, 340);
    }

    sfx("unlock");

    window.setTimeout(function () {
      section.classList.add("wd-unlocked");
      section.classList.remove("wd-unlocking");

      var id = (section.id || "SECTION").toUpperCase();
      logToConsole("SECTION // " + id + " UNLOCKED", "ok");
    }, 430);
  }

  function initSectionUnlock() {
    var sections = toArray(document.querySelectorAll(".content-section"));

    if (!sections.length) return;

    if (!motionOK() || !("IntersectionObserver" in window)) {
      unlockAllSections();
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            unlockSection(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.16,
        rootMargin: "0px 0px -8% 0px"
      }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* =========================================================
     CARD SCRAMBLE / DECRYPT
     ========================================================= */

  function scrambleElements(elements, callback) {
    var valid = toArray(elements).filter(Boolean);

    if (!valid.length) {
      callback();
      return;
    }

    valid.forEach(function (el) {
      if (typeof el.dataset.wdOriginal === "undefined") {
        el.dataset.wdOriginal = el.textContent;
      }
    });

    if (!motionOK()) {
      valid.forEach(function (el) {
        el.textContent = el.dataset.wdOriginal;
      });
      callback();
      return;
    }

    var chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!<>-_\\/[]{}=+*^?#________";
    var duration = 520;
    var start = Date.now();

    function frame() {
      var progress = clamp((Date.now() - start) / duration, 0, 1);

      valid.forEach(function (el) {
        var original = el.dataset.wdOriginal || "";
        var output = "";

        for (var i = 0; i < original.length; i++) {
          var ch = original.charAt(i);

          if (ch === " " || i / original.length < progress * 1.15) {
            output += ch;
          } else {
            output += chars.charAt(Math.floor(Math.random() * chars.length));
          }
        }

        el.textContent = output;
      });

      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        valid.forEach(function (el) {
          el.textContent = el.dataset.wdOriginal || "";
        });
        callback();
      }
    }

    window.requestAnimationFrame(frame);
  }

  function decryptCard(card) {
    if (card.dataset.wdBusy === "true") return;

    card.dataset.wdBusy = "true";

    var open = card.classList.toggle("wd-open");
    var btn = card.querySelector(".wd-decrypt-btn");

    if (btn) {
      btn.textContent = open ? "ACCESS GRANTED" : "DECRYPT";
    }

    card.classList.add("wd-decrypting");
    shakeMain();
    hardGlitch(card.querySelector("h3"), 300);
    sfx("decrypt");

    var elements = [card.querySelector("h3"), card.querySelector("p")].concat(
      toArray(card.querySelectorAll(".tags li"))
    );

    scrambleElements(elements, function () {
      card.classList.remove("wd-decrypting");
      card.dataset.wdBusy = "false";

      var fileId = card.dataset.wdFile || "FILE";

      logToConsole(
        fileId + (open ? " // DECRYPTED" : " // RE-ENCRYPTED"),
        open ? "ok" : "warn"
      );

      if (open) {
        openDossier(card);
      }
    });
  }

  function activateCard(card) {
    if (card.dataset.wdBusy === "true") return;

    if (card.classList.contains("wd-open")) {
      openDossier(card);
    } else {
      decryptCard(card);
    }
  }

  function initCards() {
    var cards = toArray(document.querySelectorAll(".card"));

    cards.forEach(function (card, index) {
      if (card.querySelector(".wd-decrypt-btn")) return;

      var fileId = "FILE_0" + (index + 1);
      card.dataset.wdFile = fileId;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wd-decrypt-btn";
      btn.textContent = "DECRYPT";
      btn.setAttribute("aria-label", "Decrypt " + fileId);

      card.appendChild(btn);

      on(btn, "click", function (event) {
        event.stopPropagation();
        activateCard(card);
      });

      on(card, "click", function (event) {
        if (event.target.closest("a, button, input, select, textarea")) return;
        activateCard(card);
      });
    });
  }

  /* =========================================================
     MISSION DOSSIER MODAL
     ========================================================= */

  function addMeta(label, value) {
    if (!dossierMetaEl) return;

    var dt = document.createElement("dt");
    var dd = document.createElement("dd");

    dt.textContent = label;
    dd.textContent = value;

    dossierMetaEl.appendChild(dt);
    dossierMetaEl.appendChild(dd);
  }

  function openDossier(card) {
    if (!dossierEl || !dossierPanelEl) return;

    var titleEl = card.querySelector("h3");
    var bodyTextEl = card.querySelector("p");
    var tags = toArray(card.querySelectorAll(".tags li"));

    var title = titleEl ? titleEl.textContent.trim() : "MISSION FILE";
    var bodyText = bodyTextEl ? bodyTextEl.textContent.trim() : "";

    if (dossierTitleEl) dossierTitleEl.textContent = title;
    if (dossierBodyEl) dossierBodyEl.textContent = bodyText;

    if (dossierKickerEl) {
      dossierKickerEl.textContent =
        (card.dataset.wdFile || "MISSION FILE") + " // DECRYPTED";
    }

    if (dossierTagsEl) {
      dossierTagsEl.innerHTML = "";

      tags.forEach(function (li) {
        var clone = li.cloneNode(true);
        dossierTagsEl.appendChild(clone);
      });
    }

    if (dossierMetaEl) {
      dossierMetaEl.innerHTML = "";
      addMeta("FILE", card.dataset.wdFile || "FILE_01");
      addMeta("STATUS", card.classList.contains("wd-open") ? "DECRYPTED" : "LOCKED");
      addMeta("CLEARANCE", "OPERATOR");
      addMeta("MODULES", tags.length ? tags.length + " LINKED" : "NONE");
      addMeta("TIMESTAMP", formatDateTime(new Date()));
    }

    lastFocused = document.activeElement;

    dossierEl.classList.add("is-open");
    dossierEl.setAttribute("aria-hidden", "false");

    window.setTimeout(function () {
      if (dossierCloseEl) dossierCloseEl.focus();
    }, 40);

    sfx("access");
    logToConsole("DOSSIER // " + title.toUpperCase() + " OPENED", "info");
  }

  function closeDossier() {
    if (!dossierEl) return;

    dossierEl.classList.remove("is-open");
    dossierEl.setAttribute("aria-hidden", "true");

    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }

    sfx("click");
  }

  function initDossierEvents() {
    if (!dossierEl) return;

    on(dossierCloseEl, "click", closeDossier);
    on(dossierAccessEl, "click", closeDossier);

    on(dossierEl, "click", function (event) {
      if (event.target === dossierEl) {
        closeDossier();
      }
    });
  }

  function trapDossierFocus(event) {
    if (event.key !== "Tab") return;
    if (!dossierEl || !dossierEl.classList.contains("is-open")) return;
    if (!dossierPanelEl) return;

    var focusables = dossierPanelEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (!focusables.length) return;

    var first = focusables[0];
    var last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* =========================================================
     CAMERA FEEDS
     ========================================================= */

  function updateCamTimes() {
    var now = formatDateTime(new Date());

    camItems.forEach(function (item) {
      if (item.time) {
        item.time.textContent = now;
      }
    });
  }

  function moveTracking(item) {
    if (!item || !item.box || !motionOK()) return;

    var left = 8 + Math.random() * 48;
    var top = 18 + Math.random() * 42;
    var width = 20 + Math.random() * 24;
    var height = 18 + Math.random() * 22;

    item.box.style.left = left + "%";
    item.box.style.top = top + "%";
    item.box.style.width = width + "%";
    item.box.style.height = height + "%";
    item.box.dataset.target =
      camTargets[Math.floor(Math.random() * camTargets.length)];
    item.box.classList.add("is-active");

    sfx("track");
  }

  function initCameraFeeds() {
    var figures = toArray(document.querySelectorAll(".gallery figure"));

    figures.forEach(function (fig, index) {
      if (fig.dataset.wdCamInit === "true") return;

      fig.dataset.wdCamInit = "true";

      var camId = "CAM_0" + (index + 1);
      fig.dataset.wdCam = camId;

      var img = fig.querySelector("img");
      var view = fig.querySelector(".wd-cam-view");

      if (img && !view) {
        view = document.createElement("div");
        view.className = "wd-cam-view";
        img.parentNode.insertBefore(view, img);
        view.appendChild(img);
      }

      if (!view) view = fig;

      var time = document.createElement("div");
      time.className = "wd-cam-time";
      time.setAttribute("aria-hidden", "true");
      time.textContent = formatDateTime(new Date());
      view.appendChild(time);

      var box = document.createElement("div");
      box.className = "wd-tracking-box";
      box.setAttribute("aria-hidden", "true");
      box.dataset.target = camTargets[index % camTargets.length];
      view.appendChild(box);

      var scan = document.createElement("span");
      scan.className = "wd-cam-scan";
      scan.setAttribute("aria-hidden", "true");
      view.appendChild(scan);

      var item = {
        fig: fig,
        view: view,
        time: time,
        box: box,
        camId: camId,
        lastLog: 0
      };

      camItems.push(item);

      on(fig, "pointerenter", function () {
        var now = Date.now();

        if (now - item.lastLog > 2500) {
          logToConsole(camId + " // SUBJECT ACQUIRED", "info");
          item.lastLog = now;
        }

        moveTracking(item);
      });
    });

    if (!camItems.length) return;

    updateCamTimes();

    if (motionOK()) {
      window.setInterval(updateCamTimes, 1000);

      window.setInterval(function () {
        var item = camItems[Math.floor(Math.random() * camItems.length)];
        moveTracking(item);
      }, 2400);

      camItems.forEach(function (item, i) {
        window.setTimeout(function () {
          moveTracking(item);
        }, 600 + i * 250);
      });
    } else {
      camItems.forEach(function (item) {
        item.box.style.left = "18%";
        item.box.style.top = "24%";
        item.box.style.width = "32%";
        item.box.style.height = "26%";
        item.box.classList.add("is-active");
      });
    }
  }

  /* =========================================================
     CURSOR SCANNER
     ========================================================= */

  function getCursorLabel(target) {
    if (!target) return "";

    var card = target.closest(".card");
    if (card) {
      var title = card.querySelector("h3");
      return (
        (card.dataset.wdFile || "FILE") +
        " // " +
        truncate(title ? title.textContent : "MODULE", 18)
      );
    }

    var fig = target.closest(".gallery figure");
    if (fig) {
      return (fig.dataset.wdCam || "CAM") + " // FEED";
    }

    if (target.tagName === "A") {
      return truncate(target.textContent.trim() || target.getAttribute("href"), 22);
    }

    if (target.tagName === "BUTTON") {
      return truncate(target.textContent.trim(), 22);
    }

    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    ) {
      return (target.id || target.name || "FIELD").toUpperCase();
    }

    return "TARGET";
  }

  function processCursorFrame() {
    cursorRAF = null;

    var event = pendingCursorEvent;
    if (!event || !cursorEl) return;

    cursorEl.classList.add("is-visible");
    cursorEl.style.transform =
      "translate3d(" + event.clientX + "px," + event.clientY + "px,0)";

    var target = event.target;

    if (target && target.closest) {
      var lockTarget = target.closest(
        'a, button, input, select, textarea, .card, .gallery figure, #wd-console-toggle, .wd-decrypt-btn'
      );

      if (lockTarget) {
        cursorEl.classList.add("is-lock");
        if (cursorLabelEl) {
          cursorLabelEl.textContent = getCursorLabel(lockTarget);
        }
      } else {
        cursorEl.classList.remove("is-lock");
        if (cursorLabelEl) {
          cursorLabelEl.textContent = "";
        }
      }
    }

    window.clearTimeout(cursorHideTimer);
    cursorHideTimer = window.setTimeout(function () {
      if (cursorEl) {
        cursorEl.classList.remove("is-visible");
        cursorEl.classList.remove("is-lock");
      }
    }, 1800);
  }

  function onCursorMove(event) {
    pendingCursorEvent = event;

    if (!cursorRAF) {
      cursorRAF = window.requestAnimationFrame(processCursorFrame);
    }
  }

  function initCursor() {
    if (!motionOK()) return;

    var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!finePointer.matches) return;

    if (!cursorEl) {
      cursorEl = document.createElement("div");
      cursorEl.id = "wd-cursor";
      cursorEl.className = "wd-cursor";
      cursorEl.setAttribute("aria-hidden", "true");
      cursorEl.innerHTML =
        '<span class="wd-cursor-ring"></span><span class="wd-cursor-label"></span>';
      body.appendChild(cursorEl);
      cursorLabelEl = cursorEl.querySelector(".wd-cursor-label");
    }

    on(document, "mousemove", onCursorMove, { passive: true });

    on(document, "mouseleave", function () {
      if (cursorEl) {
        cursorEl.classList.remove("is-visible");
        cursorEl.classList.remove("is-lock");
      }
    });
  }

  /* =========================================================
     BACKGROUND DATA CANVAS
     ========================================================= */

  function initBackground() {
    if (!motionOK()) return;

    if (document.getElementById("wd-bg-canvas")) return;

    var canvas = document.createElement("canvas");
    canvas.id = "wd-bg-canvas";
    canvas.setAttribute("aria-hidden", "true");
    body.insertBefore(canvas, body.firstChild);

    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = 0;
    var h = 0;
    var nodes = [];
    var rafId = null;

    function spawnNode() {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 1 + Math.random() * 1.6,
        color: Math.random() < 0.75 ? "57,255,136" : "39,230,255"
      };
    }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var count = Math.min(58, Math.max(20, Math.floor(w / 28)));
      nodes = [];

      for (var i = 0; i < count; i++) {
        nodes.push(spawnNode());
      }
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);

      var i, j, a, b, dx, dy, dist, alpha;

      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];

        a.x += a.vx;
        a.y += a.vy;

        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;

        for (j = i + 1; j < nodes.length; j++) {
          b = nodes[j];

          dx = a.x - b.x;
          dy = a.y - b.y;
          dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            alpha = (1 - dist / 130) * 0.16;
            ctx.strokeStyle = "rgba(57, 255, 136, " + alpha + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (i = 0; i < nodes.length; i++) {
        a = nodes[i];

        ctx.fillStyle = "rgba(" + a.color + ", 0.65)";
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(" + a.color + ", 0.12)";
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(tick);
    }

    function start() {
      if (!rafId && motionOK()) {
        rafId = window.requestAnimationFrame(tick);
      }
    }

    function stop() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    resize();
    start();

    on(window, "resize", resize);

    on(document, "visibilitychange", function () {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    });
  }

  /* =========================================================
     CONSOLE COMMANDS
     ========================================================= */

  function setTheme(theme) {
    if (theme !== "light" && theme !== "dark") return;

    root.setAttribute("data-theme", theme);

    if (themeToggleEl) {
      themeToggleEl.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    }

    try {
      window.localStorage.setItem("theme", theme);
    } catch (error) {
      // Storage unavailable: theme still changes for this visit.
    }

    logToConsole("THEME // " + theme.toUpperCase() + " MODE ENGAGED", "info");
    sfx("click");
  }

  function scrollToSection(name) {
    var map = {
      home: "intro",
      intro: "intro",
      about: "about",
      hobbies: "hobbies",
      plan: "plan",
      learning: "plan",
      projects: "projects",
      photos: "photos",
      media: "media",
      contact: "contact"
    };

    var id = map[String(name || "").toLowerCase()];
    var section = id ? document.getElementById(id) : null;

    if (!section) {
      logToConsole("ROUTE // UNKNOWN SECTION", "warn");
      sfx("error");
      return;
    }

    section.scrollIntoView({
      behavior: motionOK() ? "smooth" : "auto",
      block: "start"
    });

    logToConsole("ROUTE // #" + id.toUpperCase(), "info");
    sfx("click");
  }

  function breachSimulation() {
    if (overdriveActive) return;

    overdriveActive = true;

    body.classList.add("wd-overdrive");

    logToConsole(
      "UNAUTHORIZED COMMAND DETECTED // BREACH SIMULATION",
      "warn"
    );

    sfx("alarm");
    shakeMain();
    pageGlitch();

    var targets = toArray(document.querySelectorAll("h1, h2, .card")).slice(0, 16);

    targets.forEach(function (el, i) {
      window.setTimeout(function () {
        hardGlitch(el, 320);
      }, i * 45);
    });

    window.setTimeout(function () {
      body.classList.remove("wd-overdrive");
      overdriveActive = false;
      updateStatus();
      logToConsole("BREACH SIMULATION // CONTAINED", "ok");
    }, 1800);
  }

  function runCommand(raw) {
    var command = String(raw || "").trim();

    if (!command) return;

    logToConsole("> " + command, "info");

    var parts = command.toLowerCase().split(/\s+/);
    var action = parts[0];
    var arg = parts[1] || "";

    switch (action) {
      case "help":
        logToConsole("COMMANDS // HELP, CLEAR, STATUS, THEME [DARK|LIGHT], GOTO [SECTION], AUDIO [ON|OFF], HACK", "ok");
        logToConsole("EXAMPLE // goto projects", "info");
        logToConsole("EXAMPLE // hack", "warn");
        sfx("click");
        break;

      case "clear":
        if (consoleLogEl) consoleLogEl.innerHTML = "";
        logToConsole("CONSOLE // CLEARED", "ok");
        sfx("click");
        break;

      case "status":
        logToConsole("SESSION // " + sessionId, "info");
        logToConsole("OPERATOR // MULENGA MWAMBA", "info");
        logToConsole("UPTIME // " + Math.floor((Date.now() - startedAt) / 1000) + "s", "info");
        logToConsole("AUDIO // " + (audioEnabled ? "ENABLED" : "MUTED"), audioEnabled ? "ok" : "warn");
        sfx("click");
        break;

      case "theme":
        if (arg === "light" || arg === "dark") {
          setTheme(arg);
        } else {
          var current = root.getAttribute("data-theme") || "dark";
          setTheme(current === "dark" ? "light" : "dark");
        }
        break;

      case "goto":
      case "go":
        scrollToSection(arg);
        break;

      case "audio":
        if (arg === "on" || arg === "enable") {
          setAudio(true);
        } else if (arg === "off" || arg === "mute" || arg === "disable") {
          setAudio(false);
        } else {
          setAudio(!audioEnabled);
        }
        break;

      case "hack":
        breachSimulation();
        break;

      default:
        logToConsole("UNKNOWN COMMAND // TYPE help", "warn");
        sfx("error");
        break;
    }
  }

  function initConsole() {
    setConsoleOpen(false);

    on(consoleToggleEl, "click", function () {
      var isOpen = consoleEl && consoleEl.classList.contains("is-open");
      setConsoleOpen(!isOpen);
      sfx("click");
    });

    on(consoleCloseEl, "click", function () {
      setConsoleOpen(false);
      sfx("click");
    });

    on(audioToggleEl, "click", function () {
      setAudio(!audioEnabled);
    });

    on(consoleFormEl, "submit", function (event) {
      event.preventDefault();

      if (!consoleInputEl) return;

      var value = consoleInputEl.value;
      consoleInputEl.value = "";
      runCommand(value);
    });
  }

  /* =========================================================
     EVENT LOGGING
     ========================================================= */

  function initEventLogging() {
    toArray(document.querySelectorAll('nav a[href^="#"]')).forEach(function (link) {
      on(link, "click", function () {
        var route = (link.getAttribute("href") || "#").toUpperCase();
        logToConsole("ROUTE // " + route, "info");
        sfx("click");
      });
    });

    on(themeToggleEl, "click", function () {
      window.setTimeout(function () {
        var theme = (root.getAttribute("data-theme") || "dark").toUpperCase();
        logToConsole("THEME // " + theme + " MODE ENGAGED", "info");
        sfx("click");
      }, 0);
    });

    on(contactFormEl, "submit", function () {
      window.setTimeout(function () {
        var feedback = document.getElementById("form-feedback");
        var ok = feedback && feedback.classList.contains("feedback-success");

        logToConsole(
          ok
            ? "TRANSMISSION // VALIDATED LOCALLY"
            : "TRANSMISSION // PAYLOAD REJECTED",
          ok ? "ok" : "warn"
        );

        sfx(ok ? "access" : "error");
      }, 0);
    });

    on(hoursFormEl, "submit", function () {
      window.setTimeout(function () {
        var result = document.getElementById("hours-result");
        var error = hoursFormEl.querySelector(".error:not(:empty)");

        logToConsole(
          error
            ? "CALCULATOR // INVALID INPUT"
            : "CALCULATOR // " + (result ? result.textContent : "RESULT"),
          error ? "warn" : "ok"
        );

        sfx(error ? "error" : "click");
      }, 0);
    });
  }

  /* =========================================================
     EASTER EGG
     ========================================================= */

  function initEasterEgg() {
    var buffer = "";
    var secret = "hack";

    on(document, "keydown", function (event) {
      var activeTag =
        document.activeElement && document.activeElement.tagName;

      if (
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "SELECT"
      ) {
        return;
      }

      if (event.key && event.key.length === 1) {
        buffer = (buffer + event.key.toLowerCase()).slice(-secret.length);
      }

      if (buffer === secret) {
        buffer = "";
        breachSimulation();
      }
    });
  }

  /* =========================================================
     GLOBAL KEYBOARD
     ========================================================= */

  function initGlobalKeys() {
    on(document, "keydown", function (event) {
      trapDossierFocus(event);

      if (event.key === "Escape") {
        if (dossierEl && dossierEl.classList.contains("is-open")) {
          closeDossier();
          return;
        }

        if (consoleEl && consoleEl.classList.contains("is-open")) {
          setConsoleOpen(false);
        }
      }
    });
  }

  /* =========================================================
     START SYSTEMS
     ========================================================= */

  function startSystems() {
    if (systemsStarted) return;
    systemsStarted = true;

    logToConsole("SYSTEM CONSOLE ONLINE", "ok");
    logToConsole("OPERATOR // MULENGA MWAMBA", "info");
    logToConsole("SESSION // " + sessionId, "info");
    logToConsole("TYPE help TO VIEW COMMANDS", "ok");

    initHeroTyping();
    initSectionUnlock();
    initCards();
    initDossierEvents();
    initCameraFeeds();
    initCursor();
    initBackground();
    initEventLogging();
    initEasterEgg();
  }

  /* =========================================================
     INIT
     ========================================================= */

  function init() {
    ensureProgress();
    ensureStaticFlash();

    initConsole();
    initScrollProgress();
    initGlobalKeys();

    updateStatus();
    window.setInterval(updateStatus, 1000);

    runBoot();
  }

  try {
    init();
  } catch (error) {
    // Fail-safe: never leave the site locked or hidden.
    unlockAllSections();

    if (boot) {
      boot.classList.add("is-done");
    }

    body.classList.remove("wd-booting");
  }
})();
