# MWAMBA//NET — Mulenga Mwamba's website

Live website: https://mulenga-mwambas-personal-website.onrender.com

## About this website
[Two or three sentences in your own words: what the site is and who it is for.]

It started as my ICT251 Activity 3 portfolio page and is now a full website: my profile and
learning plan, plus an archive where I post my **story art, anime works and writing**.
Visitors can create a free account to **comment, like and save favourites**. Only my admin
account can post.

The look is an original street-hacker theme inspired by Watch Dogs 2 (no game logos,
fonts or artwork are used).

## Pages

| Address | What it is |
|---|---|
| `/` | Home: intro, latest works, About me, hobbies, learning plan + calculator, projects, photos, media, contact |
| `/gallery` | All works, with filters: `?category=story-art`, `anime` or `writing` |
| `/work/<name>` | One work: image or text, likes, save, comments |
| `/login`, `/register` | Log in / create a free account |
| `/profile` | A member's stats and saved favourites; change password, link Google, delete account |
| `/admin` | Site owner only: post, edit (or save as draft) and delete works |

## Features

**The four ICT251 JavaScript features (js/script.js)**
1. **Contact form validation and preview (compulsory):** checks name, email and message, rejects spaces-only text and badly formatted emails, shows a local preview. No message is sent.
2. **Mobile navigation:** a Menu button opens and closes the links on narrow screens.
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
- Only image files (JPG, PNG, WebP, GIF, up to 8 MB) can be uploaded, and only by the admin.
- Everything visitors type is shown as plain text, never as HTML.

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
src/storage.js       image uploads (Cloudinary)
src/routes/          the /api addresses: account, posts, comments
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

5. Deploy. Open `/login`, sign in with your admin username and password, then go to `/admin`
   and post your first work.

**Passwords:** anyone (you included) can change their password on `/profile`. If you forget
the admin password, change `ADMIN_PASSWORD` on Render and redeploy: a *new* value resets it.

## "Continue with Google" (one-time setup)

1. Go to https://console.cloud.google.com and create a project (any name, e.g. "MWAMBA NET").
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

## Sources
- Learning Web Design by Jennifer Niederst Robbins (my main learning book)
- Fonts: Bungee, Chakra Petch and Share Tech Mono from Google Fonts
- MDN Web Docs (linked in the navigation)
- Photos, video, audio and artwork: my own
