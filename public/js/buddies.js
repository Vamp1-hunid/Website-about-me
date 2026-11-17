// js/buddies.js  -  /hub/buddies: my buddies, buddy requests, my chats, and finding new buddies.
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW || !document.getElementById("b-mine")) return;
  var el = MW.el;
  var $ = function (id) { return document.getElementById(id); };
  var current = (window.location.hash || "#mine").slice(1);
  if (["mine", "chats", "find"].indexOf(current) < 0) current = "mine";

  function card(p, sub, actions) {
    var c = el("div", { class: "member-card" });
    var who = el("a", { class: "member-card-who", href: "/hub/u/" + encodeURIComponent(p.username) });
    who.appendChild(MW.avatar(p));
    var t = el("span", { class: "member-card-text" });
    t.appendChild(el("strong", {}, p.displayName || p.username));
    t.appendChild(el("span", { class: "muted" }, "@" + p.username + (sub ? " · " + sub : "")));
    var tags = el("span", { class: "member-card-tags" });
    if (p.isAdmin) tags.appendChild(el("span", { class: "mini-tag" }, "👑 Founder"));
    if (p.isBeta) tags.appendChild(el("span", { class: "mini-tag" }, "🧪 Beta tester"));
    if (tags.childNodes.length) t.appendChild(tags);
    who.appendChild(t);
    c.appendChild(who);
    if (actions) c.appendChild(actions);
    return c;
  }
  function chatButton(username) {
    return MW.feature("chat") ? el("a", { class: "btn btn-small btn-ghost", href: "/hub/chat?with=" + encodeURIComponent(username), "aria-label": "Message @" + username }, "💬") : null;
  }
  function acts(username, state) {
    var a = el("span", { class: "member-card-actions" });
    a.appendChild(MW.buddyButton(username, state, function () { setTimeout(loadPeople, 300); }));
    var c = chatButton(username);
    if (c) a.appendChild(c);
    return a;
  }
  function empty(box, text, linkText, hash) {
    box.textContent = "";
    var p = el("p", { class: "muted" }, text + " ");
    if (linkText) {
      var a = el("a", { href: "#" + hash }, linkText);
      a.addEventListener("click", function (e) { e.preventDefault(); show(hash); });
      p.appendChild(a);
    }
    box.appendChild(p);
  }

  function badge(id, n) { var b = $(id); b.hidden = !n; b.textContent = String(n); }

  function loadPeople() {
    MW.api("/users/me/people").then(function (d) {
      badge("b-n-mine", d.buddies.length);
      var reqBox = $("b-requests-list");
      reqBox.textContent = "";
      $("b-requests").hidden = !d.requests.length;
      d.requests.forEach(function (p) { reqBox.appendChild(card(p, "wants to be buddies", acts(p.username, "received"))); });
      var box = $("b-mine");
      if (!d.buddies.length) empty(box, "No buddies yet.", "Find buddies →", "find");
      else {
        box.textContent = "";
        d.buddies.forEach(function (p) { box.appendChild(card(p, "", acts(p.username, "buddies"))); });
      }
    }).catch(gate);
  }

  function loadChats() {
    if (!MW.feature("chat")) { empty($("b-chats"), "Chat is switched off right now."); return; }
    MW.api("/chat/threads").then(function (d) {
      var box = $("b-chats");
      var unread = d.threads.filter(function (t) { return t.unread; }).length;
      badge("b-n-chats", unread);
      if (!d.threads.length) { empty(box, "No chats yet. Tap 💬 next to a buddy to start one."); return; }
      box.textContent = "";
      d.threads.forEach(function (t) {
        var c = el("a", { class: "member-card chat-row" + (t.unread ? " is-unread" : ""), href: "/hub/chat?with=" + encodeURIComponent(t.with.username) });
        c.appendChild(MW.avatar(t.with));
        var tx = el("span", { class: "member-card-text" });
        tx.appendChild(el("strong", {}, (t.with.displayName || t.with.username) + (t.unread ? "  •" : "")));
        tx.appendChild(el("span", { class: "muted" }, t.preview || "…"));
        c.appendChild(tx);
        if (t.unread) c.appendChild(el("span", { class: "count-badge" }, String(t.unread)));
        box.appendChild(c);
      });
    }).catch(function () {});
  }

  var timer = null;
  function loadFind() {
    var q = $("b-q").value.trim();
    var box = $("b-find");
    $("b-find-title").textContent = q ? "Results" : "People you may know";
    var req = q ? MW.api("/users?q=" + encodeURIComponent(q)).then(function (d) { return d.members.map(function (m) { return Object.assign(m, { why: m.creatorHandle ? "Creator" : "" }); }); })
                : MW.api("/users/suggestions").then(function (d) { return d.people; });
    req.then(function (people) {
      box.textContent = "";
      people = people.filter(function (p) { return p.buddyState !== "buddies"; });
      if (!people.length) { empty(box, q ? "No one matches that name." : "No suggestions yet. Try searching for someone's name."); return; }
      people.forEach(function (p) { box.appendChild(card(p, p.why, acts(p.username, p.buddyState || "none"))); });
    }).catch(gate);
  }
  $("b-q").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(loadFind, 250); });

  function gate(e) {
    if (e && e.status === 401) {
      var main = document.querySelector(".buddies-hub");
      main.querySelectorAll("[data-pane], #b-requests, .buddies-tabs, .people-links").forEach(function (n) { n.hidden = true; });
      if (!main.querySelector(".guest-gate")) main.appendChild(MW.guestGate("Log in to see your buddies, chat and find people."));
    }
  }

  var loaded = {};
  function show(name) {
    current = name;
    history.replaceState(null, "", "#" + name);
    document.querySelectorAll(".buddies-tabs [data-show]").forEach(function (t) { t.setAttribute("aria-selected", String(t.getAttribute("data-show") === name)); });
    document.querySelectorAll("[data-pane]").forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== name; });
    if (name === "chats") loadChats();
    if (name === "find" && !loaded.find) { loaded.find = true; loadFind(); }
    if (name === "find") $("b-q").focus({ preventScroll: true });
  }
  document.querySelectorAll(".buddies-tabs [data-show]").forEach(function (t) {
    t.addEventListener("click", function () { show(t.getAttribute("data-show")); });
  });

  MW.me().then(function () {
    loadPeople();
    loadChats();
    show(current);
  }, gate);
})();
