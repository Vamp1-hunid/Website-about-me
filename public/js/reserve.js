// js/reserve.js  -  /hub/reserve: the pre-launch "reserve your username" campaign (and the admin's list).
(function () {
  "use strict";
  var MW = window.MW;
  var form = document.getElementById("reserve-form");
  if (!MW || !form) return;
  var el = MW.el;
  var $ = function (id) { return document.getElementById(id); };

  // Countries
  var names;
  try { names = new Intl.DisplayNames([navigator.language || "en"], { type: "region" }); } catch (e) { names = null; }
  var codes = [];
  for (var i = 65; i <= 90; i++) for (var j = 65; j <= 90; j++) codes.push(String.fromCharCode(i, j));
  codes.map(function (c) { var n = names ? names.of(c) : null; return n && n !== c && ["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"].indexOf(c) < 0 ? [c, n] : null; })
    .filter(Boolean).sort(function (a, b) { return a[1].localeCompare(b[1]); })
    .forEach(function (c) { $("country").appendChild(el("option", { value: c[0] }, c[1])); });
  var guess = (navigator.language || "").split("-")[1];
  if (guess) $("country").value = guess.toUpperCase();
  $("birthDate").max = new Date().toISOString().slice(0, 10);

  // Live counter and countdown
  function countdown(target) {
    var box = $("reserve-countdown-box");
    box.hidden = false;
    function tick() {
      var ms = new Date(target) - Date.now();
      if (ms <= 0) { $("reserve-countdown").textContent = "Any moment!"; return; }
      var d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
      $("reserve-countdown").textContent = (d ? d + "d " : "") + h + "h " + m + "m " + s + "s";
    }
    tick();
    setInterval(tick, 1000);
  }
  MW.api("/reserve").then(function (d) {
    $("reserve-count").textContent = d.count.toLocaleString();
    if (d.launchAt) countdown(d.launchAt);
    if (!d.open) { form.hidden = true; $("reserve-closed").hidden = false; }
  });

  // Live username check
  var timer = null;
  $("username").addEventListener("input", function () {
    var u = $("username");
    u.value = u.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    clearTimeout(timer);
    var hint = $("username-hint");
    if (u.value.length < 3) { hint.textContent = "3–30 characters: lowercase letters, numbers or _"; hint.className = "muted"; return; }
    timer = setTimeout(function () {
      MW.api("/reserve/check?u=" + encodeURIComponent(u.value)).then(function (d) {
        hint.textContent = (d.available ? "✓ " : "✗ ") + d.message;
        hint.className = d.available ? "feedback feedback-success" : "feedback feedback-error";
      });
    }, 300);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    $("form-feedback").textContent = "";
    var button = form.querySelector("button[type='submit']");
    button.disabled = true;
    MW.api("/reserve", { method: "POST", json: {
      username: $("username").value, displayName: $("displayName").value, email: $("email").value,
      birthDate: $("birthDate").value, country: $("country").value, acceptTerms: $("acceptTerms").checked
    } }).then(function (d) {
      form.hidden = true;
      var done = $("reserve-done");
      done.hidden = false;
      done.appendChild(el("p", { class: "reserve-success" }, "🐝 @" + d.username + " is yours."));
      done.appendChild(el("p", { class: "lead" }, "We'll email you a link to claim it the moment Chapterhive opens. " + (d.count === 1 ? "You're the very first person waiting!" : "You're one of " + d.count.toLocaleString() + " people already waiting.")));
      var share = el("button", { type: "button", class: "btn" }, "Invite friends to reserve theirs");
      share.addEventListener("click", function () {
        var url = window.location.origin + "/hub/reserve";
        var text = "I just reserved @" + d.username + " on Chapterhive. Grab your name before it's gone!";
        if (navigator.share) navigator.share({ title: "Chapterhive", text: text, url: url }).catch(function () {});
        else if (navigator.clipboard) navigator.clipboard.writeText(text + " " + url).then(function () { MW.toast("Invite copied: paste it anywhere."); });
      });
      done.appendChild(share);
      $("reserve-count").textContent = d.count.toLocaleString();
    }).catch(function (e) {
      if (e.data && e.data.tooYoung) {
        form.textContent = "";
        form.appendChild(el("p", { class: "lead" }, "Sorry, you need to be at least 13 to join Chapterhive."));
        return;
      }
      MW.showProblems(form, (e.data && e.data.problems) || []);
      $("form-feedback").textContent = e.message;
      button.disabled = false;
    });
  });

  // Admin: the list, and sending claim links at launch
  MW.me().then(function (user) {
    if (!user || user.role !== "admin") return;
    $("reserve-admin").hidden = false;
    if (window.location.hash === "#reserve-admin") $("reserve-admin").scrollIntoView();
    function load() {
      MW.api("/reserve/admin").then(function (d) {
        var box = $("reserve-list");
        box.textContent = "";
        var claimed = d.reservations.filter(function (r) { return r.claimed_at; }).length;
        box.appendChild(el("p", { class: "mono muted" }, d.reservations.length + " reserved · " + claimed + " claimed" + (d.mailEnabled ? "" : " · email isn't set up, so claim links are shown here to send yourself")));
        var table = el("table", { class: "reserve-table" });
        var head = el("tr");
        ["Username", "Name", "Email", "Reserved", "Status", ""].forEach(function (h) { head.appendChild(el("th", {}, h)); });
        table.appendChild(head);
        d.reservations.forEach(function (r) {
          var tr = el("tr");
          tr.appendChild(el("td", {}, "@" + r.username));
          tr.appendChild(el("td", {}, r.display_name));
          tr.appendChild(el("td", {}, r.email));
          tr.appendChild(el("td", {}, MW.formatDate(r.created_at)));
          tr.appendChild(el("td", {}, r.claimed_at ? "✓ Claimed" : r.invited_at ? "Invited" : "Waiting"));
          var td = el("td");
          if (!r.claimed_at) {
            var rm = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Release");
            rm.addEventListener("click", function () {
              if (!window.confirm("Release @" + r.username + "? Anyone could take it after this.")) return;
              MW.api("/reserve/admin/" + r.id, { method: "DELETE" }).then(load);
            });
            td.appendChild(rm);
          }
          tr.appendChild(td);
          table.appendChild(tr);
        });
        box.appendChild(table);
      });
    }
    load();
    $("reserve-invite").addEventListener("click", function () {
      if (!window.confirm("Send claim links to everyone who hasn't had one yet?")) return;
      MW.api("/reserve/admin/invite", { method: "POST" }).then(function (d) {
        var out = $("reserve-links");
        out.textContent = "";
        if (d.mailEnabled) out.appendChild(el("p", { class: "feedback feedback-success" }, "Sent " + d.sent + " of " + d.total + " claim emails."));
        else {
          out.appendChild(el("p", { class: "muted" }, "Email isn't set up, so here are the claim links to send yourself:"));
          var ul = el("ul");
          d.links.forEach(function (l) { ul.appendChild(el("li", {}, "@" + l.username + " (" + l.email + "): " + l.link)); });
          out.appendChild(ul);
        }
        load();
      }).catch(function (e) { MW.toast(e.message, true); });
    });
  });
})();
