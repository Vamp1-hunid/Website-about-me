// js/work.js
// Single work page (/work/<slug>): the image or text, likes, favourites and comments.

(function () {
  "use strict";

  var MW = window.MW;
  var article = document.getElementById("work");
  if (!article || !MW) return;

  var el = MW.el;
  var slug = decodeURIComponent(window.location.pathname.replace(/^\/work\//, "").replace(/\/$/, ""));
  var post = null;
  var user = null;

  function loginUrl() {
    return "/login?next=" + encodeURIComponent(window.location.pathname);
  }

  function showError(message) {
    article.textContent = "";
    article.appendChild(el("p", { class: "node-label" }, "Error // file missing"));
    article.appendChild(el("h1", { class: "glitch" }, "Signal lost"));
    article.appendChild(el("p", { class: "lead" }, message));
    var back = el("a", { class: "btn", href: "/gallery" }, "Back to all works");
    article.appendChild(back);
  }

  /* ---------- Like and save buttons ---------- */

  function actionButton(label, pressed, count) {
    var button = el("button", { class: "btn btn-ghost btn-small", type: "button", "aria-pressed": String(pressed) });
    button.textContent = count === undefined ? label : label + " · " + count;
    return button;
  }

  function wireToggle(button, kind, labelOn, labelOff, showCount) {
    button.addEventListener("click", async function () {
      if (!user) {
        window.location.href = loginUrl();
        return;
      }
      var on = button.getAttribute("aria-pressed") === "true";
      button.disabled = true;
      try {
        var data = await MW.api("/posts/" + post.id + "/" + kind, { method: on ? "DELETE" : "POST" });
        var nowOn = !on;
        button.setAttribute("aria-pressed", String(nowOn));
        var label = nowOn ? labelOn : labelOff;
        button.textContent = showCount ? label + " · " + data.count : label;
        if (kind === "favourite") MW.toast(nowOn ? "Saved to your favourites." : "Removed from your favourites.");
        if (kind === "like" && nowOn) MW.glitch(article.querySelector("h1"));
      } catch (error) {
        MW.toast(error.message, true);
      }
      button.disabled = false;
    });
  }

  /* ---------- The work itself ---------- */

  function renderPost() {
    document.title = post.title + " | Mulenga Mwamba";
    article.textContent = "";

    var layout = el("div", { class: "work-layout" + (post.imageUrl ? "" : " no-image") });

    if (post.imageUrl) {
      var figure = el("figure", { class: "work-image" });
      var link = el("a", { href: post.imageUrl, target: "_blank", rel: "noopener", title: "Open full size" });
      link.appendChild(el("img", { src: post.imageUrl, alt: post.title }));
      figure.appendChild(link);
      layout.appendChild(figure);
      MW.profile(figure, {
        name: post.title,
        kicker: "FILE SCAN",
        id: "FILE " + String(post.id).padStart(3, "0"),
        rows: [
          ["TYPE", MW.categoryName(post.category)],
          ["ARTIST", "Mulenga Mwamba"],
          ["UPLOADED", MW.formatDate(post.createdAt)],
          ["LIKES", String(post.likes)]
        ]
      });
    }

    var info = el("div");
    info.appendChild(el("span", { class: "sticker", "data-category": post.category }, MW.categoryName(post.category)));
    var title = el("h1", { class: "glitch" }, post.title);
    title.style.fontSize = "clamp(1.8rem, 5vw, 3rem)";
    title.style.marginTop = "0.75rem";
    info.appendChild(title);

    var dateLine = "Posted " + MW.formatDate(post.createdAt);
    if (post.updatedAt && Math.abs(new Date(post.updatedAt) - new Date(post.createdAt)) > 60000) {
      dateLine += " · edited " + MW.formatDate(post.updatedAt);
    }
    if (!post.published) dateLine += " · DRAFT (only you can see this)";
    info.appendChild(el("p", { class: "mono muted" }, dateLine));

    if (post.summary) info.appendChild(el("p", { class: "lead" }, post.summary));

    var actions = el("div", { class: "work-actions" });
    var likeBtn = actionButton(post.liked ? "♥ Liked" : "♡ Like", post.liked, post.likes);
    var saveBtn = actionButton(post.favourited ? "★ Saved" : "☆ Save", post.favourited);
    actions.append(likeBtn, saveBtn);
    if (user && user.role === "admin") {
      actions.appendChild(el("a", { class: "btn btn-small", href: "/admin?edit=" + post.id }, "Edit"));
    }
    info.appendChild(actions);

    if (post.published) {
      wireToggle(likeBtn, "like", "♥ Liked", "♡ Like", true);
      wireToggle(saveBtn, "favourite", "★ Saved", "☆ Save", false);
    } else {
      likeBtn.disabled = true;
      saveBtn.disabled = true;
    }

    if (post.body) {
      var body = el("div", { class: "work-body" + (post.imageUrl ? "" : " reading") });
      body.textContent = post.body; // white-space: pre-wrap keeps the line breaks
      info.appendChild(body);
    }

    layout.appendChild(info);
    article.appendChild(layout);
  }

  /* ---------- Comments ---------- */

  var list = document.getElementById("comments");

  function renderComment(comment) {
    var item = el("li", { class: "comment" + (comment.author.role === "admin" ? " by-admin" : "") });
    var header = el("header");
    header.appendChild(el("span", { class: "who" }, comment.author.displayName));
    header.appendChild(el("span", {}, "@" + comment.author.username));
    if (comment.author.role === "admin") header.appendChild(el("span", { class: "sticker sticker-pink" }, "Artist"));
    header.appendChild(el("time", { datetime: comment.createdAt }, MW.formatDate(comment.createdAt)));

    if (comment.canDelete) {
      var del = el("button", { class: "btn btn-ghost btn-small", type: "button" }, "Delete");
      del.addEventListener("click", async function () {
        if (del.getAttribute("data-confirm") !== "yes") {
          del.setAttribute("data-confirm", "yes");
          del.textContent = "Confirm delete";
          return;
        }
        del.disabled = true;
        try {
          await MW.api("/comments/" + comment.id, { method: "DELETE" });
          item.remove();
          if (!list.children.length) showNoComments();
        } catch (error) {
          MW.toast(error.message, true);
          del.disabled = false;
        }
      });
      header.appendChild(del);
    }

    item.appendChild(header);
    item.appendChild(el("p", {}, comment.body));
    return item;
  }

  function showNoComments() {
    list.textContent = "";
    list.appendChild(el("li", { class: "muted", "data-empty": "1" }, "No comments yet. Be the first."));
  }

  async function loadComments() {
    var panel = document.getElementById("comments-panel");
    if (!post.published) return; // drafts have no comments
    panel.hidden = false;
    try {
      var data = await MW.api("/posts/" + post.id + "/comments");
      list.textContent = "";
      if (!data.comments.length) showNoComments();
      data.comments.forEach(function (comment) { list.appendChild(renderComment(comment)); });
    } catch (error) {
      list.textContent = "";
      list.appendChild(el("li", { class: "muted" }, error.message));
    }

    var form = document.getElementById("comment-form");
    if (user) {
      form.hidden = false;
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        var textarea = document.getElementById("comment-body");
        var text = textarea.value.trim();
        if (!text) {
          MW.showProblems(form, [{ field: "body", message: "Write something first." }]);
          return;
        }
        MW.showProblems(form, []);
        var button = form.querySelector("button[type='submit']");
        button.disabled = true;
        try {
          var data = await MW.api("/posts/" + post.id + "/comments", { method: "POST", json: { body: text } });
          var empty = list.querySelector("[data-empty]");
          if (empty) empty.remove();
          list.appendChild(renderComment(data.comment));
          textarea.value = "";
          MW.toast("Comment posted.");
        } catch (error) {
          MW.showProblems(form, [{ field: "body", message: error.message }]);
        }
        button.disabled = false;
      });
    } else {
      document.getElementById("comment-login").hidden = false;
      document.getElementById("comment-login-link").href = loginUrl();
      document.getElementById("comment-join-link").href = "/register?next=" + encodeURIComponent(window.location.pathname);
    }
  }

  /* ---------- Start ---------- */

  Promise.all([MW.me(), MW.api("/posts/" + encodeURIComponent(slug))])
    .then(function (results) {
      user = results[0];
      post = results[1].post;
      renderPost();
      return loadComments();
    })
    .catch(function (error) {
      showError(error.status === 404 ? "That work doesn't exist, or it was removed." : error.message);
    });
})();
