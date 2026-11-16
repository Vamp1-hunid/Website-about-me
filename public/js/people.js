// js/people.js  -  /hub/people: my buddies, buddy requests, followers and who I follow.
(function () {
  "use strict";
  var MW = window.MW;
  var list = document.getElementById("people-list");
  if (!MW || !list) return;
  var el = MW.el;
  var data = null;
  var current = (window.location.hash || "#buddies").slice(1);
  var tabs = document.querySelectorAll(".people-tabs [data-show]");
  var EMPTY = {
    buddies: "No buddies yet. Send a request from someone's page or from Find members.",
    requests: "No buddy requests waiting.",
    followers: "No followers yet. Share your page and post something!",
    following: "You're not following anyone yet."
  };

  function card(p, actions) {
    var c = el("div", { class: "member-card" });
    var who = el("a", { class: "member-card-who", href: "/hub/u/" + encodeURIComponent(p.username) });
    who.appendChild(MW.avatar(p));
    var t = el("span", { class: "member-card-text" });
    t.appendChild(el("strong", {}, p.displayName || p.username));
    t.appendChild(el("span", { class: "muted" }, "@" + p.username));
    var tags = el("span", { class: "member-card-tags" });
    if (p.isAdmin) tags.appendChild(el("span", { class: "mini-tag" }, "👑 Founder"));
    if (p.isBeta) tags.appendChild(el("span", { class: "mini-tag" }, "🧪 Beta tester"));
    if (tags.childNodes.length) t.appendChild(tags);
    who.appendChild(t);
    c.appendChild(who);
    if (actions) c.appendChild(actions);
    return c;
  }

  function followBack(p) {
    var b = el("button", { type: "button", class: "btn btn-small" }, "Follow back");
    b.addEventListener("click", function () {
      b.disabled = true;
      MW.api("/users/" + encodeURIComponent(p.username) + "/follow", { method: "POST" }).then(function () { load(); })
        .catch(function (e) { MW.toast(e.message, true); b.disabled = false; });
    });
    return b;
  }

  function draw() {
    tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t.getAttribute("data-show") === current)); });
    list.textContent = "";
    if (!data) return;
    var people = current === "requests" ? data.requests.concat(data.sent) : data[current] || [];
    if (!people.length) { list.appendChild(el("p", { class: "muted" }, EMPTY[current])); return; }
    people.forEach(function (p) {
      var acts = el("span", { class: "member-card-actions" });
      if (current === "buddies") acts.appendChild(MW.buddyButton(p.username, "buddies", load));
      else if (current === "requests") acts.appendChild(MW.buddyButton(p.username, data.sent.indexOf(p) >= 0 ? "sent" : "received", load));
      else if (current === "followers" && !p.followBack && MW.feature("follows")) acts.appendChild(followBack(p));
      if (MW.feature("chat")) acts.appendChild(el("a", { class: "btn btn-small btn-ghost", href: "/hub/chat?with=" + encodeURIComponent(p.username), "aria-label": "Message @" + p.username }, "💬"));
      list.appendChild(card(p, acts));
    });
  }

  function badge(id, n) {
    var b = document.getElementById(id);
    b.hidden = !n;
    b.textContent = String(n);
  }

  function load() {
    MW.api("/users/me/people").then(function (d) {
      data = d;
      badge("n-buddies", d.buddies.length);
      badge("n-requests", d.requests.length);
      badge("n-followers", d.followers.length);
      badge("n-following", d.following.length);
      draw();
    }).catch(function (e) {
      list.textContent = "";
      if (e.status === 401) list.appendChild(MW.guestGate("Log in to see your buddies and followers."));
      else list.appendChild(el("p", { class: "muted" }, e.message));
    });
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      current = t.getAttribute("data-show");
      history.replaceState(null, "", "#" + current);
      draw();
    });
  });
  window.addEventListener("hashchange", function () { current = (window.location.hash || "#buddies").slice(1); draw(); });
  // Wait for the account (and its switched-on features) before drawing the Follow and Message buttons.
  MW.me().then(load, load);
})();
