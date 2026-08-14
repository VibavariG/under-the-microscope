/* =====================================================================
   UNDER THE MICROSCOPE — admin editor
   Local-only authoring tool. Never deployed (GitHub Pages is configured
   to serve only /docs), so there's nothing here that needs a login.
   ===================================================================== */

const state = {
  posts: [],
  drafts: [],
  categories: [],
  current: null,       // { type: 'draft' | 'published' | 'new', slug: string|null }
  slugManuallyEdited: false
};

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/* ---------------- boot / connection ---------------- */

async function boot() {
  const status = await Storage.tryResume();
  renderTopbarStatus(status);
  toggleManualTools();
  updateManualToolsUi();

  if (status === 'ready') {
    await loadData();
  } else if (status === 'manual') {
    await loadData(); // fetch-based, works with or without a local server
  } else {
    showConnectGate(status); // 'none' or 'needs-permission'
  }
}

function toggleManualTools() {
  document.getElementById('manual-tools-banner').style.display = Storage.mode === 'manual' ? 'block' : 'none';
}

function renderTopbarStatus(status) {
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  if (status === 'ready' || status === 'fsa') {
    dot.className = 'dot connected';
    label.textContent = 'Connected to blog folder';
  } else if (status === 'manual') {
    dot.className = 'dot manual';
    label.textContent = 'Manual mode — download files to save';
  } else {
    dot.className = 'dot';
    label.textContent = 'Not connected';
  }
}

function showConnectGate(status) {
  document.getElementById('layout').style.display = 'none';
  const gate = document.getElementById('connect-gate');
  gate.style.display = 'block';

  if (status === 'needs-permission') {
    gate.innerHTML = `
      <h2>Reconnect to your blog folder</h2>
      <p>Your browser needs permission confirmed again this session. Nothing has changed on disk — click below to continue where you left off.</p>
      <button class="btn btn--primary" id="reconnect-btn">Reconnect</button>
    `;
    document.getElementById('reconnect-btn').addEventListener('click', async () => {
      try {
        await Storage.reconnect();
        document.getElementById('connect-gate').style.display = 'none';
        document.getElementById('layout').style.display = 'grid';
        renderTopbarStatus('ready');
        toggleManualTools();
        await loadData();
      } catch (err) {
        gate.querySelector('p').textContent = err.message;
      }
    });
    return;
  }

  gate.innerHTML = `
    <h2>Connect your blog folder</h2>
    <p>Select the root folder of your <strong>under-the-microscope</strong> repo (the one containing <code>docs/</code> and <code>admin/</code>). The tool reads and writes <code>posts.json</code>, <code>categories.json</code>, <code>feed.xml</code>, and <code>drafts.json</code> directly — nothing is uploaded anywhere.</p>
    <button class="btn btn--primary" id="connect-btn">Connect folder</button>
  `;
  document.getElementById('connect-btn').addEventListener('click', async () => {
    try {
      await Storage.connect();
      document.getElementById('connect-gate').style.display = 'none';
      document.getElementById('layout').style.display = 'grid';
      renderTopbarStatus('ready');
      toggleManualTools();
      await loadData();
    } catch {
      // user cancelled the picker — stay on the gate
    }
  });
}

/* ---------------- data loading ---------------- */

async function loadData() {
  const { posts, categories, drafts } = await Storage.loadAll();
  state.posts = posts;
  state.categories = categories;
  state.drafts = drafts;
  refreshCategoryUI();
  renderSidebar();
  if (state.posts.length === 0 && state.drafts.length === 0) {
    showEmptyState();
  } else {
    newPost(); // start on a blank form, ready to write
  }
}

function populateCategorySelect() {
  const sel = document.getElementById('category-input');
  const current = sel.value;
  sel.innerHTML = state.categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
  if (state.categories.includes(current)) sel.value = current;
}

function renderCategoryChips() {
  const el = document.getElementById('category-chip-list');
  el.innerHTML = state.categories.map(c =>
    `<span class="category-chip">${escapeHTML(c)}<button type="button" data-cat="${escapeHTML(c)}" title="Remove category">&times;</button></span>`
  ).join('');
  el.querySelectorAll('button[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => removeCategory(btn.dataset.cat));
  });
}

function refreshCategoryUI() {
  populateCategorySelect();
  renderCategoryChips();
}

