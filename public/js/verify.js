// js/verify.js  -  /hub/verify?token=...  confirms an email address
(function () {
  "use strict";
  var MW = window.MW;
  var status = document.getElementById("verify-status");
  if (!MW || !status) return;
  var token = new URLSearchParams(window.location.search).get("token") || "";
  MW.api("/account/verify", { method: "POST", json: { token: token } })
    .then(function () { status.textContent = "Thanks! Your email address is confirmed."; })
    .catch(function (e) { status.textContent = e.message; });
})();
