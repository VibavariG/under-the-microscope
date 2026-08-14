# Under the Microscope

A personal technical register — categories, tags, search, a local
markdown editor with drafts and publishing, and no login anywhere on
the public site, because the public site never has a way to write to
itself.

## How the architecture solves the login problem

GitHub Pages only serves static files — there's no server to check a
password against. So instead of bolting on authentication, publishing
works like this:

- **`docs/`** is the only folder that gets deployed. Configure GitHub
  Pages to serve from `main` → `/docs`, and that's the entire public
  site: `index.html`, `post.html`, `posts.json`, etc.
- **`admin/`** is a local authoring tool — a markdown editor with drafts,
  publishing, and category/tag management. It's part of the repo (so you
  can pull it on any machine) but GitHub Pages never serves it, because
  Pages is configured to only look inside `docs/`. There is exactly one
  deployed site and one endpoint. Nobody browsing the site can reach the
  admin tool, because it simply isn't on the internet.
- You write and publish by opening `admin/editor.html` yourself, editing
  a post, hitting **Publish** (which writes `docs/posts.json` directly
  on disk), then `git add`, `git commit`, `git push`.

No login, because there's nothing to log into.

## Folder structure

```
docs/                    ← deployed to GitHub Pages (set this as the Pages source)
  index.html             the Register — reverse-chronological feed
  post.html               single entry view
  style.css
  script.js               feed rendering, category/tag/search filtering
  posts.json               published posts — the only public data file
  categories.json           canonical category list
  feed.xml                  RSS, regenerated automatically on publish
  robots.txt

admin/                   ← never deployed — local authoring tool only
  editor.html
  editor.css
  editor.js                app logic: drafts, publish, unpublish, delete
  storage.js                reads/writes files directly via the browser
  markdown.js                self-contained Markdown → HTML converter
  github-sync.js             optional: pushes docs/ straight to GitHub
  drafts.json               your unpublished posts — gitignored, stays local

scripts/
  build-rss.js             manual RSS rebuild, only needed as a fallback

.gitignore                ignores admin/drafts.json
README.md
```

## Using the admin editor

