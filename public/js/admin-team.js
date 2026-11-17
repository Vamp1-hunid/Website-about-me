// js/admin-team.js  -  Admin -> Team & powers (owner only): see who has admin rights or staff powers,
// give or take limited powers, and remove full admin rights from other accounts.
(function () {
  "use strict";
  var MW = window.MW;
  var ADMIN = window.ADMIN;
  if (!MW || !ADMIN || !document.getElementById("team-list")) return;
  var el = MW.el;
  var powers = [];

  function powerBoxes(container, chosen) {
    container.textContent = "";
    powers.forEach(function (p) {
      var row = el("label", { class: "team-power" });
      var cb = el("input", { type: "checkbox", value: p.key });
      cb.checked = chosen.indexOf(p.key) >= 0;
      row.appendChild(cb);
      var t = el("span");
      t.appendChild(el("strong", {}, p.label));
      t.appendChild(el("span", { class: "muted" }, " · " + p.description));
      row.appendChild(t);
      container.appendChild(row);
    });
  }
  function ticked(container) {
    return Array.prototype.map.call(container.querySelectorAll("input:checked"), function (c) { return c.value; });
  }

  function save(username, list) {
    return MW.api("/admin/staff/" + encodeURIComponent(username), { method: "PUT", json: { powers: list } });
  }

  function load() {
    MW.api("/admin/staff").then(function (d) {
      powers = d.powers;
      powerBoxes(document.getElementById("team-add-powers"), []);
      var box = document.getElementById("team-list");
      box.textContent = "";
      d.people.forEach(function (u) {
        var card = el("div", { class: "team-card" });
        var head = el("div", { class: "team-card-head" });
        var who = el("a", { href: "/hub/u/" + encodeURIComponent(u.username) });
        who.appendChild(el("strong", {}, u.displayName || u.username));
        who.appendChild(el("span", { class: "muted" }, " @" + u.username));
        head.appendChild(who);
        var role = u.isOwner ? "👑 Owner (every power)" : u.isAdmin ? "⚠️ Full admin" : "🛡️ Staff";
        head.appendChild(el("span", { class: "mini-tag" }, role));
        if (u.status !== "active") head.appendChild(el("span", { class: "mini-tag" }, u.status));
        card.appendChild(head);
        if (u.isOwner) { box.appendChild(card); return; }
        if (u.isAdmin) {
          card.appendChild(el("p", { class: "muted" }, "This account has full admin rights: it can do everything except change powers. If that's not intended, remove them. They'll be signed out, and you can then tick only the powers they should keep."));
          var rm = el("button", { type: "button", class: "btn btn-danger btn-small" }, "Remove full admin rights");
          rm.addEventListener("click", function () {
            if (!window.confirm("Remove full admin rights from @" + u.username + "? They will be signed out.")) return;
            MW.api("/admin/staff/" + encodeURIComponent(u.username) + "/remove-admin", { method: "POST" }).then(function () {
              MW.toast("@" + u.username + " is no longer an admin.");
              load();
            }).catch(function (e) { MW.toast(e.message, true); });
          });
          card.appendChild(rm);
        }
        var boxes = el("div", { class: "team-powers" });
        powerBoxes(boxes, u.powers);
        card.appendChild(boxes);
        var actions = el("div", { class: "hero-actions" });
        var upd = el("button", { type: "button", class: "btn btn-small" }, "Save powers");
        upd.addEventListener("click", function () {
          save(u.username, ticked(boxes)).then(function (r) {
            MW.toast(r.powers.length ? "Saved @" + u.username + "'s powers." : "@" + u.username + " has no staff powers now.");
            load();
          }).catch(function (e) { MW.toast(e.message, true); });
        });
        var none = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Take all powers away");
        none.addEventListener("click", function () {
          if (!window.confirm("Take every staff power away from @" + u.username + "?")) return;
          save(u.username, []).then(function () { MW.toast("Done."); load(); }).catch(function (e) { MW.toast(e.message, true); });
        });
        actions.appendChild(upd);
        actions.appendChild(none);
        card.appendChild(actions);
        box.appendChild(card);
      });
    }).catch(function (e) {
      document.getElementById("team-list").textContent = e.message;
    });
  }

  document.getElementById("team-add").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var err = document.getElementById("team-error");
    err.textContent = "";
    var name = document.getElementById("team-username").value.trim().toLowerCase().replace(/^@/, "");
    var list = ticked(document.getElementById("team-add-powers"));
    if (!name) { err.textContent = "Type their username."; return; }
    if (!list.length) { err.textContent = "Tick at least one power."; return; }
    save(name, list).then(function () {
      MW.toast("@" + name + " now has staff powers.");
      document.getElementById("team-username").value = "";
      load();
    }).catch(function (e) { err.textContent = e.message; });
  });

  // Username helper: type part of a name or username and pick the right person from the list.
  (function () {
    var input = document.getElementById("team-username");
    var list = el("div", { class: "name-suggest", role: "listbox", hidden: "" });
    input.parentNode.parentNode.insertBefore(list, input.parentNode.nextSibling);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("placeholder", "Start typing a name or username…");
    var timer = null;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim().replace(/^@/, "");
      if (q.length < 2) { list.hidden = true; return; }
      timer = setTimeout(function () {
        MW.api("/users?q=" + encodeURIComponent(q)).then(function (d) {
          list.textContent = "";
          var people = d.members.slice(0, 8);
          if (!people.length) { list.appendChild(el("p", { class: "muted" }, "No one matches \"" + q + "\".")); list.hidden = false; return; }
          people.forEach(function (m) {
            var b = el("button", { type: "button", class: "name-suggest-item", role: "option" });
            b.appendChild(MW.avatar(m));
            var t = el("span");
            t.appendChild(el("strong", {}, m.displayName || m.username));
            t.appendChild(el("span", { class: "muted" }, " @" + m.username + (m.isBeta ? " · 🧪" : "") + (m.creatorHandle ? " · ✍️" : "")));
            b.appendChild(t);
            b.addEventListener("click", function () { input.value = m.username; list.hidden = true; });
            list.appendChild(b);
          });
          list.hidden = false;
        }).catch(function () { list.hidden = true; });
      }, 200);
    });
    document.addEventListener("click", function (e) { if (e.target !== input && !list.contains(e.target)) list.hidden = true; });
  })();

  ADMIN.onShow("team", load);
})();
