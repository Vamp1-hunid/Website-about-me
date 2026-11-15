# God's Banditos

The website of **God's Banditos**, the story creation brand of Mulenga Mwamba.

📘 **Full build report:** [docs/BUILD-REPORT.md](docs/BUILD-REPORT.md) — how everything was built, every third-party account, every animation and how to change it.

Live website: https://mulenga-mwamba-website.onrender.com

## About this website
God's Banditos is my story creation brand, and this is its home on the web: an archive of
**story art, anime works and writing**, a page for every **story** with its chapters, characters
and concept art, **updates** for readers, my **other products**, and a creator page about me.
Visitors can create a free account to **comment, reply, like and save favourites**. Only my admin
account can post, from a dashboard at `/admin`.

The look is an original street-hacker theme inspired by Watch Dogs 2 (no game logos,
fonts or artwork are used).

## Pages

| Address | What it is |
|---|---|
| `/` | God's Banditos home: logo, what we make, latest works, meet the creator |
| `/creator` | About me, hobbies, learning plan + calculator, projects, photos, media, contact |
| `/gallery` | All works: search, sort (newest, oldest, most liked) and filter by category, story, tag or `?section=concept-art` |
| `/work/<name>` | One work: pictures (read top to bottom), video, audio, formatted text, downloads, likes, save, comments with replies, next/previous |
| `/stories` and `/stories/<name>` | Every story, and one story's cover, logline, chapters, characters and concept art |
| `/characters/<name>` | A character profile: portrait, role, tagline, profile, concept art |
| `/products` | More products by us: my other projects |
| `/search?q=` | Searches works, stories, characters and products |
| `/u/<username>` | A member's public page: picture, join date, recent comments |
| `/login`, `/register`, `/forgot`, `/reset` | Log in, create an account, reset a forgotten password by email |
| `/profile` | Picture, email, stats, favourites, password, Google, delete account |
| `/admin` | Site owner's dashboard (see below) |

## Afterframe: the creator platform (`/hub`)

God's Banditos stays your own brand. **Afterframe** is a separate platform on the same server where
other manga artists, animators and story writers publish. Both share accounts, so one login works on both.

