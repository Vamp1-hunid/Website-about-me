// js/admin-works.js
// Dashboard: the Compose tab (write and upload a work, with a live preview) and the Works tab.

(function () {
  "use strict";

  var MW = window.MW;
  var ADMIN = window.ADMIN;
  var form = document.getElementById("post-form");
  if (!MW || !ADMIN || !form) return;
  var el = MW.el;

  var feedback = document.getElementById("form-feedback");
  var saveBtn = document.getElementById("save-btn");
  var cancelBtn = document.getElementById("cancel-edit");
  var preview = document.getElementById("live-preview");
  var body = document.getElementById("body");
  var editing = null;
  var DRAFT_KEY = "gb-compose-draft";

  function field(id) { return document.getElementById(id); }

  /* ---------- Media, visibility ---------- */

  var media = ADMIN.mediaManager({
    list: field("media-list"),
    starRole: "cover",
    normalRole: "page",
    starLabel: "Cover",
    onChange: schedulePreview
  });
  field("media-files").addEventListener("change", function () { media.add(this.files); this.value = ""; });
  field("doc-files").addEventListener("change", function () { media.add(this.files); this.value = ""; });
  field("cover-file").addEventListener("change", function () { media.add(this.files, "cover"); this.value = ""; });
  ADMIN.dropzone(field("dropzone"), function (files) { media.add(files); });

  var visibility = ADMIN.visibility("visibility", "schedule-row", "publishAt");
  visibility.onChange = function () {
    saveBtn.textContent = buttonLabel();
  };

  function buttonLabel() {
    var mode = visibility.mode();
    if (mode === "draft") return editing ? "Save draft" : "Save draft";
    if (mode === "schedule") return "Schedule";
    return editing ? "Save changes" : "Publish";
  }

  /* ---------- Live preview ---------- */

  var previewTimer = null;
  function schedulePreview() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderPreview, 150);
    saveDraftLocally();
  }

  function renderPreview() {
    preview.textContent = "";
    var category = field("category").value;
    var stickers = el("div", { class: "sticker-row" });
    stickers.appendChild(el("span", { class: "sticker", "data-category": category }, MW.categoryName(category)));
    var seriesSelect = field("seriesId");
    if (seriesSelect.value) {
      var chapter = field("seriesOrder").value ? " · Chapter " + field("seriesOrder").value : "";
      stickers.appendChild(el("span", { class: "sticker sticker-series" }, seriesSelect.options[seriesSelect.selectedIndex].text + chapter));
    }
    if (field("section").value === "concept-art") stickers.appendChild(el("span", { class: "sticker" }, "Concept art"));
    preview.appendChild(stickers);
    if (field("logline").value.trim()) preview.appendChild(el("p", { class: "logline logline-big" }, field("logline").value.trim()));
    preview.appendChild(el("h1", { class: "work-title" }, field("title").value.trim() || "Untitled"));
    var mode = visibility.mode();
    var v = visibility.value();
    preview.appendChild(el("p", { class: "mono muted" },
      mode === "draft" ? "Draft · only you will see it" :
      mode === "schedule" && v.publishAt ? "Goes public " + MW.formatDateTime(v.publishAt) : "Posted today"));
    if (field("summary").value.trim()) preview.appendChild(el("p", { class: "lead" }, field("summary").value.trim()));
    var tags = field("tags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    if (tags.length) {
      var ul = el("ul", { class: "tag-list" });
      tags.forEach(function (t) { ul.appendChild(el("li", {}, "#" + t.toLowerCase().replace(/[^a-z0-9]+/g, "-"))); });
      preview.appendChild(ul);
    }

    var items = media.items().filter(function (m) { return !m.uploading && m.url; });
    var shown = items.filter(function (m) { return m.role !== "cover" && m.kind !== "document"; })
      .map(function (m) { return { kind: m.kind, url: m.url, originalUrl: m.url, thumbUrl: m.thumbUrl, caption: m.caption, role: m.role }; });
    if (shown.length) preview.appendChild(MW.renderMedia(shown, field("title").value || "Untitled"));

    if (body.value.trim()) {
      var prose = el("div", { class: "work-body prose font-" + field("font").value });
      MW.renderMarkup(prose, body.value);
      preview.appendChild(prose);
    }
    var docs = MW.renderDocuments(items.map(function (m) { return { kind: m.kind, url: m.url, caption: m.caption }; }));
    if (docs) preview.appendChild(docs);

    var cover = items.find(function (m) { return m.role === "cover"; }) || items.find(function (m) { return m.kind === "image"; });
    if (cover) {
      var note = el("div", { class: "preview-card-note" });
      note.appendChild(el("p", { class: "node-label" }, "Card cover"));
      note.appendChild(el("img", { src: cover.url, alt: "" }));
      preview.appendChild(note);
    }

    field("word-count").textContent = MW.readingStats(body.value) || "0 words";
  }

  form.addEventListener("input", schedulePreview);
  form.addEventListener("change", schedulePreview);

  /* ---------- Keep an unsaved new post in this browser, in case the tab closes ---------- */

  function saveDraftLocally() {
    if (editing) return;
    try {
      var data = { title: field("title").value, logline: field("logline").value, summary: field("summary").value, body: body.value, tags: field("tags").value };
      if (data.title || data.body) localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
      field("autosave-note").textContent = data.title || data.body ? "Text kept in this browser until you save." : "";
    } catch (e) { /* storage unavailable: nothing to do */ }
  }

  function restoreDraftLocally() {
    try {
      var data = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!data) return;
      ["title", "logline", "summary", "tags"].forEach(function (k) { if (data[k]) field(k).value = data[k]; });
      if (data.body) body.value = data.body;
      field("autosave-note").textContent = "Restored the unsaved text from last time.";
    } catch (e) { /* ignore */ }
  }

  function clearDraftLocally() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    field("autosave-note").textContent = "";
  }

  /* ---------- Import writing from a file ---------- */

  field("import-file").addEventListener("change", async function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    if (body.value.trim() && !window.confirm("Replace the text that's already in the box with " + file.name + "?")) return;
    var formData = new FormData();
    formData.append("file", file);
    MW.toast("Reading " + file.name + "…");
    try {
      var data = await MW.api("/admin/import-document", { method: "POST", form: formData });
      body.value = data.text;
      if (!field("title").value.trim()) field("title").value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      schedulePreview();
      MW.toast("Imported " + data.words.toLocaleString("en-GB") + " words" + (data.truncated ? " (cut to the 200,000-character limit)" : "") + ".");
    } catch (error) {
      MW.toast(error.message, true);
    }
  });

  /* ---------- Create / edit ---------- */

  function resetForm() {
    editing = null;
    form.reset();
    MW.showProblems(form, []);
    media.load([]);
    visibility.set(true, null);
    cancelBtn.hidden = true;
    saveBtn.textContent = buttonLabel();
    field("editor-title").textContent = "New post";
    field("editor-kicker").textContent = "Compose // new post";
    feedback.textContent = "";
    restoreDraftLocally();
    renderPreview();
  }

  async function startEdit(id) {
    try {
      var data = await MW.api("/posts/by-id/" + id);
      var post = data.post;
      await ADMIN.fillSeriesSelects();
      editing = post;
      form.reset();
      MW.showProblems(form, []);
      feedback.textContent = "";
      field("title").value = post.title;
      field("logline").value = post.logline || "";
      field("category").value = post.category;
      field("section").value = post.section || "main";
      field("seriesId").value = post.series ? String(post.series.id) : "";
      field("seriesOrder").value = post.seriesOrder === null || post.seriesOrder === undefined ? "" : post.seriesOrder;
      field("summary").value = post.summary;
      field("tags").value = (post.tags || []).join(", ");
      field("font").value = post.font || "theme";
      body.value = post.body;
      media.load(post.media);
      visibility.set(post.published, post.publishAt);
      cancelBtn.hidden = false;
      saveBtn.textContent = buttonLabel();
      field("editor-title").textContent = "Edit: " + post.title;
      field("editor-kicker").textContent = "Edit // file " + String(post.id).padStart(3, "0");
      field("autosave-note").textContent = "";
      history.replaceState(null, "", "/admin?edit=" + post.id + "#compose");
      renderPreview();
      field("editor-title").scrollIntoView({ block: "start" });
    } catch (error) {
      MW.toast(error.message, true);
    }
  }
  ADMIN.editWork = function (id) {
    ADMIN.show("compose", { keepUrl: true, editing: true });
    startEdit(id);
  };

  cancelBtn.addEventListener("click", function () {
    history.replaceState(null, "", "/admin#compose");
    resetForm();
  });

  ADMIN.onReady(function () {
    var editId = new URLSearchParams(window.location.search).get("edit");
    if (editId && /^\d+$/.test(editId)) startEdit(Number(editId));
    else resetForm();
  });
  ADMIN.onShow("compose", function (options) {
    ADMIN.fillSeriesSelects();
    if (options.fresh && editing) resetForm();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    feedback.textContent = "";
    feedback.className = "feedback";

    var problems = [];
    if (!field("title").value.trim()) problems.push({ field: "title", message: "Give the work a title." });
    var vis = visibility.value();
    if (vis.problem) problems.push({ field: "publishAt", message: vis.problem });
    else if (vis.publishAt && new Date(vis.publishAt) < new Date(Date.now() - 60000)) {
      problems.push({ field: "publishAt", message: "That time has already passed. Choose a future time, or Publish now." });
    }
    if (media.busy()) problems.push({ field: "media", message: "Wait for the uploads to finish." });
    var category = field("category").value;
    var visual = media.items().some(function (m) { return m.kind === "image" || m.kind === "video"; });
    if ((category === "story-art" || category === "anime") && !visual) {
      problems.push({ field: "media", message: "Story art and anime works need at least one picture or video." });
    }
    MW.showProblems(form, problems);
    if (problems.length) {
      feedback.className = "feedback feedback-error";
      feedback.textContent = "Please fix the highlighted fields.";
      return;
    }

    var payload = {
      title: field("title").value,
      logline: field("logline").value,
      category: category,
      section: field("section").value,
      seriesId: field("seriesId").value,
      seriesOrder: field("seriesOrder").value,
      summary: field("summary").value,
      tags: field("tags").value,
      font: field("font").value,
      body: body.value,
      published: vis.published,
      publishAt: vis.publishAt,
      media: media.value()
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      var result = editing
        ? await MW.api("/posts/" + editing.id, { method: "PUT", json: payload })
        : await MW.api("/posts", { method: "POST", json: payload });
      var wasEditing = Boolean(editing);
      var post = result.post;
      clearDraftLocally();
      history.replaceState(null, "", "/admin#compose");
      resetForm();
      clearDraftLocally();
      feedback.className = "feedback feedback-success";
      var verb = post.status === "draft" ? "Draft saved: " : post.status === "scheduled" ? "Scheduled for " + MW.formatDateTime(post.publishAt) + ": " : wasEditing ? "Saved: " : "Published: ";
      feedback.textContent = verb + post.title + ". ";
      feedback.appendChild(el("a", { href: "/work/" + encodeURIComponent(post.slug) }, post.status === "live" ? "View it" : "Preview it"));
      MW.toast(verb + post.title);
    } catch (error) {
      MW.showProblems(form, (error.data && error.data.problems) || []);
      feedback.className = "feedback feedback-error";
      feedback.textContent = error.message;
      saveBtn.textContent = buttonLabel();
    }
    saveBtn.disabled = false;
  });

  /* ---------- Works tab ---------- */

  var list = document.getElementById("admin-list");
  var listPage = 1;
  var listStatus = "";

  async function loadList(page) {
    listPage = page;
    try {
      var data = await MW.api("/posts?drafts=1&page=" + page + (listStatus ? "&status=" + listStatus : ""));
      list.textContent = "";
      if (!data.posts.length) ADMIN.emptyRow(list, listStatus ? "Nothing here." : "Nothing posted yet. Your first work will appear here.");
      data.posts.forEach(function (post) { list.appendChild(workRow(post, function () { loadList(listPage); })); });
      document.getElementById("admin-page").textContent = data.pages > 1 ? "Page " + data.page + " of " + data.pages : "";
      document.getElementById("admin-prev").hidden = data.page <= 1;
      document.getElementById("admin-next").hidden = data.page >= data.pages;
    } catch (error) {
      ADMIN.emptyRow(list, error.message);
    }
  }

  // Shared with the Drafts tab.
  function workRow(post, reload) {
    var meta = MW.categoryName(post.category) +
      (post.series ? " · " + post.series.title + (post.seriesOrder !== null && post.seriesOrder !== undefined ? " ch. " + post.seriesOrder : "") : "") +
      (post.section === "concept-art" ? " · concept art" : "") +
      " · " + MW.formatDate(post.createdAt) + " · ♥ " + post.likes + " · \u{1F4AC} " + post.comments;
    return ADMIN.listItem({
      imageUrl: post.imageUrl,
      title: post.title,
      meta: meta,
      flag: ADMIN.statusText(post),
      actions: [
        el("a", { class: "btn btn-ghost btn-small", href: "/work/" + encodeURIComponent(post.slug) }, post.status === "live" ? "View" : "Preview"),
        ADMIN.button("Edit", function () { ADMIN.editWork(post.id); }),
        ADMIN.confirmButton("Delete", async function () {
          await MW.api("/posts/" + post.id, { method: "DELETE" });
          MW.toast("Deleted: " + post.title);
          if (editing && editing.id === post.id) resetForm();
          reload();
        })
      ]
    });
  }
  ADMIN.workRow = workRow;

  document.getElementById("admin-prev").addEventListener("click", function () { loadList(listPage - 1); });
  document.getElementById("admin-next").addEventListener("click", function () { loadList(listPage + 1); });
  document.querySelectorAll("#works-filter [data-status]").forEach(function (button) {
    button.addEventListener("click", function () {
      listStatus = button.getAttribute("data-status");
      document.querySelectorAll("#works-filter [data-status]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === button)); });
      loadList(1);
    });
  });
  ADMIN.onShow("works", function () { loadList(1); });
})();
