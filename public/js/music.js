// js/music.js  -  🎵 Music on posts and statuses.
//   MW.musicChip(sound, opts)  a "🎵 Title · Artist" button that plays the track from its start point (loops ~30 s).
//                              Only one track plays at a time across the page; a playing video pauses it.
//   MW.pickSound(current)      a sheet to choose music: the free library, "My sounds", or upload your own.
//                              Resolves with { id, title, artist, url, duration, start } or null (no music).
// Chart songs aren't offered: Chapterhive has no record-label deals, so tracks are royalty-free or the creator's own.
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;
  var CLIP = 30; // seconds of a track that play before looping back to its start

  /* ---------- One shared player ---------- */
  var player = new Audio();
  player.preload = "none";
  var current = null; // { sound, chip, onStop }
  player.addEventListener("timeupdate", function () {
    if (!current) return;
    var start = current.sound.start || 0;
    if (player.currentTime >= start + CLIP || player.currentTime < start - 0.5) player.currentTime = start;
  });
  player.addEventListener("ended", function () { if (current) { player.currentTime = current.sound.start || 0; player.play().catch(function () {}); } });

  function setChip(chip, playing) {
    if (!chip) return;
    chip.classList.toggle("is-playing", playing);
    chip.setAttribute("aria-pressed", String(playing));
    var icon = chip.querySelector(".music-icon");
    if (icon) icon.textContent = playing ? "⏸" : "▶";
  }

  MW.music = {
    play: function (sound, chip) {
      if (current && current.chip !== chip) setChip(current.chip, false);
      var same = current && current.sound.url === sound.url;
      current = { sound: sound, chip: chip };
      if (!same) { player.src = sound.url; }
      try { if (!same || player.currentTime < (sound.start || 0)) player.currentTime = sound.start || 0; } catch (e) { /* not loaded yet */ }
      var go = player.play();
      if (!same) player.addEventListener("loadedmetadata", function once() {
        player.removeEventListener("loadedmetadata", once);
        try { player.currentTime = sound.start || 0; } catch (e) { /* ignore */ }
      });
      setChip(chip, true);
      return go && go.catch ? go.catch(function () { setChip(chip, false); }) : null;
    },
    stop: function () {
      player.pause();
      if (current) setChip(current.chip, false);
      current = null;
    },
    pause: function () { player.pause(); if (current) setChip(current.chip, false); },
    isPlaying: function (chip) { return Boolean(current && current.chip === chip && !player.paused); },
    player: player
  };

  // A video on the page starting to play pauses the music.
  document.addEventListener("play", function (e) {
    if (e.target && e.target.tagName === "VIDEO" && !e.target.muted) MW.music.pause();
  }, true);

  MW.musicChip = function (sound, opts) {
    opts = opts || {};
    var chip = el("button", { type: "button", class: "music-chip" + (opts.small ? " is-small" : ""), "aria-pressed": "false",
      title: "Play the music on this post", "aria-label": "Music: " + sound.title + (sound.artist ? " by " + sound.artist : "") + ". Tap to play or pause." });
    chip.appendChild(el("span", { class: "music-icon", "aria-hidden": "true" }, "▶"));
    chip.appendChild(el("span", { class: "music-note", "aria-hidden": "true" }, "🎵"));
    var name = el("span", { class: "music-name" });
    name.appendChild(el("span", { class: "music-scroll" }, sound.title + (sound.artist ? " · " + sound.artist : "")));
    chip.appendChild(name);
    chip.appendChild(el("span", { class: "music-bars", "aria-hidden": "true" }, ""));
    ["", "", ""].forEach(function () { chip.lastChild.appendChild(el("i")); });
    chip.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      if (MW.music.isPlaying(chip)) MW.music.pause(); else MW.music.play(sound, chip);
    });
    return chip;
  };

  /* ---------- Picking music ---------- */
  function fmt(s) {
    s = Math.max(0, Math.round(s || 0));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function audioDuration(file) {
    return new Promise(function (resolve) {
      var a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = function () { resolve(isFinite(a.duration) ? a.duration : null); URL.revokeObjectURL(a.src); };
      a.onerror = function () { resolve(null); };
      a.src = URL.createObjectURL(file);
    });
  }

  MW.pickSound = function (currentSound) {
    return new Promise(function (resolve) {
      var old = document.getElementById("sound-sheet");
      if (old) old.remove();
      var isAdmin = MW.account && MW.account.user && MW.account.user.role === "admin";
      var dialog = el("dialog", { id: "sound-sheet", class: "heist-dialog sound-sheet", "aria-labelledby": "sound-title" });
      dialog.appendChild(el("p", { class: "node-label" }, "Music"));
      dialog.appendChild(el("h2", { id: "sound-title" }, "🎵 Add music"));
      var tabs = el("div", { class: "chip-row sound-tabs", role: "tablist" });
      var body = el("div", { class: "sound-body" });
      var chosen = null;
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        MW.music.stop();
        dialog.close();
        dialog.remove();
        resolve(value);
      }
      dialog.addEventListener("close", function () { finish(undefined); });

      function tab(key, label) {
        var b = el("button", { type: "button", class: "chip", role: "tab", "aria-pressed": "false", "data-tab": key }, label);
        b.addEventListener("click", function () { show(key); });
        tabs.appendChild(b);
      }
      tab("library", "🐝 Free library");
      tab("mine", "📁 My sounds");
      tab("upload", "⬆ Upload");
      dialog.appendChild(tabs);
      dialog.appendChild(body);

      var foot = el("div", { class: "sound-foot" });
      if (currentSound) {
        var none = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Remove music");
        none.addEventListener("click", function () { finish(null); });
        foot.appendChild(none);
      }
      var cancel = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Cancel");
      cancel.addEventListener("click", function () { finish(undefined); });
      foot.appendChild(cancel);
      dialog.appendChild(foot);

      function show(key) {
        tabs.querySelectorAll("[data-tab]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tab") === key)); });
        MW.music.stop();
        body.textContent = "";
        if (key === "upload") return uploadForm();
        var search = el("input", { type: "search", placeholder: "Search music", "aria-label": "Search music", maxlength: "40" });
        body.appendChild(search);
        var list = el("div", { class: "sound-list", "aria-live": "polite" });
        body.appendChild(list);
        if (key === "library") body.appendChild(el("p", { class: "muted sound-note" }, "Royalty-free tracks anyone can use on Chapterhive. Popular songs from the charts can't be added: they need record-label licences."));
        var t = null;
        function load() {
          list.textContent = "";
          list.appendChild(el("p", { class: "muted" }, "Loading…"));
          MW.api("/sounds?tab=" + key + "&q=" + encodeURIComponent(search.value.trim())).then(function (d) {
            list.textContent = "";
            if (!d.sounds.length) {
              list.appendChild(el("p", { class: "muted" }, key === "mine" ? "You haven't uploaded any sounds yet. Use ⬆ Upload." : "Nothing matches."));
              return;
            }
            d.sounds.forEach(function (s) { list.appendChild(row(s, load)); });
          }).catch(function (e) { list.textContent = e.message; });
        }
        search.addEventListener("input", function () { clearTimeout(t); t = setTimeout(load, 250); });
        load();
      }

      function row(s, reload) {
        var r = el("div", { class: "sound-row" });
        var play = MW.musicChip({ title: s.title, artist: s.artist, url: s.url, start: 0 }, { small: true });
        r.appendChild(play);
        var meta = el("span", { class: "muted mono sound-len" }, s.duration ? fmt(s.duration) : "");
        r.appendChild(meta);
        var use = el("button", { type: "button", class: "btn btn-small" }, "Use");
        use.addEventListener("click", function () { startStep(s); });
        r.appendChild(use);
        if (s.canRemove) {
          var rm = el("button", { type: "button", class: "btn btn-ghost btn-small", title: "Remove this sound", "aria-label": "Remove " + s.title }, "🗑");
          rm.addEventListener("click", function () {
            if (!window.confirm("Remove \"" + s.title + "\"? Posts already using it lose their music.")) return;
            MW.api("/sounds/" + s.id, { method: "DELETE" }).then(reload).catch(function (e) { MW.toast(e.message, true); });
          });
          r.appendChild(rm);
        }
        if (s.licenseNote && s.library) r.title = s.licenseNote;
        return r;
      }

      // Choose which part of the track plays.
      function startStep(s) {
        MW.music.stop();
        chosen = { id: s.id, title: s.title, artist: s.artist, url: s.url, duration: s.duration, start: 0 };
        body.textContent = "";
        tabs.hidden = true;
        body.appendChild(el("p", {}, "🎵 " + s.title + (s.artist ? " · " + s.artist : "")));
        var max = Math.max(0, Math.floor((s.duration || CLIP) - Math.min(CLIP, s.duration || CLIP)));
        var label = el("label", { class: "sound-start" }, "Start the music at ");
        var out = el("output", {}, "0:00");
        label.appendChild(out);
        var range = el("input", { type: "range", min: "0", max: String(max), step: "1", value: "0", "aria-label": "Where the music starts" });
        var preview = MW.musicChip({ title: "Preview from here", artist: "", url: s.url, start: 0 }, { small: true });
        range.addEventListener("input", function () {
          chosen.start = Number(range.value);
          out.textContent = fmt(chosen.start);
          if (MW.music.isPlaying(preview)) MW.music.play({ url: s.url, start: chosen.start, title: s.title }, preview);
        });
        preview.addEventListener("click", function () { /* the chip's own handler plays from 0; restart from the chosen point */
          setTimeout(function () { if (MW.music.isPlaying(preview)) { MW.music.player.currentTime = chosen.start; current.sound = { url: s.url, start: chosen.start }; } }, 0);
        });
        body.appendChild(label);
        if (max > 0) body.appendChild(range); else body.appendChild(el("p", { class: "muted" }, "This track is short, so it plays from the start."));
        body.appendChild(preview);
        body.appendChild(el("p", { class: "muted sound-note" }, "About " + CLIP + " seconds play, then it loops."));
        var row2 = el("div", { class: "sound-foot" });
        var back = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "← Back");
        back.addEventListener("click", function () { tabs.hidden = false; show("library"); });
        var ok = el("button", { type: "button", class: "btn btn-small" }, "✓ Add this music");
        ok.addEventListener("click", function () { finish(chosen); });
        row2.appendChild(back);
        row2.appendChild(ok);
        body.appendChild(row2);
      }

      function uploadForm() {
        var form = el("form", { class: "sound-upload" });
        form.appendChild(el("p", { class: "muted" }, "Your own music, beat, voice-over or sound effect (MP3, M4A, WAV or OGG, up to 50 MB)."));
        var file = el("input", { type: "file", accept: "audio/*,.mp3,.m4a,.wav,.ogg", required: "", "aria-label": "Audio file" });
        var title = el("input", { type: "text", placeholder: "Name of the sound", maxlength: "80", required: "", "aria-label": "Name" });
        var artist = el("input", { type: "text", placeholder: "Artist (you, or who made it)", maxlength: "80", "aria-label": "Artist" });
        form.appendChild(file); form.appendChild(title); form.appendChild(artist);
        var lib = null, note = null;
        if (isAdmin) {
          var libRow = el("label", { class: "check-row" });
          lib = el("input", { type: "checkbox" });
          libRow.appendChild(lib);
          libRow.appendChild(document.createTextNode(" Add to the free library for everyone (royalty-free tracks only)"));
          form.appendChild(libRow);
          note = el("input", { type: "text", placeholder: "Where it's from and its licence, e.g. a Pixabay Music link", maxlength: "300", hidden: "", "aria-label": "Source and licence" });
          form.appendChild(note);
          lib.addEventListener("change", function () { note.hidden = !lib.checked; });
        }
        var rightsRow = el("label", { class: "check-row" });
        var rights = el("input", { type: "checkbox" });
        rightsRow.appendChild(rights);
        rightsRow.appendChild(document.createTextNode(" I made this audio or have the rights to use it. I understand posts with music I don't have rights to can be taken down."));
        form.appendChild(rightsRow);
        var status = el("p", { class: "muted", "aria-live": "polite" });
        var send = el("button", { type: "submit", class: "btn btn-small" }, "⬆ Upload");
        form.appendChild(send);
        form.appendChild(status);
        file.addEventListener("change", function () {
          if (file.files[0] && !title.value) title.value = file.files[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 80);
        });
        form.addEventListener("submit", async function (e) {
          e.preventDefault();
          var f = file.files[0];
          var toLibrary = Boolean(lib && lib.checked);
          if (!f) return;
          if (!toLibrary && !rights.checked) { status.textContent = "Tick the box to confirm you have the rights."; return; }
          send.disabled = true;
          try {
            var duration = await audioDuration(f);
            var up = await MW.uploadFile(f, function (p) { status.textContent = "Uploading… " + Math.round(p * 100) + "%"; });
            if (up.kind !== "audio") throw new Error("That isn't an audio file.");
            var r = await MW.api("/sounds", { method: "POST", json: {
              title: title.value, artist: artist.value, duration: duration, rightsConfirmed: rights.checked,
              library: toLibrary, licenseNote: note ? note.value : "",
              file: up.upload ? { upload: up.upload } : { local: up.local } } });
            MW.toast(toLibrary ? "Added to the free library." : "Sound saved to My sounds.");
            startStep(r.sound);
          } catch (err) {
            status.textContent = err.message;
            send.disabled = false;
          }
        });
        body.appendChild(form);
      }

      document.body.appendChild(dialog);
      dialog.showModal();
      show("library");
    });
  };
})();
