// js/hub-creator.js  -  a creator's profile (/hub/c/<handle>)
(function () {
  "use strict";
  var MW = window.MW;
  var box = document.getElementById("profile");
  if (!MW || !box) return;
  var el = MW.el;
  var handle = decodeURIComponent(window.location.pathname.replace(/^\/hub\/c\//, "").replace(/\/$/, ""));
  var workPage = 1;

  function loadWorks() {
    MW.api("/posts?creator=" + encodeURIComponent(handle) + "&page=" + workPage).then(function (data) {
      var grid = document.getElementById("pworks");
      if (workPage === 1) grid.textContent = "";
      data.posts.forEach(function (p) { grid.appendChild(MW.workCard(p)); });
      document.getElementById("profile-works").hidden = data.total === 0;
      document.getElementById("pworks-count").textContent = data.total + (data.total === 1 ? " work" : " works");
      document.getElementById("pmore").hidden = data.page >= data.pages;
    });
  }
  document.getElementById("pmore").addEventListener("click", function () { workPage++; loadWorks(); });

  Promise.all([MW.api("/hub/creators/" + encodeURIComponent(handle)), MW.me()]).then(function (results) {
    var data = results[0], user = results[1];
    var c = data.creator;
    document.title = c.name + " (@" + c.handle + ") | Afterframe";
    box.textContent = "";
    var banner = el("div", { class: "profile-banner" });
    if (c.bannerUrl) banner.style.backgroundImage = "url(\"" + c.bannerUrl.replace(/["\\]/g, "") + "\")";
    box.appendChild(banner);
    var body = el("div", { class: "profile-body" });
    var top = el("div", { class: "profile-top" });
    top.appendChild(MW.avatar({ avatarUrl: c.avatarUrl, displayName: c.name }, "big"));
    var names = el("div");
    var h1 = el("h1", {}, c.name);
    h1.appendChild(MW.onlineDot(c.online));
    names.appendChild(h1);
    names.appendChild(el("p", { class: "mono muted" }, "@" + c.handle + (c.isBanditos ? " · Afterframe founder" : "")));
    top.appendChild(names);
    var actions = el("div", { class: "profile-actions" });
    var followers = el("strong", {}, String(c.followers));
    if (c.isOwner) {
      actions.appendChild(el("a", { class: "btn btn-small", href: "/hub/studio#profile" }, "Edit profile"));
      actions.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/hub/studio" }, "Open studio"));
    } else {
      actions.appendChild(MW.followButton(c.handle, c.following, function (n) { followers.textContent = String(n); }));
    }
    top.appendChild(actions);
    body.appendChild(top);
    if (c.status !== "approved") body.appendChild(el("p", { class: "draft-flag mono" }, "Profile " + c.status.toUpperCase() + ": only you can see it"));

    var meta = el("p", { class: "profile-meta" });
    var f = el("span"); f.append(followers, document.createTextNode(c.followers === 1 ? " follower" : " followers"));
    var w = el("span"); w.append(el("strong", {}, String(c.works)), document.createTextNode(c.works === 1 ? " work" : " works"));
    meta.append(f, w, el("span", {}, "Joined " + MW.formatDate(c.joined)));
    body.appendChild(meta);
    if (c.tagline) body.appendChild(el("p", { class: "logline logline-big" }, c.tagline));
    if (c.kinds && c.kinds.length) {
      var chips = el("div", { class: "kind-chips" });
      c.kinds.forEach(function (k) { chips.appendChild(el("span", { class: "kind-chip" }, MW.kindName(k))); });
      body.appendChild(chips);
    }
    if (c.bio) {
      var prose = el("div", { class: "prose work-body" });
      MW.renderMarkup(prose, c.bio);
      body.appendChild(prose);
    }
    if (c.links && c.links.length) {
      var links = el("div", { class: "social-row" });
      c.links.forEach(function (l) {
        var a = el("a", { class: "social-link", href: l.url, target: "_blank", rel: "noopener nofollow ugc" });
        a.appendChild(el("span", { class: "social-dot", "aria-hidden": "true" }));
        a.appendChild(document.createTextNode(l.label));
        links.appendChild(a);
      });
      body.appendChild(links);
    }
    if (user && !c.isOwner) {
      var r = el("p");
      r.appendChild(MW.reportLink("creator", c.userId, "Report this creator"));
      body.appendChild(r);
    }
    box.appendChild(body);

    if (data.stories.length) {
      var sgrid = document.getElementById("pstories");
      data.stories.forEach(function (s) {
        s.creator = { handle: c.handle, name: c.name, isBanditos: c.isBanditos };
        sgrid.appendChild(MW.storyCard(s));
      });
      document.getElementById("profile-stories").hidden = false;
    }
    if (data.characters.length) {
      var cgrid = document.getElementById("pchars");
      data.characters.forEach(function (ch) {
        var a = el("a", { class: "character-card", href: "/hub/ch/" + encodeURIComponent(ch.slug) });
        var pic = el("div", { class: "character-portrait" });
        if (ch.portraitUrl) pic.appendChild(el("img", { src: ch.portraitUrl, alt: "", loading: "lazy" }));
        else pic.appendChild(el("span", { "aria-hidden": "true" }, ch.name.charAt(0)));
        a.appendChild(pic);
        a.appendChild(el("h3", {}, ch.name));
        if (ch.role) a.appendChild(el("p", { class: "mono character-role" }, ch.role));
        cgrid.appendChild(a);
      });
      document.getElementById("profile-chars").hidden = false;
    }
    loadWorks();
    MW.api("/collabs?creator=" + encodeURIComponent(c.handle)).then(function (k) {
      if (!k.collabs.length) return;
      var ul = document.getElementById("pcollabs");
      k.collabs.forEach(function (x) { ul.appendChild(MW.collabCard(x)); });
      document.getElementById("profile-collabs").hidden = false;
    }).catch(function () {});
  }).catch(function (error) {
    box.textContent = "";
    var body = el("div", { class: "profile-body pad-top" });
    body.appendChild(el("h1", {}, "Creator not found"));
    body.appendChild(el("p", { class: "lead" }, error.status === 404 ? "There's no creator with that handle." : error.message));
    body.appendChild(el("a", { class: "btn", href: "/hub/creators" }, "Browse creators"));
    box.appendChild(body);
  });
})();
