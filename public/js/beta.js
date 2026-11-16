// js/beta.js  -  /hub/beta: apply to be a beta tester before launch (and the admin's review list).
(function () {
  "use strict";
  var MW = window.MW;
  var form = document.getElementById("beta-form");
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

  MW.api("/beta").then(function (d) {
    if (!d.open) { form.hidden = true; $("beta-closed").hidden = false; }
  });

  $("username").addEventListener("input", function () {
    var u = $("username");
    u.value = u.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    $("form-feedback").textContent = "";
    var button = form.querySelector("button[type='submit']");
    button.disabled = true;
    MW.api("/beta", { method: "POST", json: {
      username: $("username").value, displayName: $("displayName").value, email: $("email").value,
      birthDate: $("birthDate").value, country: $("country").value, reason: $("reason").value, acceptTerms: $("acceptTerms").checked
    } }).then(function (d) {
      form.hidden = true;
      var done = $("beta-done");
      done.hidden = false;
      done.appendChild(el("p", { class: "reserve-success" }, "🧪 Application sent!"));
      done.appendChild(el("p", { class: "lead" }, (d.keptReservation ? "You'll keep your reserved name @" + d.username + ". " : "We've noted @" + d.username + ". ") +
        "If you're approved, we'll send a link to set up your account so you can log in before launch."));
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

  // Admin: review applications
  MW.me().then(function (user) {
    if (!user || user.role !== "admin") return;
    $("beta-admin").hidden = false;
    if (window.location.hash === "#beta-admin") $("beta-admin").scrollIntoView();
    function showLink(app, d) {
      var out = $("beta-links");
      out.textContent = "";
      if (d.existingAccount) out.appendChild(el("p", { class: "feedback feedback-success" }, "@" + app.username + " already had an account: it's now a beta tester account."));
      else if (d.sent) out.appendChild(el("p", { class: "feedback feedback-success" }, "Approved. An invite was emailed to " + app.email + "."));
      else {
        out.appendChild(el("p", { class: "muted" }, "Approved. Email isn't set up, so send this link to " + app.email + " yourself:"));
        var row = el("p", { class: "mono" }, d.link);
        out.appendChild(row);
        if (navigator.clipboard) {
          var copy = el("button", { type: "button", class: "btn btn-small" }, "Copy link");
          copy.addEventListener("click", function () { navigator.clipboard.writeText(d.link).then(function () { MW.toast("Link copied."); }); });
          out.appendChild(copy);
        }
      }
    }
    function load() {
      MW.api("/beta/admin").then(function (d) {
        var box = $("beta-list");
        box.textContent = "";
        var pending = d.applications.filter(function (a) { return a.status === "pending"; }).length;
        box.appendChild(el("p", { class: "mono muted" }, d.applications.length + " applications · " + pending + " waiting for you"));
        if (!d.applications.length) { box.appendChild(el("p", { class: "muted" }, "No applications yet.")); return; }
        var table = el("table", { class: "reserve-table" });
        var head = el("tr");
        ["Username", "Name", "Email", "Why", "Applied", "Status", ""].forEach(function (h) { head.appendChild(el("th", {}, h)); });
        table.appendChild(head);
        d.applications.forEach(function (a) {
          var tr = el("tr");
          tr.appendChild(el("td", {}, "@" + a.username));
          tr.appendChild(el("td", {}, a.display_name));
          tr.appendChild(el("td", {}, a.email));
          tr.appendChild(el("td", { class: "beta-reason" }, a.reason));
          tr.appendChild(el("td", {}, MW.formatDate(a.created_at)));
          tr.appendChild(el("td", {}, a.status === "approved" ? "✓ Approved" : a.status === "declined" ? "Declined" : "Waiting"));
          var td = el("td");
          if (a.status === "pending") {
            var ok = el("button", { type: "button", class: "btn btn-small" }, "Approve");
            ok.addEventListener("click", function () {
              ok.disabled = true;
              MW.api("/beta/admin/" + a.id + "/approve", { method: "POST" }).then(function (r) { showLink(a, r); load(); })
                .catch(function (e) { MW.toast(e.message, true); ok.disabled = false; });
            });
            var no = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Decline");
            no.addEventListener("click", function () {
              if (!window.confirm("Decline @" + a.username + "'s application?")) return;
              MW.api("/beta/admin/" + a.id + "/decline", { method: "POST" }).then(load);
            });
            td.appendChild(ok);
            td.appendChild(no);
          }
          tr.appendChild(td);
          table.appendChild(tr);
        });
        var wrap = el("div", { class: "beta-table-wrap" });
        wrap.appendChild(table);
        box.appendChild(wrap);
      });
    }
    load();
  });
})();
