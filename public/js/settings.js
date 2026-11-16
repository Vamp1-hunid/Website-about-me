// js/settings.js  -  /hub/settings: privacy and account settings in one place.
//   Active status · who can message me · who can open my member page · who can see my posts (creators)
//   · my feed · links to the rest of my account (picture, bio, password, email, blocked members).
(function () {
  "use strict";
  var MW = window.MW;
  var body = document.getElementById("settings-body");
  if (!MW || !body) return;
  var el = MW.el;

  function section(title, help) {
    var s = el("section", { class: "settings-section" });
    s.appendChild(el("h2", {}, title));
    if (help) s.appendChild(el("p", { class: "muted" }, help));
    body.appendChild(s);
    return s;
  }
  function save(json, message) {
    return MW.api("/account/privacy", { method: "PUT", json: json })
      .then(function () { MW.toast(message || "Saved."); })
      .catch(function (e) { MW.toast(e.message, true); });
  }
  // A switch row: label on the left, toggle on the right.
  function switchRow(label, help, checked, onChange) {
    var row = el("div", { class: "settings-row" });
    var text = el("div");
    text.appendChild(el("strong", {}, label));
    if (help) text.appendChild(el("p", { class: "muted" }, help));
    var sw = el("label", { class: "switch" });
    var box = el("input", { type: "checkbox", role: "switch", "aria-label": label });
    box.checked = checked;
    box.addEventListener("change", function () { onChange(box.checked); });
    sw.append(box, el("span", { class: "switch-track", "aria-hidden": "true" }));
    row.append(text, sw);
    return row;
  }
  // A choice row: radio options as large tappable cards.
  function choiceRow(name, options, value, onChange) {
    var row = el("div", { class: "settings-choices", role: "radiogroup" });
    options.forEach(function (o) {
      var label = el("label", { class: "settings-choice" + (o[0] === value ? " is-on" : "") });
      var input = el("input", { type: "radio", name: name, value: o[0] });
      input.checked = o[0] === value;
      input.addEventListener("change", function () {
        row.querySelectorAll(".settings-choice").forEach(function (c) { c.classList.remove("is-on"); });
        label.classList.add("is-on");
        onChange(o[0]);
      });
      var t = el("span");
      t.appendChild(el("strong", {}, o[1]));
      t.appendChild(el("span", { class: "muted" }, o[2]));
      label.append(input, t);
      row.appendChild(label);
    });
    return row;
  }

  MW.me().then(function (user) {
    if (!user) {
      body.textContent = "";
      body.appendChild(MW.guestGate("Log in to change your settings."));
      return;
    }
    return MW.api("/account/privacy").then(function (p) {
      body.textContent = "";

      var s1 = section("Active status", "Shows a green dot on your profile and in chat while you're online.");
      s1.appendChild(switchRow("Show when I'm active", null, p.showOnline !== false, function (on) {
        save({ showOnline: on }, on ? "People can see when you're online." : "You now appear offline to everyone.");
      }));

      if (MW.feature("chat")) {
        var teen = MW.account && MW.account.account && MW.account.account.teen;
        var s2 = section("Messages", teen ? "Teen accounts can only ever be messaged by other teen accounts." : null);
        s2.appendChild(choiceRow("chatPrivacy", [
          ["everyone", "Everyone", teen ? "Any teen account can start a chat with you." : "Any member can start a chat with you."],
          ["following", "Only creators I follow", "Only people whose creator page you follow."],
          ["nobody", "Nobody", "No new chats. You can still start chats yourself."]
        ], p.chatPrivacy || "everyone", function (v) { save({ chatPrivacy: v }, "Message settings saved."); }));
        s2.appendChild(switchRow("🧪 Let beta testers message me", "Beta testers can start a chat with you even if the choice above would stop them.", p.betaCanMessage === true, function (on) {
          save({ betaCanMessage: on }, on ? "Beta testers can now message you." : "Beta testers follow your usual message settings.");
        }));
      }

      var s3 = section("My member page", "Your public page with your name, picture, bio and recent comments.");
      s3.appendChild(switchRow("Let other members see my page", "When off, only you can open it.", p.profileVisible !== false, function (on) {
        save({ profileVisible: on }, on ? "Your page is visible to members." : "Your page is now private.");
      }));

      if (p.isCreator) {
        var s4 = section("Who can see my posts", "Applies to everything you publish on your creator page.");
        s4.appendChild(choiceRow("postVisibility", [
          ["everyone", "Everyone", "Anyone, including visitors without an account (they see previews)."],
          ["members", "Members only", "Only people who are logged in."],
          ["followers", "Followers only", "Only people who follow your creator page."]
        ], p.postVisibility || "everyone", function (v) { save({ postVisibility: v }, "Post privacy saved."); }));
      }

      // Content filters
      var sf = section("Content filters", "Choose what you're comfortable seeing. Creators rate every post they publish.");
      var ratings = [["all", "All ages only", "Hide anything rated Teen or Mature."],
        ["teen", "Up to Teen (13+)", "Some violence, scary or mature themes. The default."]];
      if (p.adult) ratings.push(["mature", "Include Mature (18+)", "Strong violence and adult themes. Adults only."]);
      sf.appendChild(choiceRow("maxRating", ratings, p.maxRating || "teen", function (v) { save({ maxRating: v }, "Content filter saved."); }));
      if (!p.adult) sf.appendChild(el("p", { class: "muted" }, "Mature content is only available to adults (18+)."));
      sf.appendChild(switchRow("Hide posts with strong language", "Posts the creator marked as containing strong or offensive language.", Boolean(p.hideStrongLanguage), function (on) {
        save({ hideStrongLanguage: on }, on ? "Posts with strong language are hidden." : "Posts with strong language are shown.");
      }));

      if (MW.feature("daily_verse")) {
        var sv = section("Daily Bible verse", "A short verse at the top of your feed each day, from the Good News Translation.");
        sv.appendChild(switchRow("Show me a daily Bible verse", null, Boolean(p.dailyVerse), function (on) {
          save({ dailyVerse: on }, on ? "You'll see a verse at the top of your feed." : "Daily verse turned off.");
        }));
      }

      // Student verification
      var ss = section("🎓 Student verification", "Confirm a school or university email to get a Verified student badge. The address stays private.");
      if (p.school && p.school.verified) {
        ss.appendChild(el("p", { class: "feedback feedback-success" }, "✓ Verified student (" + p.school.email + ")."));
      } else {
        if (p.school && p.school.email) ss.appendChild(el("p", { class: "muted" }, "We sent a link to " + p.school.email + ". Open it to finish."));
        var sform = el("form", { class: "settings-inline", novalidate: "" });
        var sinput = el("input", { type: "email", placeholder: "you@school.ac.zm", "aria-label": "School email", id: "schoolEmail" });
        var sbtn = el("button", { type: "submit", class: "btn btn-small" }, "Send link");
        sform.append(sinput, sbtn);
        sform.addEventListener("submit", function (e) {
          e.preventDefault();
          sbtn.disabled = true;
          MW.api("/account/school", { method: "POST", json: { email: sinput.value } })
            .then(function () { MW.toast("Check your school inbox for the link."); })
            .catch(function (err) { MW.toast(err.message, true); })
            .then(function () { sbtn.disabled = false; });
        });
        ss.appendChild(sform);
      }

      var s5 = section("Your feed", "Your For you feed learns from your likes, saves and the ⋯ See more / See less buttons.");
      var acts = el("div", { class: "settings-actions" });
      var retake = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Retake the interests survey");
      retake.addEventListener("click", function () {
        var sc = document.createElement("script");
        sc.src = "/js/onboarding.js";
        sc.onload = function () { MW.runOnboarding(user); };
        document.head.appendChild(sc);
      });
      var reset = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Reset my feed");
      reset.addEventListener("click", function () {
        if (!window.confirm("Forget everything your feed has learned about what you like?")) return;
        MW.api("/account/interests", { method: "DELETE" }).then(function () { MW.toast("Your feed has been reset."); });
      });
      acts.append(retake, reset);
      s5.appendChild(acts);

      var s6 = section("Account", null);
      var links = el("ul", { class: "settings-links" });
      [["/profile", "👤 Profile picture, bio and details"], ["/profile#email-panel", "✉️ Email address"], ["/profile#password-panel", "🔑 Password"],
       ["/profile#details-panel", "🚫 Blocked members"], ["/hub/chat", "💬 Chat"], ["/profile#delete-panel", "🗑️ Delete my account"]]
        .forEach(function (l) {
          var li = el("li");
          li.appendChild(el("a", { href: l[0] }, l[1]));
          links.appendChild(li);
        });
      s6.appendChild(links);
    });
  }).catch(function (e) { body.textContent = e.message; });
})();
