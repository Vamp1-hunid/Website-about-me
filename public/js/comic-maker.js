// js/comic-maker.js  -  a simple web comic page builder on a canvas.
// Layouts of panels, pictures dropped into panels (cropped to fill), speech/thought bubbles, captions and
// sound effects that can be dragged and edited, then the page is downloaded as a PNG.
(function () {
  "use strict";
  var canvas = document.getElementById("cm-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var $ = function (id) { return document.getElementById(id); };
  var SIZES = { page: [1200, 1700], strip: [1800, 700], square: [1400, 1400] };
  var LAYOUTS = {
    "1": [[0, 0, 1, 1]],
    "2h": [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
    "2v": [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
    "3": [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]],
    "3a": [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    "4": [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    "6": [[0, 0, 0.5, 1 / 3], [0.5, 0, 0.5, 1 / 3], [0, 1 / 3, 0.5, 1 / 3], [0.5, 1 / 3, 0.5, 1 / 3], [0, 2 / 3, 0.5, 1 / 3], [0.5, 2 / 3, 0.5, 1 / 3]]
  };
  var state = { images: {}, items: [], selected: null };
  var panels = [];
  var pendingPanel = null;
  var drag = null;

  function layoutPanels() {
    var g = Number($("cm-gutter").value), W = canvas.width, H = canvas.height;
    var key = $("cm-layout").value;
    // Strips read left to right; on a portrait page the 3-panel strip becomes 3 rows.
    var spec = LAYOUTS[key];
    if (key === "3" && $("cm-size").value !== "strip") spec = [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]];
    var iw = W - g, ih = H - g;
    panels = spec.map(function (p) {
      return { x: g + p[0] * iw, y: g + p[1] * ih, w: p[2] * iw - g, h: p[3] * ih - g };
    });
  }

  function wrap(text, maxWidth) {
    var words = text.split(/\s+/), lines = [], line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawItem(it) {
    var ink = $("cm-ink").value;
    ctx.save();
    var size = it.type === "sfx" ? 72 : 30;
    ctx.font = (it.type === "sfx" ? "900 " : it.type === "caption" ? "italic 600 " : "600 ") + size + "px 'Comic Sans MS', 'Bricolage Grotesque', sans-serif";
    var maxW = it.type === "sfx" ? 900 : 360;
    var lines = wrap(it.text, maxW);
    var lh = size * 1.2;
    var tw = Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; })) || 40;
    var th = lines.length * lh;
    var padX = it.type === "sfx" ? 0 : 34, padY = it.type === "sfx" ? 0 : 26;
    it.w = tw + padX * 2; it.h = th + padY * 2;
    var x = it.x - it.w / 2, y = it.y - it.h / 2;
    ctx.lineWidth = 4;
    ctx.strokeStyle = ink;
    ctx.fillStyle = "#ffffff";
    if (it.type === "bubble" || it.type === "thought") {
      ctx.beginPath();
      ctx.ellipse(it.x, it.y, it.w / 2 + 6, it.h / 2 + 4, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (it.type === "bubble") {
        ctx.beginPath();
        ctx.moveTo(it.x - it.w * 0.12, it.y + it.h / 2 - 4);
        ctx.lineTo(it.x - it.w * 0.28, it.y + it.h / 2 + 46);
        ctx.lineTo(it.x + it.w * 0.02, it.y + it.h / 2 - 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillRect(it.x - it.w * 0.11, it.y + it.h / 2 - 9, it.w * 0.12, 8);
      } else {
        [[0.28, 22, 16], [0.36, 50, 9]].forEach(function (c) {
          ctx.beginPath(); ctx.arc(it.x - it.w * c[0], it.y + it.h / 2 + c[1], c[2], 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
      }
    } else if (it.type === "caption") {
      ctx.fillStyle = "#fff6c8";
      ctx.fillRect(x, y, it.w, it.h); ctx.strokeRect(x, y, it.w, it.h);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (it.type === "sfx") {
      ctx.lineWidth = 10; ctx.strokeStyle = ink; ctx.fillStyle = "#ffd23f";
      lines.forEach(function (l, i) { var ly = it.y - th / 2 + lh * (i + 0.5); ctx.strokeText(l, it.x, ly); ctx.fillText(l, it.x, ly); });
    } else {
      ctx.fillStyle = ink;
      lines.forEach(function (l, i) { ctx.fillText(l, it.x, it.y - th / 2 + lh * (i + 0.5)); });
    }
    if (state.selected === it) {
      ctx.setLineDash([10, 8]); ctx.lineWidth = 3; ctx.strokeStyle = "#f6b40e";
      ctx.strokeRect(x - 10, y - 10, it.w + 20, it.h + 20);
    }
    ctx.restore();
  }

  function render() {
    var ink = $("cm-ink").value;
    ctx.fillStyle = $("cm-paper").value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    layoutPanels();
    panels.forEach(function (p, i) {
      var img = state.images[i];
      ctx.save();
      ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
      if (img) {
        var s = Math.max(p.w / img.width, p.h / img.height);
        ctx.drawImage(img, p.x + (p.w - img.width * s) / 2, p.y + (p.h - img.height * s) / 2, img.width * s, img.height * s);
      } else {
        ctx.fillStyle = "#f3f0e8"; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = "#9a9384"; ctx.font = "600 34px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("Click to add a picture", p.x + p.w / 2, p.y + p.h / 2);
      }
      ctx.restore();
      ctx.lineWidth = 6; ctx.strokeStyle = ink; ctx.strokeRect(p.x, p.y, p.w, p.h);
    });
    state.items.forEach(drawItem);
    $("cm-delete").disabled = !state.selected;
  }

  function point(e) {
    var r = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * canvas.width / r.width, y: (t.clientY - r.top) * canvas.height / r.height };
  }
  function hitItem(pt) {
    for (var i = state.items.length - 1; i >= 0; i--) {
      var it = state.items[i];
      if (Math.abs(pt.x - it.x) <= it.w / 2 + 10 && Math.abs(pt.y - it.y) <= it.h / 2 + 10) return it;
    }
    return null;
  }

  function down(e) {
    var pt = point(e);
    var it = hitItem(pt);
    if (it) {
      state.selected = it;
      drag = { it: it, dx: pt.x - it.x, dy: pt.y - it.y };
      e.preventDefault();
    } else {
      state.selected = null;
      var idx = panels.findIndex(function (p) { return pt.x >= p.x && pt.x <= p.x + p.w && pt.y >= p.y && pt.y <= p.y + p.h; });
      if (idx >= 0) { pendingPanel = idx; $("cm-file").click(); }
    }
    render();
  }
  function move(e) {
    if (!drag) return;
    var pt = point(e);
    drag.it.x = pt.x - drag.dx; drag.it.y = pt.y - drag.dy;
    render();
    e.preventDefault();
  }
  function up() { drag = null; }
  canvas.addEventListener("mousedown", down);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  canvas.addEventListener("touchstart", down, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", up);
  canvas.addEventListener("dblclick", function (e) {
    var it = hitItem(point(e));
    if (!it) return;
    var t = window.prompt("Words:", it.text);
    if (t !== null && t.trim()) { it.text = t.trim().slice(0, 200); render(); }
  });

  $("cm-file").addEventListener("change", function () {
    var file = $("cm-file").files[0];
    if (!file || pendingPanel === null) return;
    var reader = new FileReader();
    var target = pendingPanel;
    reader.onload = function () {
      var img = new Image();
      img.onload = function () { state.images[target] = img; render(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    $("cm-file").value = "";
  });

  function add(type, text) {
    var t = window.prompt(type === "sfx" ? "Sound effect:" : type === "caption" ? "Caption:" : "What do they say?", text);
    if (t === null || !t.trim()) return;
    var item = { type: type, text: t.trim().slice(0, 200), x: canvas.width / 2, y: canvas.height / 3 };
    state.items.push(item);
    state.selected = item;
    render();
  }
  $("cm-bubble").addEventListener("click", function () { add("bubble", "Hello!"); });
  $("cm-thought").addEventListener("click", function () { add("thought", "Hmm…"); });
  $("cm-caption").addEventListener("click", function () { add("caption", "Meanwhile…"); });
  $("cm-sfx").addEventListener("click", function () { add("sfx", "BOOM!"); });
  $("cm-delete").addEventListener("click", function () {
    state.items = state.items.filter(function (i) { return i !== state.selected; });
    state.selected = null; render();
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Delete" || e.key === "Backspace") && state.selected && document.activeElement === document.body) { $("cm-delete").click(); }
  });
  $("cm-clear").addEventListener("click", function () {
    if (!window.confirm("Clear the whole page?")) return;
    state = { images: {}, items: [], selected: null }; render();
  });
  ["cm-layout", "cm-gutter", "cm-paper", "cm-ink"].forEach(function (id) { $(id).addEventListener("input", render); });
  $("cm-layout").addEventListener("change", function () { state.images = {}; render(); });
  $("cm-size").addEventListener("change", function () {
    var s = SIZES[$("cm-size").value];
    canvas.width = s[0]; canvas.height = s[1];
    state.images = {}; render();
  });
  $("cm-download").addEventListener("click", function () {
    var sel = state.selected; state.selected = null; render();
    var a = document.createElement("a");
    a.download = "comic-page.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
    state.selected = sel; render();
  });
  render();
})();
