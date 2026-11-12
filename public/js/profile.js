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
