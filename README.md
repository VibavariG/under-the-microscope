# Under the Microscope

A personal technical register — categories, tags, search, a Markdown
editor with drafts and instant publishing, and a real login for you
with none required for visitors.

## Architecture

- **GitHub Pages** serves `docs/` — the entire public site. Still just
  static files, nothing has changed here.
- **Supabase** (a hosted Postgres database) holds your posts and
  categories, and handles login. The browser — both the public site and
  the admin tool — talks to it directly. There's no server of yours in
  between at all.
- **Row Level Security** (a Postgres feature, configured in
  `supabase/schema.sql`) is what actually enforces the access rules:
  visitors can only ever read published posts; only a logged-in session
  can read drafts or write anything. This replaces what would otherwise
  be hand-written backend auth code.
- **`admin/`** stays local — you open `editor.html` on your own machine.
  It's never deployed (GitHub Pages only serves `docs/`), so there's
  nothing for a visitor to even find, on top of the real login it asks
  for.

Publishing is instant: the admin tool writes straight to the database,
so clicking **Publish** means live immediately — no git push, no build,
no separate deploy step for content.

## One-time setup

### 1. Create the Supabase project

Go to [supabase.com](https://supabase.com), create a free account and a
new project (pick any name/region/password — the database password
isn't used anywhere in this app). Wait for it to finish provisioning
(a minute or two).

### 2. Run the schema

Dashboard → **SQL Editor** → New query → paste the entire contents of
`supabase/schema.sql` → **Run**. This creates the tables and the
security policies described above, plus a starter set of categories.

Optional: also run `supabase/seed-data.sql` the same way if you want
the 3 sample posts to look at before writing your own.

### 3. Create your admin login

Dashboard → **Authentication → Users → Add user**. Pick any email and
password — there's no sign-up flow anywhere in this app, so this is the
only account that will ever exist. This is what you'll log in with in
the admin tool.

### 4. Get your API keys

Dashboard → **Settings → API**. You need two values: **Project URL**
and the **anon / public key**.

Paste both into **two files** (they're identical — one for each half of
the app):

```js
// docs/config.js AND admin/config.js
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-public-key';
```

The anon key is meant to be public — it identifies the project, not a
secret credential. It's safe in a committed file; actual access control
comes entirely from the Row Level Security policies from step 2.

### 5. Deploy the public site

Push this repo to GitHub (public repo, required for free Pages) →
**Settings → Pages** → Source: `main` branch, **`/docs`** folder. Live
at `https://your-username.github.io/your-repo/`.

### 6. Open the admin tool

Run a local server from the repo root (needed either way, so `admin/`
can load `markdown.js` etc. via relative paths):

```bash
python3 -m http.server 8000
# then open http://localhost:8000/admin/editor.html
```

Log in with the account from step 3. You're set.

### 7. (Optional) keep-alive for the free tier

Supabase pauses a free project after about a week of no activity, which
would take your blog down until you notice and un-pause it from the
dashboard. `.github/workflows/keep-alive.yml` pings it automatically
every 3 days so this never happens — for it to work, add two repo
secrets: **Settings → Secrets and variables → Actions** → add
`SUPABASE_URL` and `SUPABASE_ANON_KEY` (same values as step 4).

## Using the admin editor

- **+ New entry** → fill in the form → **Publish**. Live immediately.
- **Save draft** keeps it out of the public site entirely — Row Level
  Security means a visitor's browser literally cannot read a draft row,
  not just that the UI hides it.
- Click any entry in the sidebar to reopen it: **Save changes**,
  **Unpublish** (back to draft), or **Delete**.
- The **formatting toolbar** above the body field (Bold, Italic,
  headings, links, lists, quote, code block) inserts Markdown syntax
  for you — click instead of typing symbols. Ctrl/Cmd+B and Ctrl/Cmd+I
  work too, and every edit stays on the browser's normal undo stack.
- **Add/remove categories** right next to the category dropdown —
  removing one warns you if entries currently use it (they keep the
  label on the entry itself, it just drops out of the public filter
  bar).

## Writing content

Supports `#`/`##`/`###` headers, **bold**, *italic*, `` `inline code` ``,
fenced ` ```code blocks``` `, `> quotes`, `- ` / `1. ` lists (single
level, no nesting), `[links](url)`, `![images](url)`, and `---` for a
divider. It's a small hand-written parser, not full CommonMark — no
tables or nested lists.

Every post stores both `bodyMd` (what you typed, so reopening it for
editing round-trips correctly) and `body`/`body_html` (pre-rendered
HTML, what the public site actually displays) — the public site never
runs a Markdown parser itself.

## Folder structure

```
docs/                 deployed to GitHub Pages — the public site
  index.html, post.html, style.css, script.js
  config.js            your Supabase URL + anon key
  robots.txt

admin/                 never deployed — open locally
  editor.html, editor.css, editor.js
  config.js             same Supabase values as docs/config.js
  supabase-client.js     auth + CRUD, talks to Supabase directly
  markdown.js             Markdown → HTML (shared logic, no dependencies)

supabase/
  schema.sql             run once — tables + Row Level Security
  seed-data.sql            optional — the 3 sample posts as SQL

.github/workflows/
  keep-alive.yml          optional — prevents free-tier auto-pause
```

## What changed from earlier versions of this project

Earlier iterations tried a File System Access API + local files
approach, then a GitHub-token push, then a full Express + Postgres
server on Render. This version replaces all of that: no server to
write or host, no cold starts, no GitHub token, and the same real login
a hosted backend would have given you — Supabase provides the backend,
your browser talks to it directly, and Row Level Security does the job
a hand-written auth layer would have done. `server/`, `storage.js`,
`github-sync.js`, and the RSS feed from earlier attempts are gone.
