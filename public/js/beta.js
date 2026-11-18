// js/beta.js  -  /hub/beta: apply to be a beta tester before launch (and the admin's review list).
(function () {
  "use strict";
  var MW = window.MW;
  var form = document.getElementById("beta-form");
  if (!MW || !form) return;
  var el = MW.el;
  var $ = function (id) { return document.getElementById(id); };
  MW.usernamePreview(document.getElementById("username"));

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
    if (!d.open) { form.hidden = true; $("beta-closed").hidden = false; return; }
    if (d.me) quickApply(d.me);
    else {
      var hint = el("p", { class: "prelaunch-strip" });
      hint.appendChild(document.createTextNode("Already reserved a name or have an account? "));
      hint.appendChild(el("a", { href: "/hub/login?next=" + encodeURIComponent("/hub/beta") }, "Log in"));
      hint.appendChild(document.createTextNode(" and apply in one step: no need to fill all of this in again."));
      form.parentNode.insertBefore(hint, form);
    }
  });

  // Signed in: no long form. Just say why, and press Apply.
  function quickApply(me) {
    form.hidden = true;
    var foot = form.parentNode.querySelector(".form-foot");
    if (foot) foot.hidden = true;
    var box = el("div", { class: "beta-quick" });
    form.parentNode.insertBefore(box, form);
    if (me.isBeta) {
      box.appendChild(el("p", { class: "reserve-success" }, "🧪 You're already a beta tester. Thank you!"));
      return;
    }
    if (me.application && me.application.status === "pending") {
      box.appendChild(el("p", { class: "reserve-success" }, "🐝 You've applied as @" + me.username + "."));
      box.appendChild(el("p", { class: "lead" }, "We'll let you know in your bell as soon as you're approved."));
      return;
    }
    box.appendChild(el("p", { class: "lead" }, "You're signed in as @" + me.username + ". We'll use your account details, so all we need is a line about why you'd like to test." +
      (me.application && me.application.status === "declined" ? " (You can apply again.)" : "")));
    if (!me.hasEmail || !me.hasBirthDate) {
      var fix = el("p", { class: "feedback feedback-error" }, "First add your " + (!me.hasEmail ? "email" : "date of birth") + " in ");
      fix.appendChild(el("a", { href: "/hub/profile" }, "Edit my profile"));
      box.appendChild(fix);
    }
    var label = el("label", { for: "quick-reason" }, "Why would you like to test? What do you make or enjoy?");
    var ta = el("textarea", { id: "quick-reason", maxlength: "1000", rows: "4" });
    var err = el("p", { class: "error" });
    var btn = el("button", { type: "button", class: "btn" }, "🧪 Apply as @" + me.username);
    box.appendChild(label); box.appendChild(ta); box.appendChild(err);
    var actions = el("div", { class: "hero-actions" }); actions.appendChild(btn); box.appendChild(actions);
    btn.addEventListener("click", function () {
      err.textContent = "";
      btn.disabled = true;
      MW.api("/beta/me", { method: "POST", json: { reason: ta.value } }).then(function () {
        box.textContent = "";
        box.appendChild(el("p", { class: "reserve-success" }, "🧪 Application sent!"));
        box.appendChild(el("p", { class: "lead" }, "As soon as you're approved you can start testing. You'll get a note in your bell."));
      }).catch(function (e) { err.textContent = e.message; btn.disabled = false; });
    });
  }

  $("username").addEventListener("input", function () {
    var u = $("username");
    u.value = u.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    $("form-feedback").textContent = "";
    var button = form.querySelector("button[type='submit']");
    button.disabled = true;
    MW.api("/beta", { method: "POST", json: {
      username: $("username").value, displayName: $("displayName").value, email: $("email").value,
      birthDate: $("birthDate").value, country: $("country").value, reason: $("reason").value, password: $("password").value, acceptTerms: $("acceptTerms").checked
    } }).then(function (d) {
      form.hidden = true;
      var done = $("beta-done");
      done.hidden = false;
      done.appendChild(el("p", { class: "reserve-success" }, "🧪 Application sent!"));
      done.appendChild(el("p", { class: "lead" }, (d.keptReservation ? "You'll keep your name @" + d.username + ". " : "@" + d.username + " is yours" + (d.position ? " (#" + d.position + " on the list)" : "") + ". ") +
        (d.account || d.keptReservation ? "As soon as you're approved you can log in and start testing." : "If you're approved, we'll send a link to finish setting up your account.")));
      try { localStorage.setItem("ch-reserved-here", d.username); } catch (e) { /* private mode */ }
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
    if (!user || (user.role !== "admin" && (((MW.account && MW.account.staffPerms) || []).indexOf("approve_beta") < 0))) return;
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
    // Filters for long lists: search, status, country, sort, and approving several at once.
    var apps = [];
    var filters = el("div", { class: "admin-filters" });
    var fq = el("input", { type: "search", placeholder: "Search username, name, email or reason…", "aria-label": "Search applications" });
    var fs = el("select", { "aria-label": "Status" });
    [["pending", "Waiting"], ["approved", "Approved"], ["declined", "Declined"], ["", "All"]].forEach(function (o) { fs.appendChild(el("option", { value: o[0] }, o[1])); });
    var fc = el("select", { "aria-label": "Country" });
    var fo = el("select", { "aria-label": "Sort" });
    [["old", "Oldest first"], ["new", "Newest first"], ["az", "Username A–Z"], ["long", "Longest reason"]].forEach(function (o) { fo.appendChild(el("option", { value: o[0] }, o[1])); });
    [fq, fs, fc, fo].forEach(function (x) { filters.appendChild(x); x.addEventListener(x === fq ? "input" : "change", render); });
    var bulk = el("div", { class: "admin-bulk" });
    var allBox = el("input", { type: "checkbox", "aria-label": "Select all shown" });
    var bulkOk = el("button", { type: "button", class: "btn btn-small" }, "Approve selected");
    var bulkNo = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Decline selected");
    var label = el("label", { class: "check-row" });
    label.appendChild(allBox); label.appendChild(el("span", {}, " Select all shown"));
    bulk.appendChild(label); bulk.appendChild(bulkOk); bulk.appendChild(bulkNo);
    $("beta-list").parentNode.insertBefore(filters, $("beta-list"));
    $("beta-list").parentNode.insertBefore(bulk, $("beta-list"));
    var selected = {};

    function shown() {
      var q = fq.value.trim().toLowerCase().replace(/^@/, "");
      var list = apps.filter(function (a) {
        if (fs.value && a.status !== fs.value) return false;
        if (fc.value && (a.country || "") !== fc.value) return false;
        if (q && [a.username, a.display_name, a.email, a.reason].join(" ").toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var by = { old: function (a, b) { return new Date(a.created_at) - new Date(b.created_at); },
        new: function (a, b) { return new Date(b.created_at) - new Date(a.created_at); },
        az: function (a, b) { return a.username.localeCompare(b.username); },
        long: function (a, b) { return (b.reason || "").length - (a.reason || "").length; } }[fo.value];
      return list.sort(by);
    }

    function decide(ids, action) {
      var chain = Promise.resolve();
      var done = 0;
      ids.forEach(function (id) {
        chain = chain.then(function () {
          return MW.api("/beta/admin/" + id + "/" + action, { method: "POST" }).then(function (r) {
            done += 1;
            if (action === "approve" && r.link) {
              var a = apps.filter(function (x) { return x.id === id; })[0];
              $("beta-links").appendChild(el("p", { class: "mono" }, "@" + a.username + " (" + a.email + "): " + r.link));
            }
          }).catch(function (e) { MW.toast(e.message, true); });
        });
      });
      return chain.then(function () { MW.toast((action === "approve" ? "Approved " : "Declined ") + done + "."); selected = {}; load(); });
    }
    bulkOk.addEventListener("click", function () {
      var ids = Object.keys(selected).map(Number);
      if (!ids.length) return MW.toast("Tick some applications first.", true);
      $("beta-links").textContent = "";
      decide(ids, "approve");
    });
    bulkNo.addEventListener("click", function () {
      var ids = Object.keys(selected).map(Number);
      if (!ids.length) return MW.toast("Tick some applications first.", true);
      if (!window.confirm("Decline " + ids.length + " application(s)?")) return;
      decide(ids, "decline");
    });
    allBox.addEventListener("change", function () {
      selected = {};
      if (allBox.checked) shown().forEach(function (a) { if (a.status === "pending") selected[a.id] = true; });
      render();
    });

    function render() {
      var box = $("beta-list");
      box.textContent = "";
      var pending = apps.filter(function (a) { return a.status === "pending"; }).length;
      var list = shown();
      box.appendChild(el("p", { class: "mono muted" }, apps.length + " applications · " + pending + " waiting for you · " + list.length + " shown"));
      if (!list.length) { box.appendChild(el("p", { class: "muted" }, apps.length ? "Nothing matches these filters." : "No applications yet.")); return; }
      var table = el("table", { class: "reserve-table" });
      var head = el("tr");
      ["", "Username", "Name", "Email", "Country", "Why", "Applied", "Status", ""].forEach(function (h) { head.appendChild(el("th", {}, h)); });
      table.appendChild(head);
      list.forEach(function (a) {
        var tr = el("tr");
        var tdc = el("td");
        if (a.status === "pending") {
          var cb = el("input", { type: "checkbox", "aria-label": "Select @" + a.username });
          cb.checked = Boolean(selected[a.id]);
          cb.addEventListener("change", function () { if (cb.checked) selected[a.id] = true; else delete selected[a.id]; });
          tdc.appendChild(cb);
        }
        tr.appendChild(tdc);
        tr.appendChild(el("td", {}, "@" + a.username));
        tr.appendChild(el("td", {}, a.display_name));
        tr.appendChild(el("td", {}, a.email));
        tr.appendChild(el("td", {}, a.country || ""));
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
    }

    function load() {
      MW.api("/beta/admin").then(function (d) {
        apps = d.applications;
        var cur = fc.value;
        fc.textContent = "";
        fc.appendChild(el("option", { value: "" }, "All countries"));
        apps.map(function (a) { return a.country || ""; }).filter(function (c, i, all) { return c && all.indexOf(c) === i; }).sort()
          .forEach(function (c) { fc.appendChild(el("option", { value: c }, c)); });
        fc.value = cur;
        allBox.checked = false;
        render();
      });
    }
    load();
  });
})();
