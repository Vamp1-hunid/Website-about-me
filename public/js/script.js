// js/script.js
// ICT251 Activity 3: interactive features for my personal website.
// This file is loaded with "defer", so the page is already built when it runs.

/* ---------- Shared helpers ---------- */

// Short way to find an element by its id.
function byId(id) {
  return document.getElementById(id);
}

// Shows (or clears) the error message under one input and marks the input as invalid
// so screen readers announce the problem. An empty message clears the error.
// textContent is used so anything the visitor types stays plain text and is never run as HTML.
function setFieldError(inputId, message) {
  const input = byId(inputId);
  const errorBox = byId(inputId + "-error");
  if (!input || !errorBox) {
    return;
  }
  errorBox.textContent = message;
  if (message) {
    input.setAttribute("aria-invalid", "true");
  } else {
    input.removeAttribute("aria-invalid");
  }
}

/* ---------- Feature 1 (compulsory): contact form validation and preview ---------- */

const contactForm = byId("contact-form");
const contactFields = ["name", "email", "message"]; // array holding the ids of the three checked inputs

// Returns true when the text looks like an email address: text@text.text with no spaces.
function isValidEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return pattern.test(email);
}

// Checks the three values and returns an array of problems.
// An empty array means everything is valid.
// trim() removes spaces at both ends, so a name or message made only of spaces counts as empty.
function validateContactForm(values) {
  const problems = [];

  if (values.name.trim() === "") {
    problems.push({ field: "name", message: "Please enter your name. Spaces alone are not accepted." });
  }

  if (values.email.trim() === "") {
    problems.push({ field: "email", message: "Please enter your email address." });
  } else if (!isValidEmail(values.email.trim())) {
    problems.push({ field: "email", message: "That email address is not in a valid format, for example name@example.com." });
  }

  if (values.message.trim() === "") {
    problems.push({ field: "message", message: "Please write a message. Spaces alone are not accepted." });
  }

  return problems;
}

// Runs when the form is submitted: validates, then shows either errors or a local preview.
function handleContactSubmit(event) {
  event.preventDefault(); // stops the browser from sending or reloading: everything stays local

  const feedback = byId("form-feedback");
  const preview = byId("preview");
  const topicSelect = byId("topic");
  const values = {
    name: byId("name").value,
    email: byId("email").value,
    message: byId("message").value
  };

  // Start clean: clear old error messages and hide the old preview.
  contactFields.forEach(function (field) {
    setFieldError(field, "");
  });
  preview.hidden = true;

  const problems = validateContactForm(values);

  if (problems.length > 0) {
    problems.forEach(function (problem) {
      setFieldError(problem.field, problem.message);
    });
    feedback.textContent = "Please fix " + problems.length + " problem(s) shown under the fields.";
    feedback.className = "feedback feedback-error";
    byId(problems[0].field).focus(); // move the cursor to the first field that needs fixing
    return;
  }

  // Everything is valid: show the values on the page. This does NOT send anything.
  byId("preview-name").textContent = values.name.trim();
  byId("preview-email").textContent = values.email.trim();
  byId("preview-topic").textContent = topicSelect.options[topicSelect.selectedIndex].textContent;
  byId("preview-message").textContent = values.message.trim();
  preview.hidden = false;
  feedback.textContent = "Validation passed. Check the preview below, then press Send message.";
  feedback.className = "feedback feedback-success";
  byId("send-feedback").textContent = "";
  byId("send-message").disabled = false;
  byId("send-message").hidden = false;
  byId("edit-message").hidden = false;
  byId("send-message").focus();
}

// Sends the checked message to the server, which emails it to the site owner.
async function sendContactMessage() {
  const button = byId("send-message");
  const sendFeedback = byId("send-feedback");
  const topicSelect = byId("topic");
  button.disabled = true;
  button.textContent = "Sending…";
  sendFeedback.className = "feedback";
  sendFeedback.textContent = "";
  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        name: byId("name").value,
        email: byId("email").value,
        topic: topicSelect.value,
        message: byId("message").value,
        website: byId("website") ? byId("website").value : ""
      })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "The message couldn't be sent. Please try again.");
    contactForm.reset();
    button.hidden = true;
    byId("edit-message").hidden = true;
    byId("preview-note").textContent = "Sent. Thank you!";
    byId("form-feedback").textContent = "";
    sendFeedback.className = "feedback feedback-success";
    sendFeedback.textContent = "Message sent. I'll reply to the email address you gave.";
  } catch (error) {
    sendFeedback.className = "feedback feedback-error";
    sendFeedback.textContent = error.message;
    button.disabled = false;
  }
  button.textContent = "Send message";
}

