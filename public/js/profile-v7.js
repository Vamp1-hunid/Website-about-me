/* public/js/profile-v7.js  -  "Your details & privacy" on Account settings:
   date of birth (once), country, email confirmation, news emails, who can chat with you, blocked members. */
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;

  MW.me().then(function (user) {
    if (!user || !MW.account || !MW.account.account) return;
    var d = MW.account.account;
    var anchor = document.getElementById("saved-panel") || document.querySelector("main .panel");
    if (!anchor) return;

    var panel = el("section", { class: "panel", id: "details-panel", "aria-labelledby": "details-title" });
    panel.appendChild(el("p", { class: "node-label" }, "Account // details & privacy"));
    panel.appendChild(el("h2", { id: "details-title" }, "Your details & privacy"));
    var form = el("form", { novalidate: "" });

    // Date of birth: asked once. Older accounts made before we asked can add it here.
    var bdRow = el("div", { class: "form-row" });
    if (d.hasBirthDate) {
      bdRow.appendChild(el("p", {}, "Date of birth: saved (hidden from everyone)." + (d.teen ? " You have a teen account, which keeps chat between teen accounts only." : "")));
    } else {
      bdRow.appendChild(el("label", { for: "d-birth" }, "Date of birth"));
      bdRow.appendChild(el("input", { type: "date", id: "d-birth", name: "birthDate", max: new Date().toISOString().slice(0, 10) }));
      bdRow.appendChild(el("p", { class: "muted" }, "Needed for chat. It can only be set once and is never shown to anyone."));
      bdRow.appendChild(el("p", { class: "error", id: "birthDate-error" }));
    }
    form.appendChild(bdRow);

    var cRow = el("div", { class: "form-row" });
    cRow.appendChild(el("label", { for: "d-country" }, "Country or region"));
    var country = el("select", { id: "d-country", name: "country" });
    country.appendChild(el("option", { value: "" }, "Choose…"));
    var names;
    try { names = new Intl.DisplayNames([navigator.language || "en"], { type: "region" }); } catch (e) { names = null; }
    var codes = [];
    for (var i = 65; i <= 90; i++) for (var j = 65; j <= 90; j++) codes.push(String.fromCharCode(i, j));
    codes.map(function (c) {
      var n = names ? names.of(c) : c;
      return n && n !== c && ["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"].indexOf(c) < 0 ? [c, n] : null;
    }).filter(Boolean).sort(function (a, b) { return a[1].localeCompare(b[1]); }).forEach(function (c) {
      country.appendChild(el("option", { value: c[0] }, c[1]));
    });
    if (d.country) country.value = d.country;
    cRow.appendChild(country);
    cRow.appendChild(el("p", { class: "error", id: "country-error" }));
    form.appendChild(cRow);

    var gRow = el("div", { class: "form-row" });
    gRow.appendChild(el("label", { for: "d-gender" }, "Gender (private)"));
    var gender = el("select", { id: "d-gender" });
    [["unspecified", "Prefer not to say"], ["male", "Male"], ["female", "Female"]].forEach(function (o) { gender.appendChild(el("option", { value: o[0] }, o[1])); });
    gender.value = d.gender || "unspecified";
    gRow.appendChild(gender);
    if (d.accountType !== "organisation") form.appendChild(gRow);

    var chatRow = el("div", { class: "form-row" });
    chatRow.appendChild(el("label", { for: "d-chat" }, "Who can start a chat with you"));
    var chat = el("select", { id: "d-chat", name: "chatPrivacy" });
    chat.appendChild(el("option", { value: "everyone" }, d.teen ? "Any teen account" : "Any member"));
    chat.appendChild(el("option", { value: "nobody" }, "Nobody (only chats I start)"));
    chat.value = d.chatPrivacy || "everyone";
    chatRow.appendChild(chat);
    form.appendChild(chatRow);

    var mk = el("label", { class: "check-row" });
    var mkBox = el("input", { type: "checkbox", id: "d-marketing" });
    mk.appendChild(mkBox);
    mk.appendChild(el("span", {}, " Email me occasional Chapterhive news"));
    form.appendChild(mk);

    var save = el("button", { type: "submit" }, "Save details");
    var fb = el("p", { class: "feedback", "aria-live": "polite" });
    form.appendChild(save);
    form.appendChild(fb);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var json = { country: country.value || undefined, chatPrivacy: chat.value, marketing: mkBox.checked };
      if (d.accountType !== "organisation") json.gender = gender.value;
      var birth = document.getElementById("d-birth");
      if (birth && birth.value) json.birthDate = birth.value;
      save.disabled = true;
      MW.api("/account/details", { method: "PUT", json: json }).then(function () {
        fb.className = "feedback feedback-success";
        fb.textContent = "Saved.";
        if (json.birthDate) setTimeout(function () { window.location.reload(); }, 600);
      }).catch(function (e) {
        MW.showProblems(form, (e.data && e.data.problems) || []);
        fb.className = "feedback feedback-error";
        fb.textContent = e.message;
      }).then(function () { save.disabled = false; });
    });
    panel.appendChild(form);

    // Feed personalisation
    var fp = el("div", { class: "feed-prefs" });
    fp.appendChild(el("h3", {}, "Your feed"));
    fp.appendChild(el("p", { class: "muted" }, "Your For you feed learns from your likes, saves and the ⋯ See more / See less buttons."));
    var retake = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Retake the interests survey");
    retake.addEventListener("click", function () {
      var s = document.createElement("script");
      s.src = "/js/onboarding.js";
      s.onload = function () { MW.runOnboarding(user); };
      document.head.appendChild(s);
    });
    var reset = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Reset my feed");
    reset.addEventListener("click", function () {
      if (!window.confirm("Forget everything your feed has learned about what you like?")) return;
      MW.api("/account/interests", { method: "DELETE" }).then(function () { MW.toast("Your feed has been reset."); });
    });
    fp.append(retake, document.createTextNode(" "), reset);
    panel.appendChild(fp);

    // Email confirmation
    if (d.hasEmail) {
      var ev = el("p", { class: "muted" }, d.emailVerified ? "✓ Your email address is confirmed." : "Your email address isn't confirmed yet. ");
      if (!d.emailVerified && MW.account.mailEnabled) {
        var resend = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Send confirmation link");
        resend.addEventListener("click", function () {
          resend.disabled = true;
          MW.api("/account/verify/send", { method: "POST" }).then(function () { MW.toast("Check your inbox for the link."); })
            .catch(function (e) { MW.toast(e.message, true); resend.disabled = false; });
        });
        ev.appendChild(resend);
      }
      panel.appendChild(ev);
    }

    // Blocked members
    if (MW.feature("chat")) {
      var blocks = el("div");
      panel.appendChild(el("h3", {}, "Blocked members"));
      panel.appendChild(blocks);
      MW.api("/chat/blocks").then(function (data) {
        if (!data.blocks.length) { blocks.appendChild(el("p", { class: "muted" }, "You haven't blocked anyone.")); return; }
        var ul = el("ul");
        data.blocks.forEach(function (b) {
          var li = el("li", {}, "@" + b.username + " ");
          var un = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Unblock");
          un.addEventListener("click", function () {
            MW.api("/chat/blocks/" + encodeURIComponent(b.username), { method: "DELETE" }).then(function () { li.remove(); });
          });
          li.appendChild(un);
          ul.appendChild(li);
        });
        blocks.appendChild(ul);
      }).catch(function () {});
    }

    anchor.parentNode.insertBefore(panel, anchor);

    // Bio: a few lines about you, shown on your public member page.
    var bioPanel = el("section", { class: "panel", id: "bio-panel", "aria-labelledby": "bio-title" });
    bioPanel.appendChild(el("p", { class: "node-label" }, "Account // bio"));
    bioPanel.appendChild(el("h2", { id: "bio-title" }, "Bio"));
    bioPanel.appendChild(el("p", { class: "muted" }, "A few lines about you: what you love reading, watching or making. Shown on your public page."));
    var bioForm = el("form", { novalidate: "" });
    var bioRow = el("div", { class: "form-row" });
    bioRow.appendChild(el("label", { for: "bio", class: "sr-only" }, "Bio"));
    var bio = el("textarea", { id: "bio", name: "bio", rows: "3", maxlength: "300", placeholder: "e.g. Fantasy reader, part-time poet, always hunting for a good horror manga." });
    var count = el("p", { class: "muted mono bio-count" }, "0 / 300");
    bio.addEventListener("input", function () { count.textContent = bio.value.length + " / 300"; });
    bioRow.append(bio, count, el("p", { class: "error", id: "bio-error" }));
    var bioSave = el("button", { type: "submit" }, "Save bio");
    var bioFb = el("p", { class: "feedback", "aria-live": "polite" });
    bioForm.append(bioRow, bioSave, bioFb);
    bioPanel.appendChild(bioForm);
    MW.api("/account/bio").then(function (d) { bio.value = d.bio || ""; count.textContent = bio.value.length + " / 300"; }).catch(function () {});
    bioForm.addEventListener("submit", function (event) {
      event.preventDefault();
      bioSave.disabled = true;
      MW.api("/account/bio", { method: "PUT", json: { bio: bio.value } }).then(function () {
        bioFb.className = "feedback feedback-success"; bioFb.textContent = "Saved. It's on your public page now.";
      }).catch(function (e) {
        MW.showProblems(bioForm, (e.data && e.data.problems) || []);
        bioFb.className = "feedback feedback-error"; bioFb.textContent = e.message;
      }).then(function () { bioSave.disabled = false; });
    });
    // Skills: shown as chips under the bio.
    var skillsBox = el("div", { class: "skills-edit" });
    skillsBox.appendChild(el("h3", {}, "Skills"));
    skillsBox.appendChild(el("p", { class: "muted" }, "Pick up to 8 things you do. They show under your bio, so collaborators can find you."));
    var chips = el("div", { class: "skill-chips" });
    skillsBox.appendChild(chips);
    bioPanel.appendChild(skillsBox);
    MW.api("/account/skills").then(function (d) {
      var picked = d.skills.slice();
      d.options.forEach(function (s) {
        var b = el("button", { type: "button", class: "skill-chip" + (picked.indexOf(s) >= 0 ? " is-on" : ""), "aria-pressed": String(picked.indexOf(s) >= 0) }, s);
        b.addEventListener("click", function () {
          var i = picked.indexOf(s);
          if (i >= 0) picked.splice(i, 1);
          else if (picked.length >= 8) { MW.toast("Up to 8 skills.", true); return; }
          else picked.push(s);
          b.classList.toggle("is-on", i < 0);
          b.setAttribute("aria-pressed", String(i < 0));
          MW.api("/account/skills", { method: "PUT", json: { skills: picked } }).catch(function (e) { MW.toast(e.message, true); });
        });
        chips.appendChild(b);
      });
    }).catch(function () {});
    panel.parentNode.insertBefore(bioPanel, panel);
  });
})();
