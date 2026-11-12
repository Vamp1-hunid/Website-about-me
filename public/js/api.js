// js/api.js
// Shared helpers used by every page:
//  - MW.api():   talks to the server (/api/...) and turns errors into readable messages
//  - MW.me():    finds out who is logged in (asked once per page)
//  - MW.toast(): small pop-up message at the bottom of the screen
//  - fills in the Log in / Join / profile buttons in the header
//  - highlights the current page in the navigation

(function () {
  "use strict";

  var MW = (window.MW = window.MW || {});

  // Sends a request to the server. options: { method, json, form }
  // Resolves with the JSON reply, or rejects with an Error that has .status and .data.
  MW.api = async function (path, options) {
    options = options || {};
    var init = { method: options.method || "GET", headers: {}, credentials: "same-origin" };

    if (options.json !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.json);
    } else if (options.form) {
      init.body = options.form; // FormData: the browser sets the right Content-Type itself
    }

    var response;
    try {
      response = await fetch("/api" + path, init);
    } catch (networkError) {
      var offline = new Error("Could not reach the server. Check your connection and try again.");
      offline.status = 0;
      throw offline;
    }

    var data = null;
    try {
      data = await response.json();
    } catch (parseError) {
      data = null;
    }

    if (!response.ok) {
      var error = new Error((data && data.error) || "Something went wrong (" + response.status + ").");
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  };

  // Who is logged in? Returns a promise of the user object, or null.
  var mePromise = null;
  MW.me = function (refresh) {
    if (!mePromise || refresh) {
      mePromise = MW.api("/account/me")
        .then(function (data) { return data.user; })
        .catch(function () { return null; });
    }
    return mePromise;
  };

  // Small pop-up message.
  MW.toast = function (message, isError) {
    var area = document.querySelector(".toast-area");
    if (!area) {
      area = document.createElement("div");
      area.className = "toast-area";
      area.setAttribute("role", "status");
      area.setAttribute("aria-live", "polite");
      document.body.appendChild(area);
    }
    var toast = document.createElement("div");
    toast.className = "toast" + (isError ? " is-error" : "");
    toast.textContent = message;
    area.appendChild(toast);
    window.setTimeout(function () { toast.remove(); }, 4200);
  };

  // "2026-11-12T05:17:33Z" -> "12 Nov 2026"
  MW.formatDate = function (value) {
    var date = new Date(value);
    if (isNaN(date)) return "";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  MW.categoryName = function (category) {
    return { "story-art": "Story art", anime: "Anime works", writing: "Writing" }[category] || category;
  };

  // Only allow redirects to pages on this site (stops "?next=https://evil.example").
  MW.safeNext = function (value, fallback) {
    if (typeof value === "string" && value.charAt(0) === "/" && value.charAt(1) !== "/" && value.indexOf("\\") === -1) {
      return value;
    }
    return fallback || "/";
  };

  MW.currentPath = function () {
    return window.location.pathname + window.location.search;
  };

  // Shows each field's error message under the field (uses the same ids as script.js: <id>-error).
  MW.showProblems = function (form, problems) {
    form.querySelectorAll("[aria-invalid]").forEach(function (el) { el.removeAttribute("aria-invalid"); });
    form.querySelectorAll(".error").forEach(function (el) { el.textContent = ""; });
    (problems || []).forEach(function (problem) {
      var input = form.querySelector("[name='" + problem.field + "']");
      var box = input && document.getElementById(input.id + "-error");
      if (input) input.setAttribute("aria-invalid", "true");
      if (box) box.textContent = problem.message;
    });
    var first = form.querySelector("[aria-invalid='true']");
    if (first) first.focus();
  };

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text !== undefined) node.textContent = text;
    return node;
  }
  MW.el = el;

  /* ---------- Header: Log in / Join, or the member's name ---------- */

  function renderAuthArea(user) {
    var area = document.getElementById("auth-area");
    if (!area) return;
    area.textContent = "";

    if (!user) {
      var next = encodeURIComponent(MW.currentPath());
      area.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/login?next=" + next }, "Log in"));
      area.appendChild(el("a", { class: "btn btn-small", href: "/register?next=" + next }, "Join"));
      return;
    }

    area.appendChild(el("a", { class: "auth-name", href: "/profile", title: "Your profile" }, "@" + user.username));
    if (user.role === "admin") {
      area.appendChild(el("a", { class: "btn btn-small", href: "/admin" }, "Admin"));
    }
    area.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/profile" }, "Profile"));
    var logout = el("button", { class: "btn btn-ghost btn-small", type: "button" }, "Log out");
    logout.addEventListener("click", async function () {
      logout.disabled = true;
      try {
        await MW.api("/account/logout", { method: "POST" });
      } catch (error) {
        // Even if it fails, reload so the page shows the real state.
      }
      window.location.href = "/";
    });
    area.appendChild(logout);
  }

  function markCurrentNav() {
    var page = document.body.getAttribute("data-page");
    if (!page) return;
    document.querySelectorAll(".site-nav a[data-nav='" + page + "']").forEach(function (link) {
      link.setAttribute("aria-current", "page");
    });
  }

  markCurrentNav();
  MW.me().then(renderAuthArea);
})();
