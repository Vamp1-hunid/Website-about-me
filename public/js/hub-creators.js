// js/hub-creators.js  -  creator directory (/hub/creators)
(function () {
  "use strict";
  var MW = window.MW;
  var list = document.getElementById("creator-list");
  if (!MW || !list) return;
  var params = new URLSearchParams(window.location.search);
  ["q", "kind", "sort"].forEach(function (k) {
    var field = document.getElementById("c" + (k === "q" ? "q" : k));
    if (field && params.get(k)) field.value = params.get(k);
  });
  var page = Math.max(1, parseInt(params.get("page"), 10) || 1);
  var query = new URLSearchParams();
  ["q", "kind", "sort"].forEach(function (k) { if (params.get(k)) query.set(k, params.get(k)); });
  query.set("page", String(page));

  function pageUrl(n) {
    var next = new URLSearchParams(query);
    next.set("page", String(n));
    return "/hub/creators?" + next.toString();
  }

  MW.api("/hub/creators?" + query.toString()).then(function (data) {
    list.textContent = "";
    if (!data.creators.length) list.appendChild(MW.el("p", { class: "empty" }, "No creators match. Try another search."));
    data.creators.forEach(function (c) { list.appendChild(MW.creatorCard(c)); });
    if (data.pages > 1) {
      document.getElementById("cpage").textContent = "Page " + data.page + " of " + data.pages;
      var prev = document.getElementById("cprev"), next = document.getElementById("cnext");
      prev.hidden = data.page <= 1; prev.href = pageUrl(data.page - 1);
      next.hidden = data.page >= data.pages; next.href = pageUrl(data.page + 1);
    }
  }).catch(function (error) { list.textContent = error.message; });
})();