async function removeCategory(cat) {
  const inUse = [...state.posts, ...state.drafts].filter(p => p.category === cat).length;
  const warning = inUse > 0
    ? `Remove "${cat}"? ${inUse} ${inUse === 1 ? 'entry' : 'entries'} currently use it — they'll keep showing "${cat}" on the entry itself, but it will disappear from the site's filter bar.`
    : `Remove "${cat}"?`;
  if (!confirm(warning)) return;

  state.categories = state.categories.filter(c => c !== cat);
  await Storage.saveCategories(state.categories);
  refreshCategoryUI();
  await afterMutation('Category removed.', ['categories.json'], `Remove category: ${cat}`);
}

/* ---------------- sidebar ---------------- */

function renderSidebar() {
  const draftsEl = document.getElementById('drafts-list');
  const publishedEl = document.getElementById('published-list');

  document.getElementById('drafts-count').textContent = state.drafts.length;
  document.getElementById('published-count').textContent = state.posts.length;

  const sortedDrafts = state.drafts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const sortedPosts = state.posts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  draftsEl.innerHTML = sortedDrafts.length
    ? sortedDrafts.map(p => sidebarItem(p, 'draft')).join('')
    : '<div class="sidebar__empty">No drafts yet</div>';

  publishedEl.innerHTML = sortedPosts.length
    ? sortedPosts.map(p => sidebarItem(p, 'published')).join('')
    : '<div class="sidebar__empty">Nothing published yet</div>';

  document.querySelectorAll('.sidebar__item').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const slug = btn.dataset.slug;
      const item = (type === 'draft' ? state.drafts : state.posts).find(p => p.slug === slug);
      if (item) loadIntoForm(item, type);
    });
  });

  highlightActiveSidebarItem();
}

function sidebarItem(post, type) {
  const active = state.current && state.current.type === type && state.current.slug === post.slug;
  return `
    <button type="button" class="sidebar__item${active ? ' active' : ''}" data-type="${type}" data-slug="${escapeHTML(post.slug)}">
      ${escapeHTML(post.title || '(untitled)')}
      <span class="sidebar__item-date">${formatDate(post.date)}</span>
    </button>`;
}

function highlightActiveSidebarItem() {
  document.querySelectorAll('.sidebar__item').forEach(btn => {
    const isActive = state.current && state.current.type === btn.dataset.type && state.current.slug === btn.dataset.slug;
    btn.classList.toggle('active', !!isActive);
  });
}

/* ---------------- form ---------------- */

function showEmptyState() {
  document.getElementById('editor-form').style.display = 'none';
  document.getElementById('empty-state').style.display = 'block';
}

function newPost() {
  state.current = { type: 'new', slug: null };
  state.slugManuallyEdited = false;
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('editor-form').style.display = 'block';

  document.getElementById('title-input').value = '';
  document.getElementById('slug-input').value = '';
  document.getElementById('date-input').value = todayISO();
  document.getElementById('category-input').value = state.categories[0] || '';
  document.getElementById('tags-input').value = '';
  document.getElementById('excerpt-input').value = '';
  document.getElementById('body-input').value = '';
  updatePreview();
  clearBanner();
  renderActionButtons();
  highlightActiveSidebarItem();
  document.getElementById('title-input').focus();
}

function loadIntoForm(post, type) {
  state.current = { type, slug: post.slug };
  state.slugManuallyEdited = true; // don't auto-rewrite the slug of an existing item

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('editor-form').style.display = 'block';

  document.getElementById('title-input').value = post.title || '';
  document.getElementById('slug-input').value = post.slug || '';
  document.getElementById('date-input').value = post.date || todayISO();
  document.getElementById('category-input').value = post.category || state.categories[0] || '';
  document.getElementById('tags-input').value = (post.tags || []).join(', ');
  document.getElementById('excerpt-input').value = post.excerpt || '';
  document.getElementById('body-input').value = post.bodyMd || '';
  updatePreview();
  clearBanner();
  renderActionButtons();
  highlightActiveSidebarItem();
}

function collectFormData() {
  const title = document.getElementById('title-input').value.trim();
  const slug = document.getElementById('slug-input').value.trim();
  const date = document.getElementById('date-input').value || todayISO();
  const category = document.getElementById('category-input').value;
  const tags = document.getElementById('tags-input').value
    .split(',').map(t => t.trim()).filter(Boolean);
  const excerpt = document.getElementById('excerpt-input').value.trim();
  const bodyMd = document.getElementById('body-input').value;
  const body = mdToHTML(bodyMd);
  return { slug, title, date, category, tags, excerpt, bodyMd, body };
}

