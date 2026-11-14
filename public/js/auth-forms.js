// js/auth-forms.js
// The Log in and Join pages. After success, goes back to the page in ?next= (on this site only).

(function () {
  "use strict";

  var MW = window.MW;
  var loginForm = document.getElementById("login-form");
  var registerForm = document.getElementById("register-form");
  var form = loginForm || registerForm;
  if (!form || !MW) return;

  var params = new URLSearchParams(window.location.search);
  var next = MW.safeNext(params.get("next"), "/profile");
  var feedback = document.getElementById("form-feedback");

  // Keep ?next= when switching between Log in and Join.
  var switchLink = document.getElementById("switch-link");
  if (switchLink && params.get("next")) {
    switchLink.href += "?next=" + encodeURIComponent(next);
  }

  // Already logged in? Skip the form. Otherwise show "Continue with Google" if it's set up.
  MW.me().then(function (user) {
    if (user) {
      window.location.replace(next);
      return;
    }
    if (MW.googleEnabled) {
      document.getElementById("google-block").hidden = false;
      document.getElementById("google-btn").href = "/auth/google?next=" + encodeURIComponent(next);
    }
  });

  // Messages when Google sign-in sends someone back here.
  var googleMessages = {
    off: "Google sign-in isn't switched on yet. Use a username and password for now.",
    cancelled: "Google sign-in was cancelled.",
    expired: "That Google sign-in took too long or was opened twice. Please try again.",
    failed: "Google sign-in didn't work. Please try again.",
    taken: "That Google account is already linked to a different member."
  };
  var googleCode = params.get("google");
  var googleBox = document.getElementById("google-message");
  if (googleCode && googleMessages[googleCode]) {
    if (googleBox) googleBox.textContent = googleMessages[googleCode];
    else MW.toast(googleMessages[googleCode], true);
  }

  function value(name) {
    var input = form.querySelector("[name='" + name + "']");
    return input ? input.value : "";
  }

  // Checks in the browser first (quick feedback); the server checks again.
  function checkRegister() {
    var problems = [];
    var username = value("username").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      problems.push({ field: "username", message: "Use 3 to 30 characters: lowercase letters, numbers or _." });
    }
    if (value("password").length < 8) {
      problems.push({ field: "password", message: "Password must be at least 8 characters." });
    }
    if (value("password2") !== value("password")) {
      problems.push({ field: "password2", message: "The two passwords don't match." });
    }
    return problems;
  }

  function checkLogin() {
    var problems = [];
    if (!value("username").trim()) problems.push({ field: "username", message: "Enter your username." });
    if (!value("password")) problems.push({ field: "password", message: "Enter your password." });
    return problems;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    feedback.textContent = "";

    var problems = loginForm ? checkLogin() : checkRegister();
    MW.showProblems(form, problems);
    if (problems.length) {
      feedback.textContent = "Please fix the highlighted fields.";
      return;
    }

    var button = form.querySelector("button[type='submit']");
    button.disabled = true;

    try {
      if (loginForm) {
        await MW.api("/account/login", {
          method: "POST",
          json: { username: value("username"), password: value("password") }
        });
      } else {
        await MW.api("/account/register", {
          method: "POST",
          json: { username: value("username"), displayName: value("displayName"), password: value("password") }
        });
      }
      window.location.href = next;
    } catch (error) {
      MW.showProblems(form, (error.data && error.data.problems) || []);
      feedback.textContent = error.message;
      button.disabled = false;
    }
  });
})();
