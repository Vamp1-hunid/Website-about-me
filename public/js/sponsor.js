/* public/js/sponsor.js  -  /hub/sponsor: the business page for sponsors, advertisers and investors */
(function () {
  "use strict";
  var MW = window.MW;
  if (!MW) return;
  var el = MW.el;
  var $ = function (id) { return document.getElementById(id); };

  var DEFAULT_OFFERS = [
    { name: "Sponsor a creator", price: "", perks: "Back a creator or a series you believe in. Your brand is credited on their work, with admin approval." },
    { name: "Platform sponsor", price: "", perks: "Support Chapterhive itself and be credited across the platform as it grows." },
    { name: "Advertising", price: "", perks: "Approved, clearly labelled placements in front of a young creative audience." },
    { name: "Invest or partner", price: "", perks: "Talk to the founder about investment, licensing or a partnership." }
  ];

  MW.api("/sponsor").then(function (d) {
    var s = d.sponsor;
    $("sp-headline").textContent = s.headline;
    $("sp-pitch").textContent = s.pitch;
    ["sp-ways", "contact-details", "enquire"].forEach(function (id) { $(id).hidden = false; });

    if (s.stats) {
      var box = $("sp-stats");
      [["creators", "creators"], ["members", "members"], ["works", "works published"], ["follows", "follows"]].forEach(function (k) {
        var c = el("div", { class: "sponsor-stat" });
        c.appendChild(el("strong", {}, String(s.stats[k[0]] || 0)));
        c.appendChild(document.createTextNode(k[1]));
        box.appendChild(c);
      });
      box.hidden = false;
    }

    var tiers = s.tiers && s.tiers.length ? s.tiers : DEFAULT_OFFERS;
    tiers.forEach(function (t) {
      var c = el("div", { class: "sponsor-offer" });
      c.appendChild(el("h3", {}, t.name));
      if (t.price) c.appendChild(el("p", { class: "mono" }, t.price));
      if (t.perks) c.appendChild(el("p", {}, t.perks));
      $("sp-tiers").appendChild(c);
    });

    var c = s.contact || {};
    var box2 = $("sp-contact");
    if (c.name) box2.appendChild(el("p", {}, c.name + (c.role ? " · " + c.role : "")));
    function line(label, href, textValue) {
      var p = el("p");
      p.appendChild(el("strong", {}, label + ": "));
      var a = el("a", { href: href }, textValue);
      if (/^https:/.test(href)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
      p.appendChild(a);
      box2.appendChild(p);
    }
    if (c.email) line("Email", "mailto:" + c.email, c.email);
    if (c.phone) line("Phone", "tel:" + c.phone.replace(/\s+/g, ""), c.phone);
    if (c.whatsapp) line("WhatsApp", "https://wa.me/" + c.whatsapp.replace(/[^0-9]/g, ""), c.whatsapp);
    if (c.linkedin) line("LinkedIn", c.linkedin, c.linkedin.replace(/^https:\/\/(www\.)?/, ""));
    if (c.website) line("Website", c.website, c.website.replace(/^https:\/\/(www\.)?/, ""));
    if (!box2.children.length) box2.appendChild(el("p", { class: "muted" }, "Use the enquiry form below and we'll get back to you by email."));
  }).catch(function () {
    // When the page is switched off, the site already replaced it with a notice, so these may be gone.
    if ($("sp-unavailable")) $("sp-unavailable").hidden = false;
    if ($("sp-pitch")) $("sp-pitch").textContent = "";
  });

  var form = $("enquiry-form");
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var fb = $("eq-feedback");
    var data = {};
    ["name", "company", "email", "interest", "message", "website"].forEach(function (k) { data[k] = form.elements[k].value; });
    var problems = [];
    if (!data.name.trim()) problems.push({ field: "name", message: "Please enter your name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim())) problems.push({ field: "email", message: "Please enter a valid email address." });
    if (data.message.trim().length < 20) problems.push({ field: "message", message: "Tell us a little more (at least 20 characters)." });
    MW.showProblems(form, problems);
    if (problems.length) { fb.className = "feedback feedback-error"; fb.textContent = "Please fix the highlighted fields."; return; }
    var button = form.querySelector("button[type='submit']");
    button.disabled = true;
    MW.api("/sponsor/enquiry", { method: "POST", json: data }).then(function () {
      form.reset();
      fb.className = "feedback feedback-success";
      fb.textContent = "Thank you! Your enquiry has been sent. Expect a reply by email.";
    }).catch(function (e) {
      MW.showProblems(form, (e.data && e.data.problems) || []);
      fb.className = "feedback feedback-error";
      fb.textContent = e.message;
    }).then(function () { button.disabled = false; });
  });
})();
