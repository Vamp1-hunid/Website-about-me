// js/members.js  -  /hub/members: find other members (readers, beta testers, creators), follow them and message them.
(function () {
  "use strict";
  var MW = window.MW;
  var list = document.getElementById("members-list");
  if (!MW || !list) return;
  var el = MW.el;
  var timer = null;

  function followButton(m) {
    var b = el("button", { type: "button", class: "btn btn-small" + (m.following ? " btn-ghost" : "") }, m.following ? "Following" : "Follow");
    b.addEventListener("click", function () {
      b.disabled = true;
      MW.api("/users/" + encodeURIComponent(m.username) + "/follow", { method: m.following ? "DELETE" : "POST" }).then(function (d) {
        m.following = d.following;
        b.textContent = m.following ? "Following" : "Follow";
        b.className = "btn btn-small" + (m.following ? " btn-ghost" : "");
      }).catch(function (e) { MW.toast(e.message, true); }).then(function () { b.disabled = false; });
    });
    return b;
  }

  function draw(members) {
    list.textContent = "";
    if (!members.length) { list.appendChild(el("p", { class: "muted" }, "No members match that yet.")); return; }
    members.forEach(function (m) {
      var card = el("div", { class: "member-card" });
      var link = el("a", { class: "member-card-who", href: "/hub/u/" + encodeURIComponent(m.username) });
      link.appendChild(MW.avatar(m));
      var t = el("span", { class: "member-card-text" });
      var name = el("strong", {}, m.displayName || m.username);
      t.appendChild(name);
      var line = "@" + m.username;
      t.appendChild(el("span", { class: "muted" }, line));
      var tags = el("span", { class: "member-card-tags" });
      if (m.isAdmin) tags.appendChild(el("span", { class: "mini-tag" }, "👑 Founder"));
      if (m.isBeta) tags.appendChild(el("span", { class: "mini-tag" }, "🧪 Beta tester"));
      if (m.creatorHandle) tags.appendChild(el("span", { class: "mini-tag" }, "✍️ Creator"));
      if (m.online) tags.appendChild(el("span", { class: "mini-tag" }, "● Online"));
      if (tags.childNodes.length) t.appendChild(tags);
      link.appendChild(t);
      card.appendChild(link);
      var acts = el("span", { class: "member-card-actions" });
      if (MW.feature("follows")) acts.appendChild(followButton(m));
      if (MW.feature("chat")) acts.appendChild(el("a", { class: "btn btn-small btn-ghost", href: "/hub/chat?with=" + encodeURIComponent(m.username) }, "💬"));
      card.appendChild(acts);
      list.appendChild(card);
    });
  }

  function load() {
    var q = document.getElementById("members-q").value.trim();
    MW.api("/users" + (q ? "?q=" + encodeURIComponent(q) : "")).then(function (d) { draw(d.members); }).catch(function (e) {
      list.textContent = "";
      if (e.status === 401) list.appendChild(MW.guestGate("Log in to find other members."));
      else list.appendChild(el("p", { class: "muted" }, e.message));
    });
  }
  document.getElementById("members-q").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(load, 250); });
  load();
})();