function updatePreview() {
  const md = document.getElementById('body-input').value;
  document.getElementById('preview-pane').innerHTML = mdToHTML(md) || '<p style="color:var(--ink-faint)">Preview appears here as you write.</p>';
}

/* ---------------- formatting toolbar ---------------- */
/* Inserts/wraps Markdown syntax around the current selection so you
   don't need to remember the syntax yourself — click a button, keep
   typing. All edits go through execCommand('insertText'), which is
   what keeps them on the browser's native undo stack (setting
   textarea.value directly, which the previous version did, wipes undo
   history entirely). */

function getBodyTextarea() {
  return document.getElementById('body-input');
}

function insertViaUndoableEdit(text) {
  const ta = getBodyTextarea();
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    // very old/unusual browser without execCommand support — falls back
    // to a direct edit (undo history is lost only in this rare case)
    const { selectionStart: start, selectionEnd: end, value } = ta;
    ta.value = value.slice(0, start) + text + value.slice(end);
    ta.setSelectionRange(start + text.length, start + text.length);
  }
}

function wrapSelection(before, after, placeholder) {
  const ta = getBodyTextarea();
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.slice(start, end) || placeholder;
  ta.focus();
  ta.setSelectionRange(start, end);
  insertViaUndoableEdit(before + selected + after);
  const selStart = start + before.length;
  ta.setSelectionRange(selStart, selStart + selected.length);
  updatePreview();
}

// Matches any existing line-prefix marker (header, quote, bullet, or
// numbered list) so switching between list types replaces the marker
// instead of stacking a new one on top of it.
const LINE_PREFIX_PATTERN = /^(#{1,6}\s+|>\s?|[-*]\s+|\d+\.\s+)/;

function stripLinePrefix(line) {
  return line.replace(LINE_PREFIX_PATTERN, '');
}

// makePrefix(n) returns the prefix for the nth (1-based) non-blank line
// — a fixed string for headers/quotes/bullets, or "1. ", "2. ", ... for
// ordered lists. isSameType(line) checks whether a line already has
// this exact marker, so clicking the same button twice toggles it off.
function applyLinePrefix(makePrefix, isSameType) {
  const ta = getBodyTextarea();
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const value = ta.value;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = value.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.length ? block.split('\n') : [''];

  const allApplied = lines.every(line => line === '' || isSameType(line));
  let n = 1;
  const nextLines = lines.map(line => {
    if (line === '') return line;
    const stripped = stripLinePrefix(line);
    if (allApplied) return stripped; // toggle off
    return makePrefix(n++) + stripped; // replace any other marker with this one
  });
  const nextBlock = nextLines.join('\n');

  ta.focus();
  ta.setSelectionRange(lineStart, lineEnd);
  insertViaUndoableEdit(nextBlock);
  ta.setSelectionRange(lineStart, lineStart + nextBlock.length);
  updatePreview();
}

function insertLinkLike(openMarker, placeholder, urlPlaceholder) {
  const ta = getBodyTextarea();
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const label = ta.value.slice(start, end) || placeholder;
  ta.focus();
  ta.setSelectionRange(start, end);
  insertViaUndoableEdit(`${openMarker}${label}](${urlPlaceholder})`);
  const urlStart = start + openMarker.length + label.length + 2; // past "]("
  ta.setSelectionRange(urlStart, urlStart + urlPlaceholder.length);
  updatePreview();
}

function insertAtCursor(text) {
  const ta = getBodyTextarea();
  ta.focus();
  insertViaUndoableEdit(text);
  updatePreview();
}

function applyMdFormat(action) {
  switch (action) {
    case 'bold': return wrapSelection('**', '**', 'bold text');
    case 'italic': return wrapSelection('*', '*', 'italic text');
    case 'code': return wrapSelection('`', '`', 'code');
    case 'codeblock': return wrapSelection('```\n', '\n```', 'code here');
    case 'h2': return applyLinePrefix(() => '## ', line => /^##\s+/.test(line));
    case 'h3': return applyLinePrefix(() => '### ', line => /^###\s+/.test(line));
    case 'quote': return applyLinePrefix(() => '> ', line => /^>\s?/.test(line));
    case 'ul': return applyLinePrefix(() => '- ', line => /^[-*]\s+/.test(line));
    case 'ol': return applyLinePrefix(n => `${n}. `, line => /^\d+\.\s+/.test(line));
    case 'link': return insertLinkLike('[', 'link text', 'https://');
    case 'image': return insertLinkLike('![', 'alt text', 'https://');
    case 'hr': return insertAtCursor('\n\n---\n\n');
  }
}

function wireToolbar() {
  document.getElementById('md-toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    applyMdFormat(btn.dataset.action);
  });
  getBodyTextarea().addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key.toLowerCase() === 'b') { e.preventDefault(); applyMdFormat('bold'); }
    else if (e.key.toLowerCase() === 'i') { e.preventDefault(); applyMdFormat('italic'); }
  });
}

