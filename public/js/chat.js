// js/chat.js  -  members' chat (/hub/chat, /hub/chat?with=username, /hub/chat?t=<conversation id>)
// Conversations on the left, messages on the right. New messages are fetched every few seconds
// while the page is open and visible.
(function () {
  "use strict";
  var MW = window.MW;
  var layout = document.getElementById("chat-layout");
  if (!MW || !layout) return;
  var el = MW.el;

  var threadsList = document.getElementById("chat-threads");
  var pane = document.getElementById("chat-thread");
  var params = new URLSearchParams(window.location.search);
  var current = null;      // { id, with, lastId }
  var pollTimer = null;
  var listTimer = null;

  function gate(message, extra) {
    var box = document.getElementById("chat-gate");
    box.textContent = "";
    box.appendChild(message);
    if (extra) box.appendChild(extra);
  }

  function initials(name) { return (name || "?").charAt(0).toUpperCase(); }

  function avatar(person) {
    var a = el("span", { class: "chat-avatar", "aria-hidden": "true" });
    if (person && person.avatarUrl) a.appendChild(el("img", { src: person.avatarUrl, alt: "" }));
    else a.textContent = initials(person && (person.displayName || person.username));
    return a;
  }

  // "14:05" today, "Mon" this week, "12 Nov" before that (like Messenger's list).
  function shortTime(iso) {
    var d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (now - d < 6 * 86400000) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }
  function dayLabel(d) {
    var now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return "Today";
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  }
  // On phones the list and the conversation take turns filling the screen.
  function showThreadPane(on) { layout.classList.toggle("in-thread", on); }
  function backButton() {
    var b = el("button", { type: "button", class: "chat-back", "aria-label": "Back to chats" }, "‹");
    b.addEventListener("click", function () {
      stopPolling(); current = null; showThreadPane(false);
      history.replaceState(null, "", "/hub/chat");
      loadThreads().catch(function () {});
    });
    return b;
  }
  function menuButton(items) {
    var wrap = el("div", { class: "chat-menu" });
    var b = el("button", { type: "button", class: "chat-icon-btn", "aria-label": "Conversation options", "aria-expanded": "false" }, "⋯");
    var list = el("div", { class: "chat-menu-list", role: "menu" });
    list.hidden = true;
    items.forEach(function (it) {
      var mi = el("button", { type: "button", role: "menuitem" }, it[0]);
      mi.addEventListener("click", function () { list.hidden = true; b.setAttribute("aria-expanded", "false"); it[1](); });
      list.appendChild(mi);
    });
    b.addEventListener("click", function (e) {
      e.stopPropagation(); list.hidden = !list.hidden; b.setAttribute("aria-expanded", String(!list.hidden));
    });
    document.addEventListener("click", function () { list.hidden = true; b.setAttribute("aria-expanded", "false"); });
    wrap.append(b, list);
    return wrap;
  }

  /* ---------- Conversation list ---------- */

  function loadThreads() {
    return MW.api("/chat/threads").then(function (data) {
      threadsList.textContent = "";
      if (!data.threads.length) {
        threadsList.appendChild(el("li", { class: "muted" }, "No conversations yet."));
      }
      data.threads.forEach(function (t) {
        var li = el("li");
        var b = el("button", { type: "button", class: "chat-thread-btn" + (current && current.id === t.id ? " is-active" : "") });
        b.appendChild(avatar(t.with));
        var text = el("span", { class: "chat-thread-text" });
        var top = el("span", { class: "chat-thread-top" });
        top.appendChild(el("strong", {}, t.with.displayName || t.with.username));
        if (t.lastAt) top.appendChild(el("span", { class: "chat-thread-time" }, shortTime(t.lastAt)));
        text.appendChild(top);
        text.appendChild(el("span", { class: "muted" }, t.preview || ""));
        b.appendChild(text);
        if (t.unread) { b.classList.add("is-unread"); b.appendChild(el("span", { class: "chat-unread", "aria-label": t.unread + " unread" }, String(t.unread))); }
        b.addEventListener("click", function () { openThread(t.id); });
        li.appendChild(b);
        threadsList.appendChild(li);
      });
    });
  }

  document.getElementById("chat-new").addEventListener("submit", function (event) {
    event.preventDefault();
    var input = document.getElementById("chat-new-user");
    var err = document.getElementById("chat-new-error");
    err.textContent = "";
    var username = input.value.trim().replace(/^@/, "");
    if (!username) return;
    startWith(username).then(function () { input.value = ""; }).catch(function (e) { err.textContent = e.message; });
  });

  function startWith(username) {
    return MW.api("/chat/threads", { method: "POST", json: { username: username } }).then(function (d) { return openThread(d.id); });
  }

  /* ---------- One conversation ---------- */

  function sharedCard(s) {
    var a = el("a", { class: "chat-share", href: "/hub/w/" + encodeURIComponent(s.slug) });
    var pic = el("span", { class: "chat-share-pic" });
    if (s.imageUrl) pic.appendChild(el("img", { src: s.imageUrl, alt: "", loading: "lazy" }));
    else pic.textContent = s.hasVideo ? "▶" : "📖";
    a.appendChild(pic);
    var t = el("span", { class: "chat-share-text" });
    t.appendChild(el("span", { class: "mono muted" }, (s.hasVideo ? "▶ Video · " : s.hasAudio ? "♫ Audio · " : "") + MW.categoryName(s.category)));
    t.appendChild(el("strong", {}, s.title));
    if (s.summary) t.appendChild(el("span", { class: "muted" }, s.summary.slice(0, 120)));
    a.appendChild(t);
    return a;
  }

  // Only emoji (up to 3)? Show it big, without a bubble, like Messenger.
  function bigEmoji(text) {
    return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s){1,12}$/u.test(text) && !/[0-9#*]/.test(text) && text.trim().length <= 12;
  }

  function messageItem(m) {
    var li = el("li", { class: "chat-msg" + (m.mine ? " is-mine" : ""), "data-id": String(m.id),
      "data-sender": String(m.mine ? "me" : (m.sender && m.sender.username) || "?"), "data-at": m.createdAt });
    if (!m.mine) { var av = avatar(m.sender); av.classList.add("chat-msg-avatar"); li.appendChild(av); }
    var col = el("div", { class: "chat-msg-col" });
    var bubble = el("div", { class: "chat-bubble", tabindex: "0" });
    if (current && current.group && !m.mine && m.sender) col.appendChild(el("span", { class: "chat-sender" }, m.sender.displayName || m.sender.username));
    if (m.deleted) { bubble.classList.add("is-removed"); bubble.appendChild(el("em", {}, m.mine ? "You removed a message" : "Message removed")); }
    else {
      if (m.body) {
        if (!m.shared && bigEmoji(m.body)) bubble.classList.add("is-emoji");
        bubble.appendChild(el("p", {}, m.body));
      }
      if (m.shared) { bubble.classList.add("has-share"); bubble.appendChild(sharedCard(m.shared)); }
    }
    col.appendChild(bubble);
    // Time and Delete / Report appear when you tap a message, so the conversation stays clean.
    var meta = el("p", { class: "chat-meta" }, new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    if (!m.deleted) {
      var action = el("button", { type: "button", class: "chat-link" }, m.mine ? "Delete" : "Report");
      action.addEventListener("click", function (e) {
        e.stopPropagation();
        if (m.mine) {
          MW.api(msgBase() + m.id, { method: "DELETE" }).then(function () {
            bubble.textContent = ""; bubble.className = "chat-bubble is-removed";
            bubble.appendChild(el("em", {}, "You removed a message"));
            action.remove();
          }).catch(function (err) { MW.toast(err.message, true); });
        } else {
          reportMessage(m, action);
        }
      });
      meta.appendChild(document.createTextNode(" · "));
      meta.appendChild(action);
    }
    col.appendChild(meta);
    li.appendChild(col);
    bubble.addEventListener("click", function (e) {
      if (e.target.closest("a")) return;
      var open = li.classList.toggle("show-meta");
      document.querySelectorAll(".chat-msg.show-meta").forEach(function (o) { if (o !== li) o.classList.remove("show-meta"); });
      if (!open) { var r = li.querySelector(".chat-report"); if (r) r.remove(); }
    });
    return li;
  }

  function reportMessage(m, button) {
    var reasons = [["harassment", "Harassment or bullying"], ["explicit", "Sexual or graphic"], ["hate", "Hate or violence"],
      ["scam", "Scam or asking for money"], ["spam", "Spam"], ["self-harm", "Worried about their safety"], ["other", "Something else"]];
    var form = el("form", { class: "chat-report" });
    var select = el("select", { "aria-label": "What's wrong?" });
    reasons.forEach(function (r) { select.appendChild(el("option", { value: r[0] }, r[1])); });
    var send = el("button", { type: "submit", class: "btn-small" }, "Send report");
    var cancel = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Cancel");
    form.append(select, send, cancel);
    button.closest(".chat-msg-col").appendChild(form);
    cancel.addEventListener("click", function () { form.remove(); });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      MW.api(msgBase() + m.id + "/report", { method: "POST", json: { reason: select.value } }).then(function () {
        form.remove();
        MW.toast("Thanks. The report went to the moderators.");
      }).catch(function (e) { MW.toast(e.message, true); });
    });
  }

  function convBase() { return current && current.group ? "/chat/groups/" : "/chat/threads/"; }
  function msgBase() { return current && current.group ? "/chat/groups/messages/" : "/chat/messages/"; }

  /* ---------- Group chats ---------- */
  function loadGroups() {
    if (!MW.feature("group_chats")) return Promise.resolve();
    return MW.api("/chat/groups").then(function (d) {
      var box = document.getElementById("chat-groups");
      if (!box) {
        box = el("ul", { id: "chat-groups", class: "chat-threads" });
        threadsList.before(el("p", { class: "chat-list-label mono muted" }, "Groups"));
        threadsList.before(box);
        threadsList.before(el("p", { class: "chat-list-label mono muted" }, "Direct messages"));
      }
      box.textContent = "";
      var add = el("li");
      var nb = el("button", { type: "button", class: "chat-thread-btn chat-new-group" }, "＋ New group");
      nb.addEventListener("click", newGroupForm);
      add.appendChild(nb);
      box.appendChild(add);
      d.groups.forEach(function (g) {
        var li = el("li");
        var b = el("button", { type: "button", class: "chat-thread-btn" + (current && current.group && current.id === g.id ? " is-active" : "") });
        b.appendChild(el("span", { class: "chat-avatar", "aria-hidden": "true" }, "👥"));
        var text = el("span", { class: "chat-thread-text" });
        text.appendChild(el("strong", {}, g.name));
        text.appendChild(el("span", { class: "muted" }, g.preview || g.members + " members"));
        b.appendChild(text);
        if (g.unread) b.appendChild(el("span", { class: "chat-unread" }, String(g.unread)));
        b.addEventListener("click", function () { openGroup(g.id); });
        li.appendChild(b);
        box.appendChild(li);
      });
    }).catch(function () {});
  }

  function newGroupForm() {
    stopPolling();
    current = null;
    pane.textContent = "";
    showThreadPane(true);
    pane.appendChild(backButton());
    var f = el("form", { class: "chat-group-form", novalidate: "" });
    f.appendChild(el("h2", {}, "New group chat"));
    var name = el("input", { type: "text", placeholder: "Group name, e.g. Book club", maxlength: "60", "aria-label": "Group name" });
    var people = el("input", { type: "text", placeholder: "@username, @username …", "aria-label": "Members", autocapitalize: "none", spellcheck: "false" });
    var go = el("button", { type: "submit" }, "Create group");
    var fb = el("p", { class: "feedback", "aria-live": "polite" });
    f.append(name, people, el("p", { class: "muted" }, "Up to 30 people. Everyone must be allowed to receive chats from you (and teen accounts only join teen groups)."), go, fb);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      go.disabled = true;
      MW.api("/chat/groups", { method: "POST", json: { name: name.value, usernames: people.value.split(/[\s,]+/).filter(Boolean) } }).then(function (d) {
        if (d.skipped && d.skipped.length) MW.toast("Not added: " + d.skipped.join("; "), true);
        loadGroups();
        openGroup(d.id);
      }).catch(function (err) { fb.className = "feedback feedback-error"; fb.textContent = err.message; go.disabled = false; });
    });
    pane.appendChild(f);
    name.focus();
  }

  function openGroup(id) {
    stopPolling();
    return MW.api("/chat/groups/" + id).then(function (data) {
      current = { id: data.id, group: true, lastId: 0 };
      history.replaceState(null, "", "/hub/chat?g=" + data.id);
      pane.textContent = "";
      showThreadPane(true);
      var head = el("div", { class: "chat-head" });
      head.appendChild(backButton());
      head.appendChild(el("span", { class: "chat-avatar", "aria-hidden": "true" }, "👥"));
      var title = el("div", { class: "chat-group-title" });
      title.appendChild(el("strong", {}, data.name));
      title.appendChild(el("span", { class: "muted" }, data.members.map(function (m) { return "@" + m.username; }).join(", ")));
      head.appendChild(title);
      var opts = [];
      if (data.isOwner) opts.push(["＋ Add someone", function () {
        var u = window.prompt("Username to add:");
        if (!u) return;
        MW.api("/chat/groups/" + data.id + "/members", { method: "POST", json: { username: u.replace(/^@/, "") } })
          .then(function () { openGroup(data.id); }).catch(function (e) { MW.toast(e.message, true); });
      }]);
      opts.push(["Leave group", function () {
        if (!window.confirm("Leave " + data.name + "?")) return;
        MW.me().then(function (u) {
          MW.api("/chat/groups/" + data.id + "/members/" + encodeURIComponent(u.username), { method: "DELETE" }).then(function () {
            pane.textContent = ""; current = null; showThreadPane(false); loadGroups();
          });
        });
      }]);
      head.appendChild(menuButton(opts));
      pane.appendChild(head);
      pane.appendChild(el("ol", { class: "chat-messages", id: "chat-messages" }));
      addMessages(data.messages);
      pane.appendChild(composer());
      loadGroups();
      startPolling();
    }).catch(function (e) { pane.textContent = ""; pane.appendChild(el("p", { class: "error" }, e.message)); });
  }

  function openThread(id) {
    stopPolling();
    return MW.api("/chat/threads/" + id).then(function (data) {
      current = { id: data.id, with: data.with, lastId: 0, group: false };
      history.replaceState(null, "", "/hub/chat?t=" + data.id);
      pane.textContent = "";

      showThreadPane(true);
      var head = el("div", { class: "chat-head" });
      head.appendChild(backButton());
      head.appendChild(avatar(data.with));
      var who = el("a", { class: "chat-head-name", href: "/hub/u/" + encodeURIComponent(data.with.username) });
      who.appendChild(el("strong", {}, data.with.displayName || data.with.username));
      who.appendChild(el("span", { class: "muted" }, "@" + data.with.username));
      head.appendChild(who);
      var unblocking = Boolean(data.blockedByMe);
      head.appendChild(menuButton([
        ["View profile", function () { window.location.href = "/hub/u/" + encodeURIComponent(data.with.username); }],
        [unblocking ? "Unblock" : "Block @" + data.with.username, function () {
          if (!unblocking && !window.confirm("Block @" + data.with.username + "? They won't be able to message you.")) return;
          var req = unblocking
            ? MW.api("/chat/blocks/" + encodeURIComponent(data.with.username), { method: "DELETE" })
            : MW.api("/chat/blocks", { method: "POST", json: { username: data.with.username } });
          req.then(function () { openThread(data.id); }).catch(function (e) { MW.toast(e.message, true); });
        }]
      ]));
      pane.appendChild(head);

      var list = el("ol", { class: "chat-messages", id: "chat-messages" });
      pane.appendChild(list);
      addMessages(data.messages);

      if (data.blockedByMe) {
        pane.appendChild(el("p", { class: "chat-blocked muted" }, "You blocked this member. Unblock them from the ⋯ menu to send messages."));
      } else {
        pane.appendChild(composer());
      }
      loadThreads();
      startPolling();
    }).catch(function (e) {
      pane.textContent = "";
      pane.appendChild(el("p", { class: "error" }, e.message));
    });
  }

  function addMessages(messages) {
    var list = document.getElementById("chat-messages");
    if (!list) return;
    var nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    messages.forEach(function (m) {
      if (list.querySelector("[data-id='" + m.id + "']")) return;
      var empty = list.querySelector("[data-empty]"); if (empty) empty.remove();
      var item = messageItem(m);
      var prev = list.querySelector(".chat-msg:last-of-type");
      var at = new Date(m.createdAt);
      var prevAt = prev ? new Date(prev.getAttribute("data-at")) : null;
      if (!prevAt || prevAt.toDateString() !== at.toDateString()) {
        list.appendChild(el("li", { class: "chat-day" }, dayLabel(at)));
        prev = null;
      } else if (at - prevAt > 20 * 60000) {
        list.appendChild(el("li", { class: "chat-day" }, at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
        prev = null;
      }
      // Messages from the same person in a row hug together, with one avatar at the bottom.
      if (prev && prev.getAttribute("data-sender") === item.getAttribute("data-sender")) {
        prev.classList.add("has-next");
        item.classList.add("is-cont");
      }
      list.appendChild(item);
      current.lastId = Math.max(current.lastId, m.id);
    });
    if (!list.children.length) list.appendChild(el("li", { class: "chat-empty", "data-empty": "1" }, "Say hello 👋 You can also share a work you're enjoying."));
    if (nearBottom || messages.length) list.scrollTop = list.scrollHeight;
  }

  function composer() {
    var form = el("form", { class: "chat-compose", novalidate: "" });
    var area = el("textarea", { rows: "1", maxlength: "2000", placeholder: "Message", "aria-label": "Message" });
    var send = el("button", { type: "submit", class: "chat-send", "aria-label": "Send a like" }, "👍");
    form.append(area, send);
    function paint() {
      area.style.height = "auto";
      area.style.height = Math.min(area.scrollHeight, 140) + "px";
      var typed = Boolean(area.value.trim());
      send.textContent = typed ? "➤" : "👍";
      send.classList.toggle("is-like", !typed);
      send.setAttribute("aria-label", typed ? "Send" : "Send a like");
    }
    area.addEventListener("input", paint);
    area.addEventListener("keydown", function (event) {
      // Enter sends on computers; on phones Enter makes a new line and you tap the send button.
      if (event.key === "Enter" && !event.shiftKey && !("ontouchstart" in window)) { event.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var body = area.value.trim() || "👍";
      send.disabled = true;
      MW.api(convBase() + current.id + "/messages", { method: "POST", json: { body: body } }).then(function (d) {
        area.value = ""; paint();
        addMessages([d.message]);
        loadThreads();
        if (current.group) loadGroups();
      }).catch(function (e) { MW.toast(e.message, true); }).then(function () { send.disabled = false; area.focus(); });
    });
    return form;
  }

  /* ---------- Polling ---------- */

  function poll() {
    if (!current || document.hidden) return;
    MW.api(convBase() + current.id + "?after=" + current.lastId).then(function (d) {
      if (d.messages.length) { addMessages(d.messages); loadThreads(); }
    }).catch(function () {});
  }
  function startPolling() { pollTimer = setInterval(poll, 4000); }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  /* ---------- Start ---------- */

  MW.me().then(function (user) {
    if (!user) {
      gate(MW.guestGate("Chat is for members. Create a free account to message other readers and share what you're enjoying."));
      return;
    }
    if (!MW.feature("chat")) {
      gate(el("p", { class: "muted" }, "Chat isn't switched on yet."));
      return;
    }
    var acc = MW.account && MW.account.account;
    if (acc && !acc.hasBirthDate) {
      var p = el("p", {}, "Before you can chat, add your date of birth in ");
      p.appendChild(el("a", { href: "/hub/profile#details-panel" }, "Account settings"));
      p.appendChild(document.createTextNode(". It keeps teen accounts and adult accounts in separate spaces, and it's never shown to anyone."));
      gate(p);
      return;
    }
    layout.hidden = false;
    loadGroups();
    loadThreads().then(function () {
      if (params.get("with")) {
        startWith(params.get("with")).catch(function (e) { document.getElementById("chat-new-error").textContent = e.message; });
      } else if (params.get("t")) {
        openThread(Number(params.get("t")));
      } else if (params.get("g")) {
        openGroup(Number(params.get("g")));
      }
    });
    listTimer = setInterval(function () { if (!document.hidden) { loadThreads().catch(function () {}); loadGroups(); } }, 20000);
  });
})();
