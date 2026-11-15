// src/plans.js
// Account plans. "premium" is ready but queued: it stays hidden until the "premium" feature flag
// is switched to everyone (Admin → Features) and a payment provider is connected.
//
// To launch later:
//  1. Choose a price and a payment provider (e.g. Flutterwave or Paystack for mobile money and cards in Zambia, or Stripe).
//  2. When a payment succeeds, set users.plan = 'premium' and users.plan_until = the end of the paid period.
//  3. Bigger file sizes also need a paid Cloudinary plan (the free one caps pictures at 10 MB and videos at 100 MB).

const PLANS = {
  free: {
    key: "free",
    label: "Free",
    maxMediaPerPost: 80,
    limitsMb: { image: 10, video: 100, audio: 50, document: 10 },
    customPage: false
  },
  premium: {
    key: "premium",
    label: "Chapterhive Premium",
    priceNote: "Price to be announced",
    maxMediaPerPost: 200,
    limitsMb: { image: 25, video: 500, audio: 200, document: 50 },
    customPage: true,
    perks: [
      "Bigger uploads: longer videos, larger pictures and documents",
      "Up to 200 pages or files in one post",
      "A custom creator page: choose a theme, accent colour and wallpaper visitors see",
      "A Premium badge on your creator page"
    ]
  }
};

// Themes a premium creator can give their page. Each is a set of colours used by css/chapterhive.css.
const PAGE_THEMES = {
  hive: "Honey hive (default)",
  midnight: "Midnight ink",
  sakura: "Sakura",
  forest: "Forest library",
  ocean: "Deep ocean",
  paper: "Storybook paper",
  stage: "Concert stage"
};

function planOf(row) {
  if (row && row.plan === "premium" && (!row.plan_until || new Date(row.plan_until) > new Date())) return PLANS.premium;
  return PLANS.free;
}

module.exports = { PLANS, PAGE_THEMES, planOf };
