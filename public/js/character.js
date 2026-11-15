// js/character.js
// A character's profile (/characters/<slug>): portrait, role, tagline, profile text and concept art.

(function () {
  "use strict";

  var MW = window.MW;
  var box = document.getElementById("character");
  if (!box || !MW) return;
  var el = MW.el;
  var slug = decodeURIComponent(window.location.pathname.replace(/^\/(characters|hub\/ch)\//, "").replace(/\/$/, ""));
  var owner = null;

  function card(c) {
    var a = el("a", { class: "character-card", href: MW.characterUrl(c.slug, owner) });
    var pic = el("div", { class: "character-portrait" });
    if (c.portraitUrl) pic.appendChild(el("img", { src: c.portraitUrl, alt: "", loading: "lazy" }));
    else pic.appendChild(el("span", { "aria-hidden": "true" }, c.name.charAt(0)));
    a.appendChild(pic);
    a.appendChild(el("h3", {}, c.name));
    if (c.role) a.appendChild(el("p", { class: "mono character-role" }, c.role));
    return a;
  }

  MW.api("/stories/characters/" + encodeURIComponent(slug))
    .then(function (data) {
      var c = data.character;
      owner = c.creator;
      document.title = c.name + (MW.isHub ? " | Chapterhive" : " | God's Banditos");
      box.textContent = "";
      if (c.series) {
        var back = document.getElementById("back-link");
        back.href = MW.storyUrl(c.series.slug, c.creator) + "#characters";
        back.textContent = "← " + c.series.title;
      }
      var portrait = c.media.find(function (m) { return m.role === "portrait"; }) || c.media[0];
      var layout = el("div", { class: "character-layout" + (portrait ? "" : " no-portrait") });
      if (portrait) {
        var fig = el("figure", { class: "character-hero-portrait" });
        var link = el("a", { href: portrait.originalUrl, target: "_blank", rel: "noopener" });
        link.appendChild(el("img", { src: portrait.url, alt: "Portrait of " + c.name }));
        fig.appendChild(link);
        layout.appendChild(fig);
        if (MW.profile) {
          MW.profile(fig, { name: c.name, kicker: "SUBJECT SCAN", id: "CHAR " + String(c.id).padStart(3, "0"),
            rows: [["ROLE", c.role || "Unknown"], ["STORY", c.series ? c.series.title : "—"]] });
        }
      }
      var text = el("div");
      text.appendChild(el("p", { class: "node-label" }, "Character // profile"));
      text.appendChild(el("h1", { class: "glitch" }, c.name));
      if (c.role) text.appendChild(el("p", { class: "sticker" }, c.role));
      if (c.tagline) text.appendChild(el("p", { class: "logline logline-big" }, c.tagline));
      if (MW.isHub && c.creator && MW.byline) MW.me().then(function (u) { text.appendChild(MW.byline(c.creator, u)); });
      if (!c.visible) text.appendChild(el("p", { class: "draft-flag mono" }, c.published ? "SCHEDULED — only you can see this" : "DRAFT — only you can see this"));
      if (c.profile) {
        var prose = el("div", { class: "prose work-body" });
        MW.renderMarkup(prose, c.profile);
        text.appendChild(prose);
      }
      layout.appendChild(text);
      box.appendChild(layout);

      var concept = c.media.filter(function (m) { return m !== portrait; });
      if (concept.length) {
        var wall = document.getElementById("concept-wall");
        concept.forEach(function (m) {
          var f = el("figure", { class: "art-item" });
          var a = el("a", { href: m.originalUrl, target: "_blank", rel: "noopener" });
          a.appendChild(el("img", { src: m.thumbUrl, alt: m.caption || c.name + " concept art", loading: "lazy" }));
          f.appendChild(a);
          if (m.caption) f.appendChild(el("figcaption", { class: "mono muted" }, m.caption));
          wall.appendChild(f);
        });
        document.getElementById("concept-panel").hidden = false;
      }
      if (data.others.length) {
        var others = document.getElementById("others");
        data.others.forEach(function (o) { others.appendChild(card(o)); });
        document.getElementById("others-panel").hidden = false;
      }
    })
    .catch(function (error) {
      box.textContent = "";
      box.appendChild(el("h1", { class: "glitch" }, "Signal lost"));
      box.appendChild(el("p", { class: "lead" }, error.status === 404 ? "That character doesn't exist (yet)." : error.message));
    });
})();
