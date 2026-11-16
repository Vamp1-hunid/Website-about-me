// js/hub-news.js  -  news posts (/hub/news)
(function () {
  "use strict";
  var MW = window.MW;
  var list = document.getElementById("news-list");
  if (!MW || !list) return;
  // Team announcements (the same ones that pop up and go to the bell) sit at the top.
  MW.api("/notifications/announcements").then(function (d) {
    if (!d.announcements.length) return;
    var box = document.getElementById("team-news-list");
    document.getElementById("team-news").hidden = false;
    d.announcements.forEach(function (a) {
      var item = MW.el("article", { class: "team-news-item", id: "announcement-" + a.id });
      var meta = MW.formatDateTime(a.createdAt) + ({ beta: " · 🧪 for beta testers", creators: " · for creators", staff: " · 🛡️ for staff" }[a.audience] || "");
      item.appendChild(MW.el("p", { class: "mono muted" }, meta));
      item.appendChild(MW.el("h3", {}, a.title));
      if (a.body) a.body.split(/\n+/).forEach(function (para) { item.appendChild(MW.el("p", {}, para)); });
      if (a.link) item.appendChild(MW.el("a", { class: "btn btn-small btn-ghost", href: a.link }, "Read more"));
      box.appendChild(item);
    });
  }).catch(function () {});
  var page = Math.max(1, parseInt(new URLSearchParams(window.location.search).get("page"), 10) || 1);
  MW.api("/posts?site=hub&category=news&page=" + page).then(function (data) {
    list.textContent = "";
    if (!data.posts.length) list.appendChild(MW.el("p", { class: "empty" }, "No news yet."));
    data.posts.forEach(function (p) { list.appendChild(MW.newsItem(p)); });
    if (data.pages > 1) {
      document.getElementById("npage").textContent = "Page " + data.page + " of " + data.pages;
      var prev = document.getElementById("nprev"), next = document.getElementById("nnext");
      prev.hidden = data.page <= 1; prev.href = "/hub/news?page=" + (data.page - 1);
      next.hidden = data.page >= data.pages; next.href = "/hub/news?page=" + (data.page + 1);
    }
  }).catch(function (error) { list.textContent = error.message; });
})();
