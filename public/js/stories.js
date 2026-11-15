// js/stories.js
// Stories page (/stories): one card per story, with its cover, logline and counts.

(function () {
  "use strict";

  var MW = window.MW;
  var grid = document.getElementById("stories-grid");
  if (!MW) return;
  var el = MW.el;

  // Shared by the Stories page and the search page.
  MW.storyCard = function (story) {
    var card = el("a", { class: "story-card", href: MW.storyUrl(story.slug, story.creator) });
    var cover = el("div", { class: "story-cover" });
    if (story.coverUrl) cover.appendChild(el("img", { src: story.coverUrl, alt: "", loading: "lazy" }));
    else cover.appendChild(el("span", { class: "story-cover-text", "aria-hidden": "true" }, story.title.charAt(0)));
    card.appendChild(cover);
    var text = el("div", { class: "story-text" });
    if (story.logline) text.appendChild(el("p", { class: "logline" }, story.logline));
    text.appendChild(el("h3", {}, story.title));
    var bits = [];
    if (story.chapters) bits.push(story.chapters + (story.chapters === 1 ? " chapter" : " chapters"));
    if (story.characters) bits.push(story.characters + (story.characters === 1 ? " character" : " characters"));
    if (bits.length) text.appendChild(el("p", { class: "mono muted" }, bits.join(" · ")));
    card.appendChild(text);
    return card;
  };

  if (!grid) return;
  MW.api("/stories")
    .then(function (data) {
      grid.textContent = "";
      if (!data.stories.length) {
        grid.appendChild(el("p", { class: "empty" }, "No stories published yet."));
        return;
      }
      data.stories.forEach(function (story) { grid.appendChild(MW.storyCard(story)); });
    })
    .catch(function (error) {
      grid.textContent = "";
      grid.appendChild(el("p", { class: "empty" }, error.message));
    });
})();
