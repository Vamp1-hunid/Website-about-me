// js/premium-studio.js  -  "Page style" in the creator studio (Profile tab): theme, accent colour and wallpaper.
// Shown while the Premium feature is on for you; saving needs a Premium plan (the admin can always try it).
(function () {
  "use strict";
  var MW = window.MW, ADMIN = window.ADMIN;
  var form = document.getElementById("cprofile-form");
  if (!MW || !ADMIN || !form) return;
  var el = MW.el;

  Promise.all([MW.me(), MW.api("/hub/me").catch(function () { return {}; })]).then(function (results) {
    var user = results[0];
    var profile = results[1].profile;
    if (!user || !profile || !MW.feature("premium")) return;
    MW.api("/premium").then(function (info) {
      var premium = (info.mine && info.mine.plan === "premium") || user.role === "admin";
      var panel = el("section", { class: "premium-style panel-inset", "aria-labelledby": "ps-title" });
      panel.appendChild(el("p", { class: "node-label" }, "Premium // page style"));
      panel.appendChild(el("h3", { id: "ps-title" }, "Style your creator page"));
      if (!premium) {
        var p = el("p", { class: "muted" }, "Give visitors a page that feels like yours: a theme, an accent colour and a wallpaper. Comes with Chapterhive Premium. ");
        p.appendChild(el("a", { href: "/hub/premium" }, "Learn more"));
        panel.appendChild(p);
        form.after(panel);
        return;
      }
      var style = profile.pageStyle || {};
      var f = el("form", { novalidate: "" });
      var tRow = el("div", { class: "form-row" });
      tRow.appendChild(el("label", { for: "ps-theme" }, "Theme"));
      var theme = el("select", { id: "ps-theme" });
      Object.keys(info.themes).forEach(function (k) { theme.appendChild(el("option", { value: k }, info.themes[k])); });
      theme.value = style.theme || "hive";
      tRow.appendChild(theme);
      f.appendChild(tRow);

      var aRow = el("div", { class: "form-row" });
      aRow.appendChild(el("label", { for: "ps-accent" }, "Accent colour"));
      var accentOn = el("input", { type: "checkbox", id: "ps-accent-on" });
      accentOn.checked = Boolean(style.accent);
      var accent = el("input", { type: "color", id: "ps-accent", value: style.accent || "#f6b40e" });
      var al = el("label", { class: "check-row" });
      al.append(accentOn, el("span", {}, " Use my own accent colour "), accent);
      aRow.appendChild(al);
      f.appendChild(aRow);

      var wRow = el("div", { class: "form-row", "data-cover-picker": "wallpaper" });
      wRow.appendChild(el("span", { class: "label" }, "Wallpaper (shown behind your page)"));
      var picker = el("div", { class: "cover-picker" });
      picker.appendChild(el("img", { class: "cover-preview cover-wide", alt: "", hidden: "" }));
      picker.appendChild(el("label", { class: "btn btn-ghost btn-small", for: "ps-wallpaper" }, "Choose picture"));
      picker.appendChild(el("input", { type: "file", id: "ps-wallpaper", class: "sr-only", accept: "image/jpeg,image/png,image/webp" }));
      picker.appendChild(el("button", { type: "button", class: "btn btn-ghost btn-small cover-remove", hidden: "" }, "Remove"));
      wRow.appendChild(picker);
      wRow.appendChild(el("p", { class: "error", id: "wallpaper-error" }));
      f.appendChild(wRow);
      var wp = ADMIN.coverPicker(wRow);
      wp.reset(style.wallpaperUrl);

      var save = el("button", { type: "submit" }, "Save page style");
      var fb = el("p", { class: "feedback", "aria-live": "polite" });
      f.append(save, fb);
      f.addEventListener("submit", function (event) {
        event.preventDefault();
        if (wp.busy()) { fb.textContent = "Wait for the picture to finish uploading."; return; }
        save.disabled = true;
        MW.api("/premium/page-style", { method: "PUT", json: { theme: theme.value, accent: accentOn.checked ? accent.value : null, wallpaper: wp.value() } })
          .then(function () { fb.className = "feedback feedback-success"; fb.textContent = "Saved. Open your page to see it."; })
          .catch(function (e) { fb.className = "feedback feedback-error"; fb.textContent = e.message; })
          .then(function () { save.disabled = false; });
      });
      panel.appendChild(f);
      form.after(panel);
    }).catch(function () {});
  });
})();
