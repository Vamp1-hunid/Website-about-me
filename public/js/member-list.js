// js/member-list.js  -  /hub/member-list: "👥 All members" (owner, or anyone the owner gives the "Members list" power).
// Everyone on Chapterhive with search, filters and sorting. "Relevance" puts the closest name matches first,
// then the team, creators, beta testers and the most followed / active members.
// The owner also gets a "🛡️ Powers" button on each row that opens Team & powers for that person.
(function () {
  "use strict";
  var MW = window.MW;
  var list = document.getElementById("ml-list");
  if (!MW || !list) return;
  var el = MW.el;
  var state = { q: "", filter: "all", sort: "relevance", page: 1 };
  var loadNo = 0;
  var isOwner = false;

  function seen(date) {
    if (!date) return "never seen";
    return "seen " + (MW.timeAgo ? MW.timeAgo(date) : MW.formatDate(date));
  }

  function row(p) {
    var r = el("div", { class: "team-row member-row" + (p.isOwner || p.isAdmin || p.isStaff ? " has-powers" : "") });
    var head = el("div", { class: "team-row-head" });
    head.appendChild(MW.avatar(p));
    var who = el("a", { class: "team-row-name", href: "/hub/u/" + encodeURIComponent(p.username) });
    who.appendChild(el("strong", {}, p.displayName || p.username));
    who.appendChild(el("span", { class: "muted" }, "@" + p.username + (p.creatorHandle && p.creatorHandle !== p.username ? " · ✍️ " + p.creatorHandle : "")));
    head.appendChild(who);
    var tags = el("span", { class: "team-row-tags" });
    if (p.isOwner) tags.appendChild(el("span", { class: "mini-tag" }, "👑 Owner"));
    else if (p.isAdmin) tags.appendChild(el("span", { class: "mini-tag" }, "⚠️ Admin"));
    else if (p.isStaff) tags.appendChild(el("span", { class: "mini-tag" }, "🛡️ Staff"));
    if (p.creatorHandle) tags.appendChild(el("span", { class: "mini-tag", title: "Creator" }, "✍️ Creator"));
    if (p.isBeta) tags.appendChild(el("span", { class: "mini-tag", title: "Beta tester" }, "🧪 Beta"));
    if (p.status && p.status !== "active") tags.appendChild(el("span", { class: "mini-tag mini-tag-warn" }, "⛔ " + p.status));
    head.appendChild(tags);
    r.appendChild(head);
    var facts = [
      "Joined " + MW.formatDate(p.joined),
      seen(p.lastSeenAt),
      p.followers + (p.followers === 1 ? " follower" : " followers")
    ];
    if (p.posts) facts.push(p.posts + (p.posts === 1 ? " post" : " posts"));
    if (p.streak > 1) facts.push("🔥 " + p.streak + "-day streak");
    var foot = el("div", { class: "member-row-foot" });
    foot.appendChild(el("p", { class: "mono muted member-facts" }, facts.join(" · ")));
    var acts = el("span", { class: "member-row-acts" });
    acts.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/hub/u/" + encodeURIComponent(p.username) }, "Profile"));
    if (isOwner && !p.isOwner) {
      acts.appendChild(el("a", { class: "btn btn-small", href: MW.adminUrl("?who=" + encodeURIComponent(p.username) + "#team") }, "🛡️ Powers"));
    }
    foot.appendChild(acts);
    r.appendChild(foot);
    return r;
  }

  function load(append) {
    var more = document.getElementById("ml-more");
    if (!append) { state.page = 1; list.textContent = ""; list.appendChild(el("p", { class: "muted" }, "Loading…")); }
    var mine = ++loadNo;
    MW.api("/admin/members?q=" + encodeURIComponent(state.q) + "&filter=" + state.filter + "&sort=" + state.sort + "&page=" + state.page)
      .then(function (d) {
        if (mine !== loadNo) return; // a newer search has started
        if (!append) list.textContent = "";
        document.getElementById("ml-stats").textContent = d.counts.everyone + " members · " + d.counts.newThisWeek + " new this week · " + d.counts.activeToday + " active today";
        document.getElementById("ml-count").textContent = "Showing " + d.total + (d.total === 1 ? " member" : " members");
        if (!d.people.length && !append) list.appendChild(el("p", { class: "muted" }, state.q ? "No one matches \"" + state.q + "\"." : "No one here."));
        d.people.forEach(function (p) { list.appendChild(row(p)); });
        more.hidden = d.page >= d.pages;
      })
      .catch(function (e) {
        list.textContent = "";
        var lock = document.getElementById("ml-locked");
        lock.hidden = false;
        lock.textContent = e.status === 401 ? "Log in to see this page." : "Only the owner (and people the owner allows) can see the full members list.";
        document.getElementById("ml-tools").hidden = true;
      });
  }

  var timer = null;
  document.getElementById("ml-q").addEventListener("input", function (e) {
    clearTimeout(timer);
    timer = setTimeout(function () { state.q = e.target.value.trim().replace(/^@/, ""); load(false); }, 250);
  });
  document.querySelectorAll("#ml-filters [data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.filter = b.getAttribute("data-filter");
      document.querySelectorAll("#ml-filters [data-filter]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      load(false);
    });
  });
  document.getElementById("ml-sort").addEventListener("change", function (e) { state.sort = e.target.value; load(false); });
  document.getElementById("ml-more").addEventListener("click", function () { state.page++; load(true); });

  MW.me().then(function (user) {
    if (!user) {
      var lock = document.getElementById("ml-locked");
      lock.hidden = false; lock.textContent = "Log in to see this page.";
      return;
    }
    isOwner = Boolean(MW.account && MW.account.isOwner);
    document.getElementById("ml-tools").hidden = false;
    load(false);
  });
})();
