// js/premium.js  -  /hub/premium: what Premium includes, the waitlist, and (for the admin) a way to grant it for testing.
(function () {
  "use strict";
  var MW = window.MW;
  var body = document.getElementById("premium-body");
  if (!MW || !body) return;
  var el = MW.el;

  function mb(n) { return n >= 1000 ? (n / 1000) + " GB" : n + " MB"; }
  function planCard(p, premium) {
    var card = el("div", { class: "premium-plan" + (premium ? " is-premium" : "") });
    card.appendChild(el("h2", {}, p.label));
    card.appendChild(el("p", { class: "mono muted" }, premium ? (p.priceNote || "") : "Free forever"));
    var ul = el("ul");
    ul.appendChild(el("li", {}, "Up to " + p.maxMediaPerPost + " pages or files per post"));
    ul.appendChild(el("li", {}, "Pictures up to " + mb(p.limitsMb.image) + ", videos up to " + mb(p.limitsMb.video) + ", audio up to " + mb(p.limitsMb.audio)));
    (p.perks || []).slice(2).forEach(function (perk) { ul.appendChild(el("li", {}, perk)); });
    if (!premium) ul.appendChild(el("li", {}, "Everything else on Chapterhive: posting, following, chat, collabs"));
    card.appendChild(ul);
    return card;
  }

  Promise.all([MW.me(), MW.api("/premium")]).then(function (r) {
    var user = r[0], info = r[1];
    body.textContent = "";
    var plans = el("div", { class: "premium-plans" });
    plans.append(planCard(info.plans.free, false), planCard(info.plans.premium, true));
    body.appendChild(plans);

    var cta = el("div", { class: "hero-actions" });
    if (info.mine && info.mine.plan === "premium") {
      cta.appendChild(el("p", { class: "feedback feedback-success" }, "You have Premium" + (info.mine.until ? " until " + MW.formatDate(info.mine.until) : "") + ". Style your page in your studio."));
    } else if (!user) {
      cta.appendChild(MW.guestGate("Create a free account to join the Premium waitlist."));
    } else if (info.onWaitlist) {
      cta.appendChild(el("p", { class: "feedback feedback-success" }, "You're on the waitlist. We'll tell you in your bell when Premium launches."));
    } else {
      var join = el("button", { type: "button" }, "Tell me when it launches");
      join.addEventListener("click", function () {
        join.disabled = true;
        MW.api("/premium/waitlist", { method: "POST" }).then(function () {
          join.replaceWith(el("p", { class: "feedback feedback-success" }, "You're on the waitlist!"));
        }).catch(function (e) { MW.toast(e.message, true); join.disabled = false; });
      });
      cta.appendChild(join);
    }
    body.appendChild(cta);

    if (user && user.role === "admin") {
      var admin = el("form", { class: "panel-inset", novalidate: "" });
      admin.appendChild(el("p", { class: "node-label" }, "Admin // premium preview"));
      admin.appendChild(el("p", { class: "muted" }, (info.waitlistCount || 0) + " people on the waitlist. Premium is queued: switch it to Live in Admin → Site features when payments are ready. Meanwhile you can give someone Premium for testing or as a gift."));
      var u = el("input", { type: "text", placeholder: "@username", "aria-label": "Username" });
      var days = el("input", { type: "number", min: "1", max: "3650", value: "30", "aria-label": "Days" });
      var grant = el("button", { type: "submit", class: "btn-small" }, "Give Premium");
      var revoke = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Remove Premium");
      admin.append(u, days, grant, revoke);
      function send(plan) {
        MW.api("/premium/grant", { method: "POST", json: { username: u.value.trim().replace(/^@/, ""), plan: plan, days: Number(days.value) } })
          .then(function () { MW.toast(plan === "premium" ? "Premium given." : "Premium removed."); })
          .catch(function (e) { MW.toast(e.message, true); });
      }
      admin.addEventListener("submit", function (e) { e.preventDefault(); send("premium"); });
      revoke.addEventListener("click", function () { send("free"); });
      body.appendChild(admin);
    }
  }).catch(function (e) {
    body.textContent = "";
    body.appendChild(el("p", { class: "lead" }, e.status === 503 ? "Premium is coming soon. Check back later!" : e.message));
  });
})();
