// src/verses.js
// The daily Bible verse. The Good News Translation is copyrighted (American Bible Society), so the site
// shows the verse reference with a short theme and links to the full verse in the Good News Translation;
// it does not copy the verse text. The admin can override today's verse (and add text they have permission to use).

const db = require("./db");
const devotions = require("./devotions");

// A year of encouraging passages, picked by day of the year.
const REFS = [
  ["John 3:16", "God's love"], ["Psalm 23:1", "The Lord is my shepherd"], ["Philippians 4:13", "Strength"], ["Jeremiah 29:11", "Hope and a future"],
  ["Proverbs 3:5-6", "Trust"], ["Isaiah 40:31", "Renewed strength"], ["Romans 8:28", "All things work for good"], ["Joshua 1:9", "Courage"],
  ["Matthew 11:28", "Rest"], ["Psalm 46:1", "God our refuge"], ["2 Timothy 1:7", "Power, love and self-control"], ["1 Corinthians 13:4-7", "Love is patient"],
  ["Philippians 4:6-7", "Peace instead of worry"], ["Psalm 119:105", "A light for my path"], ["Galatians 5:22-23", "Fruit of the Spirit"],
  ["Colossians 3:23", "Work with all your heart"], ["Romans 12:2", "Be transformed"], ["Matthew 5:14-16", "Light of the world"], ["Psalm 139:14", "Wonderfully made"],
  ["Isaiah 41:10", "Do not be afraid"], ["Lamentations 3:22-23", "New every morning"], ["Micah 6:8", "Act justly, love mercy"], ["James 1:5", "Ask for wisdom"],
  ["Hebrews 11:1", "Faith"], ["Ephesians 2:10", "Created for good works"], ["Psalm 37:4", "Delight in the Lord"], ["Proverbs 16:3", "Commit your work"],
  ["Matthew 6:33", "Seek first"], ["1 Peter 5:7", "Cast your cares"], ["Psalm 121:1-2", "Help comes from the Lord"], ["Romans 15:13", "Overflow with hope"],
  ["Zephaniah 3:17", "He rejoices over you"], ["Ecclesiastes 3:1", "A time for everything"], ["Psalm 34:18", "Close to the broken-hearted"], ["John 14:27", "My peace I give you"],
  ["2 Corinthians 5:17", "A new creation"], ["Proverbs 18:10", "A strong tower"], ["Isaiah 26:3", "Perfect peace"], ["Psalm 27:1", "Whom shall I fear?"],
  ["Matthew 7:7", "Ask, seek, knock"], ["1 John 4:18", "Love drives out fear"], ["Psalm 91:1-2", "Shelter of the Most High"], ["Romans 5:8", "While we were still sinners"],
  ["John 16:33", "I have overcome the world"], ["Deuteronomy 31:6", "He will never leave you"], ["Psalm 100:4-5", "Enter with thanksgiving"], ["Proverbs 17:17", "A friend loves at all times"],
  ["Hebrews 12:1-2", "Run the race"], ["Isaiah 43:2", "Through the waters"], ["Psalm 16:11", "Joy in his presence"], ["Mark 10:27", "All things are possible"],
  ["Ephesians 4:32", "Be kind"], ["1 Thessalonians 5:16-18", "Always be joyful"], ["Psalm 55:22", "Leave your troubles with him"], ["Nehemiah 8:10", "The joy of the Lord"],
  ["John 15:5", "The vine and the branches"], ["Psalm 30:5", "Joy comes in the morning"], ["Romans 8:38-39", "Nothing can separate us"], ["Proverbs 4:23", "Guard your heart"],
  ["Matthew 5:9", "Peacemakers"], ["Psalm 145:18", "Near to all who call"]
];

function dayOfYear(d) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000);
}

function link(ref) {
  return "https://www.biblegateway.com/passage/?search=" + encodeURIComponent(ref) + "&version=GNT";
}

async function today() {
  const now = new Date(Date.now() + 2 * 3600000); // Zambian time
  const override = await db.query("SELECT value FROM app_settings WHERE key = 'verse_override'");
  if (override.rows.length) {
    try {
      const v = JSON.parse(override.rows[0].value);
      if (v.date === now.toISOString().slice(0, 10)) {
        const extra = devotions.forReference(v.reference) || {};
        return { reference: v.reference, theme: v.theme || "", text: v.text || "", link: link(v.reference), translation: "Good News Translation",
          devotion: v.devotion || extra.devotion || "", encouragement: v.encouragement || extra.encouragement || "", prayer: v.prayer || extra.prayer || "" };
      }
    } catch (e) { /* ignore */ }
  }
  const pick = REFS[dayOfYear(now) % REFS.length];
  const extra = devotions.forReference(pick[0]) || {};
  return { reference: pick[0], theme: pick[1], text: "", link: link(pick[0]), translation: "Good News Translation",
    devotion: extra.devotion || "", encouragement: extra.encouragement || "", prayer: extra.prayer || "" };
}

module.exports = { today, REFS };
