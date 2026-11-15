/* public/js/poll.js  -  shows a poll or questionnaire on a work page, lets members answer,
   and draws the results as bars. MW.renderPoll(parent, post) */
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;

  function results(box, post) {
    var area = box.querySelector(".poll-results") || box.appendChild(el("div", { class: "poll-results" }));
    area.textContent = "";
    MW.api("/posts/" + post.id + "/results").then(function (r) {
      if (!r.visible) {
        area.appendChild(el("p", { class: "muted" }, r.total + " response" + (r.total === 1 ? "" : "s") + " so far." +
          (post.form.results === "creator" ? " Only the creator can see the results." : " Answer to see the results.")));
        return;
      }
      area.appendChild(el("p", { class: "mono muted" }, r.total + " response" + (r.total === 1 ? "" : "s") + (r.closed ? " · closed" : "")));
      r.questions.forEach(function (q) {
        var wrap = el("div", { class: "poll-q" });
        var qp = el("p"); qp.appendChild(el("strong", {}, q.text)); wrap.appendChild(qp);
        if (q.options) {
          var max = Math.max(1, r.total);
          q.options.forEach(function (o) {
            var pct = Math.round((o.count / max) * 100);
            var bar = el("div", { class: "poll-bar" });
            var fill = el("span", { class: "fill" });
            fill.style.width = pct + "%";
            var label = el("span", { class: "label" });
            label.append(el("span", {}, o.label), el("span", { class: "mono" }, pct + "% (" + o.count + ")"));
            bar.append(fill, label);
            wrap.appendChild(bar);
          });
        } else if (q.answers) {
          var ul = el("ul");
          q.answers.slice(0, 50).forEach(function (a) { ul.appendChild(el("li", {}, "“" + a.text + "” — @" + a.username)); });
          if (!q.answers.length) ul.appendChild(el("li", { class: "muted" }, "No written answers yet."));
          wrap.appendChild(ul);
        } else {
          wrap.appendChild(el("p", { class: "muted" }, q.count + " written answer" + (q.count === 1 ? "" : "s") + " (only the creator can read them)."));
        }
        area.appendChild(wrap);
      });
    }).catch(function (e) { area.appendChild(el("p", { class: "muted" }, e.message)); });
  }

  MW.renderPoll = function (parent, post) {
    var form = post.form;
    if (!form) return;
    var box = el("section", { class: "poll-box", "aria-label": form.kind === "poll" ? "Poll" : "Questionnaire" });
    box.appendChild(el("p", { class: "node-label" }, form.kind === "poll" ? "Poll" : "Questionnaire"));
    var closed = form.closesAt && new Date(form.closesAt) < new Date();
    if (form.closesAt) box.appendChild(el("p", { class: "muted" }, (closed ? "Closed " : "Closes ") + MW.formatDateTime(form.closesAt)));
    parent.appendChild(box);

    MW.me().then(function (user) {
      var answered = Boolean(post.myResponse);
      if (closed || answered || !user) {
        if (!user && !closed) {
          var p = el("p");
          p.appendChild(el("a", { href: "/hub/login?next=" + encodeURIComponent(MW.currentPath()) }, "Log in"));
          p.appendChild(document.createTextNode(" to answer."));
          box.appendChild(p);
        }
        if (answered) box.appendChild(el("p", { class: "feedback feedback-success" }, "Thanks, your answer is in."));
        results(box, post);
        return;
      }
      var f = el("form", { class: "poll-form" });
      form.questions.forEach(function (q, qi) {
        var fs = el("fieldset", { class: "poll-q" });
        fs.appendChild(el("legend", {}, q.text));
        if (q.type === "text") {
          fs.appendChild(el("textarea", { name: q.id, rows: "3", maxlength: "1000", "aria-label": q.text }));
        } else {
          q.options.forEach(function (o, i) {
            var id = "p" + post.id + "-" + qi + "-" + i;
            var row = el("label", { class: "poll-option", for: id });
            row.append(el("input", { type: q.type === "multiple" ? "checkbox" : "radio", name: q.id, value: String(i), id: id }), el("span", {}, o));
            fs.appendChild(row);
          });
        }
        f.appendChild(fs);
      });
      var send = el("button", { type: "submit" }, form.kind === "poll" ? "Vote" : "Send my answers");
      var fb = el("p", { class: "feedback", "aria-live": "polite" });
      f.append(send, fb);
      box.appendChild(f);
      if (form.results === "always") results(box, post);
      f.addEventListener("submit", function (event) {
        event.preventDefault();
        var answers = {};
        form.questions.forEach(function (q) {
          if (q.type === "text") answers[q.id] = f.elements[q.id].value;
          else if (q.type === "multiple") answers[q.id] = Array.prototype.filter.call(f.querySelectorAll("input[name='" + q.id + "']"), function (i) { return i.checked; }).map(function (i) { return Number(i.value); });
          else { var c = f.querySelector("input[name='" + q.id + "']:checked"); answers[q.id] = c ? Number(c.value) : null; }
        });
        send.disabled = true;
        MW.api("/posts/" + post.id + "/responses", { method: "POST", json: { answers: answers } }).then(function () {
          f.remove();
          post.myResponse = answers;
          box.appendChild(el("p", { class: "feedback feedback-success" }, "Thanks, your answer is in."));
          results(box, post);
        }).catch(function (e) {
          fb.className = "feedback feedback-error";
          fb.textContent = e.message;
          send.disabled = false;
        });
      });
    });
  };
})();
