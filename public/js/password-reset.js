// js/password-reset.js
// "Forgot password" (/forgot) asks for a reset email; /reset?token=... sets the new password.

(function () {
  "use strict";

  var MW = window.MW;
  if (!MW) return;

  /* ---------- /forgot ---------- */
  var forgot = document.getElementById("forgot-form");
  if (forgot) {
    var feedback = document.getElementById("form-feedback");
    MW.me().then(function () {
      if (MW.mailEnabled === false) {
        document.getElementById("forgot-intro").textContent =
          "Password reset by email isn't switched on yet. Please use the contact form on the Creator page and the site owner will help you.";
        forgot.hidden = true;
      }
    });
    forgot.addEventListener("submit", async function (event) {
      event.preventDefault();
      var value = document.getElementById("identifier").value.trim();
      if (!value) {
        MW.showProblems(forgot, [{ field: "identifier", message: "Enter your username or email." }]);
        return;
      }
      MW.showProblems(forgot, []);
      var button = forgot.querySelector("button");
      button.disabled = true;
      feedback.className = "feedback";
      try {
        var data = await MW.api("/account/forgot", { method: "POST", json: { identifier: value } });
        feedback.className = "feedback feedback-success";
        feedback.textContent = data.message;
      } catch (error) {
        feedback.className = "feedback feedback-error";
        feedback.textContent = error.message;
        button.disabled = false;
      }
    });
  }

  /* ---------- /reset ---------- */
  var reset = document.getElementById("reset-form");
  if (reset) {
    var token = new URLSearchParams(window.location.search).get("token") || "";
    var intro = document.getElementById("reset-intro");
    var minLength = 8;
    // Remove the token from the address bar, so it isn't left in the browser history.
    history.replaceState(null, "", "/reset");

    MW.api("/account/reset?token=" + encodeURIComponent(token))
      .then(function (data) {
        minLength = data.minLength;
        intro.textContent = "Choose a new password for @" + data.username + ".";
        document.getElementById("password-hint").textContent = "At least " + minLength + " characters.";
        reset.hidden = false;
        document.getElementById("password").focus();
      })
      .catch(function (error) {
        intro.textContent = error.message;
        var again = document.createElement("p");
        var link = MW.el("a", { class: "btn", href: "/forgot" }, "Ask for a new link");
        again.appendChild(link);
        intro.after(again);
      });

    reset.addEventListener("submit", async function (event) {
      event.preventDefault();
      var password = document.getElementById("password").value;
      var repeat = document.getElementById("password2").value;
      var problems = [];
      if (password.length < minLength) problems.push({ field: "password", message: "At least " + minLength + " characters." });
      if (repeat !== password) problems.push({ field: "password2", message: "The two passwords don't match." });
      MW.showProblems(reset, problems);
      if (problems.length) return;
      var button = reset.querySelector("button");
      var fb = document.getElementById("form-feedback");
      button.disabled = true;
      try {
        await MW.api("/account/reset", { method: "POST", json: { token: token, password: password } });
        reset.hidden = true;
        intro.textContent = "Password changed. You've been signed out everywhere: log in with your new password.";
        var p = document.createElement("p");
        p.appendChild(MW.el("a", { class: "btn", href: "/login" }, "Log in"));
        intro.after(p);
      } catch (error) {
        MW.showProblems(reset, (error.data && error.data.problems) || []);
        fb.className = "feedback feedback-error";
        fb.textContent = error.message;
        button.disabled = false;
      }
    });
  }
})();
