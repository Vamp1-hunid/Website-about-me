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
          var letter = (c.name || "?").charAt(0);
          if (c.avatarUrl) {
            var im = el("img", { src: c.avatarUrl, alt: "" });
            im.addEventListener("error", function () { im.remove(); pic.textContent = letter; });
            pic.appendChild(im);
          } else pic.textContent = letter;
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
      var go = null;
      if (w.link) { go = el("a", { class: "btn", href: w.link }, "Let's go"); actions.appendChild(go); }
      var close = el("button", { type: "button", class: "btn btn-ghost" }, "Close");
      actions.appendChild(close);
      dialog.appendChild(actions);
      document.body.appendChild(dialog);
      // Mark the welcome as seen however the dialog is left (Close, Esc, or "Let's go"), so it never comes back.
      // keepalive lets the request finish even though "Let's go" moves to another page straight away.
      var marked = false;
      function done() {
        if (marked) return;
        marked = true;
        try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ }
        try {
          fetch("/api/notifications/read", { method: "POST", credentials: "same-origin", keepalive: true,
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [w.id] }) }).catch(function () {});
        } catch (e) { /* ignore */ }
      }
      close.addEventListener("click", function () { dialog.close(); });
      if (go) {
        go.addEventListener("click", function (ev) {
          done();
          // Already on that page? Just close the welcome instead of reloading it.
          var target = new URL(go.href, window.location.href);
          if (target.pathname === window.location.pathname) { ev.preventDefault(); dialog.close(); }
        });
      }
      dialog.addEventListener("close", done);
      dialog.addEventListener("cancel", done);
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    }).catch(function () {});
  }

  /* ---------- Quick tips ---------- */

  // Quick tips for every page. Each page's tips can be skipped for a few days or switched off for good,
  // and "Turn off all tips" stops them everywhere.
  var TIPS = {
    "/": ["Press ☰ for every section of the site, plus search.", "Tap any work to read it, like it and join the comments.", "Chapterhive is where other creators post: find it in the menu."],
    "/gallery": ["Filter by category or tag, or sort by newest and most liked.", "Search finds titles, loglines and tags."],
    "/stories": ["Each story has its chapters, characters and concept art in one place."],
    "/hub": ["Tap your picture next to the search box to open your profile.", "Tap ☰ (top right) for your account, settings and every section.", "The 🔔 bell shows new followers, buddy requests and team announcements.",
      "Tap ⋯ on any post to see more or less like it: your feed learns what you enjoy.", "The Buddies tab is where your friends, chats and \"find buddies\" live.", "Stuck? The glittering ? button in the corner answers questions."],
    "/hub/creators": ["Top creators are at the top of this page; everyone else is below.", "Filter by what people make: art, comics, films, comedy and more.", "Follow a creator to get their new work in your bell and Following feed.", "The green dot means a creator is online right now."],
    "/hub/buddies": ["Buddies are friends who accepted your request (or whose request you accepted).", "Use 🔍 Find buddies to search names or see people you may know.", "Tap 💬 next to a buddy to start a chat.", "Buddy requests you receive show at the top, ready to accept."],
    "/hub/people": ["Tap Follow back on a follower to follow them too.", "Requests shows buddy requests you've sent and received."],
    "/hub/members": ["Search any name or username, then Follow, Add buddy or 💬 Message."],
    "/hub/feed": ["New posts from creators you follow show up here first.", "Bell notifications tell you when a followed creator posts."],
    "/hub/news": ["Team announcements sit at the top; news posts are below.", "Announcements also pop up once, so you won't miss them."],
    "/hub/chat": ["Start a chat from someone's page, Find members or your buddy list.", "You can block or report from inside a chat. Choose who can message you in Settings."],
    "/hub/collabs": ["Filter by the role you need, then press 'I'm interested' to reach out.", "Post your own request from your studio's Collabs tab."],
    "/hub/studio": ["Every post is reviewed by the team before it goes public; you'll get a note in your bell.", "Advertising products or sponsors needs admin approval first.", "Try a poll or questionnaire from Compose."],
    "/hub/profile": ["Change your picture, name and bio here. Your picture shows next to the search box.", "Add an email so you can reset your password.", "Link Google to log in with one tap."],
    "/hub/settings": ["Choose who can message you: everyone, followers, buddies, people you follow, or nobody.", "Switch off 'Show when I'm active' to hide your green dot.", "Content filters hide posts you'd rather not see."],
    "/hub/apply": ["Tell us what you make and link a few samples: it speeds up approval."],
    "/hub/reserve": ["Reserve with Google for one-tap log in at launch.", "Find your place on the list below the form."],
    "/hub/beta": ["Signed in? You only need to write a line about why you'd like to test."],
    "/hub/calendar": ["Holidays and site events show here; on the day, the site dresses up for them."],
    "/hub/help": ["Ask the help bee a question, or browse the FAQs below."]
  };
  MW.TIPS = TIPS;
  function tipsOff() { try { return localStorage.getItem("ch-tips-off") === "1"; } catch (e) { return false; } }

  function showTips() {
    if (tipsOff()) return;
    var path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (/^\/hub\/u\//.test(path)) path = "/hub/u";
    var tips = TIPS[path];
    var header = document.querySelector(".site-header");
    if (!tips || !header) return;
    var key = "mw-tips-hidden-" + path;          // "never" for this page
    var snoozeKey = "ch-tips-snooze-" + path;     // "skip for now" until a date
    try {
      if (localStorage.getItem(key)) return;
      if (Number(localStorage.getItem(snoozeKey) || 0) > Date.now()) return;
    } catch (e) { /* ignore */ }
    var bar = el("aside", { class: "tips-bar", "aria-label": "Quick tips" });
    bar.appendChild(el("span", { class: "tips-label" }, "Quick tip"));
    var textNode = el("span", { class: "tips-text" }, tips[0]);
    bar.appendChild(textNode);
    var i = 0;
    var row = el("span", { class: "tips-actions" });
    if (tips.length > 1) {
      var next = el("button", { type: "button", class: "link-button" }, "Next tip (" + (i + 1) + "/" + tips.length + ")");
      next.addEventListener("click", function () {
        i = (i + 1) % tips.length; textNode.textContent = tips[i];
        next.textContent = "Next tip (" + (i + 1) + "/" + tips.length + ")";
      });
      row.appendChild(next);
    }
    var skip = el("button", { type: "button", class: "link-button" }, "Skip for now");
    skip.addEventListener("click", function () {
      bar.remove();
      try { localStorage.setItem(snoozeKey, String(Date.now() + 3 * 24 * 3600 * 1000)); } catch (e) { /* ignore */ }
    });
    var never = el("button", { type: "button", class: "link-button" }, "Don't show again");
    never.addEventListener("click", function () {
      bar.remove();
      try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ }
      MW.toast("Tips for this page are off. (\"Turn off all tips\" stops them everywhere.)");
    });
    var allOff = el("button", { type: "button", class: "link-button" }, "Turn off all tips");
    allOff.addEventListener("click", function () {
      bar.remove();
      try { localStorage.setItem("ch-tips-off", "1"); } catch (e) { /* ignore */ }
      MW.toast("All tips are off. You can turn them back on in Settings.");
    });
    row.appendChild(skip);
    row.appendChild(never);
    row.appendChild(allOff);
    row.appendChild(el("a", { href: MW.isHub ? "/hub/help" : "/help", class: "tips-help" }, "Help & FAQ"));
    bar.appendChild(row);
    var hide = el("button", { type: "button", class: "tips-close", "aria-label": "Skip tips for now" }, "×");
    hide.addEventListener("click", function () { skip.click(); });
    bar.appendChild(hide);
    var menu = document.getElementById("site-menu");
    (menu || header).after(bar);
  }

  // Back after three days or more? A short "here's where things are" tour, once.
  function welcomeBack() {
    if (!MW.isHub || tipsOff()) return;
    var now = Date.now(), last = 0;
    try { last = Number(localStorage.getItem("ch-last-visit") || 0); localStorage.setItem("ch-last-visit", String(now)); } catch (e) { return; }
    try { if (localStorage.getItem("ch-welcome-back-off") === "1") return; } catch (e) { /* ignore */ }
    if (!last || now - last < 3 * 24 * 3600 * 1000) return;
    if (/^\/hub\/(login|register|verify)/.test(window.location.pathname)) return;
    var steps = [
      ["👤 Your profile", "Tap your picture next to the search box to open your profile. ☰ (top right) has Edit my profile and Settings."],
      ["🤝 Buddies", "The Buddies tab holds your friends, your chats and 🔍 Find buddies, with people you may know."],
      ["🔔 The bell", "New followers, buddy requests, replies and team announcements land in the bell at the top."],
      ["🐝 Creators", "The Creators tab starts with the top creators, then everyone else. Follow the ones you like."],
      ["❓ Help", "The glittering ? in the corner answers questions, any time."]
    ];
    var dialog = el("dialog", { class: "heist-dialog welcome-back", "aria-labelledby": "wb-title" });
    dialog.appendChild(el("p", { class: "node-label" }, "Welcome back"));
    dialog.appendChild(el("h2", { id: "wb-title" }, "Good to see you again! 🐝 Here's where things are:"));
    var ol = el("ol", { class: "wb-steps" });
    steps.forEach(function (st) {
      var li = el("li");
      li.appendChild(el("strong", {}, st[0]));
      li.appendChild(el("span", {}, st[1]));
      ol.appendChild(li);
    });
    dialog.appendChild(ol);
    var actions = el("div", { class: "form-actions" });
    var ok = el("button", { type: "button", class: "btn" }, "Thanks!");
    var later = el("button", { type: "button", class: "btn btn-ghost" }, "Skip for now");
    var never = el("button", { type: "button", class: "btn btn-ghost" }, "Never show this");
    ok.addEventListener("click", function () { dialog.close(); });
    later.addEventListener("click", function () { dialog.close(); });
    never.addEventListener("click", function () {
      try { localStorage.setItem("ch-welcome-back-off", "1"); } catch (e) { /* ignore */ }
      dialog.close();
    });
    actions.appendChild(ok); actions.appendChild(later); actions.appendChild(never);
    dialog.appendChild(actions);
    dialog.addEventListener("close", function () { dialog.remove(); });
    // Let the first-visit welcome and announcements go first.
    setTimeout(function () {
      if (document.querySelector("dialog[open], .onboard")) return;
      document.body.appendChild(dialog);
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    }, 2500);
  }

  /* ---------- Help assistant ---------- */

  var HELP_PAGE = MW.isHub ? "/hub/help" : "/help";
  MW.helpChat = function (container) {
    var log = el("div", { class: "help-log", "aria-live": "polite" });
    log.appendChild(el("p", { class: "help-msg help-bot" }, "Hi! 👋 Ask me anything about using " + (MW.isHub ? "Chapterhive" : "the site") + ": your account, posting, following, chat, beta testing…"));
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
      MW.api("/help/ask", { method: "POST", json: { question: q, history: history, site: MW.isHub ? "chapterhive" : "banditos" } }).then(function (d) {
        thinking.remove();
        var p = el("div", { class: "help-msg help-bot" });
        p.appendChild(el("p", {}, d.answer));
        if (d.sources && d.sources.length) {
          var more = el("p", { class: "help-related" }, "Related: ");
          d.sources.forEach(function (s, i) {
            if (i) more.appendChild(document.createTextNode(" · "));
            more.appendChild(el("a", { href: HELP_PAGE + "#" + s.id }, s.q));
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
    if (document.getElementById("help-fab") || window.location.pathname === "/help" || window.location.pathname === "/hub/help") return;
    var button = el("button", { type: "button", id: "help-fab", class: "help-fab help-fab-glitter", "aria-haspopup": "dialog", "aria-label": "Help" }, "?");
    // A glow and a few sparkles around the button so people notice it. They sit in their own layer
    // behind the button, because the hexagon shape would clip anything drawn on the button itself.
    var glitter = el("span", { class: "help-glitter", "aria-hidden": "true" });
    for (var sp = 0; sp < 4; sp++) glitter.appendChild(el("span", { class: "help-sparkle help-sparkle-" + sp }, "✦"));
    document.body.appendChild(glitter);
    var dialog = el("dialog", { class: "heist-dialog help-dialog", "aria-labelledby": "help-title" });
    dialog.appendChild(el("p", { class: "node-label" }, "Help desk"));
    dialog.appendChild(el("h2", { id: "help-title" }, "How can we help?"));
    var body = el("div");
    dialog.appendChild(body);
    var input = MW.helpChat(body);
    var foot = el("div", { class: "form-actions" });
    foot.appendChild(el("a", { class: "btn btn-ghost btn-small", href: HELP_PAGE }, "All FAQs"));
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
    if (MW.feature("quick_tips")) { showTips(); MW.me().then(function (user) { if (user) welcomeBack(); }); }
    if (MW.feature("help_assistant")) buildHelpButton();
  });
})();
