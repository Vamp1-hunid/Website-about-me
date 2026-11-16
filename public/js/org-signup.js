// js/org-signup.js  -  /hub/join-organisation: one shared account for a group, plus its creator application.
(function () {
  "use strict";
  var MW = window.MW;
  var form = document.getElementById("org-form");
  if (!MW || !form) return;
  var el = MW.el;
  var $ = function (id) { return document.getElementById(id); };

  MW.api("/account/org-types").then(function (d) {
    Object.keys(d.types).forEach(function (k) { $("orgType").appendChild(el("option", { value: k }, d.types[k])); });
  });
  // Countries (same list style as the personal sign-up)
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

  var previewOrg = MW.usernamePreview($("username"));
  // Suggest a handle and username from the organisation name.
  $("orgName").addEventListener("input", function () {
    var slug = $("orgName").value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
    if (!$("handle").dataset.touched) { $("handle").value = slug; $("handle-preview").textContent = slug || "your-handle"; }
    if (!$("username").dataset.touched) { var sug = slug.replace(/-/g, "_"); if (sug && sug.indexOf("_") < 0) sug = (sug + "_org").slice(0, 30); $("username").value = sug; if (previewOrg) previewOrg(); }
  });
  ["handle", "username"].forEach(function (id) {
    $(id).addEventListener("input", function () { $(id).dataset.touched = "1"; if (id === "handle") $("handle-preview").textContent = $("handle").value || "your-handle"; });
  });

  // Team list
  function memberRow(m) {
    m = m || {};
    var row = el("div", { class: "team-row" });
    var name = el("input", { type: "text", placeholder: "Name", maxlength: "80", "aria-label": "Team member name", value: m.name || "" });
    var role = el("input", { type: "text", placeholder: "Role (e.g. Illustrator)", maxlength: "80", "aria-label": "Role", value: m.role || "" });
    var user = el("input", { type: "text", placeholder: "@username (optional)", maxlength: "31", "aria-label": "Their Chapterhive username", value: m.username || "" });
    var remove = el("button", { type: "button", class: "btn btn-ghost btn-small", "aria-label": "Remove" }, "✕");
    remove.addEventListener("click", function () { row.remove(); });
    row.append(name, role, user, remove);
    return row;
  }
  $("add-member").addEventListener("click", function () {
    if ($("team-list").children.length >= 30) { MW.toast("Up to 30 team members.", true); return; }
    $("team-list").appendChild(memberRow());
  });
  $("team-list").appendChild(memberRow());

  function team() {
    return Array.prototype.map.call($("team-list").children, function (row) {
      var f = row.querySelectorAll("input");
      return { name: f[0].value.trim(), role: f[1].value.trim(), username: f[2].value.trim() };
    }).filter(function (m) { return m.name; });
  }
  function kinds() {
    return Array.prototype.filter.call(document.querySelectorAll("#kinds input"), function (b) { return b.checked; }).map(function (b) { return b.value; });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var fb = $("form-feedback");
    fb.textContent = "";
    var local = [];
    if (!kinds().length) local.push({ field: "kinds", message: "Choose at least one kind of work." });
    if ($("application").value.trim().length < 30) local.push({ field: "application", message: "Tell us a little about your organisation (at least 30 characters)." });
    MW.showProblems(form, local);
    if (local.length) { fb.textContent = "Please fix the highlighted fields."; return; }
    var button = form.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      await MW.api("/account/register-org", { method: "POST", json: {
        orgName: $("orgName").value, orgType: $("orgType").value, website: $("website").value, country: $("country").value,
        contactName: $("contactName").value, contactRole: $("contactRole").value, birthDate: $("birthDate").value,
        team: team(), username: $("username").value, email: $("email").value, password: $("password").value,
        acceptTerms: $("acceptTerms").checked, confirmAuthority: $("confirmAuthority").checked, marketing: $("marketing").checked
      } });
      // Account made: now send the creator application for the organisation's page.
      try {
        await MW.api("/hub/apply", { method: "POST", json: {
          handle: $("handle").value.trim().toLowerCase(), name: $("orgName").value.trim(), tagline: "",
          kinds: kinds(), application: $("application").value.trim(), links: /^https:\/\//i.test($("website").value) ? [{ url: $("website").value.trim() }] : [], agree: true
        } });
        window.location.href = "/hub/apply?org=1";
      } catch (applyError) {
        // The account exists; finish the creator page details on the application page.
        window.location.href = "/hub/apply?org=1&fix=1";
      }
    } catch (error) {
      MW.showProblems(form, (error.data && error.data.problems) || []);
      fb.textContent = error.message;
      button.disabled = false;
    }
  });
})();
