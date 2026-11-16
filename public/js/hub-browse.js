// js/hub-browse.js  -  "Browse the hive" on the Chapterhive home page.
// Pick a shelf (Books, Comics, Film & video...), narrow it by type and genre, and everything that
// matches is listed underneath, newest first, with "Show more". No typing needed.
// The choice is kept in the address (#browse?shelf=books&genre=horror) so it can be shared or bookmarked.
(function () {
  "use strict";
  var MW = window.MW;
  var results = document.getElementById("browse-results");
  if (!MW || !results) return;
  var el = MW.el;

  var SHELVES = [
    ["", "For you", "✦"],
    ["trailers", "Trailers", "🎞️", null],
    ["tutorials", "Tutorials", "✏️", null],
    ["series", "Series", "📺", [["", "All series"], ["series", "Live action series"], ["anime", "Animation"]]],
    ["books", "Books", "📚", [["", "All books"], ["novel", "Novels"], ["storybook", "Storybooks"], ["educational", "Educational"]]],
    ["comics", "Comics & manga", "💥", null],
    ["art", "Art", "🎨", [["", "All art"], ["art", "Art & illustration"], ["meme", "Memes"]]],
    ["video", "Film & video", "🎬", [["", "All video"], ["anime", "Animation"], ["film", "Live action films"], ["series", "Series episodes"]]],
    ["music", "Music & poetry", "🎵", [["", "All"], ["song", "Songs & music"], ["poetry", "Poetry"]]],
    ["writing", "Writing", "✍️", [["", "All writing"], ["writing", "Stories"], ["novel", "Novels"], ["poetry", "Poetry"], ["thoughts", "Thoughts & feelings"]]],
    ["comedy", "Comedy", "😂", [["", "All comedy"], ["comedy", "Comedy"], ["meme", "Memes"]]]
  ];
  var GENRES = [["", "All genres"], ["fantasy", "Fantasy"], ["scifi", "Sci-fi"], ["horror", "Horror"], ["mystery", "Mystery"],
    ["romance", "Romance"], ["comedy", "Comedy"], ["drama", "Drama"], ["action", "Action"], ["adventure", "Adventure"],
    ["thriller", "Thriller"], ["slice-of-life", "Slice of life"], ["historical", "Historical"], ["children", "Children's"],
    ["young-adult", "Young adult"], ["education", "Education"], ["science", "Science"], ["self-help", "Self-help"],
    ["faith", "Faith"], ["poetry", "Poetry"], ["music", "Music"]];

  var state = { shelf: "", category: "", genre: "", sort: "new", page: 1, view: "feed" };
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
    ["shelf", "category", "genre", "sort"].forEach(function (k) { if (hp.get(k)) state[k] = hp.get(k); });
  }

  function chip(label, active, onClick, role) {
    var b = el("button", { type: "button", class: "chip" + (active ? " is-active" : "") });
    if (role === "tab") { b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(active)); }
    else b.setAttribute("aria-pressed", String(active));
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function shelfInfo() { return SHELVES.filter(function (s) { return s[0] === state.shelf; })[0] || SHELVES[0]; }

  function drawControls() {
    shelvesBox.textContent = "";
    SHELVES.forEach(function (s) {
      shelvesBox.appendChild(chip(s[2] + " " + s[1], s[0] === state.shelf, function () {
        state.shelf = s[0]; state.category = ""; state.page = 1; refresh();
      }, "tab"));
    });
    catsBox.textContent = "";
    var cats = shelfInfo()[3];
    catsBox.hidden = !cats;
    (cats || []).forEach(function (c) {
      catsBox.appendChild(chip(c[1], c[0] === state.category, function () { state.category = c[0]; state.page = 1; refresh(); }));
    });
    genresBox.textContent = "";
    GENRES.forEach(function (g) {
      genresBox.appendChild(chip(g[1], g[0] === state.genre, function () { state.genre = g[0]; state.page = 1; refresh(); }));
    });
    sortSel.value = state.sort;
    var active = (state.category ? 1 : 0) + (state.genre ? 1 : 0);
    var ftb = document.getElementById("feed-filters-toggle");
    if (ftb) ftb.textContent = "⚙ Filters" + (active ? " (" + active + ")" : "");
  }

  function query() {
    var q = new URLSearchParams({ site: "hub", sort: state.sort, page: String(state.page), feed: "1" });
    if (state.category) q.set("category", state.category);
    else if (state.shelf) q.set("shelf", state.shelf);
    if (state.genre) q.set("genre", state.genre);
    return q;
  }

  function describe(total) {
    var parts = [];
    var cats = shelfInfo()[3] || [];
    var cat = cats.filter(function (c) { return c[0] === state.category && c[0]; })[0];
    parts.push(cat ? cat[1] : shelfInfo()[1]);
    var g = GENRES.filter(function (x) { return x[0] === state.genre && x[0]; })[0];
    if (g) parts.push(g[1]);
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
      var filtered = state.shelf || state.category || state.genre;
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
    ["shelf", "category", "genre"].forEach(function (k) { if (state[k]) q.set(k, state[k]); });
    if (state.sort !== "new") q.set("sort", state.sort);
    history.replaceState(null, "", "#browse" + (q.toString() ? "?" + q.toString() : ""));
    load(false);
  }

  sortSel.addEventListener("change", function () { state.sort = sortSel.value; state.page = 1; refresh(); });
  more.addEventListener("click", function () { state.page += 1; load(true); });

  drawControls();
  if (state.genre || state.category) { fbox.hidden = false; ft.setAttribute("aria-expanded", "true"); }
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
