/* =====================================================================
   Optional GitHub auto-push.

   Uses the GitHub REST Contents API directly from the browser to write
   files straight to your repo — no git commands needed. This is
   entirely separate from local file access (File System Access API or
   manual downloads): it works over the network regardless of browser,
   so it's available even in "manual mode".

   Your personal access token is stored only in this browser's
   localStorage and sent only to api.github.com over HTTPS — never to
   any other server. Use a fine-grained token
   (https://github.com/settings/personal-access-tokens/new) scoped to
   just this one repository with "Contents: Read and write" permission,
   rather than a classic token with full "repo" scope, so a leaked
   token can't reach anything else in your account.
   ===================================================================== */

const GitHubSync = (() => {
  const KEYS = {
    owner: 'utm-gh-owner',
    repo: 'utm-gh-repo',
    branch: 'utm-gh-branch',
    token: 'utm-gh-token'
  };

  function getConfig() {
    return {
      owner: localStorage.getItem(KEYS.owner) || '',
      repo: localStorage.getItem(KEYS.repo) || '',
      branch: localStorage.getItem(KEYS.branch) || 'main',
      token: localStorage.getItem(KEYS.token) || ''
    };
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c.owner && c.repo && c.token);
  }

  function saveConfig({ owner, repo, branch, token }) {
    localStorage.setItem(KEYS.owner, owner || '');
    localStorage.setItem(KEYS.repo, repo || '');
    localStorage.setItem(KEYS.branch, branch || 'main');
    if (token) localStorage.setItem(KEYS.token, token); // don't overwrite with blank
  }

  function clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  function toBase64Utf8(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function authHeaders(token) {
    return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  }

  async function getFileSha(path) {
    const c = getConfig();
    const res = await fetch(
      `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}?ref=${encodeURIComponent(c.branch)}`,
      { headers: authHeaders(c.token) }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`couldn't read ${path} (${res.status})`);
    const data = await res.json();
    return data.sha;
  }

  async function putFile(path, content, message) {
    const c = getConfig();
    const sha = await getFileSha(path);
    const body = { message, content: toBase64Utf8(content), branch: c.branch };
    if (sha) body.sha = sha;
    const res = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}`, {
      method: 'PUT',
      headers: { ...authHeaders(c.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `failed to update ${path} (${res.status})`);
    }
    return res.json();
  }

  // files: [{ path, content }]. Pushes sequentially so each commit's
  // sha lookup reflects the previous write.
  async function pushFiles(files, message) {
    for (const f of files) {
      await putFile(f.path, f.content, message);
    }
  }

  async function testConnection() {
    const c = getConfig();
    if (!c.owner || !c.repo || !c.token) return { ok: false, error: 'Missing owner, repo, or token.' };
    try {
      const res = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}`, { headers: authHeaders(c.token) });
      if (res.status === 401) return { ok: false, error: 'Invalid token.' };
      if (res.status === 404) return { ok: false, error: 'Repo not found — check owner/repo spelling and token access.' };
      if (!res.ok) return { ok: false, error: `Unexpected response (${res.status}).` };
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error — check your connection.' };
    }
  }

  return { getConfig, isConfigured, saveConfig, clearAll, pushFiles, testConnection };
})();
