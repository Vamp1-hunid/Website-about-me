// js/admin-moderation.js
// Dashboard -> Chapterhive tab (site owner only): review creator applications and handle reports.

(function () {
  "use strict";

  var MW = window.MW;
  var ADMIN = window.ADMIN;
  if (!MW || !ADMIN || !document.getElementById("creator-queue")) return;
  var el = MW.el;
  var creatorStatus = "pending";
  var reportStatus = "open";
  var KIND = { manga: "Manga", comics: "Comics", animation: "Animation", stories: "Stories", illustration: "Illustration", music: "Music" };

  function setPressed(groupId, attr, value) {
    document.querySelectorAll("#" + groupId + " [" + attr + "]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value));
    });
  }

  /* ---------- Creators ---------- */

  async function review(c, status, extra) {
    var note = "";
    if (status === "rejected" || status === "suspended") {
      note = window.prompt(status === "rejected" ? "Optional note for the applicant (sent by email if they have one):" : "Reason for suspending (kept on file):", "") || "";
    }
    var data = await MW.api("/admin/creators/" + c.userId + "/review", {
      method: "POST",
      json: Object.assign({ status: status, note: note }, extra || {})
    });
    MW.toast("@" + c.handle + ": " + status + (data.emailed ? " (emailed)" : ""));
    loadCreators();
    refreshBadge();
  }

  function creatorCard(c) {
    var li = el("li", { class: "mod-card is-" + c.status });
    var head = el("div", { class: "mod-actions" });
    head.appendChild(MW.avatar({ avatarUrl: c.avatarUrl, displayName: c.name }));
    var title = el("strong", {}, c.name + " ");
    head.appendChild(title);
    head.appendChild(el("a", { href: "/hub/c/" + encodeURIComponent(c.handle), class: "mono" }, "@" + c.handle));
    head.appendChild(el("span", { class: "mono muted" }, "account @" + c.username + (c.email ? " · " + c.email : "") + " · " + MW.formatDate(c.createdAt)));
    li.appendChild(head);
    if (c.tagline) li.appendChild(el("p", { class: "logline" }, c.tagline));
    if (c.kinds && c.kinds.length) li.appendChild(el("p", { class: "mono muted" }, c.kinds.map(function (k) { return KIND[k] || k; }).join(" · ")));
    if (c.application) li.appendChild(el("p", {}, c.application));
    if (c.links && c.links.length) {
      var links = el("p", { class: "mono" });
      c.links.forEach(function (l, i) {
        if (i) links.appendChild(document.createTextNode(" · "));
        links.appendChild(el("a", { href: l.url, target: "_blank", rel: "noopener nofollow" }, l.label));
      });
      li.appendChild(links);
    }
    if (c.status !== "pending") li.appendChild(el("p", { class: "mono muted" }, c.works + " works · " + c.followers + " followers" + (c.reviewNote ? " · note: " + c.reviewNote : "")));

    var actions = el("div", { class: "mod-actions" });
    if (c.status !== "approved") actions.appendChild(ADMIN.button("✓ Approve", function () { review(c, "approved").catch(function (e) { MW.toast(e.message, true); }); }, false));
    if (c.status === "pending") actions.appendChild(ADMIN.button("Reject", function () { review(c, "rejected").catch(function (e) { MW.toast(e.message, true); }); }));
    if (c.status === "approved") {
      var feat = ADMIN.button(c.featured ? "★ Featured" : "☆ Feature", function () { review(c, "approved", { featured: !c.featured, notify: false }).catch(function (e) { MW.toast(e.message, true); }); });
      var news = ADMIN.button(c.canWriteNews ? "✓ Can post news posts" : "Allow news posts", function () { review(c, "approved", { canWriteNews: !c.canWriteNews, notify: false }).catch(function (e) { MW.toast(e.message, true); }); });
      actions.append(feat, news);
      actions.appendChild(ADMIN.button("Suspend", function () { review(c, "suspended").catch(function (e) { MW.toast(e.message, true); }); }));
    }
    li.appendChild(actions);
    return li;
  }

  async function loadCreators() {
    var list = document.getElementById("creator-queue");
    try {
      var data = await MW.api("/admin/creators?status=" + creatorStatus);
      list.textContent = "";
      if (!data.creators.length) list.appendChild(el("li", { class: "muted" }, creatorStatus === "pending" ? "No applications waiting." : "None."));
      data.creators.forEach(function (c) { list.appendChild(creatorCard(c)); });
    } catch (error) {
      list.textContent = error.message;
    }
  }

  document.querySelectorAll("#creator-filter [data-cstatus]").forEach(function (b) {
    b.addEventListener("click", function () {
      creatorStatus = b.getAttribute("data-cstatus");
      setPressed("creator-filter", "data-cstatus", creatorStatus);
      loadCreators();
    });
  });

  /* ---------- Reports ---------- */

  var REASONS = { stolen: "Stolen / copyright", explicit: "Sexual or graphic", hate: "Hate or violence", harassment: "Harassment",
    spam: "Spam or scam", spoiler: "Unmarked spoilers", other: "Other" };

  async function setReport(r, status) {
    await MW.api("/admin/reports/" + r.id, { method: "POST", json: { status: status } });
    loadReports();
    refreshBadge();
  }

  function reportCard(r) {
    var li = el("li", { class: "mod-card" + (r.status === "open" ? "" : " is-approved") });
    li.appendChild(el("p", {}, ""));
    var head = li.firstChild;
    head.appendChild(el("strong", {}, REASONS[r.reason] || r.reason));
    head.appendChild(document.createTextNode(" · " + r.targetType + " · reported by @" + (r.reporter || "deleted account") + " · " + MW.formatDateTime(r.createdAt)));
    var t = r.target;
    var actions = el("div", { class: "mod-actions" });
    if (!t) {
      li.appendChild(el("p", { class: "muted" }, "Already removed."));
    } else if (r.targetType === "post") {
      var p = el("p");
      p.appendChild(el("a", { href: "/hub/w/" + encodeURIComponent(t.slug), target: "_blank" }, t.title));
      p.appendChild(document.createTextNode(" by @" + t.creator));
      li.appendChild(p);
      actions.appendChild(ADMIN.confirmButton("Delete work", async function () {
        await MW.api("/posts/" + t.id, { method: "DELETE" });
        await setReport(r, "resolved");
        MW.toast("Work deleted.");
      }));
    } else if (r.targetType === "comment") {
      li.appendChild(el("p", {}, "“" + t.body + "” by @" + t.author));
      actions.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/hub/w/" + encodeURIComponent(t.slug) + "#comment-" + t.id, target: "_blank" }, "View"));
      actions.appendChild(ADMIN.confirmButton("Delete comment", async function () {
        await MW.api("/comments/" + t.id, { method: "DELETE" });
        await setReport(r, "resolved");
        MW.toast("Comment deleted.");
      }));
    } else if (r.targetType === "creator") {
      var cp = el("p");
      cp.appendChild(el("a", { href: "/hub/c/" + encodeURIComponent(t.handle), target: "_blank" }, t.name + " (@" + t.handle + ")"));
      cp.appendChild(document.createTextNode(" · " + t.status));
      li.appendChild(cp);
      if (t.status === "approved") {
        actions.appendChild(ADMIN.confirmButton("Suspend creator", async function () {
          await MW.api("/admin/creators/" + t.id + "/review", { method: "POST", json: { status: "suspended", note: "Suspended after a report (" + r.reason + ")." } });
          await setReport(r, "resolved");
        }));
      }
    }
    if (t && r.targetType === "collab") {
      var kp = el("p");
      kp.appendChild(el("a", { href: "/hub/collabs/" + t.id, target: "_blank" }, t.title));
      kp.appendChild(document.createTextNode(" by @" + t.creator));
      li.appendChild(kp);
      actions.appendChild(ADMIN.confirmButton("Delete request", async function () {
        await MW.api("/collabs/" + t.id, { method: "DELETE" });
        await setReport(r, "resolved");
        MW.toast("Collab request deleted.");
      }));
    }
    if (r.details) li.appendChild(el("p", { class: "muted" }, "Details: " + r.details));
    if (r.status === "open") {
      actions.appendChild(ADMIN.button("Mark resolved", function () { setReport(r, "resolved"); }));
      actions.appendChild(ADMIN.button("Dismiss", function () { setReport(r, "dismissed"); }));
    } else {
      actions.appendChild(ADMIN.button("Reopen", function () { setReport(r, "open"); }));
    }
    li.appendChild(actions);
    return li;
  }

  async function loadReports() {
    var list = document.getElementById("report-queue");
    try {
      var data = await MW.api("/admin/reports?status=" + reportStatus);
      list.textContent = "";
      if (!data.reports.length) list.appendChild(el("li", { class: "muted" }, reportStatus === "open" ? "No open reports." : "None."));
      data.reports.forEach(function (r) { list.appendChild(reportCard(r)); });
    } catch (error) {
      list.textContent = error.message;
    }
  }

  document.querySelectorAll("#report-filter [data-rstatus]").forEach(function (b) {
    b.addEventListener("click", function () {
      reportStatus = b.getAttribute("data-rstatus");
      setPressed("report-filter", "data-rstatus", reportStatus);
      loadReports();
    });
  });

  function refreshBadge() {
    MW.api("/admin/overview").then(function (o) {
      var n = o.pendingCreators + o.openReports;
      var badge = document.getElementById("mod-badge");
      badge.textContent = n ? String(n) : "";
      badge.hidden = !n;
    }).catch(function () {});
  }

  ADMIN.onReady(refreshBadge);
  ADMIN.onShow("chapterhive", function () { loadCreators(); loadReports(); });
})();
