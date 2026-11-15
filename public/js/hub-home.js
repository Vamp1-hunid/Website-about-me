// js/hub-home.js  -  Chapterhive home (/hub)
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW || !document.getElementById("home-creators")) return;
  var el = MW.el;

  MW.api("/hub/home").then(function (data) {
    var stats = document.getElementById("hub-stats");
    [["creators", "creators"], ["works", "works published"]].forEach(function (s) {
      var d = el("div");
      d.appendChild(el("strong", {}, String(data.stats[s[0]])));
      d.appendChild(document.createTextNode(s[1]));
      stats.appendChild(d);
    });
    var creators = document.getElementById("home-creators");
    creators.textContent = "";
    if (!data.creators.length) creators.appendChild(el("p", { class: "empty" }, "The first creators are joining now."));
    data.creators.forEach(function (c) { creators.appendChild(MW.creatorCard(c)); });
    MW.renderWorks(document.getElementById("home-latest"), data.latest, "No releases yet. Check back soon.");
    var news = document.getElementById("home-news");
    news.textContent = "";
    if (!data.news.length) news.appendChild(el("p", { class: "empty" }, "No anime updates yet."));
    data.news.forEach(function (n) { news.appendChild(MW.newsItem(n)); });
  }).catch(function (error) {
    document.getElementById("home-creators").textContent = error.message;
  });

  MW.me().then(function (user) {
    if (!user) return;
    MW.api("/hub/feed/unseen").then(function () {
      // Peek at the feed without marking it as seen: use the public list of followed creators instead.
      return MW.api("/hub/following");
    }).then(function (data) {
      if (!data.creators.length) return;
      var handles = data.creators.slice(0, 6).map(function (c) { return c.handle; });
      return Promise.all(handles.map(function (h) { return MW.api("/posts?creator=" + encodeURIComponent(h)); }));
    }).then(function (lists) {
      if (!lists) return;
      var posts = [].concat.apply([], lists.map(function (l) { return l.posts; }))
        .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 6);
      if (!posts.length) return;
      MW.renderWorks(document.getElementById("home-following"), posts);
      document.getElementById("following-panel").hidden = false;
    }).catch(function () {});
  });
})();
