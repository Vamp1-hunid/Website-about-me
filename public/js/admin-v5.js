/* public/js/admin-v5.js  -  dashboard: Reviews, Manage users, Announcements, Features and the Sponsor page editor */
(function () {
  "use strict";
  var MW = window.MW;
  var ADMIN = window.ADMIN;
  if (!MW || !ADMIN || ADMIN.mode !== "dashboard") return;
  var el = MW.el;
  var $ = function (id) { return document.getElementById(id); };

  function setPressed(groupSelector, button) {
    document.querySelectorAll(groupSelector).forEach(function (b) { b.setAttribute("aria-pressed", String(b === button)); });
  }

  /* ---------- Reviews ---------- */

  var templates = null;
  var reviewStatus = "pending";

  function setReviewBadge(n) {
    var badge = $("review-badge");
    if (!badge) return;
    badge.hidden = !n;
    badge.textContent = String(n);
  }

  function reviewCard(p) {
    var card = el("article", { class: "review-card" });
    var head = el("header");
    var title = el("h3", {}, p.title);
    head.appendChild(title);
    var meta = el("p", { class: "mono muted" }, MW.categoryName(p.category) + " · by " + p.creator.name + " (@" + p.creator.handle + ")" +
      " · sent " + MW.formatDateTime(p.submittedAt) + (p.publishAt ? " · scheduled for " + MW.formatDateTime(p.publishAt) : "") +
      (p.files ? " · " + p.files + " file" + (p.files === 1 ? "" : "s") : "") + (p.hasForm ? " · has a poll" : ""));
    head.appendChild(meta);
    if (p.firstPost) head.appendChild(el("span", { class: "status-chip is-pending" }, "First post"));
    card.appendChild(head);
    if (p.imageUrl) card.appendChild(el("img", { src: p.imageUrl, alt: "", class: "review-thumb", width: "160", loading: "lazy" }));
    if (p.logline) card.appendChild(el("p", { class: "lead" }, p.logline));
    if (p.excerpt) card.appendChild(el("div", { class: "review-body" }, p.excerpt + (p.excerpt.length >= 400 ? "…" : "")));
    var open = el("a", { href: MW.workUrl({ slug: p.slug, category: p.category, creator: p.creator }), target: "_blank", rel: "noopener", class: "btn btn-ghost btn-small" }, "Open full preview ↗");
    card.appendChild(open);
    if (p.reviewNote && reviewStatus === "declined") card.appendChild(el("p", { class: "muted" }, "Your note: " + p.reviewNote));

    if (reviewStatus !== "pending") return card;

    var form = el("form", { class: "review-form" });
    var row = el("div", { class: "fb-row" });
    var decision = el("select", { "aria-label": "Decision" });
    decision.appendChild(el("option", { value: "approve" }, "Approve"));
    decision.appendChild(el("option", { value: "decline" }, "Decline"));
    var tpl = el("select", { "aria-label": "Message template" });
    row.append(decision, tpl);
    var msg = el("textarea", { rows: "4", maxlength: "1000", "aria-label": "Message to the creator" });
    var actions = el("div", { class: "form-actions" });
    var send = el("button", { type: "submit" }, "Approve & send");
    actions.appendChild(send);
    var fb = el("p", { class: "feedback", "aria-live": "polite" });
    form.append(row, msg, actions, fb);
    card.appendChild(form);

    function fill(text) {
      return text.replace(/\{name\}/g, p.creator.name).replace(/\{title\}/g, p.title);
    }
    function fillTemplates() {
      tpl.textContent = "";
      var list = templates[decision.value] || [];
      list.forEach(function (t) { tpl.appendChild(el("option", { value: t.key }, t.label)); });
      tpl.appendChild(el("option", { value: "" }, "Write my own message"));
      if (decision.value === "approve" && p.firstPost) tpl.value = "welcome-first";
      useTemplate();
      send.textContent = decision.value === "approve" ? "Approve & send" : "Decline & send";
      send.className = decision.value === "approve" ? "" : "btn-danger";
    }
    function useTemplate() {
      var t = (templates[decision.value] || []).filter(function (x) { return x.key === tpl.value; })[0];
      msg.value = t ? fill(t.text) : "";
      msg.placeholder = t ? "" : "Write your message to " + p.creator.name + "…";
    }
    decision.addEventListener("change", fillTemplates);
    tpl.addEventListener("change", useTemplate);
    fillTemplates();

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (decision.value === "decline" && !msg.value.trim()) { fb.className = "feedback feedback-error"; fb.textContent = "Tell the creator what to change."; return; }
      send.disabled = true;
      MW.api("/admin/reviews/" + p.id, { method: "POST", json: { decision: decision.value, message: msg.value.trim() } }).then(function () {
        MW.toast((decision.value === "approve" ? "Approved: " : "Declined: ") + p.title);
        card.remove();
        loadReviews();
      }).catch(function (e) {
        fb.className = "feedback feedback-error";
        fb.textContent = e.message;
        send.disabled = false;
      });
    });
    return card;
  }

  function loadReviews() {
    var list = $("review-list");
    var go = templates ? Promise.resolve() : MW.api("/admin/review-templates").then(function (t) { templates = t; });
    go.then(function () { return MW.api("/admin/reviews?status=" + reviewStatus); }).then(function (d) {
      list.textContent = "";
      if (reviewStatus === "pending") setReviewBadge(d.reviews.length);
      if (!d.reviews.length) {
        list.appendChild(el("p", { class: "muted" }, reviewStatus === "pending" ? "Nothing waiting. All caught up! 🎉" : "No declined posts."));
        return;
      }
      d.reviews.forEach(function (p) { list.appendChild(reviewCard(p)); });
    }).catch(function (e) { list.textContent = e.message; });
  }
  document.querySelectorAll("#review-filters [data-rstatus]").forEach(function (b) {
    b.addEventListener("click", function () {
      reviewStatus = b.getAttribute("data-rstatus");
      setPressed("#review-filters [data-rstatus]", b);
      loadReviews();
    });
  });
  ADMIN.onShow("reviews", loadReviews);
  ADMIN.onReady(function () {
    MW.api("/admin/reviews?status=pending").then(function (d) { setReviewBadge(d.reviews.length); }).catch(function () {});
  });

  /* ---------- Manage users ---------- */

  var usersPage = 1;

  function standingChip(u) {
    if (u.status === "active") return null;
    var label = u.status === "banned" ? "Banned" : "Suspended" + (u.suspendedUntil ? " until " + MW.formatDate(u.suspendedUntil) : "");
    return el("span", { class: "status-chip is-" + u.status, title: u.statusReason || "" }, label);
  }

  function userPosts(row, u, filter) {
    var box = row.querySelector(".user-posts") || row.appendChild(el("div", { class: "user-posts" }));
    box.textContent = "Loading…";
    MW.api("/admin/users/" + u.id + "/posts?filter=" + filter).then(function (d) {
      box.textContent = "";
      var label = { scheduled: "Scheduled posts", pending: "Waiting for approval", drafts: "Drafts", all: "All posts" }[filter];
      box.appendChild(el("p", { class: "node-label" }, label + " (" + d.posts.length + ")"));
      if (!d.posts.length) { box.appendChild(el("p", { class: "muted" }, "None.")); return; }
      var ul = el("ul", { class: "admin-list" });
      d.posts.forEach(function (p) {
        var li = el("li");
        li.appendChild(el("a", { href: MW.workUrl({ slug: p.slug, category: p.category, creator: u.creator }), target: "_blank", rel: "noopener" }, p.title));
        li.appendChild(document.createTextNode(" · " + MW.categoryName(p.category) + " · " + ADMIN.statusText(p).toLowerCase() + (p.status === "live" ? "live" : "")));
        if (p.status === "pending") {
          li.appendChild(document.createTextNode(" "));
          li.appendChild(ADMIN.button("Review", function () { ADMIN.show("reviews"); }, true));
        }
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }).catch(function (e) { box.textContent = e.message; });
  }

  function standingForm(row, u, status) {
    var box = row.querySelector(".user-posts") || row.appendChild(el("div", { class: "user-posts" }));
    box.textContent = "";
    var f = el("form", { class: "fb-row" });
    var days = null;
    if (status === "suspended") {
      days = el("select", { "aria-label": "How long" });
      [["1", "1 day"], ["3", "3 days"], ["7", "7 days"], ["14", "14 days"], ["30", "30 days"], ["", "Until I lift it"]].forEach(function (o) { days.appendChild(el("option", { value: o[0] }, o[1])); });
      days.value = "7";
      f.appendChild(days);
    }
    var reason = el("input", { type: "text", maxlength: "300", placeholder: "Reason (shown to them)", "aria-label": "Reason" });
    var go = el("button", { type: "submit", class: "btn-small btn-danger" }, status === "banned" ? "Ban " + u.username : "Suspend");
    var cancel = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Cancel");
    cancel.addEventListener("click", function () { box.remove(); });
    f.append(reason, go, cancel);
    box.appendChild(f);
    reason.focus();
    f.addEventListener("submit", function (event) {
      event.preventDefault();
      go.disabled = true;
      MW.api("/admin/users/" + u.id + "/standing", { method: "POST", json: { status: status, days: days && days.value ? Number(days.value) : null, reason: reason.value.trim() } })
        .then(function () { MW.toast(u.username + (status === "banned" ? " banned" : " suspended")); loadUsers(usersPage); })
        .catch(function (e) { MW.toast(e.message, true); go.disabled = false; });
    });
  }

  function userRow(u) {
    var row = el("div", { class: "user-row" });
    var info = el("div");
    var name = el("p");
    name.appendChild(MW.avatar(u, 28));
    name.appendChild(el("strong", {}, " " + u.displayName + " "));
    name.appendChild(el("a", { href: "/u/" + encodeURIComponent(u.username), target: "_blank", rel: "noopener" }, "@" + u.username));
    if (u.role === "admin") name.appendChild(el("span", { class: "sticker" }, "Admin"));
    if (u.creator) name.appendChild(el("span", { class: "sticker" }, "Creator" + (u.creator.status !== "approved" ? " (" + u.creator.status + ")" : "")));
    if (u.isBeta) name.appendChild(el("span", { class: "sticker" }, "Beta tester"));
    var chip = standingChip(u);
    if (chip) name.appendChild(chip);
    info.appendChild(name);
    info.appendChild(el("p", { class: "mono muted" }, "Joined " + MW.formatDate(u.joined) + (u.lastSeen ? " · seen " + (MW.timeAgo ? MW.timeAgo(u.lastSeen) : MW.formatDate(u.lastSeen)) : "") +
      " · " + u.posts + " posts · " + u.pending + " waiting · " + u.scheduled + " scheduled · " + u.followers + " followers · streak " + (u.streak || 0) + (u.email ? " · " + u.email : "")));
    if (u.statusReason && u.status !== "active") info.appendChild(el("p", { class: "muted" }, "Reason: " + u.statusReason));
    row.appendChild(info);

    var actions = el("div", { class: "user-actions" });
    actions.appendChild(ADMIN.button("Scheduled posts", function () { userPosts(row, u, "scheduled"); }, true));
    actions.appendChild(ADMIN.button("Pending approval", function () { userPosts(row, u, "pending"); }, true));
    actions.appendChild(ADMIN.button("All posts", function () { userPosts(row, u, "all"); }, true));
    if (u.role !== "admin") {
      if (u.status === "active") {
        actions.appendChild(ADMIN.button("Suspend", function () { standingForm(row, u, "suspended"); }, true));
        var ban = el("button", { type: "button", class: "btn btn-small btn-danger" }, "Ban");
        ban.addEventListener("click", function () { standingForm(row, u, "banned"); });
        actions.appendChild(ban);
      } else {
        actions.appendChild(ADMIN.button("Reactivate", function () {
          MW.api("/admin/users/" + u.id + "/standing", { method: "POST", json: { status: "active" } })
            .then(function () { MW.toast(u.username + " reactivated"); loadUsers(usersPage); })
            .catch(function (e) { MW.toast(e.message, true); });
        }));
      }
      actions.appendChild(ADMIN.button(u.isBeta ? "Remove beta tester" : "Make beta tester", function () {
        MW.api("/admin/users/" + u.id + "/beta", { method: "POST", json: { isBeta: !u.isBeta } })
          .then(function () { loadUsers(usersPage); })
          .catch(function (e) { MW.toast(e.message, true); });
      }, true));
    }
    row.appendChild(actions);
    return row;
  }

  function loadUsers(page) {
    usersPage = page;
    var list = $("user-list");
    var q = $("us-q").value.trim();
    var status = $("us-status").value;
    MW.api("/admin/users?page=" + page + (q ? "&q=" + encodeURIComponent(q) : "") + (status ? "&status=" + status : "")).then(function (d) {
      list.textContent = "";
      if (!d.users.length) list.appendChild(el("p", { class: "muted" }, "No one matches."));
      d.users.forEach(function (u) { list.appendChild(userRow(u)); });
      var pages = d.pages || 1;
      $("users-page").textContent = pages > 1 ? "Page " + page + " of " + pages : "";
      $("users-prev").hidden = page <= 1;
      $("users-next").hidden = page >= pages;
    }).catch(function (e) { list.textContent = e.message; });
  }
  $("user-search").addEventListener("submit", function (event) { event.preventDefault(); loadUsers(1); });
  $("us-status").addEventListener("change", function () { loadUsers(1); });
  $("users-prev").addEventListener("click", function () { loadUsers(usersPage - 1); });
  $("users-next").addEventListener("click", function () { loadUsers(usersPage + 1); });
  ADMIN.onShow("users", function () { loadUsers(1); });

  /* ---------- Announcements ---------- */

  function loadAnnouncements() {
    var list = $("announce-list");
    MW.api("/admin/announcements").then(function (d) {
      list.textContent = "";
      if (!d.announcements.length) ADMIN.emptyRow(list, "No announcements yet.");
      d.announcements.forEach(function (a) {
        list.appendChild(ADMIN.listItem({
          title: a.title,
          meta: MW.formatDateTime(a.created_at) + " · " + (a.audience === "creators" ? "creators" : "everyone") + (a.body ? " · " + a.body.slice(0, 80) : ""),
          actions: [ADMIN.confirmButton("Delete", function () {
            return MW.api("/admin/announcements/" + a.id, { method: "DELETE" }).then(loadAnnouncements);
          })]
        }));
      });
    }).catch(function (e) { ADMIN.emptyRow(list, e.message); });
  }
  $("announce-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var fb = $("an-feedback");
    var payload = { title: $("an-title").value.trim(), body: $("an-body").value.trim(), link: $("an-link").value.trim(), audience: $("an-audience").value };
    if (!payload.title) { fb.className = "feedback feedback-error"; fb.textContent = "Give it a title."; return; }
    MW.api("/admin/announcements", { method: "POST", json: payload }).then(function () {
      event.target.reset();
      fb.className = "feedback feedback-success";
      fb.textContent = "Sent. It's in everyone's bell now (if the bell feature is on for them).";
      loadAnnouncements();
    }).catch(function (e) { fb.className = "feedback feedback-error"; fb.textContent = e.message; });
  });
  ADMIN.onShow("announce", loadAnnouncements);

  /* ---------- Features (feature flags) ---------- */

  var AUDIENCES = [["off", "Off"], ["admin", "Only me"], ["beta", "Beta testers"], ["everyone", "Everyone"]];
  function loadFlags() {
    var list = $("flag-list");
    MW.api("/admin/flags").then(function (d) {
      list.textContent = "";
      d.flags.forEach(function (f) {
        var row = el("div", { class: "flag-row" });
        var info = el("div");
        info.appendChild(el("strong", {}, f.label));
        info.appendChild(el("p", { class: "muted" }, f.description));
        row.appendChild(info);
        var sel = el("select", { "aria-label": "Who sees " + f.label });
        AUDIENCES.forEach(function (a) { sel.appendChild(el("option", { value: a[0] }, a[1])); });
        sel.value = f.audience;
        sel.addEventListener("change", function () {
          MW.api("/admin/flags/" + f.key, { method: "PUT", json: { audience: sel.value } })
            .then(function () { MW.toast(f.label + ": " + sel.options[sel.selectedIndex].textContent); })
            .catch(function (e) { MW.toast(e.message, true); sel.value = f.audience; });
        });
        row.appendChild(sel);
        list.appendChild(row);
      });
    }).catch(function (e) { list.textContent = e.message; });
  }
  ADMIN.onShow("features", loadFlags);

  /* ---------- Sponsor page editor (Settings) ---------- */

  var spForm = $("sponsor-form");
  function tierRow(t) {
    t = t || {};
    var li = el("li", { class: "support-method" });
    var name = el("input", { type: "text", maxlength: "60", placeholder: "Name, e.g. Sponsor a creator", "aria-label": "Option name", class: "tier-name" });
    var price = el("input", { type: "text", maxlength: "40", placeholder: "Price (optional)", "aria-label": "Price", class: "tier-price" });
    var perks = el("textarea", { rows: "2", maxlength: "600", placeholder: "What they get", "aria-label": "What they get", class: "tier-perks" });
    name.value = t.name || ""; price.value = t.price || ""; perks.value = t.perks || "";
    var remove = el("button", { type: "button", class: "link-button" }, "Remove");
    remove.addEventListener("click", function () { li.remove(); });
    li.append(name, price, perks, remove);
    $("sp-tiers-in").appendChild(li);
  }
  if (spForm) {
    $("sp-tier-add").addEventListener("click", function () { tierRow(); });
    ADMIN.onShow("settings", function () {
      MW.api("/admin/sponsor").then(function (d) {
        var s = d.sponsor, c = s.contact || {};
        $("sp-headline-in").value = s.headline || "";
        $("sp-pitch-in").value = s.pitch || "";
        $("sp-stats-in").checked = s.showStats !== false;
        $("sp-tiers-in").textContent = "";
        (s.tiers || []).forEach(tierRow);
        ["name", "role", "email", "phone", "whatsapp", "linkedin", "website"].forEach(function (k) { $("spc-" + k).value = c[k] || ""; });
      }).catch(function () {});
    });
    spForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var fb = $("sp-feedback");
      var contact = {};
      ["name", "role", "email", "phone", "whatsapp", "linkedin", "website"].forEach(function (k) { contact[k] = $("spc-" + k).value.trim(); });
      var tiers = Array.prototype.map.call($("sp-tiers-in").children, function (li) {
        return { name: li.querySelector(".tier-name").value, price: li.querySelector(".tier-price").value, perks: li.querySelector(".tier-perks").value };
      });
      MW.api("/admin/sponsor", { method: "PUT", json: { headline: $("sp-headline-in").value, pitch: $("sp-pitch-in").value, showStats: $("sp-stats-in").checked, tiers: tiers, contact: contact } })
        .then(function () { fb.className = "feedback feedback-success"; fb.textContent = "Saved. "; fb.appendChild(el("a", { href: "/hub/sponsor" }, "View the page")); })
        .catch(function (e) { fb.className = "feedback feedback-error"; fb.textContent = e.message; });
    });
  }

  /* ---------- Overview: pending reviews ---------- */
  ADMIN.onShow("overview", function () {
    MW.api("/admin/overview").then(function (o) {
      if (!o.pendingReviews) return;
      var stats = $("overview-stats");
      if (!stats || stats.querySelector("[data-reviews]")) return;
      var box = el("div", { class: "stat stat-link", "data-reviews": "1" });
      box.appendChild(el("dt", {}, "Posts to review"));
      box.appendChild(el("dd", {}, String(o.pendingReviews)));
      box.addEventListener("click", function () { ADMIN.show("reviews"); });
      stats.insertBefore(box, stats.firstChild);
    }).catch(function () {});
  });
})();
