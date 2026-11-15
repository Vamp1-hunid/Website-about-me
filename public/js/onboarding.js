// js/onboarding.js  -  the full-screen welcome for brand-new accounts, a bit like setting up a new computer:
//   "Hi, Bob."  →  "Getting your account ready…"  →  "We're glad to have you here."
//   →  "Welcome to Chapterhive · brought to you by God's Banditos"
//   →  a quick, optional survey (what you love, which genres)  →  "Setting up your feed…"
//   →  a tribute to the creators  →  "You're all set".
// Everything can be skipped. The survey answers personalise the "For you" feed.
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;

  var CATEGORIES = [
    ["novel", "📖", "Novels"], ["storybook", "🧸", "Storybooks"], ["educational", "🎓", "Learning & education"], ["poetry", "🪶", "Poetry"],
    ["song", "🎵", "Songs & music"], ["story-art", "💥", "Comics & manga"], ["art", "🎨", "Art & illustration"], ["anime", "✨", "Animation"],
    ["film", "🎬", "Films"], ["series", "📺", "Series"], ["trailer", "🎞️", "Trailers"], ["writing", "✍️", "Short stories"],
    ["comedy", "😂", "Comedy"], ["meme", "🤣", "Memes"], ["thoughts", "💭", "Thoughts & feelings"]
  ];
  var GENRES = [
    ["fantasy", "🐉", "Fantasy"], ["scifi", "🚀", "Sci-fi"], ["horror", "👻", "Horror"], ["mystery", "🔎", "Mystery"],
    ["romance", "💞", "Romance"], ["comedy", "🎭", "Comedy"], ["drama", "🎬", "Drama"], ["action", "⚔️", "Action"],
    ["adventure", "🧭", "Adventure"], ["thriller", "⚡", "Thriller"], ["slice-of-life", "☕", "Slice of life"], ["historical", "🏛️", "Historical"],
    ["children", "🧒", "Children's"], ["young-adult", "🎒", "Young adult"], ["education", "📚", "Education"], ["science", "🔬", "Science"],
    ["self-help", "🌱", "Self-help"], ["faith", "🕊️", "Faith"], ["poetry", "🪶", "Poetry"], ["music", "🎧", "Music"]
  ];

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce ? Math.min(ms, 600) : ms); }); }

  MW.runOnboarding = function (user) {
    var name = (user.displayName || user.username || "").split(" ")[0];
    var stage = el("div", { class: "onboard", role: "dialog", "aria-modal": "true", "aria-label": "Welcome to Chapterhive" });
    stage.appendChild(el("div", { class: "onboard-comb", "aria-hidden": "true" }));
    var scene = el("div", { class: "onboard-scene", "aria-live": "polite" });
    stage.appendChild(scene);
    var skip = el("button", { type: "button", class: "onboard-skip" }, "Skip intro");
    stage.appendChild(skip);
    document.body.appendChild(stage);
    document.documentElement.classList.add("onboarding-open");
    requestAnimationFrame(function () { stage.classList.add("is-in"); });

    var skipped = false;
    var surveyShown = false;
    skip.addEventListener("click", function () { skipped = true; if (!surveyShown) survey(); });

    function show(nodes, extraClass) {
      scene.className = "onboard-scene" + (extraClass ? " " + extraClass : "");
      scene.textContent = "";
      nodes.forEach(function (n) { scene.appendChild(n); });
      void scene.offsetWidth;
      scene.classList.add("is-shown");
    }
    function line(text, cls) { return el("p", { class: "onboard-line " + (cls || "") }, text); }
    function loader() {
      var l = el("div", { class: "onboard-loader", "aria-hidden": "true" });
      for (var i = 0; i < 5; i++) l.appendChild(el("span"));
      return l;
    }

    async function intro() {
      show([line("Hi" + (name ? ", " + name : "") + ".", "big")]);
      await wait(2200); if (skipped) return;
      show([loader(), line("Getting your account ready…")]);
      await wait(2600); if (skipped) return;
      show([line("We're glad to have you here.", "big")]);
      await wait(2300); if (skipped) return;
      var brand = el("div", { class: "onboard-brand" });
      brand.appendChild(el("img", { src: "/images/chapterhive-mark.svg", alt: "", width: "72", height: "72" }));
      brand.appendChild(line("Welcome to Chapterhive", "big"));
      brand.appendChild(line("brought to you by God's Banditos", "sub"));
      show([brand]);
      await wait(2800); if (skipped) return;
      survey();
    }

    // A quick, optional survey: tap what you like (Pinterest style).
    var picks = { categories: [], genres: [] };
    function tiles(list, bucket) {
      var grid = el("div", { class: "onboard-tiles" });
      list.forEach(function (t) {
        var b = el("button", { type: "button", class: "onboard-tile", "aria-pressed": "false" });
        b.appendChild(el("span", { class: "onboard-tile-icon", "aria-hidden": "true" }, t[1]));
        b.appendChild(el("span", {}, t[2]));
        b.addEventListener("click", function () {
          var i = picks[bucket].indexOf(t[0]);
          if (i >= 0) picks[bucket].splice(i, 1); else picks[bucket].push(t[0]);
          var on = i < 0;
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-pressed", String(on));
        });
        grid.appendChild(b);
      });
      return grid;
    }
    function survey() {
      surveyShown = true;
      skip.textContent = "Skip survey";
      skip.onclick = function () { finish(true); };
      var next = el("button", { type: "button", class: "btn onboard-next" }, "Next");
      show([line("What do you love?", "big"), line("Pick as many as you like. We'll fill your feed with more of it.", "sub"),
        tiles(CATEGORIES, "categories"), next], "is-survey");
      next.addEventListener("click", function () {
        var done = el("button", { type: "button", class: "btn onboard-next" }, "Done");
        var back = el("button", { type: "button", class: "btn btn-ghost onboard-next" }, "Back");
        var row = el("div", { class: "onboard-actions" });
        row.append(back, done);
        show([line("Any favourite genres?", "big"), line("Optional. You can change all of this later.", "sub"), tiles(GENRES, "genres"), row], "is-survey");
        back.addEventListener("click", survey);
        done.addEventListener("click", function () { finish(false); });
      });
    }

    async function finish(skippedSurvey) {
      skip.hidden = true;
      show([loader(), line(skippedSurvey ? "Finishing up…" : "Setting up your feed…")]);
      try {
        if (!skippedSurvey && (picks.categories.length || picks.genres.length)) {
          await MW.api("/account/interests", { method: "PUT", json: picks });
        } else {
          await MW.api("/account/onboarded", { method: "POST" });
        }
      } catch (e) { /* the welcome still finishes */ }
      await wait(1800);
      await tribute();
    }

    async function tribute() {
      var box = el("div", { class: "onboard-tribute" });
      box.appendChild(line("Made possible by our creators", "big"));
      box.appendChild(line("Every novel, storybook, song, lesson, comic, film and drawing here was shared by a creator from our community, people just like you.", "sub"));
      var reel = el("div", { class: "onboard-reel" });
      box.appendChild(reel);
      try {
        var d = await MW.api("/hub/creators?page=1");
        (d.creators || []).slice(0, 12).forEach(function (c, i) {
          var chip = el("span", { class: "onboard-chip" });
          chip.style.animationDelay = (reduce ? 0 : 0.12 * i) + "s";
          var pic = el("span", { class: "onboard-chip-pic" });
          if (c.avatarUrl) pic.appendChild(el("img", { src: c.avatarUrl, alt: "" })); else pic.textContent = (c.name || "?").charAt(0);
          chip.append(pic, el("span", {}, c.name));
          reel.appendChild(chip);
        });
      } catch (e) { /* fine without names */ }
      box.appendChild(line("Chapterhive was founded by Mulenga Mwamba · a God's Banditos production", "founder"));
      show([box]);
      await wait(4200);
      var go = el("button", { type: "button", class: "btn onboard-next" }, "Start exploring");
      var done = el("div", { class: "onboard-brand" });
      done.appendChild(line("You're all set" + (name ? ", " + name : "") + ".", "big"));
      done.appendChild(line("Tap ⋯ on any post to see more or less like it.", "sub"));
      done.appendChild(go);
      show([done]);
      go.focus();
      go.addEventListener("click", close);
    }

    function close() {
      try { localStorage.setItem("mw-welcomed-" + user.id, "1"); } catch (e) { /* ignore */ }
      MW.api("/notifications").then(function (d) {
        var w = (d.notifications || []).filter(function (n) { return n.type === "welcome" && n.unread; })[0];
        if (w) return MW.api("/notifications/read", { method: "POST", json: { ids: [w.id] } });
      }).catch(function () {});
      stage.classList.remove("is-in");
      stage.classList.add("is-out");
      setTimeout(function () {
        stage.remove();
        document.documentElement.classList.remove("onboarding-open");
        if (window.location.pathname === "/hub" || window.location.pathname === "/hub/") window.location.reload();
      }, reduce ? 50 : 700);
    }

    intro();
  };
})();
