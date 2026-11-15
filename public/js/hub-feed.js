// js/hub-feed.js  -  the Following feed (/hub/feed)
(function () {
  "use strict";
  var MW = window.MW;
  var grid = document.getElementById("feed");
  if (!MW || !grid) return;
  var el = MW.el;
  var page = 1;

  function load() {
    MW.api("/hub/feed?page=" + page).then(function (data) {
      if (page === 1) grid.textContent = "";
      if (page === 1 && !data.posts.length) {
        grid.appendChild(el("p", { class: "empty" }, "Nothing yet. Follow some creators and their new releases will appear here."));
      }
      data.posts.forEach(function (p) {
        var card = MW.workCard(p);
        if (p.isNew) card.querySelector(".counts").appendChild(el("span", { class: "draft-flag" }, "NEW"));
        grid.appendChild(card);
      });
      document.getElementById("feed-more").hidden = !data.hasMore;
    }).catch(function (error) { grid.textContent = error.message; });
  }

  MW.me().then(function (user) {
    if (!user) {
      grid.textContent = "";
      var p = el("p", { class: "empty" });
      p.appendChild(document.createTextNode("Log in to follow creators and see their new releases here. "));
      p.appendChild(el("a", { href: "/hub/login?next=/hub/feed" }, "Log in"));
      grid.appendChild(p);
      return;
    }
    load();
    MW.api("/hub/following").then(function (data) {
      var strip = document.getElementById("following-strip");
      data.creators.forEach(function (c) {
        strip.appendChild(el("a", { class: "kind-chip", href: "/hub/c/" + encodeURIComponent(c.handle) }, c.name));
      });
      document.getElementById("feed-intro").textContent = data.creators.length
        ? "New releases from the " + data.creators.length + (data.creators.length === 1 ? " creator" : " creators") + " you follow, newest first."
        : "You're not following anyone yet. Find creators on the Creators page.";
    });
  });
  document.getElementById("feed-more").addEventListener("click", function () { page++; load(); });
})();
