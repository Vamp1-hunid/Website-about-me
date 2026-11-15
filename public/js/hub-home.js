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
    data.creators.forEach(function (c) {
      var a = el("a", { class: "compact-creator", href: "/hub/c/" + encodeURIComponent(c.handle) });
      var pic = el("span", { class: "feed-avatar" });
      if (c.avatarUrl) pic.appendChild(el("img", { src: c.avatarUrl, alt: "", loading: "lazy" })); else pic.textContent = (c.name || "?").charAt(0);
      a.appendChild(pic);
      var t = el("span", { class: "feed-names" });
      var cn = el("strong", {}, c.name);
      if (c.badges && c.badges.length) cn.appendChild(MW.badges(c.badges, true));
      t.appendChild(cn);
      t.appendChild(el("span", { class: "muted" }, c.tagline || "@" + c.handle));
      a.appendChild(t);
      creators.appendChild(a);
    });
    // Stories strip: creator circles across the top (newest posters first), like Instagram.
    var stories = document.getElementById("home-stories");
    if (stories) {
      stories.textContent = "";
      var seen = {};
      var ring = [];
      (data.latest || []).forEach(function (p) {
        if (p.creator && !seen[p.creator.handle]) { seen[p.creator.handle] = 1; ring.push({ handle: p.creator.handle, name: p.creator.name, avatarUrl: p.creator.avatarUrl, fresh: true }); }
      });
      data.creators.forEach(function (c) { if (!seen[c.handle]) { seen[c.handle] = 1; ring.push({ handle: c.handle, name: c.name, avatarUrl: c.avatarUrl }); } });
      ring.slice(0, 20).forEach(function (c) {
        var a = el("a", { class: "story" + (c.fresh ? " is-fresh" : ""), href: "/hub/c/" + encodeURIComponent(c.handle), title: c.name + (c.fresh ? " posted recently" : "") });
        var circle = el("span", { class: "story-ring" });
        var pic = el("span", { class: "story-pic" });
        if (c.avatarUrl) pic.appendChild(el("img", { src: c.avatarUrl, alt: "" })); else pic.textContent = (c.name || "?").charAt(0);
        circle.appendChild(pic);
        a.appendChild(circle);
        a.appendChild(el("span", { class: "story-name" }, c.name));
        stories.appendChild(a);
      });
      var more = el("a", { class: "story story-more", href: "/hub/creators" });
      var moreRing = el("span", { class: "story-ring" });
      moreRing.appendChild(el("span", { class: "story-pic" }, "＋"));
      more.appendChild(moreRing);
      more.appendChild(el("span", { class: "story-name" }, "Discover"));
      stories.appendChild(more);
    }
    var news = document.getElementById("home-news");
    news.textContent = "";
    if (!data.news.length) news.appendChild(el("p", { class: "empty" }, "No news yet."));
    data.news.forEach(function (n) { news.appendChild(MW.newsItem(n)); });
  }).catch(function (error) {
    document.getElementById("home-creators").textContent = error.message;
  });

  MW.me().then(function (user) {
    document.querySelectorAll("[data-feature-box]").forEach(function (box) {
      if (MW.feature(box.getAttribute("data-feature-box"))) box.hidden = false;
    });
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
      var fp = document.getElementById("following-panel");
      if (!fp) return;
      MW.renderWorks(document.getElementById("home-following"), posts);
      fp.hidden = false;
    }).catch(function () {});
  });
})();