Open `admin/editor.html` in **Chrome or Edge** (see the browser note
below for others) — either by double-clicking the file, or, better, by
running a local server from the repo root so paths resolve consistently
with the public site:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/admin/editor.html
```

The first time, click **Connect your blog folder** and select the
repo's root folder (the one containing both `docs/` and `admin/`). The
browser will remember it via IndexedDB — next time you open the tool
you'll just click **Reconnect** once per browser session (a fresh click
is required each session purely as a browser security measure; the
folder itself stays remembered).

From there:

- **+ New entry** opens a blank form. Title, slug, date, category, tags,
  excerpt, and a Markdown body with a live preview alongside it.
- **Save draft** writes to `admin/drafts.json` only — it never touches
  the public `docs/posts.json`, so a draft never ships to the deployed
  site even accidentally.
- **Publish** moves the entry into `docs/posts.json` (removing it from
  drafts if it came from there) and regenerates `docs/feed.xml`
  automatically.
- Clicking a published entry in the sidebar gives you **Save changes**,
  **Unpublish** (moves it back to drafts), and **Delete**.
- The **formatting toolbar** above the body field (Bold, Italic, H2/H3,
  Link, Image, Quote, lists, code block, divider) inserts the right
  Markdown for you — click a button instead of remembering syntax.
  Bold/Italic also work as Ctrl/Cmd+B and Ctrl/Cmd+I, and every toolbar
  edit stays on the browser's native undo stack, so Ctrl/Cmd+Z undoes it
  normally.
- **Add a category** from the field next to the category dropdown —
  saved to `docs/categories.json` immediately. Existing categories show
  as chips below it with a **×** to remove one (you'll get a warning if
  any entries currently use it — removing it just drops it from the
  public filter bar, existing entries keep showing it on the entry
  itself).

### Publishing without touching git — GitHub auto-push (optional)

By default, after Publish/Unpublish/Delete/category changes you commit
and push the updated files yourself:

```bash
git add docs/
git commit -m "Publish: <post title>"
git push
```

If you'd rather the **Publish** button do that last step too, connect
GitHub auto-push in the sidebar: enter your GitHub username, the repo
name, the branch (defaults to `main`), and a **personal access token**,
then click **Save & connect**. From then on, any action that changes
`docs/posts.json`, `docs/categories.json`, or `docs/feed.xml` pushes
those files straight to GitHub via the API immediately — no `git`
commands at all. A **Push now** button is there too, for re-syncing on
demand (e.g. right after first connecting).

This works over the network, so — unlike the File System Access
features above — it's available in every browser, including Firefox
and Safari.

A couple of things worth knowing:

- Use a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
  scoped to just this one repository with **Contents: Read and write**
  permission, rather than a classic token with full `repo` scope — if
  it's ever leaked, it can't reach anything else in your account.
- The token is stored only in this browser's `localStorage` and sent
  only to `api.github.com` over HTTPS. It's never bundled into the site
  or committed anywhere. Click **Disconnect** to remove it.
- `admin/drafts.json` is never pushed to GitHub by this feature, same
  as everywhere else in the tool — see below.
- If auto-push is off (or fails — e.g. a bad token), the action still
  saves locally exactly as before; the banner tells you which files
  still need a manual push.

### Why drafts are genuinely private

`admin/drafts.json` is listed in `.gitignore` and is never included in
a GitHub auto-push. Draft content never gets committed, so it never
reaches the pushed repo or the deployed site — unlike hiding a
"draft: true" flag inside a file that still ships publicly, which a
visitor could still read directly.

### If you're not on Chrome or Edge

Firefox and Safari don't yet support the File System Access API the
editor uses to read and write files directly. The tool still works, but
in "manual mode": it loads the current files over `fetch` (needs the
local server above running), and after you save, the banner tells you
exactly which files changed, with matching download buttons for
`posts.json`, `drafts.json`, `categories.json`, and `feed.xml` (each one
shows a small amber dot while it has unsaved changes). Download the
flagged ones and overwrite the matching file in your repo before
committing — or skip all of that by setting up GitHub auto-push above,
which works the same in every browser. The tool also warns you before
closing the tab if anything hasn't been downloaded yet, so nothing gets
lost silently.

## Deploying to GitHub Pages

1. Create a **public** repo (required for free GitHub Pages) and push
   this whole folder to it.
2. **Settings → Pages** → Source: deploy from `main` branch, **`/docs`**
   folder.
3. Site goes live at `https://<your-username>.github.io/<repo-name>/`.
4. In the admin editor sidebar, set **RSS site URL** to that same
   address — it's only used to build absolute links inside `feed.xml`.

The repo being public doesn't make the *content* discoverable: every
public page has `<meta name="robots" content="noindex, nofollow">` and
`docs/robots.txt` blocks crawlers, so search engines won't index it.
Anyone with a direct link can still open it — that's what makes sharing
a single post possible.

## Search, categories, and tags

All client-side, no backend:

- The **search box** matches against title, excerpt, tags, and body text.
- **Category pills** filter to one category at a time (or "All").
- Clicking a **tag chip** on any entry filters to that tag; a "Clear"
  link appears so you can back out.
- All three combine (category *and* tag *and* search text), and the
  active filters live in the URL (`?category=Systems&tag=redis&q=cache`)
  so a filtered view is itself a shareable link.

## Writing content

The editor's Markdown support covers what a technical post typically
needs: `#`/`##`/`###` headers, **bold**, *italic*, `` `inline code` ``,
fenced ` ```code blocks``` `, `> blockquotes`, `- ` and `1. ` lists
(single level, no nesting), `[links](url)`, `![images](url)`, and `---`
for a horizontal rule. It's a small hand-written parser, not full
CommonMark — no tables, no nested lists, no footnotes.

Every post is stored with both `bodyMd` (the raw Markdown you typed, so
reopening it in the editor round-trips correctly) and `body` (the
rendered HTML the public site actually displays) — the public site
never runs a Markdown parser itself.

## What's built vs. what's next

**Built (Phase 1):** your own posts, categories, tags, search, a
Markdown editor, drafts vs. publishing, RSS. **Not built:** analytics —
you asked to skip it for now; adding a privacy-friendly script tag
(GoatCounter, Plausible, etc.) later is a small change to `index.html`
and `post.html` when you're ready.

Everything from Phase 2 onward (comments, newsletter, reading lists,
series, multiple authors, open publishing) is a genuinely bigger lift —
most of it needs a real backend, which is exactly the trade-off the
git-based publishing flow was chosen to avoid for now. Nothing here
blocks moving to a backend later; `posts.json`'s shape would carry over
directly if that day comes.
