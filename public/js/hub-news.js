// js/hub-news.js  -  news posts (/hub/news)
(function () {
  "use strict";
  var MW = window.MW;
  var list = document.getElementById("news-list");
  if (!MW || !list) return;
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
