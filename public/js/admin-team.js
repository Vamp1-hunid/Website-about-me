// js/admin-team.js  -  Dashboard → Team & powers (owner only).
// A list of everyone (search, filter: everyone / the team / beta testers / creators). Each person has a row of
// power chips: tap a chip to give or take that power (saved straight away), or pick a ready-made set
// ("Moderator", "Reviewer" …). Full admins can have their admin rights removed here too.
(function () {
  "use strict";
  var MW = window.MW;
  var ADMIN = window.ADMIN;
  var box = document.getElementById("team-people");
  if (!MW || !ADMIN || !box) return;
  var el = MW.el;

  var ICONS = { approve_posts: "✅", approve_creators: "🎨", approve_beta: "🧪", manage_reservations: "🐝",
    handle_reports: "🚩", moderate_users: "🔨", post_updates: "📣", view_members: "👥" };
  var SHORT = { approve_posts: "Posts", approve_creators: "Creators", approve_beta: "Beta testers", manage_reservations: "Reservations",
    handle_reports: "Reports", moderate_users: "Moderate", post_updates: "Updates", view_members: "Members list" };
  // Ready-made sets of powers.
  var SETS = [
    ["Moderator", ["handle_reports", "moderate_users"]],
    ["Reviewer", ["approve_posts", "approve_creators"]],
    ["Community helper", ["approve_beta", "manage_reservations", "post_updates"]],
    ["Every staff power", null]
  ];
  var powers = [];
  var state = { q: "", filter: "all", page: 1 };
  var loadNo = 0; // only the newest search/filter result is shown

  function save(person, list, row) {
    row.classList.add("is-saving");
    return MW.api("/admin/staff/" + encodeURIComponent(person.username), { method: "PUT", json: { powers: list } }).then(function (r) {
      person.powers = r.powers;
      drawRow(row, person);
      MW.toast(r.powers.length ? "@" + person.username + ": " + r.powers.map(function (k) { return SHORT[k] || k; }).join(", ") + "."
        : "@" + person.username + " has no staff powers now.");
    }).catch(function (e) { MW.toast(e.message, true); drawRow(row, person); });
  }

  function drawRow(row, p) {
    row.className = "team-row" + (p.powers.length ? " has-powers" : "") + (p.isAdmin ? " is-admin" : "");
    row.textContent = "";
    var head = el("div", { class: "team-row-head" });
    head.appendChild(MW.avatar(p));
    var who = el("a", { class: "team-row-name", href: "/hub/u/" + encodeURIComponent(p.username), target: "_blank", rel: "noopener" });
    who.appendChild(el("strong", {}, p.displayName || p.username));
    who.appendChild(el("span", { class: "muted" }, "@" + p.username));
    head.appendChild(who);
    var tags = el("span", { class: "team-row-tags" });
    if (p.isOwner) tags.appendChild(el("span", { class: "mini-tag" }, "👑 Owner"));
    else if (p.isAdmin) tags.appendChild(el("span", { class: "mini-tag" }, "⚠️ Full admin"));
    else if (p.powers.length) tags.appendChild(el("span", { class: "mini-tag" }, "🛡️ Staff"));
    if (p.isBeta) tags.appendChild(el("span", { class: "mini-tag", title: "Beta tester" }, "🧪"));
    if (p.isCreator) tags.appendChild(el("span", { class: "mini-tag", title: "Creator" }, "✍️"));
    if (p.status && p.status !== "active") tags.appendChild(el("span", { class: "mini-tag" }, p.status));
    head.appendChild(tags);
    row.appendChild(head);

    if (p.isOwner) { row.appendChild(el("p", { class: "muted team-note" }, "Every power, always.")); return; }
    if (p.isAdmin) {
      var note = el("p", { class: "muted team-note" }, "Full admin: can do everything except change powers. ");
      var rm = el("button", { type: "button", class: "btn btn-danger btn-small" }, "Remove full admin rights");
      rm.addEventListener("click", function () {
        if (!window.confirm("Remove full admin rights from @" + p.username + "? They will be signed out.")) return;
        MW.api("/admin/staff/" + encodeURIComponent(p.username) + "/remove-admin", { method: "POST" }).then(function () {
          MW.toast("@" + p.username + " is no longer an admin.");
          p.isAdmin = false; drawRow(row, p);
        }).catch(function (e) { MW.toast(e.message, true); });
      });
      note.appendChild(rm);
      row.appendChild(note);
      return;
    }

    // Power chips: tap to give or take, saved straight away.
    var chips = el("div", { class: "power-chips", role: "group", "aria-label": "Powers for @" + p.username });
    powers.forEach(function (pw) {
      var on = p.powers.indexOf(pw.key) >= 0;
      var chip = el("button", { type: "button", class: "power-chip" + (on ? " is-on" : ""), "aria-pressed": String(on),
        title: pw.label + ": " + pw.description }, (ICONS[pw.key] || "•") + " " + (SHORT[pw.key] || pw.label));
      chip.addEventListener("click", function () {
        var list = p.powers.slice();
        var i = list.indexOf(pw.key);
        if (i >= 0) list.splice(i, 1); else list.push(pw.key);
        save(p, list, row);
      });
      chips.appendChild(chip);
    });
    row.appendChild(chips);

    var tools = el("div", { class: "team-row-tools" });
    var set = el("select", { "aria-label": "Give @" + p.username + " a set of powers", class: "power-set" });
    set.appendChild(el("option", { value: "" }, "Give a set of powers…"));
    SETS.forEach(function (s, i) { set.appendChild(el("option", { value: String(i) }, s[0])); });
    set.addEventListener("change", function () {
      if (set.value === "") return;
      var chosen = SETS[Number(set.value)];
      var list = chosen[1] || powers.map(function (pw) { return pw.key; });
      // A set adds to what they already have.
      list = p.powers.concat(list.filter(function (k) { return p.powers.indexOf(k) < 0; }));
      save(p, list, row);
    });
    tools.appendChild(set);
    if (p.powers.length) {
      var none = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Take all powers away");
      none.addEventListener("click", function () {
        if (!window.confirm("Take every staff power away from @" + p.username + "?")) return;
        save(p, [], row);
      });
      tools.appendChild(none);
    }
    row.appendChild(tools);
  }

  function load(append) {
    var list = document.getElementById("team-people");
    var more = document.getElementById("team-more");
    var count = document.getElementById("team-count");
    if (!append) { state.page = 1; list.textContent = ""; list.appendChild(el("p", { class: "muted" }, "Loading…")); }
    var mine = ++loadNo;
    var params = "?q=" + encodeURIComponent(state.q) + "&filter=" + state.filter + "&page=" + state.page;
    Promise.all([powers.length ? null : MW.api("/admin/staff"), MW.api("/admin/staff/people" + params)]).then(function (r) {
      if (r[0]) powers = r[0].powers;
      if (mine !== loadNo) return; // a newer search or filter has started
      var d = r[1];
      if (!append) list.textContent = "";
      count.textContent = d.total + (d.total === 1 ? " person" : " people");
      if (!d.people.length && !append) list.appendChild(el("p", { class: "muted" }, state.q ? "No one matches \"" + state.q + "\"." : "No one here yet."));
      d.people.forEach(function (p) {
        var row = el("div");
        drawRow(row, p);
        list.appendChild(row);
      });
      more.hidden = d.page >= d.pages;
    }).catch(function (e) { list.textContent = e.message; });
  }

  // Search and filters
  var timer = null;
  document.getElementById("team-search").addEventListener("input", function (e) {
    clearTimeout(timer);
    timer = setTimeout(function () { state.q = e.target.value.trim().replace(/^@/, ""); load(false); }, 250);
  });
  document.querySelectorAll("#team-filters [data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.filter = b.getAttribute("data-filter");
      document.querySelectorAll("#team-filters [data-filter]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      load(false);
    });
  });
  document.getElementById("team-more").addEventListener("click", function () { state.page++; load(true); });

  // Opened from 👥 All members ("🛡️ Powers" on a row): start with that person already searched.
  var who = new URLSearchParams(window.location.search).get("who");
  if (who) { state.q = who.replace(/^@/, "").slice(0, 40); document.getElementById("team-search").value = "@" + state.q; }

  ADMIN.onShow("team", function () { load(false); });
})();
