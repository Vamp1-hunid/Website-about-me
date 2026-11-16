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
        text.appendChild(el("strong", {}, t.with.displayName || t.with.username));
        text.appendChild(el("span", { class: "muted" }, t.preview || ""));
        b.appendChild(text);
        if (t.unread) b.appendChild(el("span", { class: "chat-unread", "aria-label": t.unread + " unread" }, String(t.unread)));
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

  function messageItem(m) {
    var li = el("li", { class: "chat-msg" + (m.mine ? " is-mine" : ""), "data-id": String(m.id) });
    var bubble = el("div", { class: "chat-bubble" });
    if (current && current.group && !m.mine && m.sender) bubble.appendChild(el("span", { class: "chat-sender" }, m.sender.displayName || m.sender.username));
    if (m.deleted) bubble.appendChild(el("em", { class: "muted" }, "Message removed"));
    else {
      if (m.body) bubble.appendChild(el("p", {}, m.body));
      if (m.shared) bubble.appendChild(sharedCard(m.shared));
    }
    li.appendChild(bubble);
    var meta = el("p", { class: "chat-meta mono muted" }, MW.formatDateTime(m.createdAt));
    if (!m.deleted) {
      var action = el("button", { type: "button", class: "chat-link" }, m.mine ? "Delete" : "Report");
      action.addEventListener("click", function () {
        if (m.mine) {
          MW.api(msgBase() + m.id, { method: "DELETE" }).then(function () {
            bubble.textContent = "";
            bubble.appendChild(el("em", { class: "muted" }, "Message removed"));
            action.remove();
          }).catch(function (e) { MW.toast(e.message, true); });
        } else {
          reportMessage(m, action);
        }
      });
      meta.appendChild(document.createTextNode(" · "));
      meta.appendChild(action);
    }
    li.appendChild(meta);
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
    button.parentNode.after(form);
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
      var head = el("div", { class: "chat-head" });
      head.appendChild(el("span", { class: "chat-avatar", "aria-hidden": "true" }, "👥"));
      var title = el("div", { class: "chat-group-title" });
      title.appendChild(el("strong", {}, data.name));
      title.appendChild(el("span", { class: "muted" }, data.members.map(function (m) { return "@" + m.username; }).join(", ")));
      head.appendChild(title);
      if (data.isOwner) {
        var addBtn = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "＋ Add");
        addBtn.addEventListener("click", function () {
          var u = window.prompt("Username to add:");
          if (!u) return;
          MW.api("/chat/groups/" + data.id + "/members", { method: "POST", json: { username: u.replace(/^@/, "") } })
            .then(function () { openGroup(data.id); }).catch(function (e) { MW.toast(e.message, true); });
        });
        head.appendChild(addBtn);
      }
      var leave = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Leave");
      leave.addEventListener("click", function () {
        if (!window.confirm("Leave " + data.name + "?")) return;
        MW.me().then(function (u) {
          MW.api("/chat/groups/" + data.id + "/members/" + encodeURIComponent(u.username), { method: "DELETE" }).then(function () {
            pane.textContent = ""; current = null; loadGroups();
          });
        });
      });
      head.appendChild(leave);
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

      var head = el("div", { class: "chat-head" });
      head.appendChild(avatar(data.with));
      var who = el("a", { href: "/hub/u/" + encodeURIComponent(data.with.username) }, (data.with.displayName || data.with.username) + " · @" + data.with.username);
      head.appendChild(who);
      var block = el("button", { type: "button", class: "btn btn-ghost btn-small" }, data.blockedByMe ? "Unblock" : "Block");
      block.addEventListener("click", function () {
        var unblocking = block.textContent === "Unblock";
        if (!unblocking && !window.confirm("Block @" + data.with.username + "? They won't be able to message you.")) return;
        var req = unblocking
          ? MW.api("/chat/blocks/" + encodeURIComponent(data.with.username), { method: "DELETE" })
          : MW.api("/chat/blocks", { method: "POST", json: { username: data.with.username } });
        req.then(function () { openThread(data.id); }).catch(function (e) { MW.toast(e.message, true); });
      });
      head.appendChild(block);
      pane.appendChild(head);

      var list = el("ol", { class: "chat-messages", id: "chat-messages" });
      pane.appendChild(list);
      addMessages(data.messages);

      if (data.blockedByMe) {
        pane.appendChild(el("p", { class: "muted" }, "You blocked this member. Unblock them to send messages."));
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
    var nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    messages.forEach(function (m) {
      if (list.querySelector("[data-id='" + m.id + "']")) return;
      list.appendChild(messageItem(m));
      current.lastId = Math.max(current.lastId, m.id);
    });
    if (!list.children.length) list.appendChild(el("li", { class: "muted chat-empty", "data-empty": "1" }, "Say hello! You can also share a work you're enjoying."));
    else { var empty = list.querySelector("[data-empty]"); if (empty && messages.length) empty.remove(); }
    if (nearBottom || messages.length) list.scrollTop = list.scrollHeight;
  }

  function composer() {
    var form = el("form", { class: "chat-compose", novalidate: "" });
    var area = el("textarea", { rows: "2", maxlength: "2000", placeholder: "Write a message…", "aria-label": "Message" });
    var send = el("button", { type: "submit" }, "Send");
    form.append(area, send);
    area.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var body = area.value.trim();
      if (!body) return;
      send.disabled = true;
      MW.api(convBase() + current.id + "/messages", { method: "POST", json: { body: body } }).then(function (d) {
        area.value = "";
        addMessages([d.message]);
        loadThreads();
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
