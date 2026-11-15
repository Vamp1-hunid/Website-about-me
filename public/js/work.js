// js/work.js
// Single work page (/work/<slug>): pictures / video / audio, formatted text, series and tags,
// next and previous links, likes, favourites and comments (with replies and editing).

(function () {
  "use strict";

  var MW = window.MW;
  var article = document.getElementById("work");
  if (!article || !MW) return;

  var el = MW.el;
  var slug = decodeURIComponent(window.location.pathname.replace(/^\/(work|hub\/w|hub\/news)\//, "").replace(/\/$/, ""));
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
    article.appendChild(el("a", { class: "btn", href: "/gallery" }, "Back to all works"));
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
        if (kind === "like" && nowOn && MW.glitch) MW.glitch(article.querySelector("h1"));
      } catch (error) {
        MW.toast(error.message, true);
      }
      button.disabled = false;
    });
  }

  /* ---------- The work itself ---------- */

  function seriesLabel() {
    if (!post.series) return "";
    var nav = post.nav && post.nav.series;
    if (post.seriesOrder !== null && post.seriesOrder !== undefined) return "Chapter " + post.seriesOrder;
    return nav ? "Part " + nav.position + " of " + nav.count : "";
  }

  function renderHeader(info) {
    var stickers = el("div", { class: "sticker-row" });
    stickers.appendChild(el("span", { class: "sticker", "data-category": post.category }, MW.categoryName(post.category)));
    if (post.series) {
      var seriesHref = MW.isHub ? MW.storyUrl(post.series.slug, post.creator) : "/gallery?series=" + encodeURIComponent(post.series.slug);
      var s = el("a", { class: "sticker sticker-series", href: seriesHref });
      s.textContent = post.series.title + (seriesLabel() ? " · " + seriesLabel() : "");
      stickers.appendChild(s);
    }
    info.appendChild(stickers);

    if (post.logline) info.appendChild(el("p", { class: "logline logline-big" }, post.logline));
    var title = el("h1", { class: "glitch work-title" }, post.title);
    info.appendChild(title);

    var dateLine = "Posted " + MW.formatDate(post.createdAt);
    if (post.updatedAt && Math.abs(new Date(post.updatedAt) - new Date(post.createdAt)) > 60000) {
      dateLine += " · edited " + MW.formatDate(post.updatedAt);
    }
    var pages = post.media.filter(function (m) { return m.kind === "image"; }).length;
    if (pages > 1) dateLine += " · " + pages + " pages";
    if (post.body && post.category === "writing") dateLine += " · " + MW.readingStats(post.body);
    if (post.status === "draft") dateLine += " · DRAFT (only you can see this)";
    if (post.status === "scheduled") dateLine += " · SCHEDULED for " + MW.formatDateTime(post.publishAt) + " (only you can see this)";
    info.appendChild(el("p", { class: "mono muted" }, dateLine));

    if (post.summary) info.appendChild(el("p", { class: "lead" }, post.summary));

    if (post.tags && post.tags.length) {
      var tags = el("ul", { class: "tag-list", "aria-label": "Tags" });
      post.tags.forEach(function (tag) {
        var li = el("li");
        li.appendChild(el("a", { href: MW.isHub ? "/hub/search?q=" + encodeURIComponent(tag) : "/gallery?tag=" + encodeURIComponent(tag) }, "#" + tag));
        tags.appendChild(li);
      });
      info.appendChild(tags);
    }

    var actions = el("div", { class: "work-actions" });
    var likeBtn = actionButton(post.liked ? "♥ Liked" : "♡ Like", post.liked, post.likes);
    var saveBtn = actionButton(post.favourited ? "★ Saved" : "☆ Save", post.favourited);
    actions.append(likeBtn, saveBtn);
    if (post.isMine) {
      var editHref = !MW.isHub && user && user.role === "admin" ? "/admin?edit=" + post.id : "/hub/studio?edit=" + post.id;
      actions.appendChild(el("a", { class: "btn btn-small", href: editHref }, "Edit"));
    }
    info.appendChild(actions);
    if (MW.isHub && post.creator && MW.byline) info.appendChild(MW.byline(post.creator, user));
    if (user && !post.isMine && MW.reportLink) info.appendChild(MW.reportLink("post", post.id, "Report this work"));

    if (post.status === "live") {
      wireToggle(likeBtn, "like", "♥ Liked", "♡ Like", true);
      wireToggle(saveBtn, "favourite", "★ Saved", "☆ Save", false);
    } else {
      likeBtn.disabled = true;
      saveBtn.disabled = true;
    }
  }

  function renderBody(parent, reading) {
    if (!post.body) return;
    var body = el("div", { class: "work-body prose font-" + (post.font || "theme") + (reading ? " reading" : "") });
    MW.renderMarkup(body, post.body);
    parent.appendChild(body);
  }

  function renderDocuments(parent) {
    var docs = MW.renderDocuments(post.media || []);
    if (docs) parent.appendChild(docs);
  }

  function renderPost() {
    document.title = post.title + (MW.isHub ? " | Afterframe" : " | God's Banditos");
    if (MW.isHub) {
      var back = document.getElementById("back-link");
      if (back && post.category === "news") { back.href = "/hub/news"; back.textContent = "← Anime updates"; }
      else if (back && post.creator) { back.href = "/hub/c/" + encodeURIComponent(post.creator.handle); back.textContent = "← " + post.creator.name; }
    }
    var metaDesc = document.querySelector("meta[name='description']");
    if (metaDesc) metaDesc.setAttribute("content", post.summary || MW.categoryName(post.category) + " by Mulenga Mwamba");
    article.textContent = "";

    // Pages, clips and audio shown in the work (cover-only pictures and downloads are handled separately).
    var media = (post.media || []).filter(function (m) { return m.role !== "cover" && m.kind !== "document"; });
    var single = media.length === 1 && media[0].kind === "image";
    if (post.font && post.font !== "theme") document.body.classList.add("uses-font-" + post.font);

    if (single) {
      // One picture: picture on the left, details on the right (as before).
      var layout = el("div", { class: "work-layout" });
      var figure = el("figure", { class: "work-image" });
      var link = el("a", { href: media[0].originalUrl, target: "_blank", rel: "noopener", title: "Open full size" });
      link.appendChild(el("img", { src: media[0].url, alt: media[0].caption || post.title }));
      figure.appendChild(link);
      if (media[0].caption) figure.appendChild(el("figcaption", { class: "mono muted" }, media[0].caption));
      layout.appendChild(figure);
      if (MW.profile) {
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
      renderHeader(info);
      renderBody(info, false);
      renderDocuments(info);
      layout.appendChild(info);
      article.appendChild(layout);
    } else {
      // Several files (a chapter, a clip, audio) or none (writing): details on top, then the media, then the text.
      var head = el("div", { class: "work-head" });
      renderHeader(head);
      article.appendChild(head);
      if (media.length) article.appendChild(MW.renderMedia(media, post.title));
      renderBody(article, true);
      renderDocuments(article);
    }

    renderNav();
  }

  /* ---------- Next / previous ---------- */

  function navLink(target, label, direction) {
    var a = el("a", { class: "work-nav-link work-nav-" + direction, href: MW.workUrl({ slug: target.slug, category: post.category, creator: post.creator }) });
    a.appendChild(el("span", { class: "mono muted" }, label));
    a.appendChild(el("span", { class: "work-nav-title" }, target.title));
    return a;
  }

  function renderNav() {
    var box = document.getElementById("work-nav");
    if (!box || !post.nav) return;
    box.textContent = "";
    var nav = post.nav;

    if (nav.series && nav.series.count > 1) {
      var row = el("div", { class: "work-nav-row" });
      row.appendChild(el("p", { class: "node-label work-nav-heading" }, "Series // " + nav.series.title + " · " + nav.series.position + " / " + nav.series.count));
      var links = el("div", { class: "work-nav-links" });
      links.appendChild(nav.series.prev ? navLink(nav.series.prev, "← Previous chapter", "prev") : el("span"));
      var all = el("a", { class: "btn btn-ghost btn-small", href: MW.isHub ? MW.storyUrl(nav.series.slug, post.creator) : "/gallery?series=" + encodeURIComponent(nav.series.slug) }, "All chapters");
      links.appendChild(all);
      links.appendChild(nav.series.next ? navLink(nav.series.next, "Next chapter →", "next") : el("span"));
      row.appendChild(links);
      box.appendChild(row);
    }

    if (nav.older || nav.newer) {
      var row2 = el("div", { class: "work-nav-row" });
      row2.appendChild(el("p", { class: "node-label work-nav-heading" }, MW.isHub && post.creator ? "More from " + post.creator.name : "Archive // keep browsing"));
      var links2 = el("div", { class: "work-nav-links" });
      links2.appendChild(nav.newer ? navLink(nav.newer, "← Newer work", "prev") : el("span"));
      links2.appendChild(el("span"));
      links2.appendChild(nav.older ? navLink(nav.older, "Older work →", "next") : el("span"));
      row2.appendChild(links2);
      box.appendChild(row2);
    }
    box.hidden = !box.children.length;

    // Arrow keys move between works (only when not typing in a box).
    document.addEventListener("keydown", function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey || /input|textarea|select/i.test(event.target.tagName)) return;
      var target = null;
      var sNav = nav.series && nav.series.count > 1 ? nav.series : null;
      if (event.key === "ArrowLeft") target = (sNav && sNav.prev) || nav.newer;
      if (event.key === "ArrowRight") target = (sNav && sNav.next) || nav.older;
      if (target) window.location.href = MW.workUrl({ slug: target.slug, category: post.category, creator: post.creator });
    });
  }

  /* ---------- Comments ---------- */

  var list = document.getElementById("comments");
  var commentCount = 0;

  MW.avatar = MW.avatar || function (author, size) {
    var box = el("span", { class: "avatar" + (size === "big" ? " avatar-big" : ""), "aria-hidden": "true" });
    if (author.avatarUrl) {
      box.appendChild(el("img", { src: author.avatarUrl, alt: "", loading: "lazy" }));
    } else {
      box.textContent = (author.displayName || author.username || "?").trim().charAt(0).toUpperCase();
    }
    return box;
  };

  function updateCount() {
    var title = document.getElementById("comments-title");
    if (title) title.textContent = commentCount ? "Comments (" + commentCount + ")" : "Comments";
  }

  function confirmButton(button, label, action) {
    button.addEventListener("click", async function () {
      if (button.getAttribute("data-confirm") !== "yes") {
        button.setAttribute("data-confirm", "yes");
        button.textContent = label;
        window.setTimeout(function () {
          button.removeAttribute("data-confirm");
          button.textContent = "Delete";
        }, 4000);
        return;
      }
      button.disabled = true;
      try {
        await action();
      } catch (error) {
        MW.toast(error.message, true);
        button.disabled = false;
      }
    });
  }

  function commentText(comment) {
    var p = el("p", { class: "comment-text" }, comment.body);
    return p;
  }

  function renderComment(comment) {
    var isReply = Boolean(comment.parentId);
    var item = el("li", {
      class: "comment" + (comment.author.role === "admin" ? " by-admin" : "") + (isReply ? " is-reply" : ""),
      id: "comment-" + comment.id
    });
    var header = el("header");
    header.appendChild(MW.avatar(comment.author));
    var who = el("a", { class: "who", href: "/u/" + encodeURIComponent(comment.author.username) }, comment.author.displayName);
    if (user && !comment.canEdit && MW.reportLink) {
      var rep = MW.reportLink("comment", comment.id, "Report");
      rep.classList.add("comment-report");
      item.dataset.report = "1";
      window.setTimeout(function () { tools.appendChild(rep); }, 0);
    }
    header.appendChild(who);
    header.appendChild(el("span", {}, "@" + comment.author.username));
    if (comment.author.role === "admin") header.appendChild(el("span", { class: "sticker sticker-pink" }, "Artist"));
    var time = el("time", { datetime: comment.createdAt }, MW.formatDate(comment.createdAt));
    header.appendChild(time);
    var edited = el("span", { class: "edited", title: comment.editedAt ? "Edited " + MW.formatDate(comment.editedAt) : "" }, comment.editedAt ? "(edited)" : "");
    header.appendChild(edited);

    var tools = el("span", { class: "comment-tools" });
    header.appendChild(tools);
    item.appendChild(header);

    var text = commentText(comment);
    item.appendChild(text);

    // Reply (on every comment; replies to a reply join the same thread)
    if (user) {
      var reply = el("button", { class: "btn btn-ghost btn-small", type: "button" }, "Reply");
      reply.addEventListener("click", function () {
        var top = isReply ? document.getElementById("comment-" + comment.parentId) : item;
        if (top) openReplyForm(top, comment);
      });
      tools.appendChild(reply);
    }

    // Edit (own comments only)
    if (comment.canEdit) {
      var edit = el("button", { class: "btn btn-ghost btn-small", type: "button" }, "Edit");
      edit.addEventListener("click", function () {
        if (item.querySelector(".edit-form")) return;
        var form = el("form", { class: "edit-form", novalidate: "" });
        var area = el("textarea", { rows: "3", maxlength: "1000", "aria-label": "Edit your comment" });
        area.value = comment.body;
        var row = el("div", { class: "hero-actions" });
        var save = el("button", { type: "submit", class: "btn-small" }, "Save");
        var cancel = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Cancel");
        var error = el("p", { class: "error" });
        row.append(save, cancel);
        form.append(area, error, row);
        text.hidden = true;
        text.after(form);
        area.focus();
        cancel.addEventListener("click", function () { form.remove(); text.hidden = false; });
        form.addEventListener("submit", async function (event) {
          event.preventDefault();
          var value = area.value.trim();
          if (!value) { error.textContent = "Write something, or delete the comment instead."; return; }
          save.disabled = true;
          try {
            var data = await MW.api("/comments/" + comment.id, { method: "PUT", json: { body: value } });
            comment.body = data.comment.body;
            comment.editedAt = data.comment.editedAt;
            text.textContent = comment.body;
            edited.textContent = comment.editedAt ? "(edited)" : "";
            form.remove();
            text.hidden = false;
            if (data.changed) MW.toast("Comment updated.");
          } catch (err) {
            error.textContent = err.message;
            save.disabled = false;
          }
        });
      });
      tools.appendChild(edit);
    }

    if (comment.canDelete) {
      var del = el("button", { class: "btn btn-ghost btn-small", type: "button" }, "Delete");
      var replies = function () { return item.querySelectorAll(".comment").length; };
      confirmButton(del, isReply ? "Confirm delete" : "Confirm delete", async function () {
        await MW.api("/comments/" + comment.id, { method: "DELETE" });
        commentCount -= 1 + replies();
        item.remove();
        updateCount();
        if (!list.children.length) showNoComments();
      });
      tools.appendChild(del);
    }

    if (!isReply) item.appendChild(el("ol", { class: "replies" }));
    return item;
  }

  function openReplyForm(topItem, target) {
    var existing = topItem.querySelector(":scope > .reply-form");
    if (existing) existing.remove();

    var form = el("form", { class: "reply-form", novalidate: "" });
    var label = el("label", {}, "Reply to " + target.author.displayName);
    var area = el("textarea", { rows: "2", maxlength: "1000" });
    var id = "reply-" + target.id;
    area.id = id;
    label.setAttribute("for", id);
    if (target.parentId) area.value = "@" + target.author.username + " ";
    var error = el("p", { class: "error" });
    var row = el("div", { class: "hero-actions" });
    var send = el("button", { type: "submit", class: "btn-small" }, "Post reply");
    var cancel = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Cancel");
    row.append(send, cancel);
    form.append(label, area, error, row);
    topItem.appendChild(form);
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);

    cancel.addEventListener("click", function () { form.remove(); });
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var value = area.value.trim();
      if (!value) { error.textContent = "Write something first."; return; }
      send.disabled = true;
      try {
        var data = await MW.api("/posts/" + post.id + "/comments", {
          method: "POST",
          json: { body: value, parentId: target.id }
        });
        topItem.querySelector(".replies").appendChild(renderComment(data.comment));
        commentCount++;
        updateCount();
        form.remove();
        MW.toast("Reply posted.");
      } catch (err) {
        error.textContent = err.message;
        send.disabled = false;
      }
    });
  }

  function showNoComments() {
    list.textContent = "";
    list.appendChild(el("li", { class: "muted", "data-empty": "1" }, "No comments yet. Be the first."));
  }

  async function loadComments() {
    var panel = document.getElementById("comments-panel");
    if (post.status !== "live") return; // drafts and scheduled works have no comments yet
    panel.hidden = false;
    try {
      var data = await MW.api("/posts/" + post.id + "/comments");
      list.textContent = "";
      commentCount = data.comments.length;
      updateCount();
      if (!data.comments.length) showNoComments();
      var tops = {};
      data.comments.forEach(function (comment) {
        if (!comment.parentId) {
          tops[comment.id] = renderComment(comment);
          list.appendChild(tops[comment.id]);
        }
      });
      data.comments.forEach(function (comment) {
        if (comment.parentId && tops[comment.parentId]) {
          tops[comment.parentId].querySelector(".replies").appendChild(renderComment(comment));
        }
      });
      // Coming from a link like /work/x#comment-12: scroll to that comment.
      if (/^#comment-\d+$/.test(window.location.hash)) {
        var target = document.querySelector(window.location.hash);
        if (target) {
          target.classList.add("is-target");
          target.scrollIntoView({ block: "center" });
        }
      }
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
          commentCount++;
          updateCount();
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
