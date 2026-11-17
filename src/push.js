// src/push.js
// Phone notifications, like WhatsApp: when something lands in someone's bell, every device where they
// turned on notifications gets a pop-up, even with the app closed. Uses standard Web Push, which works
// in the installed app (and the Play Store app later) on Android, on PCs, and on iPhones with the app
// added to the Home Screen.
//
// Keys: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on Render if you like; otherwise a key pair is made
// once and kept in the database (app_settings), so it survives restarts and deploys.

const db = require("./db");

// Loaded on first use, and never allowed to crash the site: if the library can't load, phone
// notifications just stay off and the bell keeps working.
let webpushLib;
function lib() {
  if (webpushLib === undefined) {
    try { webpushLib = require("web-push"); } catch (e) { console.warn("Phone notifications are off:", e.message); webpushLib = null; }
  }
  if (!webpushLib) throw new Error("Phone notifications aren't available on this server.");
  return webpushLib;
}

let ready = null;

async function keys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const { rows } = await db.query("SELECT value FROM app_settings WHERE key = 'vapid_keys'");
  if (rows.length) return JSON.parse(rows[0].value);
  const made = lib().generateVAPIDKeys();
  await db.query("INSERT INTO app_settings (key, value) VALUES ('vapid_keys', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify(made)]);
  const again = await db.query("SELECT value FROM app_settings WHERE key = 'vapid_keys'");
  return JSON.parse(again.rows[0].value);
}

function setup() {
  if (!ready) {
    ready = keys().then(function (k) {
      const contact = (process.env.CONTACT_EMAIL || "").trim();
      lib().setVapidDetails(contact ? "mailto:" + contact : (process.env.PUBLIC_URL || "https://mulenga-mwamba-website.onrender.com"), k.publicKey, k.privateKey);
      return k;
    }).catch(function (e) { ready = null; throw e; });
  }
  return ready;
}

async function publicKey() { return (await setup()).publicKey; }

// Sends to every device of these people. Never throws: the bell still works if a push fails.
async function sendTo(userIds, n) {
  try {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (!ids.length) return;
    await setup();
    const { rows } = await db.query("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY ($1::int[])", [ids]);
    if (!rows.length) return;
    const payload = JSON.stringify({
      title: String(n.title || "Chapterhive").slice(0, 120),
      body: String(n.body || "").slice(0, 240),
      url: n.link || "/hub",
      tag: n.type || "info",
      at: Date.now()
    });
    await Promise.all(rows.map(function (s) {
      return lib().sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: "high" })
        .catch(function (err) {
          // The phone unsubscribed or the app was removed: forget that device.
          // 401/403: the device signed up with an older key (e.g. after VAPID keys changed), so it can never
          // receive again. Forget it too; the app signs the device up again with the current key on its next visit.
          if ([401, 403, 404, 410].includes(err.statusCode)) return db.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [s.endpoint]);
          console.warn("Push to one device failed:", err.statusCode || "", err.body || err.message);
        });
    }));
  } catch (e) {
    console.warn("Push notification failed:", e.message);
  }
}

module.exports = { publicKey, sendTo };
