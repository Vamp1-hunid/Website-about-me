/* public/js/profile-v5.js  -  streak and the online-status switch on Account settings */
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  MW.me().then(function (user) {
    if (!user || !MW.account) return;
    var a = MW.account;
    if (MW.feature("streaks")) {
      document.getElementById("stat-streak-box").hidden = false;
      document.getElementById("stat-streak").textContent = "🔥 " + (a.streak || 0) + " day" + (a.streak === 1 ? "" : "s") + (a.streakBest > a.streak ? " (best " + a.streakBest + ")" : "");
    }
    if (!MW.feature("online_status")) return;
    var panel = document.getElementById("presence-panel");
    var box = document.getElementById("show-online");
    var fb = document.getElementById("presence-feedback");
    panel.hidden = false;
    box.checked = a.showOnline !== false;
    box.addEventListener("change", function () {
      box.disabled = true;
      MW.api("/account/presence", { method: "PUT", json: { showOnline: box.checked } }).then(function () {
        fb.className = "feedback feedback-success";
        fb.textContent = box.checked ? "People can see when you're online." : "You now appear offline to everyone.";
      }).catch(function (e) {
        box.checked = !box.checked;
        fb.className = "feedback feedback-error";
        fb.textContent = e.message;
      }).then(function () { box.disabled = false; });
    });
  });
})();
