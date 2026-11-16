// src/calendar.js
// Holidays for the site calendar and seasonal themes.
//  - Zambian public holidays (Public Holidays Act). When one falls on a Sunday, the Monday after is also a holiday.
//    The President can add days by gazette (e.g. election days): the admin adds those as site events.
//  - International days relevant to readers and creators.
// Each holiday may name a "theme" the site uses to decorate itself on that day.

function easterSunday(year) {
  // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
function utc(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }
function addDays(date, n) { return new Date(date.getTime() + n * 86400000); }
function firstWeekday(y, m, weekday) { // weekday 0=Sun..6=Sat
  const d = utc(y, m, 1);
  return addDays(d, (weekday - d.getUTCDay() + 7) % 7);
}
function iso(d) { return d.toISOString().slice(0, 10); }

function zambian(year) {
  const easter = easterSunday(year);
  const heroes = firstWeekday(year, 7, 1);
  const list = [
    [utc(year, 1, 1), "New Year's Day", "🎆", "newyear"],
    [utc(year, 3, 8), "International Women's Day", "💜", "women"],
    [utc(year, 3, 12), "Youth Day", "🌟", "youth"],
    [addDays(easter, -2), "Good Friday", "✝️", "easter"],
    [addDays(easter, -1), "Holy Saturday", "✝️", "easter"],
    [addDays(easter, 1), "Easter Monday", "🐣", "easter"],
    [utc(year, 4, 28), "Kenneth Kaunda Day", "🇿🇲", "zambia"],
    [utc(year, 5, 1), "Labour Day", "🛠️", null],
    [utc(year, 5, 25), "Africa Freedom Day", "🌍", "africa"],
    [heroes, "Heroes' Day", "🇿🇲", "zambia"],
    [addDays(heroes, 1), "Unity Day", "🤝", "zambia"],
    [firstWeekday(year, 8, 1), "Farmers' Day", "🌾", null],
    [utc(year, 10, 18), "National Day of Prayer", "🙏", "prayer"],
    [utc(year, 10, 24), "Independence Day", "🇿🇲", "independence"],
    [utc(year, 12, 25), "Christmas Day", "🎄", "christmas"]
  ];
  const out = [];
  list.forEach(function (h) {
    out.push({ date: iso(h[0]), title: h[1], emoji: h[2], theme: h[3], kind: "zambia" });
    if (h[0].getUTCDay() === 0 && !/Saturday|Easter/.test(h[1])) {
      out.push({ date: iso(addDays(h[0], 1)), title: h[1] + " (observed)", emoji: h[2], theme: h[3], kind: "zambia" });
    }
  });
  return out;
}

function international(year) {
  return [
    [1, 1, "New Year", "🎉", "newyear"], [2, 14, "Valentine's Day", "💌", "valentine"], [2, 21, "International Mother Language Day", "🗣️", null],
    [3, 20, "International Day of Happiness", "😊", null], [3, 21, "World Poetry Day", "🪶", "poetry"], [3, 27, "World Theatre Day", "🎭", null],
    [4, 2, "International Children's Book Day", "🧸", "books"], [4, 23, "World Book Day", "📚", "books"], [4, 29, "International Dance Day", "💃", null],
    [5, 3, "World Press Freedom Day", "📰", null], [6, 1, "Global Day of Parents", "👪", null], [6, 21, "World Music Day", "🎵", "music"],
    [7, 30, "International Day of Friendship", "🫶", null], [8, 12, "International Youth Day", "🌟", "youth"], [9, 8, "International Literacy Day", "📖", "books"],
    [9, 21, "International Day of Peace", "🕊️", null], [10, 1, "International Day of Older Persons", "👵", null], [10, 10, "World Mental Health Day", "💚", null],
    [10, 28, "International Animation Day", "✨", "animation"], [10, 31, "Halloween", "🎃", "halloween"], [11, 20, "World Children's Day", "🧒", null],
    [12, 24, "Christmas Eve", "🎄", "christmas"], [12, 31, "New Year's Eve", "🎇", "newyear"]
  ].map(function (d) { return { date: iso(utc(year, d[0], d[1])), title: d[2], emoji: d[3], theme: d[4], kind: "international" }; });
}

function holidays(year) {
  return zambian(year).concat(international(year)).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}

module.exports = { holidays, easterSunday };
