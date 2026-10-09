# myweb — Activity 2 setup notes

This ZIP gives you a working `myweb/` project folder you can drop straight into VS Code. Everything
runs as-is with Live Server, but a few pieces are placeholders you must replace with your own real
content before you submit, per the assignment rules.

## What's already done
- `index.html` — semantic `<header>/<nav>/<main>/<footer>` structure, About Me, hobbies list + steps,
  weekly learning-plan table, photo gallery, video/audio players, and a contact form with validation.
- `css/styles.css` — full styling: palette, box model on sections, class/id/element selectors, hover
  and focus states, responsive layout down to mobile.
- `images/selfie.jpg`, `gaming.jpg`, `story-cover.jpg`, `desk-books.jpg` — **placeholder** colour
  blocks so the gallery renders immediately. Replace each with the real photo (same filenames, so
  no HTML edits needed): a selfie (used both beside About Me and in the gallery), a photo of you
  holding your game controllers, your laptop screen showing your fantasy story's cover, and books
  open on your study desk.

## What you still need to add
1. **`videos/intro.mp4`** — record yourself (30–60 seconds) saying the transcript already in the
   Media section: your name, your programme, and that you want to learn JavaScript for animations
   and interactivity. Save it with that exact filename, or update the `<source>` path.
2. **`videos/voice.mp3`** — an unscripted 15–30 second clip talking about why gaming is your top
   hobby. Same deal on the filename/path.
3. **`activity1_backup.html`** — copy your actual Activity 1 `index.html` into `myweb/` and rename
   it `activity1_backup.html` *before* you start editing, as Part A step 1 requires. It isn't
   included here since I don't have your original Activity 1 file.
4. Swap in the three real photos described above.

## Testing checklist (Part E)
- Open `myweb/index.html` with Live Server and click every nav link — each should jump to its section.
- Confirm all three photos load, the video and audio play with working controls, and the table and
  form display correctly.
- Try submitting the form empty, and with an invalid email, to confirm the browser blocks it.
- Resize the browser to a narrow (phone-like) width and check there's no horizontal scrolling.
