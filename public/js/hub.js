// js/hub.js
// Chapterhive building blocks shared by every /hub page:
//   MW.creatorCard()   a creator in a list
//   MW.followButton()  follow / unfollow
//   MW.byline()        "by <creator>" with a follow button (work, story and character pages)
//   MW.reportLink()    report a work, comment or creator

(function () {
  "use strict";

  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;

  var KIND_NAMES = { manga: "Manga", comics: "Comics", animation: "Animation", stories: "Stories & writing", illustration: "Art & illustration", music: "Music",
    comedy: "Comedy", film: "Live action film", series: "Series", photography: "Photography", memes: "Memes", poetry: "Poetry" };
  MW.kindName = function (k) { return KIND_NAMES[k] || k; };

  MW.creatorCard = function (c) {
    var card = el("a", { class: "creator-card", href: "/hub/c/" + encodeURIComponent(c.handle) });
    var banner = el("div", { class: "creator-card-banner" });
    if (c.bannerUrl) banner.style.backgroundImage = "url(\"" + c.bannerUrl.replace(/["\\]/g, "") + "\")";
    card.appendChild(banner);
    var body = el("div", { class: "creator-card-body" });
    body.appendChild(MW.avatar({ avatarUrl: c.avatarUrl, displayName: c.name }, "big"));
    var h3 = el("h3", {}, c.name);
    h3.appendChild(MW.onlineDot(c.online));
    body.appendChild(h3);
    body.appendChild(el("p", { class: "mono muted" }, "@" + c.handle + " · " + c.followers + (c.followers === 1 ? " follower" : " followers")));
    if (c.tagline) body.appendChild(el("p", {}, c.tagline));
    if (c.kinds && c.kinds.length) {
      var chips = el("div", { class: "kind-chips" });
      c.kinds.forEach(function (k) { chips.appendChild(el("span", { class: "kind-chip" }, MW.kindName(k))); });
      body.appendChild(chips);
    }
    card.appendChild(body);
    return card;
  };

  // A Follow / Following button. onChange(followers) is called after it flips.
  MW.followButton = function (handle, following, onChange) {
    var button = el("button", { type: "button", class: "btn btn-small follow-button", "aria-pressed": String(Boolean(following)) },
      following ? "✓ Following" : "＋ Follow");
    button.addEventListener("click", async function () {
      var user = await MW.me();
      if (!user) {
        window.location.href = "/hub/login?next=" + encodeURIComponent(MW.currentPath());
        return;
      }
      var on = button.getAttribute("aria-pressed") === "true";
      button.disabled = true;
      try {
        var data = await MW.api("/hub/creators/" + encodeURIComponent(handle) + "/follow", { method: on ? "DELETE" : "POST" });
        button.setAttribute("aria-pressed", String(data.following));
        button.textContent = data.following ? "✓ Following" : "＋ Follow";
        if (data.following) MW.toast("You'll see their new releases in your Following feed.");
        if (onChange) onChange(data.followers);
      } catch (error) {
        MW.toast(error.message, true);
      }
      button.disabled = false;
    });
    return button;
  };

  // "by <creator>" with their picture and a follow button.
  var followState = {};
  MW.byline = function (creator, user) {
    var box = el("div", { class: "byline" });
    box.appendChild(MW.avatar({ avatarUrl: creator.avatarUrl, displayName: creator.name }));
    var text = el("span");
    text.appendChild(document.createTextNode("by "));
    text.appendChild(el("a", { class: "byline-name", href: "/hub/c/" + encodeURIComponent(creator.handle) }, creator.name));
    box.appendChild(text);
    var mine = user && MW.creator && MW.creator.handle === creator.handle;
    if (!mine) {
      // Ask once whether the viewer follows this creator, then show the right button.
      var slot = el("span", { class: "follow-slot" });
      box.appendChild(slot);
      var state = followState[creator.handle] || (followState[creator.handle] = MW.api("/hub/creators/" + encodeURIComponent(creator.handle)));
      state.then(function (data) {
        var b = MW.followButton(creator.handle, data.creator.following);
        slot.appendChild(b);
      }).catch(function () {});
    }
    return box;
  };

  /* ---------- Reports ---------- */

  var dialog = null;
  var REASONS = [
    ["stolen", "Stolen or copied work (copyright)"],
    ["explicit", "Sexual or graphic content"],
    ["hate", "Hate or violence"],
    ["harassment", "Harassment or bullying"],
    ["spam", "Spam or scam"],
    ["spoiler", "Unmarked spoilers"],
    ["other", "Something else"]
  ];

  function openReport(type, id) {
    if (!dialog) {
      dialog = el("dialog", { class: "report-dialog", "aria-labelledby": "report-title" });
      var form = el("form", { novalidate: "" });
      form.appendChild(el("h2", { id: "report-title" }, "Report"));
      form.appendChild(el("p", { class: "muted" }, "Reports are private. The Chapterhive team reviews them against the Content Rules."));
      var set = el("fieldset");
      set.appendChild(el("legend", { class: "label" }, "What's wrong?"));
      REASONS.forEach(function (r, i) {
        var row = el("div", { class: "check-row" });
        var input = el("input", { type: "radio", name: "reason", id: "reason-" + r[0], value: r[0] });
        if (i === 0) input.checked = true;
        row.append(input, el("label", { for: "reason-" + r[0] }, r[1]));
        set.appendChild(row);
      });
      form.appendChild(set);
      var label = el("label", { for: "report-details" }, "Details (optional)");
      var details = el("textarea", { id: "report-details", rows: "3", maxlength: "1000" });
      form.append(label, details);
      var feedback = el("p", { class: "feedback", "aria-live": "polite" });
      var row = el("div", { class: "hero-actions" });
      var send = el("button", { type: "submit" }, "Send report");
      var cancel = el("button", { type: "button", class: "btn btn-ghost" }, "Cancel");
      cancel.addEventListener("click", function () { dialog.close(); });
      row.append(send, cancel);
      form.append(row, feedback);
      dialog.appendChild(form);
      document.body.appendChild(dialog);
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        send.disabled = true;
        try {
          await MW.api("/hub/reports", { method: "POST", json: {
            targetType: dialog.dataset.type, targetId: Number(dialog.dataset.id),
            reason: form.querySelector("input[name='reason']:checked").value, details: details.value
          } });
          dialog.close();
          MW.toast("Thanks. The report was sent to the Chapterhive team.");
        } catch (error) {
          feedback.className = "feedback feedback-error";
          feedback.textContent = error.message;
        }
        send.disabled = false;
      });
    }
    dialog.dataset.type = type;
    dialog.dataset.id = String(id);
    dialog.querySelector("textarea").value = "";
    dialog.querySelector(".feedback").textContent = "";
    if (dialog.showModal) dialog.showModal();
  }

  MW.reportLink = function (type, id, label) {
    var b = el("button", { type: "button", class: "link-button report-link" }, "⚑ " + (label || "Report"));
    b.addEventListener("click", async function () {
      var user = await MW.me();
      if (!user) {
        window.location.href = "/hub/login?next=" + encodeURIComponent(MW.currentPath());
        return;
      }
      openReport(type, id);
    });
    return b;
  };

  // News items in lists.
  MW.newsItem = function (post) {
    var a = el("a", { class: "news-item", href: MW.workUrl(post) });
    if (post.imageUrl) a.appendChild(el("img", { src: post.imageUrl, alt: "", loading: "lazy" }));
    else a.appendChild(el("div", { class: "news-noimg", "aria-hidden": "true" }));
    var t = el("div");
    t.appendChild(el("p", { class: "mono muted" }, MW.formatDate(post.createdAt) + (post.creator ? " · " + post.creator.name : "")));
    t.appendChild(el("h3", {}, post.title));
    if (post.logline || post.summary) t.appendChild(el("p", { class: "muted" }, post.logline || post.summary));
    a.appendChild(t);
    return a;
  };
})();

