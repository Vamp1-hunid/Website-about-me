// js/calendar.js  -  /hub/calendar: a month view of Zambian public holidays, international days and site events.
(function () {
  "use strict";
  var MW = window.MW;
  var grid = document.getElementById("cal-grid");
  if (!MW || !grid) return;
  var el = MW.el;
  var $ = function (id) { return document.getElementById(id); };
  var now = new Date();
  var view = { y: now.getFullYear(), m: now.getMonth() };
  var cache = {};
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function load(year) {
    if (cache[year]) return Promise.resolve(cache[year]);
    return MW.api("/calendar?year=" + year).then(function (d) {
      // Spread multi-day events over each of their days.
      var items = d.holidays.slice();
      d.events.forEach(function (e) {
        var start = new Date(e.date + "T00:00:00Z"), end = new Date((e.endDate || e.date) + "T00:00:00Z");
        for (var t = start; t <= end; t = new Date(t.getTime() + 86400000)) items.push(Object.assign({}, e, { date: t.toISOString().slice(0, 10) }));
      });
      cache[year] = items;
      return items;
    });
  }

  function draw() {
    $("cal-title").textContent = MONTHS[view.m] + " " + view.y;
    load(view.y).then(function (items) {
      grid.textContent = "";
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (d) { grid.appendChild(el("div", { class: "cal-dow", role: "columnheader" }, d)); });
      var first = new Date(view.y, view.m, 1);
      var offset = (first.getDay() + 6) % 7;
      var days = new Date(view.y, view.m + 1, 0).getDate();
      for (var i = 0; i < offset; i++) grid.appendChild(el("div", { class: "cal-day is-empty" }));
      var todayKey = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
      var monthItems = [];
      for (var d = 1; d <= days; d++) {
        var key = view.y + "-" + pad(view.m + 1) + "-" + pad(d);
        var dayItems = items.filter(function (it) { return it.date === key; });
        var cell = el("div", { class: "cal-day" + (key === todayKey ? " is-today" : "") + (dayItems.some(function (x) { return x.kind === "zambia"; }) ? " is-holiday" : ""), role: "gridcell" });
        cell.appendChild(el("span", { class: "cal-num" }, String(d)));
        dayItems.forEach(function (it) {
          cell.appendChild(el("span", { class: "cal-item kind-" + it.kind, title: it.title }, it.emoji + " " + it.title));
          monthItems.push(it);
        });
        grid.appendChild(cell);
      }
      var list = $("cal-list");
      list.textContent = "";
      if (!monthItems.length) list.appendChild(el("li", { class: "muted" }, "Nothing special this month."));
      monthItems.forEach(function (it) {
        var li = el("li", { class: "kind-" + it.kind });
        li.appendChild(el("span", { class: "mono" }, new Date(it.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })));
        li.appendChild(el("strong", {}, " " + it.emoji + " " + it.title));
        if (it.details) li.appendChild(el("span", { class: "muted" }, " · " + it.details));
        if (it.link) { li.appendChild(document.createTextNode(" ")); li.appendChild(el("a", { href: it.link }, "More")); }
        if (it.kind === "event" && isAdmin) {
          var rm = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Delete");
          rm.addEventListener("click", function () {
            MW.api("/calendar/events/" + it.id, { method: "DELETE" }).then(function () { delete cache[view.y]; draw(); });
          });
          li.appendChild(rm);
        }
        list.appendChild(li);
      });
    }).catch(function (e) { grid.textContent = e.message; });
  }

  $("cal-prev").addEventListener("click", function () { view.m -= 1; if (view.m < 0) { view.m = 11; view.y -= 1; } draw(); });
  $("cal-next").addEventListener("click", function () { view.m += 1; if (view.m > 11) { view.m = 0; view.y += 1; } draw(); });

  var isAdmin = false;
  MW.me().then(function (user) {
    isAdmin = Boolean(user && user.role === "admin");
    if (isAdmin) {
      $("cal-admin").hidden = false;
      $("cal-form").addEventListener("submit", function (e) {
        e.preventDefault();
        MW.api("/calendar/events", { method: "POST", json: { title: $("ev-title").value, emoji: $("ev-emoji").value || "📅",
          startsOn: $("ev-start").value, endsOn: $("ev-end").value || null, link: $("ev-link").value, details: $("ev-details").value } })
          .then(function () { MW.toast("Event added."); $("cal-form").reset(); cache = {}; draw(); })
          .catch(function (err) { MW.toast(err.message, true); });
      });
      $("verse-form").addEventListener("submit", function (e) {
        e.preventDefault();
        MW.api("/calendar/verse", { method: "PUT", json: { reference: $("vf-ref").value, theme: $("vf-theme").value } })
          .then(function () { MW.toast("Today's verse is set."); }).catch(function (err) { MW.toast(err.message, true); });
      });
    }
    draw();
  });
})();
