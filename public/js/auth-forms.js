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
  var next = MW.safeNext(params.get("next"), MW.isHub ? "/hub" : "/admin");
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
      document.getElementById("terms-error").textContent = missing.length ? "Please tick all three boxes to continue." : "";
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
    if (MW.googleEnabled && !googlePending && params.get("google") !== "1" && (MW.isHub || registerForm)) {
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
    var birth = value("birthDate");
    if (!birth) problems.push({ field: "birthDate", message: "Enter your date of birth." });
    else if (ageOf(birth) < 13) problems.push({ field: "birthDate", message: "You need to be at least 13 to create an account." });
    if (!value("country")) problems.push({ field: "country", message: "Choose the country you live in." });
    if (googlePending) return problems;
    if (value("password").length < 10) {
      problems.push({ field: "password", message: "Use at least 10 characters." });
    }
    var email = value("email").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      problems.push({ field: "email", message: "Enter a working email address." });
    }
    if (value("password2") !== value("password")) {
      problems.push({ field: "password2", message: "The two passwords don't match." });
    }
    return problems;
  }

  function genderValue() {
    var picked = form.querySelector("input[name='gender']:checked");
    return picked ? picked.value : "unspecified";
  }

  function ageOf(isoDate) {
    var p = isoDate.split("-").map(Number);
    var now = new Date();
    var age = now.getFullYear() - p[0];
    if (now.getMonth() + 1 < p[1] || (now.getMonth() + 1 === p[1] && now.getDate() < p[2])) age -= 1;
    return age;
  }

  /* ---------- Join: country list, password strength, show password ---------- */
  var countrySelect = document.getElementById("country");
  if (countrySelect) {
    var codes = ("AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ " +
      "DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG " +
      "LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY " +
      "PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV " +
      "UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW").split(" ");
    var names;
    try { names = new Intl.DisplayNames([navigator.language || "en"], { type: "region" }); } catch (e) { names = null; }
    codes.map(function (c) { return [c, names ? names.of(c) : c]; })
      .sort(function (a, b) { return a[1].localeCompare(b[1]); })
      .forEach(function (c) { countrySelect.appendChild(MW.el("option", { value: c[0] }, c[1])); });
    // Pre-select the visitor's likely country from their browser language (e.g. en-ZM -> ZM).
    var guess = (navigator.language || "").split("-")[1];
    if (guess && codes.indexOf(guess.toUpperCase()) >= 0) countrySelect.value = guess.toUpperCase();
    var bd = document.getElementById("birthDate");
    if (bd) bd.max = new Date().toISOString().slice(0, 10);
  }

  var pw = registerForm && document.getElementById("password");
  if (pw) {
    var bar = document.getElementById("strength-bar");
    var label = document.getElementById("password-strength");
    pw.addEventListener("input", function () {
      var v = pw.value;
      var score = 0;
      if (v.length >= 10) score++;
      if (v.length >= 14) score++;
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
      if (/\d/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v) || /\s/.test(v)) score++;
      if (v.length < 10) score = Math.min(score, 1);
      var levels = ["", "Too short", "Weak", "Okay", "Strong", "Very strong"];
      bar.style.width = (score * 20) + "%";
      bar.setAttribute("data-score", String(score));
      label.textContent = v ? levels[Math.max(1, score)] : "";
    });
    var toggle = document.getElementById("toggle-password");
    toggle.addEventListener("click", function () {
      var showing = pw.type === "text";
      pw.type = showing ? "password" : "text";
      var pw2 = document.getElementById("password2");
      if (pw2) pw2.type = pw.type;
      toggle.textContent = showing ? "Show" : "Hide";
      toggle.setAttribute("aria-pressed", String(!showing));
    });
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
          json: { username: value("username"), password: value("password"), adminOnly: !MW.isHub }
        });
      } else if (googlePending) {
        var done = await MW.api("/account/google-complete", { method: "POST", json: { username: value("username"), acceptTerms: !termsStep || termsStep.hidden,
          birthDate: value("birthDate"), country: value("country"), marketing: document.getElementById("marketing").checked, gender: genderValue() } });
        window.location.href = MW.safeNext(done.next, next);
        return;
      } else {
        await MW.api("/account/register", {
          method: "POST",
          json: { username: value("username"), displayName: value("displayName"), email: value("email"), password: value("password"),
            acceptTerms: !termsStep || termsStep.hidden, birthDate: value("birthDate"), country: value("country"),
            marketing: document.getElementById("marketing").checked, gender: genderValue() }
        });
      }
      window.location.href = next;
    } catch (error) {
      if (error.data && error.data.tooYoung) {
        // Under 13: no account, nothing stored. Explain kindly and close the form.
        form.textContent = "";
        form.appendChild(MW.el("p", { class: "lead" }, "Sorry, you need to be at least 13 to join Chapterhive."));
        form.appendChild(MW.el("p", { class: "muted" }, "You can still read the news, look at new releases and browse creators without an account. Come back when you're 13!"));
        return;
      }
      MW.showProblems(form, (error.data && error.data.problems) || []);
      feedback.textContent = error.message;
      button.disabled = false;
    }
  });
})();
