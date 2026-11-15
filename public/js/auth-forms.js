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

  /* ---------- Join: step 1 (rules) then step 2 (details) ---------- */
  var termsStep = document.getElementById("terms-step");
  var detailsStep = document.getElementById("details-step");
  var googlePending = null; // set when someone came back from Google and still has to accept the terms

  function showDetails() {
    termsStep.hidden = true;
    detailsStep.hidden = false;
    var u = document.getElementById("username");
    if (u) u.focus();
  }
  if (termsStep) {
    termsStep.addEventListener("submit", function (event) {
      event.preventDefault();
      var boxes = termsStep.querySelectorAll("input[type='checkbox']");
      var missing = Array.prototype.filter.call(boxes, function (b) { return !b.checked; });
      document.getElementById("terms-error").textContent = missing.length ? "Please tick all four boxes to continue." : "";
      if (missing.length) { missing[0].focus(); return; }
      showDetails();
    });
    document.getElementById("back-to-terms").addEventListener("click", function () {
      detailsStep.hidden = true;
      termsStep.hidden = false;
    });
    // Back from Google for the first time: only a username is needed after the rules.
    if (params.get("google") === "1") {
      MW.api("/account/google-pending").then(function (d) {
        if (!d.pending) return;
        googlePending = d.pending;
        form.querySelectorAll("[data-local]").forEach(function (row) { row.hidden = true; });
        var note = document.getElementById("google-pending");
        note.hidden = false;
        note.textContent = "Signing up with Google as " + (d.pending.email || d.pending.displayName) + ". Accept the rules, then pick your username.";
        var u = document.getElementById("username");
        u.value = d.pending.username || "";
        checkUsername();
      }).catch(function () {});
    }
  }

  // Live "is this username free?" check while typing.
  var usernameTimer = null;
  function checkUsername() {
    var input = document.getElementById("username");
    var hint = document.getElementById("username-hint");
    if (!registerForm || !input || !hint) return;
    var name = input.value.trim().toLowerCase();
    window.clearTimeout(usernameTimer);
    if (name.length < 3) {
      hint.className = "muted username-hint";
      hint.textContent = "3–30 characters: lowercase letters, numbers or _";
      return;
    }
    usernameTimer = window.setTimeout(function () {
      MW.api("/account/username-available?u=" + encodeURIComponent(name)).then(function (d) {
        if (input.value.trim().toLowerCase() !== name) return;
        hint.className = "username-hint " + (d.available ? "is-ok" : "is-bad");
        hint.textContent = (d.available ? "✓ " : "✗ ") + d.message;
      }).catch(function () {});
    }, 350);
  }
  if (registerForm) document.getElementById("username").addEventListener("input", checkUsername);

  // Already logged in? Skip the form. Otherwise show "Continue with Google" if it's set up.
  MW.me().then(function (user) {
    if (user) {
      window.location.replace(next);
      return;
    }
    if (MW.googleEnabled && !googlePending && params.get("google") !== "1") {
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
    taken: "That Google account is already linked to a different member.",
    banned: "That account has been banned.",
    suspended: "That account is suspended for now."
  };
  var errorText = params.get("error");
  if (errorText && loginForm) MW.toast(errorText.slice(0, 200), true);
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
    if (googlePending) return problems;
    if (value("password").length < 8) {
      problems.push({ field: "password", message: "Password must be at least 8 characters." });
    }
    var email = value("email").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      problems.push({ field: "email", message: "That email address doesn't look right (or leave it empty)." });
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
      } else if (googlePending) {
        var done = await MW.api("/account/google-complete", { method: "POST", json: { username: value("username"), acceptTerms: !termsStep || termsStep.hidden } });
        window.location.href = MW.safeNext(done.next, next);
        return;
      } else {
        await MW.api("/account/register", {
          method: "POST",
          json: { username: value("username"), displayName: value("displayName"), email: value("email"), password: value("password"),
            acceptTerms: !termsStep || termsStep.hidden }
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
