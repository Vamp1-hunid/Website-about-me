// js/story.js
// One story (/stories/<slug>): cover, logline, description, then Chapters, Characters and Concept art.

(function () {
  "use strict";

  var MW = window.MW;
  var hero = document.getElementById("story");
  if (!hero || !MW) return;
  var el = MW.el;
  var slug = decodeURIComponent(window.location.pathname.replace(/^\/(stories|hub\/s)\//, "").replace(/\/$/, ""));
  var storyCreator = null;

  // Shared with the character page and search: a character card.
  MW.characterCard = MW.characterCard || function (c) {
    var card = el("a", { class: "character-card", href: MW.characterUrl(c.slug, storyCreator) });
    var pic = el("div", { class: "character-portrait" });
    if (c.portraitUrl) pic.appendChild(el("img", { src: c.portraitUrl, alt: "", loading: "lazy" }));
    else pic.appendChild(el("span", { "aria-hidden": "true" }, c.name.charAt(0)));
    card.appendChild(pic);
    card.appendChild(el("h3", {}, c.name));
    if (c.role) card.appendChild(el("p", { class: "mono character-role" }, c.role));
    if (c.tagline) card.appendChild(el("p", { class: "muted" }, c.tagline));
    return card;
  };

  function render(data) {
    var story = data.story;
    storyCreator = story.creator;
    document.title = story.title + " | Chapterhive";
    if (MW.isHub && story.creator) {
      var back = document.getElementById("back-link");
      if (back) { back.href = "/hub/c/" + encodeURIComponent(story.creator.handle); back.textContent = "← " + story.creator.name; }
    }
    hero.textContent = "";
    var layout = el("div", { class: "story-hero-layout" + (story.coverUrl ? "" : " no-cover") });
    if (story.coverUrl) {
      var fig = el("figure", { class: "story-hero-cover" });
      fig.appendChild(el("img", { src: story.coverUrl, alt: "Cover of " + story.title }));
      layout.appendChild(fig);
    }
    var text = el("div");
    text.appendChild(el("p", { class: "node-label" }, "Story // file"));
    if (story.logline) text.appendChild(el("p", { class: "logline logline-big" }, story.logline));
    text.appendChild(el("h1", { class: "glitch" }, story.title));
    if (story.description) text.appendChild(el("p", { class: "lead" }, story.description));
    if (MW.isHub && story.creator && MW.byline) MW.me().then(function (u) { text.appendChild(MW.byline(story.creator, u)); });
    var counts = [];
    if (data.chapters.length) counts.push(data.chapters.length + (data.chapters.length === 1 ? " chapter" : " chapters"));
    if (data.characters.length) counts.push(data.characters.length + (data.characters.length === 1 ? " character" : " characters"));
    if (counts.length) text.appendChild(el("p", { class: "mono muted" }, counts.join(" · ")));
    var storyActions = el("p", { class: "work-actions" });
    if (data.chapters.length) {
      storyActions.appendChild(el("a", { class: "btn", href: MW.workUrl(data.chapters[0]) }, "Start reading"));
    }
    var shareStory = el("button", { type: "button", class: "btn btn-ghost" }, "↗ Share");
    shareStory.addEventListener("click", function () {
      MW.share({ title: story.title, text: story.title + (story.creator ? " by " + story.creator.name : "") + " on Chapterhive",
        url: MW.storyUrl(story.slug) });
    });
    storyActions.appendChild(shareStory);
    text.appendChild(storyActions);
    layout.appendChild(text);
    hero.appendChild(layout);

    var tabs = document.getElementById("story-tabs");
    var shown = 0;

    if (data.chapters.length) {
      var list = document.getElementById("chapter-list");
      data.chapters.forEach(function (post, i) {
        var li = el("li");
        var a = el("a", { class: "chapter-row", href: MW.workUrl(post) });
        if (post.imageUrl) a.appendChild(el("img", { src: post.imageUrl, alt: "", loading: "lazy" }));
        else a.appendChild(el("span", { class: "chapter-no", "aria-hidden": "true" }, String(post.seriesOrder || i + 1)));
        var t = el("span", { class: "chapter-text" });
        t.appendChild(el("span", { class: "mono muted" },
          (post.seriesOrder !== null && post.seriesOrder !== undefined ? "Chapter " + post.seriesOrder : "Part " + (i + 1)) +
          " · " + MW.categoryName(post.category) + " · " + MW.formatDate(post.createdAt)));
        t.appendChild(el("strong", {}, post.title));
        if (post.logline || post.summary) t.appendChild(el("span", { class: "muted" }, post.logline || post.summary));
        a.appendChild(t);
        li.appendChild(a);
        list.appendChild(li);
      });
      document.getElementById("chapters").hidden = false;
      shown++;
    } else {
      tabs.querySelector("a[href='#chapters']").remove();
    }

    if (data.characters.length) {
      var grid = document.getElementById("character-grid");
      data.characters.forEach(function (c) { grid.appendChild(MW.characterCard(c)); });
      document.getElementById("characters").hidden = false;
      shown++;
    } else {
      tabs.querySelector("a[href='#characters']").remove();
    }

    if (data.conceptArt.length || data.characterArt.length) {
      MW.renderWorks(document.getElementById("concept-grid"), data.conceptArt, "");
      if (!data.conceptArt.length) document.getElementById("concept-grid").hidden = true;
      var wall = document.getElementById("character-art");
      data.characterArt.forEach(function (art) {
        var fig = el("figure", { class: "art-item" });
        var link = el("a", { href: art.fullUrl, target: "_blank", rel: "noopener" });
        link.appendChild(el("img", { src: art.url, alt: art.caption || art.character.name + " concept art", loading: "lazy" }));
        fig.appendChild(link);
        var cap = el("figcaption", { class: "mono muted" });
        cap.appendChild(el("a", { href: MW.characterUrl(art.character.slug, storyCreator) }, art.character.name));
        if (art.caption) cap.appendChild(document.createTextNode(" · " + art.caption));
        fig.appendChild(cap);
        wall.appendChild(fig);
      });
      document.getElementById("concept-art").hidden = false;
      shown++;
    } else {
      tabs.querySelector("a[href='#concept-art']").remove();
    }
    tabs.hidden = shown < 2;
  }

  MW.api("/stories/" + encodeURIComponent(slug))
    .then(render)
    .catch(function (error) {
      hero.textContent = "";
      hero.appendChild(el("h1", { class: "glitch" }, "Signal lost"));
      hero.appendChild(el("p", { class: "lead" }, error.status === 404 ? "That story doesn't exist, or it was removed." : error.message));
    });
})();
