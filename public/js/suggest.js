/* public/js/suggest.js  -  the suggestion box (help page, collab board, studio).
   MW.suggestionBox(container) draws the form; suggestions land in the admin inbox. */
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;

  MW.suggestionBox = function (container) {
    container.textContent = "";
    MW.me().then(function (user) {
      if (!MW.feature("suggestion_box")) return;
      var host = container.closest("section[hidden]");
      if (host) host.hidden = false;
      if (!user) {
        var p = el("p", { class: "muted" }, "");
        p.appendChild(el("a", { href: "/login?next=" + encodeURIComponent(MW.currentPath()) }, "Log in"));
        p.appendChild(document.createTextNode(" to drop something in the suggestion box."));
        container.appendChild(p);
        return;
      }
      var form = el("form", { class: "suggest-form", novalidate: "" });
      var row1 = el("div", { class: "form-row" });
      row1.appendChild(el("label", { for: "sg-topic" }, "What's it about?"));
      var topic = el("select", { id: "sg-topic" });
      [["feature", "An idea or new feature"], ["bug", "Something isn't working"], ["content", "Content or categories"], ["other", "Something else"]]
        .forEach(function (o) { topic.appendChild(el("option", { value: o[0] }, o[1])); });
      row1.appendChild(topic);
      var row2 = el("div", { class: "form-row" });
      row2.appendChild(el("label", { for: "sg-message" }, "Your suggestion"));
      var msg = el("textarea", { id: "sg-message", rows: "4", maxlength: "2000", required: "" });
      row2.appendChild(msg);
      var button = el("button", { type: "submit" }, "Drop it in the box");
      var feedback = el("p", { class: "feedback", "aria-live": "polite" });
      form.append(row1, row2, button, feedback);
      container.appendChild(form);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (msg.value.trim().length < 10) { feedback.className = "feedback feedback-error"; feedback.textContent = "Tell us a little more (at least 10 characters)."; return; }
        button.disabled = true;
        MW.api("/suggestions", { method: "POST", json: { topic: topic.value, message: msg.value.trim() } }).then(function () {
          form.reset();
          feedback.className = "feedback feedback-success";
          feedback.textContent = "Thanks! Your suggestion is in the owner's inbox.";
        }).catch(function (e) {
          feedback.className = "feedback feedback-error";
          feedback.textContent = e.message;
        }).then(function () { button.disabled = false; });
      });
    });
  };
})();
