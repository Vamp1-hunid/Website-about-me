// js/feed-card.js  -  one post in the home feed, Instagram style:
// creator header, a big picture or trailer, like / comment / share / save, caption, and "view all comments".
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;

  function ago(date) {
    var s = Math.max(1, Math.round((Date.now() - new Date(date)) / 1000));
    if (s < 60) return s + "s";
    if (s < 3600) return Math.round(s / 60) + "m";
    if (s < 86400) return Math.round(s / 3600) + "h";
    if (s < 604800) return Math.round(s / 86400) + "d";
    return MW.formatDate(date);
  }

  // Videos in the feed play muted while on screen and pause when scrolled away.
  var videoWatcher = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting && e.intersectionRatio > 0.6) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    });
  }, { threshold: [0, 0.6, 1] }) : null;

  function requireAccount(user) {
    if (user) return true;
    window.location.href = "/hub/register?next=" + encodeURIComponent(MW.currentPath());
    return false;
  }

  function toggleButton(post, kind, user, icons, labelOn, labelOff, countEl) {
    var on = kind === "like" ? post.liked : post.favourited;
    var b = el("button", { type: "button", class: "feed-act" + (on ? " is-on" : ""), "aria-pressed": String(Boolean(on)), "aria-label": on ? labelOn : labelOff }, on ? icons[0] : icons[1]);
    b.addEventListener("click", async function () {
      if (!requireAccount(user)) return;
      var nowOn = b.getAttribute("aria-pressed") !== "true";
      b.disabled = true;
      try {
        var d = await MW.api("/posts/" + post.id + "/" + kind, { method: nowOn ? "POST" : "DELETE" });
        b.setAttribute("aria-pressed", String(nowOn));
        b.classList.toggle("is-on", nowOn);
        b.textContent = nowOn ? icons[0] : icons[1];
        b.setAttribute("aria-label", nowOn ? labelOn : labelOff);
        if (countEl && d.count !== undefined) countEl.textContent = d.count + (d.count === 1 ? " like" : " likes");
        if (nowOn && kind === "like") { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
      } catch (e) { MW.toast(e.message, true); }
      b.disabled = false;
    });
    return b;
  }

  // "⋯" on each post: see more or less of this kind of post. Teaches the "For you" feed.
  function moreMenu(post, user, card) {
    var wrap = el("div", { class: "feed-menu" });
    var btn = el("button", { type: "button", class: "feed-act feed-menu-btn", "aria-haspopup": "true", "aria-expanded": "false", "aria-label": "More options" }, "⋯");
    var menu = el("div", { class: "feed-menu-list", role: "menu", hidden: "" });
    function item(label, fn) {
      var b = el("button", { type: "button", role: "menuitem" }, label);
      b.addEventListener("click", function () { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); fn(); });
      menu.appendChild(b);
    }
    function send(more) {
      if (!requireAccount(user)) return Promise.reject();
      return MW.api("/account/interests/feedback", { method: "POST", json: { postId: post.id, more: more } });
    }
    item("👍  See more like this", function () {
      send(true).then(function () { MW.toast("Got it: you'll see more " + MW.categoryName(post.category).toLowerCase() + " like this."); }).catch(function () {});
    });
    item("👎  See less like this", function () {
      send(false).then(function () {
        var note = el("div", { class: "feed-hidden-note" });
        note.appendChild(el("p", {}, "Thanks. You'll see less like this in your feed."));
        var undo = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Undo");
        undo.addEventListener("click", function () {
          MW.api("/account/interests/feedback", { method: "POST", json: { postId: post.id, more: true } }).catch(function () {});
          note.replaceWith(card);
        });
        note.appendChild(undo);
        card.replaceWith(note);
      }).catch(function () {});
    });
    item("🔗  Copy link", function () {
      var full = window.location.origin + MW.workUrl(post);
      if (navigator.clipboard) navigator.clipboard.writeText(full).then(function () { MW.toast("Link copied."); });
    });
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", function () { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); });
    wrap.append(btn, menu);
    return wrap;
  }

  MW.feedCard = function (post, user) {
    var url = MW.workUrl(post);
    var card = el("article", { class: "feed-card", "aria-label": post.title });

    // Header: creator avatar, name, time, category
    var head = el("header", { class: "feed-card-head" });
    var who = el("a", { class: "feed-who", href: post.creator ? "/hub/c/" + encodeURIComponent(post.creator.handle) : url });
    var av = el("span", { class: "feed-avatar" });
    if (post.creator && post.creator.avatarUrl) av.appendChild(el("img", { src: post.creator.avatarUrl, alt: "", loading: "lazy" }));
    else av.textContent = ((post.creator && post.creator.name) || "?").charAt(0);
    who.appendChild(av);
    var names = el("span", { class: "feed-names" });
    var nameLine = el("strong", {}, post.creator ? post.creator.name : "Chapterhive");
    if (post.creator && post.creator.badges && post.creator.badges.length) nameLine.appendChild(MW.badges(post.creator.badges, true));
    names.appendChild(nameLine);
    names.appendChild(el("span", { class: "muted" }, MW.categoryName(post.category) + (post.series ? " · " + post.series.title : "") + " · " + ago(post.createdAt)));
    who.appendChild(names);
    head.appendChild(who);
    head.appendChild(moreMenu(post, user, card));
    card.appendChild(head);

    // Media: trailer / video, else picture, else the opening words on a card
    var media = el("a", { class: "feed-media", href: url, "aria-label": "Open " + post.title });
    if (post.feedVideo) {
      var v = el("video", { src: post.feedVideo, muted: "", loop: "", playsinline: "", preload: "metadata" });
      v.muted = true;
      if (post.feedPoster) v.setAttribute("poster", post.feedPoster);
      media.appendChild(v);
      media.appendChild(el("span", { class: "feed-badge" }, post.category === "trailer" ? "▶ Trailer" : "▶ Video"));
      if (videoWatcher) videoWatcher.observe(v);
    } else if (post.feedImage || post.feedPoster) {
      media.appendChild(el("img", { src: post.feedImage || post.feedPoster, alt: "", loading: "lazy", decoding: "async" }));
      if (post.hasVideo) media.appendChild(el("span", { class: "feed-badge" }, user ? "▶ Video" : "▶ Join to watch"));
      if (post.mediaCount > 1) media.appendChild(el("span", { class: "feed-badge feed-badge-right" }, "1/" + post.mediaCount));
    } else {
      var words = el("div", { class: "feed-words" });
      words.appendChild(el("p", { class: "feed-words-title" }, post.title));
      if (post.logline || post.summary) words.appendChild(el("p", {}, post.logline || post.summary));
      words.appendChild(el("span", { class: "mono" }, "Tap to read →"));
      media.appendChild(words);
    }
    card.appendChild(media);

    // Actions
    var likes = el("p", { class: "feed-likes" }, post.likes + (post.likes === 1 ? " like" : " likes"));
    var acts = el("div", { class: "feed-actions" });
    acts.appendChild(toggleButton(post, "like", user, ["♥", "♡"], "Unlike", "Like", likes));
    var comment = el("a", { class: "feed-act", href: url + "#comments-panel", "aria-label": "Comments" }, "💬");
    acts.appendChild(comment);
    var share = el("button", { type: "button", class: "feed-act", "aria-label": "Share" }, "↗");
    share.addEventListener("click", function () {
      var full = window.location.origin + url;
      if (user && MW.feature("chat")) { window.location.href = url + "#share"; return; }
      if (navigator.share) navigator.share({ title: post.title, url: full }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(full).then(function () { MW.toast("Link copied."); });
    });
    acts.appendChild(share);
    var save = toggleButton(post, "favourite", user, ["★", "☆"], "Remove from saved", "Save");
    save.classList.add("feed-act-right");
    acts.appendChild(save);
    card.appendChild(acts);
    card.appendChild(likes);

    // Caption
    var cap = el("p", { class: "feed-caption" });
    cap.appendChild(el("strong", {}, post.title));
    var text = post.logline || post.summary || "";
    if (text) cap.appendChild(document.createTextNode(" " + text));
    card.appendChild(cap);
    if (post.genres && post.genres.length) {
      var tags = el("p", { class: "feed-tags" });
      post.genres.forEach(function (g) { tags.appendChild(el("span", {}, "#" + g)); });
      card.appendChild(tags);
    }
    if (post.comments) card.appendChild(el("a", { class: "feed-more muted", href: url + "#comments-panel" }, "View " + (post.comments === 1 ? "1 comment" : "all " + post.comments + " comments")));
    return card;
  };
})();
