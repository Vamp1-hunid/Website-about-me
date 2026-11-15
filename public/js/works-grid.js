// js/works-grid.js
// Builds the work cards used on the home page, the Works page and the profile page.
// Every value from the server is put on the page with textContent (never innerHTML),
// so a title can never run as code.

(function () {
  "use strict";

  var MW = (window.MW = window.MW || {});

  MW.workCard = function (post) {
    var el = MW.el;
    var card = el("a", { class: "work-card reveal is-in", href: MW.workUrl(post) });

    var thumb = el("div", { class: "thumb" });
    var sticker = el("span", { class: "sticker", "data-category": post.category }, MW.categoryName(post.category));
    thumb.appendChild(sticker);

    if (post.imageUrl) {
      var img = el("img", { src: post.imageUrl, alt: "", loading: "lazy", decoding: "async" });
      thumb.appendChild(img);
    } else {
      thumb.appendChild(el("div", { class: "thumb-text" }, post.summary || "Read the full piece →"));
    }
    card.appendChild(thumb);

    var meta = el("div", { class: "meta" });
    if (post.logline) meta.appendChild(el("p", { class: "logline" }, post.logline));
    meta.appendChild(el("h3", {}, post.title));
    if (MW.isHub && post.creator) meta.appendChild(el("p", { class: "card-creator" }, "by " + post.creator.name));
    if (post.series) {
      var chapter = post.seriesOrder !== null && post.seriesOrder !== undefined ? " · Ch. " + post.seriesOrder : "";
      meta.appendChild(el("p", { class: "mono muted card-series" }, post.series.title + chapter));
    }
    var counts = el("p", { class: "counts" });
    if (post.likes !== undefined) {
      counts.appendChild(el("span", {}, "♥ " + post.likes));
      counts.appendChild(el("span", {}, "\u{1F4AC} " + post.comments));
    }
    if (post.mediaCount > 1) counts.appendChild(el("span", {}, "▤ " + post.mediaCount));
    if (post.hasVideo) counts.appendChild(el("span", { title: "Has video" }, "▶"));
    if (post.hasAudio) counts.appendChild(el("span", { title: "Has audio" }, "♪"));
    if (post.status === "draft" || post.published === false) counts.appendChild(el("span", { class: "draft-flag" }, "DRAFT"));
    else if (post.status === "scheduled") counts.appendChild(el("span", { class: "draft-flag" }, "SCHEDULED"));
    meta.appendChild(counts);
    card.appendChild(meta);

    // Profiler details for this work.
    if (MW.profile) {
      var rows = [
        ["TYPE", MW.categoryName(post.category)],
        ["UPLOADED", MW.formatDate(post.createdAt || post.savedAt)]
      ];
      if (post.likes !== undefined) {
        rows.push(["LIKES", String(post.likes)]);
        rows.push(["COMMENTS", String(post.comments)]);
      }
      if (post.summary) rows.push(["NOTE", post.summary.length > 80 ? post.summary.slice(0, 79) + "…" : post.summary]);
      MW.profile(card, { name: post.title, rows: rows, kicker: "FILE SCAN", id: "FILE " + String(post.id).padStart(3, "0") });
    }
    return card;
  };

  // Replaces the contents of container with cards (or a message when there are none).
  MW.renderWorks = function (container, posts, emptyText) {
    container.textContent = "";
    if (!posts.length) {
      container.appendChild(MW.el("p", { class: "empty" }, emptyText || "No works here yet."));
      return;
    }
    posts.forEach(function (post) {
      container.appendChild(MW.workCard(post));
    });
  };
})();
