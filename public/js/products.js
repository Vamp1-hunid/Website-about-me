// js/products.js
// "More products by us" (/products): other projects with a picture, status, description and link.

(function () {
  "use strict";

  var MW = window.MW;
  var list = document.getElementById("product-list");
  if (!list || !MW) return;
  var el = MW.el;

  MW.productCard = function (p, full) {
    var card = el("article", { class: "product-card", id: "product-" + p.slug });
    var pic = el("div", { class: "product-image" });
    if (p.imageUrl) pic.appendChild(el("img", { src: p.imageUrl, alt: "", loading: "lazy" }));
    else pic.appendChild(el("span", { "aria-hidden": "true" }, p.name.charAt(0)));
    card.appendChild(pic);
    var text = el("div", { class: "product-text" });
    if (p.status) text.appendChild(el("span", { class: "sticker sticker-status" }, p.status));
    text.appendChild(el("h2", {}, p.name));
    if (p.tagline) text.appendChild(el("p", { class: "lead" }, p.tagline));
    if (full && p.description && MW.renderMarkup) {
      var prose = el("div", { class: "prose" });
      MW.renderMarkup(prose, p.description);
      text.appendChild(prose);
    }
    if (p.link) {
      var a = el("a", { class: "btn", href: p.link, target: "_blank", rel: "noopener" }, p.linkLabel || "Visit");
      text.appendChild(a);
    } else if (!full) {
      text.appendChild(el("a", { class: "btn btn-ghost btn-small", href: "/products#product-" + p.slug }, "Read more"));
    }
    card.appendChild(text);
    return card;
  };

  MW.api("/products")
    .then(function (data) {
      list.textContent = "";
      if (!data.products.length) {
        list.appendChild(el("p", { class: "empty" }, "Nothing here yet. Check back soon."));
        return;
      }
      data.products.forEach(function (p) { list.appendChild(MW.productCard(p, true)); });
      if (window.location.hash) {
        var target = document.querySelector(window.location.hash);
        if (target) target.scrollIntoView();
      }
    })
    .catch(function (error) {
      list.textContent = "";
      list.appendChild(el("p", { class: "empty" }, error.message));
    });
})();
