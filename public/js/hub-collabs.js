// js/hub-collabs.js  -  the collab board (/hub/collabs) and one request (/hub/collabs/<id>)
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;

  /* ---------- Board ---------- */
  var list = document.getElementById("collab-list");
  if (list) {
    var params = new URLSearchParams(window.location.search);
    MW.collabMeta().catch(function () { return { roles: [], compensation: [] }; }).then(function (meta) {
      MW.fillRoleSelect(document.getElementById("role"), meta.roles);
      meta.compensation.forEach(function (c) { document.getElementById("comp").appendChild(el("option", { value: c.key }, c.label)); });
      document.getElementById("role").value = params.get("role") || "";
      document.getElementById("comp").value = params.get("comp") || "";
    });
    document.getElementById("cq").value = params.get("q") || "";
    MW.me().then(function (user) {
      var post = document.getElementById("post-collab");
      var creator = user && (user.role === "admin" || (MW.creator && MW.creator.status === "approved"));
      if (!creator) {
        post.href = user ? "/hub/apply" : "/register?next=/hub/apply";
        post.textContent = "Become a creator to post requests";
      }
    });
    var query = new URLSearchParams();
    ["role", "comp", "q"].forEach(function (k) { if (params.get(k)) query.set(k, params.get(k)); });
    var page = Math.max(1, parseInt(params.get("page"), 10) || 1);
    query.set("page", String(page));
    MW.api("/collabs?" + query.toString()).then(function (data) {
      list.textContent = "";
      if (!data.collabs.length) list.appendChild(el("li", { class: "empty" }, query.toString().length > 6 ? "No open requests match. Try another filter." : "No open collab requests yet. Be the first!"));
      data.collabs.forEach(function (c) { list.appendChild(MW.collabCard(c)); });
      if (data.pages > 1) {
        document.getElementById("kpage").textContent = "Page " + data.page + " of " + data.pages;
        var make = function (n) { var q = new URLSearchParams(query); q.set("page", String(n)); return "/hub/collabs?" + q.toString(); };
        var prev = document.getElementById("kprev"), next = document.getElementById("knext");
        prev.hidden = data.page <= 1; prev.href = make(data.page - 1);
        next.hidden = data.page >= data.pages; next.href = make(data.page + 1);
      }
    }).catch(function (error) {
      list.textContent = "";
      if (error.status === 401) {
        var filters = list.parentNode.querySelector("form");
        if (filters) filters.hidden = true;
        var li = el("li");
        li.appendChild(MW.guestGate("The collab board is for members. Create a free account to see open requests and team up with other creators."));
        list.appendChild(li);
      } else list.textContent = error.message;
    });
    return;
  }

  /* ---------- One request ---------- */
  var box = document.getElementById("collab");
  if (!box) return;
  var id = window.location.pathname.replace(/^\/hub\/collabs\//, "").replace(/\/$/, "");

  Promise.all([MW.api("/collabs/" + encodeURIComponent(id)), MW.me()]).then(function (results) {
    var c = results[0].collab, user = results[1];
    document.title = c.title + " | Collabs | Chapterhive";
    box.textContent = "";
    box.appendChild(el("p", { class: "node-label" }, "Collab request" + (c.status === "closed" ? " · closed" : "")));
    box.appendChild(el("h1", {}, c.title));
    var chips = el("div", { class: "kind-chips collab-chips" });
    chips.appendChild(el("span", { class: "kind-chip chip-looking" }, "Looking for: " + c.lookingFor.label));
    if (c.offering) chips.appendChild(el("span", { class: "kind-chip" }, "Brings: " + c.offering.label));
    chips.appendChild(el("span", { class: "kind-chip chip-comp" }, c.compensation.label));
    box.appendChild(chips);
    box.appendChild(MW.byline({ handle: c.creator.handle, name: c.creator.name, avatarUrl: c.creator.avatarUrl }, user));
    box.appendChild(el("p", { class: "mono muted" }, "Posted " + MW.formatDate(c.createdAt) +
      (c.updatedAt && new Date(c.updatedAt) - new Date(c.createdAt) > 60000 ? " · updated " + MW.formatDate(c.updatedAt) : "")));
    if (c.series) {
      var sp = el("p");
      sp.appendChild(document.createTextNode("For the story "));
      sp.appendChild(el("a", { href: "/hub/s/" + encodeURIComponent(c.series.slug) }, c.series.title));
      box.appendChild(sp);
    }
    var prose = el("div", { class: "prose work-body reading-left" });
    MW.renderMarkup(prose, c.description);
    box.appendChild(prose);

    if (c.isMine) {
      var tools = el("div", { class: "hero-actions" });
      tools.appendChild(el("a", { class: "btn btn-small", href: "/hub/studio#collabs" }, "Manage in studio"));
      box.appendChild(tools);
      var replies = document.getElementById("replies");
      if (!c.replyList.length) replies.appendChild(el("li", { class: "muted" }, "No replies yet."));
      c.replyList.forEach(function (r) {
        var li = el("li", { class: "comment" });
        var head = el("header");
        head.appendChild(MW.avatar(r.from));
        var name = el("a", { class: "who", href: r.from.creatorHandle ? "/hub/c/" + encodeURIComponent(r.from.creatorHandle) : "/u/" + encodeURIComponent(r.from.username) }, r.from.displayName);
        head.append(name, el("span", {}, "@" + r.from.username + (r.from.creatorHandle ? " · creator" : "")), el("time", { datetime: r.createdAt }, MW.formatDateTime(r.createdAt)));
        li.appendChild(head);
        li.appendChild(el("p", {}, r.message));
        replies.appendChild(li);
      });
      document.getElementById("replies-panel").hidden = false;
      return;
    }

    if (user) {
      var rp = el("p");
      rp.appendChild(MW.reportLink("collab", c.id, "Report this request"));
      box.appendChild(rp);
    }
    if (c.status !== "open") return;
    var panel = document.getElementById("reply-panel");
    panel.hidden = false;
    var form = document.getElementById("reply-form");
    if (!user) {
      form.textContent = "";
      var p = el("p");
      p.appendChild(el("a", { class: "btn", href: "/login?next=" + encodeURIComponent(MW.currentPath()) }, "Log in to reply"));
      form.appendChild(p);
      return;
    }
    if (c.myReply) {
      document.getElementById("message").value = c.myReply.message;
      form.querySelector("button[type='submit']").textContent = "Update my reply";
      document.getElementById("reply-feedback").textContent = "You replied on " + MW.formatDate(c.myReply.createdAt) + ".";
    }
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var fb = document.getElementById("reply-feedback");
      var message = document.getElementById("message").value.trim();
      if (message.length < 10) {
        MW.showProblems(form, [{ field: "message", message: "Say who you are and how to reach you (at least 10 characters)." }]);
        return;
      }
      MW.showProblems(form, []);
      var button = form.querySelector("button[type='submit']");
      button.disabled = true;
      try {
        var data = await MW.api("/collabs/" + c.id + "/replies", { method: "POST", json: { message: message } });
        fb.className = "feedback feedback-success";
        fb.textContent = data.updated ? "Reply updated." : "Sent! " + c.creator.name + " can now read your message.";
        button.textContent = "Update my reply";
      } catch (error) {
        fb.className = "feedback feedback-error";
        fb.textContent = error.message;
      }
      button.disabled = false;
    });
  }).catch(function (error) {
    box.textContent = "";
    if (error.status === 401) {
      box.appendChild(el("h1", {}, "Members only"));
      box.appendChild(MW.guestGate("Collab requests are for members. Create a free account to read this one and reply."));
      return;
    }
    box.appendChild(el("h1", {}, "Not found"));
    box.appendChild(el("p", { class: "lead" }, error.message));
    box.appendChild(el("a", { class: "btn", href: "/hub/collabs" }, "Back to the collab board"));
  });
})();
