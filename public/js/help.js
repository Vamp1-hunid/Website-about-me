/* public/js/help.js  -  the Help & FAQ page */
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;
  var list = document.getElementById("faq-list");
  var filter = document.getElementById("faq-filter");
  var all = [];

  function render() {
    var q = filter.value.trim().toLowerCase();
    list.textContent = "";
    var groups = {};
    all.forEach(function (f) {
      if (q && (f.q + " " + f.a).toLowerCase().indexOf(q) === -1) return;
      (groups[f.group] = groups[f.group] || []).push(f);
    });
    var names = Object.keys(groups);
    if (!names.length) { list.appendChild(el("p", { class: "muted" }, "No questions match. Try the assistant or the suggestion box.")); return; }
    names.forEach(function (name) {
      var g = el("div", { class: "faq-group" });
      g.appendChild(el("h3", {}, name));
      groups[name].forEach(function (f) {
        var d = el("details", { class: "faq-item", id: f.id });
        d.appendChild(el("summary", {}, f.q));
        d.appendChild(el("p", {}, f.a));
        g.appendChild(d);
      });
      list.appendChild(g);
    });
    var target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target && target.tagName === "DETAILS") { target.open = true; }
  }

  MW.api("/help/faq").then(function (d) { all = d.faq; render(); })
    .catch(function (e) { list.textContent = e.message; });
  filter.addEventListener("input", render);
  window.addEventListener("hashchange", render);

  MW.me().then(function () {
    if (MW.feature("help_assistant")) {
      document.getElementById("assistant").hidden = false;
      var wait = window.setInterval(function () {
        if (!MW.helpChat) return;
        window.clearInterval(wait);
        MW.helpChat(document.getElementById("assistant-box"));
      }, 50);
    }
    if (MW.suggestionBox) MW.suggestionBox(document.getElementById("suggest-box"));
  });
})();