function validate(data, excludeSlug) {
  if (!data.title) return 'Give this entry a title.';
  if (!data.slug) return 'Slug can\u2019t be empty.';
  if (!/^[a-z0-9-]+$/.test(data.slug)) return 'Slug can only contain lowercase letters, numbers, and hyphens.';
  const collision = [...state.posts, ...state.drafts].find(p => p.slug === data.slug && p.slug !== excludeSlug);
  if (collision) return `The slug "${data.slug}" is already used by another entry. Choose a different one.`;
  return null;
}

/* ---------------- actions ---------------- */

function renderActionButtons() {
  const el = document.getElementById('actions');
  const type = state.current ? state.current.type : 'new';

  if (type === 'published') {
    el.innerHTML = `
      <button class="btn btn--primary" id="save-published-btn">Save changes</button>
      <button class="btn" id="unpublish-btn">Unpublish</button>
      <button class="btn btn--danger" id="delete-btn">Delete</button>
    `;
    document.getElementById('save-published-btn').addEventListener('click', savePublishedChanges);
    document.getElementById('unpublish-btn').addEventListener('click', unpublish);
    document.getElementById('delete-btn').addEventListener('click', () => deleteEntry('published'));
  } else {
    el.innerHTML = `
      <button class="btn" id="save-draft-btn">Save draft</button>
      <button class="btn btn--primary" id="publish-btn">Publish</button>
      ${type === 'draft' ? '<button class="btn btn--danger" id="delete-btn">Delete draft</button>' : ''}
    `;
    document.getElementById('save-draft-btn').addEventListener('click', saveDraft);
    document.getElementById('publish-btn').addEventListener('click', publish);
    if (type === 'draft') {
      document.getElementById('delete-btn').addEventListener('click', () => deleteEntry('draft'));
    }
  }
}

function showBanner(message, kind) {
  const el = document.getElementById('banner');
  el.style.display = 'block';
  el.className = `banner banner--action${kind ? ` banner--${kind}` : ''}`;
  el.innerHTML = `<span>${message}</span>`;
}

function clearBanner() {
  const el = document.getElementById('banner');
  el.style.display = 'none';
  el.innerHTML = '';
}

function fileList(files) {
  if (files.length === 1) return files[0];
  if (files.length === 2) return `${files[0]} and ${files[1]}`;
  return `${files.slice(0, -1).join(', ')}, and ${files[files.length - 1]}`;
}

function updateManualToolsUi() {
  if (Storage.mode !== 'manual') return;
  const dirty = Storage.getDirtyFiles();
  const note = document.getElementById('manual-dirty-note');
  if (note) {
    note.textContent = dirty.length
      ? `Not yet downloaded: ${fileList(dirty)}.`
      : 'Everything you\u2019ve changed has been downloaded.';
  }
  [['posts', 'posts.json'], ['drafts', 'drafts.json'], ['categories', 'categories.json'], ['feed', 'feed.xml']]
    .forEach(([key, filename]) => {
      const btn = document.getElementById(`download-${key}-btn`);
      if (btn) btn.classList.toggle('btn--dirty', dirty.includes(filename));
    });
}

// Content GitHub push needs for each pushable file, read from current state.
function pushableContent(filename) {
  if (filename === 'posts.json') return JSON.stringify(state.posts, null, 2) + '\n';
  if (filename === 'categories.json') return JSON.stringify(state.categories, null, 2) + '\n';
  if (filename === 'feed.xml') return lastFeedXML;
  return null; // drafts.json is intentionally never pushed to GitHub
}

