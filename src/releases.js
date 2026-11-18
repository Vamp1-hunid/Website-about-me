// src/releases.js
// "What's new": every update people should hear about gets an entry here, and it's announced automatically
// (News & updates, the bell and a phone notification) the first time the site starts after it's deployed.
// Each key is posted only once (remembered in release_log), so editing or deleting the announcement in
// Dashboard → Announcements is safe. Set AUTO_ANNOUNCE=off on Render to stop automatic announcements.
//
// Write them like the owner's own announcements: a short, excited title, a friendly line or two with emojis,
// what to tap, and a nudge to try it ("Try it NOW!!!"). Only announce what the audience can actually use.
// audience: "all", or any of "creators", "beta", "staff" joined with commas (admins always see everything).

const db = require("./db");

const RELEASES = [
  {
    key: "v33-filters",
    title: "Find your vibe faster! 🔎",
    body: "The filters on Home got an upgrade ✨ They're open from the start, and you can now pick MORE than one at a time, so manga + comics, or fantasy + horror, all in one feed 📚🎬 Mix and match till you find your thing 😉",
    link: "/hub",
    audience: "all"
  },
  {
    key: "v34-fullscreen",
    title: "Go big or go home! ⛶",
    body: "Every video now has a ⛶ Fullscreen button, iPhones included 📱 On Android it even turns sideways for you. Grab your snacks and watch the whole thing big screen style 🍿🔥",
    link: "/hub",
    audience: "all"
  },
  {
    key: "v32-drafts",
    title: "Never lose a word again ✍️",
    body: "Half-typed comment? Unfinished message? Leave and come back later, it'll still be right where you left it 💾 Drafts now save themselves everywhere: posts, comments and chats 🙌",
    link: "/hub",
    audience: "all"
  },
  {
    key: "v35-share",
    title: "Share the love! 📤",
    body: "Found a post that slaps? Tap ↗ Share to send it straight to your buddies 🐝 or pass it on through WhatsApp, Telegram, Facebook, X, or just copy the link 🔗\n\nSpread the word NOW!!!",
    link: "/hub",
    audience: "all"
  },
  {
    key: "v35-swipe-posts",
    title: "Swipe posts are here! 👉👈",
    body: "Creators can now drop a whole bunch of pictures and clips in ONE post, and you just swipe left and right to see them all 📸🎬\n\nThere's also a new Edit tag for fan edits, promo edits and AMVs, so go flex those editing skills 😎🔥",
    link: "/hub",
    audience: "all"
  },
  {
    key: "v37-music",
    title: "Your posts can have music now! 🎵",
    body: "Creators, give your posts a soundtrack 🎧 Pick a track from our free library or upload your own beats, voice-overs and sounds. Everyone else: tap 🎵 on a post and vibe along 😉🐝\n\nGo add some music NOW!!!",
    link: "/hub",
    audience: "all"
  },
  {
    key: "v37-statuses",
    title: "Statuses just dropped! ⭕",
    body: "Creators can now post statuses that disappear after 24 hours ⏳ Pictures, short clips or text, with music too 🎶 Look for the honey ring 🍯 at the top of Home and tap to watch. Sneak peeks, behind the scenes, chapter countdowns… you name it 😁\n\nCheck them out NOW!!!",
    link: "/hub",
    audience: "all"
  }
];

async function announceReleases() {
  if (String(process.env.AUTO_ANNOUNCE || "").toLowerCase() === "off") return;
  const posted = [];
  for (const r of RELEASES) {
    try {
      const claimed = await db.query("INSERT INTO release_log (key) VALUES ($1) ON CONFLICT (key) DO NOTHING RETURNING key", [r.key]);
      if (!claimed.rows.length) continue; // already announced
      // pushed_at is set now so the regular sender skips these: the phone notification is sent below.
      const made = await db.query(
        "INSERT INTO announcements (title, body, link, audience, pushed_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id",
        [r.title.slice(0, 160), r.body.slice(0, 2000), r.link || "", r.audience || "all"]);
      await db.query("UPDATE release_log SET announcement_id = $1 WHERE key = $2", [made.rows[0].id, r.key]);
      posted.push(Object.assign({ id: made.rows[0].id }, r));
      console.log("Announced what's new:", r.key);
    } catch (e) {
      console.warn("Could not announce " + r.key + ":", e.message);
    }
  }
  if (posted.length) await notifyPhones(posted).catch(function (e) { console.warn("What's-new notification failed:", e.message); });
}

// One phone notification per deploy: a single update gets its own; several become one "🐝 N new things" summary.
async function notifyPhones(posted) {
  const { audienceSql } = require("./announcements");
  const push = require("./push");
  async function people(audience) {
    const who = await db.query(
      `SELECT DISTINCT s.user_id FROM push_subscriptions s JOIN users u ON u.id = s.user_id
        WHERE u.status = 'active' AND ${audienceSql("$1")}`, [audience]);
    return who.rows.map(function (r) { return r.user_id; });
  }
  const forAll = posted.filter(function (r) { return (r.audience || "all") === "all"; });
  const others = posted.filter(function (r) { return (r.audience || "all") !== "all"; });
  if (forAll.length === 1) others.push(forAll.pop());
  if (forAll.length) {
    await push.sendTo(await people("all"), {
      type: "whats-new", title: "🐝 " + forAll.length + " new things on Chapterhive!",
      body: forAll.map(function (r) { return r.title; }).join(" · ").slice(0, 200), link: "/hub/news" });
  }
  for (const r of others) {
    await push.sendTo(await people(r.audience || "all"), {
      type: "announce-" + r.id, title: "📣 " + r.title, body: r.body.slice(0, 200), link: r.link || "/hub/news#announcement-" + r.id });
  }
}

module.exports = { RELEASES, announceReleases };
