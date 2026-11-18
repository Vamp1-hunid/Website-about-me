# God's Banditos & Chapterhive — Project Report

**Site:** https://mulenga-mwamba-website.onrender.com
**Repository:** https://github.com/Vamp1-hunid/Website-about-me (branch `main`)
**Owner:** Mulenga Mwamba · **Report date:** 17 November 2026 (covers Versions 1–24)

> 📌 **This is the project's main report.** It sits at the top of the repository so it's easy to find.
> Start with "Start here" below, then jump to any version in the contents.

## Start here: where Chapterhive stands (17 November 2026)

**What it is:** God's Banditos (`/`) is the owner's view-only showcase. **Chapterhive** (`/hub`)
is the creator platform for readers, watchers, listeners and creators. Everyone starts with a free
member account and can apply to become a creator.

**Where it lives:**
- **Live site:** https://mulenga-mwamba-website.onrender.com
- **Code:** this repository; `main` deploys to Render automatically.
- **Database:** Render PostgreSQL. The structure is in `db/schema.sql`, upgraded on every start.

**Right now (pre-launch):**
- Reservations are on and New accounts are off (Admin → Site features).
- **Visitors** can reserve a username: with a password, or with **Continue with Google**. They get
  their number on the public list (usernames only) and can apply to be beta testers.
- **People who reserved** can sign in. They can follow creators, read News & updates, and see the
  list grow.
- **Beta testers** (approved by you or your staff) can use everything: post, follow anyone, buddies
  and chat.

**On launch day:**
1. In Admin → Site features, switch **New accounts** on, and switch **Pre-launch username
   reservations** off when you're ready.
2. On the reservation list, press **Send claim links** for older reservations made without a
   password.
3. Post an announcement (📣 Post an update → Everyone). It pops up once for everyone and stays on
   News & updates.

**Your owner tools:**

| Where | What |
|---|---|
| ☰ menu | Account first (profile, edit, settings), then Dashboard, 📣 Post an update, 🛡️ Team & powers, reservations, beta and creator applications, with "waiting" badges |
| Admin → 🛡️ Team & powers | See every admin and staff member, remove full admin rights, give or take limited powers |
| `/hub/reserve` (bottom) | Numbered reservation list with filters, Excel/PDF download, claim links, 👑 your #1 nickname |
| `/hub/beta` (bottom) | Beta applications with filters and approve/decline in bulk |
| Admin → Announcements | Send to Everyone, Beta testers, Creators or Staff; shows on News & updates and pops up |

**Settings on Render (Environment):**

| Setting | Status / purpose |
|---|---|
| `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Required (already set) |
| `PUBLIC_URL` | Recommended: `https://mulenga-mwamba-website.onrender.com` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Continue with Google (steps in the Versions 5–17 section) |
| `CLOUDINARY_URL` | **Recommended.** Free photo/video storage. Without it, uploads are kept as backup copies in the database (up to 8 MB each) |
| `BREVO_API_KEY` or `RESEND_API_KEY` + `MAIL_FROM` | Sends emails (verification, claim links, beta invites). Until then, links show on screen for you to send |
| `CONTACT_EMAIL` | Where contact messages go |
| `ANDROID_ASSETLINKS` | For the Play Store app later (paste the file PWABuilder gives you) |

**Still to decide or do:**
- **Upload your profile picture again:** the old file was wiped by a Render deploy.
- **Add `CLOUDINARY_URL` and an email key on Render.**
- **Add a date of birth to the admin account**, if it doesn't have one, so people can chat with
  you.
- **Choose a name for member accounts:** "member" for now.
- **Legal pages:** have the drafts reviewed by a Zambian lawyer before launch.
- **Play Store:** the site is installable now (step 1). Next: PWABuilder package, a $25 Google Play
  developer account, 12 testers for 14 days, then production.

**Latest changes:** see "Version 24" at the end of this report. Every pull request from #9 onwards
is in the "At a glance" table under Versions 5–17.

---


This report explains the whole website from the ground up: how it was built, which outside
services it uses and how each account was set up, how every page and animation works, and
exactly where to go in the code to change things. It assumes you know basic HTML, CSS and
JavaScript and explains everything else as it goes.

---

## Contents

