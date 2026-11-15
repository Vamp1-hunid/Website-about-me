/* public/js/form-builder.js  -  the poll / questionnaire builder used in Compose.
   MW.formBuilder(container) -> { value(), load(form), clear(), isEmpty() } */
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;
  var uid = 0;

  MW.formBuilder = function (container) {
    container.textContent = "";
    container.classList.add("form-builder");

    var top = el("div", { class: "fb-row" });
    var kindLabel = el("label", { for: "fb-kind" }, "Type");
    var kind = el("select", { id: "fb-kind" });
    kind.appendChild(el("option", { value: "" }, "None"));
    kind.appendChild(el("option", { value: "poll" }, "Poll (one question)"));
    kind.appendChild(el("option", { value: "questionnaire" }, "Questionnaire (several questions)"));
    var resultsLabel = el("label", { for: "fb-results" }, "Who sees results");
    var results = el("select", { id: "fb-results" });
    [["after-vote", "Everyone, after they answer"], ["always", "Everyone, any time"], ["creator", "Only me"]]
      .forEach(function (o) { results.appendChild(el("option", { value: o[0] }, o[1])); });
    var closesLabel = el("label", { for: "fb-closes" }, "Closes (optional)");
    var closes = el("input", { type: "datetime-local", id: "fb-closes" });
    top.append(kindLabel, kind, resultsLabel, results, closesLabel, closes);

    var list = el("div", { class: "fb-list" });
    var add = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "＋ Add a question");
    container.append(top, list, add);

    function optionRow(qBox, value) {
      var row = el("div", { class: "fb-row fb-option" });
      var input = el("input", { type: "text", maxlength: "80", placeholder: "Option", "aria-label": "Option" });
      input.value = value || "";
      var remove = el("button", { type: "button", class: "link-button", "aria-label": "Remove option" }, "Remove");
      remove.addEventListener("click", function () { row.remove(); });
      row.append(input, remove);
      qBox.querySelector(".fb-options").appendChild(row);
    }

    function question(q) {
      q = q || { type: "single", text: "", options: ["", ""] };
      uid++;
      var box = el("div", { class: "fb-question" });
      var row = el("div", { class: "fb-row" });
      var text = el("input", { type: "text", maxlength: "200", placeholder: "Your question", "aria-label": "Question" });
      text.value = q.text || "";
      text.className = "fb-text";
      var type = el("select", { "aria-label": "Answer type", class: "fb-type" });
      [["single", "Pick one"], ["multiple", "Pick any"], ["text", "Written answer"]].forEach(function (o) { type.appendChild(el("option", { value: o[0] }, o[1])); });
      type.value = q.type || "single";
      var remove = el("button", { type: "button", class: "link-button" }, "Remove question");
      remove.addEventListener("click", function () { box.remove(); sync(); });
      row.append(text, type, remove);
      var opts = el("div", { class: "fb-options" });
      var addOpt = el("button", { type: "button", class: "link-button fb-add-option" }, "＋ Add option");
      addOpt.addEventListener("click", function () { optionRow(box, ""); });
      box.append(row, opts, addOpt);
      (q.options && q.options.length ? q.options : ["", ""]).forEach(function (o) { optionRow(box, o); });
      function showOpts() { var t = type.value === "text"; opts.hidden = t; addOpt.hidden = t; }
      type.addEventListener("change", showOpts);
      showOpts();
      list.appendChild(box);
      sync();
    }

    function sync() {
      var on = Boolean(kind.value);
      list.hidden = !on; add.hidden = !on;
      results.disabled = !on; closes.disabled = !on;
      var count = list.children.length;
      if (on && !count) question();
      add.hidden = !on || (kind.value === "poll" && list.children.length >= 1);
      list.querySelectorAll(".fb-type").forEach(function (sel) {
        var textOpt = sel.querySelector("option[value='text']");
        textOpt.disabled = kind.value === "poll";
        if (kind.value === "poll" && sel.value === "text") { sel.value = "single"; sel.dispatchEvent(new Event("change")); }
      });
    }
    kind.addEventListener("change", function () {
      if (kind.value === "poll") while (list.children.length > 1) list.lastChild.remove();
      sync();
    });
    add.addEventListener("click", function () { question(); });

    function toLocal(iso) {
      if (!iso) return "";
      var d = new Date(iso);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    }

    var api = {
      isEmpty: function () { return !kind.value; },
      value: function () {
        if (!kind.value) return null;
        return {
          kind: kind.value,
          results: results.value,
          closesAt: closes.value ? new Date(closes.value).toISOString() : null,
          questions: Array.prototype.map.call(list.children, function (box) {
            var t = box.querySelector(".fb-type").value;
            return {
              text: box.querySelector(".fb-text").value,
              type: t,
              options: t === "text" ? [] : Array.prototype.map.call(box.querySelectorAll(".fb-option input"), function (i) { return i.value; }).filter(function (v) { return v.trim(); })
            };
          })
        };
      },
      load: function (form) {
        list.textContent = "";
        kind.value = form ? form.kind : "";
        results.value = (form && form.results) || "after-vote";
        closes.value = form ? toLocal(form.closesAt) : "";
        if (form) form.questions.forEach(function (q) { question(q); });
        sync();
      },
      clear: function () { api.load(null); },
      start: function (which) { if (!kind.value) { kind.value = which || "poll"; sync(); } }
    };
    sync();
    return api;
  };
})();