// Runs after every action that changes files: reports what was saved
// locally, and — if GitHub auto-push is configured — pushes the public
// files (never drafts.json) straight to the repo via the API, so
// Publish can go all the way to live without a manual git step.
async function afterMutation(prefix, filesChanged, commitMessage) {
  let msg = prefix;

  if (Storage.mode === 'fsa') {
    msg += ` ${fileList(filesChanged)} updated on disk.`;
  } else if (Storage.mode === 'manual') {
    msg += ` Download ${fileList(filesChanged)} below to save ${filesChanged.length > 1 ? 'them' : 'it'} locally.`;
  }

  const publicFiles = filesChanged.filter(f => f !== 'drafts.json');
  let kind = 'success';

  if (publicFiles.length) {
    if (GitHubSync.isConfigured()) {
      try {
        const files = publicFiles.map(name => ({ path: `docs/${name}`, content: pushableContent(name) }));
        await GitHubSync.pushFiles(files, commitMessage);
        msg += ' Pushed to GitHub — live in about a minute.';
      } catch (err) {
        msg += ` GitHub push failed (${err.message}) — your local copy is fine; check the GitHub settings and try "Push now."`;
        kind = 'error';
      }
    } else if (Storage.mode === 'fsa') {
      msg += ' Commit and push docs/ to make it live.';
    } else {
      msg += ' Then push it to your repo to make it live.';
    }
  }

  showBanner(msg, kind);
  updateManualToolsUi();
}

async function pushNow() {
  if (!GitHubSync.isConfigured()) return;
  await regenerateFeed();
  showBanner('Pushing current posts, categories, and feed to GitHub\u2026', 'success');
  try {
    const files = ['posts.json', 'categories.json', 'feed.xml']
      .map(name => ({ path: `docs/${name}`, content: pushableContent(name) }));
    await GitHubSync.pushFiles(files, 'Manual sync from admin tool');
    showBanner('Pushed posts.json, categories.json, and feed.xml to GitHub — live in about a minute.', 'success');
  } catch (err) {
    showBanner(`GitHub push failed: ${err.message}`, 'error');
  }
}

async function saveDraft() {
  const data = collectFormData();
  const excludeSlug = state.current.type === 'draft' ? state.current.slug : null;
  const err = validate(data, excludeSlug);
  if (err) return showBanner(err, 'error');

  state.drafts = state.drafts.filter(p => p.slug !== excludeSlug);
  state.drafts.push(data);
  await Storage.saveDrafts(state.drafts);

  state.current = { type: 'draft', slug: data.slug };
  state.slugManuallyEdited = true;
  renderSidebar();
  renderActionButtons();
  await afterMutation('Draft saved.', ['drafts.json'], `Save draft: ${data.title}`);
}

async function publish() {
  const data = collectFormData();
  const excludeSlug = state.current.slug; // whichever list it was in
  const err = validate(data, excludeSlug);
  if (err) return showBanner(err, 'error');

  const wasDraft = state.drafts.some(p => p.slug === excludeSlug);
  state.drafts = state.drafts.filter(p => p.slug !== excludeSlug);
  state.posts = state.posts.filter(p => p.slug !== excludeSlug);
  state.posts.push(data);

  const saves = [Storage.savePosts(state.posts)];
  if (wasDraft) saves.push(Storage.saveDrafts(state.drafts));
  await Promise.all(saves);
  await regenerateFeed();

  state.current = { type: 'published', slug: data.slug };
  state.slugManuallyEdited = true;
  renderSidebar();
  renderActionButtons();
  const changed = wasDraft ? ['drafts.json', 'posts.json', 'feed.xml'] : ['posts.json', 'feed.xml'];
  await afterMutation('Published.', changed, `Publish: ${data.title}`);
}

async function savePublishedChanges() {
  const data = collectFormData();
  const excludeSlug = state.current.slug;
  const err = validate(data, excludeSlug);
  if (err) return showBanner(err, 'error');

  state.posts = state.posts.filter(p => p.slug !== excludeSlug);
  state.posts.push(data);
  await Storage.savePosts(state.posts);
  await regenerateFeed();

  state.current = { type: 'published', slug: data.slug };
  renderSidebar();
  await afterMutation('Changes saved.', ['posts.json', 'feed.xml'], `Update: ${data.title}`);
}

