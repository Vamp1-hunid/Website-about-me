// js/statuses.js  -  ⭕ Statuses: creators' pictures, clips and text cards that disappear after 24 hours.
//   MW.statuses.attach(row)   adds status rings to a row of creator circles (Home), or fills an empty row.
//                             Creators get a "Your status" circle first, with ＋ to post one.
//   MW.statuses.open(username) the full-screen viewer: bars along the top, tap right/left for next/back,
//                             hold to pause, swipe down or ✕ to close, music plays, reply or ❤️ (others),
//                             👁 who viewed it and 🗑 delete (your own).
//   MW.statuses.compose()     the sheet creators post a status from.
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;
  var IMAGE_SECONDS = 6;
  var MAX_VIDEO = 60;
  var BGS = { honey: "Honey", night: "Night", rose: "Rose", mint: "Mint", sky: "Sky", ink: "Ink" };
  var people = [];      // the bar, in order
  var rowEl = null;

  function isCreator() {
    var u = MW.account && MW.account.user;
    return Boolean(u && (u.role === "admin" || (MW.creator && MW.creator.status === "approved")));
  }

  function bubble(p, opts) {
    var a = el("a", { class: "story has-status" + (p.allSeen ? " is-seen" : "") + (opts && opts.mine ? " is-mine" : ""),
      href: "#status-" + p.username, "data-status-user": p.username,
      title: (opts && opts.mine ? "Your status" : p.displayName + "'s status") + (p.count > 1 ? " (" + p.count + ")" : "") });
    var ring = el("span", { class: "story-ring" });
    var pic = el("span", { class: "story-pic" });
    if (p.avatarUrl) pic.appendChild(el("img", { src: p.avatarUrl, alt: "" })); else pic.textContent = (p.displayName || p.username || "?").charAt(0);
    ring.appendChild(pic);
    if (opts && opts.add) ring.appendChild(el("span", { class: "status-add", "aria-hidden": "true" }, "＋"));
    a.appendChild(ring);
    a.appendChild(el("span", { class: "story-name" }, opts && opts.mine ? "Your status" : p.displayName));
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (opts && opts.onClick) return opts.onClick();
      open(p.username);
    });
    return a;
  }

  function attach(row) {
    rowEl = row;
    return MW.me().then(function (user) {
      if (!user) return; // statuses are for members
      return MW.api("/statuses").then(function (d) {
        people = d.people;
        row.querySelectorAll(".has-status, .status-mine-add").forEach(function (n) { n.remove(); });
        // Status circles go at the front, in order: yours, then everyone else's.
        var last = null;
        function put(node) {
          row.insertBefore(node, last ? last.nextSibling : row.firstChild);
          last = node;
        }
        var mine = people.filter(function (p) { return p.isMe; })[0];
        if (isCreator()) {
          var me = mine || { username: user.username, displayName: user.displayName || user.username,
            avatarUrl: MW.account.user.avatarUrl || null, count: 0, allSeen: true };
          var b = bubble(me, { mine: true, add: !mine, onClick: function () { if (mine) open(me.username); else compose(); } });
          if (!mine) b.classList.add("status-mine-add");
          if (mine) {
            // A small ＋ on your own ring to post another.
            var plus = el("button", { type: "button", class: "status-plus", title: "Post another status", "aria-label": "Post another status" }, "＋");
            plus.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); compose(); });
            b.querySelector(".story-ring").appendChild(plus);
          }
          put(b);
        }
        people.filter(function (p) { return !p.isMe; }).forEach(function (p) {
          // The same creator's plain circle (if the row has one) is replaced by their status ring.
          row.querySelectorAll(".story:not(.has-status)").forEach(function (n) {
            if (p.handle && n.getAttribute("href") === "/hub/c/" + encodeURIComponent(p.handle)) n.remove();
          });
          put(bubble(p));
        });
        if (row.closest("[hidden]") && row.children.length) row.closest("[hidden]").hidden = false;
      });
    }).catch(function () { /* the row still works without statuses */ });
  }

  /* ---------- Viewer ---------- */
  var viewer = null;

  function open(username) {
    MW.api("/statuses/u/" + encodeURIComponent(username)).then(function (d) {
      if (viewer) viewer.close();
      var startAt = 0;
      for (var i = 0; i < d.statuses.length; i++) { if (!d.statuses[i].seen) { startAt = i; break; } }
      if (d.person.isMe) startAt = 0;
      viewer = new Viewer(d, startAt);
    }).catch(function (e) { MW.toast(e.message, true); });
  }

  function nextPersonAfter(username) {
    var list = people.filter(function (p) { return !p.isMe; });
    for (var i = 0; i < list.length; i++) {
      if (list[i].username === username) return list[i + 1] ? list[i + 1].username : null;
    }
    return null;
  }

  function timeAgo(d) { return MW.timeAgo ? MW.timeAgo(d) : MW.formatDate(d); }

  function Viewer(data, index) {
    var self = this;
    this.data = data;
    this.i = index;
    this.paused = false;
    var box = this.box = el("div", { class: "status-viewer", role: "dialog", "aria-modal": "true", "aria-label": data.person.displayName + "'s status" });
    var stage = this.stage = el("div", { class: "status-stage" });
    var bars = this.bars = el("div", { class: "status-bars" });
    data.statuses.forEach(function () { var b = el("span", { class: "status-bar" }); b.appendChild(el("i")); bars.appendChild(b); });
    var head = el("div", { class: "status-head" });
    var who = el("a", { class: "status-who", href: data.person.handle ? "/hub/c/" + encodeURIComponent(data.person.handle) : "/hub/u/" + encodeURIComponent(data.person.username) });
    who.appendChild(MW.avatar({ username: data.person.username, displayName: data.person.displayName, avatarUrl: data.person.avatarUrl }));
    var whoText = el("span");
    whoText.appendChild(el("strong", {}, data.person.isMe ? "Your status" : data.person.displayName));
    this.when = el("span", { class: "status-when" });
    whoText.appendChild(this.when);
    who.appendChild(whoText);
    head.appendChild(who);
    this.musicSlot = el("span", { class: "status-music" });
    head.appendChild(this.musicSlot);
    var pauseBtn = this.pauseBtn = el("button", { type: "button", class: "status-icon", "aria-label": "Pause" }, "⏸");
    pauseBtn.addEventListener("click", function (e) { e.stopPropagation(); self.togglePause(); });
    head.appendChild(pauseBtn);
    var close = el("button", { type: "button", class: "status-icon", "aria-label": "Close" }, "✕");
    close.addEventListener("click", function (e) { e.stopPropagation(); self.close(); });
    head.appendChild(close);
    this.foot = el("div", { class: "status-foot" });

    box.appendChild(stage);
    box.appendChild(bars);
    box.appendChild(head);
    box.appendChild(this.foot);
    // Tap zones: left third goes back, the rest goes forward. Holding pauses.
    var downAt = 0, startY = null, held = false, holdTimer = null;
    stage.addEventListener("pointerdown", function (e) {
      downAt = Date.now(); startY = e.clientY; held = false;
      holdTimer = setTimeout(function () { held = true; self.pause(true); }, 220);
    });
    stage.addEventListener("pointerup", function (e) {
      clearTimeout(holdTimer);
      var dy = startY === null ? 0 : e.clientY - startY;
      startY = null;
      if (dy > 90) return self.close();         // swipe down
      if (held) { held = false; return self.pause(false); }
      if (Date.now() - downAt > 600) return;
      var rect = stage.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width / 3) self.prev(); else self.next();
    });
    stage.addEventListener("pointercancel", function () { clearTimeout(holdTimer); if (held) self.pause(false); });
    this.onKey = function (e) {
      if (e.key === "Escape") self.close();
      else if (e.key === "ArrowRight") self.next();
      else if (e.key === "ArrowLeft") self.prev();
      else if (e.key === " ") { e.preventDefault(); self.togglePause(); }
    };
    document.addEventListener("keydown", this.onKey);
    document.body.appendChild(box);
    document.body.classList.add("status-open");
    this.show();
  }

  Viewer.prototype.show = function () {
    var self = this;
    var s = this.data.statuses[this.i];
    cancelAnimationFrame(this.raf);
    this.stage.textContent = "";
    this.video = null;
    this.paused = false;
    this.pauseBtn.textContent = "⏸";
    this.when.textContent = " · " + timeAgo(s.createdAt) + (s.audience === "followers" ? " · 👥 followers" : "");
    Array.prototype.forEach.call(this.bars.children, function (b, n) {
      b.classList.toggle("is-done", n < self.i);
      b.firstChild.style.width = n < self.i ? "100%" : "0%";
    });
    var frame = el("div", { class: "status-frame" + (s.kind === "text" ? " status-text bg-" + s.bg : "") });
    if (s.kind === "image") frame.appendChild(el("img", { src: s.url, alt: s.caption || "Status picture" }));
    if (s.kind === "video") {
      var v = el("video", { src: s.url, playsinline: "", autoplay: "", preload: "auto" });
      v.muted = Boolean(s.sound); // the status's music plays instead of the clip's sound
      v.addEventListener("ended", function () { self.next(); });
      v.addEventListener("waiting", function () { self.buffering = true; });
      v.addEventListener("playing", function () { self.buffering = false; });
      this.video = v;
      frame.appendChild(v);
    }
    if (s.kind === "text") frame.appendChild(el("p", {}, s.text));
    this.stage.appendChild(frame);
    if (s.caption) this.stage.appendChild(el("p", { class: "status-caption" }, s.caption));
    if (s.link) {
      var link = el("a", { class: "status-link btn btn-small", href: "/hub/w/" + encodeURIComponent(s.link.slug) }, "📖 " + s.link.title);
      link.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      link.addEventListener("pointerup", function (e) { e.stopPropagation(); });
      this.stage.appendChild(link);
    }
    // Music
    this.musicSlot.textContent = "";
    MW.music.stop();
    if (s.sound) {
      var chip = MW.musicChip(s.sound, { small: true });
      this.musicSlot.appendChild(chip);
      MW.music.play(s.sound, chip);
    }
    this.drawFoot(s);
    if (!this.data.person.isMe && !s.seen) {
      s.seen = true;
      MW.api("/statuses/" + s.id + "/view", { method: "POST" }).catch(function () {});
    }
    // Progress
    this.elapsed = 0;
    this.last = performance.now();
    var bar = this.bars.children[this.i].firstChild;
    function tick(now) {
      var dt = (now - self.last) / 1000;
      self.last = now;
      if (!self.paused && !self.buffering) self.elapsed += dt;
      var total = IMAGE_SECONDS;
      if (self.video) {
        total = Math.min(MAX_VIDEO, self.video.duration || MAX_VIDEO);
        if (self.video.duration) self.elapsed = self.video.currentTime;
      }
      bar.style.width = Math.min(100, (self.elapsed / total) * 100) + "%";
      if (self.elapsed >= total) return self.next();
      self.raf = requestAnimationFrame(tick);
    }
    this.raf = requestAnimationFrame(tick);
  };

  Viewer.prototype.drawFoot = function (s) {
    var self = this;
    var foot = this.foot;
    foot.textContent = "";
    function stopTaps(n) {
      ["pointerdown", "pointerup"].forEach(function (ev) { n.addEventListener(ev, function (e) { e.stopPropagation(); }); });
      return n;
    }
    if (this.data.person.isMe) {
      var views = stopTaps(el("button", { type: "button", class: "status-pill" }, "👁 " + (s.views || 0) + (s.views === 1 ? " view" : " views")));
      views.addEventListener("click", function () { self.pause(true); showViewers(s, function () { self.pause(false); }); });
      foot.appendChild(views);
      var del = stopTaps(el("button", { type: "button", class: "status-pill" }, "🗑 Delete"));
      del.addEventListener("click", function () {
        self.pause(true);
        if (!window.confirm("Delete this status?")) return self.pause(false);
        MW.api("/statuses/" + s.id, { method: "DELETE" }).then(function () {
          MW.toast("Status deleted.");
          self.data.statuses.splice(self.i, 1);
          self.bars.removeChild(self.bars.children[self.i]);
          if (!self.data.statuses.length) { self.close(); return; }
          if (self.i >= self.data.statuses.length) self.i = self.data.statuses.length - 1;
          self.show();
        }).catch(function (e) { MW.toast(e.message, true); self.pause(false); });
      });
      foot.appendChild(del);
      var more = stopTaps(el("button", { type: "button", class: "status-pill" }, "＋ Add"));
      more.addEventListener("click", function () { self.close(); compose(); });
      foot.appendChild(more);
      return;
    }
    var form = stopTaps(el("form", { class: "status-reply" }));
    var input = el("input", { type: "text", placeholder: "Reply to " + this.data.person.displayName + "…", maxlength: "500", "aria-label": "Reply" });
    input.addEventListener("focus", function () { self.pause(true); });
    input.addEventListener("blur", function () { if (!input.value) self.pause(false); });
    var love = el("button", { type: "button", class: "status-icon", "aria-label": "Send a heart" }, "❤️");
    var send = el("button", { type: "submit", class: "status-icon", "aria-label": "Send" }, "➤");
    form.appendChild(input);
    form.appendChild(love);
    form.appendChild(send);
    function reply(text) {
      var quote = s.kind === "text" ? s.text : s.caption;
      var body = "↩️ Replied to your status" + (quote ? ": \"" + quote.slice(0, 80) + (quote.length > 80 ? "…" : "") + "\"" : "") + "\n" + text;
      return MW.api("/chat/threads", { method: "POST", json: { username: self.data.person.username } }).then(function (t) {
        return MW.api("/chat/threads/" + t.id + "/messages", { method: "POST", json: { body: body } });
      }).then(function () { MW.toast("Sent to " + self.data.person.displayName + " 💬"); })
        .catch(function (e) { MW.toast(e.message, true); });
    }
    love.addEventListener("click", function () { love.classList.add("is-popped"); reply("❤️"); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      input.blur();
      reply(text).then(function () { self.pause(false); });
    });
    foot.appendChild(form);
  };

  Viewer.prototype.pause = function (yes) {
    this.paused = yes;
    this.pauseBtn.textContent = yes ? "▶" : "⏸";
    this.pauseBtn.setAttribute("aria-label", yes ? "Play" : "Pause");
    if (this.video) { if (yes) this.video.pause(); else this.video.play().catch(function () {}); }
    if (yes) MW.music.pause();
    else { var chip = this.musicSlot.querySelector(".music-chip"); var s = this.data.statuses[this.i]; if (chip && s.sound) MW.music.play(s.sound, chip); }
  };
  Viewer.prototype.togglePause = function () { this.pause(!this.paused); };

  Viewer.prototype.next = function () {
    cancelAnimationFrame(this.raf);
    if (this.i < this.data.statuses.length - 1) { this.i++; return this.show(); }
    var after = this.data.person.isMe ? null : nextPersonAfter(this.data.person.username);
    this.close();
    if (after) open(after);
  };
  Viewer.prototype.prev = function () {
    cancelAnimationFrame(this.raf);
    if (this.i > 0) this.i--;
    this.show();
  };
  Viewer.prototype.close = function () {
    cancelAnimationFrame(this.raf);
    MW.music.stop();
    if (this.video) this.video.pause();
    document.removeEventListener("keydown", this.onKey);
    this.box.remove();
    document.body.classList.remove("status-open");
    if (viewer === this) viewer = null;
    if (rowEl) attach(rowEl); // rings turn grey once seen
  };

  function showViewers(s, after) {
    var dialog = el("dialog", { class: "heist-dialog status-viewers", "aria-labelledby": "sv-title" });
    dialog.appendChild(el("h2", { id: "sv-title" }, "👁 Seen by"));
    var list = el("div", { class: "team-people" }, "Loading…");
    dialog.appendChild(list);
    var ok = el("button", { type: "button", class: "btn btn-small" }, "Close");
    ok.addEventListener("click", function () { dialog.close(); });
    dialog.appendChild(ok);
    dialog.addEventListener("close", function () { dialog.remove(); if (after) after(); });
    document.body.appendChild(dialog);
    dialog.showModal();
    MW.api("/statuses/" + s.id + "/viewers").then(function (d) {
      list.textContent = "";
      if (!d.viewers.length) list.appendChild(el("p", { class: "muted" }, "No one yet."));
      d.viewers.forEach(function (v) {
        var r = el("a", { class: "status-viewer-row", href: "/hub/u/" + encodeURIComponent(v.username) });
        r.appendChild(MW.avatar(v));
        r.appendChild(el("span", {}, (v.displayName || v.username) + " · " + timeAgo(v.viewedAt)));
        list.appendChild(r);
      });
    }).catch(function (e) { list.textContent = e.message; });
  }

  /* ---------- Posting a status ---------- */
  function compose() {
    var old = document.getElementById("status-compose");
    if (old) old.remove();
    var dialog = el("dialog", { id: "status-compose", class: "heist-dialog status-compose", "aria-labelledby": "sc-title" });
    dialog.appendChild(el("p", { class: "node-label" }, "Status · gone in 24 hours"));
    dialog.appendChild(el("h2", { id: "sc-title" }, "⭕ New status"));
    var state = { mode: "media", file: null, bg: "honey", sound: null };
    var tabs = el("div", { class: "chip-row" });
    var mediaTab = el("button", { type: "button", class: "chip", "aria-pressed": "true" }, "📷 Picture or clip");
    var textTab = el("button", { type: "button", class: "chip", "aria-pressed": "false" }, "Aa Text");
    tabs.appendChild(mediaTab); tabs.appendChild(textTab);
    dialog.appendChild(tabs);

    var preview = el("div", { class: "status-preview status-frame" });
    var pick = el("input", { type: "file", accept: "image/*,video/*", "aria-label": "Picture or clip", class: "status-file" });
    var pickBtn = el("button", { type: "button", class: "btn btn-ghost" }, "📷 Choose a picture or clip");
    pickBtn.addEventListener("click", function () { pick.click(); });
    var textArea = el("textarea", { maxlength: "300", rows: "3", placeholder: "Type a status…", "aria-label": "Status text", hidden: "" });
    var swatches = el("div", { class: "status-swatches", role: "group", "aria-label": "Background", hidden: "" });
    Object.keys(BGS).forEach(function (k) {
      var b = el("button", { type: "button", class: "status-swatch bg-" + k, "aria-label": BGS[k], "aria-pressed": String(k === state.bg), title: BGS[k] });
      b.addEventListener("click", function () {
        state.bg = k;
        swatches.querySelectorAll("button").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
        drawPreview();
      });
      swatches.appendChild(b);
    });
    var caption = el("input", { type: "text", maxlength: "300", placeholder: "Add a caption (optional)", "aria-label": "Caption" });
    var musicRow = el("div", { class: "status-music-row" });
    var musicBtn = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "🎵 Add music");
    musicRow.appendChild(musicBtn);
    var musicShown = el("span");
    musicRow.appendChild(musicShown);
    musicBtn.addEventListener("click", function () {
      MW.pickSound(state.sound).then(function (s) {
        if (s === undefined) return;
        state.sound = s;
        musicShown.textContent = "";
        if (s) musicShown.appendChild(MW.musicChip(s, { small: true }));
        musicBtn.textContent = s ? "🎵 Change" : "🎵 Add music";
      });
    });
    var audience = el("select", { "aria-label": "Who can see it" });
    audience.appendChild(el("option", { value: "members" }, "👀 Everyone with an account"));
    audience.appendChild(el("option", { value: "followers" }, "👥 Only my followers"));
    var audRow = el("label", { class: "status-aud" }, "Who can see it ");
    audRow.appendChild(audience);
    var status = el("p", { class: "muted", "aria-live": "polite" });
    var actions = el("div", { class: "sound-foot" });
    var cancel = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Cancel");
    cancel.addEventListener("click", function () { dialog.close(); });
    var post = el("button", { type: "button", class: "btn btn-small" }, "Share status");
    actions.appendChild(cancel); actions.appendChild(post);

    [preview, pick, pickBtn, textArea, swatches, caption, musicRow, audRow, status, actions].forEach(function (n) { dialog.appendChild(n); });

    function drawPreview() {
      preview.textContent = "";
      preview.className = "status-preview status-frame" + (state.mode === "text" ? " status-text bg-" + state.bg : "");
      if (state.mode === "text") { preview.appendChild(el("p", {}, textArea.value || "Type a status…")); return; }
      if (!state.file) { preview.appendChild(el("p", { class: "muted" }, "No picture or clip yet")); return; }
      var url = URL.createObjectURL(state.file);
      if (/^video\//.test(state.file.type)) {
        var v = el("video", { src: url, muted: "", playsinline: "", autoplay: "", loop: "" });
        v.muted = true;
        preview.appendChild(v);
      } else preview.appendChild(el("img", { src: url, alt: "" }));
    }
    function setMode(m) {
      state.mode = m;
      mediaTab.setAttribute("aria-pressed", String(m === "media"));
      textTab.setAttribute("aria-pressed", String(m === "text"));
      pickBtn.hidden = m !== "media";
      textArea.hidden = swatches.hidden = m !== "text";
      caption.hidden = m === "text";
      drawPreview();
    }
    mediaTab.addEventListener("click", function () { setMode("media"); });
    textTab.addEventListener("click", function () { setMode("text"); });
    textArea.addEventListener("input", drawPreview);
    pick.addEventListener("change", function () {
      var f = pick.files[0];
      if (!f) return;
      if (/^video\//.test(f.type)) {
        var probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = function () {
          if (probe.duration > MAX_VIDEO + 1) { status.textContent = "Clips can be up to " + MAX_VIDEO + " seconds. Trim it and try again."; state.file = null; }
          else { status.textContent = ""; state.file = f; }
          drawPreview();
        };
        probe.src = URL.createObjectURL(f);
      } else { state.file = f; status.textContent = ""; drawPreview(); }
      pickBtn.textContent = "📷 Change";
    });
    post.addEventListener("click", async function () {
      post.disabled = true;
      try {
        var json = { caption: state.mode === "text" ? "" : caption.value, audience: audience.value,
          soundId: state.sound ? state.sound.id : null, soundStart: state.sound ? state.sound.start : 0 };
        if (state.mode === "text") {
          if (!textArea.value.trim()) throw new Error("Type something first.");
          json.text = textArea.value; json.bg = state.bg;
        } else {
          if (!state.file) throw new Error("Choose a picture or clip first.");
          var up = await MW.uploadFile(state.file, function (p) { status.textContent = "Uploading… " + Math.round(p * 100) + "%"; });
          json.media = up.upload ? { upload: up.upload } : { local: up.local };
        }
        status.textContent = "Posting…";
        await MW.api("/statuses", { method: "POST", json: json });
        MW.toast("Status shared! It disappears in 24 hours ⏳");
        dialog.close();
        if (rowEl) attach(rowEl);
      } catch (e) {
        status.textContent = e.message;
        post.disabled = false;
      }
    });
    dialog.addEventListener("close", function () { MW.music.stop(); dialog.remove(); });
    document.body.appendChild(dialog);
    dialog.showModal();
    setMode("media");
  }

  MW.statuses = { attach: attach, open: open, compose: compose };

  // Pages with an empty status row of their own (e.g. Following) fill it straight away.
  document.querySelectorAll("[data-status-row]").forEach(function (row) { attach(row); });
  // Links like /hub#status-username open that person's status.
  var m = /^#status-([a-z0-9_-]+)$/i.exec(window.location.hash || "");
  if (m) MW.me().then(function (u) { if (u) open(m[1]); });
})();