/* ---------- Collabs: shared helpers ---------- */
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var metaPromise = null;
  MW.collabMeta = function () {
    if (!metaPromise) metaPromise = MW.api("/collabs/meta");
    return metaPromise;
  };

  // Fills a <select> with the roles. When "Other (describe it)" is chosen, the matching text box appears.
  MW.fillRoleSelect = function (select, roles, otherRow) {
    roles.forEach(function (r) { select.appendChild(MW.el("option", { value: r.key }, r.label)); });
    if (otherRow) {
      var sync = function () {
        otherRow.hidden = select.value !== "other";
        if (!otherRow.hidden) {
          var input = otherRow.querySelector("input");
          if (input && document.activeElement === select) input.focus();
        }
      };
      select.addEventListener("change", sync);
      sync();
      select._syncOther = sync;
    }
  };

  // A collab request in a list.
  MW.collabCard = function (c) {
    var el = MW.el;
    var li = el("li", { class: "collab-card" });
    var a = el("a", { class: "collab-link", href: "/hub/collabs/" + c.id });
    var chips = el("div", { class: "kind-chips" });
    chips.appendChild(el("span", { class: "kind-chip chip-looking" }, "Looking for: " + c.lookingFor.label));
    if (c.offering) chips.appendChild(el("span", { class: "kind-chip" }, "Brings: " + c.offering.label));
    chips.appendChild(el("span", { class: "kind-chip chip-comp" }, c.compensation.label));
    a.appendChild(chips);
    a.appendChild(el("h3", {}, c.title));
    var preview = c.description.replace(/[#*_=~>`\[\]()-]+/g, " ").replace(/\s+/g, " ").trim();
    a.appendChild(el("p", { class: "muted" }, preview.length > 180 ? preview.slice(0, 179) + "…" : preview));
    var by = el("p", { class: "collab-by mono muted" });
    by.appendChild(MW.avatar({ avatarUrl: c.creator.avatarUrl, displayName: c.creator.name }));
    by.appendChild(document.createTextNode(" " + c.creator.name + " · " + MW.formatDate(c.createdAt) + (c.series ? " · " + c.series.title : "")));
    a.appendChild(by);
    li.appendChild(a);
    return li;
  };
})();