async function unpublish() {
  if (!confirm('Move this entry back to drafts? It will no longer be visible on the public site.')) return;
  const slug = state.current.slug;
  const post = state.posts.find(p => p.slug === slug);
  if (!post) return;

  state.posts = state.posts.filter(p => p.slug !== slug);
  state.drafts.push(post);
  await Promise.all([Storage.savePosts(state.posts), Storage.saveDrafts(state.drafts)]);
  await regenerateFeed();

  state.current = { type: 'draft', slug };
  renderSidebar();
  renderActionButtons();
  await afterMutation('Moved back to drafts.', ['posts.json', 'drafts.json', 'feed.xml'], `Unpublish: ${post.title}`);
}

async function deleteEntry(type) {
  const label = type === 'draft' ? 'draft' : 'published entry';
  if (!confirm(`Delete this ${label}? This can't be undone.`)) return;
  const slug = state.current.slug;

  let changed;
  if (type === 'draft') {
    state.drafts = state.drafts.filter(p => p.slug !== slug);
    await Storage.saveDrafts(state.drafts);
    changed = ['drafts.json'];
  } else {
    state.posts = state.posts.filter(p => p.slug !== slug);
    await Storage.savePosts(state.posts);
    await regenerateFeed();
    changed = ['posts.json', 'feed.xml'];
  }

  renderSidebar();
  newPost();
  await afterMutation('Entry deleted.', changed, `Delete: ${slug}`);
}

/* ---------------- RSS ---------------- */

function escapeXML(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildFeedXML(posts) {
  const siteUrl = (localStorage.getItem('utm-site-url') || '').replace(/\/$/, '') || 'https://your-username.github.io/your-repo';
  const sorted = posts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const items = sorted.map(post => {
    const link = `${siteUrl}/post.html?slug=${encodeURIComponent(post.slug)}`;
    const pubDate = new Date(post.date + 'T00:00:00').toUTCString();
    const description = escapeXML(post.excerpt || stripTags(post.body).slice(0, 280));
    return `  <item>
    <title>${escapeXML(post.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <pubDate>${pubDate}</pubDate>
    ${post.category ? `<category>${escapeXML(post.category)}</category>` : ''}
    <description>${description}</description>
  </item>`;
  }).join('\n');

  const lastBuild = sorted.length ? new Date(sorted[0].date + 'T00:00:00').toUTCString() : new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Under the Microscope</title>
  <link>${siteUrl}/index.html</link>
  <description>A register of technical notes.</description>
  <language>en-us</language>
  <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

let lastFeedXML = '';

async function regenerateFeed() {
  lastFeedXML = buildFeedXML(state.posts);
  await Storage.saveFeedXML(lastFeedXML);
}

/* ---------------- manual-mode downloads ---------------- */

function wireDownloadButtons() {
  document.getElementById('download-posts-btn').addEventListener('click', () => {
    Storage.downloadJSON('posts.json', state.posts);
    updateManualToolsUi();
  });
  document.getElementById('download-drafts-btn').addEventListener('click', () => {
    Storage.downloadJSON('drafts.json', state.drafts);
    updateManualToolsUi();
  });
  document.getElementById('download-categories-btn').addEventListener('click', () => {
    Storage.downloadJSON('categories.json', state.categories);
    updateManualToolsUi();
  });
  document.getElementById('download-feed-btn').addEventListener('click', () => {
    Storage.downloadText('feed.xml', lastFeedXML || buildFeedXML(state.posts));
    updateManualToolsUi();
  });
}

/* ---------------- categories ---------------- */

function wireAddCategory() {
  document.getElementById('add-category-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-category-input');
    const name = input.value.trim();
    if (!name) return;
    if (state.categories.includes(name)) { input.value = ''; return; }
    state.categories.push(name);
    await Storage.saveCategories(state.categories);
    refreshCategoryUI();
    document.getElementById('category-input').value = name;
    input.value = '';
    await afterMutation('Category added.', ['categories.json'], `Add category: ${name}`);
  });
}

/* ---------------- GitHub auto-push settings ---------------- */