if (contactForm) {
  // Links like /creator?topic=support#contact choose the topic for the visitor.
  const wantedTopic = new URLSearchParams(window.location.search).get("topic");
  if (wantedTopic && byId("topic").querySelector("option[value='" + wantedTopic.replace(/[^a-z-]/g, "") + "']")) {
    byId("topic").value = wantedTopic;
  }
  contactForm.addEventListener("submit", handleContactSubmit);
  byId("send-message").addEventListener("click", sendContactMessage);
  byId("edit-message").addEventListener("click", function () {
    byId("preview").hidden = true;
    byId("message").focus();
  });
}
/* ---------- Feature 2: navigation menu (the three-bar button) ---------- */
// The ☰ button opens a dropdown with every section of the site (built by js/api.js).
// On small screens it is the only way to reach the links, because the link bar is hidden.

const menuToggle = byId("menu-toggle");
const siteMenu = byId("site-menu");

// Opens or closes the menu and keeps the button's label and aria-expanded state in step with it.
function setMenuOpen(isOpen) {
  siteMenu.hidden = !isOpen;
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  menuToggle.classList.toggle("is-open", isOpen);
}

if (menuToggle && siteMenu) {
  // Clicking the button flips the menu between open and closed.
  menuToggle.addEventListener("click", function () {
    setMenuOpen(siteMenu.hidden);
    if (!siteMenu.hidden) {
      const first = siteMenu.querySelector("input, a");
      if (first) first.focus();
    }
  });

  // Choosing a link closes the menu.
  siteMenu.addEventListener("click", function (event) {
    if (event.target.closest("a")) setMenuOpen(false);
  });

  // Clicking anywhere outside the menu closes it.
  document.addEventListener("click", function (event) {
    if (!siteMenu.hidden && !siteMenu.contains(event.target) && !menuToggle.contains(event.target)) {
      setMenuOpen(false);
    }
  });

  // Pressing Escape closes the menu and returns focus to the button.
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !siteMenu.hidden) {
      setMenuOpen(false);
      menuToggle.focus();
    }
  });
}
/* ---------- Feature 3: light and dark theme switch ---------- */

const themeToggle = byId("theme-toggle");
const rootElement = document.documentElement; // the <html> element; the CSS reads its data-theme value

// Applies "light" or "dark" and updates the button label to offer the opposite choice.
function applyTheme(theme) {
  rootElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

// Reads the saved choice. The try/catch keeps the page working if storage is blocked.
function loadSavedTheme() {
  try {
    return localStorage.getItem("theme");
  } catch (error) {
    return null;
  }
}

if (themeToggle) {
  // My site was designed dark, so dark is the default unless the visitor saved "light".
  applyTheme(loadSavedTheme() === "light" ? "light" : "dark");

  themeToggle.addEventListener("click", function () {
    const next = rootElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem("theme", next); // saving is optional, so a failure is ignored
    } catch (error) {
      // storage unavailable: the theme still changes for this visit
    }
  });
}
/* ---------- Feature 4: study hours calculator ---------- */

const hoursForm = byId("hours-form");

// Turns text into a number. Returns null when the text is not a plain number,
// which rejects "", "abc", "1e5" and "0x10" but accepts "2", "2.5" and "-3".
function readNumber(text) {
  const trimmed = text.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

// Checks hours per day and days per week. Returns { problems, total }.
// problems is an array of { field, message }; total is the weekly hours when there are no problems.
function calculateWeeklyHours(hoursText, daysText) {
  const problems = [];
  const hours = readNumber(hoursText);
  const days = readNumber(daysText);

  if (hoursText.trim() === "") {
    problems.push({ field: "hours-per-day", message: "Enter the planned hours per day." });
  } else if (hours === null) {
    problems.push({ field: "hours-per-day", message: "Hours must be a number, for example 2.5." });
  } else if (hours < 0) {
    problems.push({ field: "hours-per-day", message: "Hours cannot be negative." });
  } else if (hours > 24) {
    problems.push({ field: "hours-per-day", message: "A day has only 24 hours." });
  }

  if (daysText.trim() === "") {
    problems.push({ field: "days-per-week", message: "Enter the study days per week." });
  } else if (days === null || !Number.isInteger(days) || days < 1 || days > 7) {
    problems.push({ field: "days-per-week", message: "Days must be a whole number from 1 to 7." });
  }

  if (problems.length > 0) {
    return { problems: problems, total: null };
  }
  // toFixed(2) removes tiny rounding noise such as 0.30000000000000004.
  return { problems: problems, total: Number((hours * days).toFixed(2)) };
}

// Runs when the calculator form is submitted.
function handleHoursSubmit(event) {
  event.preventDefault();

  const result = byId("hours-result");
  const hoursText = byId("hours-per-day").value;
  const daysText = byId("days-per-week").value;

  setFieldError("hours-per-day", "");
  setFieldError("days-per-week", "");

  const outcome = calculateWeeklyHours(hoursText, daysText);

  if (outcome.problems.length > 0) {
    outcome.problems.forEach(function (problem) {
      setFieldError(problem.field, problem.message);
    });
    result.textContent = ""; // never leave an old answer showing next to an error
    byId(outcome.problems[0].field).focus();
    return;
  }

  result.textContent = "Total planned study time: " + outcome.total + " hours per week.";
}

if (hoursForm) {
  hoursForm.addEventListener("submit", handleHoursSubmit);
}