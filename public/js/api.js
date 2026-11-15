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

  // Which site this page belongs to: God's Banditos ("banditos") or Afterframe ("afterframe").
  MW.brand = (document.body && document.body.getAttribute("data-brand")) || "banditos";
  MW.isHub = MW.brand === "afterframe";

  // Where a work, story or character lives. On Afterframe everything opens in Afterframe's look;
  // on God's Banditos, other creators' things open on Afterframe.
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
          return data.user;
        })
        .catch(function () { return null; });
    }
    return mePromise;
  };

  // Small pop-up message.
  MW.toast = function (message, isError) {
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
    window.setTimeout(function () { toast.remove(); }, 4200);
  };

  // "2026-11-12T05:17:33Z" -> "12 Nov 2026"
  MW.formatDate = function (value) {
    var date = new Date(value);
    if (isNaN(date)) return "";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  MW.categoryName = function (category) {
    return { "story-art": "Story art", anime: "Anime works", writing: "Writing", updates: "Update", news: "Anime update" }[category] || category;
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

    if (!user) {
      var next = encodeURIComponent(MW.currentPath());
      area.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/login?next=" + next }, "Log in"));
      area.appendChild(el("a", { class: "btn btn-small", href: "/register?next=" + next }, "Join"));
      return;
    }

    var me = el("a", { class: "auth-name", href: "/profile", title: "Your profile" });
    me.appendChild(MW.avatar(user));
    me.appendChild(document.createTextNode(" @" + user.username));
    area.appendChild(me);
    if (user.role === "admin" && !MW.isHub) {
      area.appendChild(el("a", { class: "btn btn-small", href: "/admin" }, "Admin"));
    } else if (MW.isHub && (user.role === "admin" || (MW.creator && MW.creator.status === "approved"))) {
      area.appendChild(el("a", { class: "btn btn-small", href: "/hub/studio" }, "Studio"));
    }
    area.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/profile" }, "Profile"));
    var logout = el("button", { class: "btn btn-ghost btn-small", type: "button" }, "Log out");
    logout.addEventListener("click", async function () {
      logout.disabled = true;
      try {
        await MW.api("/account/logout", { method: "POST" });
      } catch (error) {
        // Even if it fails, reload so the page shows the real state.
      }
      window.location.href = "/";
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

  function buildMenu() {
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
      ["Afterframe", [["/hub", "Home"], ["/hub/creators", "Creators"], ["/hub/feed", "Following"], ["/hub/news", "Anime updates"]]],
      ["Create", [["/hub/apply", "Become a creator"], ["/legal/creator-agreement", "Creator Agreement"], ["/legal/content-rules", "Content Rules"]]],
      ["More", [["/", "God's Banditos"], ["/creator#contact", "Contact"], ["/legal/terms", "Terms"], ["/legal/privacy", "Privacy"]]]
    ] : [
      ["Explore", [["/", "Home"], ["/gallery", "All works"], ["/gallery?category=story-art", "Story art"],
        ["/gallery?category=anime", "Anime works"], ["/gallery?category=writing", "Writing"], ["/gallery?category=updates", "Updates"]]],
      ["Stories", [["/stories", "All stories"], ["/gallery?section=concept-art", "Concept art"]]],
      ["Studio", [["/products", "More products by us"], ["/creator", "Meet the creator"], ["/creator#contact", "Contact"], ["/hub", "Afterframe ↗"]]]
    ];
    var grid = el("div", { class: "menu-grid" });
    groups.forEach(function (group) {
      var col = el("div", { class: "menu-col" });
      col.appendChild(el("p", { class: "node-label" }, group[0]));
      var ul = el("ul");
      group[1].forEach(function (item) {
        var li = el("li");
        li.appendChild(el("a", { href: item[0] }, item[1]));
        ul.appendChild(li);
      });
      col.appendChild(ul);
      grid.appendChild(col);
    });
    var account = el("div", { class: "menu-col", id: "menu-account" });
    account.appendChild(el("p", { class: "node-label" }, "Account"));
    account.appendChild(el("ul"));
    grid.appendChild(account);
    menu.appendChild(grid);

    var socials = el("div", { class: "social-row menu-socials", hidden: "" });
    menu.appendChild(socials);
    header.after(menu);

    MW.me().then(function (user) {
      var ul = account.querySelector("ul");
      var items = user
        ? [["/profile", "Account settings"], ["/u/" + encodeURIComponent(user.username), "Your public page"]]
        : [["/login?next=" + encodeURIComponent(MW.currentPath()), "Log in"], ["/register", "Create a free account"]];
      var isCreator = user && (user.role === "admin" || (MW.creator && MW.creator.status === "approved"));
      if (user) items.splice(1, 0, ["/hub/feed", "Following feed"]);
      if (isCreator) {
        items.unshift(["/hub/studio#profile", "Creator profile settings"]);
        items.unshift(["/hub/studio", "Creator studio"]);
      } else if (user && MW.creator && MW.creator.status === "pending") {
        items.unshift(["/hub/apply", "Creator application (pending)"]);
      }
      if (user && user.role === "admin") {
        items.unshift(["/admin#settings", "Site settings"]);
        items.unshift(["/admin", "Dashboard"]);
      }
      items.forEach(function (item) {
        var li = el("li");
        li.appendChild(el("a", { href: item[0] }, item[1]));
        ul.appendChild(li);
      });
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
        card.appendChild(el("a", { class: "btn btn-small", href: "/creator?topic=support#contact" }, "Ask for bank details"));
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
    if (!support.enabled || document.getElementById("heist-dialog")) return;

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

  if (!MW.isHub) MW.api("/support").then(buildSupport).catch(function () {});

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
})();
