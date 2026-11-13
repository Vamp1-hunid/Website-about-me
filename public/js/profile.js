// js/profile.js
// Member profile: stats, saved favourites, and deleting the account.

(function () {
  "use strict";

  var MW = window.MW;
  var sub = document.getElementById("profile-sub");
  if (!sub || !MW) return;

  MW.me().then(async function (user) {
    if (!user) {
      window.location.replace("/login?next=" + encodeURIComponent("/profile"));
      return;
    }

    sub.classList.remove("loading");
    sub.textContent = user.displayName + " · @" + user.username + (user.role === "admin" ? " · site owner" : " · member");
    document.getElementById("profile-stats").hidden = false;
    document.getElementById("saved-panel").hidden = false;
    document.getElementById("password-panel").hidden = false;
    passwordMin = user.role === "admin" ? 10 : 8;
    if (user.role === "admin") {
      document.getElementById("admin-link").hidden = false;
    } else {
      document.getElementById("delete-panel").hidden = false;
    }

    try {
      var stats = await MW.api("/account/stats");
      document.getElementById("stat-joined").textContent = MW.formatDate(stats.joined);
      document.getElementById("stat-favourites").textContent = stats.favourites;
      document.getElementById("stat-likes").textContent = stats.likes;
      document.getElementById("stat-comments").textContent = stats.comments;
      showSecurity(stats);
    } catch (error) {
      MW.toast(error.message, true);
    }

    var box = document.getElementById("favourites");
    try {
      var data = await MW.api("/account/favourites");
      MW.renderWorks(box, data.favourites, "Nothing saved yet. Press ☆ Save on any work to keep it here.");
    } catch (error) {
      box.textContent = error.message;
    }
  });

  /* ---------- Google sign-in and password state ---------- */

  var hasPassword = true;

  function showSecurity(stats) {
    hasPassword = Boolean(stats.hasPassword);

    // Accounts made with Google have no password yet: "Set a password" instead of "Change".
    if (!hasPassword) {
      document.getElementById("password-title").textContent = "Set a password";
      document.getElementById("current-password-row").hidden = true;
      document.querySelector("#password-form button[type='submit']").textContent = "Set password";
      document.getElementById("delete-label").textContent = "Type your username to confirm";
      document.getElementById("delete-password").type = "text";
      document.getElementById("delete-password").autocomplete = "off";
    }

    if (!MW.googleEnabled && !stats.googleLinked) return;
    document.getElementById("google-panel").hidden = false;
    var status = document.getElementById("google-status");
    var linkBtn = document.getElementById("google-link");
    var unlinkBtn = document.getElementById("google-unlink");

    if (stats.googleLinked) {
      status.textContent = "Your Google account is linked: you can log in with “Continue with Google”.";
      unlinkBtn.hidden = !hasPassword; // can't unlink without a password, or you'd be locked out
      if (!hasPassword) {
        status.textContent += " Set a password below if you also want to log in without Google.";
      }
    } else {
      status.textContent = "Link your Google account to log in with one click.";
      linkBtn.hidden = !MW.googleEnabled;
    }
  }

  document.getElementById("google-unlink").addEventListener("click", async function () {
    var button = this;
    button.disabled = true;
    try {
      await MW.api("/account/google/unlink", { method: "POST" });
      MW.toast("Google sign-in removed from your account.");
      window.setTimeout(function () { window.location.reload(); }, 600);
    } catch (error) {
      MW.toast(error.message, true);
      button.disabled = false;
    }
  });

  var googleResult = new URLSearchParams(window.location.search).get("google");
  var googleMessages = {
    linked: ["Google account linked.", false],
    taken: ["That Google account is already linked to a different member.", true],
    cancelled: ["Google sign-in was cancelled.", true],
    expired: ["That Google sign-in took too long. Please try again.", true],
    failed: ["Google sign-in didn't work. Please try again.", true],
    off: ["Google sign-in isn't switched on yet.", true]
  };
  if (googleResult && googleMessages[googleResult]) {
    MW.toast(googleMessages[googleResult][0], googleMessages[googleResult][1]);
    history.replaceState(null, "", "/profile");
  }

  /* ---------- Change password ---------- */

  var passwordMin = 8;
  var passwordForm = document.getElementById("password-form");
  var passwordFeedback = document.getElementById("password-feedback");

  passwordForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    passwordFeedback.textContent = "";
    passwordFeedback.className = "feedback";

    var current = document.getElementById("current-password").value;
    var next = document.getElementById("new-password").value;
    var repeat = document.getElementById("new-password2").value;

    var problems = [];
    if (hasPassword && !current) problems.push({ field: "currentPassword", message: "Enter your current password." });
    if (next.length < passwordMin) {
      problems.push({ field: "newPassword", message: "The new password must be at least " + passwordMin + " characters." });
    } else if (next === current) {
      problems.push({ field: "newPassword", message: "Choose a password different from your current one." });
    }
    if (repeat !== next) problems.push({ field: "newPassword2", message: "The two new passwords don't match." });
    MW.showProblems(passwordForm, problems);
    if (problems.length) return;

    var button = passwordForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      await MW.api("/account/password", { method: "POST", json: { currentPassword: current, newPassword: next } });
      passwordForm.reset();
      passwordFeedback.className = "feedback feedback-success";
      passwordFeedback.textContent = hasPassword
        ? "Password changed. Any other devices where you were logged in have been signed out."
        : "Password set. You can now also log in with your username and password.";
      MW.toast(hasPassword ? "Password changed." : "Password set.");
      if (!hasPassword) window.setTimeout(function () { window.location.reload(); }, 1200);
    } catch (error) {
      MW.showProblems(passwordForm, (error.data && error.data.problems) || []);
      passwordFeedback.className = "feedback feedback-error";
      passwordFeedback.textContent = error.message;
    }
    button.disabled = false;
  });

  /* ---------- Delete account ---------- */

  var form = document.getElementById("delete-form");
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var password = document.getElementById("delete-password").value;
    if (!password) {
      MW.showProblems(form, [{ field: "password", message: hasPassword ? "Type your password to confirm." : "Type your username to confirm." }]);
      return;
    }
    var button = form.querySelector("button[type='submit']");
    if (button.getAttribute("data-confirm") !== "yes") {
      button.setAttribute("data-confirm", "yes");
      button.textContent = "Yes, delete everything";
      MW.showProblems(form, []);
      return;
    }
    button.disabled = true;
    try {
      await MW.api("/account", { method: "DELETE", json: { password: password } });
      window.location.href = "/";
    } catch (error) {
      MW.showProblems(form, [{ field: "password", message: error.message }]);
      button.disabled = false;
    }
  });
})();
