// js/admin.js
// Dashboard core (site owner only): the access check, tabs, and the shared building blocks
// used by the other dashboard scripts (admin-works.js, admin-stories.js, admin-more.js):
//   ADMIN.toolbar()       formatting buttons for a text box
//   ADMIN.mediaManager()  upload, order, caption and remove files
//   ADMIN.coverPicker()   one picture (story covers, product pictures)
//   ADMIN.visibility()    Publish now / Schedule / Draft
// The server checks the admin role on every request, so hiding this page is
// only for convenience, not for security.

(function () {
  "use strict";

  var MW = window.MW;
  var gate = document.getElementById("gate-message");
  var area = document.getElementById("admin-area");
  if (!gate || !MW) return;

  var el = MW.el;
  var ADMIN = (window.ADMIN = { el: el });
  // "studio" on /hub/studio (any approved Chapterhive creator), "dashboard" on /admin (site owner).
  ADMIN.mode = document.body.getAttribute("data-mode") === "studio" ? "studio" : "dashboard";
  ADMIN.base = window.location.pathname;
  var readyCallbacks = [];
  var showCallbacks = {};

  ADMIN.onReady = function (fn) { readyCallbacks.push(fn); };
  ADMIN.onShow = function (tab, fn) { (showCallbacks[tab] = showCallbacks[tab] || []).push(fn); };

  /* ---------- Access check ---------- */

  MW.me().then(function (user) {
    if (!user) {
      window.location.replace("/login?next=" + encodeURIComponent("/admin"));
      return;
    }
    gate.classList.remove("loading");
    var approved = MW.creator && MW.creator.status === "approved";
    if (ADMIN.mode === "studio" && user.role !== "admin" && !approved) {
      gate.textContent = MW.creator && MW.creator.status === "pending"
        ? "Your creator application is being reviewed. The studio opens as soon as you're approved."
        : "The studio is for Chapterhive creators. ";
      if (!MW.creator || MW.creator.status === "rejected") {
        gate.appendChild(el("a", { class: "btn btn-small", href: "/hub/apply" }, "Apply to become a creator"));
      }
      return;
    }
    var perms = (MW.account && MW.account.staffPerms) || [];
    var isStaff = user.role !== "admin" && perms.length > 0;
    if (ADMIN.mode === "dashboard" && user.role !== "admin" && !isStaff) {
      gate.textContent = "Access denied. This area is only for the site owner and staff.";
      return;
    }
    ADMIN.isStaff = isStaff;
    if (ADMIN.mode === "dashboard") {
      document.querySelectorAll("[data-owner-only]").forEach(function (n) { n.hidden = !(MW.account && MW.account.isOwner); });
    }
    if (isStaff && ADMIN.mode === "dashboard") {
      // Staff see only the tabs their powers open.
      var TAB_PERMS = { reviews: ["approve_posts"], chapterhive: ["approve_creators", "handle_reports"], users: ["moderate_users"], announce: ["post_updates"] };
      document.querySelectorAll(".dash-tabs [role='tab']").forEach(function (tab) {
        var need = TAB_PERMS[tab.getAttribute("data-tab")];
        tab.hidden = !need || !need.some(function (p) { return perms.indexOf(p) >= 0; });
      });
      var ql = document.getElementById("dash-quick-links");
      if (ql) {
        var LINK_PERMS = { reservations: "manage_reservations", beta: "approve_beta", creators: "approve_creators" };
        ql.querySelectorAll("[data-count]").forEach(function (a) { a.hidden = perms.indexOf(LINK_PERMS[a.getAttribute("data-count")]) < 0; });
      }
    }
    ADMIN.user = user;
    gate.textContent = ADMIN.mode === "studio"
      ? "Welcome back, " + user.displayName + ". Publish, schedule and manage everything on your Chapterhive page."
      : "Welcome back, " + user.displayName + ".";
    area.hidden = false;
    // Staff only get their own tabs, so the creator/admin set-up (works, stories, inbox counts…) is skipped.
    if (!isStaff) readyCallbacks.forEach(function (fn) { fn(user); });
    var params = new URLSearchParams(window.location.search);
    var start = (window.location.hash || "").slice(1);
    if (params.get("edit")) start = "compose";
    var startTab = document.querySelector(".dash-tabs [data-tab='" + start + "']");
    if (!startTab || startTab.hidden) {
      var first = Array.prototype.filter.call(document.querySelectorAll(".dash-tabs [role='tab']"), function (t) { return !t.hidden; })[0];
      start = first ? first.getAttribute("data-tab") : "overview";
    }
    if (isStaff) gate.textContent = "Welcome, " + user.displayName + ". These are the staff tools your powers open.";
    ADMIN.show(start);
  });

  /* ---------- Tabs ---------- */

  var tabs = document.querySelectorAll(".dash-tabs [role='tab']");

  ADMIN.show = function (name, options) {
    tabs.forEach(function (tab) {
      tab.setAttribute("aria-selected", String(tab.getAttribute("data-tab") === name));
      tab.tabIndex = tab.getAttribute("data-tab") === name ? 0 : -1;
    });
    document.querySelectorAll("[data-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-panel") !== name;
    });
    if (!(options && options.keepUrl)) history.replaceState(null, "", ADMIN.base + "#" + name);
    (showCallbacks[name] || []).forEach(function (fn) { fn(options || {}); });
  };

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { ADMIN.show(tab.getAttribute("data-tab")); });
    // Arrow keys move between tabs.
    tab.addEventListener("keydown", function (event) {
      var step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      var visible = Array.prototype.filter.call(tabs, function (t) { return !t.hidden; });
      var at = visible.indexOf(tab);
      var next = visible[(at + step + visible.length) % visible.length];
      next.focus();
      ADMIN.show(next.getAttribute("data-tab"));
    });
  });

  // Links such as /hub/studio#collabs (from the ☰ menu) switch tabs even when the page is already open.
  window.addEventListener("hashchange", function () {
    var name = (window.location.hash || "").slice(1);
    if (ADMIN.user && name && document.querySelector("[data-panel='" + name + "']")) ADMIN.show(name, { keepUrl: true });
  });

  document.addEventListener("click", function (event) {
    var go = event.target.closest("[data-go]");
    if (go) ADMIN.show(go.getAttribute("data-go"), { fresh: go.hasAttribute("data-new") });
  });

  /* ---------- Small helpers ---------- */

  // A Date / ISO string -> the "2026-11-20T17:00" value a datetime-local box wants (local time).
  ADMIN.toLocalInput = function (value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d)) return "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  };

  ADMIN.statusText = function (item) {
    if (item.status === "draft") return "DRAFT";
    if (item.status === "pending") return "IN REVIEW";
    if (item.status === "declined") return "NEEDS CHANGES";
    if (item.status === "scheduled") return "SCHEDULED · " + MW.formatDateTime(item.publishAt);
    return "";
  };

  // A delete button that asks "Confirm delete" first.
  ADMIN.confirmButton = function (label, action) {
    var button = el("button", { class: "btn btn-small btn-danger", type: "button" }, label);
    button.addEventListener("click", async function () {
      if (button.getAttribute("data-confirm") !== "yes") {
        button.setAttribute("data-confirm", "yes");
        button.textContent = "Confirm";
        window.setTimeout(function () {
          button.removeAttribute("data-confirm");
          button.textContent = label;
        }, 4000);
        return;
      }
      button.disabled = true;
      try {
        await action();
      } catch (error) {
        MW.toast(error.message, true);
        button.disabled = false;
      }
    });
    return button;
  };

  // One row in a dashboard list: picture, title, details, flags and buttons.
  ADMIN.listItem = function (opts) {
    var item = el("li");
    if (opts.imageUrl) item.appendChild(el("img", { src: opts.imageUrl, alt: "", loading: "lazy" }));
    else item.appendChild(el("div", { class: "no-img", "aria-hidden": "true" }, (opts.title || "?").charAt(0)));
    var text = el("div");
    text.appendChild(el("div", { class: "title" }, opts.title));
    if (opts.meta) text.appendChild(el("div", { class: "mono muted" }, opts.meta));
    if (opts.flag) text.appendChild(el("div", { class: "draft-flag mono" }, opts.flag));
    item.appendChild(text);
    var actions = el("div", { class: "row-actions" });
    (opts.actions || []).forEach(function (a) { actions.appendChild(a); });
    item.appendChild(actions);
    return item;
  };

  ADMIN.button = function (label, onClick, ghost) {
    var b = el("button", { class: "btn btn-small" + (ghost === false ? "" : " btn-ghost"), type: "button" }, label);
    b.addEventListener("click", onClick);
    return b;
  };

  ADMIN.emptyRow = function (list, text) {
    list.textContent = "";
    list.appendChild(el("li", { class: "muted empty-row" }, text));
  };

  /* ---------- Stories (series) in drop-downs ---------- */

  var seriesCache = null;
  ADMIN.loadSeries = function (refresh) {
    if (!seriesCache || refresh) {
      seriesCache = MW.api("/admin/series").then(function (d) { return d.series; });
    }
    return seriesCache;
  };

  ADMIN.fillSeriesSelects = function (refresh) {
    return ADMIN.loadSeries(refresh).then(function (series) {
      document.querySelectorAll("#seriesId, #char-series").forEach(function (select) {
        var current = select.value;
        select.querySelectorAll("option:not([value=''])").forEach(function (o) { o.remove(); });
        series.forEach(function (s) { select.appendChild(el("option", { value: String(s.id) }, s.title)); });
        select.value = current;
      });
      return series;
    });
  };

  ADMIN.onReady(function () { ADMIN.fillSeriesSelects(); });

  /* ---------- Visibility: publish now / schedule / draft ---------- */

  // radios: name of the radio group; row: the schedule row; input: the datetime-local box
  ADMIN.visibility = function (radioName, rowId, inputId) {
    var radios = document.querySelectorAll("input[name='" + radioName + "']");
    var row = document.getElementById(rowId);
    var input = document.getElementById(inputId);
    function current() {
      var checked = document.querySelector("input[name='" + radioName + "']:checked");
      return checked ? checked.value : "now";
    }
    function update() {
      row.hidden = current() !== "schedule";
      if (!row.hidden && !input.value) {
        var tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        tomorrow.setMinutes(0, 0, 0);
        input.value = ADMIN.toLocalInput(tomorrow);
      }
      if (api.onChange) api.onChange();
    }
    radios.forEach(function (r) { r.addEventListener("change", update); });
    var api = {
      mode: current,
      // -> { published, publishAt } for the server, or a problem
      value: function () {
        var mode = current();
        if (mode === "draft") return { published: false, publishAt: "" };
        if (mode === "now") return { published: true, publishAt: "" };
        var date = new Date(input.value);
        if (!input.value || isNaN(date)) return { problem: "Choose the date and time it should go public." };
        return { published: true, publishAt: date.toISOString() };
      },
      set: function (published, publishAt) {
        var mode = !published ? "draft" : publishAt && new Date(publishAt) > new Date() ? "schedule" : "now";
        radios.forEach(function (r) { r.checked = r.value === mode; });
        input.value = mode === "schedule" ? ADMIN.toLocalInput(publishAt) : "";
        update();
      }
    };
    return api;
  };

  /* ---------- Formatting toolbar ---------- */

  var TOOLS = [
    ["B", "Bold", "wrap", "**", "**"],
    ["I", "Italic", "wrap", "*", "*"],
    ["H", "Highlight", "wrap", "==", "=="],
    ["S̶", "Strikethrough", "wrap", "~~", "~~"],
    ["H1", "Big heading", "line", "# "],
    ["H2", "Heading", "line", "## "],
    ["H3", "Small heading", "line", "### "],
    ["❝", "Quote", "line", "> "],
    ["•", "Bullet list", "line", "- "],
    ["1.", "Numbered list", "line", "1. "],
    ["⇔", "Centre", "wrap", "-> ", " <-"],
    ["—", "Scene break", "insert", "\n\n---\n\n"],
    ["🔗", "Link", "link"],
    ["🖼", "Insert picture", "image"]
  ];

  function replaceSelection(area, before, middle, after) {
    var start = area.selectionStart;
    var end = area.selectionEnd;
    var text = area.value;
    area.focus();
    area.value = text.slice(0, start) + before + middle + after + text.slice(end);
    area.selectionStart = start + before.length;
    area.selectionEnd = start + before.length + middle.length;
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }

  ADMIN.toolbar = function (holder, area) {
    holder.setAttribute("role", "toolbar");
    holder.setAttribute("aria-label", "Formatting");
    var fileInput = el("input", { type: "file", class: "sr-only", accept: "image/jpeg,image/png,image/webp,image/gif", tabindex: "-1" });
    holder.appendChild(fileInput);

    TOOLS.forEach(function (tool) {
      var b = el("button", { type: "button", class: "tool", title: tool[1], "aria-label": tool[1] }, tool[0]);
      b.addEventListener("click", function () {
        var selected = area.value.slice(area.selectionStart, area.selectionEnd);
        if (tool[2] === "wrap") {
          replaceSelection(area, tool[3], selected || tool[1].toLowerCase(), tool[4]);
        } else if (tool[2] === "line") {
          // Put the marker at the start of every selected line.
          var start = area.value.lastIndexOf("\n", area.selectionStart - 1) + 1;
          area.selectionStart = start;
          var chunk = area.value.slice(start, area.selectionEnd) || tool[1];
          var lines = chunk.split("\n").map(function (line) { return tool[3] + line.replace(/^(#{1,3} |> |- |\d+\. )/, ""); });
          replaceSelection(area, "", lines.join("\n"), "");
        } else if (tool[2] === "insert") {
          replaceSelection(area, "", tool[3], "");
        } else if (tool[2] === "link") {
          var url = window.prompt("Link address (https://…)", "https://");
          if (url && /^https?:\/\/\S+$/.test(url)) replaceSelection(area, "[", selected || "link text", "](" + url + ")");
        } else if (tool[2] === "image") {
          fileInput.click();
        }
      });
      holder.appendChild(b);
    });

    fileInput.addEventListener("change", async function () {
      var file = fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      var marker = "\n![Uploading " + file.name + "…]()\n";
      replaceSelection(area, "", marker, "");
      try {
        var result = await MW.uploadFile(file);
        var url = result.previewUrl;
        area.value = area.value.replace(marker, "\n![" + file.name.replace(/\.[^.]+$/, "").replace(/[\[\]]/g, "") + "](" + url + ")\n");
        area.dispatchEvent(new Event("input", { bubbles: true }));
        MW.toast("Picture added. Change the words in [ ] to set its caption.");
      } catch (error) {
        area.value = area.value.replace(marker, "");
        area.dispatchEvent(new Event("input", { bubbles: true }));
        MW.toast(error.message, true);
      }
    });

    // Ctrl/Cmd + B and I.
    area.addEventListener("keydown", function (event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      var key = event.key.toLowerCase();
      if (key === "b" || key === "i") {
        event.preventDefault();
        var mark = key === "b" ? "**" : "*";
        replaceSelection(area, mark, area.value.slice(area.selectionStart, area.selectionEnd) || (key === "b" ? "bold" : "italic"), mark);
      }
    });
  };

  document.querySelectorAll("[data-toolbar-for]").forEach(function (holder) {
    ADMIN.toolbar(holder, document.getElementById(holder.getAttribute("data-toolbar-for")));
  });

  var help = document.getElementById("help-dialog");
  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-help]") && help && help.showModal) help.showModal();
  });

  /* ---------- Media manager: upload, order, caption, star (cover / portrait), remove ---------- */

  // options: { list, error, starRole: "cover"|"portrait", normalRole: "page"|"concept", starLabel, onChange }
  ADMIN.mediaManager = function (options) {
    var items = []; // { id?, upload?, local?, kind, url, caption, role, uploading, name }
    var list = options.list;

    function changed() {
      render();
      if (options.onChange) options.onChange();
    }

    function kindLabel(item) {
      return { image: "Picture", video: "Video", audio: "Audio", document: "Document" }[item.kind] || item.kind;
    }

    function render() {
      list.textContent = "";
      var page = 0;
      items.forEach(function (item, index) {
        var li = el("li", { class: "media-row" + (item.role === options.starRole ? " is-star" : "") + (item.uploading ? " is-uploading" : "") });
        var thumb = el("div", { class: "media-thumb" });
        if (item.kind === "image" && item.url) thumb.appendChild(el("img", { src: item.thumbUrl || item.url, alt: "" }));
        else thumb.appendChild(el("span", { class: "mono" }, { video: "▶", audio: "♪", document: (item.ext || "DOC").toUpperCase() }[item.kind] || "…"));
        li.appendChild(thumb);

        var body = el("div", { class: "media-body" });
        var label = kindLabel(item);
        if (item.kind === "image" && item.role !== options.starRole) { page++; label += " " + page; }
        if (item.role === options.starRole) label = "★ " + options.starLabel;
        body.appendChild(el("span", { class: "mono muted" }, label + (item.name ? " · " + item.name : "")));
        if (item.uploading) {
          var bar = el("progress", { max: "100", value: String(Math.round((item.progress || 0) * 100)) });
          body.appendChild(bar);
        } else {
          var caption = el("input", {
            type: "text", maxlength: "200", value: item.caption || "",
            placeholder: item.kind === "document" ? "File name readers see" : "Caption (optional)",
            "aria-label": "Caption for " + label
          });
          caption.addEventListener("input", function () {
            item.caption = caption.value;
            if (options.onChange) options.onChange();
          });
          body.appendChild(caption);
        }
        li.appendChild(body);

        var tools = el("div", { class: "media-tools" });
        if (item.kind === "image" && !item.uploading) {
          var star = el("button", { type: "button", class: "tool", title: "Use as " + options.starLabel.toLowerCase(), "aria-pressed": String(item.role === options.starRole) }, "★");
          star.addEventListener("click", function () {
            var on = item.role !== options.starRole;
            items.forEach(function (m) { if (m.role === options.starRole) m.role = options.normalRole; });
            item.role = on ? options.starRole : options.normalRole;
            changed();
          });
          tools.appendChild(star);
        }
        var up = el("button", { type: "button", class: "tool", title: "Move up", "aria-label": "Move up" }, "↑");
        up.disabled = index === 0;
        up.addEventListener("click", function () { items.splice(index - 1, 0, items.splice(index, 1)[0]); changed(); });
        var down = el("button", { type: "button", class: "tool", title: "Move down", "aria-label": "Move down" }, "↓");
        down.disabled = index === items.length - 1;
        down.addEventListener("click", function () { items.splice(index + 1, 0, items.splice(index, 1)[0]); changed(); });
        var remove = el("button", { type: "button", class: "tool tool-danger", title: "Remove", "aria-label": "Remove" }, "✕");
        remove.addEventListener("click", function () { items.splice(items.indexOf(item), 1); changed(); });
        tools.append(up, down, remove);
        li.appendChild(tools);
        list.appendChild(li);
      });
    }

    // Uploads one file after another (so a slow connection isn't overwhelmed).
    var queue = Promise.resolve();
    function add(files, role) {
      Array.prototype.forEach.call(files, function (file) {
        var item = {
          name: file.name, caption: "", uploading: true, progress: 0,
          kind: /^image\//.test(file.type) ? "image" : /^video\//.test(file.type) ? "video" : /^audio\//.test(file.type) ? "audio" : "document",
          ext: (file.name.match(/\.([a-z0-9]+)$/i) || [, ""])[1],
          role: role || options.normalRole
        };
        if (item.kind === "document") item.caption = file.name;
        if (options.kinds && options.kinds.indexOf(item.kind) === -1) {
          MW.toast(file.name + ": only pictures can be added here.", true);
          return;
        }
        if (role === options.starRole) items.forEach(function (m) { if (m.role === options.starRole) m.role = options.normalRole; });
        items.push(item);
        changed();
        queue = queue.then(async function () {
          try {
            var result = await MW.uploadFile(file, function (p) {
              item.progress = p;
              var bar = list.children[items.indexOf(item)] && list.children[items.indexOf(item)].querySelector("progress");
              if (bar) bar.value = Math.round(p * 100);
            });
            item.uploading = false;
            item.kind = result.kind;
            item.url = result.previewUrl;
            if (result.upload) item.upload = result.upload;
            if (result.local) item.local = result.local;
          } catch (error) {
            items.splice(items.indexOf(item), 1);
            MW.toast(error.message, true);
          }
          changed();
        });
      });
    }

    return {
      add: add,
      load: function (media) {
        items = (media || []).map(function (m) {
          return { id: m.id, kind: m.kind, url: m.url, thumbUrl: m.thumbUrl, caption: m.caption || "", role: m.role,
            ext: (m.url.match(/\.([a-z0-9]+)$/i) || [, ""])[1] };
        });
        render();
      },
      busy: function () { return items.some(function (m) { return m.uploading; }); },
      items: function () { return items; },
      // What the save request sends.
      value: function () {
        return items.filter(function (m) { return !m.uploading; }).map(function (m) {
          var out = { caption: m.caption || "", role: m.role };
          if (m.id) out.id = m.id;
          else if (m.upload) out.upload = m.upload;
          else if (m.local) out.local = m.local;
          return out;
        });
      }
    };
  };

  // Drag-and-drop onto a drop zone.
  ADMIN.dropzone = function (zone, onFiles) {
    ["dragenter", "dragover"].forEach(function (type) {
      zone.addEventListener(type, function (event) {
        event.preventDefault();
        zone.classList.add("is-over");
      });
    });
    ["dragleave", "drop"].forEach(function (type) {
      zone.addEventListener(type, function () { zone.classList.remove("is-over"); });
    });
    zone.addEventListener("drop", function (event) {
      event.preventDefault();
      if (event.dataTransfer && event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
    });
  };

  /* ---------- One picture (story covers, product pictures) ---------- */

  ADMIN.coverPicker = function (container) {
    var img = container.querySelector(".cover-preview");
    var input = container.querySelector("input[type='file']");
    var remove = container.querySelector(".cover-remove");
    var state = { value: undefined, busy: false }; // undefined = keep, null = remove, {upload|local} = new

    function show(url) {
      if (url) { img.src = url; img.hidden = false; } else { img.removeAttribute("src"); img.hidden = true; }
      remove.hidden = !url;
    }

    input.addEventListener("change", async function () {
      var file = input.files[0];
      input.value = "";
      if (!file) return;
      state.busy = true;
      remove.hidden = true;
      MW.toast("Uploading picture…");
      try {
        var result = await MW.uploadFile(file);
        state.value = result.upload ? { upload: result.upload } : { local: result.local };
        show(result.previewUrl);
      } catch (error) {
        MW.toast(error.message, true);
      }
      state.busy = false;
    });
    remove.addEventListener("click", function () {
      state.value = null;
      show(null);
    });

    return {
      reset: function (url) { state.value = undefined; show(url || null); },
      busy: function () { return state.busy; },
      value: function () { return state.value === undefined ? { keep: true } : state.value; }
    };
  };
})();
