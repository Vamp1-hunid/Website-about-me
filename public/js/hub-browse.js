// js/hub-browse.js  -  "Browse the hive" on the Chapterhive home page.
// Pick a shelf (Books, Comics, Film & video...), narrow it by type and genre, and everything that
// matches is listed underneath, newest first, with "Show more". No typing needed.
// The choice is kept in the address (#browse?shelf=books,art&genre=horror,fantasy) so it can be shared or bookmarked.
// Several shelves, types and genres can be picked at once: within a row any of them matches.
(function () {
  "use strict";
  var MW = window.MW;
  var results = document.getElementById("browse-results");
  if (!MW || !results) return;
  var el = MW.el;

  var SHELVES = [
    ["", "For you", "✦"],
    ["books", "Books", "📚", [["", "All books"], ["novel", "Novels"], ["storybook", "Storybooks"], ["educational", "Educational"]]],
    ["comics", "Comics & manga", "💥", null],
    ["series", "Series", "📺", [["", "All series"], ["series", "Live action series"], ["anime", "Animation"]]],
    ["video", "Film & video", "🎬", [["", "All video"], ["anime", "Animation"], ["film", "Live action films"], ["series", "Series episodes"]]],
    ["music", "Music & poetry", "🎵", [["", "All"], ["song", "Songs & music"], ["poetry", "Poetry"]]],
    ["art", "Art", "🎨", [["", "All art"], ["art", "Art & illustration"], ["meme", "Memes"]]],
    ["writing", "Writing", "✍️", [["", "All writing"], ["writing", "Stories"], ["novel", "Novels"], ["poetry", "Poetry"], ["thoughts", "Thoughts & feelings"]]],
    ["comedy", "Comedy", "😂", [["", "All comedy"], ["comedy", "Comedy"], ["meme", "Memes"]]],
    ["tutorials", "Tutorials", "✏️", null],
    ["trailers", "Trailers", "🎞️", null]
  ];
  var GENRES = [["", "All genres"], ["fantasy", "Fantasy"], ["scifi", "Sci-fi"], ["horror", "Horror"], ["mystery", "Mystery"],
    ["romance", "Romance"], ["comedy", "Comedy"], ["drama", "Drama"], ["action", "Action"], ["adventure", "Adventure"],
    ["thriller", "Thriller"], ["slice-of-life", "Slice of life"], ["historical", "Historical"], ["children", "Children's"],
    ["young-adult", "Young adult"], ["education", "Education"], ["science", "Science"], ["self-help", "Self-help"],
    ["faith", "Faith"], ["poetry", "Poetry"], ["music", "Music"]];

  var state = { shelf: [], category: [], genre: [], sort: "new", page: 1, view: "feed" };
  try { state.view = localStorage.getItem("ch-home-view") === "grid" ? "grid" : "feed"; } catch (e) { /* ignore */ }
  var user = null;
  var loading = false;
  var lastPage = false;
  var shelvesBox = document.getElementById("browse-shelves");
  var catsBox = document.getElementById("browse-cats");
  var genresBox = document.getElementById("browse-genres");
  var summary = document.getElementById("browse-summary");
  var more = document.getElementById("browse-more");
  var sortSel = document.getElementById("browse-sort");

  // Read a saved choice from the address: #browse?shelf=books&genre=horror
  var hash = window.location.hash.split("?")[1];
  if (hash) {
    var hp = new URLSearchParams(hash);
    ["shelf", "category", "genre"].forEach(function (k) { if (hp.get(k)) state[k] = hp.get(k).split(",").filter(Boolean); });
    if (hp.get("sort")) state.sort = hp.get("sort");
  }

  function chip(label, active, onClick, role) {
    var b = el("button", { type: "button", class: "chip" + (active ? " is-active" : "") });
    if (role === "tab") { b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(active)); }
    else b.setAttribute("aria-pressed", String(active));
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function has(k, v) { return state[k].indexOf(v) !== -1; }
  function toggle(k, v) {
    if (has(k, v)) state[k] = state[k].filter(function (x) { return x !== v; });
    else state[k] = state[k].concat([v]);
  }
  function shelfOf(key) { return SHELVES.filter(function (s) { return s[0] === key; })[0]; }
  // The type choices for the picked shelves (without the "All …" option), with no repeats.
  function typeOptions() {
    var seen = {}, out = [];
    state.shelf.forEach(function (key) {
      var sh = shelfOf(key);
      ((sh && sh[3]) || []).forEach(function (c) { if (c[0] && !seen[c[0]]) { seen[c[0]] = true; out.push([c[0], c[1], key]); } });
    });
    return out;
  }

  function drawControls() {
    shelvesBox.textContent = "";
    SHELVES.forEach(function (s) {
      var on = s[0] ? has("shelf", s[0]) : !state.shelf.length;
      shelvesBox.appendChild(chip(s[2] + " " + s[1], on, function () {
        if (!s[0]) state.shelf = [];
        else toggle("shelf", s[0]);
        // Drop type choices that no longer belong to a picked shelf.
        var still = typeOptions().map(function (c) { return c[0]; });
        state.category = state.category.filter(function (c) { return still.indexOf(c) !== -1; });
        state.page = 1; refresh();
      }));
    });
    catsBox.textContent = "";
    var cats = typeOptions();
    catsBox.hidden = !cats.length;
    if (cats.length) {
      catsBox.appendChild(chip("All types", !state.category.length, function () { state.category = []; state.page = 1; refresh(); }));
      cats.forEach(function (c) {
        catsBox.appendChild(chip(c[1], has("category", c[0]), function () { toggle("category", c[0]); state.page = 1; refresh(); }));
      });
    }
    genresBox.textContent = "";
    GENRES.forEach(function (g) {
      var on = g[0] ? has("genre", g[0]) : !state.genre.length;
      genresBox.appendChild(chip(g[1], on, function () {
        if (!g[0]) state.genre = []; else toggle("genre", g[0]);
        state.page = 1; refresh();
      }));
    });
    sortSel.value = state.sort;
    var active = state.category.length + state.genre.length;
    var ftb = document.getElementById("feed-filters-toggle");
    if (ftb) ftb.textContent = "⚙ Filters" + (active ? " (" + active + ")" : "");
  }

  function query() {
    var q = new URLSearchParams({ site: "hub", sort: state.sort, page: String(state.page), feed: "1" });
    // A shelf where specific types were picked is narrowed to those types; other shelves count whole.
    var picked = state.category;
    var wholeShelves = state.shelf.filter(function (key) {
      var sh = shelfOf(key);
      return !((sh && sh[3]) || []).some(function (c) { return c[0] && picked.indexOf(c[0]) !== -1; });
    });
    if (wholeShelves.length) q.set("shelf", wholeShelves.join(","));
    if (picked.length) q.set("category", picked.join(","));
    if (state.genre.length) q.set("genre", state.genre.join(","));
    return q;
  }

  function describe(total) {
    var parts = [];
    var types = typeOptions().filter(function (c) { return has("category", c[0]); }).map(function (c) { return c[1]; });
    parts.push(types.length ? types.join(", ") : state.shelf.length ? state.shelf.map(function (k) { return shelfOf(k)[1]; }).join(", ") : "For you");
    var gs = GENRES.filter(function (x) { return x[0] && has("genre", x[0]); }).map(function (x) { return x[1]; });
    if (gs.length) parts.push(gs.join(", "));
    return total + (total === 1 ? " work" : " works") + " · " + parts.join(" · ");
  }

  function load(append) {
    if (loading) return;
    loading = true;
    if (!append) { results.textContent = ""; summary.textContent = "Loading…"; lastPage = false; }
    results.className = state.view === "grid" ? "works-grid" : "feed-list";
    more.disabled = true;
    MW.api("/posts?" + query().toString()).then(function (d) {
      if (!append) results.textContent = "";
      var filtered = state.shelf.length || state.category.length || state.genre.length;
      summary.textContent = filtered ? describe(d.total || 0) : "";
      // Daily Bible verse at the top of the feed, for members who switched it on in Settings.
      var acc = MW.account && MW.account.account;
      if (!append && state.view === "feed" && acc && acc.dailyVerse && MW.feature("daily_verse")) {
        var vc = el("article", { class: "verse-card" });
        results.appendChild(vc);
        MW.api("/calendar/verse").then(function (v) {
          vc.appendChild(el("p", { class: "node-label" }, "📖 Verse of the day"));
          if (v.verse.text) vc.appendChild(el("p", { class: "verse-text" }, "“" + v.verse.text + "”"));
          else if (v.verse.theme) vc.appendChild(el("p", { class: "verse-text" }, v.verse.theme));
          var ref = el("p", { class: "verse-ref" });
          ref.appendChild(el("strong", {}, v.verse.reference));
          ref.appendChild(document.createTextNode(" · "));
          ref.appendChild(el("a", { href: v.verse.link, target: "_blank", rel: "noopener" }, "Read it in the " + v.verse.translation + " ↗"));
          vc.appendChild(ref);
          // Tap the verse for something to carry into the day: a short devotion, encouragement and a prayer.
          if (v.verse.devotion || v.verse.encouragement || v.verse.prayer) {
            var more = el("div", { class: "verse-more", id: "verse-more" });
            more.hidden = true;
            [["devotion", "🌅 Today's devotion"], ["encouragement", "💛 A word for you"], ["prayer", "🙏 A prayer"]].forEach(function (part) {
              if (!v.verse[part[0]]) return;
              var sec = el("section", { class: "verse-part verse-" + part[0] });
              sec.appendChild(el("h3", {}, part[1]));
              sec.appendChild(el("p", {}, v.verse[part[0]]));
              more.appendChild(sec);
            });
            var hint = el("button", { type: "button", class: "verse-toggle", "aria-expanded": "false", "aria-controls": "verse-more" }, "Tap for today's devotion and prayer ▾");
            function flip() {
              more.hidden = !more.hidden;
              hint.setAttribute("aria-expanded", String(!more.hidden));
              hint.textContent = more.hidden ? "Tap for today's devotion and prayer ▾" : "Close ▴";
              vc.classList.toggle("is-open", !more.hidden);
            }
            hint.addEventListener("click", function (e) { e.stopPropagation(); flip(); });
            vc.addEventListener("click", function (e) { if (!e.target.closest("a, button, .verse-more")) flip(); });
            vc.classList.add("is-tappable");
            vc.appendChild(hint);
            vc.appendChild(more);
          }
        }).catch(function () { vc.remove(); });
      }
      if (!d.posts.length && !append) {
        results.appendChild(el("p", { class: "empty" }, "Nothing here yet. Try another filter, or be the first to post one!"));
      } else if (state.view === "grid") {
        d.posts.forEach(function (p) { results.appendChild(MW.workCard(p)); });
      } else {
        d.posts.forEach(function (p) { results.appendChild(MW.feedCard(p, user)); });
      }
      lastPage = d.page >= d.pages;
      more.hidden = lastPage;
      more.disabled = false;
      if (lastPage && d.posts.length && append) results.appendChild(el("p", { class: "feed-end muted" }, "You're all caught up ✦"));
    }).catch(function (e) { summary.textContent = e.message; })
      .then(function () { loading = false; });
  }

  // Endless scroll: the next page loads as you near the bottom.
  var sentinel = document.getElementById("feed-sentinel");
  if (sentinel && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !loading && !lastPage && results.children.length) { state.page += 1; load(true); }
    }, { rootMargin: "800px 0px" }).observe(sentinel);
  }

  // Feed / grid switch (remembered on this device)
  var vf = document.getElementById("view-feed"), vg = document.getElementById("view-grid");
  function paintView() {
    vf.classList.toggle("is-active", state.view === "feed"); vf.setAttribute("aria-pressed", String(state.view === "feed"));
    vg.classList.toggle("is-active", state.view === "grid"); vg.setAttribute("aria-pressed", String(state.view === "grid"));
  }
  [[vf, "feed"], [vg, "grid"]].forEach(function (pair) {
    pair[0].addEventListener("click", function () {
      state.view = pair[1]; state.page = 1;
      try { localStorage.setItem("ch-home-view", state.view); } catch (e) { /* ignore */ }
      paintView(); load(false);
    });
  });
  paintView();

  // Filters drawer (type and genre)
  var ft = document.getElementById("feed-filters-toggle"), fbox = document.getElementById("feed-filters");
  ft.addEventListener("click", function () {
    fbox.hidden = !fbox.hidden;
    ft.setAttribute("aria-expanded", String(!fbox.hidden));
  });

  function refresh() {
    drawControls();
    var q = new URLSearchParams();
    ["shelf", "category", "genre"].forEach(function (k) { if (state[k].length) q.set(k, state[k].join(",")); });
    if (state.sort !== "new") q.set("sort", state.sort);
    history.replaceState(null, "", "#browse" + (q.toString() ? "?" + q.toString() : ""));
    load(false);
  }

  sortSel.addEventListener("change", function () { state.sort = sortSel.value; state.page = 1; refresh(); });
  more.addEventListener("click", function () { state.page += 1; load(true); });

  drawControls();
  // The filters start open so people can pick a genre straight away; they can fold them away after.
  fbox.hidden = false; ft.setAttribute("aria-expanded", "true");
  MW.me().then(function (u) {
    user = u;
    if (user) { load(false); return; }
    // Visitors don't get a feed: just the newest releases as previews, and an invitation to join.
    document.querySelector(".feed-head").hidden = true;
    var title = el("h2", { class: "guest-releases-title" }, "New releases");
    results.parentNode.insertBefore(title, results);
    results.className = "works-grid";
    results.textContent = "";
    more.hidden = true;
    lastPage = true;
    MW.api("/posts?site=hub&page=1").then(function (d) {
      d.posts.slice(0, 12).forEach(function (p) { results.appendChild(MW.workCard(p)); });
      if (!d.posts.length) results.appendChild(el("p", { class: "empty" }, "The first releases are on their way."));
    }).catch(function () {});
    results.after(MW.guestGate("Create a free account to get your own feed: endless scrolling through the books, series, trailers, music and art you love, tuned to your taste."));
  });
})();
