// js/gallery.js
// Works page: lists works, filtered by ?category= (or ?section=concept-art), ?series=, ?tag=,
// searched with ?q=, sorted with ?sort=, and split into pages with ?page=.

(function () {
  "use strict";

  var MW = window.MW;
  var grid = document.getElementById("works-grid");
  if (!grid) return;

  var params = new URLSearchParams(window.location.search);
  var state = {
    category: params.get("category") || "",
    section: params.get("section") || "",
    q: (params.get("q") || "").trim(),
    sort: params.get("sort") || "",
    series: params.get("series") || "",
    tag: params.get("tag") || ""
  };
  var page = Math.max(1, parseInt(params.get("page"), 10) || 1);

  // Highlight the active filter button.
  var activeFilter = state.section === "concept-art" ? "concept-art" : state.category;
  document.querySelectorAll("[data-filter]").forEach(function (link) {
    if (link.getAttribute("data-filter") === activeFilter) link.setAttribute("aria-pressed", "true");
  });

  // Fill in the tools form from the address.
  document.getElementById("tool-category").value = state.category;
  if (!state.category) document.getElementById("tool-category").disabled = true;
  document.getElementById("tool-q").value = state.q;
  document.getElementById("tool-sort").value = ["new", "old", "popular"].includes(state.sort) ? state.sort : "new";

  // Empty fields are left out of the address when the form is sent.
  document.getElementById("gallery-tools").addEventListener("submit", function () {
    this.querySelectorAll("input, select").forEach(function (field) {
      if (!field.value || (field.name === "sort" && field.value === "new" && !state.series)) field.disabled = true;
    });
  });

  MW.api("/posts/meta/filters").then(function (data) {
    var seriesSelect = document.getElementById("tool-series");
    data.series.forEach(function (s) {
      var option = MW.el("option", { value: s.slug }, s.title + " (" + s.works + ")");
      seriesSelect.appendChild(option);
    });
    seriesSelect.value = state.series;
    var tagSelect = document.getElementById("tool-tag");
    data.tags.forEach(function (t) {
      tagSelect.appendChild(MW.el("option", { value: t.tag }, "#" + t.tag + " (" + t.works + ")"));
    });
    tagSelect.value = state.tag;
    seriesSelect.closest(".form-row").hidden = !data.series.length;
    tagSelect.closest(".form-row").hidden = !data.tags.length;
  }).catch(function () {});

  var label = state.section === "concept-art" ? "Concept art" : state.category ? MW.categoryName(state.category) : "";
  if (state.category === "updates") label = "Updates";
  if (label) document.title = label + " | God's Banditos";

  var describe = [];
  if (state.q) describe.push("matching “" + state.q + "”");
  if (state.series) describe.push("in the story " + state.series.replace(/-/g, " "));
  if (state.tag) describe.push("tagged #" + state.tag);
  if (describe.length) {
    var line = document.getElementById("active-filters");
    line.textContent = "Showing works " + describe.join(", ") + ". ";
    line.appendChild(MW.el("a", { href: "/gallery" + (state.category ? "?category=" + encodeURIComponent(state.category) : "") }, "Clear filters"));
  }

  function pageUrl(number) {
    var next = new URLSearchParams();
    Object.keys(state).forEach(function (key) { if (state[key]) next.set(key, state[key]); });
    if (number > 1) next.set("page", String(number));
    var query = next.toString();
    return "/gallery" + (query ? "?" + query : "");
  }

  var query = new URLSearchParams();
  Object.keys(state).forEach(function (key) { if (state[key]) query.set(key, state[key]); });
  query.set("page", String(page));

  MW.api("/posts?" + query.toString())
    .then(function (data) {
      var empty = describe.length ? "No works match. Try clearing the filters." :
        label ? "Nothing in " + label + " yet." : "No works posted yet.";
      MW.renderWorks(grid, data.posts, empty);

      if (data.pages > 1) {
        document.getElementById("pager").hidden = false;
        document.getElementById("page-info").textContent = "Page " + data.page + " of " + data.pages;
        var prev = document.getElementById("prev-page");
        var next = document.getElementById("next-page");
        prev.hidden = data.page <= 1;
        next.hidden = data.page >= data.pages;
        prev.href = pageUrl(data.page - 1);
        next.href = pageUrl(data.page + 1);
      }
    })
    .catch(function (error) {
      grid.textContent = "";
      grid.appendChild(MW.el("p", { class: "empty" }, error.message));
    });
})();
