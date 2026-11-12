// js/admin.js
// Admin area (site owner only): post new works, edit or delete existing ones.
// The server checks the admin role on every request, so hiding this page is
// only for convenience, not for security.

(function () {
  "use strict";

  var MW = window.MW;
  var gate = document.getElementById("gate-message");
  var area = document.getElementById("admin-area");
  if (!gate || !MW) return;

  var el = MW.el;
  var form = document.getElementById("post-form");
  var feedback = document.getElementById("form-feedback");
  var imageInput = document.getElementById("image");
  var preview = document.getElementById("image-preview");
  var removeRow = document.getElementById("remove-image-row");
  var removeBox = document.getElementById("removeImage");
  var saveBtn = document.getElementById("save-btn");
  var cancelBtn = document.getElementById("cancel-edit");
  var list = document.getElementById("admin-list");
  var listPage = 1;
  var editing = null; // the post being edited, or null when creating
  var previewUrl = null;

  /* ---------- Access check ---------- */

  MW.me().then(function (user) {
    if (!user) {
      window.location.replace("/login?next=" + encodeURIComponent("/admin"));
      return;
    }
    if (user.role !== "admin") {
      gate.classList.remove("loading");
      gate.textContent = "Access denied. This area is only for the site owner.";
      return;
    }
    gate.classList.remove("loading");
    gate.textContent = "Welcome back, " + user.displayName + ". Post a new work or manage the archive.";
    area.hidden = false;
    loadList(1);

    var editId = new URLSearchParams(window.location.search).get("edit");
    if (editId && /^\d+$/.test(editId)) startEdit(Number(editId));
  });

  /* ---------- Image preview ---------- */

  function showPreview(src) {
    if (src) {
      preview.src = src;
      preview.hidden = false;
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
    }
  }

  imageInput.addEventListener("change", function () {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    var file = imageInput.files[0];
    if (!file) {
      showPreview(editing && editing.imageUrl);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      MW.showProblems(form, [{ field: "image", message: "That image is bigger than 8 MB. Please choose a smaller one." }]);
      imageInput.value = "";
      return;
    }
    MW.showProblems(form, []);
    previewUrl = URL.createObjectURL(file);
    showPreview(previewUrl);
    removeBox.checked = false;
  });

  removeBox.addEventListener("change", function () {
    if (removeBox.checked) showPreview(null);
    else showPreview(editing && editing.imageUrl);
  });

  /* ---------- Create / edit ---------- */

  function resetForm() {
    editing = null;
    form.reset();
    document.getElementById("published").checked = true;
    MW.showProblems(form, []);
    showPreview(null);
    removeRow.hidden = true;
    cancelBtn.hidden = true;
    saveBtn.textContent = "Publish";
    document.getElementById("editor-title").textContent = "Post a new work";
    document.getElementById("editor-kicker").textContent = "Upload // new file";
    if (window.location.search) history.replaceState(null, "", "/admin");
  }

  async function startEdit(id) {
    try {
      var data = await MW.api("/posts/by-id/" + id);
      var post = data.post;
      editing = post;
      form.reset();
      MW.showProblems(form, []);
      feedback.textContent = "";
      document.getElementById("title").value = post.title;
      document.getElementById("category").value = post.category;
      document.getElementById("summary").value = post.summary;
      document.getElementById("body").value = post.body;
      document.getElementById("published").checked = post.published;
      showPreview(post.imageUrl);
      removeRow.hidden = !post.imageUrl;
      cancelBtn.hidden = false;
      saveBtn.textContent = "Save changes";
      document.getElementById("editor-title").textContent = "Edit: " + post.title;
      document.getElementById("editor-kicker").textContent = "Edit // file " + String(post.id).padStart(3, "0");
      history.replaceState(null, "", "/admin?edit=" + post.id);
      document.getElementById("editor-title").scrollIntoView({ block: "start" });
    } catch (error) {
      MW.toast(error.message, true);
    }
  }

  cancelBtn.addEventListener("click", resetForm);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    feedback.textContent = "";
    feedback.className = "feedback";

    var formData = new FormData();
    formData.append("title", document.getElementById("title").value);
    formData.append("category", document.getElementById("category").value);
    formData.append("summary", document.getElementById("summary").value);
    formData.append("body", document.getElementById("body").value);
    formData.append("published", String(document.getElementById("published").checked));
    if (imageInput.files[0]) formData.append("image", imageInput.files[0]);
    if (editing && removeBox.checked) formData.append("removeImage", "true");

    // Quick checks before uploading.
    var problems = [];
    if (!document.getElementById("title").value.trim()) {
      problems.push({ field: "title", message: "Give the work a title." });
    }
    var needsImage = document.getElementById("category").value !== "writing";
    var hasImage = imageInput.files[0] || (editing && editing.imageUrl && !removeBox.checked);
    if (needsImage && !hasImage) {
      problems.push({ field: "image", message: "Story art and anime works need an image." });
    }
    MW.showProblems(form, problems);
    if (problems.length) return;

    saveBtn.disabled = true;
    saveBtn.textContent = imageInput.files[0] ? "Uploading…" : "Saving…";
    try {
      var result = editing
        ? await MW.api("/posts/" + editing.id, { method: "PUT", form: formData })
        : await MW.api("/posts", { method: "POST", form: formData });
      var wasEditing = Boolean(editing);
      resetForm();
      feedback.className = "feedback feedback-success";
      feedback.textContent = (wasEditing ? "Saved: " : "Published: ") + result.post.title + ". ";
      var view = el("a", { href: "/work/" + encodeURIComponent(result.post.slug) }, "View it");
      feedback.appendChild(view);
      loadList(wasEditing ? listPage : 1);
    } catch (error) {
      MW.showProblems(form, (error.data && error.data.problems) || []);
      feedback.className = "feedback feedback-error";
      feedback.textContent = error.message;
      saveBtn.textContent = editing ? "Save changes" : "Publish";
    }
    saveBtn.disabled = false;
  });

  /* ---------- List of works ---------- */

  async function loadList(page) {
    listPage = page;
    try {
      var data = await MW.api("/posts?drafts=1&page=" + page);
      list.textContent = "";
      if (!data.posts.length) {
        list.appendChild(el("li", { class: "muted" }, "Nothing posted yet. Your first work will appear here."));
      }
      data.posts.forEach(function (post) { list.appendChild(listItem(post)); });

      document.getElementById("admin-page").textContent = data.pages > 1 ? "Page " + data.page + " of " + data.pages : "";
      document.getElementById("admin-prev").hidden = data.page <= 1;
      document.getElementById("admin-next").hidden = data.page >= data.pages;
    } catch (error) {
      list.textContent = "";
      list.appendChild(el("li", { class: "muted" }, error.message));
    }
  }

  document.getElementById("admin-prev").addEventListener("click", function () { loadList(listPage - 1); });
  document.getElementById("admin-next").addEventListener("click", function () { loadList(listPage + 1); });

  function listItem(post) {
    var item = el("li");
    if (post.imageUrl) item.appendChild(el("img", { src: post.imageUrl, alt: "", loading: "lazy" }));
    else item.appendChild(el("div", { class: "no-img", "aria-hidden": "true" }));

    var text = el("div");
    text.appendChild(el("div", { class: "title" }, post.title));
    var meta = MW.categoryName(post.category) + " · " + MW.formatDate(post.createdAt) +
      " · ♥ " + post.likes + " · \u{1F4AC} " + post.comments;
    text.appendChild(el("div", { class: "mono muted" }, meta));
    if (!post.published) text.appendChild(el("div", { class: "draft-flag mono" }, "DRAFT"));
    item.appendChild(text);

    var actions = el("div", { class: "row-actions" });
    actions.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/work/" + encodeURIComponent(post.slug) }, "View"));
    var edit = el("button", { class: "btn btn-ghost btn-small", type: "button" }, "Edit");
    edit.addEventListener("click", function () { startEdit(post.id); });
    var del = el("button", { class: "btn btn-small btn-danger", type: "button" }, "Delete");
    del.addEventListener("click", async function () {
      if (del.getAttribute("data-confirm") !== "yes") {
        del.setAttribute("data-confirm", "yes");
        del.textContent = "Confirm delete";
        window.setTimeout(function () {
          del.removeAttribute("data-confirm");
          del.textContent = "Delete";
        }, 4000);
        return;
      }
      del.disabled = true;
      try {
        await MW.api("/posts/" + post.id, { method: "DELETE" });
        MW.toast("Deleted: " + post.title);
        if (editing && editing.id === post.id) resetForm();
        loadList(listPage);
      } catch (error) {
        MW.toast(error.message, true);
        del.disabled = false;
      }
    });
    actions.append(edit, del);
    item.appendChild(actions);
    return item;
  }
})();
