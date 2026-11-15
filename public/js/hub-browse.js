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
    ["", "Everything", "✦"],
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

  var state = { shelf: "", category: "", genre: "", sort: "new", page: 1 };
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
  }

  function query() {
    var q = new URLSearchParams({ site: "hub", sort: state.sort, page: String(state.page) });
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
    if (!append) { results.textContent = ""; summary.textContent = "Loading…"; }
    more.disabled = true;
    MW.api("/posts?" + query().toString()).then(function (d) {
      if (!append) results.textContent = "";
      summary.textContent = describe(d.total || 0);
      if (!d.posts.length && !append) {
        results.appendChild(el("p", { class: "empty" }, "Nothing here yet. Try another genre, or be the first to post one!"));
      } else {
        var holder = el("div");
        MW.renderWorks(holder, d.posts);
        while (holder.firstChild) results.appendChild(holder.firstChild);
      }
      more.hidden = d.page >= d.pages;
      more.disabled = false;
    }).catch(function (e) { summary.textContent = e.message; });
  }

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
  load(false);
  if (hash) document.getElementById("browse").scrollIntoView();
})();
