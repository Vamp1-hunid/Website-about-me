// js/user.js
// A member's public page (/u/<username>): picture, name, join date, counts and recent comments.

(function () {
  "use strict";

  var MW = window.MW;
  var box = document.getElementById("member");
  if (!box || !MW) return;
  var el = MW.el;
  var username = decodeURIComponent(window.location.pathname.replace(/^\/(hub\/)?u\//, "").replace(/\/$/, ""));

  MW.api("/users/" + encodeURIComponent(username))
    .then(function (data) {
      var u = data.user;
      document.title = u.displayName + " (@" + u.username + ") | God's Banditos";
      box.textContent = "";
      var head = el("div", { class: "member-head" });
      head.appendChild(MW.avatar(u, "big"));
      var text = el("div");
      text.appendChild(el("p", { class: "node-label" }, u.role === "admin" ? "Creator // profile" : "Member // profile"));
      var h1 = el("h1", { class: "glitch" }, u.displayName);
      h1.appendChild(MW.onlineDot(u.online));
      text.appendChild(h1);
      if (u.streak > 1 && MW.feature("streaks")) { var sp = el("p"); sp.appendChild(el("span", { class: "streak-chip" }, "🔥 " + u.streak + "-day streak")); text.appendChild(sp); }
      var line = "@" + u.username + " · joined " + MW.formatDate(u.joined);
      text.appendChild(el("p", { class: "mono muted" }, line));
      if (u.roleTags && u.roleTags.length) {
        var rt = el("div", { class: "role-tags" });
        u.roleTags.forEach(function (t) {
          var tag = el("span", { class: "role-tag role-" + t.key, title: t.label });
          tag.appendChild(el("span", { class: "role-tag-icon", "aria-hidden": "true" }, t.icon));
          tag.appendChild(el("span", {}, t.label));
          rt.appendChild(tag);
        });
        text.appendChild(rt);
      }
      if (u.trustBadges && u.trustBadges.length) {
        var tb = el("p", { class: "trust-badges" });
        u.trustBadges.forEach(function (b) { tb.appendChild(el("span", { class: "trust-badge trust-" + b.key, title: b.label }, b.icon + " " + b.label.split(":")[0])); });
        text.appendChild(tb);
      }
      if (u.bio) text.appendChild(el("p", { class: "member-bio" }, u.bio));
      if (u.skills && u.skills.length) {
        var sk = el("p", { class: "skill-list", "aria-label": "Skills" });
        u.skills.forEach(function (s) { sk.appendChild(el("span", { class: "skill-chip is-on" }, s)); });
        text.appendChild(sk);
      }
      MW.me().then(function (me) {
        if (me && me.username !== u.username) {
          var mp = el("p", { class: "member-actions" });
          if (MW.feature("follows")) {
            var fb = el("button", { type: "button", class: "btn btn-small" + (u.iFollow ? " btn-ghost" : "") }, u.iFollow ? "Following" : "Follow");
            fb.addEventListener("click", function () {
              fb.disabled = true;
              MW.api("/users/" + encodeURIComponent(u.username) + "/follow", { method: u.iFollow ? "DELETE" : "POST" }).then(function (d) {
                u.iFollow = d.following;
                fb.textContent = u.iFollow ? "Following" : "Follow";
                fb.className = "btn btn-small" + (u.iFollow ? " btn-ghost" : "");
                var fc = document.getElementById("member-followers");
                if (fc) fc.textContent = String(d.followers);
              }).catch(function (e) { MW.toast(e.message, true); }).then(function () { fb.disabled = false; });
            });
            mp.appendChild(fb);
            mp.appendChild(document.createTextNode(" "));
          }
          if (MW.feature("chat")) mp.appendChild(el("a", { class: "btn btn-small btn-ghost", href: "/hub/chat?with=" + encodeURIComponent(u.username) }, "💬 Message"));
          text.appendChild(mp);
        }
      });
      if (u.role === "admin") {
        var sticker = el("p");
        sticker.appendChild(el("a", { class: "sticker sticker-pink", href: "/creator" }, "Artist · meet the creator"));
        text.appendChild(sticker);
      }
      head.appendChild(text);
      box.appendChild(head);

      var stats = el("dl", { class: "stat-row" });
      [["Followers", u.followers || 0, "member-followers"], ["Following", u.followingCount || 0], ["Comments", u.comments], ["Likes given", u.likes]].forEach(function (s) {
        var d = el("div", { class: "stat" });
        d.appendChild(el("dt", {}, s[0]));
        d.appendChild(el("dd", s[2] ? { id: s[2] } : {}, String(s[1])));
        stats.appendChild(d);
      });
      box.appendChild(stats);

      MW.me().then(function (me) {
        if (me && me.username === u.username) {
          box.appendChild(el("p", {}, "")).appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/hub/profile" }, "Edit your profile"));
        }
      });

      if (data.recentComments.length) {
        var list = document.getElementById("member-comments");
        data.recentComments.forEach(function (c) {
          var li = el("li", { class: "comment" });
          var header = el("header");
          header.appendChild(el("span", {}, c.isReply ? "Replied on" : "Commented on"));
          header.appendChild(el("a", { class: "who", href: "/work/" + encodeURIComponent(c.work.slug) + "#comment-" + c.id }, c.work.title));
          header.appendChild(el("time", { datetime: c.createdAt }, MW.formatDate(c.createdAt)));
          if (c.editedAt) header.appendChild(el("span", { class: "edited" }, "(edited)"));
          li.appendChild(header);
          li.appendChild(el("p", {}, c.body));
          list.appendChild(li);
        });
        document.getElementById("member-comments-panel").hidden = false;
      }
    })
    .catch(function (error) {
      box.textContent = "";
      if (error.status === 401) {
        box.appendChild(el("h1", {}, "Members only"));
        box.appendChild(MW.guestGate("Member pages are for people with an account. Create one for free to see who's here."));
        return;
      }
      box.appendChild(el("h1", { class: "glitch" }, "Signal lost"));
      box.appendChild(el("p", { class: "lead" }, error.status === 404 ? "There's no member with that username." : error.message));
    });
})();
