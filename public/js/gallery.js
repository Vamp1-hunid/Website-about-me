// js/gallery.js
// Works page: lists works, filtered by ?category= and split into pages with ?page=.

(function () {
  "use strict";

  var MW = window.MW;
  var grid = document.getElementById("works-grid");
  if (!grid) return;

  var params = new URLSearchParams(window.location.search);
  var category = params.get("category") || "";
  var page = Math.max(1, parseInt(params.get("page"), 10) || 1);

  // Highlight the active filter button.
  document.querySelectorAll("[data-filter]").forEach(function (link) {
    if (link.getAttribute("data-filter") === category) link.setAttribute("aria-pressed", "true");
  });

  if (category) {
    document.title = MW.categoryName(category) + " | Mulenga Mwamba";
  }

  function pageUrl(number) {
    var next = new URLSearchParams();
    if (category) next.set("category", category);
    if (number > 1) next.set("page", String(number));
    var query = next.toString();
    return "/gallery" + (query ? "?" + query : "");
  }

  var query = "/posts?page=" + page + (category ? "&category=" + encodeURIComponent(category) : "");

  MW.api(query)
    .then(function (data) {
      MW.renderWorks(grid, data.posts, category ? "Nothing in " + MW.categoryName(category) + " yet." : "No works posted yet.");

      if (data.pages > 1) {
        document.getElementById("pager").hidden = false;
        document.getElementById("page-info").textContent = "Page " + data.page + " of " + data.pages;
        var prev = document.getElementById("prev-page");
        var next = document.getElementById("next-page");
        prev.hidden = data.page <= 1;
        next.hidden = data.page >= data.pages;
        prev.href = pageUrl(data.page - 1);
        next.href = pageUrl(data.page + 1);
      }
    })
    .catch(function (error) {
      grid.textContent = "";
      grid.appendChild(MW.el("p", { class: "empty" }, error.message));
    });
})();
