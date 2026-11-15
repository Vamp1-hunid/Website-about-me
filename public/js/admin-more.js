// js/admin-more.js
// Dashboard: Overview, Drafts & scheduled, Products, Comments, Inbox and Settings
// (social links and the setup status checks).

(function () {
  "use strict";

  var MW = window.MW;
  var ADMIN = window.ADMIN;
  if (!MW || !ADMIN) return;
  var el = MW.el;
  function field(id) { return document.getElementById(id); }

  /* =================== Setup status (Overview + Settings) =================== */

  async function loadStatus(list) {
    try {
      var data = await MW.api("/admin/status");
      list.textContent = "";
      data.checks.forEach(function (check) {
        var li = el("li", { class: "status-" + check.level });
        li.appendChild(el("span", { class: "status-dot", "aria-hidden": "true" }));
        var text = el("div");
        text.appendChild(el("strong", {}, check.name + (check.ok ? " ✓" : check.level === "warn" ? " (optional)" : " ✗")));
        text.appendChild(el("p", { class: "muted" }, check.message));
        li.appendChild(text);
        list.appendChild(li);
      });
    } catch (error) {
      list.textContent = "";
      list.appendChild(el("li", { class: "muted" }, error.message));
    }
  }

  /* =================== Overview =================== */

  async function loadOverview() {
    if (ADMIN.mode === "studio") return loadStudioOverview();
    try {
      var o = await MW.api("/admin/overview");
      var stats = field("overview-stats");
      stats.textContent = "";
      [
        ["Live works", o.live, "works"],
        ["Scheduled", o.scheduled, "drafts"],
        ["Drafts", o.drafts + o.characterDrafts, "drafts"],
        ["Stories", o.stories, "stories"],
        ["Characters", o.characters, "characters"],
        ["Products", o.products, "products"],
        ["Members", o.members],
        ["Comments (7 days)", o.commentsWeek, "comments"],
        ["Likes (7 days)", o.likesWeek],
        ["Unread messages", o.unreadMessages, "inbox"],
        ["Your followers", o.followers],
        ["Afterframe creators", o.creators, "afterframe"],
        ["Pending applications", o.pendingCreators, "afterframe"],
        ["Open reports", o.openReports, "afterframe"]
      ].forEach(function (s) {
        var box = el("div", { class: "stat" + (s[2] ? " stat-link" : "") });
        box.appendChild(el("dt", {}, s[0]));
        box.appendChild(el("dd", {}, String(s[1])));
        if (s[2]) {
          box.setAttribute("data-go", s[2]);
          box.setAttribute("role", "button");
          box.tabIndex = 0;
          box.addEventListener("keydown", function (e) { if (e.key === "Enter") ADMIN.show(s[2]); });
        }
        stats.appendChild(box);
      });
      var upcoming = field("overview-upcoming");
      upcoming.textContent = "";
      if (!o.upcoming.length) upcoming.appendChild(el("li", { class: "muted" }, "Nothing scheduled."));
      o.upcoming.forEach(function (u) {
        var li = el("li");
        li.appendChild(el("span", { class: "mono" }, MW.formatDateTime(u.publishAt) + " · "));
        li.appendChild(el("a", { href: "/work/" + encodeURIComponent(u.slug) }, u.title));
        upcoming.appendChild(li);
      });
      setInboxBadge(o.unreadMessages);
    } catch (error) {
      MW.toast(error.message, true);
    }
    loadStatus(field("overview-status"));
  }
  ADMIN.onShow("overview", loadOverview);

  function statTile(stats, s) {
    var box = el("div", { class: "stat" + (s[2] ? " stat-link" : "") });
    box.appendChild(el("dt", {}, s[0]));
    box.appendChild(el("dd", {}, String(s[1])));
    if (s[2]) {
      box.setAttribute("data-go", s[2]);
      box.setAttribute("role", "button");
      box.tabIndex = 0;
    }
    stats.appendChild(box);
  }

  // The studio's overview: the creator's own numbers.
  async function loadStudioOverview() {
    var statusBlock = field("overview-status");
    if (statusBlock) statusBlock.closest("div").hidden = true;
    try {
      var o = await MW.api("/hub/studio/overview");
      var stats = field("overview-stats");
      stats.textContent = "";
      [["Live works", o.live, "works"], ["Scheduled", o.scheduled, "drafts"], ["Drafts", o.drafts + o.characterDrafts, "drafts"],
        ["Stories", o.stories, "stories"], ["Characters", o.characters, "characters"], ["Followers", o.followers],
        ["Likes", o.likes], ["Comments (7 days)", o.commentsWeek]].forEach(function (s) { statTile(stats, s); });
      var upcoming = field("overview-upcoming");
      upcoming.textContent = "";
      if (!o.upcoming.length) upcoming.appendChild(el("li", { class: "muted" }, "Nothing scheduled."));
      o.upcoming.forEach(function (u) {
        var li = el("li");
        li.appendChild(el("span", { class: "mono" }, MW.formatDateTime(u.publishAt) + " · "));
        li.appendChild(el("a", { href: "/hub/w/" + encodeURIComponent(u.slug) }, u.title));
        upcoming.appendChild(li);
      });
    } catch (error) {
      MW.toast(error.message, true);
    }
  }

  /* =================== Studio: creator profile =================== */

  var cpForm = field("cprofile-form");
  if (cpForm && ADMIN.mode === "studio") {
    var banner = ADMIN.coverPicker(document.querySelector("[data-cover-picker='banner']"));
    var linksBox = field("cp-links");
    var linkRow = function (link) {
      var row = el("div", { class: "link-row" });
      var label = el("input", { type: "text", maxlength: "30", placeholder: "Label, e.g. Instagram", "aria-label": "Link label", value: (link && link.label) || "" });
      var url = el("input", { type: "url", maxlength: "300", placeholder: "https://…", "aria-label": "Link", value: (link && link.url) || "" });
      var remove = ADMIN.button("✕", function () { row.remove(); });
      remove.setAttribute("aria-label", "Remove link");
      row.append(label, url, remove);
      return row;
    };
    field("cp-add-link").addEventListener("click", function () { linksBox.appendChild(linkRow()); });

    var loadProfile = async function () {
      try {
        var data = await MW.api("/hub/me");
        var p = data.profile;
        if (!p) {
          field("profile-status-line").textContent = "You don't have a creator profile yet.";
          return;
        }
        field("cp-name").value = p.name;
        field("cp-tagline").value = p.tagline || "";
        field("cp-bio").value = p.bio || "";
        document.querySelectorAll("#cp-kinds input").forEach(function (i) { i.checked = (p.kinds || []).includes(i.value); });
        linksBox.textContent = "";
        (p.links || []).forEach(function (l) { linksBox.appendChild(linkRow(l)); });
        if (!linksBox.children.length) linksBox.appendChild(linkRow());
        banner.reset(p.bannerUrl);
        field("cp-view").href = "/hub/c/" + encodeURIComponent(p.handle);
        field("profile-status-line").textContent = "Your page: /hub/c/" + p.handle + (p.canWriteNews ? " · you can post anime updates" : "");
      } catch (error) {
        MW.toast(error.message, true);
      }
    };
    ADMIN.onShow("profile", loadProfile);

    cpForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      var fb = field("cprofile-feedback");
      if (banner.busy()) {
        MW.showProblems(cpForm, [{ field: "banner", message: "Wait for the picture to finish uploading." }]);
        return;
      }
      try {
        await MW.api("/hub/profile", { method: "PUT", json: {
          name: field("cp-name").value,
          tagline: field("cp-tagline").value,
          bio: field("cp-bio").value,
          kinds: Array.prototype.filter.call(document.querySelectorAll("#cp-kinds input"), function (i) { return i.checked; }).map(function (i) { return i.value; }),
          links: Array.prototype.map.call(linksBox.children, function (row) {
            var inputs = row.querySelectorAll("input");
            return { label: inputs[0].value, url: inputs[1].value.trim() };
          }).filter(function (l) { return l.url; }),
          banner: banner.value()
        } });
        MW.showProblems(cpForm, []);
        fb.className = "feedback feedback-success";
        fb.textContent = "Profile saved.";
        loadProfile();
      } catch (error) {
        MW.showProblems(cpForm, (error.data && error.data.problems) || []);
        fb.className = "feedback feedback-error";
        fb.textContent = error.message;
      }
    });
  }

  function setInboxBadge(n) {
    var badge = field("inbox-badge");
    badge.textContent = n > 0 ? String(n) : "";
    badge.hidden = !(n > 0);
  }

  /* =================== Drafts & scheduled =================== */

  async function loadDrafts() {
    var works = field("draft-works");
    var chars = field("draft-chars");
    try {
      var drafts = await MW.api("/posts?drafts=1&status=draft");
      var scheduled = await MW.api("/posts?drafts=1&status=scheduled");
      works.textContent = "";
      var all = scheduled.posts.concat(drafts.posts);
      if (!all.length) ADMIN.emptyRow(works, "No draft or scheduled works.");
      all.forEach(function (p) { works.appendChild(ADMIN.workRow(p, loadDrafts)); });
      if (drafts.pages > 1) works.appendChild(el("li", { class: "muted empty-row" }, "Showing the newest 12 drafts. See all in the Works tab (Drafts filter)."));

      var cd = await MW.api("/admin/characters?status=draft");
      var cs = await MW.api("/admin/characters?status=scheduled");
      chars.textContent = "";
      var allChars = cs.characters.concat(cd.characters);
      if (!allChars.length) ADMIN.emptyRow(chars, "No draft or scheduled characters.");
      allChars.forEach(function (c) { chars.appendChild(ADMIN.characterRow(c, loadDrafts)); });
    } catch (error) {
      ADMIN.emptyRow(works, error.message);
    }
  }
  ADMIN.onShow("drafts", loadDrafts);

  /* =================== Products =================== */

  var productForm = field("product-form");
  var productImage = ADMIN.coverPicker(document.querySelector("[data-cover-picker='product']"));
  var editingProduct = null;

  function resetProduct() {
    editingProduct = null;
    productForm.reset();
    field("product-published").checked = true;
    MW.showProblems(productForm, []);
    productImage.reset(null);
    field("product-cancel").hidden = true;
    field("product-form-title").textContent = "New product";
    field("product-kicker").textContent = "Products // new";
  }

  function editProduct(p) {
    editingProduct = p;
    MW.showProblems(productForm, []);
    field("product-name").value = p.name;
    field("product-tagline").value = p.tagline || "";
    field("product-status").value = p.status || "";
    field("product-description").value = p.description || "";
    field("product-link").value = p.link || "";
    field("product-link-label").value = p.linkLabel || "";
    field("product-order").value = p.sortOrder === null || p.sortOrder === undefined ? "" : p.sortOrder;
    field("product-published").checked = p.published;
    productImage.reset(p.imageUrl);
    field("product-cancel").hidden = false;
    field("product-form-title").textContent = "Edit: " + p.name;
    field("product-kicker").textContent = "Products // edit";
    field("product-feedback").textContent = "";
    field("product-form-title").scrollIntoView({ block: "start" });
  }

  async function loadProducts() {
    var list = field("product-list-admin");
    try {
      var data = await MW.api("/admin/products");
      list.textContent = "";
      if (!data.products.length) ADMIN.emptyRow(list, "No products yet. Add your other projects here, e.g. QuantaKai.");
      data.products.forEach(function (p) {
        list.appendChild(ADMIN.listItem({
          imageUrl: p.imageUrl,
          title: p.name,
          meta: [p.status, p.tagline].filter(Boolean).join(" · "),
          flag: p.published ? "" : "HIDDEN",
          actions: [
            ADMIN.button("Edit", function () { editProduct(p); }),
            ADMIN.confirmButton("Delete", async function () {
              await MW.api("/admin/products/" + p.id, { method: "DELETE" });
              MW.toast("Deleted " + p.name + ".");
              if (editingProduct && editingProduct.id === p.id) resetProduct();
              loadProducts();
            })
          ]
        }));
      });
    } catch (error) {
      ADMIN.emptyRow(list, error.message);
    }
  }

  field("product-cancel").addEventListener("click", resetProduct);
  productForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var fb = field("product-feedback");
    fb.className = "feedback";
    fb.textContent = "";
    var problems = [];
    if (!field("product-name").value.trim()) problems.push({ field: "name", message: "Give the product a name." });
    var link = field("product-link").value.trim();
    if (link && !/^https?:\/\/\S+$/i.test(link)) problems.push({ field: "link", message: "Links must start with https://" });
    if (productImage.busy()) problems.push({ field: "image", message: "Wait for the picture to finish uploading." });
    MW.showProblems(productForm, problems);
    if (problems.length) return;
    var payload = {
      name: field("product-name").value,
      tagline: field("product-tagline").value,
      status: field("product-status").value,
      description: field("product-description").value,
      link: link,
      linkLabel: field("product-link-label").value,
      sortOrder: field("product-order").value,
      published: field("product-published").checked,
      image: productImage.value()
    };
    try {
      var data = editingProduct
        ? await MW.api("/admin/products/" + editingProduct.id, { method: "PUT", json: payload })
        : await MW.api("/admin/products", { method: "POST", json: payload });
      resetProduct();
      fb.className = "feedback feedback-success";
      fb.textContent = "Saved " + data.product.name + ". ";
      fb.appendChild(el("a", { href: "/products#product-" + data.product.slug }, "View the products page"));
      loadProducts();
    } catch (error) {
      MW.showProblems(productForm, (error.data && error.data.problems) || []);
      fb.className = "feedback feedback-error";
      fb.textContent = error.message;
    }
  });
  ADMIN.onShow("products", loadProducts);

  /* =================== Comments (moderation) =================== */

  var modPage = 1;
  async function loadComments(page) {
    modPage = page;
    var list = field("mod-list");
    try {
      var data = await MW.api("/admin/comments?page=" + page);
      list.textContent = "";
      if (!data.comments.length) list.appendChild(el("li", { class: "muted" }, "No comments yet."));
      data.comments.forEach(function (c) {
        var li = el("li", { class: "comment" + (c.author.role === "admin" ? " by-admin" : "") });
        var header = el("header");
        header.appendChild(MW.avatar(c.author));
        header.appendChild(el("a", { class: "who", href: "/u/" + encodeURIComponent(c.author.username) }, c.author.displayName));
        header.appendChild(el("span", {}, (c.parentId ? "replied on " : "on ")));
        header.appendChild(el("a", { href: "/work/" + encodeURIComponent(c.work.slug) + "#comment-" + c.id }, c.work.title));
        header.appendChild(el("time", { datetime: c.createdAt }, MW.formatDateTime(c.createdAt)));
        var tools = el("span", { class: "comment-tools" });
        tools.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/work/" + encodeURIComponent(c.work.slug) + "#comment-" + c.id }, "Reply"));
        tools.appendChild(ADMIN.confirmButton("Delete", async function () {
          await MW.api("/comments/" + c.id, { method: "DELETE" });
          li.remove();
          MW.toast("Comment deleted.");
        }));
        header.appendChild(tools);
        li.appendChild(header);
        li.appendChild(el("p", {}, c.body));
        list.appendChild(li);
      });
      field("mod-page").textContent = data.pages > 1 ? "Page " + data.page + " of " + data.pages : "";
      field("mod-prev").hidden = data.page <= 1;
      field("mod-next").hidden = data.page >= data.pages;
    } catch (error) {
      list.textContent = "";
      list.appendChild(el("li", { class: "muted" }, error.message));
    }
  }
  field("mod-prev").addEventListener("click", function () { loadComments(modPage - 1); });
  field("mod-next").addEventListener("click", function () { loadComments(modPage + 1); });
  ADMIN.onShow("comments", function () { loadComments(1); });

  /* =================== Inbox =================== */

  var inboxPage = 1;
  var inboxKind = "";
  document.querySelectorAll("#inbox-filters [data-kind]").forEach(function (b) {
    b.addEventListener("click", function () {
      inboxKind = b.getAttribute("data-kind");
      document.querySelectorAll("#inbox-filters [data-kind]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      loadInbox(1);
    });
  });
  async function loadInbox(page) {
    inboxPage = page;
    var list = field("inbox-list");
    try {
      var data = await MW.api("/admin/messages?page=" + page + (inboxKind ? "&kind=" + inboxKind : ""));
      list.textContent = "";
      if (!data.messages.length) list.appendChild(el("li", { class: "muted" }, "No messages yet."));
      data.messages.forEach(function (m) {
        var li = el("li", { class: "comment message" + (m.read ? "" : " is-unread") });
        var header = el("header");
        var kindLabel = { business: "Business", suggestion: "Suggestion" }[m.kind] || "Contact";
        header.appendChild(el("span", { class: "inbox-kind is-" + (m.kind || "contact") }, kindLabel));
        header.appendChild(el("span", { class: "who" }, m.name + (m.company ? " · " + m.company : "")));
        header.appendChild(el("a", { href: "mailto:" + m.email + "?subject=" + encodeURIComponent("Re: " + m.subject) }, m.email));
        header.appendChild(el("span", { class: "sticker" }, m.subject));
        header.appendChild(el("time", { datetime: m.createdAt }, MW.formatDateTime(m.createdAt)));
        if (!m.emailed) header.appendChild(el("span", { class: "muted", title: "Email wasn't set up or failed when this arrived" }, "(not emailed)"));
        var tools = el("span", { class: "comment-tools" });
        tools.appendChild(el("a", { class: "btn btn-small", href: "mailto:" + m.email + "?subject=" + encodeURIComponent("Re: " + m.subject) }, "Reply by email"));
        if (!m.read) {
          tools.appendChild(ADMIN.button("Mark read", async function () {
            await MW.api("/admin/messages/" + m.id + "/read", { method: "POST" });
            li.classList.remove("is-unread");
            this.remove();
            MW.api("/admin/overview").then(function (o) { setInboxBadge(o.unreadMessages); });
          }));
        }
        tools.appendChild(ADMIN.confirmButton("Delete", async function () {
          await MW.api("/admin/messages/" + m.id, { method: "DELETE" });
          li.remove();
        }));
        header.appendChild(tools);
        li.appendChild(header);
        li.appendChild(el("p", {}, m.message));
        list.appendChild(li);
      });
      field("inbox-page").textContent = data.pages > 1 ? "Page " + data.page + " of " + data.pages : "";
      field("inbox-prev").hidden = data.page <= 1;
      field("inbox-next").hidden = data.page >= data.pages;
    } catch (error) {
      list.textContent = "";
      list.appendChild(el("li", { class: "muted" }, error.message));
    }
  }
  field("inbox-prev").addEventListener("click", function () { loadInbox(inboxPage - 1); });
  field("inbox-next").addEventListener("click", function () { loadInbox(inboxPage + 1); });
  ADMIN.onShow("inbox", function () { loadInbox(1); });

  /* =================== Settings: social links =================== */

  var platforms = {};
  var socialsList = field("socials-list");

  function socialRow(link) {
    var li = el("li", { class: "social-edit" });
    var select = el("select", { "aria-label": "Platform" });
    Object.keys(platforms).forEach(function (key) {
      select.appendChild(el("option", { value: key }, platforms[key]));
    });
    select.value = link.platform || "instagram";
    var url = el("input", { type: "text", "aria-label": "Link", placeholder: "https://instagram.com/yourname", maxlength: "500", value: link.url || "" });
    var label = el("input", { type: "text", "aria-label": "Button text (optional)", placeholder: "Button text (optional)", maxlength: "40", value: link.label && link.label !== platforms[link.platform] ? link.label : "" });
    function hint() {
      url.placeholder = select.value === "email" ? "you@example.com" : select.value === "whatsapp" ? "https://wa.me/260XXXXXXXXX" : "https://…";
    }
    select.addEventListener("change", hint);
    hint();
    var up = ADMIN.button("↑", function () { if (li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); });
    up.setAttribute("aria-label", "Move up");
    var remove = ADMIN.button("✕", function () { li.remove(); });
    remove.setAttribute("aria-label", "Remove");
    li.append(select, url, label, up, remove);
    return li;
  }

  async function loadSettings() {
    loadStatus(field("status-list"));
    try {
      var data = await MW.api("/socials");
      platforms = data.platforms;
      socialsList.textContent = "";
      data.links.forEach(function (link) { socialsList.appendChild(socialRow(link)); });
      if (!data.links.length) socialsList.appendChild(socialRow({ platform: "instagram" }));
    } catch (error) {
      MW.toast(error.message, true);
    }
  }

  field("social-add").addEventListener("click", function () {
    var row = socialRow({ platform: "tiktok" });
    socialsList.appendChild(row);
    row.querySelector("input").focus();
  });

  field("socials-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var fb = field("socials-feedback");
    var links = Array.prototype.map.call(socialsList.children, function (li) {
      var inputs = li.querySelectorAll("input");
      return { platform: li.querySelector("select").value, url: inputs[0].value.trim(), label: inputs[1].value.trim() };
    }).filter(function (l) { return l.url; });
    try {
      var data = await MW.api("/admin/socials", { method: "PUT", json: { links: links } });
      fb.className = "feedback feedback-success";
      fb.textContent = "Saved " + data.links.length + (data.links.length === 1 ? " link." : " links.") + " They now show under Contact, in the menu and in the footer.";
    } catch (error) {
      fb.className = "feedback feedback-error";
      fb.textContent = error.message;
    }
  });
  ADMIN.onShow("settings", loadSettings);

  /* =================== Settings: support button =================== */

  var supportList = field("support-methods");
  var SUPPORT_TYPES = {
    "mobile-money": "Mobile money", card: "Card payment link (Visa / Mastercard)", bank: "Bank transfer",
    paypal: "PayPal", link: "Other link (Ko-fi etc.)"
  };

  function supportRow(m) {
    var li = el("li", { class: "support-edit" });
    var type = el("select", { "aria-label": "Way to pay" });
    Object.keys(SUPPORT_TYPES).forEach(function (k) { type.appendChild(el("option", { value: k }, SUPPORT_TYPES[k])); });
    type.value = m.type || "mobile-money";
    var inputs = {
      label: el("input", { type: "text", maxlength: "40", placeholder: "Title shown (optional)", "aria-label": "Title shown" }),
      url: el("input", { type: "url", maxlength: "500", placeholder: "https://… payment link", "aria-label": "Payment link" }),
      provider: el("input", { type: "text", maxlength: "40", placeholder: "Network, e.g. MTN MoMo", "aria-label": "Network" }),
      number: el("input", { type: "text", maxlength: "30", placeholder: "Number, e.g. 097 123 4567", "aria-label": "Number", inputmode: "tel" }),
      name: el("input", { type: "text", maxlength: "80", placeholder: "Name it's registered to", "aria-label": "Registered name" }),
      details: el("textarea", { rows: "2", maxlength: "400", placeholder: "Extra details (optional)", "aria-label": "Details" })
    };
    Object.keys(inputs).forEach(function (k) { inputs[k].value = m[k] || ""; inputs[k].setAttribute("data-k", k); });
    function show() {
      var t = type.value;
      inputs.url.hidden = !(t === "card" || t === "paypal" || t === "link");
      inputs.provider.hidden = inputs.number.hidden = inputs.name.hidden = t !== "mobile-money";
      inputs.details.placeholder = t === "bank"
        ? "Bank, account name and number, branch, SWIFT… (leave empty to give them out on request)"
        : "Extra details (optional)";
      inputs.url.placeholder = t === "paypal" ? "https://paypal.me/yourname" : "https://… payment link";
    }
    type.addEventListener("change", show);
    show();
    var remove = ADMIN.button("Remove", function () { li.remove(); });
    var up = ADMIN.button("↑", function () { if (li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); });
    up.setAttribute("aria-label", "Move up");
    var head = el("div", { class: "support-edit-head" });
    head.append(type, up, remove);
    li.appendChild(head);
    Object.keys(inputs).forEach(function (k) { li.appendChild(inputs[k]); });
    return li;
  }

  async function loadSupport() {
    try {
      var data = await MW.api("/admin/support");
      var s = data.support;
      field("support-enabled").checked = Boolean(s.enabled);
      field("support-title").value = s.title || "";
      field("support-message").value = s.message || "";
      supportList.textContent = "";
      (s.methods.length ? s.methods : [{ type: "mobile-money" }]).forEach(function (m) { supportList.appendChild(supportRow(m)); });
    } catch (error) {
      MW.toast(error.message, true);
    }
  }

  field("support-add").addEventListener("click", function () {
    supportList.appendChild(supportRow({ type: "card" }));
  });

  field("support-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var fb = field("support-feedback");
    var methods = Array.prototype.map.call(supportList.children, function (li) {
      var m = { type: li.querySelector("select").value };
      li.querySelectorAll("[data-k]").forEach(function (input) { if (!input.hidden) m[input.getAttribute("data-k")] = input.value.trim(); });
      return m;
    }).filter(function (m) { return m.url || m.number || m.type === "bank"; });
    try {
      var data = await MW.api("/admin/support", {
        method: "PUT",
        json: { enabled: field("support-enabled").checked, title: field("support-title").value, message: field("support-message").value, methods: methods }
      });
      fb.className = "feedback feedback-success";
      fb.textContent = data.support.enabled
        ? "Saved. The button is live on every page (bottom left)."
        : "Saved. The button is hidden until you tick “Show the button on the site”.";
    } catch (error) {
      fb.className = "feedback feedback-error";
      fb.textContent = error.message;
    }
  });
  ADMIN.onShow("settings", loadSupport);
})();
