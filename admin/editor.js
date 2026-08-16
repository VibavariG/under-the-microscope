/* =====================================================================
   UNDER THE MICROSCOPE — admin editor
   Local-only authoring tool (opened on your own machine, never
   deployed). Talks directly to Supabase: Supabase Auth for login, and
   the posts/categories tables for everything else. Row Level Security
   on the database (see supabase/schema.sql) is what actually enforces
   that only a logged-in session can write.
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

/* ---------------- boot / login ---------------- */

async function boot() {
  AdminData.init(SUPABASE_URL, SUPABASE_ANON_KEY);
  const session = await AdminData.getSession();
  if (session) {
    showApp(session.user.email);
  } else {
    showLoginGate();
  }
}

function showLoginGate(errorMessage) {
  document.getElementById('layout').style.display = 'none';
  const gate = document.getElementById('login-gate');
  gate.style.display = 'block';
  gate.innerHTML = `
    <h2>Admin Login</h2>
    <p>Log in with the account created for you in the Supabase dashboard.</p>
    ${errorMessage ? `<p style="color:var(--red);">${escapeHTML(errorMessage)}</p>` : ''}
    <div class="field"><input type="email" id="login-email" placeholder="Email" autocomplete="username"></div>
    <div class="field"><input type="password" id="login-password" placeholder="Password" autocomplete="current-password"></div>
    <button class="btn btn--primary" id="login-btn" type="button">Log In</button>
  `;
  const submit = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) return;
    try {
      const user = await AdminData.login(email, password);
      showApp(user.email);
    } catch (err) {
      showLoginGate(err.message);
    }
  };
  document.getElementById('login-btn').addEventListener('click', submit);
  gate.querySelector('#login-password').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

async function showApp(email) {
  document.getElementById('login-gate').style.display = 'none';
  document.getElementById('layout').style.display = 'grid';
  document.getElementById('logged-in-as').textContent = email;
  await loadData();
}

async function logout() {
  await AdminData.logout();
  state.posts = []; state.drafts = []; state.categories = []; state.current = null;
  showLoginGate();
}

/* ---------------- data loading ---------------- */

async function loadData() {
  try {
    const { posts, categories, drafts } = await AdminData.loadAll();
    state.posts = posts;
    state.categories = categories;
    state.drafts = drafts;
    refreshCategoryUI();
    renderSidebar();
    if (state.posts.length === 0 && state.drafts.length === 0) {
      showEmptyState();
    } else {
      newPost();
    }
  } catch (err) {
    showBanner(`Couldn't load your data: ${err.message}`, 'error');
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
  try {
    const inUse = await AdminData.categoryUsage(cat);
    const warning = inUse > 0
      ? `Remove "${cat}"? ${inUse} ${inUse === 1 ? 'entry' : 'entries'} currently use it — they'll keep showing "${cat}" on the entry itself, but it will disappear from the site's filter bar.`
      : `Remove "${cat}"?`;
    if (!confirm(warning)) return;

    await AdminData.removeCategory(cat);
    state.categories = state.categories.filter(c => c !== cat);
    refreshCategoryUI();
    showBanner('Category removed — live immediately.', 'success');
  } catch (err) {
    showBanner(`Couldn't remove category: ${err.message}`, 'error');
  }
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
  document.getElementById('body-input').innerHTML = '';
  clearBanner();
  renderActionButtons();
  highlightActiveSidebarItem();
  document.getElementById('title-input').focus();
}

function loadIntoForm(post, type) {
  state.current = { type, slug: post.slug };
  state.slugManuallyEdited = true;

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('editor-form').style.display = 'block';

  document.getElementById('title-input').value = post.title || '';
  document.getElementById('slug-input').value = post.slug || '';
  document.getElementById('date-input').value = post.date || todayISO();
  document.getElementById('category-input').value = post.category || state.categories[0] || '';
  document.getElementById('tags-input').value = (post.tags || []).join(', ');
  document.getElementById('excerpt-input').value = post.excerpt || '';
  document.getElementById('body-input').innerHTML = post.body || '';
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
  const body = document.getElementById('body-input').innerHTML;
  return { slug, title, date, category, tags, excerpt, body };
}

/* ---------------- formatting toolbar (WYSIWYG) ---------------- */
/* The body field is a contenteditable styled to look exactly like a
   published article — no separate preview needed. execCommand handles
   native rich-text behavior (native undo included); the few things it
   doesn't cover (inline code, code block) wrap the selection by hand. */

function getBodyEl() {
  return document.getElementById('body-input');
}

function wrapSelectionWithTag(tagName) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const el = document.createElement(tagName);
  try {
    range.surroundContents(el);
  } catch {
    el.appendChild(range.extractContents());
    range.insertNode(el);
  }
  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(el);
  sel.addRange(newRange);
}

