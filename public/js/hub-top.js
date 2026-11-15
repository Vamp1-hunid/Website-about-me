// js/hub-top.js  -  /hub/top: the top 10 creators overall and the top 5 in each shelf.
(function () {
  "use strict";
  var MW = window.MW;
  var overall = document.getElementById("top-overall");
  if (!MW || !overall) return;
  var el = MW.el;
  var ORDER = ["books", "comics", "art", "video", "music", "writing", "comedy"];

  function row(r) {
    var li = el("li", { class: "top-row rank-" + r.rank });
    var a = el("a", { href: "/hub/c/" + encodeURIComponent(r.handle) });
    a.appendChild(el("span", { class: "top-rank" }, r.rank === 1 ? "👑" : "#" + r.rank));
    var pic = el("span", { class: "feed-avatar" });
    if (r.avatarUrl) pic.appendChild(el("img", { src: r.avatarUrl, alt: "" })); else pic.textContent = (r.name || "?").charAt(0);
    a.appendChild(pic);
    var t = el("span", { class: "feed-names" });
    t.appendChild(el("strong", {}, r.name));
    t.appendChild(el("span", { class: "muted" }, r.tagline || "@" + r.handle));
    a.appendChild(t);
    a.appendChild(el("span", { class: "rank-badge tier-" + r.badge.tier }, r.badge.icon + " " + r.badge.label));
    li.appendChild(a);
    return li;
  }

  Promise.all([MW.me(), MW.api("/hub/top")]).then(function (res) {
    var user = res[0], d = res[1];
    document.getElementById("top-updated").textContent = d.updatedAt ? "Updated " + MW.formatDateTime(d.updatedAt) + " · refreshed every 30 minutes" : "Rankings appear once creators start getting likes and follows.";
    var o = d.boards.overall || [];
    if (!o.length) overall.appendChild(el("li", { class: "muted" }, "No rankings yet. Like, save and follow the creators you love to lift them up!"));
    o.forEach(function (r) { overall.appendChild(row(r)); });
    var box = document.getElementById("top-scopes");
    ORDER.forEach(function (scope) {
      var list = d.boards[scope] || [];
      var panel = el("section", { class: "panel" });
      panel.appendChild(el("h2", {}, "🐝 Top 5 in " + d.names[scope]));
      var ol = el("ol", { class: "top-list" });
      if (!list.length) ol.appendChild(el("li", { class: "muted" }, "Nobody yet. This spot is waiting for you!"));
      list.forEach(function (r) { ol.appendChild(row(r)); });
      panel.appendChild(ol);
      box.appendChild(panel);
    });
    if (user && user.role === "admin") {
      var b = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Recalculate now");
      b.addEventListener("click", function () {
        b.disabled = true;
        MW.api("/hub/top/refresh", { method: "POST" }).then(function () { window.location.reload(); }).catch(function (e) { MW.toast(e.message, true); b.disabled = false; });
      });
      document.getElementById("top-admin").appendChild(b);
    }
  }).catch(function (e) { overall.textContent = e.message; });
})();
