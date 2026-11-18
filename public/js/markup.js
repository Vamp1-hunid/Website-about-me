// js/markup.js
// Turns the simple formatting used in works' text into page elements.
// Used by the work page and by the admin page's live preview, so both look the same.
//
//   # Heading   ## Smaller heading   ### Smallest heading
//   **bold**    *italic* or _italic_    [link text](https://example.com)
//   ==highlight==   ~~crossed out~~   -> centred line <-
//   > a quote   - a bullet list    1. a numbered list    --- a scene break
//   ![caption](picture address)  on its own line shows a picture (only pictures uploaded to this site)
//   A blank line starts a new paragraph; a single line break is kept as it is.
//
// Safety: everything is built with createElement + textContent (never innerHTML),
// and links must start with http:// or https://, so the text can never run as code.

(function () {
  "use strict";

  var MW = (window.MW = window.MW || {});

  var INLINE = new RegExp(
    [
      "\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)", // 1,2: [text](https://...)
      "\\*\\*([^\\n]+?)\\*\\*",                          // 3: **bold**
      "\\*([^*\\s](?:[^*\\n]*?[^*\\s])?)\\*",           // 4: *italic*
      "(?<![\\w])_([^_\\s](?:[^_\\n]*?[^_\\s])?)_(?![\\w])", // 5: _italic_ (not inside snake_case words)
      "==([^=\\n]+?)==",                                 // 6: ==highlight==
      "~~([^~\\n]+?)~~"                                  // 7: ~~strikethrough~~
    ].join("|")
  );

  // Adds the inline pieces of one line (bold, italic, links) to parent.
  function addInline(parent, text) {
    while (text) {
      var match = INLINE.exec(text);
      if (!match) {
        parent.appendChild(document.createTextNode(text));
        return;
      }
      if (match.index > 0) parent.appendChild(document.createTextNode(text.slice(0, match.index)));
      var node;
      if (match[1] !== undefined) {
        node = document.createElement("a");
        node.href = match[2];
        node.target = "_blank";
        node.rel = "noopener noreferrer nofollow";
        addInline(node, match[1]);
      } else if (match[3] !== undefined) {
        node = document.createElement("strong");
        addInline(node, match[3]);
      } else if (match[6] !== undefined) {
        node = document.createElement("mark");
        addInline(node, match[6]);
      } else if (match[7] !== undefined) {
        node = document.createElement("s");
        addInline(node, match[7]);
      } else {
        node = document.createElement("em");
        addInline(node, match[4] !== undefined ? match[4] : match[5]);
      }
      parent.appendChild(node);
      text = text.slice(match.index + match[0].length);
    }
  }

  // Lines joined by single line breaks keep those breaks.
  function addLines(parent, lines) {
    lines.forEach(function (line, i) {
      if (i > 0) parent.appendChild(document.createElement("br"));
      addInline(parent, line);
    });
  }

  var BLOCK = {
    heading: /^(#{1,3})\s+(.*)$/,
    rule: /^\s*(-{3,}|\*{3,}|_{3,})\s*$/,
    quote: /^>\s?(.*)$/,
    bullet: /^\s*[-*•]\s+(.*)$/,
    number: /^\s*\d{1,4}[.)]\s+(.*)$/,
    center: /^\s*->\s?(.*?)\s?<-\s*$/,
    image: /^\s*!\[([^\]\n]*)\]\(([^)\s]+)\)\s*$/
  };

  // Pictures in the text may only come from this site's own uploads.
  function safeImageUrl(url) {
    return /^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\//.test(url) || /^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp|gif)$/.test(url);
  }

  // Renders text into container (which is emptied first).
  MW.renderMarkup = function (container, text) {
    container.textContent = "";
    var lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var m;

      if (!line.trim()) { i++; continue; }

      if ((m = line.match(BLOCK.heading))) {
        var h = document.createElement("h" + (m[1].length + 1)); // # -> h2, ## -> h3, ### -> h4
        addInline(h, m[2]);
        container.appendChild(h);
        i++;
        continue;
      }

      if ((m = line.match(BLOCK.image)) && safeImageUrl(m[2])) {
        var figure = document.createElement("figure");
        figure.className = "prose-figure";
        var img = document.createElement("img");
        img.src = /res\.cloudinary\.com/.test(m[2]) && !/\.gif$/i.test(m[2]) ? m[2].replace("/upload/", "/upload/q_auto,f_auto/") : m[2];
        img.alt = m[1];
        img.loading = "lazy";
        figure.appendChild(img);
        if (m[1]) {
          var caption = document.createElement("figcaption");
          caption.textContent = m[1];
          figure.appendChild(caption);
        }
        container.appendChild(figure);
        i++;
        continue;
      }

      if ((m = line.match(BLOCK.center))) {
        var centred = document.createElement("p");
        centred.className = "centered";
        addInline(centred, m[1]);
        container.appendChild(centred);
        i++;
        continue;
      }

      if (BLOCK.rule.test(line)) {
        container.appendChild(document.createElement("hr"));
        i++;
        continue;
      }

      if (BLOCK.quote.test(line)) {
        var quoteLines = [];
        while (i < lines.length && (m = lines[i].match(BLOCK.quote))) { quoteLines.push(m[1]); i++; }
        var quote = document.createElement("blockquote");
        var qp = document.createElement("p");
        addLines(qp, quoteLines);
        quote.appendChild(qp);
        container.appendChild(quote);
        continue;
      }

      if (BLOCK.bullet.test(line) || BLOCK.number.test(line)) {
        var numbered = !BLOCK.bullet.test(line);
        var pattern = numbered ? BLOCK.number : BLOCK.bullet;
        var list = document.createElement(numbered ? "ol" : "ul");
        while (i < lines.length && (m = lines[i].match(pattern))) {
          var li = document.createElement("li");
          addInline(li, m[1]);
          list.appendChild(li);
          i++;
        }
        container.appendChild(list);
        continue;
      }

      // A paragraph: runs until a blank line or the start of another kind of block.
      var paraLines = [];
      while (i < lines.length && lines[i].trim() &&
             !BLOCK.heading.test(lines[i]) && !BLOCK.rule.test(lines[i]) && !BLOCK.quote.test(lines[i]) &&
             !BLOCK.center.test(lines[i]) && !(BLOCK.image.test(lines[i]) && safeImageUrl(lines[i].match(BLOCK.image)[2])) &&
             !(paraLines.length && (BLOCK.bullet.test(lines[i]) || BLOCK.number.test(lines[i])))) {
        paraLines.push(lines[i]);
        i++;
      }
      var p = document.createElement("p");
      addLines(p, paraLines);
      container.appendChild(p);
    }
  };

  // Words and reading time, e.g. "2,400 words · 10 min read".
  MW.readingStats = function (text) {
    var words = String(text || "").split(/\s+/).filter(Boolean).length;
    if (!words) return "";
    var minutes = Math.max(1, Math.round(words / 230));
    return words.toLocaleString("en-GB") + " words · " + minutes + " min read";
  };

  /* ---------- Documents to download (PDF, Word ...) ---------- */

  MW.renderDocuments = function (media) {
    var el = MW.el;
    var docs = media.filter(function (m) { return m.kind === "document"; });
    if (!docs.length) return null;
    var box = el("section", { class: "attachments", "aria-label": "Downloads" });
    box.appendChild(el("p", { class: "node-label" }, "Downloads // attached files"));
    var ul = el("ul");
    docs.forEach(function (doc) {
      var name = doc.caption || decodeURIComponent((doc.url.split("/").pop() || "file").replace(/^[a-f0-9]{24}/, "document"));
      var ext = (doc.url.match(/\.([a-z0-9]+)$/i) || [, "file"])[1].toUpperCase();
      var li = el("li");
      var a = el("a", { class: "attachment", href: doc.url, target: "_blank", rel: "noopener", download: "" });
      a.appendChild(el("span", { class: "attachment-ext mono" }, ext));
      a.appendChild(el("span", {}, name));
      li.appendChild(a);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  };

  /* ---------- Media: pictures (as a reader), video and audio ---------- */

  // A link that saves the file instead of opening it (Cloudinary files get its "attachment" flag).
  MW.downloadUrl = function (url) {
    if (/^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\//.test(url || "")) {
      return url.replace("/upload/", "/upload/fl_attachment/");
    }
    return url;
  };

  MW.isCloudinary = function (url) { return /^https:\/\/res\.cloudinary\.com\//.test(url || ""); };

  // ⛶ Fullscreen for a video (also works on iPhones, which only allow the video itself to go fullscreen).
  MW.fullscreenButton = function (video) {
    var b = MW.el("button", { type: "button", class: "btn btn-small btn-ghost media-fullscreen", "aria-label": "Watch fullscreen" }, "⛶ Fullscreen");
    b.addEventListener("click", function () {
      var box = video.closest("figure") || video;
      try {
        if (document.fullscreenElement) return document.exitFullscreen();
        if (box.requestFullscreen) {
          box.requestFullscreen().then(function () {
            // Phones: turn sideways for a widescreen picture (ignored where not allowed).
            if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(function () {});
          }).catch(function () { if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); });
        } else if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        }
        if (video.paused) video.play().catch(function () {});
      } catch (e) { /* the player's own fullscreen still works */ }
    });
    return b;
  };

  // Video download with a quality choice. Cloudinary makes the smaller versions on request
  // (the first download of a size can take a moment while it's prepared).
  MW.VIDEO_QUALITIES = [["original", "Original quality"], ["1080", "1080p (Full HD)"], ["720", "720p (HD)"], ["480", "480p (saves data)"], ["360", "360p (smallest)"]];
  MW.videoQualityUrl = function (url, quality) {
    if (!MW.isCloudinary(url) || quality === "original") return MW.downloadUrl(url);
    return url.replace("/upload/", "/upload/fl_attachment,c_limit,h_" + quality + ",q_auto,vc_auto/").replace(/\.(mov|webm|mkv|avi|m4v)(\?|$)/i, ".mp4$2");
  };
  MW.videoDownload = function (url) {
    var el = MW.el;
    var wrap = el("div", { class: "media-download-quality" });
    var id = "dlq-" + Math.random().toString(36).slice(2, 8);
    wrap.appendChild(el("label", { class: "sr-only", for: id }, "Download quality"));
    var select = el("select", { id: id, class: "media-quality" });
    MW.VIDEO_QUALITIES.forEach(function (q) { select.appendChild(el("option", { value: q[0] }, q[1])); });
    var link = el("a", { class: "btn btn-small btn-ghost media-download", download: "", rel: "noopener" }, "⬇ Download video");
    function update() { link.href = MW.videoQualityUrl(url, select.value); }
    select.addEventListener("change", update);
    update();
    wrap.append(select, link);
    return wrap;
  };

  // Builds the media section of a work. Several pictures read top to bottom, like a manga chapter.
  // options.canDownload: show a Download button under each video, audio and picture (Dashboard →
  // Settings → Downloads decides who). Without it, the player's own download menu is hidden too.
  MW.renderMedia = function (media, title, options) {
    var el = MW.el;
    var canDownload = Boolean(options && options.canDownload);
    var figures = [];
    var box = el("div", { class: "media-reader" });
    media = media.filter(function (m) { return m.kind !== "document" && m.role !== "cover"; });
    var pages = media.filter(function (m) { return m.kind === "image"; }).length;
    var pageNo = 0;

    media.forEach(function (item) {
      var figure = el("figure", { class: "media-item media-" + item.kind });
      if (item.kind === "image") {
        pageNo++;
        var label = pages > 1 ? title + ", page " + pageNo + " of " + pages : title;
        var link = el("a", { href: item.originalUrl || item.url, target: "_blank", rel: "noopener", title: "Open full size" });
        link.appendChild(el("img", { src: item.url, alt: item.caption || label, loading: pageNo > 2 ? "lazy" : "eager", decoding: "async" }));
        figure.appendChild(link);
      } else if (item.kind === "video") {
        var video = el("video", { controls: "", preload: "metadata", playsinline: "" });
        if (!canDownload) {
          video.setAttribute("controlslist", "nodownload");
          video.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        }
        if (item.thumbUrl) video.setAttribute("poster", item.thumbUrl);
        video.src = item.url;
        figure.appendChild(video);
      } else {
        var audio = el("audio", { controls: "", preload: "metadata" });
        if (!canDownload) audio.setAttribute("controlslist", "nodownload");
        audio.src = item.url;
        figure.appendChild(audio);
      }
      var tools = null;
      if (item.kind === "video") {
        tools = el("div", { class: "media-tools" });
        tools.appendChild(MW.fullscreenButton(figure.querySelector("video")));
      }
      if (canDownload) {
        tools = tools || el("div", { class: "media-tools" });
        if (item.kind === "video" && MW.isCloudinary(item.url)) tools.appendChild(MW.videoDownload(item.originalUrl || item.url));
        else {
          var kindName = item.kind === "video" ? "video" : item.kind === "audio" ? "audio" : "picture";
          tools.appendChild(el("a", { class: "btn btn-small btn-ghost media-download", href: MW.downloadUrl(item.originalUrl || item.url), download: "",
            rel: "noopener", "aria-label": "Download this " + kindName }, "⬇ Download " + kindName));
        }
      }
      if (tools) figure.appendChild(tools);
      // ("Page 2" labels only in the scrolling layout; the swipe layout has its own "2 / 5" counter.)
      if (item.caption || (item.kind === "image" && pages > 1 && !(options && options.layout === "swipe"))) {
        var cap = item.caption || "Page " + pageNo;
        figure.appendChild(el("figcaption", { class: "mono muted" }, cap));
      }
      figures.push(figure);
    });
    if (options && options.layout === "swipe" && figures.length > 1) {
      box.classList.add("is-swipe");
      box.appendChild(MW.carousel(figures, title));
    } else {
      figures.forEach(function (f) { box.appendChild(f); });
    }
    return box;
  };

  // A swipeable row of pictures and clips: swipe (or use the arrows / dots / keyboard) to move
  // left and right, with a "2 / 5" counter. A clip pauses when you swipe away from it.
  MW.carousel = function (figures, title) {
    var el = MW.el;
    var n = figures.length;
    var wrap = el("div", { class: "media-carousel", role: "region", "aria-roledescription": "carousel", "aria-label": (title || "Post") + ", " + n + " pictures and clips" });
    var track = el("div", { class: "carousel-track", tabindex: "0" });
    figures.forEach(function (f, i) {
      f.classList.add("carousel-slide");
      f.setAttribute("role", "group");
      f.setAttribute("aria-roledescription", "slide");
      f.setAttribute("aria-label", (i + 1) + " of " + n);
      track.appendChild(f);
    });
    var prev = el("button", { type: "button", class: "carousel-arrow carousel-prev", "aria-label": "Previous" }, "‹");
    var next = el("button", { type: "button", class: "carousel-arrow carousel-next", "aria-label": "Next" }, "›");
    var count = el("span", { class: "carousel-count mono", "aria-live": "polite" }, "1 / " + n);
    var dots = el("div", { class: "carousel-dots" });
    var dotButtons = figures.map(function (f, i) {
      var d = el("button", { type: "button", class: "carousel-dot", "aria-label": "Go to " + (i + 1) });
      d.addEventListener("click", function () { go(i); });
      dots.appendChild(d);
      return d;
    });
    var current = 0;
    function go(i) {
      i = Math.max(0, Math.min(n - 1, i));
      track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
    }
    function update() {
      var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i === current && count.textContent !== "") { /* still refresh below */ }
      current = Math.max(0, Math.min(n - 1, i));
      count.textContent = (current + 1) + " / " + n;
      dotButtons.forEach(function (d, k) { d.classList.toggle("is-active", k === current); d.setAttribute("aria-current", k === current ? "true" : "false"); });
      prev.disabled = current === 0;
      next.disabled = current === n - 1;
      figures.forEach(function (f, k) {
        if (k === current) return;
        f.querySelectorAll("video, audio").forEach(function (m) { if (!m.paused) m.pause(); });
      });
    }
    var raf = null;
    track.addEventListener("scroll", function () { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    prev.addEventListener("click", function () { go(current - 1); });
    next.addEventListener("click", function () { go(current + 1); });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(current + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(current - 1); }
    });
    wrap.append(track, prev, next);
    var bar = el("div", { class: "carousel-bar" });
    bar.append(dots, count);
    wrap.appendChild(bar);
    setTimeout(update, 0);
    return wrap;
  };
})();