function applyMdFormat(action) {
  getBodyEl().focus();
  switch (action) {
    case 'bold': return document.execCommand('bold');
    case 'italic': return document.execCommand('italic');
    case 'code': return wrapSelectionWithTag('code');
    case 'codeblock': return wrapSelectionWithTag('pre');
    case 'h2': return document.execCommand('formatBlock', false, 'h2');
    case 'h3': return document.execCommand('formatBlock', false, 'h3');
    case 'quote': return document.execCommand('formatBlock', false, 'blockquote');
    case 'ul': return document.execCommand('insertUnorderedList');
    case 'ol': return document.execCommand('insertOrderedList');
    case 'hr': return document.execCommand('insertHorizontalRule');
    case 'link': {
      const url = prompt('Link URL:', 'https://');
      if (url) document.execCommand('createLink', false, url);
      return;
    }
    case 'image': {
      const url = prompt('Image URL:', 'https://');
      if (url) document.execCommand('insertImage', false, url);
      return;
    }
  }
}

function wireToolbar() {
  document.getElementById('md-toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    applyMdFormat(btn.dataset.action);
  });
  getBodyEl().addEventListener('keydown', (e) => {
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

async function saveDraft() {
  const data = collectFormData();
  const originalSlug = state.current.type === 'draft' ? state.current.slug : null;
  const err = validate(data, originalSlug);
  if (err) return showBanner(err, 'error');

  try {
    await AdminData.savePost(originalSlug, { ...data, status: 'draft' });
    state.drafts = state.drafts.filter(p => p.slug !== originalSlug);
    state.drafts.push({ ...data, status: 'draft' });
    state.current = { type: 'draft', slug: data.slug };
    state.slugManuallyEdited = true;
    renderSidebar();
    renderActionButtons();
    showBanner('Draft saved.', 'success');
  } catch (err) {
    showBanner(`Couldn't save: ${err.message}`, 'error');
  }
}

async function publish() {
  const data = collectFormData();
  const originalSlug = state.current.slug;
  const err = validate(data, originalSlug);
  if (err) return showBanner(err, 'error');

  try {
    await AdminData.savePost(originalSlug, { ...data, status: 'published' });
    state.drafts = state.drafts.filter(p => p.slug !== originalSlug);
    state.posts = state.posts.filter(p => p.slug !== originalSlug);
    state.posts.push({ ...data, status: 'published' });
    state.current = { type: 'published', slug: data.slug };
    state.slugManuallyEdited = true;
    renderSidebar();
    renderActionButtons();
    showBanner('Published — live now.', 'success');
  } catch (err) {
    showBanner(`Couldn't publish: ${err.message}`, 'error');
  }
}

async function savePublishedChanges() {
  const data = collectFormData();
  const originalSlug = state.current.slug;
  const err = validate(data, originalSlug);
  if (err) return showBanner(err, 'error');

  try {
    await AdminData.savePost(originalSlug, { ...data, status: 'published' });
    state.posts = state.posts.filter(p => p.slug !== originalSlug);
    state.posts.push({ ...data, status: 'published' });
    state.current = { type: 'published', slug: data.slug };
    renderSidebar();
    showBanner('Changes saved — live now.', 'success');
  } catch (err) {
    showBanner(`Couldn't save: ${err.message}`, 'error');
  }
}

async function unpublish() {
  if (!confirm('Move this entry back to drafts? It will no longer be visible on the public site.')) return;
  const slug = state.current.slug;
  const post = state.posts.find(p => p.slug === slug);
  if (!post) return;

  try {
    await AdminData.savePost(slug, { ...post, status: 'draft' });
    state.posts = state.posts.filter(p => p.slug !== slug);
    state.drafts.push({ ...post, status: 'draft' });
    state.current = { type: 'draft', slug };
    renderSidebar();
    renderActionButtons();
    showBanner('Moved back to drafts.', 'success');
  } catch (err) {
    showBanner(`Couldn't unpublish: ${err.message}`, 'error');
  }
}

async function deleteEntry(type) {
  const label = type === 'draft' ? 'draft' : 'published entry';
  if (!confirm(`Delete this ${label}? This can't be undone.`)) return;
  const slug = state.current.slug;

  try {
    await AdminData.deletePost(slug);
    if (type === 'draft') {
      state.drafts = state.drafts.filter(p => p.slug !== slug);
    } else {
      state.posts = state.posts.filter(p => p.slug !== slug);
    }
    renderSidebar();
    newPost();
    showBanner(type === 'draft' ? 'Draft deleted.' : 'Entry deleted.', 'success');
  } catch (err) {
    showBanner(`Couldn't delete: ${err.message}`, 'error');
  }
}

async function addCategory() {
  const input = document.getElementById('new-category-input');
  const name = input.value.trim();
  if (!name) return;
  if (state.categories.includes(name)) { input.value = ''; return; }
  try {
    await AdminData.addCategory(name);
    state.categories.push(name);
    refreshCategoryUI();
    document.getElementById('category-input').value = name;
    input.value = '';
    showBanner('Category added.', 'success');
  } catch (err) {
    showBanner(`Couldn't add category: ${err.message}`, 'error');
  }
}

/* ---------------- wiring ---------------- */

function wireStaticControls() {
  document.getElementById('new-post-btn').addEventListener('click', newPost);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('title-input').addEventListener('input', (e) => {
    if (!state.slugManuallyEdited) {
      document.getElementById('slug-input').value = slugify(e.target.value);
    }
  });
  document.getElementById('slug-input').addEventListener('input', () => { state.slugManuallyEdited = true; });
  document.getElementById('add-category-btn').addEventListener('click', addCategory);
  wireToolbar();
}

document.addEventListener('DOMContentLoaded', () => {
  wireStaticControls();
  boot();
});