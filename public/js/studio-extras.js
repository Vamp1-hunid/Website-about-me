// js/studio-extras.js  -  extra boxes in the creator studio: collab invitations and the comic panel maker.
(function () {
  "use strict";
  var MW = window.MW;
  var main = document.getElementById("main");
  if (!MW || !main) return;
  var el = MW.el;

  MW.me().then(function (user) {
    if (!user) return;
    var box = el("section", { class: "panel studio-extras", id: "collab-invites" });
    var head = el("div", { class: "af-section-head" });
    head.appendChild(el("h2", {}, "✨ Collab invitations"));
    box.appendChild(head);
    var list = el("div");
    box.appendChild(list);
    if (MW.feature("comic_maker")) {
      var tool = el("p", { class: "muted" }, "Making a web comic? ");
      tool.appendChild(el("a", { class: "btn btn-small", href: "/hub/comic-maker" }, "🗯️ Open the comic panel maker"));
      box.appendChild(tool);
    }
    MW.api("/posts/collabs/invites").then(function (d) {
      var waiting = d.invites.filter(function (i) { return i.status === "invited"; });
      if (!waiting.length) {
        list.appendChild(el("p", { class: "muted" }, "No invitations right now. When another creator credits you on a post, it appears here."));
      }
      waiting.forEach(function (i) {
        var row = el("div", { class: "invite-row" });
        var text = el("p");
        text.appendChild(el("strong", {}, i.from));
        text.appendChild(document.createTextNode(" invited you to be credited on "));
        text.appendChild(el("a", { href: "/hub/w/" + encodeURIComponent(i.slug) }, i.title));
        row.appendChild(text);
        [["Accept", true], ["Decline", false]].forEach(function (b) {
          var btn = el("button", { type: "button", class: b[1] ? "btn btn-small" : "btn btn-ghost btn-small" }, b[0]);
          btn.addEventListener("click", function () {
            MW.api("/posts/" + i.postId + "/collab", { method: "POST", json: { accept: b[1] } }).then(function () {
              row.replaceWith(el("p", { class: "feedback feedback-success" }, b[1] ? "You're credited on \"" + i.title + "\". It now shows on your page." : "Invitation declined."));
            }).catch(function (e) { MW.toast(e.message, true); });
          });
          row.appendChild(btn);
        });
        list.appendChild(row);
      });
      main.insertBefore(box, main.children[1] || null);
      if (window.location.hash === "#collab-invites") box.scrollIntoView();
    }).catch(function () {});
  });
})();
