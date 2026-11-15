/* Draws the suggestion box wherever a page has <div id="suggest-box">. */
(function () {
  var box = document.getElementById("suggest-box");
  if (box && window.MW && window.MW.suggestionBox) window.MW.suggestionBox(box);
  if (box && window.location.hash === "#suggest") {
    window.setTimeout(function () { var s = document.getElementById("suggest"); if (s && !s.hidden) s.scrollIntoView(); }, 600);
  }
})();
