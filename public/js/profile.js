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
    if (!current) problems.push({ field: "currentPassword", message: "Enter your current password." });
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
      passwordFeedback.textContent = "Password changed. Any other devices where you were logged in have been signed out.";
      MW.toast("Password changed.");
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
      MW.showProblems(form, [{ field: "password", message: "Type your password to confirm." }]);
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
