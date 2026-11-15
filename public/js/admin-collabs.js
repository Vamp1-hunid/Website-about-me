// js/admin-collabs.js  -  Studio -> Collabs: post and manage collab requests.
(function () {
  "use strict";
  var MW = window.MW;
  var ADMIN = window.ADMIN;
  var form = document.getElementById("collab-form");
  if (!MW || !ADMIN || !form) return;
  var el = MW.el;
  function field(id) { return document.getElementById(id); }
  var editing = null;
  var ready = MW.collabMeta().then(function (meta) {
    MW.fillRoleSelect(field("k-looking"), meta.roles, field("k-looking-other-row"));
    MW.fillRoleSelect(field("k-offering"), meta.roles, field("k-offering-other-row"));
    meta.compensation.forEach(function (c) { field("k-comp").appendChild(el("option", { value: c.key }, c.label)); });
    field("k-comp").value = "negotiable";
  });

  function fillStories() {
    return ADMIN.loadSeries(true).then(function (series) {
      var select = field("k-series");
      var current = select.value;
      select.querySelectorAll("option:not([value=''])").forEach(function (o) { o.remove(); });
      series.forEach(function (s) { select.appendChild(el("option", { value: String(s.id) }, s.title)); });
      select.value = current;
    });
  }

  function syncOthers() {
    if (field("k-looking")._syncOther) field("k-looking")._syncOther();
    if (field("k-offering")._syncOther) field("k-offering")._syncOther();
  }

  function reset() {
    editing = null;
    form.reset();
    field("k-comp").value = "negotiable";
    MW.showProblems(form, []);
    syncOthers();
    field("k-cancel").hidden = true;
    field("k-save").textContent = "Post request";
    field("collab-form-title").textContent = "Post a collab request";
    field("collab-kicker").textContent = "Collabs // new request";
  }

  function edit(c) {
    editing = c;
    field("k-title").value = c.title;
    field("k-looking").value = c.lookingFor.key;
    field("k-looking-other").value = c.lookingForOther || "";
    field("k-offering").value = c.offering ? c.offering.key : "";
    field("k-offering-other").value = c.offeringOther || "";
    field("k-comp").value = c.compensation.key;
    field("k-series").value = c.series ? String(c.series.id) : "";
    field("k-description").value = c.description;
    syncOthers();
    field("k-cancel").hidden = false;
    field("k-save").textContent = "Save changes";
    field("collab-form-title").textContent = "Edit: " + c.title;
    field("collab-kicker").textContent = "Collabs // edit";
    field("collab-feedback").textContent = "";
    field("collab-form-title").scrollIntoView({ block: "start" });
  }

  async function loadMine() {
    var list = field("my-collabs");
    try {
      var data = await MW.api("/collabs/mine");
      list.textContent = "";
      if (!data.collabs.length) ADMIN.emptyRow(list, "No requests yet. Post one to find a collaborator.");
      data.collabs.forEach(function (c) {
        var actions = [
          el("a", { class: "btn btn-small" + (c.replies ? "" : " btn-ghost"), href: "/hub/collabs/" + c.id }, c.replies ? "Replies (" + c.replies + ")" : "View"),
          ADMIN.button("Edit", function () { edit(c); }),
          ADMIN.button(c.status === "open" ? "Close" : "Reopen", async function () {
            await MW.api("/collabs/" + c.id + "/status", { method: "POST", json: { status: c.status === "open" ? "closed" : "open" } });
            MW.toast(c.status === "open" ? "Request closed: it's hidden from the board." : "Request reopened.");
            loadMine();
          }),
          ADMIN.confirmButton("Delete", async function () {
            await MW.api("/collabs/" + c.id, { method: "DELETE" });
            if (editing && editing.id === c.id) reset();
            loadMine();
          })
        ];
        list.appendChild(ADMIN.listItem({
          title: c.title,
          meta: "Looking for: " + c.lookingFor.label + " · " + c.compensation.label + " · " + MW.formatDate(c.createdAt),
          flag: c.status === "closed" ? "CLOSED" : "",
          actions: actions
        }));
      });
    } catch (error) {
      ADMIN.emptyRow(list, error.message);
    }
  }

  field("k-cancel").addEventListener("click", reset);
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var fb = field("collab-feedback");
    fb.className = "feedback";
    fb.textContent = "";
    var payload = {
      title: field("k-title").value,
      lookingFor: field("k-looking").value,
      lookingForOther: field("k-looking-other").value,
      offering: field("k-offering").value,
      offeringOther: field("k-offering-other").value,
      compensation: field("k-comp").value,
      seriesId: field("k-series").value,
      description: field("k-description").value
    };
    var problems = [];
    if (!payload.title.trim()) problems.push({ field: "title", message: "Give your request a short title." });
    if (!payload.lookingFor) problems.push({ field: "lookingFor", message: "Choose who you're looking for." });
    if (payload.lookingFor === "other" && payload.lookingForOther.trim().length < 3) problems.push({ field: "lookingForOther", message: "Describe who you're looking for." });
    if (payload.description.trim().length < 20) problems.push({ field: "description", message: "Describe the project in a few sentences." });
    MW.showProblems(form, problems);
    if (problems.length) return;
    field("k-save").disabled = true;
    try {
      var data = editing
        ? await MW.api("/collabs/" + editing.id, { method: "PUT", json: payload })
        : await MW.api("/collabs", { method: "POST", json: payload });
      reset();
      fb.className = "feedback feedback-success";
      fb.textContent = "Saved. ";
      fb.appendChild(el("a", { href: "/hub/collabs/" + data.collab.id }, "See it on the collab board"));
      loadMine();
    } catch (error) {
      MW.showProblems(form, (error.data && error.data.problems) || []);
      fb.className = "feedback feedback-error";
      fb.textContent = error.message;
    }
    field("k-save").disabled = false;
  });

  ADMIN.onShow("collabs", function () { ready.then(function () { fillStories(); loadMine(); }); });
})();
