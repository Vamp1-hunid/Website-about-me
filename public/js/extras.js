/* public/js/extras.js
   Loaded on every page by api.js. Adds:
     - the notification bell (new posts from people you follow, new followers, milestones,
       review results, trending posts and news from the team)
     - a one-time welcome card for new accounts
     - quick tips under the header
     - the floating "?" help button with the help assistant
   Each part only appears when its feature is switched on in Dashboard → Features. */
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;

  function timeAgo(value) {
    var s = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (s < 60) return "just now";
    var m = Math.round(s / 60); if (m < 60) return m + " min ago";
    var h = Math.round(m / 60); if (h < 24) return h + " h ago";
    var d = Math.round(h / 24); if (d < 30) return d + " d ago";
    return MW.formatDate(value);
  }
  MW.timeAgo = timeAgo;

  var ICONS = { follower: "♥", milestone: "★", streak: "🔥", welcome: "✦", announcement: "📣", approved: "✓", declined: "!", review: "⧗",
    "new-post": "◆", post: "◆", creator: "✦", collab: "⇄", suggestion: "✉", business: "€", report: "⚑", inbox: "✉", info: "i", standing: "!" };

  /* ---------- Notification bell ---------- */

  function buildBell(user) {
    var area = document.getElementById("auth-area");
    if (!area || document.getElementById("bell-button")) return;

    var wrap = el("div", { class: "bell-wrap" });
    var button = el("button", { type: "button", id: "bell-button", class: "bell-button", "aria-haspopup": "true", "aria-expanded": "false", "aria-label": "Notifications" });
    button.appendChild(el("span", { class: "bell-icon", "aria-hidden": "true" }, "🔔"));
    var badge = el("span", { class: "bell-badge", hidden: "" });
    button.appendChild(badge);
    wrap.appendChild(button);

    var panel = el("div", { class: "bell-panel", id: "bell-panel", hidden: "", role: "region", "aria-label": "Notifications" });
    var head = el("div", { class: "bell-head" });
    var tabs = el("div", { class: "bell-tabs", role: "tablist" });
    var tabMine = el("button", { type: "button", role: "tab", "aria-selected": "true", class: "bell-tab" }, "For you");
    var tabTrend = el("button", { type: "button", role: "tab", "aria-selected": "false", class: "bell-tab" }, "Trending");
    tabs.append(tabMine, tabTrend);
    var markAll = el("button", { type: "button", class: "link-button bell-mark" }, "Mark all read");
    head.append(tabs, markAll);
    var list = el("ul", { class: "bell-list" });
    panel.append(head, list);
    wrap.appendChild(panel);
    area.insertBefore(wrap, area.firstChild);

    var view = "mine";

    function setCount(n) {
      badge.hidden = !n;
      badge.textContent = n > 99 ? "99+" : String(n);
      button.setAttribute("aria-label", n ? "Notifications (" + n + " unread)" : "Notifications");
    }
    function refreshCount() {
      if (document.hidden) return;
      MW.api("/notifications/count").then(function (d) { setCount(d.count); }).catch(function () {});
    }

    function item(n) {
      var li = el("li", { class: "bell-item" + (n.unread ? " is-unread" : "") });
      var a = el(n.link ? "a" : "div", n.link ? { href: n.link, class: "bell-link" } : { class: "bell-link" });
      a.appendChild(el("span", { class: "bell-type", "aria-hidden": "true" }, ICONS[n.type] || "•"));
      var text = el("span", { class: "bell-text" });
      text.appendChild(el("strong", {}, n.title));
      if (n.body) text.appendChild(el("span", { class: "bell-body" }, n.body));
      text.appendChild(el("span", { class: "bell-time" }, timeAgo(n.createdAt)));
      a.appendChild(text);
      li.appendChild(a);
      return li;
    }

    function showMine() {
      list.textContent = "";
      list.appendChild(el("li", { class: "bell-empty" }, "Loading…"));
      MW.api("/notifications").then(function (d) {
        list.textContent = "";
        if (!d.notifications.length) {
          list.appendChild(el("li", { class: "bell-empty" }, "Nothing yet. Follow some creators and you'll hear when they post."));
          return;
        }
        d.notifications.forEach(function (n) { list.appendChild(item(n)); });
      }).catch(function (e) { list.textContent = ""; list.appendChild(el("li", { class: "bell-empty" }, e.message)); });
    }

    function showTrending() {
      list.textContent = "";
      list.appendChild(el("li", { class: "bell-empty" }, "Loading…"));
      MW.api("/notifications/trending").then(function (d) {
        list.textContent = "";
        if (!d.posts.length) { list.appendChild(el("li", { class: "bell-empty" }, "Nothing trending yet this week.")); return; }
        d.posts.forEach(function (p) {
          list.appendChild(item({ type: "new-post", title: p.title, body: (p.creator ? p.creator.name + " · " : "") + MW.categoryName(p.category) + " · ♥ " + (p.likes || 0), link: MW.workUrl(p), createdAt: p.publishAt || p.createdAt }));
        });
      }).catch(function () {});
    }

    function select(which) {
      view = which;
      tabMine.setAttribute("aria-selected", String(which === "mine"));
      tabTrend.setAttribute("aria-selected", String(which === "trend"));
      markAll.hidden = which !== "mine";
      if (which === "mine") showMine(); else showTrending();
    }
    tabMine.addEventListener("click", function () { select("mine"); });
    tabTrend.addEventListener("click", function () { select("trend"); });

    function close() {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      if (!panel.hidden) return close();
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      select(view);
    });
    markAll.addEventListener("click", function () {
      MW.api("/notifications/read", { method: "POST", json: {} }).then(function () {
        setCount(0);
        list.querySelectorAll(".is-unread").forEach(function (li) { li.classList.remove("is-unread"); });
      }).catch(function (e) { MW.toast(e.message, true); });
    });
    document.addEventListener("click", function (event) { if (!wrap.contains(event.target)) close(); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !panel.hidden) { close(); button.focus(); } });

    refreshCount();
    window.setInterval(refreshCount, 60000);
  }

  /* ---------- Welcome card (once per account) ---------- */

  // A short animated tribute to the people who make the hive: the creators, and the founder.
  function tribute() {
    var box = el("div", { class: "tribute", "aria-label": "A tribute to our creators" });
    box.appendChild(el("p", { class: "tribute-title" }, "Made possible by our creators"));
    box.appendChild(el("p", { class: "muted tribute-lead" },
      "Every novel, storybook, song, lesson, comic, film and drawing here was shared by a creator from our community, people just like you. Thank you to every one of them."));
    var track = el("div", { class: "tribute-track" });
    var reel = el("div", { class: "tribute-reel" });
    track.appendChild(reel);
    box.appendChild(track);
    box.appendChild(el("p", { class: "tribute-founder mono" }, "Chapterhive was founded by Mulenga Mwamba · a God's Banditos production"));
    MW.api("/hub/creators?sort=followers&page=1").then(function (d) {
      var list = (d.creators || []).slice(0, 14);
      if (!list.length) { track.remove(); return; }
      // The names run twice so the scroll loops without a gap.
      // Only a handful of creators so far: show them once, standing still.
      var rounds = list.length >= 6 ? [list, list] : [list];
      if (list.length < 6) reel.classList.add("is-still");
      rounds.forEach(function (group, round) {
        group.forEach(function (c) {
          var chip = el("a", { class: "tribute-chip", href: "/hub/c/" + encodeURIComponent(c.handle), tabindex: round ? "-1" : "0" });
          if (round) chip.setAttribute("aria-hidden", "true");
          var pic = el("span", { class: "tribute-pic" });
          if (c.avatarUrl) pic.appendChild(el("img", { src: c.avatarUrl, alt: "" }));
          else pic.textContent = (c.name || "?").charAt(0);
          chip.appendChild(pic);
          chip.appendChild(el("span", {}, c.name));
          reel.appendChild(chip);
        });
      });
      reel.style.animationDuration = Math.max(14, list.length * 3) + "s";
    }).catch(function () { track.remove(); });
    return box;
  }

  function showWelcome(user) {
    var key = "mw-welcomed-" + user.id;
    try { if (localStorage.getItem(key)) return; } catch (e) { /* storage blocked */ }
    MW.api("/notifications").then(function (d) {
      var w = d.notifications.filter(function (n) { return n.type === "welcome" && n.unread; })[0];
      if (!w) return;
      var dialog = el("dialog", { class: "heist-dialog welcome-dialog", "aria-labelledby": "welcome-title" });
      dialog.appendChild(el("p", { class: "node-label" }, MW.isHub ? "Chapterhive // welcome" : "God's Banditos // welcome"));
      dialog.appendChild(el("h2", { id: "welcome-title" }, w.title));
      w.body.split(/\n+/).forEach(function (para) { dialog.appendChild(el("p", {}, para)); });
      dialog.appendChild(tribute());
      var actions = el("div", { class: "form-actions" });
      if (w.link) actions.appendChild(el("a", { class: "btn", href: w.link }, "Let's go"));
      var close = el("button", { type: "button", class: "btn btn-ghost" }, "Close");
      actions.appendChild(close);
      dialog.appendChild(actions);
      document.body.appendChild(dialog);
      function done() {
        try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ }
        MW.api("/notifications/read", { method: "POST", json: { ids: [w.id] } }).catch(function () {});
      }
      close.addEventListener("click", function () { dialog.close(); });
      dialog.addEventListener("close", done);
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    }).catch(function () {});
  }

  /* ---------- Quick tips ---------- */

  var TIPS = {
    "/": ["Press ☰ for every section of the site, plus search.", "Tap any work to read it, like it and join the comments.", "Chapterhive is where other creators post: find it in the menu."],
    "/gallery": ["Filter by category or tag, or sort by newest and most liked.", "Search finds titles, loglines and tags."],
    "/stories": ["Each story has its chapters, characters and concept art in one place."],
    "/hub": ["Follow creators to get their new posts in your bell and Following feed.", "Looking for a collaborator? Try the collab board.", "Got an idea for the site? Drop it in the suggestion box on the collab board."],
    "/hub/creators": ["Filter by what people make: art, comics, films, comedy and more.", "The green dot means a creator is online right now."],
    "/hub/feed": ["New posts from creators you follow show up here first.", "Bell notifications tell you when a followed creator posts."],
    "/hub/collabs": ["Filter by the role you need, then press 'I'm interested' to reach out.", "Post your own request from your studio's Collabs tab."],
    "/hub/studio": ["Every post is reviewed by the team before it goes public; you'll get a note in your bell.", "Advertising products or sponsors needs admin approval first.", "Try a poll or questionnaire from Compose."],
    "/hub/profile": ["Switch off 'Show when I'm online' to hide your green dot.", "Add an email so you can reset your password."],
    "/hub/apply": ["Tell us what you make and link a few samples: it speeds up approval."]
  };

  function showTips() {
    var path = window.location.pathname.replace(/\/+$/, "") || "/";
    var tips = TIPS[path];
    var header = document.querySelector(".site-header");
    if (!tips || !header) return;
    var key = "mw-tips-hidden-" + path;
    try { if (localStorage.getItem(key)) return; } catch (e) { /* ignore */ }
    var bar = el("aside", { class: "tips-bar", "aria-label": "Quick tips" });
    bar.appendChild(el("span", { class: "tips-label" }, "Quick tip"));
    var textNode = el("span", { class: "tips-text" }, tips[0]);
    bar.appendChild(textNode);
    var i = 0;
    if (tips.length > 1) {
      var next = el("button", { type: "button", class: "link-button" }, "Next tip");
      next.addEventListener("click", function () { i = (i + 1) % tips.length; textNode.textContent = tips[i]; });
      bar.appendChild(next);
    }
    bar.appendChild(el("a", { href: "/help", class: "tips-help" }, "Help & FAQ"));
    var hide = el("button", { type: "button", class: "tips-close", "aria-label": "Hide tips for this page" }, "×");
    hide.addEventListener("click", function () {
      bar.remove();
      try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ }
    });
    bar.appendChild(hide);
    var menu = document.getElementById("site-menu");
    (menu || header).after(bar);
  }

  /* ---------- Help assistant ---------- */

  MW.helpChat = function (container) {
    var log = el("div", { class: "help-log", "aria-live": "polite" });
    log.appendChild(el("p", { class: "help-msg help-bot" }, "Hi! Ask me anything about using the site: posting, reviews, collabs, your account…"));
    var form = el("form", { class: "help-form" });
    var input = el("input", { type: "text", maxlength: "500", placeholder: "Type your question…", "aria-label": "Your question", required: "" });
    var send = el("button", { type: "submit", class: "btn btn-small" }, "Ask");
    form.append(input, send);
    container.append(log, form);
    var history = [];

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      log.appendChild(el("p", { class: "help-msg help-me" }, q));
      input.value = "";
      send.disabled = true;
      var thinking = el("p", { class: "help-msg help-bot muted" }, "Thinking…");
      log.appendChild(thinking);
      log.scrollTop = log.scrollHeight;
      MW.api("/help/ask", { method: "POST", json: { question: q, history: history } }).then(function (d) {
        thinking.remove();
        var p = el("div", { class: "help-msg help-bot" });
        p.appendChild(el("p", {}, d.answer));
        if (d.sources && d.sources.length) {
          var more = el("p", { class: "help-related" }, "Related: ");
          d.sources.forEach(function (s, i) {
            if (i) more.appendChild(document.createTextNode(" · "));
            more.appendChild(el("a", { href: "/help#" + s.id }, s.q));
          });
          p.appendChild(more);
        }
        log.appendChild(p);
        history.push({ role: "user", text: q }, { role: "assistant", text: d.answer });
        history = history.slice(-6);
      }).catch(function (e) {
        thinking.textContent = e.message;
      }).then(function () {
        send.disabled = false;
        log.scrollTop = log.scrollHeight;
        input.focus();
      });
    });
    return input;
  };

  function buildHelpButton() {
    if (document.getElementById("help-fab") || window.location.pathname === "/help") return;
    var button = el("button", { type: "button", id: "help-fab", class: "help-fab", "aria-haspopup": "dialog", "aria-label": "Help" }, "?");
    var dialog = el("dialog", { class: "heist-dialog help-dialog", "aria-labelledby": "help-title" });
    dialog.appendChild(el("p", { class: "node-label" }, "Help desk"));
    dialog.appendChild(el("h2", { id: "help-title" }, "How can we help?"));
    var body = el("div");
    dialog.appendChild(body);
    var input = MW.helpChat(body);
    var foot = el("div", { class: "form-actions" });
    foot.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/help" }, "All FAQs"));
    var close = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Close");
    close.addEventListener("click", function () { dialog.close(); });
    foot.appendChild(close);
    dialog.appendChild(foot);
    dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
    button.addEventListener("click", function () {
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
      input.focus();
    });
    document.body.append(button, dialog);
  }

  MW.me().then(function (user) {
    if (user && MW.feature("notifications")) buildBell(user);
    // Brand-new accounts get the full-screen welcome (with the interests survey) on Chapterhive.
    var acc = MW.account && MW.account.account;
    if (user && acc && acc.needsWelcome && !/^\/(admin|login|hub\/(register|join-organisation|verify))/.test(window.location.pathname)) {
      var s = document.createElement("script");
      s.src = "/js/onboarding.js";
      s.onload = function () { if (MW.runOnboarding) MW.runOnboarding(user, function () { showWelcome(user); }); };
      document.head.appendChild(s);
    } else if (user) showWelcome(user);
    if (MW.feature("quick_tips")) showTips();
    if (MW.feature("help_assistant")) buildHelpButton();
  });
})();
