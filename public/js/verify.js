// js/verify.js  -  /hub/verify?token=...  confirms an email address
(function () {
  "use strict";
  var MW = window.MW;
  var status = document.getElementById("verify-status");
  if (!MW || !status) return;
  var q = new URLSearchParams(window.location.search);
  var school = q.get("school");
  var token = school || q.get("token") || "";
  MW.api(school ? "/account/school/verify" : "/account/verify", { method: "POST", json: { token: token } })
    .then(function () { status.textContent = school ? "🎓 You're a verified student! The badge now shows on your page." : "Thanks! Your email address is confirmed."; })
    .catch(function (e) { status.textContent = e.message; });
})();
