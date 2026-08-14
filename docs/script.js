/* =====================================================================
   UNDER THE MICROSCOPE — public site logic
   Loads posts.json + categories.json, renders the register (feed) or a
   single entry, and handles category / tag / search filtering entirely
   client-side (no backend, no reload — state lives in the URL so
   filtered views stay shareable).
   ===================================================================== */

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function reticleSVG() {
  return `<svg class="reticle" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="12" cy="12" r="7.5" stroke-width="1.6"/>
    <line x1="12" y1="1.5" x2="12" y2="5.5" stroke-width="1.6"/>
    <line x1="12" y1="18.5" x2="12" y2="22.5" stroke-width="1.6"/>
    <line x1="1.5" y1="12" x2="5.5" y2="12" stroke-width="1.6"/>
    <line x1="18.5" y1="12" x2="22.5" y2="12" stroke-width="1.6"/>
  </svg>`;
}

function formatDate(iso) {
  // date-only, no time — accepts "YYYY-MM-DD" or a full ISO timestamp
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

async function loadPosts() {
  const posts = await loadJSON('posts.json');
  return posts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
}

/* ---------------- Feed (index.html) ---------------- */

let ALL_POSTS = [];

function currentFilters() {
  const params = new URLSearchParams(window.location.search);
  return {
    category: params.get('category') || 'All',
    tag: params.get('tag') || '',
    q: params.get('q') || ''
  };
}

function setFilters(next, { push = true } = {}) {
  const params = new URLSearchParams(window.location.search);
  Object.entries(next).forEach(([key, val]) => {
    if (!val || val === 'All') params.delete(key);
    else params.set(key, val);
  });
  const url = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
  if (push) history.pushState({}, '', url);
  else history.replaceState({}, '', url);
  applyFiltersAndRender();
}

function matchesFilters(post, filters) {
  if (filters.category !== 'All' && post.category !== filters.category) return false;
  if (filters.tag && !(post.tags || []).includes(filters.tag)) return false;
  if (filters.q) {
    const haystack = [
      post.title,
      post.excerpt,
      (post.tags || []).join(' '),
      stripTags(post.body)
    ].join(' ').toLowerCase();
    if (!haystack.includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

function renderPills(categories, filters) {
  const pillsEl = document.getElementById('category-pills');
  const all = ['All', ...categories];
  pillsEl.innerHTML = all.map(cat => {
    const active = cat === filters.category;
    return `<button class="pill" type="button" data-category="${escapeHTML(cat)}" aria-pressed="${active}">${escapeHTML(cat)}</button>`;
  }).join('');
  pillsEl.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      setFilters({ category: btn.dataset.category === 'All' ? '' : btn.dataset.category });
    });
  });
}

function renderTagNote(filters) {
  const el = document.getElementById('active-tag-note');
  if (!filters.tag) { el.innerHTML = ''; return; }
  el.innerHTML = `<span>Filtering by tag: <strong>#${escapeHTML(filters.tag)}</strong></span><button type="button" id="clear-tag-btn">Clear</button>`;
  document.getElementById('clear-tag-btn').addEventListener('click', () => setFilters({ tag: '' }));
}

function renderEntries(posts) {
  const listEl = document.getElementById('register-list');
  if (posts.length === 0) {
    listEl.innerHTML = `<div class="register__empty">No entries match this filter yet.</div>`;
    return;
  }
  listEl.innerHTML = posts.map(post => {
    const tags = (post.tags || []).map(t =>
      `<a class="tag-chip" href="index.html?tag=${encodeURIComponent(t)}" data-tag="${escapeHTML(t)}">#${escapeHTML(t)}</a>`
    ).join('');
    return `
      <div class="entry">
        <a class="entry__link" href="post.html?slug=${encodeURIComponent(post.slug)}">
          <div class="entry__meta-row">
            ${reticleSVG()}
            <span>${formatDate(post.date)}</span>
            ${post.category ? `<span class="entry__category">${escapeHTML(post.category)}</span>` : ''}
          </div>
          <h2 class="entry__title">${escapeHTML(post.title)}</h2>
          ${post.excerpt ? `<p class="entry__excerpt">${escapeHTML(post.excerpt)}</p>` : ''}
        </a>
        ${tags ? `<div class="entry__tags">${tags}</div>` : ''}
      </div>`;
  }).join('');

  // tag chips should filter in place, not just navigate, when JS is live
  listEl.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      setFilters({ tag: chip.dataset.tag });
    });
  });
}