1. [What the site is](#1-what-the-site-is)
2. [How the pieces fit together](#2-how-the-pieces-fit-together)
3. [Words and abbreviations used in this report](#3-words-and-abbreviations-used-in-this-report)
4. [Map of the files](#4-map-of-the-files)
5. [How it was built, step by step](#5-how-it-was-built-step-by-step)
6. [Third-party accounts: what each one is for and how to set it up](#6-third-party-accounts)
7. [Environment variables (the settings on Render)](#7-environment-variables)
8. [The database](#8-the-database)
9. [The API (how pages talk to the server)](#9-the-api)
10. [Security: what protects the site and its members](#10-security)
11. [The theme: colours, fonts and layout](#11-the-theme)
12. [Every animation and effect: how it works and how to change it](#12-every-animation-and-effect)
13. [Reduced motion and accessibility](#13-reduced-motion-and-accessibility)
14. [Everyday tasks](#14-everyday-tasks)
15. [Running the site on your laptop](#15-running-the-site-on-your-laptop)
16. [Deploying, and fixing a failed deploy](#16-deploying-and-fixing-a-failed-deploy)
17. [Free-plan limits and known gaps](#17-free-plan-limits-and-known-gaps)
18. [Version 3: dashboard, stories, characters](#version-3-november-2026-dashboard-stories-characters-and-more)
19. [Version 4: Afterframe, the creator platform](#version-4-november-2026-afterframe-the-creator-platform)
20. [Versions 5–17: Chapterhive, from creator platform to pre-launch](#versions-517-november-2026-chapterhive-from-creator-platform-to-pre-launch)

---

## 1. What the site is

**God's Banditos** is your story creation brand, and this is its website. It has five jobs:

| Job | Where |
|---|---|
| **Brand home** — logo, what the brand makes, latest works, a link to the creator | Home page `/` |
| **Creator page** — you: about, hobbies, learning plan, projects, photos, video, contact form | `/creator` |
| **Archive** — your story art, anime works and writing | `/gallery` and `/work/<name>` |
| **Community** — visitors create accounts to comment, like and save favourites | `/register`, `/login`, `/profile` |
| **Admin** — only you can post, edit, hide (draft) and delete works | `/admin` |

It started life as a single static page for ICT251 Activity 3 (one HTML file, one CSS file,
one JavaScript file). It was then rebuilt into a full website: a **server** that runs code,
a **database** that remembers accounts and posts, and **image storage** for your artwork,
all wrapped in an original theme inspired by the look of Watch Dogs 2 (no game logos,
artwork or fonts are used). Finally it was rebranded from a personal page into the God's
Banditos brand site, with your personal content moved to its own creator page.

---

## 2. How the pieces fit together

```mermaid
flowchart TD
  B["Visitor's browser<br/>(phone or computer)"] -->|asks for pages| R
  R["Render: server.js<br/>Node.js + Express"]
  R -->|sends| P["public/ files<br/>HTML, CSS, JS, images"]
  R -->|SQL queries| N[("Neon<br/>PostgreSQL database")]
  R -->|image uploads| C["Cloudinary<br/>image storage"]
  R -->|sign-in check| G["Google<br/>sign-in (OAuth)"]
```

In words: the visitor's browser only ever talks to **Render**, which runs `server.js`. The
server hands out the page files, answers the `/api/...` addresses using the **Neon**
database, sends uploaded art to **Cloudinary**, and asks **Google** to confirm who someone
is when they press "Continue with Google". It also serves `/robots.txt` and `/sitemap.xml`
for Google Search.

**The journey of one page view**, for example someone opening one of your works:

1. The browser asks Render for `/work/a-year-to-burn-cover`.
2. `server.js` sends back `public/work.html`: the page's skeleton (header, footer, empty boxes).
3. The browser loads `css/styles.css` (the look) and the scripts in `js/`.
4. `js/work.js` reads the name from the address and asks the server for the details:
   `GET /api/posts/a-year-to-burn-cover`.
5. The server looks the work up in the Neon database and replies with **JSON** (plain data).
6. `js/work.js` fills the page: image (from Cloudinary), title, text, likes and comments.
7. `js/fx.js` and `js/flair.js` add the effects: profiler, glitches, tilt, and so on.

This split — **HTML skeleton + JSON data filled in by JavaScript** — is the same pattern as
your ICT251 Activity 4 CRUD app.

---

## 3. Words and abbreviations used in this report

| Term | Plain-English meaning |
|---|---|
| **HTML** (HyperText Markup Language) | The structure of a page: headings, paragraphs, forms. |
| **CSS** (Cascading Style Sheets) | The look: colours, fonts, layout, animations. |
| **JS** (JavaScript) | Code that runs in the browser and makes pages interactive. |
| **DOM** (Document Object Model) | The live, in-memory version of the page that JavaScript reads and changes. |
| **Node.js** | Lets JavaScript run on a server instead of in a browser. |
| **Express** | A Node.js library for writing web servers: "when someone asks for X, do Y". |
| **npm** (Node Package Manager) | Downloads the libraries listed in `package.json`. |
| **Server** | The computer that runs `server.js` and answers requests (here, a Render machine). |
| **Client** | The visitor's browser. |
| **API** (Application Programming Interface) | The set of addresses the pages call to get or change data, e.g. `/api/posts`. |
| **JSON** (JavaScript Object Notation) | A plain-text data format: `{"title": "Cover", "likes": 3}`. |
| **HTTP** / **HTTPS** | The language browsers and servers speak; the S means encrypted. |
| **GET / POST / PUT / DELETE** | HTTP "verbs": read, create, update, delete. |
| **Status code** | A number in every reply: 200 OK, 201 Created, 400 bad input, 401 not logged in, 403 not allowed, 404 not found, 500 server error. |
| **Route** | One address the server answers, e.g. `POST /api/account/login`. |
| **Middleware** | A function that runs before a route, e.g. "must be logged in". |
| **Database** | Permanent storage for data, organised in tables. |
| **PostgreSQL** ("Postgres") | The database system used here. |
| **SQL** (Structured Query Language) | The language for asking a database things: `SELECT * FROM posts`. |
| **Table / row / column** | A table is like a spreadsheet; a row is one record; a column is one field. |
| **Primary key** | The column that uniquely identifies a row (usually `id`). |
| **Foreign key** | A column pointing at a row in another table, e.g. a comment's `post_id`. |
| **Schema** | The list of tables and columns (`db/schema.sql`). |
| **Migration** | Code that creates or updates the tables (`src/migrate.js`). |
| **Connection string** | One line with the database's address, username and password. Secret. |
| **Environment variable** | A named setting given to the server from outside the code (on Render's Environment page). Keeps secrets out of GitHub. |
| **`.env` file** | A file of environment variables for your laptop only; never committed. |
| **Hash** / **bcrypt** | A one-way scramble of a password. The site stores the hash, never the password. bcrypt is the slow, salted hashing method used. |
| **Session** | The server's memory that "this browser is logged in as @fan_01". |
| **Cookie** | A small value the browser sends with each request; here it carries the session id. |
| **OAuth** (Open Authorization) / **OIDC** (OpenID Connect) | The standard behind "Continue with Google": Google confirms who someone is without giving your site their Google password. |
| **Client ID / client secret** | The username and password your site uses to talk to Google's sign-in service. |
| **CSRF** (Cross-Site Request Forgery) | An attack where another website tricks a visitor's browser into acting on your site. |
| **XSS** (Cross-Site Scripting) | An attack where someone sneaks code into text (e.g. a comment) so it runs on other visitors' screens. |
| **CSP** (Content Security Policy) | A header listing where a page may load scripts, fonts and images from. |
| **Rate limit** | A cap on attempts per time window (e.g. 10 logins per 15 minutes). |
| **CDN** (Content Delivery Network) | Servers around the world that deliver files fast; Cloudinary uses one. |
| **Deploy** | Putting a new version of the code live. |
| **Branch / commit / push / PR** | Git terms: a line of work / a saved change / upload to GitHub / pull request, a proposal to merge one branch into another. |
| **SEO** (Search Engine Optimisation) | Making the site easy for Google to find and list. |
| **Sitemap** | A list of the site's pages for search engines (`/sitemap.xml`). |
| **rAF** (`requestAnimationFrame`) | Asks the browser to run a function just before the next screen redraw (about 60 times a second). Used for smooth animation. |
| **Canvas** | An HTML element you draw pixels on with JavaScript (the network map). |
| **Keyframes** | A CSS animation recipe: "at 0% look like this, at 100% look like that". |
| **Transition** | A CSS rule that animates a change smoothly, e.g. on hover. |
| **Transform** | CSS that moves, rotates or scales an element without disturbing the layout. |
| **clip-path** | CSS that shows only part of an element (used for wipes and cut corners). |
| **Media query** | CSS that applies only on some screens, e.g. `@media (max-width: 760px)`. |
| **`prefers-reduced-motion`** | A device setting people turn on when motion makes them unwell; the site respects it. |
| **ARIA** (Accessible Rich Internet Applications) | HTML attributes that tell screen readers what things are, e.g. `aria-expanded`. |

---

## 4. Map of the files

**Top level**

| File | Job |
|---|---|
| `server.js` | Starts everything: security, sessions, API, pages |
| `package.json` | Start command and list of libraries |
| `package-lock.json` | Exact library versions (made by npm) |
| `.env.example` | Template for your laptop's `.env` |
| `.gitignore` | Files Git must never upload |
| `README.md` | Short guide |
| `PROJECT-REPORT.md` | This report |
| `db/schema.sql` | Every database table |

**`src/` — server code**

| File | Job |
|---|---|
| `env.js` | Loads `.env`; tidies pasted Render settings |
| `db.js` | The database connection |
| `migrate.js` | Creates tables; creates or resets the admin |
| `auth.js` | Login checks, log-in helper, safe redirects |
| `storage.js` | Image uploads (Cloudinary) |
| `routes/account.js` | Register, log in/out, password, delete |
| `routes/posts.js` | Works, likes, favourites, comments |
| `routes/comments.js` | Delete a comment |
| `routes/google.js` | "Continue with Google" |
| `routes/seo.js` | robots.txt, sitemap, Search Console |

**`public/` — pages**

| File | Address |
|---|---|
| `index.html` | `/` God's Banditos home |
| `creator.html` | `/creator` your page |
| `gallery.html` | `/gallery` |
| `work.html` | `/work/<name>` |
| `login.html`, `register.html` | `/login`, `/register` |
| `profile.html` | `/profile` |
| `admin.html` | `/admin` |
| `404.html` | wrong addresses |
| `Activity1.html` | your old Activity 1 page |
| `css/styles.css` | the whole look, in numbered sections |
| `images/` | photos, logo files, share card |
| `videos/` | intro video and audio |

**`public/js/` — browser scripts**

| File | Job |
|---|---|
| `theme-boot.js` | Runs first: theme, boot and wipe flags |
| `api.js` | Talks to the server; header buttons; toasts |
| `script.js` | The four ICT251 features |
| `fx.js` | Boot, network map, profiler, hack, console, reveal |
| `flair.js` | Decode, roles, tilt, bursts, reticle, wipe |
| `works-grid.js` | Builds work cards |
| `home.js` | Latest works and tile counts on the home page |
| `gallery.js` | Works page, filters, pages |
| `work.js` | One work: likes, saves, comments |
| `auth-forms.js` | Log in and Join forms |
| `profile.js` | Profile page |
| `admin.js` | Admin page |

Every page loads its scripts in the same order: `theme-boot.js` in the `<head>` (on purpose,
so the theme is right before anything is drawn), then at the end `api.js`, `script.js`,
`fx.js`, `flair.js`, then the page's own script. The later scripts use helpers the earlier
ones define (they all hang off one shared object called `window.MW`).

---

## 5. How it was built, step by step

This is the order things were actually done, so you can rebuild it from nothing or follow
what changed and why.

### Step 1 — Audit the original static site
The ICT251 page (`index.html`, `css/styles.css`, `js/script.js`) was opened live on Render and
checked in the browser. Problems found and fixed first:

| Problem | Fix |
|---|---|
| `js/effects-plus.js` was linked but didn't exist (404 error on every visit) | Removed the `<script>` line |
| Intro video was 65 MB for 30 seconds | Re-encoded with **ffmpeg** (a command-line video tool) to 720×1280, H.264, ~5.6 MB, with "fast start" so it plays before fully downloading |
| Selfie was 315 KB but shown at 140 px | Resized to 600 px wide, 68 KB |
| About section squeezed on phones | Photo stacks above the text on narrow screens |
| Floating console button covered text | Shrinks to a small `>_` square on phones |
| Missing font, stale footer date, light-mode flash, README placeholders | Fixed |

### Step 2 — Move the static site into `public/`
A server needs a folder of "files to hand to browsers". Everything the browser downloads moved
into `public/`. Paths in the HTML became absolute (`/css/styles.css` instead of
`css/styles.css`) so they work from any address, including `/work/<name>`.

### Step 3 — The server (`server.js`)
An Express server that, in order:
1. loads settings (`src/env.js`),
2. adds security headers (the **helmet** library, including the CSP),
3. reads JSON request bodies,
4. sets up login sessions stored in the database (`express-session` + `connect-pg-simple`),
5. mounts the API under `/api` (with the cross-site check `sameOriginOnly` in front),
6. mounts Google sign-in at `/auth/google`,
7. serves `robots.txt`, `sitemap.xml` and the Google verification file,
8. serves `/work/<name>` (always `work.html`), then every file in `public/`,
9. sends `404.html` for anything else,
10. catches unexpected errors (visitors see a short message; details go to Render's logs),
11. runs the database migration, then starts listening.

### Step 4 — The database (`db/schema.sql`, `src/db.js`, `src/migrate.js`)
Tables for users, posts, comments, likes, favourites, sessions and a small settings table
(section 8). Every statement uses `IF NOT EXISTS`, so the migration runs safely on **every**
start: nothing is created twice, and new columns are added automatically after an update.

### Step 5 — Accounts (`src/routes/account.js`, `src/auth.js`)
Register, log in, log out, "who am I?", favourites, stats, change password, delete account.
Passwords are hashed with bcrypt; logging in gives the browser a fresh session id.

### Step 6 — Works, likes, favourites, comments (`src/routes/posts.js`, `comments.js`)
The admin-only create/edit/delete endpoints accept a form with an image file. Members can
like, save and comment. Drafts (unpublished works) are invisible to everyone but you.

### Step 7 — Image uploads (`src/storage.js`)
Uploads go through **multer** (reads the file, max 8 MB, images only), get checked byte-by-byte
to make sure they really are images, then go to **Cloudinary**. Cloudinary also makes
smaller copies on the fly for the gallery cards.

### Step 8 — The pages
Every page shares the same header, navigation and footer. The data-driven pages are
skeletons that their scripts fill in from the API.

### Step 9 — The theme (`css/styles.css`)
A complete rewrite of the stylesheet into numbered sections with all colours and fonts in
variables, so the light theme only swaps values.

### Step 10 — Effects (`js/fx.js`)
Boot screen, network map, profiler, hold-to-hack, console, scroll reveal, glitch and the
"hack" easter egg.

### Step 11 — Testing
Each stage was tested in a real (headless) Chrome against a real PostgreSQL database, on
desktop and phone sizes, plus with "reduce motion" switched on: forms, permissions
(members can't reach admin), XSS (a comment containing `<script>` shows as text),
uploads, edit, draft, delete, and the four ICT251 features.

### Step 12 — Deployment
GitHub → Render Web Service → Neon + Cloudinary (section 6). The first deploy failed: a
pasted setting with extra text crashed the Cloudinary library at start-up. `src/env.js` was
added to tidy pasted values and ignore an unusable Cloudinary value instead of crashing.

### Step 13 — Passwords
A **Change password** form on `/profile`. `ADMIN_PASSWORD` on Render works as a reset: only a
*changed* value resets the admin password, so normal restarts never undo a password you set
on the site.

### Step 14 — Google sign-in and Google Search
"Continue with Google" on the login and join pages, linking on the profile page, plus
`robots.txt`, `sitemap.xml`, page descriptions and the Search Console verification route.

### Step 15 — Caching fix
The server had told browsers to keep pages for an hour, so visitors saw old pages after an
update. HTML, CSS and JS are now re-checked on every visit (a quick "not modified" reply when
nothing changed); photos and video are still kept for a week.

### Step 16 — Animation layer (`js/flair.js`)
Decoding text, rotating roles, tapes, tilt, pixel bursts, access stamp, reticle, page wipe,
scroll progress — then titles were made to glitch on **every** hover, not just the first.

### Step 17 — Phone fit
Every page was measured at 360 px and 390 px wide. Grids now shrink to any width
(`minmax(min(260px, 100%), 1fr)`), the learning-plan table becomes stacked cards on phones,
long words wrap, and checkboxes got bigger. No page scrolls sideways.

### Step 18 — Rebrand to God's Banditos
The home page became the brand page; the personal sections moved to `/creator`. Your logo
was redrawn as an SVG in the site's own pink and cyan (section 11.4), and the name was
changed in titles, boot screen, console, page wipe, tapes, footer and sitemap. A share card
(`og-card.png`) was made for link previews.

---

## 6. Third-party accounts

The site uses six outside services. All are free at this size. **Secrets (passwords, keys,
connection strings) go only into Render's Environment page — never into the code, GitHub or
a chat.**

### 6.1 GitHub — stores the code
- **What it's for:** keeps every version of the code; Render builds the site from it.
- **Set-up:** account `Vamp1-hunid`, repository `Website-about-me`.
- **Branches:** `main` holds the website; the Render service builds from it.

### 6.2 Render — runs the server
- **What it's for:** hosts the Node.js server on the internet at
  `https://mulenga-mwamba-website.onrender.com`.
- **How it was set up:**
  1. Render dashboard → **New → Web Service** → repository `Vamp1-hunid/Website-about-me`.
  2. Name `mulenga-mwamba-website` (this becomes the address), language **Node**,
     branch `main`, region Oregon.
  3. Build command `npm install`, start command `npm start`.
  4. Instance type **Free** (Render pre-selects a paid plan; it was switched to $0).
  5. Environment variables added (section 7). `SESSION_SECRET` and `ADMIN_PASSWORD` were
     filled with Render's **Generate** button so nobody had to type them.
- **Auto-deploy:** every push to `main` rebuilds and redeploys (2–4 minutes).
- **Useful tabs:** **Events** (deploy history), **Logs** (server messages and errors),
  **Environment** (settings), **Manual Deploy → Deploy latest commit**.

### 6.3 Neon — the PostgreSQL database
- **What it's for:** permanently stores accounts, works, comments, likes, favourites and
  login sessions. Chosen over Render's own database because Render deletes free databases
  after 30 days; Neon's free tier doesn't expire.
- **Project:** `aged-base-76610693` (organisation `org-red-surf-29786337`), database `neondb`.
- **How to get the connection string:** Neon console → your project → **Connect** (top
  right) → keep "Connection pooling" on → click the **copy** icon (the text box hides the
  password as `****`; the copy icon copies the real one). It starts with
  `postgresql://neondb_owner:` and ends with `?sslmode=require&channel_binding=require`.
- **Where it goes:** Render → Environment → `DATABASE_URL`.
- **If the password ever leaks:** Neon → Connect → **Reset password**, then paste the new
  string into Render.
- **You never create tables by hand:** the server does it on start (`src/migrate.js`).

### 6.4 Cloudinary — image storage
- **What it's for:** stores your uploaded artwork permanently and serves it fast. Needed
  because Render's free servers have no permanent disk: anything saved on them is wiped
  whenever the service restarts (which happens every time it wakes from sleep).
- **Set-up:** free account at cloudinary.com → gear icon (Settings) → **API Keys**. Copy the
  **API environment variable**; it's shown as a template
  `cloudinary://<your_api_key>:<your_api_secret>@<cloud_name>` — replace the two
  `<...>` parts with the real key and secret listed on the same page.
- **Where it goes:** Render → Environment → `CLOUDINARY_URL`.
- **What the code does with it:** uploads go to a folder `mwamba-site`; gallery cards ask
  Cloudinary for a 720-pixel copy (`thumbnailUrl` in `src/storage.js`); deleting or replacing a
  work's image deletes the old file from Cloudinary too.
- **Without it:** the site still works, but uploaded images disappear on restart.

### 6.5 Google Cloud — "Continue with Google"
- **What it's for:** lets people sign up and log in with their Google account.
- **Set-up (once):**
  1. https://console.cloud.google.com → create a project (any name).
  2. The consent screen (labelled **Google Auth Platform → Branding**, or "OAuth consent
     screen"): app name, support email, audience **External**. Then **Publish** the app —
     while it's in "Testing", only test users you list can sign in.
  3. **Clients → Create client → Web application.** Under **Authorised redirect URIs** add
     exactly `https://mulenga-mwamba-website.onrender.com/auth/google/callback`
     (if the site address ever changes, this must change too).
  4. Copy the **Client ID** and **Client secret** into Render as `GOOGLE_CLIENT_ID` and
     `GOOGLE_CLIENT_SECRET`, then deploy. The Google buttons appear by themselves.
- **Scopes asked for:** `openid email profile` (name and email only — no access to Gmail,
  Drive or anything else), so Google doesn't require an app review.

### 6.6 Google Search Console — showing up in Google Search
- **What it's for:** tells Google your site exists, proves you own it, and shows search stats.
- **Set-up:**
  1. https://search.google.com/search-console → **Add property** → **URL prefix** → your address.
  2. Method **HTML file**: Google names a file like `google1a2b3c4d.html`. Don't upload it —
     put its name (`google1a2b3c4d`) into Render as `GOOGLE_VERIFICATION`, deploy, then click
     **Verify**. The server answers that address itself (`src/routes/seo.js`).
  3. **Sitemaps** → submit `sitemap.xml`.
- It usually takes days to a couple of weeks before searching your name finds the site.

---

## 7. Environment variables

Set on Render → your service → **Environment**. After changing any of them, deploy again.

| Name | Required? | What it is |
|---|---|---|
| `NODE_ENV` | yes | `production` on Render. Turns on HTTPS-only cookies and strict checks. |
| `DATABASE_URL` | yes | Neon connection string. |
| `SESSION_SECRET` | yes | Long random value that signs login cookies (32+ characters). Changing it logs everyone out. |
| `ADMIN_USERNAME` | yes | Your admin login, `mwamba`. |
| `ADMIN_PASSWORD` | yes | Used to create the admin account the first time. Afterwards, changing it **resets** your admin password (and signs your admin sessions out). |
| `ADMIN_DISPLAY_NAME` | no | Name shown on your comments; default "Mulenga Mwamba". |
| `CLOUDINARY_URL` | strongly recommended | Cloudinary connection. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Turn on Google sign-in. |
| `GOOGLE_VERIFICATION` | no | Search Console file name, e.g. `google1a2b3c4d`. |
| `PUBLIC_URL` | no | Only if you add your own domain (e.g. `https://mwamba.dev`); used for the Google redirect and the sitemap. |

`src/env.js` trims spaces, strips quotes or a `NAME=` prefix, and pulls the real value out of
a pasted `psql '...'` command, so a messy paste can't crash the server.

---

## 8. The database

Defined in `db/schema.sql`, created by `src/migrate.js` on every start.

| Table | One row is... | Key columns |
|---|---|---|
| `users` | an account | `username` (unique), `display_name`, `password_hash` (empty for Google-only accounts), `role` (`admin` or `member`), `google_sub` (Google's id for the person), `email` |
| `posts` | one work | `slug` (the address name, unique), `category` (`story-art`, `anime`, `writing`), `title`, `summary`, `body`, `image_url`, `image_public_id`, `published` |
| `comments` | one comment | `post_id` → posts, `user_id` → users, `body` |
| `likes` | "this member likes this work" | `user_id` + `post_id` together are the primary key, so nobody can like twice |
| `favourites` | "this member saved this work" | same pattern as likes |
| `user_sessions` | one logged-in browser | managed by `connect-pg-simple` |
| `app_settings` | a server setting | stores a hash of the last applied `ADMIN_PASSWORD` |

`ON DELETE CASCADE` on the foreign keys means deleting a work also deletes its comments, likes
and favourites, and deleting an account removes everything that member posted.

To look at the data directly: Neon console → **Tables** (browse), or **SQL Editor**, e.g.
`SELECT username, role, created_at FROM users ORDER BY created_at DESC;`

---

## 9. The API

Everything under `/api` speaks JSON. 🔒 = must be logged in, 👑 = admin only.

| Method and address | Does |
|---|---|
| `GET /api/health` | `{"ok":true}` — quick "is the server up?" check |
| `POST /api/account/register` | Create a member account `{username, displayName, password}` |
| `POST /api/account/login` | Log in `{username, password}` |
| `POST /api/account/logout` | Log out |
| `GET /api/account/me` | Who is logged in (or `null`), and whether Google sign-in is on |
| `GET /api/account/favourites` 🔒 | Your saved works |
| `GET /api/account/stats` 🔒 | Joined date, counts, has-password, Google-linked |
| `POST /api/account/password` 🔒 | Change (or first set) your password |
| `POST /api/account/google/unlink` 🔒 | Stop using Google sign-in (needs a password first) |
| `DELETE /api/account` 🔒 | Delete your account (members only) |
| `GET /api/posts?category=&page=` | List published works, 12 per page |
| `GET /api/posts/<slug>` | One work, plus whether *you* liked/saved it |
| `GET /api/posts/by-id/<id>` 👑 | One work by number, drafts included (edit form) |
| `POST /api/posts` 👑 | New work (form with optional `image` file) |
| `PUT /api/posts/<id>` 👑 | Edit a work |
| `DELETE /api/posts/<id>` 👑 | Delete a work and its image |
| `POST`/`DELETE /api/posts/<id>/like` 🔒 | Like / unlike |
| `POST`/`DELETE /api/posts/<id>/favourite` 🔒 | Save / unsave |
| `GET /api/posts/<id>/comments` | Comments on a work |
| `POST /api/posts/<id>/comments` 🔒 | Add a comment |
| `DELETE /api/comments/<id>` 🔒 | Delete a comment (your own; the admin can delete any) |

Outside `/api`: `/auth/google` and `/auth/google/callback` (Google sign-in), `/robots.txt`,
`/sitemap.xml`, `/google<code>.html`.

On the browser side, `MW.api(path, options)` in `js/api.js` wraps `fetch`: it sends JSON or
form data, reads the reply, and turns errors into a message you can show.

---

## 10. Security

| Threat | Protection | Where |
|---|---|---|
| Stolen password list | Passwords stored as **bcrypt** hashes (cost 12), never in plain text | `account.js`, `migrate.js` |
| Password guessing | 10 login attempts per 15 minutes per visitor; same message for wrong username or password (and a dummy hash check so timing doesn't leak which one) | `account.js` |
| Spam sign-ups / comments | 5 sign-ups per hour; 20 comments per 10 minutes | `account.js`, `posts.js` |
| Session hijacking | Cookie is `httpOnly` (scripts can't read it), `secure` (HTTPS only), `sameSite=lax`; a new session id at every login | `server.js`, `auth.js` |
| CSRF | `sameSite` cookies **plus** `sameOriginOnly`: any change request with another site's `Origin` header is refused | `auth.js` |
| XSS | Everything visitors type is put on the page with `textContent`, never `innerHTML`; the CSP blocks scripts from anywhere but the site itself | all page scripts, `server.js` |
| SQL injection | Every query uses placeholders (`$1, $2`) so values are never mixed into SQL text | all routes |
| Fake image uploads | Only admins can upload; type, size (8 MB) **and** the file's first bytes are checked | `storage.js` |
| Open redirects | `?next=` only accepts addresses on this site | `auth.js` (`safeNext`), `api.js` |
| Google sign-in tampering | Random `state` (checked in constant time) and `nonce`; Google's token signature and audience verified by Google's official library | `google.js` |
| Members reaching admin tools | Every admin route checks the role on the server; hiding the admin page is only for convenience | `auth.js`, `posts.js` |
| Secrets in GitHub | All secrets are environment variables; `.env` is in `.gitignore` | `.gitignore` |
| Search engines listing private pages | `noindex` on login/join/profile/admin; `robots.txt` blocks them | pages, `seo.js` |

---

## 11. The theme

### 11.1 Colours
All colours live in **variables** at the top of `public/css/styles.css` (section 1). The rest of
the stylesheet only ever says `var(--pink)` and so on, so changing a colour in one place
changes it everywhere.

| Variable | Dark theme | Light theme | Used for |
|---|---|---|---|
| `--bg` | `#0b0a10` near-black | `#f4f1ea` paper | page background |
| `--panel` | `#15131d` | `#ffffff` | section boxes |
| `--ink` / `--ink-dim` | off-white / grey-violet | near-black / grey | text |
| `--pink` | `#ff2e97` | `#d1006b` | main accent, buttons, brackets |
| `--cyan` | `#19e3ff` | `#006a80` | second accent, links, hover |
| `--yellow` | `#ffe23d` | `#ffd60a` | stickers, tape |
| `--success` / `--error` | green / red | darker versions | messages |
| `--map-node`, `--map-line` | `r, g, b` numbers | | network map colours (written as numbers because the canvas adds its own transparency) |

The light theme is the block `:root[data-theme="light"] { ... }`. The theme button
(`js/script.js`) only switches the `data-theme` attribute on `<html>`; CSS does the rest.
`js/theme-boot.js` re-applies a saved light theme before the page is drawn, so there's no flash.

**To recolour the site:** change the hex values in section 1 (and in the light block). Keep
text readable: light text on dark backgrounds needs a contrast ratio of at least 4.5 : 1 — check
with any online "contrast checker".

### 11.2 Fonts
Three free Google Fonts, loaded in every page's `<head>`:

| Variable | Font | Used for |
|---|---|---|
| `--font-display` | **Bungee** (blocky street lettering) | your name, big page titles, boot logo, stamp |
| `--font-ui` | **Chakra Petch** (techy sans-serif) | body text, section headings, buttons |
| `--font-mono` | **Share Tech Mono** (terminal look) | labels, stickers, console, HUD text |

To swap one: pick a font on fonts.google.com, replace its name in the `<link href=...>` line of
**every** HTML page, and in the matching variable.

### 11.3 Shapes and layout ideas
- **Cut corners** on buttons and stickers: `clip-path: polygon(...)` slices the corners off;
  the size is `--cut` (section 1).
- **HUD corner brackets** on each section: `.panel::before` (pink, top-left) and
  `.panel::after` (cyan, bottom-right), section 5.
- **Halftone dots** behind the page: a tiny `radial-gradient` repeated every 14 px on `body`.
  Its colour is `--halftone`.
- **Scanlines:** `body::after`, a very faint repeating stripe over the whole screen (dark theme only).
- **Stickers:** `.sticker`, slightly rotated with a clipped corner (section 7). Category colours:
  story art = yellow, anime = cyan, writing = white with a pink outline.
- **Node labels** like "NODE 02 // DOSSIER" above each heading: `.node-label` (section 5).

### 11.4 The God's Banditos logo
Your original logo (masked bandit, halo, circuit lines, purple-to-blue lettering) was redrawn
by hand as **SVG** (Scalable Vector Graphics — a picture described as shapes, so it stays sharp
at any size) in the site's own colours:

| File | What | Used in |
|---|---|---|
| `images/gods-banditos-mark.svg` | Full mark: halo, mask, eyes, scar, circuits, neon glow | Home page logo, boot screen, share card |
| `images/gods-banditos-icon.svg` | Simplified: halo, mask, eyes only (circuits turn to mush when tiny) | Header, footer, browser tab |
| `images/gods-banditos-icon-180.png` | The icon as a picture | Phone home-screen shortcut |
| `images/og-card.png` | 1200 × 630 card with logo, name and tape | Link previews on WhatsApp, Facebook, X |

Colours in the mark: halo and right-hand circuits cyan `#19e3ff`; mask, eyes, scar and
left-hand circuits pink `#ff2e97`. The glow is an SVG `filter` (a blurred copy layered under
the shapes). The mask is filled with the page colour so the circuits disappear behind it.

The **name** isn't part of the image: it's real text (the `h1.wordmark` on the home page) in
Bungee with a pink → violet → cyan gradient (`background-clip: text`), so it can decode,
glitch, and be read by search engines and screen readers.

**To edit the logo:** open the `.svg` in a text editor — each part is labelled in a comment —
or in a free editor such as Inkscape. Change a colour by editing its `stroke="#..."`. If you
change the logo, also regenerate `og-card.png` and the 180 px icon (any image editor can export
a PNG from the SVG).

---

## 12. Every animation and effect

Two files make the motion:
- `js/fx.js` — the original effects (boot, network map, profiler, hold-to-hack, console, reveal).
- `js/flair.js` — the extra layer (decode, roles, tapes, tilt, bursts, stamp, reticle, wipe).

Each script runs every effect inside a `safe(...)` wrapper, so if one breaks, the others still
work, and the site itself never depends on them. **To switch an effect off completely**, delete
or comment out its line at the bottom of the file, e.g. `// safe(initReticle);`.

For each effect below: **what you see → how it works → what to change.**

---

### 12.1 Boot screen — `fx.js` `runBoot`, CSS section 18
**You see:** on the first visit to the home page, a black screen shows the God's Banditos
logo, types four lines ("connecting to the banditos network…", "ACCESS GRANTED") with a
pink-to-cyan bar, then fades.

**How it works:**
1. `theme-boot.js` (in the `<head>`, before anything is drawn) adds the class `is-booting` to
   `<html>` if this is the home page, the visitor hasn't seen it this visit (`sessionStorage`),
   and they haven't asked for reduced motion.
2. CSS shows `.boot` only while `html.is-booting` is set.
3. `runBoot` types the lines two characters at a time (every 18 ms, with a 160 ms pause after
   each line), moves the bar, then removes the class.
4. Any key or tap skips it. A CSS **fail-safe** (`animation: boot-failsafe ... 6s`) hides it
   after 6 seconds even if JavaScript breaks.

**Change:** the text is the `lines` array in `runBoot`. Typing speed: the `18` (ms per step) and
`charIndex += 2` (characters per step). Show it every time instead of once per visit: delete the
`sessionStorage` check in `theme-boot.js`. Force it while testing: add `?boot=1` to the address.

---

### 12.2 Network map — `fx.js` `initNetMap`, CSS section 3
**You see:** faint pink dots drifting behind the page, joined by cyan lines when close; lines
near your mouse glow brighter; now and then a "data packet" runs along a line.

**How it works:**
- A `<canvas>` fixed behind everything (`#net-map`). Each frame clears it and redraws all dots.
- Number of dots = screen area ÷ 26,000, between 18 and 64 (so phones get fewer).
- Each dot moves a little every frame and wraps around the edges. Two dots closer than
  150 px get a line whose transparency fades with distance.
- Scrolling shifts the dots slightly (a parallax effect).
- It draws at most ~30 times a second (`time - lastFrame > 33`), pauses when the tab is hidden,
  and re-reads its colours when the theme changes.

**Change:** density `26000` (smaller = more dots); link distance `maxDist = 150`; speed is the
`* 0.18` in `vx`/`vy`; brightness is `opacity` on `#net-map` in CSS section 3 (`0.8` dark,
`0.5` light). Colours: `--map-node`, `--map-line`.

---

### 12.3 Profiler — `fx.js` "3. PROFILER", CSS section 15
**You see:** pointing at (or tapping) your photos or any work shows a dark scan card with a
cyan scan line: name, then rows like OCCUPATION, LOCATION, FACT.

**How it works:**
- Any element with a `data-profile` attribute is a target. The attribute holds JSON:
  ```html
  <figure data-profile='{
    "name": "Gaming session",
    "kicker": "SCAN",
    "id": "CAM 02",
    "rows": [
      ["ACTIVITY", "Two controllers"],
      ["FACT", "Top hobby"]
    ]}'>
  ```
  Work cards are registered from JavaScript with `MW.profile(element, data)` (`works-grid.js`,
  `work.js`).
- One shared card element is moved next to whichever target is active (right side if it fits,
  otherwise left, otherwise below/above) and kept beside it while you scroll.
- Mouse: opens on hover. Keyboard: opens on focus. Touch: a tap toggles it.
- Screen readers get the same details as hidden text (`aria-describedby`).

**Change the details:** edit the `data-profile` JSON in `index.html` (About photo and the four
gallery photos). Keep the quotes exactly as they are — in HTML the JSON's `"` are written
`&quot;`; the easiest way is to copy an existing one and change only the words.
**Look:** CSS section 15 (`.profiler`, `.profiler-head`, `.profiler-name`).

---

### 12.4 Hold to hack — `fx.js` "4. HOLD-TO-HACK", CSS section 16
**You see:** each project card has a **HOLD TO HACK** button with a ring. Press and hold: the
ring fills; at full, the hidden notes open, the button turns green ("ACCESS GRANTED") and the
card gets a stamp and pixel burst (12.14).

**How it works:**
- The ring is a `conic-gradient` (a pie chart) whose filled angle is the CSS variable
  `--progress` (0 to 1), turned into a ring with a circular `mask`.
- On `pointerdown`, a `requestAnimationFrame` loop sets `--progress` = time held ÷ `HOLD_MS`.
  Letting go early resets it. At 1, the panel named in `aria-controls` is un-hidden and
  `aria-expanded` becomes `true`.
- A keyboard press (Enter/Space) opens it straight away — holding isn't fair to keyboard users.
- Pressing an open file closes it.

**Change:** hold time `HOLD_MS = 800` (milliseconds). Notes: the `hack-reveal` blocks in
`index.html`. Add the feature to any new card by copying a whole `.card` block — the button's
`aria-controls` must match the notes block's `id`.

---

### 12.5 Console — `fx.js` "5. CONSOLE", CSS section 17
**You see:** the `>_ CONSOLE` button (bottom right) opens a terminal. Commands: `help`,
`whoami`, `goto <section>`, `creator`, `works [art|anime|writing]`, `theme [dark|light]`,
`login`, `hack`, `clear`. `goto` knows which page a section is on (e.g. `goto contact` opens
the creator page at the contact form).

**How it works:** the console is built by JavaScript on every page (no HTML needed).
`runCommand` splits what you typed into a command and an argument and runs the matching
`case` in a `switch`. `MW.log(text, type)` prints a line (types `ok`, `warn`, `info`, `you`
pick the colour).

**Add a command:** add a `case` inside `runCommand`, e.g.
```js
case "github":
  window.open("https://github.com/Vamp1-hunid",
              "_blank", "noopener");
  MW.log("OPENING GITHUB", "ok");
  break;
```
and add its name to the `help` line. Sections for `goto` are listed in `SECTIONS`; the ones
that live on the creator page are also in `CREATOR_SECTIONS`.

---

### 12.6 Section scanner wipe — `fx.js` `initReveal`, CSS section 20
**You see:** each section opens from left to right as it scrolls into view, a cyan scan line
sweeps across it, then the corner brackets grow in.

**How it works:**
- Sections with the class `reveal` start hidden with `clip-path: inset(0 100% 0 0)` (everything
  cut away from the right).
- An **IntersectionObserver** (a browser feature that reports when an element enters the screen)
  adds `is-in` when 8 % of a section is visible.
- `is-in` changes the clip to `inset(-80px ...)` (nothing cut, with room for shadows); the
  `transition` animates the change. The scan line is a gradient `background-image` whose
  position is animated (`@keyframes scan-sweep`). The brackets animate their width/height with
  a 0.6 s delay.
- Fail-safe: after 4 seconds every section is shown anyway. Without JavaScript, nothing is hidden
  at all (the hiding rules need the `fx` class that JavaScript adds).

**Change:** wipe speed `0.75s` in `html.fx .reveal`; scan speed `0.9s` in
`html.fx .panel.reveal.is-in`. Make a section reveal: add `reveal` to its `class`.

---

### 12.7 Glitch — `fx.js` `glitch()`, CSS section 6
**You see:** a text "jolt": the element jumps sideways and parts of it are briefly cut off,
with pink and cyan copies behind it.

**How it works:**
- The pink/cyan shadow is permanent on `.glitch` elements (`text-shadow: -2px 0 pink, 2px 0 cyan`).
- `MW.glitch(element)` adds the class `is-glitching` for 0.36 s. That runs
  `@keyframes glitch-jolt`: 3 steps of `translate` + `clip-path: inset(...)`.
- It's used by: titles on hover (12.10), the hero micro-glitch (12.11), liking a work, the
  "hack" command, and hacked project cards.

**Change:** the keyframes `glitch-jolt` (how far it moves, which slices are cut) and `0.32s`.

---

### 12.8 Decode text — `flair.js` `decode()`
**You see:** your name and section headings appear as random symbols that lock into the real
letters from left to right.

**How it works:** for each animation frame, letters before the "settled" point show their real
character and the rest show a random one from `GLYPHS`. The settled point moves from 0 to the
end over the duration. While scrambling, the real text is given to screen readers via
`aria-label`.
- Headings with the attribute `data-decode` decode when they first scroll into view (your name
  waits for the boot screen).
- Every title also decodes again whenever you point at it (12.10).

**Change:** symbols: `GLYPHS`. Speed: the durations passed to `decode(...)` (1000 ms for the name,
650 ms for headings on reveal). Add the effect to a heading: put `data-decode` on it (plain text
only — headings containing links or icons are skipped on purpose).

---

### 12.9 Rotating roles — `flair.js` `initRoles`
**You see:** on the home page, `banditos --make "..."` cycles through story art → anime works
→ fantasy stories → original characters → written chapters. On the creator page,
`whoami --role "..."` cycles through data science student → story artist → anime watcher →
gamer → web developer in training → future unicorn in tech.

**How it works:** the list is stored on the element as JSON:
`<span class="role-cycle" data-roles='["data science student", ...]'>`. A chain of timers
removes one letter every 28 ms, waits 260 ms, types the next role (55–100 ms per letter, a
little random so it feels human), waits 2.2 s, and repeats. Screen readers hear the whole list
once instead of the typing.

**Change:** edit the list in `index.html` (brand) or `creator.html` (you): the `data-roles`
attribute on `.role-cycle`. Inside the HTML the quotes are written `&quot;`. Timing: `wait(28, erase)`, `55 + Math.random() * 45`,
`wait(2200, erase)`. Caret: `.role-cycle.is-typing::after` in CSS section 23.

---

### 12.10 Titles glitch on every hover — `flair.js` `initTitleHover`
**You see:** pointing at any page title, section heading, project title or work title makes it
glitch and re-decode — every time, not only the first time.

**How it works:** one listener on the whole document watches `pointerover`. If the pointer has
just entered something matching `TITLE_SELECTOR` (and wasn't already inside it), it calls
`MW.glitch()` and `decode()` on it. A heading that's still decoding is skipped, so wiggling the
mouse doesn't stack effects. The header brand only glitches (it has two coloured parts, which
decoding would flatten). Mouse only — no effect on touch screens.

**Change:** which elements: `TITLE_SELECTOR = "h1, h2, .card h3, .work-card h3"`. Speed: the
`600` / `420` durations in `initTitleHover`.

---

### 12.11 Micro-glitch on your name — `flair.js` `initMicroGlitch`
**You see:** every 6.5–11.5 seconds, your name gives a small glitch on its own.

**How it works:** a timer that calls `MW.glitch()` on the hero heading, then sets itself again
with a random delay. Skipped while the tab is hidden or the name is decoding.

**Change:** `6500 + Math.random() * 5000` (minimum wait + random extra, in milliseconds).
Keep it at least a few seconds apart: frequent flashing effects can trigger seizures.

---

### 12.12 Sticker tapes, signal bars, sticker slap — CSS section 23
**You see:** two tapes (yellow and pink) crossing the bottom of the home page intro
("GOD'S BANDITOS ✦ STORY ART ✦ ..."), scrolling in opposite directions; animated signal bars on the "Status // building" sticker; stickers that "slap" on.

**How it works:**
- **Tapes:** each `.tape` holds the same text twice, side by side, in two `<span>`s. Both slide
  left by exactly their own width (`@keyframes tape-scroll`, `translateX(-100%)`); when the
  first copy leaves, the second is exactly where the first started, so the loop is seamless.
  The tapes are rotated (`-2.2deg`, `1.6deg`) and hidden from screen readers.
- **Signal bars:** four `<i>` bars of increasing height that fade in turn (`@keyframes signal`,
  with `animation-delay` 0, 0.15, 0.3, 0.45 s).
- **Sticker slap:** `@keyframes sticker-slap` scales from 1.8× and −14° down to normal with a
  springy `cubic-bezier(0.2, 1.6, 0.4, 1)` (the 1.6 makes it overshoot, then settle).

**Change:** tape words — the text inside `.tapes` in `index.html` (keep both spans identical).
Tape speed: `tape-scroll 38s` (yellow) and `46s` (pink); smaller = faster. Tilt: the `rotate()`
values in `.tape-yellow` / `.tape-pink`.

---

### 12.13 3-D tilt and glare — `flair.js` `initTilt`, CSS section 23
**You see:** project cards, work cards, photos, hobby chips and profile stats lean towards your
mouse, lift up, get a pink offset shadow and a soft light reflection.

**How it works:**
- On mouse move over an element matching `TILT_SELECTOR`, the script works out where the
  pointer is inside it (−0.5 to +0.5 across and down) and sets CSS variables `--tilt-x`,
  `--tilt-y` (degrees) and `--glare-x`, `--glare-y` (percent). It does this at most once per
  frame (`requestAnimationFrame`).
- CSS turns those into a 3-D turn:
  ```css
  transform: perspective(900px)
             rotateX(var(--tilt-x))
             rotateY(var(--tilt-y))
             translateY(-3px);
  ```
  `perspective` is what makes it look 3-D (smaller = more dramatic).
- The glare is a `radial-gradient` in `::after`, centred at `--glare-x/--glare-y`.
- Only on devices with a real mouse (`(hover: hover) and (pointer: fine)`).

**Change:** strength — `strength = ... ? 10 : 7` (degrees). Which elements — `TILT_SELECTOR`.
Depth — `perspective(900px)`. Glare brightness — `rgba(255, 255, 255, 0.16)` in `.tilt::after`.

---

### 12.14 Pixel bursts and the ACCESS GRANTED stamp — `flair.js` `burst`, `initStamps`
**You see:** clicking a button or link throws 8 little square pixels (pink, cyan, yellow, green)
that fly out and fall. Hacking a project file throws 16 and stamps "ACCESS GRANTED" over the card.

**How it works:**
- Each pixel is a tiny `<span class="pixel">` placed at the click point. The **Web Animations
  API** (`element.animate(...)`) moves it outward at an angle with a little extra downward drift
  ("gravity"), shrinks and fades it, then removes it.
- A `MutationObserver` (a browser feature that reports attribute changes) watches each hack
  button's `aria-expanded`. When it turns `true`, the stamp is added and removed after 1.9 s.
  The stamp's slam-and-fade is `@keyframes stamp`.

**Change:** colours `COLOURS`; click burst `burst(x, y, 8, 46)` (count, spread in px); stamp
burst `burst(..., 16, 80)`; stamp words in `initStamps`; stamp look `.stamp` in CSS section 23.

---

### 12.15 Thumbnail colour-split, button shine, nav underline — CSS section 23
- **Work thumbnails** (`@keyframes thumb-jolt`): on hover the image jumps in three steps with
  pink and cyan `drop-shadow` copies — a quick colour split.
- **Button shine** (`@keyframes shine`): a skewed white gradient in `.btn::after` slides across
  the button once on hover.
- **Nav underline:** `.site-nav a::after` is a 2 px bar with `transform: scaleX(0)`; on hover it
  becomes `scaleX(1)`, growing from the left.

**Change:** durations in each rule; shine brightness `rgba(255, 255, 255, 0.45)`.

---

### 12.16 Targeting reticle — `flair.js` `initReticle`, CSS section 23
**You see:** a pink ring with crosshair ticks trailing your mouse (desktop only). Over anything
clickable it grows and turns cyan; it shrinks while you click. Your normal cursor stays visible.

**How it works:** the script remembers where the mouse is; each frame the ring moves 22 % of the
remaining distance towards it (`rx += (x - rx) * 0.22`), which gives a smooth trailing lag. The
loop stops itself once the ring has caught up, so it costs nothing while the mouse is still.
Classes `is-hot` (over links/buttons/inputs/profiler targets) and `is-down` change its size and
colour through CSS transitions.

**Change:** lag `0.22` (smaller = lazier); size and colours in `.reticle`, `.reticle.is-hot`,
`.reticle.is-down`. Remove it: delete `safe(initReticle);`.

---

### 12.17 Page wipe between pages — `flair.js` `initPageWipe`, `theme-boot.js`, CSS section 23
**You see:** clicking a link to another page of the site slides a striped
"GOD'S BANDITOS ▸ ROUTING" cover across the screen; the next page slides it away.

**How it works:**
1. On a click on a link to another page *of this site* (not new tabs, downloads, links to a
   section on the same page, Google sign-in, or images), the script stops the browser from
   leaving, sets `sessionStorage "mw-wipe"`, adds `is-wiping wipe-in` to `<html>` and leaves
   230 ms later.
2. The cover is `html.is-wiping::after` — a fixed, full-screen pseudo-element with diagonal
   stripes. `wipe-in` animates its `clip-path` from fully cut to fully shown.
3. On the new page, `theme-boot.js` sees `mw-wipe` and adds `is-wiping` *before the page is
   drawn*, so it starts covered. `flair.js` then adds `wipe-out`, which slides the cover away.
4. Fail-safes: the cover hides itself after 1.5 s even if JavaScript fails, and the Back button
   (which can restore a page from memory) clears it too.

**Change:** delay before leaving `230` (ms); text — the `content:` in `html.is-wiping::after`;
stripes — the `repeating-linear-gradient`. Turn off — delete `safe(initPageWipe);` and the
"mw-wipe" block in `theme-boot.js`.

---

### 12.18 Scroll progress bar — `flair.js` `initProgress`, CSS section 23
**You see:** a 3 px pink-yellow-cyan bar along the very top that grows as you scroll.

**How it works:** on scroll (at most once per frame) it sets
`transform: scaleX(scrolled ÷ (page height − window height))`. `scaleX` stretches the bar from
the left (`transform-origin: left`) without making the browser redo the page layout.

**Change:** thickness `height: 3px` and colours in `.scroll-progress`.

---

### 12.19 Smaller effects
| Effect | Where | Notes |
|---|---|---|
| Logo float and glow on the home page | CSS section 24 `.hero-logo` | `@keyframes logo-float`, 5 s: drifts up 8 px and the glow shifts pink → cyan |
| Profiler on the home page logo | `index.html` `.hero-logo-wrap` | "BRAND SCAN" card (12.3) |
| Blinking cursor on the 404 page | CSS `.cursor-blink` | `@keyframes blink` |
| "hack" easter egg — type h-a-c-k anywhere | `fx.js` `initEasterEgg` / `breach` | glitches up to 10 headings, 90 ms apart |
| Liking a work glitches its title | `work.js` | `MW.glitch(...)` |
| Pop-up messages (toasts) | `api.js` `MW.toast`, CSS section 19 | disappear after 4.2 s |
| Work card hover lift | CSS section 12 | `translateY(-3px)` + image zoom `scale(1.04)` |

---

### 12.20 Complete index of every animation in the code

Nothing on the site moves except what's listed here. CSS **keyframe animations** are
in `public/css/styles.css`; search the file for the name.

**Keyframe animations (`@keyframes`)**

- **`glitch-jolt`** — 0.32 s, 3 steps. The text jolt. Started by adding `is-glitching`
  (titles on hover, name micro-glitch, likes, "hack", hacked cards). See 12.7.
- **`logo-float`** — 5 s forever. The home page logo drifts up and down while its glow
  breathes from pink to cyan.
- **`blink`** — 1 s on/off forever. The `_` cursor on the 404 page and the `▌` caret
  after the rotating role.
- **`profiler-scan`** — 0.9 s once. The cyan line that sweeps down the profiler card
  each time it opens. See 12.3.
- **`boot-failsafe`** — hides the boot screen after 6 s if JavaScript stalls. See 12.1.
- **`toast-in`** — 0.2 s. Pop-up messages slide up and fade in.
- **`scan-sweep`** — 0.9 s once. The cyan scan line across a section as it opens.
  See 12.6.
- **`signal`** — 1.2 s forever. The four signal bars on the status sticker. See 12.12.
- **`sticker-slap`** — 0.45 s once, springy. Stickers slapping on. See 12.12.
- **`tape-scroll`** — 38 s (yellow) and 46 s (pink), forever. The sticker tapes.
  See 12.12.
- **`thumb-jolt`** — 0.36 s, 3 steps. Colour-split on work thumbnails when pointed at.
  See 12.15.
- **`shine`** — 0.6 s once. The light sweep across a button on hover. See 12.15.
- **`stamp`** — 1.9 s once. ACCESS GRANTED slams on, holds, fades. See 12.14.
- **`wipe-in`** — 0.22 s. The striped cover sliding over the page when leaving it.
  See 12.17.
- **`wipe-out`** — 0.4 s. The cover sliding away on the new page. See 12.17.
- **`wipe-failsafe`** — uncovers the page after 1.5 s if JavaScript stalls.

**Transitions (smooth changes when something's state changes)**

- **Buttons** — colour and a 1 px press-down, 0.15 s.
- **Form fields** — border colour and cyan focus glow, 0.15 s.
- **Work cards** — lift 3 px and pink border on hover, 0.18 s; image zooms to 104 %, 0.3 s.
- **Profiler card** — fades in and rises 6 px, 0.16 s.
- **Console** — fades in and rises 10 px, 0.2 s.
- **Boot screen** — fades out, 0.35 s.
- **Section reveal** — the left-to-right `clip-path` wipe, 0.75 s, with a fast-start,
  slow-finish curve; corner brackets grow 0.35 s after a 0.6 s delay.
- **Tilt** — leaning eases back over 0.25 s when the mouse leaves; while moving it follows
  within 0.08 s so it feels attached to the pointer.
- **Glare** — fades in and out, 0.25 s.
- **Nav underline** — grows from the left, 0.2 s.
- **Reticle** — appears, grows, shrinks and changes colour, 0.18–0.2 s.

**Animations driven by JavaScript (no CSS keyframes)**

- **Boot typing** and **progress bar** — `fx.js` `runBoot` (timers).
- **Network map** — `fx.js` `initNetMap` (canvas, ~30 frames a second).
- **Hold-to-hack ring** — `fx.js` `wireHack` (`requestAnimationFrame` sets `--progress`).
- **Decode text** — `flair.js` `decode` (`requestAnimationFrame`, random glyphs).
- **Rotating roles** — `flair.js` `initRoles` (timers typing and deleting).
- **Name micro-glitch** — `flair.js` `initMicroGlitch` (random timer).
- **Tilt and glare position** — `flair.js` `initTilt` (sets CSS variables each frame).
- **Pixel bursts** — `flair.js` `burst` (Web Animations API).
- **Reticle trailing** — `flair.js` `initReticle` (eases 22 % of the gap per frame).
- **Scroll progress** — `flair.js` `initProgress` (sets `scaleX` on scroll).
- **Page wipe timing** — `flair.js` `initPageWipe` (230 ms delay, then leaves).
- **"hack" easter egg** — `fx.js` `breach` (glitches headings 90 ms apart).

---

### 12.21 How the effects behave on phones

Phones have no mouse, so effects that need one switch themselves off. The code checks
`(hover: hover) and (pointer: fine)`, which is true only for a real mouse or trackpad.

| Effect | On a phone |
|---|---|
| Boot, decode, roles, tapes, logo float | Same as desktop |
| Section scanner wipe | Same as desktop |
| Network map | Fewer dots (it scales with screen size) |
| Profiler | **Tap** a photo to open, tap again to close |
| Hold to hack | **Press and hold** with your finger |
| Pixel bursts | Same, where you tap |
| Page wipe, progress bar | Same as desktop |
| Console | Shrinks to a `>_` square |
| Tilt and glare | Off (needs a mouse) |
| Title glitch on hover | Off (no hover) |
| Thumbnail colour-split | Off (no hover) |
| Button shine | Off (no hover) |
| Reticle | Off (no mouse to follow) |

To add something for touch screens only, wrap the CSS in
`@media (hover: none) { ... }`.

---

## 13. Reduced motion and accessibility

Some people get dizzy or unwell from on-screen motion and switch on **Reduce motion**
(Windows: Settings → Accessibility → Visual effects → Animation effects off; Android/iPhone:
Accessibility settings). The site respects it at three levels:

1. `theme-boot.js` skips the boot screen and the page wipe.
2. `flair.js` stops on its first lines (`if (calm) { ... return; }`), so no decode, roles, tilt,
   bursts, reticle, progress bar or wipes. `fx.js` skips the network map and typing, opens
   hack files instantly, and shows every section at once.
3. CSS section 22 (`@media (prefers-reduced-motion: reduce)`) shortens every remaining animation
   and transition to almost zero and stops the tapes.

**Test it** without changing your device: in Chrome, DevTools (F12) → ⋮ menu → More tools →
**Rendering** → "Emulate CSS media feature prefers-reduced-motion" → `reduce`.

Other accessibility built in: a "Skip to main content" link; every image has `alt` text; every
form field has a label and its own error message; focus outlines are visible; hold-to-hack and the
profiler work from the keyboard; decorative effects are hidden from screen readers; no effect
flashes more than about three times a second.

---

## 14. Everyday tasks

### 14.1 Post a new work
1. Go to `/login` and log in as `mwamba` (or with Google once it's linked).
2. Open `/admin`.
3. Fill in a title, pick **Story art**, **Anime works** or **Writing**, choose an image
   (needed for art; optional for writing), add a short description and, if you like, the text
   of a chapter or notes about the piece.
4. Untick **Published** to save it as a hidden draft; tick it later to publish.
5. Press **Publish**. It appears in Latest works, the Works page and the sitemap straight away.

Edit or delete from the list on the right of the admin page, or from the **Edit** button on
the work's own page. Deleting asks you to press twice so a slip doesn't delete anything.

### 14.2 Moderate comments
As admin you see a **Delete** button on every comment. Members see it only on their own.

### 14.3 Change text on the pages
The pages are plain HTML in `public/`. Open the file, change the words, commit, push — Render
redeploys in a few minutes.
- Brand home: `public/index.html` (tagline, "What we make" tiles, "Meet the creator").
- Your page: `public/creator.html` (about, hobbies, plan, projects, photos, media, contact).
- Rotating lines: the `data-roles` lists (12.9). Tapes: the `.tapes` block (12.12).
- Profiler cards: the `data-profile` attributes (12.3).

**The header, navigation and footer are repeated in every page.** To change them (for
example to add a nav link), make the same edit in all nine page files: `index`, `creator`,
`gallery`, `work`, `login`, `register`, `profile`, `admin`, `404`. In VS Code, **Edit → Replace
in Files** (Ctrl+Shift+H) does it in one go.

### 14.4 Add a new page
1. Copy `public/404.html` to e.g. `public/universe.html` — it has the full header and footer.
2. Change the `<title>`, the `description`, `data-page="..."` on `<body>`, and the content
   inside `<main>`.
3. It's automatically available at `/universe` (the server tries `.html` for you).
4. Add a link to it in the navigation (14.3) and, so Google finds it, add a line in
   `src/routes/seo.js` next to `/creator`.

### 14.5 Change colours, fonts or the logo
See section 11. Colours: variables at the top of `styles.css`. Fonts: the Google Fonts link
in every page plus the `--font-...` variables. Logo: section 11.4.

### 14.6 Turn an effect down or off
Each effect in section 12 ends with **Change**. To remove one completely, comment out its
`safe(...)` line at the bottom of `fx.js` or `flair.js`.

### 14.7 Change the site address
`mulenga-mwamba-website.onrender.com` comes from the Render service name and can't be
renamed. Options:
- **Your own domain** (e.g. `godsbanditos.com`, bought from a registrar such as Namecheap or
  Cloudflare): Render → Settings → **Custom Domains** → add it and follow the DNS steps. Then set
  `PUBLIC_URL` on Render, add the new `/auth/google/callback` address to your Google client,
  update the `og:image` address in every page, and add the new address in Search Console.
- **A new free Render address**: create another Web Service with the name you want (for example
  `gods-banditos`), copy the environment variables over, then delete the old service.

---

## 15. Running the site on your laptop

You need **Node.js 20 or newer** (nodejs.org) and **Git**.

```bash
git clone https://github.com/Vamp1-hunid/Website-about-me.git
cd Website-about-me
git checkout main
npm install
```

Create your `.env` (copy `.env.example` and fill it in). For a test database, either use a
second Neon **branch** (Neon → Branches → New branch — a free copy you can mess up safely)
or install PostgreSQL locally. Leave `CLOUDINARY_URL` empty: uploads then go to
`public/uploads/` on your laptop.

```bash
npm start          # or: npm run dev  (restarts when you save a file)
```

Open http://localhost:3000. The admin account is created from `ADMIN_USERNAME` and
`ADMIN_PASSWORD` the first time the server starts.

### How it was tested
- **Real database:** a local PostgreSQL 16.
- **Real browser:** headless Chrome driven by Playwright (a tool that clicks through pages
  automatically), at desktop size and at phone sizes 360 × 740 and 390 × 844.
- **Covered:** registering (including bad input), logging in and out, liking, saving, commenting
  (a comment containing `<script>` must show as plain text), members being refused from admin,
  uploading, editing, drafting and deleting works, the four ICT251 features, the console,
  hold-to-hack, profiler, every animation, page wipes and the Back button, reduced motion,
  password changes and resets, every Google sign-in path (with a stand-in for Google), and a scan
  of every page for anything wider than the screen or too small to tap.

---

## 16. Deploying, and fixing a failed deploy

**Normal deploy:** commit and push to `main`. Render notices, runs `npm install` then
`npm start`, and switches over when the new version is ready (2–4 minutes). Watch it in
Render → your service → **Events** and **Logs**.

**If a deploy fails,** open **Logs** and read the last red lines:

| Message in the logs | Cause | Fix |
|---|---|---|
| `DATABASE_URL is not set` | Setting missing | Add it under Environment (6.3) |
| `password authentication failed` | Wrong or reset Neon password | Copy a fresh string from Neon → Connect |
| `getaddrinfo ENOTFOUND` | Database address mistyped | Paste the whole string again |
| `SESSION_SECRET must be set` | Missing or under 32 characters | Use Render's **Generate** button |
| `CLOUDINARY_URL does not look right` | Template placeholders left in, or extra text | Replace `<your_api_key>`/`<your_api_secret>` with real values |
| `npm ERR!` during build | A broken `package.json` | Undo the last change to it |
| `Cannot find module` | A file was renamed or deleted but still required | Fix the `require(...)` path |

The very first failed deploy was a crash caused by a messy pasted setting; `src/env.js` now
cleans those up, so most paste mistakes produce a warning instead of a crash.

**After a deploy, pages look old?** The server tells browsers to re-check pages, styles and
scripts on every visit, so a normal refresh shows the new version. Photos and video are kept for
a week — if you replace an image with a new one of the **same name**, give it a new name instead.

**Rolling back:** Render → **Events** → pick an earlier successful deploy → **Rollback**.

---

## 17. Free-plan limits and known gaps

| Limit | What it means | Way around it |
|---|---|---|
| Render free web service sleeps after 15 minutes without visitors | The first visit after that waits about a minute | Accept it, or a paid instance ($7/month) stays awake |
| Render free disk is wiped on restart | Nothing saved on the server survives | That's why images go to Cloudinary and data to Neon |
| Render free plan has 750 instance hours a month per workspace | Shared by all your free services | Plenty for one site that sleeps when idle |
| Neon free tier | Small storage and compute; the database pauses when idle and wakes in about a second | Plenty for this site |
| Cloudinary free tier | A monthly allowance of storage and bandwidth | Plenty for a personal art archive |

Known gaps you may want later:
- **Forgotten passwords for members** — there is no "email me a reset link" (the site doesn't
  collect emails for password accounts). Members who signed up with Google can always log in
  with Google; you, as admin, can reset yours from Render (section 7).
- **Contact form** — sends messages to `CONTACT_EMAIL` once email is set up; until then they're
  only saved in the dashboard Inbox.
- **One admin** — only the account named in `ADMIN_USERNAME` can post.
- **`Activity1.html`** — your old Activity 1 page is still public and shows your student number;
  delete it from `public/` if it's no longer needed for marking.

---

*Built with Node.js, Express, PostgreSQL (Neon), Cloudinary, Google sign-in and a lot of CSS.
Created for God's Banditos by Mulenga Mwamba.*


---

## Version 3 (November 2026): dashboard, stories, characters and more

**New pages:** `/stories`, `/stories/<name>`, `/characters/<name>`, `/products`, `/search`,
`/u/<username>`, `/forgot`, `/reset`. The admin page became a tabbed dashboard (see README).

**New database tables** (created automatically by `db/schema.sql` on start; older databases are
upgraded in place, and old single-image works are moved into `post_media`):
`series` (stories: logline, cover), `post_media` (every file of a work, in order, with a
page/cover role), `characters` + `character_media`, `products`, `contact_messages`,
`password_resets` (only SHA-256 hashes of reset links are stored). New columns on `posts`:
`logline`, `section` (main / concept-art), `publish_at` (scheduling), `tags`, `series_id`,
`series_order`, `font`; on `comments`: `parent_id` (replies), `edited_at`; on `users`:
`avatar_url`.

**Uploads:** big files no longer pass through Render. The browser asks `/api/admin/media/ticket`
for a signed Cloudinary upload, sends the file straight to Cloudinary, then the save request
carries Cloudinary's receipt, which the server verifies with your API secret before trusting it.
Documents (PDF, Word, EPUB ...) are stored as Cloudinary "raw" files. On a laptop without
Cloudinary, files go to `public/uploads/` instead.

**Scheduling:** a work is public when `published` is true and `publish_at` is empty or in the past.
Every public query (lists, search, story pages, sitemap, comments, likes) uses that rule, so a
scheduled work appears by itself at the right time without any timer.

**Email:** `src/mail.js` sends through Brevo or Resend (whichever key is set). Used for
"Forgot password" links (valid 60 minutes, once; at most 3 per account per hour) and for
contact-form messages with Reply-To set to the visitor.

**New settings on Render:** `BREVO_API_KEY` (or `RESEND_API_KEY`), `MAIL_FROM`, `CONTACT_EMAIL`.
All optional; the dashboard's Settings tab shows which are working.


---

## Version 4 (November 2026): Afterframe, the creator platform

**Two front doors, one server.** God's Banditos pages show only works owned by the admin
(`BANDITOS_ONLY` in `src/routes/posts.js`). Afterframe pages live under `/hub` (and `public/hub/`),
use `css/afterframe.css` on top of `styles.css`, and set `data-brand="afterframe"` on `<body>`, which
`js/api.js` reads to choose links, the ☰ menu and search. Moving Afterframe to its own domain later
only needs a redirect from the new domain to `/hub`.

**Ownership.** `posts`, `series` and `characters` have a `user_id`. On start-up `src/migrate.js` gives
anything without an owner to the admin and creates the admin's creator profile `@gods-banditos`.
`requireCreator` (src/auth.js) lets the admin and approved creators publish; every edit and delete
checks the owner.

**New tables:** `creator_profiles` (handle, bio, links, banner, status pending/approved/rejected/
suspended, featured, can_write_news), `follows`, `reports`; new columns `users.feed_seen_at`,
`users.terms_accepted_at`. A work is public only when its creator is approved, so suspending a
creator hides their work everywhere.

**Server-side previews.** `src/pages.js` fills in the title, description, Open Graph tags, canonical
link and JSON-LD for work, story, character, creator and news pages before sending them.

**Legal pages** (`public/legal/`) are drafts written as a starting point: have a Zambian lawyer review
them. Sign-up now requires accepting the Terms and Privacy Policy; applying as a creator requires
accepting the Creator Agreement and Content Rules.


---

## Versions 5–17 (November 2026): Chapterhive, from creator platform to pre-launch

Everything from here on was added on top of Version 4. Afterframe was renamed **Chapterhive** and
given a honey-and-hive theme. God's Banditos (`/`) stayed as the owner's view-only showcase.
Each version below was opened as a pull request and merged into `main`. Render deploys `main`
automatically.

### At a glance: which pull request added what

| Version / PR | What it added |
|---|---|
| v5 (#9) | Reviews, Manage users, notification bell, first feature switches, polls, help, Sponsor page; rename to Chapterhive with the hive theme |
| v6 (#10) | No page loader; News & updates; search filters; brighter light/dark themes; guest previews; God's Banditos owner-only login, view-only for everyone else |
| v7 (#11) | International-standard sign-up (date of birth 13+, teen accounts, country, gender, email verification, strong passwords); one-to-one chat |
| v8 (#12) | Browse shelves; Site features tab with live / queued / suspended and scheduled launches; book, song, trailer, tutorial and other categories; creator tribute; queued Premium; Instagram-style feed; top-creator rankings with bee badges; organisation accounts |
| v9 (#13) | Cinematic welcome with interests survey; personalised "For you" feed with See more / less; member bios; search beside the tabs; Settings page with privacy controls |
| v10 (#14) | Welcome wording fixes; clearer search; Fund the heist and suggestion box visible to everyone |
| v11 (#15) | Pre-launch username reservation campaign |
| v12 (#16) | Daily Bible verse, content filters, student verification, skills, tutorials, collab posts, group chats, private posts, web comic panel maker, whistleblower badge, calendar |
| v13 (#17) | Compact phone layout; Reserve moved out of the header |
| v14 (#18) | Official account: grand golden circle with a verified tick |
| v15 (#19) | Role tags (👑 Chapterhive founder, top creator, 🧪 Beta tester); team-only log in before launch |
| v16 (#20) | Beta tester applications; reservations with passwords; numbered reservation list with Excel/PDF download; owner's nickname at #1; public list of reserved usernames; reserved members can sign in before launch; admin applications in the bell and menu; "Let beta testers message me"; readers welcome; profile links in the menu |
| v17 (#21 and the next PR) | Owner's nickname also renames the creator page handle; profiles moved to Chapterhive (`/hub/profile`, `/hub/u/<name>`); stricter username rules with a live preview |

### The Chapterhive pages

All Chapterhive pages live in `public/hub/` and set `data-brand="chapterhive"` on `<body>`.
`js/api.js` reads that to pick the header, ☰ menu, search and banners. They load
`css/styles.css` and then `css/chapterhive.css`. New pages are made by copying
`public/hub/sponsor.html` and replacing its `<main>`, title, meta tags and page script.

| Address | File | What it is |
|---|---|---|
| `/hub` | `hub/index.html` | Home: banners, stories row, shelves, the member feed |
| `/hub/creators`, `/hub/c/<handle>` | `creators.html`, `creator.html` | Creator list and creator pages |
| `/hub/top` | `top.html` | Top 10 overall and top 5 per shelf |
| `/hub/feed` | `feed.html` | Following feed (members only) |
| `/hub/news` | `news.html` | News & updates (team posts) |
| `/hub/search` | `search.html` | Search with filters |
| `/hub/w/<slug>`, `/hub/s/<slug>` | `work.html`, `story.html` | A work and a story |
| `/hub/studio` | `studio.html` | Creator studio |
| `/hub/apply` | `apply.html` | Apply to become a creator |
| `/hub/collabs` | `collabs.html`, `collab.html` | Collab board |
| `/hub/chat` | `chat.html` | One-to-one and group chats |
| `/hub/settings` | `settings.html` | Settings & privacy |
| `/hub/profile` | `profile.html` | Edit my profile (picture, bio, email, password, Google link) |
| `/hub/u/<username>` | `user.html` | A member's public page |
| `/hub/register`, `/hub/login`, `/hub/verify` | | Sign-up, log in, email verification |
| `/hub/join-organisation` | `join-organisation.html` | Organisation account sign-up |
| `/hub/reserve` | `reserve.html` | Reservation campaign, public list, admin list |
| `/hub/beta` | `beta.html` | Beta tester application and admin review |
| `/hub/calendar` | `calendar.html` | Holidays, international days, site events |
| `/hub/comic-maker` | `comic-maker.html` | Web comic panel maker |
| `/hub/premium`, `/hub/sponsor` | | Premium (queued) and Sponsor & business |

The old addresses `/profile` and `/u/<username>` now redirect to the Chapterhive versions, so
editing your profile never drops you onto God's Banditos.

### Accounts and sign-up (`src/signup.js`, `src/routes/account.js`, `src/users.js`)

- **Date of birth is required.** Under 13 is refused and nothing is stored. Ages 13–17 get teen
  accounts (`signup.isMinor`); teens can only chat with teens.
- **Country** and **gender** (Male / Female / Prefer not to say; private) are asked at sign-up.
- **Email is required** and verified by a link (`/hub/verify`). Reservations claimed with the same
  email are verified automatically.
- **Passwords** must be strong (`signup.passwordProblem`): at least 10 characters, not the
  username, not a common password.
- **Terms**: accepting the Terms and Privacy Policy is required (`TERMS_VERSION` is stored).
- **Organisation accounts** (`account_type = 'organisation'`, table `organisations`): one shared
  account for a group, with its creator application.
- **Everyone starts as a member.** Readers, watchers and listeners use a free member account.
  Anyone can later apply at `/hub/apply` to become a creator, for free, with the same account.

**Username rules (v17).** Checked in `users.usernameProblem` on the server and shown live in the
browser by `MW.usernamePreview` (in `js/api.js`):

- 3–30 characters: lowercase letters and numbers, with **at least one `_` or `-`**
  (`bee_reader`, `bee-reader`). `_` and `-` can't be first, last or doubled.
- No capital letters, spaces, emoji or symbols. The browser removes them as you type.
- Names are compared ignoring case, so `Bee_Reader` can never sit beside `bee_reader`.
- Reserved words (admin, hub, support …) and other people's reserved names are refused.
- **Existing accounts keep their names.** Names reserved before the rule (claimed with their
  link) and older beta applications still work.
- The preview shows `@yourname` under the box with "✓ looks good" or what to fix. It appears on
  the reservation, beta, sign-up and organisation pages and in the owner's nickname box.

**Google sign-in** (`src/routes/google.js`) works for sign-up, log in and linking. To link Google
to an existing account (including the admin's), log in, open **✏️ Edit my profile**
(`/hub/profile`) and press the Google button. See "Setting up Google sign-in" below.

### Settings & privacy (`/hub/settings`, `js/settings.js`, `PUT /api/account/privacy`)

| Setting | Column | Choices |
|---|---|---|
| Show when I'm active | `users.show_online` | on / off |
| Who can message me | `users.chat_privacy` | everyone / creators I follow / nobody |
| 🧪 Let beta testers message me | `users.beta_can_message` | on / off; beta testers can start a chat even when the choice above would stop them |
| Let members see my page | `users.profile_visible` | on / off |
| Who can see my posts (creators) | `creator_profiles.post_visibility` | everyone / members / followers |
| Content filter | `users.max_rating`, `users.hide_strong_language` | All ages / Teen / Mature 18+ (adults only); hide strong language |
| Daily Bible verse | `users.daily_verse` | on / off; shows a reference and a Good News Translation link, no copied text |
| Student verification | `users.school_email`, `school_verified_at` | verify a school email for a student badge |
| Reset my feed | `user_interests` | clears the personalisation |

Chat also needs a date of birth on **both** accounts. It keeps teen and adult spaces apart, so an
account without one (including the admin's) can't receive messages until one is added.

### The feed, rankings and badges

- **Feed** (`src/interests.js`): members get a personalised "For you" feed built from the welcome
  survey and every "See more / See less". Visitors without an account see shelves, not a feed.
- **Rankings** (`src/rankings.js`, table `creator_ranks`) refresh every 30 minutes: top 10 overall
  and top 5 per shelf. Badges: 🐝 Bumblebee (#1), Honey Bee (top 3), Worker Bee (top 10), Mason Bee
  and Busy Bee for shelves. Ranked creators get a small boost in feeds.
- **Role tags** (`src/trust.js` → `roleTags`): 👑 Chapterhive founder (the owner), top creator,
  🧪 Beta tester. **Trust badges**: student, whistleblower (after 3 upheld reports). **Skills**
  under the bio (Writer, Poet, Manga artist …).
- **Official account**: the owner's story circle is a gold ring with a blue verified tick that glows.

### Posts and creating (`src/routes/posts.js`, `src/publishing.js`)

- **Categories**: novel, storybook, educational, poetry, song, story-art, art, anime, film, series,
  trailer, writing, comedy, meme, thoughts, tutorial; plus **genres**.
- **No live-action skits**: comedy and meme posts can't contain video. Comedy films and series,
  and authorised creators' trailers, are fine.
- **Visibility per post** (everyone / members / followers), on top of the creator-wide setting.
  The admin can see every post for moderation (`audienceSql` admin bypass).
- **Collab posts** (`post_collaborators`): invite other creators; they appear on the post.
- **Web comic panel maker** (`/hub/comic-maker`).
- **Content filters** apply to every list (`contentFilterSql`).

### Chat (`src/routes/chat.js`)

One-to-one threads (`chat_threads`, `chat_messages`), blocking (`chat_blocks`), reporting, and group
chats (`chat_groups`, `chat_group_members`, `chat_group_messages`). Teen and adult accounts can't
chat with each other. The receiver's "Who can message me" choice is respected, except that beta
testers get through when the receiver has "Let beta testers message me" on.

### Calendar (`src/calendar.js`, `/hub/calendar`)

Zambian public holidays, international days and events the admin adds (table `calendar_events`).
On the day, the home page shows a banner and the site can switch to a holiday theme
(`body[data-holiday]`).

### Site features switches (`src/flags.js`, Admin → Site features)

Every feature has an audience: **live** for everyone, admin only, beta testers, **queued**
(off, with an optional scheduled launch time) or **suspended**. When a feature isn't live you choose
how visitors see it: hidden, "Coming soon" or "Under maintenance". The server enforces this with
`requireFlag(key)` (answers 503 with your chosen wording). The browser hides or labels links with
`MW.feature`, `MW.featureNotice` and `gatePage`.

| Key | Feature | Starts as |
|---|---|---|
| `signups` | New accounts | live |
| `reservations` | Pre-launch username reservations | off |
| `chat`, `group_chats` | Chat, group chats | live |
| `comments`, `likes`, `follows` | Comments, likes & saves, following | live |
| `notifications`, `streaks`, `online_status` | Bell, streaks, online status | admin |
| `daily_verse`, `calendar`, `rankings` | Verse, calendar, top creators | live |
| `creating`, `creator_applications`, `collabs`, `comic_maker` | Posting, applications, collab board, comic maker | live |
| `polls` | Polls & questionnaires | admin |
| `donations` | Fund the heist (God's Banditos) | live |
| `hub_support`, `sponsor_page`, `premium` | Fund the heist on Chapterhive, Sponsor page, Premium | admin (Premium is built but queued) |
| `updates`, `search` | News & updates, search | live |
| `help_assistant`, `suggestion_box`, `quick_tips` | Help assistant, suggestion box, quick tips | admin |

### The pre-launch campaign (v11, v15, v16)

**Running it:** in Admin → Site features, turn **Pre-launch username reservations** on and
**New accounts** off. That is what the code calls "pre-launch".

**What visitors see**

- The home page shows two cards: **🐝 Chapterhive opens soon · Reserve** and
  **🧪 Become a beta tester · Apply**. Both are also in the ☰ menu.
- The Join page sends people to `/hub/reserve`.
- `/hub/reserve` explains that readers, watchers and creators are all welcome. Everyone gets a free
  member account and can upgrade to creator later.

**Reserving** (`POST /api/reserve`, `src/routes/reserve.js`)

- The form asks for a username (with live preview and availability check), an optional name,
  email (one per person), a **password**, date of birth (13+, checked but not stored for
  password-less reservations) and country.
- **With a password the account is created straight away** (a normal member account), so at
  launch people just log in. Older reservations without a password are claimed later with a
  link (`/hub/register?claim=<token>`).
- After reserving, the page says **"You're #N on the reservation list"**. The confirmation email
  says the same, and the browser remembers the name so it's highlighted on the list.

**The public list** (`GET /api/reserve/list`)

- The reservation page shows every reserved username, numbered from #1, with a search box.
- Only the number and the username are sent. Names, emails and everything else stay in the admin
  list. A test checks this.

**Signing in before launch** (`src/prelaunch.js`)

- Anyone with an account can log in before launch. The home page greets them with
  **"You're in early!"** and buttons to **My place** (the list) and **Updates** (News & updates).
- Until launch, people who aren't admin or beta testers can't make changes: no posting,
  comments, follows, chat and so on. `guardWrites` answers 403 with a friendly message.
  Account settings, notifications, reservations, beta applications, contact and help keep
  working.
- The admin and beta testers can use everything.

**Beta testers** (`src/routes/beta.js`, table `beta_applications`)

- `/hub/beta` asks for email, the username wanted (or keep the one already reserved/owned), a
  name, date of birth, country and why they'd like to test.
- You review at `/hub/beta#beta-admin`: **Approve** or **Decline**.
- Approving holds the name as a reservation marked `beta` and emails a set-up link. If email
  isn't configured, the link is shown with a **Copy link** button to send yourself. If the person
  already has an account, it simply becomes a beta account.
- Claiming the link creates a normal member account with `users.is_beta = TRUE`. Beta testers can
  log in and use the site before launch and wear the 🧪 Beta tester tag.

**At launch**

1. Turn **New accounts** back on (and reservations off when you're ready).
2. Press **Send claim links** on the reservation list for the older, password-less reservations.
3. Everyone who reserved with a password just logs in.

### The admin's tools

- **☰ menu (admin):** Dashboard, Site settings, 🐝 Name reservations, 🧪 Beta tester applications,
  🎨 Creator applications. Each has a number badge: reservations shows the total; beta and
  creators show how many are waiting (`GET /api/reserve/admin/counts`).
- **Dashboard:** an **Applications** row under the tabs with the same three links and badges.
- **Notification bell:** you get a note for every new reservation (with its number), every beta
  application and every creator application (`notifyAdmins` in `src/notify.js`).
- **Reservation list** (`/hub/reserve#reserve-admin`):
  - Every reservation in order from #1, with name, email, date and status (Waiting / Invited /
    Claimed or Account ready) and **Release** to free a name.
  - **⬇ Download Excel (.xlsx)** (`exceljs`) and **⬇ Download PDF** (`pdfkit`) give the full
    numbered list (`/api/reserve/admin/export.xlsx`, `/export.pdf`).
- **👑 Your own nickname:** a box on the reservation list.
  - It reserves instantly and is always **#1** (`username_reservations.pinned`), with a crown.
  - It renames your account username and your creator page @handle (unless the name breaks
    handle rules or another creator page uses it).
  - Afterwards, log in with the new name or your email.
  - `users.is_owner` marks the owner's account, so renaming it never creates a second admin
    when the site restarts.
- **Settings:** the header ⚙ was moved into the ☰ menu ("⚙ Settings & privacy").
- **Every account's menu** has **👤 My profile** (`/hub/u/<name>`) and **✏️ Edit my profile**
  (`/hub/profile`).

### New database tables and columns since Version 4

All created or upgraded automatically by `db/schema.sql` on every start (idempotent:
`IF NOT EXISTS`, guarded constraints).

- **Tables:** `collab_posts`, `collab_replies`, `form_responses` (polls), `notifications`,
  `announcements`, `feature_flags`, `chat_threads`, `chat_messages`, `chat_blocks`,
  `premium_waitlist`, `creator_ranks`, `organisations`, `user_interests`,
  `username_reservations`, `post_collaborators`, `chat_groups`, `chat_group_members`,
  `chat_group_messages`, `calendar_events`, `beta_applications`.
- **`users` columns:** `birth_date`, `country`, `gender`, `email_verified_at`, `terms_version`,
  `marketing_opt_in`, `account_type`, `chat_privacy`, `show_online`, `profile_visible`,
  `max_rating`, `hide_strong_language`, `daily_verse`, `school_email`, `school_verified_at`,
  `skills`, `is_beta`, `beta_can_message`, `is_owner`, `onboarded_at`, streak columns.
- **`username_reservations` columns:** `claim_token`, `invited_at`, `claimed_at`, `beta`, `pinned`.

### New API routes since Version 4 (main ones)

| Route | What it does |
|---|---|
| `GET/PUT /api/account/privacy` | Settings & privacy |
| `/api/chat/...` | Threads, messages, groups, blocks, reports |
| `/api/calendar/...` | Today's holidays/events, admin events |
| `GET /api/reserve`, `/check`, `/list`, `/claim` | Campaign status, name check, public numbered list, claim link details |
| `POST /api/reserve` | Reserve (with or without a password) |
| `GET /api/reserve/admin`, `/admin/counts`, `/admin/export.xlsx`, `/admin/export.pdf` | Admin list, waiting counts, downloads |
| `POST /api/reserve/admin/invite`, `DELETE /admin/:id` | Send claim links, release a name |
| `GET/POST /api/reserve/admin/mine` | Owner's nickname (#1) |
| `GET/POST /api/beta`, `GET /api/beta/admin`, `POST /admin/:id/approve`, `/decline` | Beta tester applications |
| `/api/admin/flags/...` | Site features switches |

### New packages

`exceljs` (Excel download) and `pdfkit` (PDF download), added to `package.json`. Render installs them
automatically on deploy.

### Setting up Google sign-in (free)

1. At **console.cloud.google.com**, create a project called "Chapterhive" (no card needed).
2. Open **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Get started**).
   App name Chapterhive, your Gmail as support and contact email, audience **External**, then save.
3. Under **Audience**, press **Publish app** so anyone can sign in. Chapterhive only asks for name,
   email and picture, so Google shouldn't need a review.
4. **Clients / Credentials → Create client → OAuth client ID**, type **Web application**:
   - Authorised JavaScript origin: `https://mulenga-mwamba-website.onrender.com`
   - Authorised redirect URI: `https://mulenga-mwamba-website.onrender.com/auth/google/callback`
5. Copy the **Client ID** and **Client secret**.
6. On Render → Environment, add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
   `PUBLIC_URL=https://mulenga-mwamba-website.onrender.com`, then save. "Continue with Google"
   appears after the restart.
7. If you move to your own domain, add the new origin and callback in Google and update `PUBLIC_URL`.

### Render settings used by these versions

| Setting | Needed? | What it does |
|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | Continue with Google |
| `PUBLIC_URL` | recommended | The site's address, used in emails, claim links and Google |
| `BREVO_API_KEY` or `RESEND_API_KEY`, `MAIL_FROM` | optional | Sends verification, claim, beta and reset emails. Without them, links are shown to the admin to send by hand |
| `CONTACT_EMAIL` | optional | Where contact messages go (kept out of the code) |
| `SIGNUP_LIMIT_PER_HOUR` | optional | Sign-ups / reservations / applications allowed per connection per hour (default 5) |

### How these versions were tested

Each version added an automated test script run against a fresh local PostgreSQL 16 database,
plus the earlier suites, so nothing that worked before was broken. The latest suites cover:

- beta applications and approval
- reservations with passwords
- signing in before launch, with changes blocked
- the bell, counts and the beta-message switch
- numbering, Excel and PDF downloads
- the owner's nickname at #1 and its creator handle
- the public list containing usernames only
- the new username rules

Pages were also checked in a headless Chrome at phone size (390 × 844). The checks covered the
banners, the menu, the admin lists, the public list and the username preview.

### Still to decide or do

- **Name for member accounts:** the site says "member" for now. Ideas so far: Hive member, Bee,
  Reader, Hiver.
- **The admin account needs a date of birth** before anyone can chat with it (teen/adult safety rule).
- **Email** isn't configured yet. Until a Brevo or Resend key is added, claim and beta links appear
  on screen for the admin to send.
- **Legal pages** are still drafts. Have them reviewed by a Zambian lawyer before launch.
- See **Suggestions for later** at the end of this report for video storage, database and payment ideas.

### Version 19 (16 November 2026): members, follows, help for all, faster beta approval

- **Find members** (`/hub/members`, `js/members.js`, `GET /api/users?q=`): signed-in people can
  find each other. It lists readers, beta testers (listed first) and creators, with Follow and
  💬 Message buttons. Private member pages are left out. It's in every account's ☰ menu as
  **👥 Find members**.
- **Members follow each other** (`POST`/`DELETE /api/users/:username/follow`), not just
  creators. Member pages show Followers / Following and a Follow button. Following someone sends
  them a bell notification. Before launch, only the team and beta testers can follow (the
  pre-launch write guard).
- **Help assistant for everyone:** the ? bot (`help_assistant`) now starts live for everyone. A
  one-time start-up step (`help_team_v19` in `src/migrate.js`) switched it on for the live site.
- **Fund the heist wording:** the same start-up step replaced the saved "made by one person"
  message with team wording. You can still change the message in Admin → Settings → heist fund.
- **Beta testers get their username right away:** the beta form now asks for a password.
  - Applying holds the username at once (it appears on the reservation list with its number) and
    creates the account.
  - When you approve, they can log in immediately; no link is needed.
  - Applicants without a password still get a set-up link on approval.
- **Approving long lists:** the beta list has search (username, name, email, reason), status
  (Waiting / Approved / Declined / All), country and sort filters, plus tick boxes with
  **Approve selected** and **Decline selected**. The reservation list has search, status, country
  and order filters too.
- **Bell on phones:** the notification panel opens as a full-width sheet under the header, so
  nothing is cut off.
- Google sign-up now makes usernames that follow the new rule (adds `_hive` when there's no `_`).

### Version 20 (16 November 2026): applying to beta test after reserving

- **Separate switch:** beta applications have their own Site features switch, `beta_applications`
  (live for everyone). They no longer close when the reservation campaign ends, so people can apply
  during or after it.
- **One-step apply for signed-in people** (`POST /api/beta/me`):
  - Anyone logged in, including people who reserved with a password, sees just one box on
    `/hub/beta`: "Why would you like to test?" and an **Apply as @theirname** button.
  - Their username, email, name, country and date of birth come from their account.
  - The page shows their status: already a beta tester, application waiting, or "you can apply
    again" after a decline.
- **Visitors who aren't logged in** see a note at the top of the form: "Already reserved a name or
  have an account? Log in and apply in one step."
- **Easier to find:**
  - **🧪 Become a beta tester** is in the ☰ menu for every signed-in member who isn't a beta
    tester yet.
  - The "You're in early!" home banner has a **🧪 Beta test** button.
- **Re-applying:** someone who was declined can apply again; their application goes back to
  Waiting with the new reason.

### Version 21 (16 November 2026): staff powers, buddies, installable app and more

**Staff powers** (`src/staff.js`, Admin → 🛡️ Team & powers, owner only)

- The owner's account (`users.is_owner`) can see everyone with power: the owner, any full admin,
  and staff.
- **Full admins** get a **Remove full admin rights** button. It signs them out straight away.
- **Staff** get limited powers (`users.staff_perms`), ticked one by one:

  | Power | What it opens |
  |---|---|
  | `approve_posts` | Reviews tab |
  | `approve_creators` | Creator applications |
  | `approve_beta` | Beta applications |
  | `manage_reservations` | Reservation list, downloads, claim links |
  | `handle_reports` | Reports |
  | `moderate_members` (`moderate_users`) | Warn, suspend or ban members |
  | `post_updates` | Announcements |

- **Limits:** only the owner can change powers, and the owner can't be changed. Staff can never act
  on admins, the owner or other staff, and can't open site settings, Site features or the overview.
- **Staff dashboard:** staff open **🛡️ Staff tools** (`/admin`) and see only the tabs and links
  their powers allow.
- **Notifications:** new applications go to everyone who can act on them (`notifyStaff`).
- **Server side:** routes are guarded by `requireStaff(...)` / `requireOwner`.

**Announcements for beta testers**

- Announcements can go to Everyone, 🧪 Beta testers only, Creators only or 🛡️ Staff only.
- **📣 Post an update** in the admin's (and `post_updates` staff's) menu opens the form with Beta
  testers already chosen.

**Buddies and follower lists** (`/hub/people`, table `buddies`)

- **Buddies** are two-way friends:
  - Send a request with **＋ Add buddy** on a member page or in Find members.
  - The other person gets a bell notification and can **Accept** or **Decline**.
  - Either of you can stop being buddies.
- **🤝 My buddies & followers** (in the ☰ menu and on your own page) has four tabs:
  - **Buddies**
  - **Requests:** received and sent
  - **Followers:** with Follow back
  - **Following**
- Member pages show Followers, Following and Buddies counts.
- **APIs:** `GET /api/users/me/people`, `POST`/`DELETE /api/users/:username/buddy`,
  `POST /api/users/:username/buddy/decline`.

**Profile pictures**

- **Tap to view:** tap a profile picture on a creator or member page to see it full size
  (`MW.viewPicture`).
- **Pictures surviving deploys:** without Cloudinary, uploaded pictures used to vanish on every
  Render deploy (the owner's picture showed as a blank circle). Now:
  - Every upload up to 8 MB also gets a backup copy in the database (table `stored_files`).
  - `/uploads/<name>` serves that copy (and puts it back on disk) when the file is missing.
  - Pictures uploaded before this version are already gone and need uploading once more.
  - Setting `CLOUDINARY_URL` on Render (free) is still the best home for files, especially video.

**Sign-up forms**

- **Reserve with Google:** the reservation form has **Continue with Google**. Google supplies a
  verified email, so there's no email box or password. The account is made with Google sign-in
  and the person is signed straight in. While new accounts are off, a first-time Google sign-in
  finishes on the reservation form.
- **Typed birthdays:** every date-of-birth box takes numbers, DD/MM/YYYY.
  - It adds the slashes by itself and shows the date in words ("✓ 16 November 2004").
  - It says when a date doesn't exist.
  - It also accepts 2004-11-16 and 16112004.
- **Signed-in visitors** on the reservation page are told their name is already theirs, instead of
  accidentally making a second account.

**Help**

- **Help page:** Help & FAQ now opens a Chapterhive page (`/hub/help`), not God's Banditos.
- **Glitter:** the help button glitters (a soft glow, a shine and twinkling sparkles; it stays still
  for people who turn off motion).
- **Small talk:** the help bot answers greetings and small talk ("Hi there! 👋 …", thanks, bye).
- **Honest answers:** it says plainly when it can't answer something instead of guessing a random
  FAQ entry. Two causes fixed:
  - Very short words were being matched, so "hi" matched "his".
  - The match threshold was too low.

**Installable app (step 1 of the Play Store plan)**

- **The pieces:** `manifest.webmanifest` (name, colours, start page `/hub`, shortcuts), app icons in
  `public/icons/` (normal and maskable, made from the hive logo), a service worker (`sw.js`) and an
  offline page (`offline.html`).
- **What the service worker does:** it keeps styles, scripts and icons so the app opens fast, and
  shows a friendly "You're offline" page with no signal. Pages and API answers are never cached.
- **📲 Install the app:** appears in the ☰ menu on phones that support it. iPhones get
  "Share → Add to Home Screen".
- **Play Store link:** `/.well-known/assetlinks.json` is served from the `ANDROID_ASSETLINKS`
  setting on Render, ready for when PWABuilder makes the Android package.

### Version 23 (16 November 2026): follows before launch, bell for all, announcements pop up

- **Following before launch:**
  - Everyone with an account can now follow **creators** (and the founder) before launch, so their
    favourite artists are lined up for day one.
  - Following other **members** and sending buddy requests open at launch.
  - **Beta testers** can already follow each other.
  - Enforced in `src/prelaunch.js` (follow routes allowed) and `routes/users.js` (creators only for
    waiting members).
- **Notification bell for everyone:** it was still switched to "admin only". A one-time start-up
  step (`bell_everyone_v23`) turned it on for everyone, and new sites start with it on.
- **Announcements:**
  - Everything you post in Announcements now shows at the top of **News & updates** under
    "📣 Announcements".
  - It also **pops up once** for the people it's meant for, if it's less than two weeks old. Older
    unseen ones count as seen, so it's never a queue of pop-ups.
  - Visitors see the "Everyone" ones. Beta testers, creators and staff also see theirs.
  - Endpoint: `GET /api/notifications/announcements`.
- **Profile picture by the search box:** the round yellow search button is gone on phones (press
  the keyboard's Search key). In its place, your profile picture sits to the **left** of the search
  box and opens your profile. Visitors get a 👤 that opens Log in.
- **Account first in the menu:** the ☰ menu now starts with your account, in this order:
  - 📲 Install the app (when your phone supports it)
  - 👤 My profile
  - ✏️ Edit my profile
  - ⚙ Settings & privacy
  - your tools
- **Get the app bar:** a slim "Get the Chapterhive app" bar under the search box.
  - It shows a one-tap 📲 **Install** on Android/Chrome, and "How?" with the steps on iPhone.
  - Hiding it keeps it away for two weeks.
- **Find members on phones:** names and tags sit on top, with the Follow / Add buddy / 💬 buttons on
  their own row underneath. The buttons also no longer go missing when the page loads quickly.

### Version 24 (17 November 2026): Buddies tab, easier finding, chat choices, tips everywhere

**Tabs and navigation**

- **Buddies instead of Top creators:** the tab row's **Top creators** button is replaced by
  **Buddies** (`/hub/buddies`).
- **Top creators** now sit at the top of the **Creators** page (top 10, with "Top creators by
  shelf" underneath). The old `/hub/top` address forwards to `/hub/creators#top`.
- **The Buddies page** has three tabs:
  - **🤝 My buddies:** buddy requests waiting for you are pinned at the top, ready to accept.
  - **💬 Chats:** your latest chats, with unread counts; tap to open.
  - **🔍 Find buddies:** a search box for names or usernames, plus **People you may know**.
    It suggests buddies of your buddies first (with "2 mutual buddies"), then people who follow
    you, people you follow, beta testers and recently active members.
- **Removed:** the God's Banditos ">_ CONSOLE" button no longer appears on Chapterhive pages
  (it stays on God's Banditos).
- **Help button position:** the ? sits in the very bottom-right corner, mirroring Fund the heist in
  the bottom-left (same distance from the edges).

**People and lists**

- **Tappable counts:** on any member page, **Followers**, **Following** and **Buddies** can be
  tapped. They open a list of the accounts with their pictures and usernames; tap one to visit
  them. The follower count on creator pages works the same way.
- **API:** `GET /api/users/:username/list/followers|following|buddies` and
  `GET /api/users/suggestions`.

**Chat and safety**

- **Who can start a chat with me** (Settings → Messages) now offers:
  - Everyone
  - **My followers**
  - **My buddies**
  - People I follow
  - Nobody
- **Admins can't be blocked.** Trying to block an admin explains how to report instead, and
  any old blocks of admins are cleared on start-up. Admins can always reach people for safety.

**Team & powers**

- **Give someone powers** suggests people as you type part of a name or username, with pictures
  and tags, so you don't need to remember exact usernames.

**Tips**

- **Every Chapterhive page has its own quick tips:** home, creators, buddies, chat, settings, edit
  profile, news, reservation, beta and help, among others.
- **Each tips bar offers:**
  - **Next tip (1/4)**
  - **Skip for now** (three days)
  - **Don't show again** (this page)
  - **Turn off all tips**
  - **Help & FAQ**
- **Settings → Tips → 💡 Show tips** turns them back on everywhere.
- **Welcome back:** people who come back after **three days or more** get a short "Here's where
  things are" card. It covers profile, Buddies, the bell, Creators and Help, with **Skip for now**
  and **Never show this**.
- **Tips for everyone:** quick tips were still admin-only. A one-time start-up step
  (`tips_everyone_v24`) switched them on for everyone.

### Version 26 (17 November 2026): fixes

- **Reservation list highlight:** the page used to remember the last name reserved *on that phone*,
  so the owner's phone showed "You're #3 (@bandito_1)" even when signed in as @vamp1_hunid. When
  you're signed in, it now highlights your own account's name; the remembered name is only used for
  visitors.
- **Tips for visitors:** people who aren't logged in now get their own tips: what Chapterhive is,
  how to reserve (or Continue with Google), typing birthdays as numbers, beta testing and logging
  in. Tips about tools they can't use yet (profile, buddies, chat, settings) only show after login.

### Version 27 (17 November 2026): install counter, milestone pop-up, forgiving search, app on PC

- **Install counter** (`src/routes/app.js`, table `app_installs`):
  - Every device that installs Chapterhive is counted once: when the browser reports the install,
    or the first time the app opens installed. The Play Store app opens the same site, so it will
    count too.
  - `GET /api/app/stats` gives the total.
- **Milestone pop-up:** at 10, 25, 50, 100, 250, 500, 1,000… installs, a celebration pop-up says
  "🎉 Chapterhive has been installed 100 times!".
  - It shows once per milestone, only to people who **haven't installed the app on that device**
    (with a 📲 Get the app too button).
  - **Admins always see it.**
  - You also get a bell note when a milestone is reached.
- **Install on PC:**
  - **📲 Install the app** is now in the ☰ menu on computers as well as phones.
  - Chrome and Edge get a one-tap install. Other browsers show the steps for that browser
    (Chrome, Edge, Safari on Mac, Android, iPhone).
- **Forgiving search:**
  - Search, the creators filter, the work filters, the collab board and member search ignore
    capitals, hyphens, underscores, spaces and punctuation ("spiderman" finds "Spider-Man").
  - They also forgive small spelling mistakes ("spidr artist" finds "spider-artist").
  - Closer matches are listed first.
  - This uses database functions `ch_norm`, `ch_score` and `ch_match` in `db/schema.sql`, with the
    `pg_trgm` extension for typos. Render's PostgreSQL includes it. If it were ever missing, search
    still ignores hyphens and capitals; only the typo matching switches off.

### Version 28 (17 November 2026): reports and suggestions in the bell, tap-to-read, phone notifications

- **Reports in the bell:** every new report (posts, comments, creators, collabs, chat and group
  messages) sends "🚩 New report…" to admins and staff with the Handle reports power. It links to
  the reports list.
- **Suggestions in the bell:** "💡 Suggestion from @name: …" goes to admins. The suggestion box was
  still admin-only, so a one-time start-up step switched it on for everyone.
- **Tap to read:** tapping a notification marks it as read straight away and lowers the unread
  count, even when the tap opens another page.
- **Phone notifications, like WhatsApp** (`src/push.js`, table `push_subscriptions`):
  - Anything that lands in someone's bell also pops up on every device where they turned
    notifications on, even with Chapterhive closed. Tapping the pop-up opens the right page.
  - **Turning them on:** a "📲 Get pop-ups on this device" strip at the top of the bell, or
    Settings → Phone notifications (which can also turn them off).
  - **Where it works:** the installed app on Android, the Play Store app once it's made, Chrome
    and Edge on PCs, and iPhones once Chapterhive is added to the Home Screen.
  - **Behind the scenes:** this uses standard Web Push. The keys are made automatically once and
    kept in the database; you can set your own `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on Render
    instead. A test notification is sent as soon as someone turns them on.

### Version 29 (17 November 2026): fix for the failed deploy of PR #32

- **What went wrong:** PR #32 added phone notifications using the `web-push` library, version 4.
  Version 4 is written in the newer "ES module" style, which the older Node.js version Render runs
  can't load with `require`. The first time the site sent a notification while starting up (for
  example, refreshing the top-creator ranks), the server crashed, so Render reported "Exited with
  status 1". It worked locally because the build machine has a newer Node.js.
- **The fix:**
  - Use `web-push` version 3.6.7, the same features in the older style that every Node.js version
    can load (checked on Node 20.11, 22.11 and 22.23).
  - Phone notifications are now loaded only when needed and can never crash the site. If anything
    goes wrong with them, it's logged and the bell keeps working.

### Version 30 (17 November 2026): Messenger-style chat, combined filters, daily devotions, phone notification fixes

- **Menu order:** News & updates now sits between Home and Creators on every Chapterhive page and in the ☰ menu.
- **News & updates intro** now speaks to movies, books, series and music, "and from Chapterhive creators".
- **Home filters:** shelves are ordered by what people look for first (Books, Comics & manga, Series, Film & video,
  Music & poetry, Art, Writing, Comedy), with Tutorials and Trailers last. Several shelves, types and genres can be
  picked at once (`/api/posts?shelf=books,series&genre=fantasy,horror`: any choice within a row, every row must
  match). The filters start open; while open the bar scrolls with the page so it never covers the feed.
- **Daily verse:** on for everyone (new accounts default to on; a one-time step switched it on for existing
  accounts, and anyone can still turn it off in Settings). Tap the verse for a short devotion, a word of
  encouragement and a prayer (`src/devotions.js`, original text for all 61 verses; the admin's verse override
  can carry its own `devotion`, `encouragement` and `prayer`).
- **Chat** looks and feels like Messenger: round bubbles (yours in honey on the right), messages from the same
  person grouped with one avatar, day and time separators, big emoji, tap a message for its time and
  Delete / Report, a ⋯ menu for Block / profile / group options, a pill-shaped box with a round send button that
  becomes 👍 when empty, and on phones the list and the conversation take turns filling the screen.
- **Phone notifications:** new chat messages now send a phone notification (they never did before). Devices that
  signed up with an older key are forgotten instead of failing silently, and every visit re-registers the device
  with the current key, so phones that had stopped receiving start again after one visit.
- **Before launch:** waiting members can now like creators' posts as well as follow creators. Following other members and downloading attached files stay locked until launch (the file list shows a 🔒 note instead).

### Version 31 (17 November 2026): Chapterhive dashboard, announcements you can schedule and edit, drafts

- **Chapterhive's own dashboard** at `/hub/admin` (same tools as `/admin`, in Chapterhive's look). Every staff link on
  Chapterhive and in the bell goes there, so posting an update no longer drops you into God's Banditos.
- **Signed-in name refreshes on every page**, so renaming your account on one device updates it on all of them.
- **Announcements:** tick one or more groups (Everyone, Beta testers, Creators, Staff); send now, **schedule** for a
  date and time, or **save as a draft**; **edit** any announcement after posting (drafts and scheduled ones can be
  sent now or moved; ones already out keep their date and don't notify again). Announcements now also send a
  **phone notification** when they go live (`src/announcements.js`, checked every minute for scheduled ones).
- **"Edited" is only shown to admins**: on comments, works and announcements, members no longer see that something
  was edited.
- **Drafts for everything you type:** comments, replies and chat messages are kept on the device until sent, and
  come back when you return (the chat list shows "📝 Draft: …"). Works already had drafts in the studio.
- **Post audience:** each post can be for Everyone, Members only (signed in) or Followers only, and creators (and
  you) can change it any time after posting from the edit form. The stricter of the page setting and the post's
  setting wins.
- **Phone notification check in Settings:** shows whether this device is registered and has a "Send me a test
  notification" button.

### Version 33 (18 November 2026): God's Banditos moves to its own website

God's Banditos is now a separate site (repo `Vamp1-hunid/God-s-Banditos-`, its own Render service, database and
login). This repo is Chapterhive only, so it can be run (or sold) on its own.

- **Removed** the God's Banditos pages (home, works, stories, products, creator, its login and help), their scripts,
  images and videos, the boot screen and console, the "a God's Banditos production" credit, the God's Banditos
  update category and the products tab.
- **Chapterhive's own pages** for the dashboard, contact, forgot / reset password and 404 now live in `public/hub/`.
- **Old addresses redirect:** `/` → `/hub`; `/admin`, `/login`, `/contact`, `/forgot`, `/reset`, `/help`, `/search` →
  their `/hub/...` pages; the old God's Banditos works, stories and characters (`/work/…`, `/stories/…`,
  `/characters/…`, `/gallery`, `/products`, `/creator`) go to the God's Banditos site when `GODS_BANDITOS_URL` is
  set on Render, otherwise to the same work on Chapterhive (the owner's works stay on Chapterhive too).
- **Wording:** terms, privacy, content rules, creator agreement, emails, FAQ, help assistant and welcome screens now
  speak only of Chapterhive. (The legal pages still need a lawyer's review.)
- The API lists every creator's works by default (no more God's Banditos-only scope).

### Version 34 (18 November 2026): "Feed the hive", no "free forever" promises, downloads, fullscreen

- **Support button:** "Fund the heist" with a loot bag became **"Feed the hive"** with a honey-pot icon (honeycomb
  cells float up on hover). The panel's wording is bee-themed too. A saved "Fund the heist" title shows as "Feed the
  hive"; a custom title is kept.
- **No promises that Chapterhive stays free** (paid plans are planned): the support message now reads "Enjoying
  Chapterhive? Chip in to help keep the hive growing…", the Premium page says "Free plan" (not "Free forever"), the
  sign-up and reservation pages no longer say creator accounts are "for free", and the Terms say there is a free plan,
  some features may be paid now or later, prices are shown before paying and changes to the free plan get notice.
- **Downloads for chosen groups** (Dashboard → Settings → Who can download, `src/downloads.js`): any mix of ordinary
  members (everyone with an account), Premium members, the team (admins and staff) and beta testers. Off for everyone
  until ticked; creators can always download their own work; visitors never can. Allowed people get a **⬇ Download**
  button under videos, audio and pictures; everyone else has the player's own download menu hidden
  (`controlslist="nodownload"`, no right-click save on videos). The post API says whether the viewer may download
  (`canDownload`).
- **Download quality:** videos can be downloaded as Original, 1080p, 720p, 480p or 360p. Cloudinary makes the smaller
  versions on request (`fl_attachment,c_limit,h_<size>,q_auto`); the first download of a size takes a moment, and each
  one uses Cloudinary credits.
- **⛶ Fullscreen** button under every video for everyone (iPhones included); on Android it also tries to turn the
  phone sideways.

## Suggestions for later

Ideas that came up while building, roughly in the order they'll matter. Nothing here is done yet.

### Video storage and streaming

- **Now: stay on Cloudinary.** Its free plan (25 credits a month: 1 credit = 1 GB stored, 1 GB of pictures viewed or
  1,000 transformations) is enough while launching. The next Cloudinary plan (Plus) costs $99 a month, and video
  bandwidth is only on paid plans.
- **When to move video:** once the Cloudinary dashboard regularly shows about 20 of the 25 monthly credits used, or
  many creators are uploading video.
- **Where to: Bunny Stream** (bunny.net). Its pricing page lists storage from $0.01/GB, delivery from $0.005/GB, free
  encoding (no transcoding fees), a $1 monthly minimum and a 14-day free trial. Prices for viewers in Africa may be a
  little higher than the "from" prices. It also streams adaptively (quality follows each viewer's connection), which
  helps people on slow mobile data. Pictures can stay on Cloudinary. Moving needs changes to how videos are uploaded
  and played.
- **Alternative for files: Cloudflare R2**, which doesn't charge when people view or download files (the biggest cost
  with video). It doesn't convert or stream video by itself.
- **Keep files small:** compressed 720p with automatic quality is a fraction of the size of the original upload.
- **Protecting videos:** hiding download buttons stops honest viewers, not determined ones. Real protection needs
  DRM (what Netflix-style services use) through a paid streaming service; only worth it for paid, exclusive content.
- **Don't copy piracy sites' "free" hosting tricks** (offshore hosting, shady ad networks, throwaway accounts): they
  rely on hiding from takedowns, make the site impossible to sell or take payments for, and put the owner at legal risk.

### Using the database (PostgreSQL on Neon) for more

PostgreSQL already holds everything except the files themselves (videos and pictures belong in Cloudinary or Bunny,
never in the database: they would make it slow, costly and fill the 1 GB free storage). Useful additions:

- **Download history and limits:** a small table of who downloaded what and when, to see popular videos, spot someone
  downloading hundreds of files, and set limits such as "10 downloads a day for ordinary members".
- **Watch progress and views:** remember where each member stopped so videos resume there, and give creators view
  counts.
- **Billing records** once Premium is paid: payments, plan start and end dates, receipts.

### Video pages

- **Put the player at the top** of video posts (series, films, trailers), like YouTube; on phones it's currently below
  the title, buttons and creator box.
- **The floating buttons** (Feed the hive and ? help) sit over the player's bottom corners on phones; hide or move them
  while a video is on screen.
- **A Chapterhive-styled player:** honey progress bar, 10-second skip buttons and a "Next episode" button.

### Charging money

- **"Create a free account" buttons** are accurate while accounts are free. When paid plans start, either keep a free
  plan (then they stay true) or change them.
- **Payments:** Flutterwave or Paystack for mobile money in Zambia, plus the code that upgrades a member after paying.
- **Ask the lawyer** about the Terms wording on changing the free plan (consumer law needs fair notice).

### Version 35 (18 November 2026): swipe posts, Edit category, reservation list fix

- **Swipe posts:** when a post has several pictures and clips, the creator chooses in Compose how they show:
  "One under another (like a manga chapter)" or "Side by side: swipe left and right". The swipe layout is a carousel
  with dots, a "2 / 5" counter, arrows on computers and keyboard arrows; a clip pauses when you swipe away from it.
  Stored in `posts.layout` (`scroll` | `swipe`).
- **Edit category** ("Edit (fan edit, promo edit or AMV)"), next to Meme, so creators can market their stories with
  memes and cool edits. Edits can carry video (memes still can't), need at least one picture or clip, and appear under
  Film & video and Art when browsing, and in search. Link an edit or meme to a story with the Story field.
- **Reservation list:** "You're #N (@name)" showed the last account that logged in on that phone, even after logging
  out. It now shows only for the signed-in account, or for a name reserved with the form on that device, and logging
  out clears it.
- **Share sheet** (`MW.share` in `public/js/api.js`): a "↗ Share" button on works, feed cards, stories and creator
  pages opens one sheet: 🐝 Send to a buddy (pick buddies or recent chats, add a message, sent as a chat card for
  works), WhatsApp, Telegram, Facebook, X, Email, 📲 More apps… (the phone's own share menu, where supported) and
  🔗 Copy link. Members only: visitors who aren't logged in see no Share buttons (like downloads, videos and
  comments). Replaces the old "Share in chat" box.