// Builds a GitHub token-creation URL with name, description, resource
// owner, and the Contents:write permission pre-filled via GitHub's
// documented query parameters. GitHub doesn't expose a parameter for
// pre-selecting a specific repository, so that one step still has to
// be done by hand on the page itself.
function buildTokenCreationUrl(owner, repo) {
  const base = 'Under the Microscope';
  const withRepo = repo ? `${base} - ${repo}` : base;
  const params = new URLSearchParams({
    name: withRepo.length <= 40 ? withRepo : base,
    description: 'Publish access for the Under the Microscope admin editor',
    contents: 'write',
    expires_in: '90'
  });
  if (owner) params.set('target_name', owner);
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`;
}

function updateTokenLink() {
  const owner = document.getElementById('gh-owner-input').value.trim();
  const repo = document.getElementById('gh-repo-input').value.trim();
  document.getElementById('gh-token-link').href = buildTokenCreationUrl(owner, repo);
  document.getElementById('gh-token-repo-hint').textContent = repo ? `"${repo}"` : 'your repo';
}

function wireGitHubSettings() {
  const ownerInput = document.getElementById('gh-owner-input');
  const repoInput = document.getElementById('gh-repo-input');
  const branchInput = document.getElementById('gh-branch-input');
  const tokenInput = document.getElementById('gh-token-input');
  const pushNowBtn = document.getElementById('gh-push-now-btn');

  const cfg = GitHubSync.getConfig();
  ownerInput.value = cfg.owner;
  repoInput.value = cfg.repo;
  branchInput.value = cfg.branch || 'main';
  // token input stays blank even when a token is stored — avoids
  // displaying it back in plain text on every page load
  refreshGitHubStatus();
  updateTokenLink();

  ownerInput.addEventListener('input', updateTokenLink);
  repoInput.addEventListener('input', updateTokenLink);

  document.getElementById('gh-save-btn').addEventListener('click', async () => {
    GitHubSync.saveConfig({
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim(),
      branch: branchInput.value.trim() || 'main',
      token: tokenInput.value.trim()
    });
    tokenInput.value = '';
    document.getElementById('gh-status').textContent = 'Checking connection\u2026';
    const result = await GitHubSync.testConnection();
    refreshGitHubStatus(result);
  });

  pushNowBtn.addEventListener('click', pushNow);

  document.getElementById('gh-disconnect-btn').addEventListener('click', () => {
    GitHubSync.clearAll();
    ownerInput.value = '';
    repoInput.value = '';
    branchInput.value = '';
    tokenInput.value = '';
    updateTokenLink();
    refreshGitHubStatus();
  });
}

function refreshGitHubStatus(testResult) {
  const statusEl = document.getElementById('gh-status');
  const pushNowBtn = document.getElementById('gh-push-now-btn');
  const cfg = GitHubSync.getConfig();

  if (!GitHubSync.isConfigured()) {
    statusEl.textContent = 'Not connected \u2014 publishing still saves locally; push to your repo manually.';
    pushNowBtn.disabled = true;
    return;
  }
  if (testResult && !testResult.ok) {
    statusEl.textContent = `Connection failed: ${testResult.error}`;
    pushNowBtn.disabled = true;
    return;
  }
  statusEl.textContent = `Connected to ${cfg.owner}/${cfg.repo} (${cfg.branch}) \u2014 publishing pushes automatically.`;
  pushNowBtn.disabled = false;
}

/* ---------------- wiring ---------------- */

function wireStaticControls() {
  document.getElementById('new-post-btn').addEventListener('click', newPost);
  document.getElementById('title-input').addEventListener('input', (e) => {
    if (!state.slugManuallyEdited) {
      document.getElementById('slug-input').value = slugify(e.target.value);
    }
  });
  document.getElementById('slug-input').addEventListener('input', () => { state.slugManuallyEdited = true; });
  document.getElementById('body-input').addEventListener('input', updatePreview);

  const siteUrlInput = document.getElementById('site-url-input');
  siteUrlInput.value = localStorage.getItem('utm-site-url') || '';
  siteUrlInput.addEventListener('change', () => {
    localStorage.setItem('utm-site-url', siteUrlInput.value.trim());
  });

  wireDownloadButtons();
  wireAddCategory();
  wireToolbar();
  wireGitHubSettings();

  // Manual mode holds unsaved changes only in memory until you click a
  // download button — warn before the tab closes so that work isn't
  // silently lost.
  window.addEventListener('beforeunload', (e) => {
    if (Storage.mode === 'manual' && Storage.getDirtyFiles().length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireStaticControls();
  boot();
});