// js/home.js
// Home page: shows the three newest works in the "Latest works" section.

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
})();