| Address | What it is |
|---|---|
| `/hub` | Afterframe home: featured creators, latest releases, anime updates |
| `/hub/creators` | Creator directory (search, filter by what they make, sort) |
| `/hub/c/<handle>` | A creator's profile: banner, bio, links, followers, stories, works, characters, Follow button |
| `/hub/w/<work>`, `/hub/s/<story>`, `/hub/ch/<character>` | Works, stories and characters on Afterframe |
| `/hub/feed` | New releases from creators you follow (the ☰ button shows a dot when there's something new) |
| `/hub/news` | Anime updates, written by you or creators you allow |
| `/hub/collabs` | Collab board: creators post requests ("writer looking for a manga artist"), filter by role and pay, and reply "I'm interested" |
| `/hub/apply` | Apply to become a creator (accept the Creator Agreement) |
| `/hub/studio` | A creator's studio: the same composer, uploads, scheduling and drafts as your dashboard, plus their profile |
| `/legal/terms`, `/legal/privacy`, `/legal/creator-agreement`, `/legal/content-rules` | Legal pages (drafts: have them reviewed) |

How it works:
- Anyone with an account can apply. You approve, reject or suspend creators in **Dashboard → Afterframe**,
  where you can also feature creators and allow them to post anime updates. Approval and rejection are emailed
  when email is set up.
- Creators can only see and edit their own works, stories and characters, and can delete comments on their own works.
- **Collabs:** in the studio's Collabs tab a creator picks who they're looking for from a list (writer, artist,
  animator, colorist, voice actor, composer ...) or chooses "Other (describe it)" and types their own. Anyone logged
  in can reply; only the poster sees the replies (and gets an email if email is set up). Requests can be closed,
  reopened, edited or deleted, and reported like anything else.
- Everyone can report a work, comment or creator (⚑ Report). Reports appear in **Dashboard → Afterframe** with
  buttons to delete the work or comment, suspend the creator, resolve or dismiss.
- A suspended creator's works disappear everywhere at once.
- Your existing works belong to your creator profile **@gods-banditos**. The God's Banditos pages only show your
  own work; another creator's work opened at a God's Banditos address is redirected to Afterframe.
- Work, story, character and creator pages get their title, description and preview picture from the server,
  so Google and WhatsApp/Facebook link previews show the real thing. The sitemap lists every public page.

## The dashboard (`/admin`)

| Tab | What it's for |
|---|---|
| Overview | Numbers at a glance, what's scheduled next, setup status, quick buttons |
| Compose | Write a work or update with a formatting toolbar, font choice and live preview; upload pictures, video, audio and documents (drag and drop); choose a cover; import a Word/text file; publish now, schedule or save as a draft |
| Works | Every work, filtered by live / scheduled / draft |
| Stories | Create stories with a title, logline, description and cover photo |
| Characters | Character profiles with a portrait and concept art; draft, publish or schedule |
| Drafts & scheduled | Everything the public can't see yet, in one list |
| Products | The "More products by us" page |
| Comments | The latest comments on every work, to reply or delete |
| Inbox | Messages from the contact form |
| Settings | Social media links (shown under Contact, in the menu and footer), the **support button**, and a check of the Render settings |
| Afterframe | Creator applications (approve, reject, feature, allow anime updates, suspend) and reports |

### The support button ("Fund the heist")
A loot-bag button (bottom left of every page) that opens a panel with the ways people can send you
money. Set it up in Dashboard → Settings → Support button. It stays hidden until you tick "Show the button".
- **Mobile money** (MTN, Airtel, Zamtel): your number, network and registered name, with a Copy button.
- **Card (Visa / Mastercard)**: paste a payment link from a payment company that pays out to you in Zambia
  (for example Flutterwave). A website can't send money straight to a card number, so a payment company
  always sits in between and pays out to your bank or mobile money.
- **PayPal**: PayPal usually doesn't let Zambian accounts receive money, so only add it if yours can.
- **Bank transfer**: leave the details empty so visitors ask for them through the contact form
  (topic "Supporting your work"), keeping your account number off the public page.

Formatting in the text: `# heading`, `**bold**`, `*italic*`, `==highlight==`, `~~crossed out~~`,
`-> centred <-`, `> quote`, `- list`, `1. list`, `---` scene break, `[link](https://...)`,
and pictures with the 🖼 button. The **Formatting help** link in Compose shows them all.

## Features

**The four ICT251 JavaScript features (js/script.js)**
1. **Contact form validation and preview:** checks name, email and message, rejects spaces-only text and badly formatted emails, and shows a preview. Pressing **Send message** then delivers it to my inbox (and the dashboard Inbox).
2. **Menu:** the three-bar ☰ button opens a menu with every section, a search box and social links (on phones it replaces the link bar).
3. **Theme switch:** dark / light, remembered after a refresh.
4. **Study hours calculator:** hours per day × days per week, rejects blank, non-numeric, negative or out-of-range values.

**Theme effects (js/fx.js)**
- **Profiler:** point at (or tap) my photos or any work to see a scan card with its details.
- **Hold to hack:** press and hold a project file to decrypt extra notes (Enter opens it straight away for keyboard users).
- **Network map:** a faint, moving web of nodes behind the page.
- **Console:** press `>_ CONSOLE` and type `help` (try `goto projects`, `works anime`, `theme light`, `hack`).
- A short boot screen once per visit on the home page. Visitors who turn on *reduce motion* get no boot screen and a still page.

**Accounts and works (server)**
- Sign up / log in with a username and password, or with Google.
- Passwords are stored as bcrypt hashes; logins use secure, http-only session cookies kept in the database.
- Login and sign-up are rate-limited; requests from other websites are blocked.
- Only the admin can upload works. Pictures, video, audio and documents go straight from the browser to Cloudinary with a signed, one-time permission from the server, and the server checks Cloudinary's receipt before saving. Members can upload a profile picture (8 MB).
- Everything visitors type is shown as plain text, never as HTML. Works' formatting is turned into page elements by `js/markup.js` without ever using HTML, and links must start with `https://`.
- Scheduled works and drafts are hidden everywhere (lists, search, sitemap, comments) until their time comes.

## Version 5: reviews, bell, feature switches and more

**Rules that are always on**
- **Usernames** must be unique (not case-sensitive) and names like *admin*, *support*, *official* or *afterframe* are reserved. The Join page checks while you type.
- **Terms first:** joining is two steps. People tick the Terms, Privacy Policy, Content Rules (including the no-advertising rule) and age boxes before they can choose a username. First-time Google sign-ins go through the same step before any account is created.
- **Every creator post is reviewed.** It waits in **Dashboard → Reviews** until you approve it (with a friendly message) or decline it (with a ready-made warning, or your own words). The creator gets the message in their bell and by email. Your own posts skip the queue.
- **No advertising without approval:** added to the Terms, Content Rules and Creator Agreement.
- **Manage users** (Dashboard): search members, view their scheduled or pending posts, suspend for a number of days, ban, reactivate, or make them a beta tester. Suspended and banned people are signed out and can't log in.
- **Welcome messages** for every new account (member, creator, admin), shown once as a card.

**Features you switch on in Dashboard → Features**
Each new feature starts as **Only me**, so you can try it on the live site first. Change it to **Beta testers** or **Everyone** when you're happy. Off hides it from everyone.
- Notification bell: new posts from people you follow, new followers, follower milestones, streaks, review results, trending posts and your announcements (Dashboard → Announcements).
- Online status (green dot, members can hide it in Account settings) and daily streaks.
- Polls and questionnaires in Compose, with results bars on the work page.
- Quick tips under the header, and the Help & FAQ page with the ? help assistant.
- Suggestion box (collab board, studio Collabs tab, Help page) → your Inbox.
- Sponsor & business page at /hub/sponsor (edit it in Dashboard → Settings) → business enquiries land in your Inbox.
- "Fund the heist" on Afterframe pages too.

**Other changes**
- Contact moved from the Mulenga Mwamba page to its own God's Banditos page at /contact.
- Afterframe now welcomes all kinds of creative work: art, comics, animation, live action films, series, comedy, writing, memes, polls and personal posts.

**Optional: AI answers in the help assistant.** Without anything set up, the assistant answers from the FAQ for free. To let it write answers with AI, add `AI_API_KEY` (an Anthropic API key) on Render. `AI_MODEL` can change the model. It still only uses the FAQ as its knowledge.

## How it is built

- **Server:** Node.js + Express (`server.js`, `src/`)
- **Database:** PostgreSQL on **Neon** (`db/schema.sql` creates the tables automatically on start)
- **Images:** **Cloudinary** (Render's free disk is wiped on every restart, so uploads can't live there)
- **Pages:** plain HTML, CSS and JavaScript in `public/`

```
server.js            starts the site
src/db.js            database connection
src/migrate.js       creates tables + your admin account
src/auth.js          "must be logged in" / "must be admin" checks
src/storage.js       uploads (Cloudinary, or public/uploads/ on a laptop)
src/media.js         checks the files attached to works and characters
src/mail.js          sends emails (Brevo or Resend)
src/routes/          the /api addresses: account, posts, comments, stories, admin, search, contact, users
db/schema.sql        the database tables
public/              every page, css/, js/, images/, videos/
```

## Putting it on Render (one-time setup)

Your old Render service is a **Static Site**, which can't run a server. Replace it with a
**Web Service**:

1. **Neon:** open your project → **Connect** → copy the connection string
   (starts with `postgresql://`, ends with `?sslmode=require`).
2. **Cloudinary:** dashboard → copy the **API environment variable** (starts with `cloudinary://`).
3. **Render:** to keep the same address, first delete the old static site
   (*Settings → Delete*), then **New → Web Service** → pick this repo, and give it the
   same name: `mulenga-mwambas-personal-website`.
   - Branch: `main`
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free
4. Under **Environment**, add:

   | Name | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | the Neon connection string |
   | `CLOUDINARY_URL` | the Cloudinary variable |
   | `SESSION_SECRET` | a long random string (see `.env.example` for a command that makes one) |
   | `ADMIN_USERNAME` | the username you'll log in with, e.g. `mwamba` |
   | `ADMIN_PASSWORD` | a strong password, 10+ characters |

   Optional extras (each switches a feature on when it's set):

   | Name | What it does |
   |---|---|
   | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | turns on "Continue with Google" (see below) |
   | `GOOGLE_VERIFICATION` | proves to Google Search Console that the site is yours (see below) |
   | `PUBLIC_URL` | your site's address, e.g. `https://mulenga-mwamba-website.onrender.com` (only needed if you add your own domain) |
   | `BREVO_API_KEY` (or `RESEND_API_KEY`) and `MAIL_FROM` | turns on email: "Forgot password" links and contact-form messages (see below) |
   | `CONTACT_EMAIL` | your own address: where contact-form messages are delivered |

5. Deploy. Open `/login`, sign in with your admin username and password, then go to `/admin`
   and post your first work.

**Passwords:** anyone (you included) can change their password on `/profile`. If you forget
the admin password, change `ADMIN_PASSWORD` on Render and redeploy: a *new* value resets it.

## Email: "Forgot password" and the contact form (one-time setup)

1. Create a free account at https://www.brevo.com (300 emails a day).
2. **Senders & IP → Senders → Add a sender:** your Gmail address. Brevo emails you a link: click it.
3. **SMTP & API → API Keys → Generate a new API key.** Copy it.
4. On Render → Environment add `BREVO_API_KEY` (the key), `MAIL_FROM` (e.g. `God's Banditos <yourname@gmail.com>`,
   the address you verified) and `CONTACT_EMAIL` (where you want contact messages). Deploy.
5. Open the dashboard → Settings: "Email" and "Contact form" should be green.

Members who want password resets add an email when they sign up, or on their profile page.

## "Continue with Google" (one-time setup)

1. Go to https://console.cloud.google.com and create a project (any name, e.g. "God's Banditos").
2. **Google Auth Platform → Branding** (or "OAuth consent screen"): app name, your email,
   audience **External**. Then **Audience → Publish app** so everyone can use it, not only test users.
3. **Clients → Create client → Web application**.
   Under **Authorised redirect URIs** add exactly:
   `https://mulenga-mwamba-website.onrender.com/auth/google/callback`
4. Copy the **Client ID** and **Client secret** into Render as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, then deploy. The Google buttons appear by themselves.
5. To log in as admin with Google: log in with your password, open `/profile`, press **Link my Google account**.

## Getting found on Google Search

The site already serves `/sitemap.xml` (every page and work) and `/robots.txt`.

1. Go to https://search.google.com/search-console → **Add property** → **URL prefix** →
   your site address.
2. Choose the **HTML file** method. Google offers a file called something like `google1a2b3c4d.html`.
   Don't download it: copy its name into Render as `GOOGLE_VERIFICATION` (e.g. `google1a2b3c4d`)
   and deploy, then press **Verify**.
3. In Search Console open **Sitemaps** and submit `sitemap.xml`.
4. It usually takes a few days to a couple of weeks before searches like "Mulenga Mwamba" show the site.

Never put these values in the code or on GitHub. On your laptop they go in a `.env` file
(copy `.env.example`), which `.gitignore` keeps out of the repo.

**Free plan notes:** a free Render web service goes to sleep when nobody visits for a while,
so the first visit after that takes about a minute to wake up.

## Running it on your laptop

```
npm install
copy .env.example .env      (Mac/Linux: cp .env.example .env) and fill it in
npm start
```
Then open http://localhost:3000. Without `CLOUDINARY_URL`, uploads are saved in
`public/uploads/` so you can still test.

## How to test

- **Contact form:** submit it empty, with spaces only, with the email "abc", then with valid details.
- **Mobile navigation:** make the browser about 375 px wide and press Menu.
- **Theme switch:** press the theme button, then refresh the page.
- **Calculator:** 2 hours × 5 days = 10; then try blank, "abc", -2, 0 days and 8 days.
- **Accounts:** create an account, like and save a work, comment, then check `/profile`.
- **Permissions:** as a member, `/admin` says "Access denied"; the server also refuses member uploads.
- **Scheduling:** in Compose choose "Schedule for later" a few minutes ahead; the work is hidden (log out to check) until then.
- **Stories:** create a story, give a chapter that story and a chapter number, add a character with a portrait, then open `/stories`.

## Sources
- Learning Web Design by Jennifer Niederst Robbins (my main learning book)
- Fonts: Bungee, Chakra Petch and Share Tech Mono from Google Fonts
- MDN Web Docs (linked in the navigation)
- Photos, video, audio and artwork: my own