function applyFiltersAndRender() {
  const filters = currentFilters();
  const searchInput = document.getElementById('search-input');
  if (searchInput && searchInput.value !== filters.q) searchInput.value = filters.q;

  document.querySelectorAll('#category-pills .pill').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.category === filters.category));
  });

  renderTagNote(filters);
  const filtered = ALL_POSTS.filter(p => matchesFilters(p, filters));
  renderEntries(filtered);
}

async function renderFeed() {
  const listEl = document.getElementById('register-list');
  const statsEl = document.getElementById('masthead-stats');
  try {
    const [posts, categories] = await Promise.all([loadPosts(), loadJSON('categories.json')]);
    ALL_POSTS = posts;

    if (statsEl) {
      if (posts.length === 0) {
        statsEl.innerHTML = `<span>No entries yet</span>`;
      } else {
        const oldest = posts[posts.length - 1];
        statsEl.innerHTML =
          `<span><b>${posts.length}</b> ${posts.length === 1 ? 'entry' : 'entries'}</span>` +
          `<span>since <b>${formatDate(oldest.date)}</b></span>`;
      }
    }

    const filters = currentFilters();
    renderPills(categories, filters);

    const searchInput = document.getElementById('search-input');
    searchInput.value = filters.q;
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => setFilters({ q: searchInput.value.trim() }), 150);
    });

    window.addEventListener('popstate', applyFiltersAndRender);
    applyFiltersAndRender();
  } catch (err) {
    listEl.innerHTML = `<div class="register__empty">Couldn't load the register (${escapeHTML(err.message)}). If you're viewing this as a local file:// URL, run a local server instead — see README.md.</div>`;
  }
}

/* ---------------- Single post (post.html) ---------------- */

async function renderPost() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const root = document.getElementById('post-root');

  try {
    const posts = await loadPosts();
    const post = posts.find(p => p.slug === slug);

    if (!slug || !post) {
      root.innerHTML = `<p class="register__empty">This entry isn't in the register. <a href="index.html">Back to the Register</a>.</p>`;
      document.title = 'Not found — Under the Microscope';
      return;
    }

    document.title = `${post.title} — Under the Microscope`;

    const tags = (post.tags || []).map(t =>
      `<a class="tag-chip" href="index.html?tag=${encodeURIComponent(t)}">#${escapeHTML(t)}</a>`
    ).join('');

    root.innerHTML = `
      ${post.category ? `<div class="post-category">${reticleSVG()}<a href="index.html?category=${encodeURIComponent(post.category)}">${escapeHTML(post.category)}</a></div>` : ''}
      <h1 class="post-title">${escapeHTML(post.title)}</h1>
      <div class="post-meta"><span>${formatDate(post.date)}</span></div>
      <div class="post-content">${post.body || ''}</div>
      ${tags ? `<div class="post-tags">${tags}</div>` : ''}
      <div class="share">
        <span class="share__label">Share this entry</span>
        <button class="share__btn" id="copy-link-btn" type="button">Copy link</button>
      </div>
    `;

    const btn = document.getElementById('copy-link-btn');
    btn.addEventListener('click', async () => {
      const url = window.location.href;
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = 'Link copied';
      } catch {
        btn.textContent = url;
      }
      setTimeout(() => { btn.textContent = 'Copy link'; }, 2000);
    });
  } catch (err) {
    root.innerHTML = `<p class="register__empty">Couldn't load this entry (${escapeHTML(err.message)}). If you're viewing this as a local file:// URL, run a local server instead — see README.md.</p>`;
  }
}
