// js/hub-apply.js  -  apply to become a creator (/hub/apply)
(function () {
  "use strict";
  var MW = window.MW;
  var form = document.getElementById("apply-form");
  if (!MW || !form) return;
  var el = MW.el;
  var status = document.getElementById("apply-status");
  var linksBox = document.getElementById("apply-links");

  function linkRow(link) {
    var row = el("div", { class: "link-row" });
    var label = el("input", { type: "text", maxlength: "30", placeholder: "Label, e.g. Instagram", "aria-label": "Link label", value: (link && link.label) || "" });
    var url = el("input", { type: "url", maxlength: "300", placeholder: "https://…", "aria-label": "Link", value: (link && link.url) || "" });
    var remove = el("button", { type: "button", class: "btn btn-ghost btn-small", "aria-label": "Remove link" }, "✕");
    remove.addEventListener("click", function () { row.remove(); });
    row.append(label, url, remove);
    return row;
  }
  document.getElementById("add-link").addEventListener("click", function () { linksBox.appendChild(linkRow()); });

  function showStatus(profile) {
    status.textContent = "";
    if (!profile) return;
    var card = el("div", { class: "status-card is-" + profile.status });
    var messages = {
      pending: "Your application for @" + profile.handle + " is being reviewed. We'll email you if you added an email to your account. You can update it below.",
      approved: "You're an approved creator. Head to your studio to publish.",
      rejected: "Your last application wasn't approved." + (profile.reviewNote ? " Note: " + profile.reviewNote : "") + " You can update it and apply again below.",
      suspended: "This creator profile is suspended. Contact the Chapterhive team through the contact form."
    };
    card.appendChild(el("p", {}, messages[profile.status]));
    if (profile.status === "approved") card.appendChild(el("a", { class: "btn btn-small", href: "/hub/studio" }, "Open studio"));
    status.appendChild(card);
  }

  MW.me().then(async function (user) {
    if (!user) {
      status.textContent = "";
      var p = el("p", { class: "lead" });
      p.appendChild(document.createTextNode("First, "));
      p.appendChild(el("a", { href: "/hub/register?next=/hub/apply" }, "create a free account"));
      p.appendChild(document.createTextNode(" or "));
      p.appendChild(el("a", { href: "/hub/login?next=/hub/apply" }, "log in"));
      p.appendChild(document.createTextNode(". Then come back here to apply."));
      status.appendChild(p);
      return;
    }
    var data = await MW.api("/hub/me");
    var profile = data.profile;
    showStatus(profile);
    if (data.isAdmin || (profile && (profile.status === "approved" || profile.status === "suspended"))) return;
    form.hidden = false;
    if (profile) {
      form.handle.value = profile.handle;
      document.getElementById("cname").value = profile.name;
      form.tagline.value = profile.tagline || "";
      form.application.value = profile.application || "";
      document.querySelectorAll("#kinds input").forEach(function (i) { i.checked = (profile.kinds || []).includes(i.value); });
      (profile.links || []).forEach(function (l) { linksBox.appendChild(linkRow(l)); });
    } else {
      document.getElementById("cname").value = user.displayName;
      document.getElementById("handle").value = user.username.replace(/_/g, "-");
    }
    if (!linksBox.children.length) linksBox.appendChild(linkRow());
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var fb = document.getElementById("apply-feedback");
    fb.className = "feedback";
    fb.textContent = "";
    var payload = {
      handle: form.handle.value,
      name: document.getElementById("cname").value,
      tagline: form.tagline.value,
      application: form.application.value,
      kinds: Array.prototype.filter.call(document.querySelectorAll("#kinds input"), function (i) { return i.checked; }).map(function (i) { return i.value; }),
      links: Array.prototype.map.call(linksBox.children, function (row) {
        var inputs = row.querySelectorAll("input");
        return { label: inputs[0].value, url: inputs[1].value.trim() };
      }).filter(function (l) { return l.url; }),
      agree: document.getElementById("agree").checked
    };
    var button = form.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      var data = await MW.api("/hub/apply", { method: "POST", json: payload });
      MW.showProblems(form, []);
      showStatus(data.profile);
      fb.className = "feedback feedback-success";
      fb.textContent = "Application sent. Thank you!";
      status.scrollIntoView({ block: "center" });
    } catch (error) {
      var problems = (error.data && error.data.problems) || [];
      MW.showProblems(form, problems.map(function (p) {
        return { field: p.field === "kinds" ? "kinds" : p.field === "links" ? "links" : p.field, message: p.message };
      }));
      var agreeProblem = problems.find(function (p) { return p.field === "agree"; });
      document.getElementById("agree-error").textContent = agreeProblem ? agreeProblem.message : "";
      fb.className = "feedback feedback-error";
      fb.textContent = error.message;
    }
    button.disabled = false;
  });
})();
