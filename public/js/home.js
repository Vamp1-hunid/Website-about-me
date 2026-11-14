// js/home.js
// Home page: shows the three newest works in "Latest works",
// and how many works each "What we make" tile links to.

(function () {
  "use strict";

  var MW = window.MW;
  var box = document.getElementById("latest-works");
  if (!box || !MW || !MW.api) return;

  MW.api("/posts?page=1")
    .then(function (data) {
      MW.renderWorks(box, data.posts.slice(0, 3), "No works posted yet. Check back soon.");
    })
    .catch(function () {
      box.textContent = "";
      box.appendChild(MW.el("p", { class: "empty" }, "The works archive is offline right now. Please try again later."));
    });

  // Live counts on the "What we make" tiles.
  document.querySelectorAll("[data-count]").forEach(function (badge) {
    var category = badge.getAttribute("data-count");
    MW.api("/posts?category=" + encodeURIComponent(category))
      .then(function (data) {
        badge.textContent = data.total === 1 ? "1 work \u2192" : data.total + " works \u2192";
      })
      .catch(function () {
        badge.textContent = "Browse \u2192";
      });
  });
})();
