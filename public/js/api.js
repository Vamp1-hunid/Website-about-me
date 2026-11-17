// js/api.js
// Shared helpers used by every page:
//  - MW.api():   talks to the server (/api/...) and turns errors into readable messages
//  - MW.me():    finds out who is logged in (asked once per page)
//  - MW.toast(): small pop-up message at the bottom of the screen
//  - fills in the Log in / Join / profile buttons in the header
//  - highlights the current page in the navigation

(function () {
  "use strict";

  var MW = (window.MW = window.MW || {});

  // Which site this page belongs to: God's Banditos ("banditos") or Chapterhive ("chapterhive").
  MW.brand = (document.body && document.body.getAttribute("data-brand")) || "banditos";
  MW.isHub = MW.brand === "chapterhive";
  // The staff dashboard: Chapterhive pages use Chapterhive's copy (/hub/admin), God's Banditos uses /admin.
  MW.adminUrl = function (rest) { return (MW.isHub ? "/hub/admin" : "/admin") + (rest || ""); };

  // Where a work, story or character lives. On Chapterhive everything opens in Chapterhive's look;
  // on God's Banditos, other creators' things open on Chapterhive.
  MW.workUrl = function (post) {
    var slug = encodeURIComponent(post.slug);
    if (post.category === "news") return "/hub/news/" + slug;
    var banditos = !post.creator || post.creator.isBanditos;
    return (MW.isHub || !banditos ? "/hub/w/" : "/work/") + slug;
  };
  MW.storyUrl = function (slug, creator) {
    var banditos = !creator || creator.isBanditos;
    return (MW.isHub || !banditos ? "/hub/s/" : "/stories/") + encodeURIComponent(slug);
  };
  MW.characterUrl = function (slug, creator) {
    var banditos = !creator || creator.isBanditos;
    return (MW.isHub || !banditos ? "/hub/ch/" : "/characters/") + encodeURIComponent(slug);
  };

  // Sends a request to the server. options: { method, json, form }
  // Resolves with the JSON reply, or rejects with an Error that has .status and .data.
  MW.api = async function (path, options) {
    options = options || {};
    var init = { method: options.method || "GET", headers: {}, credentials: "same-origin" };

    if (options.json !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.json);
    } else if (options.form) {
      init.body = options.form; // FormData: the browser sets the right Content-Type itself
    }

    var response;
    try {
      response = await fetch("/api" + path, init);
    } catch (networkError) {
      var offline = new Error("Could not reach the server. Check your connection and try again.");
      offline.status = 0;
      throw offline;
    }

    var data = null;
    try {
      data = await response.json();
    } catch (parseError) {
      data = null;
    }

    if (!response.ok) {
      var error = new Error((data && data.error) || "Something went wrong (" + response.status + ").");
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  };

  // Who is logged in? Returns a promise of the user object, or null.
  var mePromise = null;
  MW.me = function (refresh) {
    if (!mePromise || refresh) {
      mePromise = MW.api("/account/me")
        .then(function (data) {
          MW.googleEnabled = Boolean(data.googleEnabled);
          MW.mailEnabled = Boolean(data.mailEnabled);
          MW.creator = data.creator || null;
          MW.features = data.features || [];
          MW.featureNotices = data.featureNotices || {};
          MW.account = data;
          return data.user;
        })
        .catch(function () { return null; });
    }
    return mePromise;
  };

  // Is a feature switched on for this visitor? (Admin → Features decides who sees what.)
  MW.features = [];
  MW.feature = function (key) { return MW.features.indexOf(key) !== -1; };
  MW.featureNotices = {};
  // A feature that's off but shown with a friendly notice ("Coming soon" / "Under maintenance"), or null.
  MW.featureNotice = function (key) {
    if (MW.feature(key)) return null;
    var n = MW.featureNotices[key];
    if (!n) return null;
    return {
      kind: n.notice,
      badge: n.notice === "maintenance" ? "Under maintenance" : "Coming soon",
      text: n.notice === "maintenance"
        ? n.label + " is under maintenance right now. We're working on it, please check back soon."
        : n.label + " is coming soon" + (n.launchAt ? ": it opens " + MW.formatDateTime(n.launchAt) : "") + ". Stay tuned!"
    };
  };
  // Turns a link for a switched-off feature into a "Coming soon" / "Under maintenance" one.
  MW.markNotice = function (link, notice) {
    if (!link || link.classList.contains("is-notice")) return;
    link.classList.add("is-notice", "notice-" + notice.kind);
    link.setAttribute("aria-disabled", "true");
    link.appendChild(MW.el("span", { class: "notice-badge" }, notice.badge));
    link.addEventListener("click", function (event) { event.preventDefault(); MW.toast(notice.text); });
  };

  // A small green dot for people who are online (and haven't hidden it).
  MW.onlineDot = function (online) {
    if (!online || !MW.feature("online_status")) return document.createTextNode("");
    var dot = document.createElement("span");
    dot.className = "online-dot";
    dot.title = "Online now";
    dot.setAttribute("aria-label", "Online now");
    return dot;
  };

  // Small pop-up message.
  MW.toast = function (message, isError, ms) {
    var area = document.querySelector(".toast-area");
    if (!area) {
      area = document.createElement("div");
      area.className = "toast-area";
      area.setAttribute("role", "status");
      area.setAttribute("aria-live", "polite");
      document.body.appendChild(area);
    }
    var toast = document.createElement("div");
    toast.className = "toast" + (isError ? " is-error" : "");
    toast.textContent = message;
    area.appendChild(toast);
    window.setTimeout(function () { toast.remove(); }, ms || 4200);
  };

  // "2026-11-12T05:17:33Z" -> "12 Nov 2026"
  MW.formatDate = function (value) {
    var date = new Date(value);
    if (isNaN(date)) return "";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  MW.categoryName = function (category) {
    return { "story-art": "Story art", anime: "Anime works", writing: "Writing", updates: "Update", news: "News",
      art: "Art", comedy: "Comedy", film: "Live action film", series: "Series", meme: "Meme", thoughts: "Thoughts", poll: "Poll",
      novel: "Novel", storybook: "Storybook", educational: "Educational", poetry: "Poetry", song: "Song & music", trailer: "Trailer", tutorial: "Tutorial" }[category] || category;
  };

  // "2026-11-20T15:00:00Z" -> "20 Nov 2026, 17:00" (in the visitor's own time zone)
  MW.formatDateTime = function (value) {
    var date = new Date(value);
    if (isNaN(date)) return "";
    return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // A member's picture, or the first letter of their name in a coloured square.
  MW.avatar = function (person, size) {
    var box = el("span", { class: "avatar" + (size === "big" ? " avatar-big" : ""), "aria-hidden": "true" });
    if (person && person.avatarUrl) {
      box.appendChild(el("img", { src: person.avatarUrl, alt: "", loading: "lazy" }));
    } else {
      box.textContent = ((person && (person.displayName || person.username)) || "?").trim().charAt(0).toUpperCase();
    }
    return box;
  };

  /* ---------- Uploading a file for a work (admin) ----------
     Asks the server for a "ticket", then sends the file straight to Cloudinary (on the live site)
     or to the server (on a laptop). Resolves with what the save request needs:
       { upload: {...} }  or  { local: {...} }, plus kind and a preview URL. */
  MW.uploadFile = async function (file, onProgress) {
    var isDocument = /\.(pdf|docx?|odt|txt|md|epub|pptx)$/i.test(file.name) && !/^(image|video|audio)\//.test(file.type);
    var ticket = await MW.api("/admin/media/ticket" + (isDocument ? "?kind=document" : ""));
    var kind = isDocument ? "document" : /^video\//.test(file.type) ? "video" : /^audio\//.test(file.type) ? "audio" : "image";
    var limit = ticket.limitsMb && ticket.limitsMb[kind];
    if (limit && file.size > limit * 1024 * 1024) {
      throw new Error(file.name + " is bigger than " + limit + " MB, the limit for this kind of file.");
    }

    var form = new FormData();
    var url;
    if (ticket.mode === "cloudinary") {
      Object.keys(ticket.fields).forEach(function (key) { form.append(key, ticket.fields[key]); });
      form.append("file", file);
      url = ticket.uploadUrl;
    } else {
      form.append("file", file);
      url = "/api/admin/media";
    }

    var reply = await new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      if (ticket.mode !== "cloudinary") xhr.withCredentials = true;
      xhr.upload.onprogress = function (event) {
        if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
      };
      xhr.onload = function () {
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
        if (xhr.status >= 200 && xhr.status < 300 && data) return resolve(data);
        var message = (data && (data.error && (data.error.message || data.error))) || "Upload failed (" + xhr.status + ").";
        reject(new Error(file.name + ": " + message));
      };
      xhr.onerror = function () { reject(new Error(file.name + ": the upload was interrupted. Check your connection.")); };
      xhr.send(form);
    });

    if (ticket.mode === "cloudinary") {
      var isRaw = reply.resource_type === "raw";
      var detected = isRaw ? "document" : reply.resource_type === "image" ? "image" :
        (reply.is_audio || /^(mp3|m4a|wav|ogg)$/.test(reply.format) ? "audio" : "video");
      return {
        kind: detected,
        previewUrl: reply.secure_url,
        upload: {
          publicId: reply.public_id, version: reply.version, signature: reply.signature,
          resourceType: reply.resource_type, format: reply.format || ""
        }
      };
    }
    return { kind: reply.local.kind, previewUrl: reply.local.url, local: reply.local };
  };

  // Only allow redirects to pages on this site (stops "?next=https://evil.example").
  MW.safeNext = function (value, fallback) {
    if (typeof value === "string" && value.charAt(0) === "/" && value.charAt(1) !== "/" && value.indexOf("\\") === -1) {
      return value;
    }
    return fallback || "/";
  };

  MW.currentPath = function () {
    return window.location.pathname + window.location.search;
  };

  // Shows each field's error message under the field (uses the same ids as script.js: <id>-error).
  MW.showProblems = function (form, problems) {
    form.querySelectorAll("[aria-invalid]").forEach(function (el) { el.removeAttribute("aria-invalid"); });
    form.querySelectorAll(".error").forEach(function (el) { el.textContent = ""; });
    (problems || []).forEach(function (problem) {
      var input = form.querySelector("[name='" + problem.field + "']");
      var box = input && document.getElementById(input.id + "-error");
      if (input) input.setAttribute("aria-invalid", "true");
      if (box) box.textContent = problem.message;
    });
    var first = form.querySelector("[aria-invalid='true']");
    if (first) first.focus();
  };

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text !== undefined) node.textContent = text;
    return node;
  }
  MW.el = el;

  /* ---------- Header: Log in / Join, or the member's name ---------- */

  function renderAuthArea(user) {
    var area = document.getElementById("auth-area");
    if (!area) return;
    area.textContent = "";

    // God's Banditos is view-only: visitors see no Log in / Join buttons (the owner logs in at /login),
    // and Chapterhive members just get a link back to Chapterhive.
    if (!MW.isHub && (!user || user.role !== "admin")) {
      if (user) area.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/hub" }, "@" + user.username + " · Chapterhive"));
      return;
    }

    if (!user && MW.isHub && MW.feature("reservations") && !MW.feature("signups")) {
      // Before launch: Log in for people who already reserved, and Sign up, which starts a username reservation.
      area.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/hub/login", title: "Reserved a name with a password? Log in to follow creators, like posts and see team updates" }, "Log in"));
      area.appendChild(el("a", { class: "btn btn-small", href: "/hub/reserve", title: "Reserve your username for launch day" }, "Sign up"));
      reservationBanner();
      return;
    }
    if (!user) {
      var next = encodeURIComponent(MW.currentPath());
      area.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/hub/login?next=" + next }, "Log in"));
      area.appendChild(el("a", { class: "btn btn-small", href: "/hub/register?next=" + next }, "Join"));
      return;
    }

    // Chat: a speech-bubble link with the number of unread conversations.
    if (MW.isHub && MW.featureNotice && MW.featureNotice("chat")) {
      var soonChat = el("a", { class: "btn btn-ghost btn-small chat-link-btn", href: "/hub/chat", title: "Chat" }, "💬");
      soonChat.addEventListener("click", function (event) { event.preventDefault(); MW.toast(MW.featureNotice("chat").text); });
      area.appendChild(soonChat);
    }
    if (MW.isHub && MW.feature && MW.feature("chat")) {
      var chatLink = el("a", { class: "btn btn-ghost btn-small chat-link-btn", href: "/hub/chat", title: "Chat", "aria-label": "Chat" }, "💬");
      area.appendChild(chatLink);
      MW.api("/chat/unread").then(function (d) {
        if (d.unread) {
          chatLink.appendChild(el("span", { class: "chat-badge" }, String(d.unread)));
          chatLink.setAttribute("aria-label", "Chat, " + d.unread + " unread");
        }
      }).catch(function () {});
    }

    // Settings live in the ☰ menu (keeps the header roomy on phones).
    if (MW.isHub && MW.account && MW.account.waitingForLaunch) waitingBanner();

    var me = el("a", { class: "auth-name", href: "/hub/profile", title: "Your profile" });
    me.appendChild(MW.avatar(user));
    me.appendChild(document.createTextNode(" @" + user.username));
    area.appendChild(me);
    if (user.role === "admin" && !MW.isHub) {
      area.appendChild(el("a", { class: "btn btn-small", href: MW.adminUrl("") }, "Admin"));
    } else if (MW.isHub && (user.role === "admin" || (MW.creator && MW.creator.status === "approved"))) {
      area.appendChild(el("a", { class: "btn btn-small", href: "/hub/studio" }, "Studio"));
    }
    area.appendChild(el("a", { class: "btn btn-ghost btn-small hdr-profile", href: "/hub/profile" }, "Profile"));
    var logout = el("button", { class: "btn btn-ghost btn-small hdr-logout", type: "button" }, "Log out");
    logout.addEventListener("click", async function () {
      logout.disabled = true;
      try {
        await MW.api("/account/logout", { method: "POST" });
      } catch (error) {
        // Even if it fails, reload so the page shows the real state.
      }
      // Stay on the same site: Chapterhive pages go back to the Chapterhive home, God's Banditos pages to its home.
      window.location.href = MW.isHub || /^\/(profile|u\/|help|contact|legal)/.test(window.location.pathname) ? "/hub" : "/";
    });
    area.appendChild(logout);
  }

  function markCurrentNav() {
    var page = document.body.getAttribute("data-page");
    if (!page) return;
    document.querySelectorAll(".site-nav a[data-nav='" + page + "']").forEach(function (link) {
      link.setAttribute("aria-current", "page");
    });
  }

  /* ---------- The three-bar menu (☰): every section of the site, a search box and social links ---------- */

  var socialsPromise = null;
  MW.socials = function () {
    if (!socialsPromise) {
      socialsPromise = MW.api("/socials").then(function (d) { return d.links; }).catch(function () { return []; });
    }
    return socialsPromise;
  };

  // Social links as a row of buttons (used in the menu, the footer and the contact section).
  MW.renderSocials = function (container, links) {
    container.textContent = "";
    links.forEach(function (link) {
      var a = el("a", { class: "social-link", href: link.url, "data-platform": link.platform, rel: "noopener me" });
      if (!/^mailto:/i.test(link.url)) a.setAttribute("target", "_blank");
      a.appendChild(el("span", { class: "social-dot", "aria-hidden": "true" }));
      a.appendChild(document.createTextNode(link.label));
      container.appendChild(a);
    });
    container.hidden = !links.length;
  };

  // Top-creator badges (👑 #1 on Chapterhive, 📚 Top 5 in Books ...). compact: icons only, label on hover.
  MW.badges = function (list, compact) {
    var box = el("span", { class: "rank-badges" + (compact ? " is-compact" : "") });
    (list || []).forEach(function (b) {
      var s = el("span", { class: "rank-badge tier-" + b.tier, title: b.label }, compact ? b.icon : b.icon + " " + b.label);
      box.appendChild(s);
    });
    return box;
  };

  // Live username preview and rules: lowercase only, no emoji/spaces, and at least one _ or -.
  MW.usernameRules = function (name) {
    if (!name) return "3–30 characters: lowercase letters, numbers and at least one _ or -";
    if (name.length < 3) return "At least 3 characters";
    if (!/[_-]/.test(name)) return "Add an _ or - (like bee_reader or bee-reader)";
    if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/.test(name)) return "_ or - can't be at the start or end, or two in a row";
    return null;
  };
  MW.usernamePreview = function (input, legacy) {
    if (!input || input.getAttribute("data-preview")) return;
    input.setAttribute("data-preview", "1");
    var box = el("div", { class: "username-preview", "aria-live": "polite" });
    var tag = el("span", { class: "username-preview-tag" }, "@");
    var note = el("span", { class: "username-preview-note" });
    box.appendChild(el("span", { class: "muted" }, "Preview: "));
    box.appendChild(tag);
    box.appendChild(note);
    var anchor = input.closest(".reserve-at") || input;
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
    function update() {
      var clean = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
      if (clean !== input.value && !input.readOnly) input.value = clean;
      tag.textContent = "@" + (clean || "your_name");
      var problem = legacy ? null : MW.usernameRules(clean);
      note.textContent = problem ? " · " + problem : " · ✓ looks good";
      box.className = "username-preview " + (problem ? "is-bad" : "is-good");
    }
    input.addEventListener("input", update);
    update();
    return update;
  };

  // Admin: how many applications are waiting, shown as little badges on the menu and dashboard links.
  MW.adminCounts = function (root) {
    return MW.api("/reserve/admin/counts").then(function (c) {
      root.querySelectorAll("[data-count]").forEach(function (a) {
        var n = c[a.getAttribute("data-count")];
        if (!n || a.querySelector(".count-badge")) return;
        a.appendChild(el("span", { class: "count-badge", title: a.getAttribute("data-count") === "reservations" ? "reserved so far" : "waiting for you" }, String(n)));
      });
    }).catch(function () {});
  };

  // A "create an account" box shown wherever a visitor hits something reserved for members.
  MW.guestGate = function (message) {
    var box = el("div", { class: "guest-gate", role: "note" });
    box.appendChild(el("p", {}, message || "Create a free account to join in."));
    var actions = el("div", { class: "actions" });
    if (MW.feature && MW.feature("reservations") && !MW.feature("signups")) {
      // Before launch, the join button reserves a username instead.
      actions.appendChild(el("a", { class: "btn", href: "/hub/reserve" }, "🐝 Reserve your username"));
    } else {
      actions.appendChild(el("a", { class: "btn", href: "/hub/register?next=" + encodeURIComponent(MW.currentPath()) }, "Create a free account"));
    }
    actions.appendChild(el("a", { class: "btn-ghost", href: "/hub/login?next=" + encodeURIComponent(MW.currentPath()) }, "Log in"));
    box.appendChild(actions);
    return box;
  };

  // Pre-launch: a "reserve your username" card at the top of the Chapterhive home page, and a menu link.
  function reservationBanner() {
    var path = window.location.pathname.replace(/\/$/, "");
    var main = document.getElementById("main");
    if (path !== "/hub" || !main || document.querySelector(".reserve-banner")) return;
    var card = el("a", { class: "reserve-banner", href: "/hub/reserve" });
    card.appendChild(el("span", { class: "reserve-banner-emoji", "aria-hidden": "true" }, "🐝"));
    var t = el("span", { class: "reserve-banner-text" });
    t.appendChild(el("strong", {}, "Chapterhive opens soon"));
    t.appendChild(el("span", {}, "For readers, watchers and creators alike. Reserve your username now; your free member account opens at launch, and you can become a creator any time."));
    card.appendChild(t);
    card.appendChild(el("span", { class: "btn btn-small" }, "Reserve"));
    var beta = el("a", { class: "reserve-banner beta-banner", href: "/hub/beta" });
    beta.appendChild(el("span", { class: "reserve-banner-emoji", "aria-hidden": "true" }, "🧪"));
    var bt = el("span", { class: "reserve-banner-text" });
    bt.appendChild(el("strong", {}, "Become a beta tester"));
    bt.appendChild(el("span", {}, "Get a real account before launch and help us shape Chapterhive."));
    beta.appendChild(bt);
    beta.appendChild(el("span", { class: "btn btn-small btn-ghost" }, "Apply"));
    main.insertBefore(beta, main.firstChild);
    main.insertBefore(card, main.firstChild);
  }

  // Signed in but waiting for launch: point them to their place in line and the team's updates.
  function waitingBanner() {
    var path = window.location.pathname.replace(/\/$/, "");
    var main = document.getElementById("main");
    if (path !== "/hub" || !main || document.querySelector(".waiting-banner")) return;
    var card = el("div", { class: "reserve-banner waiting-banner", role: "note" });
    card.appendChild(el("span", { class: "reserve-banner-emoji", "aria-hidden": "true" }, "🐝"));
    var t = el("span", { class: "reserve-banner-text" });
    t.appendChild(el("strong", {}, "You're in early! Chapterhive opens soon"));
    t.appendChild(el("span", {}, "You can already follow creators and like their posts. Posting, comments, chat and downloads open at launch."));
    card.appendChild(t);
    var acts = el("span", { class: "waiting-actions" });
    acts.appendChild(el("a", { class: "btn btn-small", href: "/hub/reserve#reserve-public" }, "My place"));
    acts.appendChild(el("a", { class: "btn btn-small btn-ghost", href: "/hub/news" }, "Updates"));
    if (MW.feature("beta_applications")) acts.appendChild(el("a", { class: "btn btn-small btn-ghost", href: "/hub/beta" }, "🧪 Beta test"));
    card.appendChild(acts);
    main.insertBefore(card, main.firstChild);
  }
  MW.waitingBanner = waitingBanner;

  // Holidays and events: a small banner on the Chapterhive home page, and a theme hook for the whole site.
  function holidayBanner() {
    if (!MW.isHub || !MW.feature("calendar")) return;
    MW.api("/calendar/today").then(function (d) {
      var items = d.events.concat(d.holidays);
      if (d.theme) document.body.setAttribute("data-holiday", d.theme);
      var path = window.location.pathname.replace(/\/$/, "");
      if (!items.length || (path !== "/hub")) return;
      var main = document.getElementById("main");
      if (!main || document.querySelector(".holiday-banner")) return;
      var top = items[0];
      var banner = el("a", { class: "holiday-banner", href: top.link || "/hub/calendar" });
      banner.appendChild(el("span", { class: "holiday-emoji", "aria-hidden": "true" }, top.emoji));
      banner.appendChild(el("span", {}, (top.kind === "event" ? "" : "Happy ") + top.title + (top.kind === "event" && top.details ? ": " + top.details : "") + (items.length > 1 ? " · and " + (items.length - 1) + " more today" : "")));
      main.insertBefore(banner, main.firstChild);
    }).catch(function () {});
  }

  // Pages that belong to a switchable feature. While it's off, the page shows a friendly notice instead.
  var PAGE_FEATURES = { "/hub/chat": "chat", "/hub/collabs": "collabs", "/hub/premium": "premium", "/hub/sponsor": "sponsor_page",
    "/hub/apply": "creator_applications", "/hub/search": "search", "/search": "search", "/hub/feed": "follows", "/hub/news": "updates", "/hub/top": "rankings", "/hub/calendar": "calendar", "/hub/comic-maker": "comic_maker" };
  function gatePage() {
    var path = window.location.pathname.replace(/\/$/, "");
    var key = PAGE_FEATURES[path] || (path.indexOf("/hub/collabs/") === 0 ? "collabs" : null);
    if (!key || MW.feature(key)) return;
    var main = document.getElementById("main");
    if (!main) return;
    var notice = MW.featureNotice(key);
    var panel = el("section", { class: "panel feature-notice notice-" + (notice ? notice.kind : "off") });
    panel.appendChild(el("p", { class: "feature-notice-icon", "aria-hidden": "true" }, notice && notice.kind === "maintenance" ? "🛠️" : notice ? "🐝" : "🔒"));
    panel.appendChild(el("h1", {}, notice ? notice.badge : "Not available right now"));
    panel.appendChild(el("p", { class: "lead" }, notice ? notice.text : "This part of the site is switched off for now. Please check back later."));
    var back = el("p");
    back.appendChild(el("a", { class: "btn", href: MW.isHub ? "/hub" : "/" }, "Back to the home page"));
    panel.appendChild(back);
    main.textContent = "";
    main.appendChild(panel);
  }

  // A simple line-drawn magnifying glass (SVG, so it matches the theme colours).
  function searchIcon(cls) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "search-svg" + (cls ? " " + cls : ""));
    var c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", "10.5"); c.setAttribute("cy", "10.5"); c.setAttribute("r", "6.5");
    var l = document.createElementNS(ns, "line");
    l.setAttribute("x1", "15.5"); l.setAttribute("y1", "15.5"); l.setAttribute("x2", "21"); l.setAttribute("y2", "21");
    [c, l].forEach(function (n) {
      n.setAttribute("fill", "none"); n.setAttribute("stroke", "currentColor"); n.setAttribute("stroke-width", "2.4"); n.setAttribute("stroke-linecap", "round");
      svg.appendChild(n);
    });
    return svg;
  }

  // The search box sits at the end of the tab bar, where people look for it.
  function moveSearchToNav() {
    var nav = document.querySelector(".site-nav");
    var search = document.querySelector(".site-header .header-search");
    if (!nav || !search || nav.querySelector(".header-search")) return;
    search.classList.add("nav-search");
    var input = search.querySelector("input");
    if (input) { input.placeholder = MW.isHub ? "Search books, series, creators…" : "Search works, stories…"; input.setAttribute("enterkeyhint", "search"); }
    if (!search.querySelector("button")) {
      var go = el("button", { type: "submit", class: "btn btn-small nav-search-go" });
      go.appendChild(searchIcon());
      go.appendChild(el("span", {}, "Search"));
      search.appendChild(go);
    }
    if (input && !search.querySelector(".nav-search-icon")) search.insertBefore(searchIcon("nav-search-icon"), input);
    // Phones: the search box gets its own slim bar above the swipeable row of tabs.
    var holder;
    if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) {
      var bar = el("div", { class: "mobile-search-bar" });
      bar.appendChild(search);
      nav.parentNode.insertBefore(bar, nav);
      holder = bar;
    } else {
      nav.appendChild(search);
      holder = nav;
    }
    // Chapterhive: your profile picture sits to the left of the search box, one tap from your account.
    if (MW.isHub) {
      MW.me().then(function (user) {
        if (holder.querySelector(".search-profile")) return;
        var link = el("a", { class: "search-profile", href: user ? "/hub/u/" + encodeURIComponent(user.username) : "/hub/login",
          "aria-label": user ? "My profile (@" + user.username + ")" : "Log in", title: user ? "My profile" : "Log in" });
        if (user) link.appendChild(MW.avatar(user));
        else link.appendChild(el("span", { class: "search-profile-guest", "aria-hidden": "true" }, "👤"));
        holder.insertBefore(link, search);
        holder.classList.add("has-profile");
      }).catch(function () {});
    }
  }

  function buildMenu() {
    moveSearchToNav();
    var header = document.querySelector(".site-header");
    if (!header || document.getElementById("site-menu")) return;
    var menu = el("div", { id: "site-menu", class: "site-menu", hidden: "" });
    menu.setAttribute("aria-label", "Site menu");

    var search = el("form", { class: "menu-search", action: MW.isHub ? "/hub/search" : "/search", method: "get", role: "search" });
    var label = el("label", { class: "sr-only", for: "menu-q" }, "Search the site");
    var input = el("input", { type: "search", id: "menu-q", name: "q", maxlength: "80",
      placeholder: MW.isHub ? "Search creators, works, updates…" : "Search works, stories, characters…" });
    var go = el("button", { type: "submit", class: "btn-small" }, "Search");
    search.append(label, input, go);
    menu.appendChild(search);

    var groups = MW.isHub ? [
      ["Chapterhive", [["/hub", "Home"], ["/hub/news", "News & updates", false, "updates"], ["/hub/creators", "Creators"], ["/hub/feed", "Following", true], ["/hub/buddies", "Buddies", true], ["/hub/creators#top", "Top creators", false, "rankings"], ["/hub/calendar", "Calendar", false, "calendar"]]],
      ["Create", [["/hub/collabs", "Collab board", true, "collabs"], ["/hub/collabs#suggest", "Suggestion box", true, "suggestion_box"], ["/hub/apply", "Become a creator", true, "creator_applications"], ["/legal/content-rules", "Content Rules"]]],
      ["More", [["/hub/help", "Help & FAQ"], ["/hub/premium", "Premium", false, "premium"], ["/hub/sponsor", "Sponsor & business", false, "sponsor_page"], ["/", "God's Banditos"], ["/contact", "Contact"], ["/legal/terms", "Terms"]]]
    ] : [
      ["Explore", [["/", "Home"], ["/gallery", "All works"], ["/gallery?category=story-art", "Story art"],
        ["/gallery?category=anime", "Anime works"], ["/gallery?category=writing", "Writing"], ["/gallery?category=updates", "Updates", false, "updates"]]],
      ["Stories", [["/stories", "All stories"], ["/gallery?section=concept-art", "Concept art"]]],
      ["Studio", [["/products", "More products by us"], ["/creator", "Meet the creator"], ["/contact", "Contact"], ["/help", "Help & FAQ"], ["/hub", "Chapterhive ↗"]]]
    ];
    var grid = el("div", { class: "menu-grid" });
    groups.forEach(function (group) {
      var col = el("div", { class: "menu-col" });
      col.appendChild(el("p", { class: "node-label" }, group[0]));
      var ul = el("ul");
      group[1].forEach(function (item) {
        var li = el("li");
        if (item[2]) li.setAttribute("data-members", "");
        if (item[3]) li.setAttribute("data-feature", item[3]);
        li.appendChild(el("a", { href: item[0] }, item[1]));
        ul.appendChild(li);
      });
      col.appendChild(ul);
      grid.appendChild(col);
    });
    var account = el("div", { class: "menu-col", id: "menu-account" });
    account.appendChild(el("p", { class: "node-label" }, "Account"));
    account.appendChild(el("ul"));
    // Your account (profile, settings, tools) comes first in the menu, so it's easy to find.
    grid.insertBefore(account, grid.firstChild);
    menu.appendChild(grid);

    var socials = el("div", { class: "social-row menu-socials", hidden: "" });
    menu.appendChild(socials);
    header.after(menu);

    MW.me().then(function (user) {
      var ul = account.querySelector("ul");
      // Switched-off site features (Admin → Site features) disappear from the menu and navigation.
      // Or, if the admin chose so, they stay visible with a "Coming soon" / "Under maintenance" badge.
      menu.querySelectorAll("[data-feature]").forEach(function (li) {
        var key = li.getAttribute("data-feature");
        if (MW.feature(key)) return;
        var notice = MW.featureNotice(key);
        if (notice) MW.markNotice(li.querySelector("a"), notice); else li.remove();
      });
      var navFeatures = { collabs: "collabs", apply: "creator_applications", sponsor: "sponsor_page", news: "updates", updates: "updates", feed: "follows", top: "rankings" };
      Object.keys(navFeatures).forEach(function (nav) {
        if (!MW.feature(navFeatures[nav])) {
          var notice = MW.featureNotice(navFeatures[nav]);
          document.querySelectorAll(".site-nav a[data-nav='" + nav + "']").forEach(function (a) {
            if (notice) MW.markNotice(a, notice); else a.remove();
          });
        }
      });
      if (!MW.feature("search") && !MW.featureNotice("search")) {
        document.querySelectorAll(".header-search, .menu-search").forEach(function (f) { f.hidden = true; });
      }
      gatePage();
      holidayBanner();
      // Suggestion box: a link in every footer (and the help page / collab board keep the full form).
      if (MW.feature("suggestion_box")) {
        var foot = document.querySelector(".site-footer p:last-child");
        if (foot && !foot.querySelector(".suggest-link")) {
          foot.appendChild(document.createTextNode(" · "));
          foot.appendChild(el("a", { class: "suggest-link", href: (MW.isHub ? "/hub/help" : "/help") + "#suggest" }, "💡 Suggest an idea"));
        }
      }
      // Visitors without an account: members-only links are hidden and replaced by one join prompt.
      if (!user) {
        document.querySelectorAll(".site-nav a[data-nav='feed'], .site-nav a[data-nav='collabs'], .site-nav a[data-nav='apply']")
          .forEach(function (a) { a.remove(); });
        var hiddenAny = false;
        menu.querySelectorAll("[data-members]").forEach(function (li) { li.remove(); hiddenAny = true; });
        if (hiddenAny) {
          account.appendChild(el("p", { class: "muted menu-guest-note" },
            "Collabs, your following feed and creator tools open up once you have a free account."));
        }
      }
      var items = user
        ? [["/hub/u/" + encodeURIComponent(user.username), "👤 My profile"], ["/hub/people", "🤝 My buddies & followers"], ["/hub/members", "👥 Find members"], ["/hub/profile", "✏️ Edit my profile"], ["/hub/settings", "⚙ Settings & privacy"]]
        : [["/hub/login?next=" + encodeURIComponent(MW.currentPath()), "Log in"],
           MW.isHub && MW.feature("reservations") && !MW.feature("signups") ? ["/hub/reserve", "🐝 Reserve your username"] : ["/hub/register", "Create a free account"]];
      if (MW.isHub && MW.feature("beta_applications") && (!user ? (MW.feature("reservations") && !MW.feature("signups")) : !(MW.account && MW.account.isBeta) && user.role !== "admin")) items.push(["/hub/beta", "🧪 Become a beta tester"]);
      // God's Banditos: no accounts here. Visitors are pointed to Chapterhive instead.
      if (!MW.isHub && (!user || user.role !== "admin")) {
        account.querySelector(".node-label").textContent = "Chapterhive";
        items = user ? [["/hub", "Back to Chapterhive"], ["/hub/feed", "Following feed"]]
          : [["/hub/c/gods-banditos", "Follow on Chapterhive"], ["/hub/register", "Join Chapterhive"]];
        items.forEach(function (item) {
          var li = el("li");
          li.appendChild(el("a", { href: item[0] }, item[1]));
          ul.appendChild(li);
        });
        return;
      }
      var isCreator = user && (user.role === "admin" || (MW.creator && MW.creator.status === "approved"));
      if (user) items.splice(1, 0, ["/hub/feed", "Following feed"]);
      if (user && MW.feature && MW.feature("chat")) items.splice(1, 0, ["/hub/chat", "Chat"]);
      else if (user && MW.featureNotice("chat")) items.splice(1, 0, ["/hub/chat", "Chat", "chat"]);
      if (isCreator) {
        items.unshift(["/hub/studio#profile", "Creator profile settings"]);
        items.unshift(["/hub/studio#collabs", "My collab requests"]);
        items.unshift(["/hub/studio", "Creator studio"]);
      } else if (user && MW.creator && MW.creator.status === "pending") {
        items.unshift(["/hub/apply", "Creator application (pending)"]);
      }
      var perms = (MW.account && MW.account.staffPerms) || [];
      if (user && user.role !== "admin" && perms.length) {
        // Staff: only the tools their powers open.
        if (perms.indexOf("approve_creators") >= 0) items.unshift([MW.adminUrl("#chapterhive"), "🎨 Creator applications", null, "creators"]);
        if (perms.indexOf("approve_beta") >= 0) items.unshift(["/hub/beta#beta-admin", "🧪 Beta tester applications", null, "beta"]);
        if (perms.indexOf("manage_reservations") >= 0) items.unshift(["/hub/reserve#reserve-admin", "🐝 Name reservations", null, "reservations"]);
        if (perms.indexOf("post_updates") >= 0) items.unshift([MW.adminUrl("?to=beta#announce"), "📣 Post an update"]);
        items.unshift([MW.adminUrl(""), "🛡️ Staff tools"]);
      }
      if (user && user.role === "admin") {
        if (MW.account && MW.account.isOwner) items.unshift([MW.adminUrl("#team"), "🛡️ Team & powers"]);
        items.unshift([MW.adminUrl("?to=beta#announce"), "📣 Post an update"]);
        items.unshift([MW.adminUrl("#chapterhive"), "🎨 Creator applications", null, "creators"]);
        items.unshift(["/hub/beta#beta-admin", "🧪 Beta tester applications", null, "beta"]);
        items.unshift(["/hub/reserve#reserve-admin", "🐝 Name reservations", null, "reservations"]);
        items.unshift([MW.adminUrl("#settings"), "Site settings"]);
        items.unshift([MW.adminUrl(""), "Dashboard"]);
      }
      // Your own account links (profile, edit profile, settings) always come first, above the admin and staff tools.
      if (user) {
        var ACCOUNT = ["/hub/u/" + encodeURIComponent(user.username), "/hub/profile", "/hub/settings"];
        items.sort(function (a, b) {
          var ia = ACCOUNT.indexOf(a[0]), ib = ACCOUNT.indexOf(b[0]);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
      }
      items.forEach(function (item) {
        var li = el("li");
        var a = el("a", { href: item[0] }, item[1]);
        li.appendChild(a);
        if (typeof item[2] === "string" && MW.featureNotice(item[2])) MW.markNotice(a, MW.featureNotice(item[2]));
        if (item[3]) a.setAttribute("data-count", item[3]);
        ul.appendChild(li);
      });
      if (user && (user.role === "admin" || perms.length)) MW.adminCounts(ul);
      // "📲 Install the app" in the menu on phones and PCs (one tap where supported, otherwise the steps).
      if (MW.isHub) setTimeout(addInstallItem, 0);
      // Light/dark switch and Log out also live in the menu (on phones the header hides them to save room).
      var themeLi = el("li", { class: "menu-mobile-only" });
      var themeBtn = el("button", { type: "button", class: "menu-link-btn" }, "🌓 Switch light / dark mode");
      themeBtn.addEventListener("click", function () { var t = document.getElementById("theme-toggle"); if (t) t.click(); });
      themeLi.appendChild(themeBtn);
      ul.appendChild(themeLi);
      if (user) {
        var outLi = el("li", { class: "menu-mobile-only" });
        var outBtn = el("button", { type: "button", class: "menu-link-btn" }, "↩ Log out");
        outBtn.addEventListener("click", function () { var b = document.querySelector(".hdr-logout"); if (b) b.click(); });
        outLi.appendChild(outBtn);
        ul.appendChild(outLi);
      }
      if (user && MW.feature("streaks") && MW.account && MW.account.streak) {
        ul.appendChild(el("li", { class: "menu-streak" }, "🔥 " + MW.account.streak + "-day streak"));
      }
    });
    MW.socials().then(function (links) { MW.renderSocials(socials, links); });
  }

  function addFooterSocials() {
    var footer = document.querySelector(".site-footer");
    if (!footer) return;
    var row = el("div", { class: "social-row footer-socials", hidden: "" });
    footer.insertBefore(row, footer.firstChild.nextSibling);
    MW.socials().then(function (links) {
      MW.renderSocials(row, links);
      // The Contact section on the Creator page lists them too.
      var contact = document.getElementById("contact-socials");
      if (contact) {
        MW.renderSocials(contact, links);
        document.getElementById("contact-socials-box").hidden = !links.length;
      }
    });
  }

  // Keep the header search box filled in on the results page.
  function fillSearch() {
    var q = window.location.pathname === "/search" ? new URLSearchParams(window.location.search).get("q") : "";
    var box = document.getElementById("header-q");
    if (box && q) box.value = q;
  }


  /* ---------- "Fund the heist": the support / donation button ----------
     Shown only when the site owner switches it on in Dashboard -> Settings. */

  function supportMethod(m) {
    var card = el("li", { class: "heist-method heist-" + m.type });
    var titles = {
      card: "Card (Visa / Mastercard)", "mobile-money": "Mobile money", paypal: "PayPal",
      bank: "Bank transfer", link: "Support link"
    };
    card.appendChild(el("p", { class: "node-label" }, m.label || titles[m.type] || "Support"));

    if (m.type === "mobile-money") {
      if (m.provider) card.appendChild(el("p", { class: "heist-provider" }, m.provider));
      var row = el("div", { class: "heist-number-row" });
      row.appendChild(el("span", { class: "heist-number mono" }, m.number));
      var copy = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Copy");
      copy.addEventListener("click", function () {
        var done = function () { copy.textContent = "Copied ✓"; window.setTimeout(function () { copy.textContent = "Copy"; }, 2000); };
        if (navigator.clipboard) navigator.clipboard.writeText(m.number.replace(/\s+/g, "")).then(done, function () {});
      });
      row.appendChild(copy);
      card.appendChild(row);
      if (m.name) card.appendChild(el("p", { class: "muted" }, "Registered to " + m.name));
      if (m.details) card.appendChild(el("p", { class: "muted" }, m.details));
    } else if (m.type === "bank") {
      if (m.details) {
        card.appendChild(el("p", { class: "heist-details mono" }, m.details));
      } else {
        card.appendChild(el("p", { class: "muted" }, "Send a message and the account details will come to you by email."));
        card.appendChild(el("a", { class: "btn btn-small", href: "/contact?topic=support" }, "Ask for bank details"));
      }
    } else {
      if (m.details) card.appendChild(el("p", { class: "muted" }, m.details));
      var go = el("a", { class: "btn btn-small", href: m.url, target: "_blank", rel: "noopener" },
        m.type === "card" ? "Pay by card ↗" : m.type === "paypal" ? "Open PayPal ↗" : "Open ↗");
      card.appendChild(go);
    }
    return card;
  }

  function buildSupport(support) {
    // Not set up yet: the owner sees a reminder button that opens the settings; visitors see nothing.
    if (!support.enabled) {
      MW.me().then(function (user) {
        if (!user || user.role !== "admin" || document.querySelector(".heist-setup")) return;
        var b = el("a", { class: "heist-button heist-setup", href: MW.adminUrl("#settings"), title: "Only you can see this" }, "Fund the heist: set it up");
        document.body.appendChild(b);
      });
      return;
    }
    if (document.getElementById("heist-dialog")) return;

    var dialog = el("dialog", { id: "heist-dialog", class: "heist-dialog", "aria-labelledby": "heist-title" });
    var top = el("div", { class: "heist-top" });
    top.appendChild(el("span", { class: "heist-bag heist-bag-big", "aria-hidden": "true" }));
    var heading = el("div");
    heading.appendChild(el("p", { class: "node-label" }, "Crew // heist fund"));
    heading.appendChild(el("h2", { id: "heist-title" }, support.title));
    top.appendChild(heading);
    dialog.appendChild(top);
    if (support.message) dialog.appendChild(el("p", { class: "lead" }, support.message));
    var list = el("ul", { class: "heist-methods" });
    support.methods.forEach(function (m) { list.appendChild(supportMethod(m)); });
    dialog.appendChild(list);
    dialog.appendChild(el("p", { class: "muted heist-note" },
      "Payments are handled by each service above; this site never sees your card or account details. Thank you for backing the crew."));
    var close = el("form", { method: "dialog" });
    close.appendChild(el("button", { type: "submit", class: "btn btn-ghost" }, "Close"));
    dialog.appendChild(close);
    document.body.appendChild(dialog);
    dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });

    function open() {
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    MW.openSupport = open;

    // The floating loot bag (bottom left; the console button lives bottom right).
    var button = el("button", { type: "button", class: "heist-button", "aria-haspopup": "dialog" });
    button.appendChild(el("span", { class: "heist-bag", "aria-hidden": "true" }));
    button.appendChild(el("span", { class: "heist-label" }, support.title));
    for (var i = 0; i < 3; i++) button.appendChild(el("span", { class: "heist-coin heist-coin-" + i, "aria-hidden": "true" }));
    button.addEventListener("click", open);
    document.body.appendChild(button);

    // A link in the footer and the menu too.
    var footer = document.querySelector(".site-footer");
    if (footer) {
      var p = el("p", { class: "footer-support" });
      var link = el("button", { type: "button", class: "link-button" }, "♦ " + support.title);
      link.addEventListener("click", open);
      p.appendChild(link);
      footer.appendChild(p);
    }
    var menuCol = document.querySelector("#site-menu .menu-col:nth-child(3) ul");
    if (menuCol) {
      var li = el("li");
      var a = el("a", { href: "#fund" }, support.title);
      a.addEventListener("click", function (event) { event.preventDefault(); open(); });
      li.appendChild(a);
      menuCol.appendChild(li);
    }
    if (window.location.hash === "#fund") open();
  }

  // God's Banditos always shows the heist button; Chapterhive shows it once the "hub_support" feature is on.
  MW.me().then(function () {
    if (!MW.isHub || MW.feature("hub_support")) MW.api("/support").then(buildSupport).catch(function () {});
  });

  // The bell, welcome card, quick tips and help button live in extras.js.
  var extras = document.createElement("script");
  extras.src = "/js/extras.js";
  extras.defer = true;
  document.head.appendChild(extras);

  buildMenu();
  addFooterSocials();
  fillSearch();
  markCurrentNav();
  MW.me().then(function (user) {
    renderAuthArea(user);
    if (user) showFeedBadge();
  });

  // A dot on the ☰ button and a count in the menu when followed creators post something new.
  function showFeedBadge() {
    if (window.location.pathname === "/hub/feed") return;
    MW.api("/hub/feed/unseen").then(function (data) {
      if (!data.count) return;
      var toggle = document.getElementById("menu-toggle");
      if (toggle) {
        toggle.appendChild(el("span", { class: "menu-dot", "aria-hidden": "true" }));
        toggle.setAttribute("aria-label", "Open menu (" + data.count + " new from creators you follow)");
      }
      var feedLink = document.querySelector("#site-menu a[href='/hub/feed']");
      if (feedLink) feedLink.textContent += " (" + data.count + " new)";
      var navLink = document.querySelector(".site-nav a[href='/hub/feed']");
      if (navLink) navLink.appendChild(el("span", { class: "nav-count" }, " " + data.count));
    }).catch(function () {});
  }

  // Birthdays: type them as numbers (DD/MM/YYYY) instead of scrolling a calendar.
  // The original date field becomes hidden and keeps the YYYY-MM-DD value the forms already send.
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  MW.parseBirthday = function (text) {
    var t = String(text || "").trim();
    var m = t.match(/^(\d{4})[\/\-. ](\d{1,2})[\/\-. ](\d{1,2})$/); // 2000-11-16
    var y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      m = t.match(/^(\d{1,2})[\/\-. ]+(\d{1,2})[\/\-. ]+(\d{4})$/) || t.match(/^(\d{2})(\d{2})(\d{4})$/); // 16/11/2000 or 16112000
      if (!m) return null;
      d = +m[1]; mo = +m[2]; y = +m[3];
    }
    var date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    if (y < 1900 || date > new Date()) return null;
    return { iso: y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0"), label: d + " " + MONTHS[mo - 1] + " " + y };
  };
  function birthdayFields() {
    document.querySelectorAll("input[type='date']#birthDate").forEach(function (orig) {
      var typed = el("input", { type: "text", id: "birthDate-typed", inputmode: "numeric", placeholder: "DD/MM/YYYY", maxlength: "10",
        autocomplete: "bday", "aria-describedby": "birthDate-said birthDate-error" });
      var said = el("p", { class: "muted birthday-said", id: "birthDate-said" }, "Day / month / year, for example 16/11/2004");
      orig.type = "hidden";
      orig.parentNode.insertBefore(typed, orig);
      orig.parentNode.insertBefore(said, orig.nextSibling);
      var label = document.querySelector("label[for='birthDate']");
      if (label) label.setAttribute("for", "birthDate-typed");
      if (orig.value) { var p0 = MW.parseBirthday(orig.value); if (p0) typed.value = orig.value.split("-").reverse().join("/"); }
      typed.addEventListener("input", function (ev) {
        var digits = typed.value.replace(/[^0-9]/g, "");
        var deleting = ev.inputType && ev.inputType.indexOf("delete") === 0;
        if (!deleting && /^\d*$/.test(typed.value.replace(/\//g, ""))) {
          var out = digits.slice(0, 2);
          if (digits.length > 2) out += "/" + digits.slice(2, 4);
          if (digits.length > 4) out += "/" + digits.slice(4, 8);
          if ((digits.length === 2 || digits.length === 4) && digits.length < 8) out += "/";
          typed.value = out;
        }
        var p = MW.parseBirthday(typed.value);
        orig.value = p ? p.iso : "";
        said.textContent = p ? "✓ " + p.label : (digits.length >= 8 ? "That date doesn't look right. Use day/month/year." : "Day / month / year, for example 16/11/2004");
        said.className = "birthday-said " + (p ? "is-good" : digits.length >= 8 ? "is-bad" : "muted");
        orig.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  }
  birthdayFields();

  // Tap a profile picture to see it full size.
  MW.viewPicture = function (url, name) {
    if (!url) return;
    var shade = el("div", { class: "pic-viewer", role: "dialog", "aria-modal": "true", "aria-label": (name || "Profile") + " picture" });
    var img = el("img", { src: url, alt: (name || "Profile") + " picture" });
    var close = el("button", { type: "button", class: "pic-viewer-close", "aria-label": "Close" }, "✕");
    shade.appendChild(img);
    shade.appendChild(close);
    if (name) shade.appendChild(el("p", { class: "pic-viewer-name" }, name));
    function done() { shade.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") done(); }
    shade.addEventListener("click", function (e) { if (e.target !== img) done(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(shade);
    close.focus();
  };
  MW.tappablePicture = function (node, url, name) {
    if (!url || !node) return node;
    node.classList.add("pic-tappable");
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-label", "View " + (name || "profile") + " picture");
    node.addEventListener("click", function () { MW.viewPicture(url, name); });
    node.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); MW.viewPicture(url, name); } });
    return node;
  };

  // "📲 Install the app": Android/desktop Chrome offer a one-tap install; iPhones get the Share-menu steps.
  var installEvent = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvent = e; addInstallItem(); installBanner(); });
  // How to install where the browser has no one-tap install button.
  function installHelp() {
    var ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) return "On iPhone: tap the Share button at the bottom of Safari, then \"Add to Home Screen\".";
    if (/android/i.test(ua)) return "On Android: open Chapterhive in Chrome, tap ⋮ (top right), then \"Install app\" or \"Add to Home screen\".";
    if (/edg\//i.test(ua)) return "On your PC (Edge): click ⋯ at the top right, then Apps → \"Install Chapterhive\".";
    if (/chrome/i.test(ua)) return "On your PC (Chrome): click the install icon at the right end of the address bar, or ⋮ → \"Save and share\" → \"Install Chapterhive\".";
    if (/safari/i.test(ua) && /mac/i.test(ua)) return "On a Mac (Safari): choose File → \"Add to Dock\".";
    return "To install on your PC, open Chapterhive in Chrome or Edge, then use the install icon in the address bar.";
  }
  function installNow(after) {
    if (installEvent) {
      installEvent.prompt();
      installEvent.userChoice.then(function () { installEvent = null; if (after) after(); });
    } else {
      MW.toast(installHelp(), false, 9000);
    }
  }
  // A slim, easy-to-spot "Get the app" bar under the header (Chapterhive pages). Hiding it keeps it away for two weeks.
  function installBanner() {
    if (!MW.isHub || isStandalone() || document.querySelector(".install-banner")) return;
    if (/^\/hub\/(login|register|verify)/.test(window.location.pathname)) return;
    try { if (Number(localStorage.getItem("ch-install-hidden") || 0) > Date.now()) return; } catch (e) { /* ignore */ }
    var header = document.querySelector(".site-header");
    if (!header) return;
    var bar = el("div", { class: "install-banner", role: "region", "aria-label": "Get the Chapterhive app" });
    bar.appendChild(el("img", { src: "/icons/icon-192.png", alt: "", width: "36", height: "36" }));
    var t = el("span", { class: "install-banner-text" });
    t.appendChild(el("strong", {}, "Get the Chapterhive app"));
    t.appendChild(el("span", {}, installEvent ? "Free, quick to open, works like an app on your phone or PC." : (/iphone|ipad|ipod/i.test(navigator.userAgent) ? "On iPhone: Share → Add to Home Screen." : "Free on your phone or PC.")));
    bar.appendChild(t);
    var go = el("button", { type: "button", class: "btn btn-small" }, installEvent ? "📲 Install" : "How?");
    go.addEventListener("click", function () { installNow(function () { bar.remove(); }); });
    var hide = el("button", { type: "button", class: "install-banner-close", "aria-label": "Hide for now" }, "×");
    hide.addEventListener("click", function () {
      bar.remove();
      try { localStorage.setItem("ch-install-hidden", String(Date.now() + 14 * 24 * 3600 * 1000)); } catch (e) { /* ignore */ }
    });
    bar.appendChild(go);
    bar.appendChild(hide);
    var after = document.querySelector(".mobile-search-bar") || header;
    after.parentNode.insertBefore(bar, after.nextSibling);
  }
  function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  function addInstallItem() {
    if (isStandalone()) return;
    var menu = document.querySelector("#menu-account ul") || document.querySelector("#site-menu ul");
    if (!menu || menu.querySelector(".install-app")) return;
    var li = el("li");
    var b = el("button", { type: "button", class: "link-button install-app" }, "📲 Install the app");
    b.addEventListener("click", function () { installNow(function () { li.remove(); }); });
    li.appendChild(b);
    menu.insertBefore(li, menu.firstChild);
  }
  // Count each installed device once: when the browser reports the install, or the first time the app opens installed.
  function deviceId() {
    var id = null;
    try { id = localStorage.getItem("ch-device"); } catch (e) { /* ignore */ }
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 14));
      try { localStorage.setItem("ch-device", id); } catch (e) { /* ignore */ }
    }
    return id;
  }
  function countInstall() {
    try { if (localStorage.getItem("ch-install-counted")) return; } catch (e) { return; }
    var platform = /android/i.test(navigator.userAgent) ? "android" : /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "desktop";
    MW.api("/app/installed", { method: "POST", json: { deviceId: deviceId(), platform: platform } }).then(function () {
      try { localStorage.setItem("ch-install-counted", "1"); } catch (e) { /* ignore */ }
    }).catch(function () {});
  }
  if (isStandalone()) countInstall();

  // Milestone pop-up: "Chapterhive has been installed 100 times!" Shown once per milestone on each device.
  function milestonePopup() {
    if (!MW.isHub || /^\/hub\/(login|register|verify)/.test(window.location.pathname)) return;
    Promise.all([MW.api("/app/stats"), MW.me().catch(function () { return null; })]).then(function (both) {
      var d = both[0], me = both[1];
      if (!d.milestone) return;
      // Only for people who haven't installed the app on this device yet; admins always see milestones.
      var isAdmin = me && me.role === "admin";
      var installedHere = isStandalone();
      try { installedHere = installedHere || Boolean(localStorage.getItem("ch-install-counted")); } catch (e) { /* ignore */ }
      if (installedHere && !isAdmin) return;
      var seen = 0;
      try { seen = Number(localStorage.getItem("ch-milestone-seen") || 0); } catch (e) { return; }
      if (seen >= d.milestone) return;
      if (document.querySelector("dialog[open], .onboard")) { setTimeout(milestonePopup, 5000); return; }
      var dialog = el("dialog", { class: "heist-dialog milestone-dialog", "aria-labelledby": "ms-title" });
      dialog.appendChild(el("div", { class: "milestone-burst", "aria-hidden": "true" }, "🎉"));
      dialog.appendChild(el("p", { class: "node-label" }, "Hive milestone"));
      dialog.appendChild(el("h2", { id: "ms-title" }, "Chapterhive has been installed " + d.milestone.toLocaleString() + " times!"));
      dialog.appendChild(el("p", { class: "milestone-count" }, d.installs.toLocaleString() + " devices and counting. Thank you for buzzing with us. 🐝"));
      var actions = el("div", { class: "form-actions" });
      if (!installedHere) {
        var get = el("button", { type: "button", class: "btn" }, "📲 Get the app too");
        get.addEventListener("click", function () { dialog.close(); installNow(); });
        actions.appendChild(get);
      }
      var ok = el("button", { type: "button", class: "btn btn-ghost" }, "Yay!");
      ok.addEventListener("click", function () { dialog.close(); });
      actions.appendChild(ok);
      dialog.appendChild(actions);
      dialog.addEventListener("close", function () {
        try { localStorage.setItem("ch-milestone-seen", String(d.milestone)); } catch (e) { /* ignore */ }
        dialog.remove();
      });
      document.body.appendChild(dialog);
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    }).catch(function () {});
  }
  setTimeout(milestonePopup, 6000);

  window.addEventListener("appinstalled", function () {
    countInstall();
    var i = document.querySelector(".install-app"); if (i) i.parentNode.remove();
    var bnr = document.querySelector(".install-banner"); if (bnr) bnr.remove();
    MW.toast("Chapterhive is installed. 🐝");
  });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()) setTimeout(function () { addInstallItem(); installBanner(); }, 1500);

  // Installable app: the service worker keeps the app shell and shows an offline page with no signal.
  if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () { /* the site works without it */ });
    });
  }

  // Buddy button (two-way friends). States: none -> sent -> buddies, or received (Accept).
  MW.buddyButton = function (username, state, onChange) {
    var wrap = el("span", { class: "buddy-actions" });
    function draw() {
      wrap.textContent = "";
      var main, extra = null;
      if (state === "buddies") main = el("button", { type: "button", class: "btn btn-small btn-ghost", title: "Tap to stop being buddies" }, "🤝 Buddies");
      else if (state === "sent") main = el("button", { type: "button", class: "btn btn-small btn-ghost", title: "Tap to cancel the request" }, "Request sent");
      else if (state === "received") {
        main = el("button", { type: "button", class: "btn btn-small" }, "Accept buddy");
        extra = el("button", { type: "button", class: "btn btn-small btn-ghost" }, "Decline");
      } else main = el("button", { type: "button", class: "btn btn-small btn-ghost" }, "＋ Add buddy");
      main.addEventListener("click", function () {
        if (state === "buddies" && !window.confirm("Stop being buddies with @" + username + "?")) return;
        if (state === "sent" && !window.confirm("Cancel your buddy request to @" + username + "?")) return;
        var del = state === "buddies" || state === "sent";
        main.disabled = true;
        MW.api("/users/" + encodeURIComponent(username) + "/buddy", { method: del ? "DELETE" : "POST" }).then(function (d) {
          state = d.state; draw(); if (onChange) onChange(state);
          if (state === "sent") MW.toast("Buddy request sent to @" + username + ".");
          if (state === "buddies") MW.toast("You and @" + username + " are buddies now. 🤝");
        }).catch(function (e) { MW.toast(e.message, true); main.disabled = false; });
      });
      wrap.appendChild(main);
      if (extra) {
        extra.addEventListener("click", function () {
          MW.api("/users/" + encodeURIComponent(username) + "/buddy/decline", { method: "POST" }).then(function (d) {
            state = d.state; draw(); if (onChange) onChange(state);
          }).catch(function (e) { MW.toast(e.message, true); });
        });
        wrap.appendChild(extra);
      }
    }
    draw();
    return wrap;
  };

  // Team announcements pop up once (newest first, only ones from the last two weeks), then live on News & updates.
  function announcementPopup() {
    if (!MW.isHub || /^\/hub\/(news|login|register|verify)/.test(window.location.pathname)) return;
    var seen = [];
    try { seen = JSON.parse(localStorage.getItem("ch-announcements-seen") || "[]"); } catch (e) { seen = []; }
    MW.api("/notifications/announcements").then(function (d) {
      var fresh = d.announcements.filter(function (a) {
        return seen.indexOf(a.id) < 0 && Date.now() - new Date(a.createdAt).getTime() < 14 * 24 * 3600 * 1000;
      });
      if (!fresh.length) return;
      // Wait for the first-visit welcome to go first.
      if (document.querySelector(".welcome-dialog[open], .onboard")) { setTimeout(announcementPopup, 4000); return; }
      var a = fresh[0];
      var dialog = el("dialog", { class: "heist-dialog announce-dialog", "aria-labelledby": "announce-title" });
      dialog.appendChild(el("p", { class: "node-label" }, "📣 " + ({ beta: "For beta testers", creators: "For creators", staff: "For staff" }[a.audience] || "From the team")));
      dialog.appendChild(el("h2", { id: "announce-title" }, a.title));
      if (a.body) a.body.split(/\n+/).forEach(function (para) { dialog.appendChild(el("p", {}, para)); });
      var actions = el("div", { class: "form-actions" });
      if (a.link) actions.appendChild(el("a", { class: "btn", href: a.link }, "Read more"));
      var all = el("a", { class: "btn btn-ghost", href: "/hub/news#announcement-" + a.id }, fresh.length > 1 ? "All updates (" + fresh.length + " new)" : "All updates");
      var ok = el("button", { type: "button", class: "btn btn-ghost" }, "Got it");
      actions.appendChild(all);
      actions.appendChild(ok);
      dialog.appendChild(actions);
      function markSeen() {
        // Seeing the newest counts as seeing the older ones too: one pop-up, not a queue of them.
        fresh.forEach(function (f) { if (seen.indexOf(f.id) < 0) seen.push(f.id); });
        try { localStorage.setItem("ch-announcements-seen", JSON.stringify(seen.slice(-200))); } catch (e) { /* ignore */ }
      }
      ok.addEventListener("click", function () { dialog.close(); });
      actions.querySelectorAll("a").forEach(function (link) { link.addEventListener("click", markSeen); });
      dialog.addEventListener("close", markSeen);
      document.body.appendChild(dialog);
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    }).catch(function () {});
  }
  setTimeout(announcementPopup, 1500);

  // A pop-up list of accounts (followers, following, buddies) with pictures and usernames.
  MW.showPeopleList = function (title, url) {
    var dialog = el("dialog", { class: "heist-dialog people-dialog", "aria-label": title });
    var head = el("div", { class: "people-dialog-head" });
    head.appendChild(el("h2", {}, title));
    var x = el("button", { type: "button", class: "btn btn-ghost btn-small", "aria-label": "Close" }, "✕");
    head.appendChild(x);
    dialog.appendChild(head);
    var box = el("div", { class: "members-list people-dialog-list" }, "Loading…");
    dialog.appendChild(box);
    document.body.appendChild(dialog);
    x.addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("close", function () { dialog.remove(); });
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    MW.api(url).then(function (d) {
      box.textContent = "";
      if (!d.people.length) { box.appendChild(el("p", { class: "muted" }, "No one here yet.")); return; }
      d.people.forEach(function (p) {
        var row = el("a", { class: "member-card", href: "/hub/u/" + encodeURIComponent(p.username) });
        row.appendChild(MW.avatar(p));
        var t = el("span", { class: "member-card-text" });
        t.appendChild(el("strong", {}, p.displayName || p.username));
        t.appendChild(el("span", { class: "muted" }, "@" + p.username + (p.isBeta ? " · 🧪 Beta tester" : "") + (p.isAdmin ? " · 👑 Founder" : "")));
        row.appendChild(t);
        box.appendChild(row);
      });
    }).catch(function (e) { box.textContent = e.message; });
  };

  // Phone notifications (like WhatsApp): ask once, then the server can send pop-ups to this device.
  function urlB64ToUint8Array(base64) {
    var padding = "=".repeat((4 - base64.length % 4) % 4);
    var raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  MW.pushSupported = function () {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
  };
  MW.pushState = function () {
    if (!MW.pushSupported()) return Promise.resolve("unsupported");
    if (Notification.permission === "denied") return Promise.resolve("blocked");
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) { return sub ? "on" : "off"; }).catch(function () { return "off"; });
  };
  MW.enablePush = function () {
    if (!MW.pushSupported()) {
      MW.toast(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "On iPhone, first add Chapterhive to your Home Screen (Share → Add to Home Screen), then turn notifications on from the app." : "This browser can't show notifications. Try Chrome or the installed app.", true, 8000);
      return Promise.resolve(false);
    }
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") { MW.toast("Notifications weren't allowed. You can allow them in your browser or phone settings.", true, 7000); return false; }
      return Promise.all([navigator.serviceWorker.ready, MW.api("/notifications/push-key")]).then(function (both) {
        var reg = both[0];
        return reg.pushManager.getSubscription().then(function (old) {
          return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(both[1].publicKey) });
        });
      }).then(function (sub) {
        return MW.api("/notifications/push-subscribe", { method: "POST", json: { subscription: sub.toJSON() } });
      }).then(function () {
        MW.toast("Phone notifications are on. 🐝");
        MW.api("/notifications/push-test", { method: "POST" }).catch(function () {});
        return true;
      });
    }).catch(function (e) { MW.toast("Couldn't turn notifications on: " + e.message, true); return false; });
  };
  MW.disablePush = function () {
    if (!MW.pushSupported()) return Promise.resolve();
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return;
      var endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () { return MW.api("/notifications/push-unsubscribe", { method: "POST", json: { endpoint: endpoint } }); });
    }).then(function () { MW.toast("Phone notifications are off on this device."); });
  };

  // Every visit: if this device allowed notifications, make sure the server still has it, and that it
  // was signed up with the server's current key. (If the key changed, old sign-ups silently stop
  // getting anything, which is why some phones got nothing once the app was closed.)
  function resyncPush() {
    if (!MW.pushSupported() || Notification.permission !== "granted") return;
    MW.me().then(function (user) {
      if (!user) return;
      return Promise.all([navigator.serviceWorker.ready, MW.api("/notifications/push-key")]).then(function (both) {
        var reg = both[0], key = urlB64ToUint8Array(both[1].publicKey);
        return reg.pushManager.getSubscription().then(function (sub) {
          var old = sub && sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
          var same = old && old.length === key.length && old.every(function (b, i) { return b === key[i]; });
          if (sub && same) return sub;
          return (sub ? sub.unsubscribe() : Promise.resolve()).then(function () {
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
          });
        });
      }).then(function (sub) {
        return MW.api("/notifications/push-subscribe", { method: "POST", json: { subscription: sub.toJSON() } });
      });
    }).catch(function () { /* the bell still works */ });
  }
  if (document.readyState === "complete") setTimeout(resyncPush, 3000);
  else window.addEventListener("load", function () { setTimeout(resyncPush, 3000); });
})();
