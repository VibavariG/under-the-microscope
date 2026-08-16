/* =====================================================================
   Storage layer for the admin editor.

   Primary path (Chrome/Edge — supports the File System Access API):
   you grant the tool access to your repo folder once, and it reads and
   writes docs/posts.json, docs/categories.json, docs/feed.xml, and
   admin/drafts.json directly on disk. The handle is remembered in
   IndexedDB so you don't have to re-pick the folder every time — you
   only need to click "Reconnect" once per browser session, because
   the permission itself (not the folder choice) needs a fresh user
   gesture each session for security.

   Fallback path (Firefox/Safari — no File System Access API): if you're
   running a local server (see README), the tool reads the current files
   over fetch; otherwise it starts from empty/defaults. Either way, after
   editing you click a "Download" button per file and overwrite it in
   your repo by hand before committing.
   ===================================================================== */

const Storage = (() => {
  const DB_NAME = 'utm-admin';
  const STORE = 'handles';
  const supportsFSA = 'showDirectoryPicker' in window;

  const DEFAULT_CATEGORIES = ['Systems', 'Backend', 'AI', 'Biology', 'Book Notes', 'Career'];

  let mode = 'none'; // 'fsa' | 'manual'
  let rootHandle = null;
  let manualData = { posts: [], drafts: [], categories: DEFAULT_CATEGORIES };

  async function fetchJSONOrDefault(path, fallback) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) return fallback;
      const text = await res.text();
      return text.trim() ? JSON.parse(text) : fallback;
    } catch {
      return fallback; // no local server running, file:// CORS, or file doesn't exist yet
    }
  }

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getSubdir(name, { create = false } = {}) {
    return rootHandle.getDirectoryHandle(name, { create });
  }

  async function readJSONFile(dirHandle, filename, fallback) {
    try {
      const fileHandle = await dirHandle.getFileHandle(filename, { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      return text.trim() ? JSON.parse(text) : fallback;
    } catch (err) {
      if (err.name === 'NotFoundError') return fallback;
      throw err;
    }
  }

  async function writeJSONFile(dirHandle, filename, data) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2) + '\n');
    await writable.close();
  }

  async function writeTextFile(dirHandle, filename, text) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  return {
    supportsFSA,
    get mode() { return mode; },

    // Try to resume a previously-granted folder without prompting a picker.
    // Still returns 'needs-permission' if the permission itself must be
    // re-confirmed with a user gesture (normal browser behavior).
    async tryResume() {
      if (!supportsFSA) { mode = 'manual'; return 'manual'; }
      const stored = await idbGet('root');
      if (!stored) return 'none';
      rootHandle = stored;
      const perm = await rootHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') { mode = 'fsa'; return 'ready'; }
      return 'needs-permission';
    },

    async reconnect() {
      const perm = await rootHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') throw new Error('Permission was not granted.');
      mode = 'fsa';
      return true;
    },

    async connect() {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      rootHandle = handle;
      await idbSet('root', handle);
      mode = 'fsa';
      return true;
    },

    async loadAll() {
      if (mode === 'fsa') {
        const docs = await getSubdir('docs', { create: true });
        const admin = await getSubdir('admin', { create: true });
        const [posts, categories, drafts] = await Promise.all([
          readJSONFile(docs, 'posts.json', []),
          readJSONFile(docs, 'categories.json', ['Systems', 'Backend', 'AI', 'Biology', 'Book Notes', 'Career']),
          readJSONFile(admin, 'drafts.json', [])
        ]);
        return { posts, categories, drafts };
      }
      // manual mode: fetch current files if a local server is serving the
      // repo (../docs/... from admin/); falls back to empty/defaults if
      // there's no server running yet or the files don't exist.
      const [posts, categories, drafts] = await Promise.all([
        fetchJSONOrDefault('../docs/posts.json', []),
        fetchJSONOrDefault('../docs/categories.json', DEFAULT_CATEGORIES),
        fetchJSONOrDefault('./drafts.json', [])
      ]);
      manualData = { posts, categories, drafts };
      return { posts, categories, drafts };
    },

    async savePosts(posts) {
      if (mode === 'fsa') {
        const docs = await getSubdir('docs', { create: true });
        await writeJSONFile(docs, 'posts.json', posts);
      } else {
        manualData.posts = posts;
      }
    },

    async saveDrafts(drafts) {
      if (mode === 'fsa') {
        const admin = await getSubdir('admin', { create: true });
        await writeJSONFile(admin, 'drafts.json', drafts);
      } else {
        manualData.drafts = drafts;
      }
    },

    async saveCategories(categories) {
      if (mode === 'fsa') {
        const docs = await getSubdir('docs', { create: true });
        await writeJSONFile(docs, 'categories.json', categories);
      } else {
        manualData.categories = categories;
      }
    },

    async saveFeedXML(xmlString) {
      if (mode === 'fsa') {
        const docs = await getSubdir('docs', { create: true });
        await writeTextFile(docs, 'feed.xml', xmlString);
      }
      // manual mode: feed.xml regeneration is skipped — offered as a
      // download instead, see downloadFeedXML in editor.js
    },

    // ---- manual-mode helpers ----
    manualGet(kind) { return manualData[kind]; },

    downloadJSON(filename, data) {
      const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },

    downloadText(filename, text) {
      const blob = new Blob([text], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };
})();
