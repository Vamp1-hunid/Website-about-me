// js/search.js
// Search results (/search?q=...): works, stories, characters and products in one page.

(function () {
  "use strict";

  var MW = window.MW;
  var results = document.getElementById("search-results");
  if (!results || !MW) return;
  var el = MW.el;
  var q = (new URLSearchParams(window.location.search).get("q") || "").trim();
  var summary = document.getElementById("search-summary");
  document.getElementById("search-q").value = q;

  function section(title, label) {
    var panel = el("section", { class: "panel" });
    panel.appendChild(el("p", { class: "node-label" }, label));
    panel.appendChild(el("h2", {}, title));
    results.appendChild(panel);
    return panel;
  }

  function simpleCard(href, imageUrl, kicker, title, text) {
    var a = el("a", { class: "result-card", href: href });
    var pic = el("div", { class: "result-pic" });
    if (imageUrl) pic.appendChild(el("img", { src: imageUrl, alt: "", loading: "lazy" }));
    else pic.appendChild(el("span", { "aria-hidden": "true" }, title.charAt(0)));
    a.appendChild(pic);
    var t = el("div");
    if (kicker) t.appendChild(el("p", { class: "mono muted" }, kicker));
    t.appendChild(el("h3", {}, title));
    if (text) t.appendChild(el("p", { class: "muted" }, text));
    a.appendChild(t);
    return a;
  }

  if (q.length < 2) {
    summary.textContent = "Type at least 2 characters.";
    document.getElementById("search-q").focus();
    return;
  }
  document.title = "“" + q + "” | Search | " + (MW.isHub ? "Afterframe" : "God's Banditos");
  summary.textContent = "Searching…";

  MW.api("/search?q=" + encodeURIComponent(q) + (MW.isHub ? "&site=hub" : ""))
    .then(function (data) {
      var total = data.works.length + data.stories.length + data.characters.length + data.products.length +
        (data.creators || []).length + (data.news || []).length;
      summary.textContent = total
        ? total + (total === 1 ? " result" : " results") + " for “" + q + "”"
        : "Nothing found for “" + q + "”. Try a shorter or different word.";

      if (data.creators && data.creators.length) {
        var cr = section("Creators", "Results // creators");
        var crg = el("div", { class: "result-grid" });
        data.creators.forEach(function (c) {
          crg.appendChild(simpleCard("/hub/c/" + encodeURIComponent(c.handle), c.avatarUrl, "@" + c.handle, c.name, c.tagline));
        });
        cr.appendChild(crg);
      }
      if (data.stories.length) {
        var s = section("Stories", "Results // stories");
        var sg = el("div", { class: "result-grid" });
        data.stories.forEach(function (st) {
          sg.appendChild(simpleCard(MW.storyUrl(st.slug, st.creator), st.coverUrl, "Story", st.title, st.logline));
        });
        s.appendChild(sg);
      }
      if (data.characters.length) {
        var c = section("Characters", "Results // characters");
        var cg = el("div", { class: "result-grid" });
        data.characters.forEach(function (ch) {
          cg.appendChild(simpleCard(MW.characterUrl(ch.slug, ch.creator), ch.portraitUrl, ch.role || "Character", ch.name, ch.tagline));
        });
        c.appendChild(cg);
      }
      if (data.works.length) {
        var w = section("Works", "Results // works");
        var wg = el("div", { class: "works-grid" });
        MW.renderWorks(wg, data.works);
        w.appendChild(wg);
      }
      if (data.news && data.news.length) {
        var nw = section("Anime updates", "Results // updates");
        var nwg = el("div", { class: "result-grid" });
        data.news.forEach(function (n) {
          nwg.appendChild(simpleCard(MW.workUrl(n), n.imageUrl, "Update · " + MW.formatDate(n.createdAt), n.title, n.logline || n.summary));
        });
        nw.appendChild(nwg);
      }
      if (data.products.length) {
        var p = section("More products", "Results // products");
        var pg = el("div", { class: "result-grid" });
        data.products.forEach(function (pr) {
          pg.appendChild(simpleCard("/products#product-" + encodeURIComponent(pr.slug), pr.imageUrl, pr.status || "Product", pr.name, pr.tagline));
        });
        p.appendChild(pg);
      }
    })
    .catch(function (error) {
      summary.textContent = error.message;
    });
})();
