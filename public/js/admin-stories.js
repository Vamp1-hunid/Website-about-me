// js/admin-stories.js
// Dashboard: the Stories tab (title, logline, description, cover) and the Characters tab
// (profile, portrait, concept art, draft / publish / schedule).

(function () {
  "use strict";

  var MW = window.MW;
  var ADMIN = window.ADMIN;
  if (!MW || !ADMIN) return;
  var el = MW.el;
  function field(id) { return document.getElementById(id); }

  /* =================== Stories =================== */

  var storyForm = field("story-form");
  var storyCover = ADMIN.coverPicker(document.querySelector("[data-cover-picker='story']"));
  var editingStory = null;

  function resetStory() {
    editingStory = null;
    storyForm.reset();
    MW.showProblems(storyForm, []);
    storyCover.reset(null);
    field("story-cancel").hidden = true;
    field("story-form-title").textContent = "New story";
    field("story-kicker").textContent = "Stories // new";
  }

  function editStory(s) {
    editingStory = s;
    MW.showProblems(storyForm, []);
    field("story-title").value = s.title;
    field("story-logline").value = s.logline || "";
    field("story-description").value = s.description || "";
    storyCover.reset(s.coverUrl);
    field("story-cancel").hidden = false;
    field("story-form-title").textContent = "Edit: " + s.title;
    field("story-kicker").textContent = "Stories // edit";
    field("story-feedback").textContent = "";
    field("story-form-title").scrollIntoView({ block: "start" });
  }

  async function loadStories() {
    var list = field("story-list");
    try {
      var series = await ADMIN.fillSeriesSelects(true);
      list.textContent = "";
      if (!series.length) ADMIN.emptyRow(list, "No stories yet. Create one to group chapters, characters and concept art.");
      series.forEach(function (s) {
        list.appendChild(ADMIN.listItem({
          imageUrl: s.coverUrl,
          title: s.title,
          meta: s.works + (s.works === 1 ? " work" : " works") + " · " + s.characters + (s.characters === 1 ? " character" : " characters") +
            (s.logline ? " · " + s.logline : ""),
          actions: [
            el("a", { class: "btn btn-ghost btn-small", href: MW.storyUrl(s.slug) }, "View"),
            ADMIN.button("Edit", function () { editStory(s); }),
            ADMIN.confirmButton("Delete", async function () {
              await MW.api("/admin/series/" + s.id, { method: "DELETE" });
              MW.toast("Deleted the story " + s.title + ". Its works and characters were kept.");
              if (editingStory && editingStory.id === s.id) resetStory();
              loadStories();
            })
          ]
        }));
      });
    } catch (error) {
      ADMIN.emptyRow(list, error.message);
    }
  }

  field("story-cancel").addEventListener("click", resetStory);
  storyForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var fb = field("story-feedback");
    fb.className = "feedback";
    fb.textContent = "";
    if (!field("story-title").value.trim()) {
      MW.showProblems(storyForm, [{ field: "title", message: "Give the story a name." }]);
      return;
    }
    if (storyCover.busy()) {
      MW.showProblems(storyForm, [{ field: "cover", message: "Wait for the picture to finish uploading." }]);
      return;
    }
    MW.showProblems(storyForm, []);
    var payload = {
      title: field("story-title").value,
      logline: field("story-logline").value,
      description: field("story-description").value,
      cover: storyCover.value()
    };
    try {
      var data = editingStory
        ? await MW.api("/admin/series/" + editingStory.id, { method: "PUT", json: payload })
        : await MW.api("/admin/series", { method: "POST", json: payload });
      MW.toast("Saved the story " + data.series.title + ".");
      resetStory();
      fb.className = "feedback feedback-success";
      fb.textContent = "Saved. Add chapters from Compose (choose the story there) and characters from the Characters tab.";
      loadStories();
    } catch (error) {
      MW.showProblems(storyForm, (error.data && error.data.problems) || []);
      fb.className = "feedback feedback-error";
      fb.textContent = error.message;
    }
  });

  ADMIN.onShow("stories", loadStories);

  /* =================== Characters =================== */

  var charForm = field("char-form");
  var charPreview = field("char-preview");
  var editingChar = null;

  var charMedia = ADMIN.mediaManager({
    list: field("char-media"),
    starRole: "portrait",
    normalRole: "concept",
    starLabel: "Portrait",
    kinds: ["image"],
    onChange: renderCharPreview
  });
  field("char-files").addEventListener("change", function () { charMedia.add(this.files); this.value = ""; });
  ADMIN.dropzone(field("char-dropzone"), function (files) { charMedia.add(files); });

  var charVisibility = ADMIN.visibility("char-visibility", "char-schedule-row", "char-publishAt");

  function renderCharPreview() {
    charPreview.textContent = "";
    var items = charMedia.items().filter(function (m) { return !m.uploading && m.url; });
    var portrait = items.find(function (m) { return m.role === "portrait"; }) || items[0];
    if (portrait) charPreview.appendChild(el("img", { class: "char-preview-portrait", src: portrait.url, alt: "" }));
    charPreview.appendChild(el("h3", {}, field("char-name").value.trim() || "Unnamed"));
    if (field("char-role").value.trim()) charPreview.appendChild(el("p", { class: "sticker" }, field("char-role").value.trim()));
    if (field("char-tagline").value.trim()) charPreview.appendChild(el("p", { class: "logline" }, field("char-tagline").value.trim()));
    if (field("char-profile").value.trim()) {
      var prose = el("div", { class: "prose work-body" });
      MW.renderMarkup(prose, field("char-profile").value);
      charPreview.appendChild(prose);
    }
  }
  charForm.addEventListener("input", renderCharPreview);

  function resetChar() {
    editingChar = null;
    charForm.reset();
    MW.showProblems(charForm, []);
    charMedia.load([]);
    charVisibility.set(false, null);
    field("char-cancel").hidden = true;
    field("char-form-title").textContent = "New character";
    field("char-kicker").textContent = "Characters // new";
    renderCharPreview();
  }

  async function editChar(id) {
    try {
      var data = await MW.api("/admin/characters/" + id);
      var c = data.character;
      await ADMIN.fillSeriesSelects();
      editingChar = c;
      MW.showProblems(charForm, []);
      field("char-name").value = c.name;
      field("char-role").value = c.role || "";
      field("char-tagline").value = c.tagline || "";
      field("char-profile").value = c.profile || "";
      field("char-series").value = c.seriesId ? String(c.seriesId) : "";
      field("char-order").value = c.sortOrder === null || c.sortOrder === undefined ? "" : c.sortOrder;
      charMedia.load(c.media);
      charVisibility.set(c.published, c.publishAt);
      field("char-cancel").hidden = false;
      field("char-form-title").textContent = "Edit: " + c.name;
      field("char-kicker").textContent = "Characters // edit";
      field("char-feedback").textContent = "";
      renderCharPreview();
      field("char-form-title").scrollIntoView({ block: "start" });
    } catch (error) {
      MW.toast(error.message, true);
    }
  }
  ADMIN.editCharacter = function (id) {
    ADMIN.show("characters", { keepUrl: true });
    editChar(id);
  };

  // Shared with the Drafts tab.
  ADMIN.characterRow = function (c, reload) {
    return ADMIN.listItem({
      imageUrl: c.portraitUrl,
      title: c.name,
      meta: [c.role, c.seriesTitle].filter(Boolean).join(" · ") || "No story yet",
      flag: ADMIN.statusText(c),
      actions: [
        el("a", { class: "btn btn-ghost btn-small", href: MW.characterUrl(c.slug) }, c.status === "live" ? "View" : "Preview"),
        ADMIN.button("Edit", function () { ADMIN.editCharacter(c.id); }),
        ADMIN.confirmButton("Delete", async function () {
          await MW.api("/admin/characters/" + c.id, { method: "DELETE" });
          MW.toast("Deleted " + c.name + ".");
          if (editingChar && editingChar.id === c.id) resetChar();
          reload();
        })
      ]
    });
  };

  async function loadChars() {
    var list = field("char-list");
    try {
      var data = await MW.api("/admin/characters");
      list.textContent = "";
      if (!data.characters.length) ADMIN.emptyRow(list, "No characters yet.");
      data.characters.forEach(function (c) { list.appendChild(ADMIN.characterRow(c, loadChars)); });
    } catch (error) {
      ADMIN.emptyRow(list, error.message);
    }
  }

  field("char-cancel").addEventListener("click", resetChar);
  charForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var fb = field("char-feedback");
    fb.className = "feedback";
    fb.textContent = "";
    var problems = [];
    if (!field("char-name").value.trim()) problems.push({ field: "name", message: "Give the character a name." });
    var vis = charVisibility.value();
    if (vis.problem) problems.push({ field: "publishAt", message: vis.problem });
    if (charMedia.busy()) problems.push({ field: "media", message: "Wait for the uploads to finish." });
    MW.showProblems(charForm, problems);
    if (problems.length) return;

    var payload = {
      name: field("char-name").value,
      role: field("char-role").value,
      tagline: field("char-tagline").value,
      profile: field("char-profile").value,
      seriesId: field("char-series").value,
      sortOrder: field("char-order").value,
      published: vis.published,
      publishAt: vis.publishAt,
      media: charMedia.value()
    };
    var button = field("char-save");
    button.disabled = true;
    try {
      var data = editingChar
        ? await MW.api("/admin/characters/" + editingChar.id, { method: "PUT", json: payload })
        : await MW.api("/admin/characters", { method: "POST", json: payload });
      var c = data.character;
      resetChar();
      fb.className = "feedback feedback-success";
      fb.textContent = (c.status === "draft" ? "Draft saved: " : c.status === "scheduled" ? "Scheduled: " : "Published: ") + c.name + ". ";
      fb.appendChild(el("a", { href: MW.characterUrl(c.slug) }, c.status === "live" ? "View" : "Preview"));
      loadChars();
    } catch (error) {
      MW.showProblems(charForm, (error.data && error.data.problems) || []);
      fb.className = "feedback feedback-error";
      fb.textContent = error.message;
    }
    button.disabled = false;
  });

  ADMIN.onReady(resetChar);
  ADMIN.onShow("characters", function (options) {
    ADMIN.fillSeriesSelects();
    loadChars();
    if (options.fresh) resetChar();
  });
})();
