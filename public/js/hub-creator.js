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
    document.title = c.name + " (@" + c.handle + ") | Chapterhive";
    box.textContent = "";
    // Premium creators can style their page: a theme, an accent colour and a wallpaper behind everything.
    if (c.pageStyle) {
      document.body.setAttribute("data-page-theme", c.pageStyle.theme || "hive");
      if (c.pageStyle.accent) document.body.style.setProperty("--page-accent", c.pageStyle.accent);
      if (c.pageStyle.wallpaperUrl) {
        document.body.classList.add("has-wallpaper");
        document.body.style.setProperty("--page-wallpaper", "url(\"" + c.pageStyle.wallpaperUrl.replace(/["\\]/g, "") + "\")");
      }
    }
    var banner = el("div", { class: "profile-banner" });
    if (c.bannerUrl) banner.style.backgroundImage = "url(\"" + c.bannerUrl.replace(/["\\]/g, "") + "\")";
    box.appendChild(banner);
    var body = el("div", { class: "profile-body" });
    var top = el("div", { class: "profile-top" });
    top.appendChild(MW.tappablePicture(MW.avatar({ avatarUrl: c.avatarUrl, displayName: c.name }, "big"), c.avatarUrl, c.name));
    var names = el("div");
    var h1 = el("h1", {}, c.name);
    h1.appendChild(MW.onlineDot(c.online));
    if (c.isBanditos) h1.appendChild(el("span", { class: "verified-inline", title: "Verified official account", "aria-label": "Verified official account" }, "✓"));
    names.appendChild(h1);
    if (c.premium) names.appendChild(el("span", { class: "premium-badge" }, "✦ Premium"));
    if (c.trustBadges && c.trustBadges.length) {
      var tbl = el("p", { class: "trust-badges" });
      c.trustBadges.forEach(function (b) { tbl.appendChild(el("span", { class: "trust-badge trust-" + b.key, title: b.label }, b.icon + " " + b.label.split(":")[0])); });
      names.appendChild(tbl);
    }
    if (c.skills && c.skills.length) {
      var skl = el("p", { class: "skill-list" });
      c.skills.forEach(function (s) { skl.appendChild(el("span", { class: "skill-chip is-on" }, s)); });
      names.appendChild(skl);
    }
    names.appendChild(el("p", { class: "mono muted" }, "@" + c.handle));
    // Official role tags: founder, top creator, beta tester. These come from the site, not from what the creator typed.
    var tags = (c.roleTags || []).slice();
    var topBadge = (c.badges || []).find(function (b) { return b.scope === "overall"; }) || (c.badges || [])[0];
    if (topBadge) tags.splice(tags[0] && tags[0].key === "founder" ? 1 : 0, 0, { key: "top", icon: topBadge.icon, label: topBadge.label });
    if (tags.length) {
      var row = el("div", { class: "role-tags" });
      tags.forEach(function (t) {
        var tag = el("span", { class: "role-tag role-" + t.key, title: t.label });
        tag.appendChild(el("span", { class: "role-tag-icon", "aria-hidden": "true" }, t.icon));
        tag.appendChild(el("span", {}, t.label));
        row.appendChild(tag);
      });
      names.appendChild(row);
    }
    // Any other rank stickers (e.g. top 5 in a shelf) stay small, under the big tags.
    var others = (c.badges || []).filter(function (b) { return b !== topBadge; });
    if (others.length) {
      var bl = el("p");
      bl.appendChild(MW.badges(others));
      names.appendChild(bl);
    }
    top.appendChild(names);
    var actions = el("div", { class: "profile-actions" });
    var followers = el("strong", {}, String(c.followers));
    if (c.isOwner) {
      actions.appendChild(el("a", { class: "btn btn-small", href: "/hub/studio#profile" }, "Edit profile"));
      actions.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/hub/studio" }, "Open studio"));
    } else {
      actions.appendChild(MW.followButton(c.handle, c.following, function (n) { followers.textContent = String(n); }));
      if (c.username && MW.feature("chat")) {
        actions.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/hub/chat?with=" + encodeURIComponent(c.username) }, "💬 Message"));
      }
    }
    var shareCreator = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "↗ Share");
    shareCreator.addEventListener("click", function () {
      MW.share({ title: c.name + " (@" + c.handle + ")", text: "Check out " + c.name + " on Chapterhive", url: "/hub/c/" + encodeURIComponent(c.handle) });
    });
    MW.me().then(function (u) { if (u) actions.appendChild(shareCreator); }); // sharing is for members
    top.appendChild(actions);
    body.appendChild(top);
    if (c.status !== "approved") body.appendChild(el("p", { class: "draft-flag mono" }, "Profile " + c.status.toUpperCase() + ": only you can see it"));

    var meta = el("p", { class: "profile-meta" });
    var f = el("span"); f.append(followers, document.createTextNode(c.followers === 1 ? " follower" : " followers"));
    if (c.username) {
      // Signed-in people can tap to see who follows this creator.
      f.className = "stat-tappable";
      f.setAttribute("role", "button");
      f.setAttribute("tabindex", "0");
      f.addEventListener("click", function () {
        MW.me().then(function (user) {
          if (!user) { MW.toast("Log in to see followers."); return; }
          MW.showPeopleList("Followers · " + c.name, "/users/" + encodeURIComponent(c.username) + "/list/followers");
        });
      });
    }
    var w = el("span"); w.append(el("strong", {}, String(c.works)), document.createTextNode(c.works === 1 ? " work" : " works"));
    meta.append(f, w, el("span", {}, "Joined " + MW.formatDate(c.joined)));
    body.appendChild(meta);
    if (c.tagline) body.appendChild(el("p", { class: "logline logline-big" }, c.tagline));
    if (c.kinds && c.kinds.length) {
      var chips = el("div", { class: "kind-chips" });
      c.kinds.forEach(function (k) { chips.appendChild(el("span", { class: "kind-chip" }, MW.kindName(k))); });
      body.appendChild(chips);
    }
    if (c.organisation) {
      var TYPES = { publisher: "Publisher", studio: "Studio", school: "School or university", band: "Band or music group",
        collective: "Creative collective", ngo: "Non-profit / NGO", company: "Company or brand", church: "Church or faith group", other: "Group" };
      var orgLine = el("p", { class: "org-line" });
      orgLine.appendChild(el("span", { class: "org-badge" }, "🏛 " + (TYPES[c.organisation.type] || "Organisation")));
      if (c.organisation.website) {
        orgLine.appendChild(document.createTextNode(" "));
        orgLine.appendChild(el("a", { href: c.organisation.website, target: "_blank", rel: "noopener nofollow ugc" }, c.organisation.website.replace(/^https?:\/\//, "")));
      }
      body.appendChild(orgLine);
      if (c.organisation.team.length) {
        var team = el("div", { class: "org-team" });
        team.appendChild(el("h3", {}, "The team"));
        var ul = el("ul");
        c.organisation.team.forEach(function (m) {
          var li = el("li");
          if (m.username) li.appendChild(el("a", { href: "/u/" + encodeURIComponent(m.username) }, m.name));
          else li.appendChild(el("strong", {}, m.name));
          if (m.role) li.appendChild(el("span", { class: "muted" }, " · " + m.role));
          ul.appendChild(li);
        });
        team.appendChild(ul);
        body.appendChild(team);
      }
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
