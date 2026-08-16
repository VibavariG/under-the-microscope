/* =====================================================================
   Admin data layer, backed directly by Supabase.

   Auth: Supabase Auth handles login. There's no public sign-up in this
   app — the only account is the one you create by hand in the Supabase
   dashboard (Authentication → Users → Add user), so "logged in" always
   means "you."

   Data: reads/writes go straight to the posts/categories tables. Row
   Level Security (supabase/schema.sql) is what actually enforces that
   only a logged-in session can write — this file doesn't need its own
   auth checks, the database does that regardless of what this code
   does or doesn't do correctly, which is the point of RLS.
   ===================================================================== */

const AdminData = (() => {
  let client = null;

  function init(url, anonKey) {
    client = supabase.createClient(url, anonKey);
    return client;
  }

  function requireClient() {
    if (!client) throw new Error('Supabase client not initialized — call AdminData.init() first.');
    return client;
  }

  async function login(email, password) {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data.user;
  }

  async function logout() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw new Error(error.message);
  }

  async function getSession() {
    const { data } = await requireClient().auth.getSession();
    return data.session;
  }

  async function loadAll() {
    const [postsRes, categoriesRes] = await Promise.all([
      requireClient().from('posts').select('*').order('date', { ascending: false }),
      requireClient().from('categories').select('name').order('sort_order')
    ]);
    if (postsRes.error) throw new Error(postsRes.error.message);
    if (categoriesRes.error) throw new Error(categoriesRes.error.message);

    const toAdminPost = row => ({
      slug: row.slug,
      title: row.title,
      date: row.date,
      category: row.category,
      tags: row.tags || [],
      excerpt: row.excerpt,
      bodyMd: row.body_md,
      status: row.status
    });

    const all = postsRes.data.map(toAdminPost);
    return {
      posts: all.filter(p => p.status === 'published'),
      drafts: all.filter(p => p.status === 'draft'),
      categories: categoriesRes.data.map(r => r.name)
    };
  }

  // originalSlug is null for a brand-new entry. Renaming a slug is a
  // delete+insert under the hood since slug is the primary key.
  async function savePost(originalSlug, post) {
    const row = {
      slug: post.slug,
      title: post.title,
      date: post.date,
      category: post.category || null,
      tags: post.tags || [],
      excerpt: post.excerpt || '',
      body_md: post.bodyMd || '',
      body_html: post.body || '',
      status: post.status
    };

    if (originalSlug && originalSlug !== post.slug) {
      const { error: delErr } = await requireClient().from('posts').delete().eq('slug', originalSlug);
      if (delErr) throw new Error(delErr.message);
    }

    const { data, error } = await requireClient().from('posts').upsert(row).select().single();
    if (error) {
      if (error.code === '23505') throw new Error(`The slug "${post.slug}" is already used by another entry.`);
      throw new Error(error.message);
    }
    return data;
  }

  async function deletePost(slug) {
    const { error } = await requireClient().from('posts').delete().eq('slug', slug);
    if (error) throw new Error(error.message);
  }

  async function addCategory(name) {
    const { data: maxRow } = await requireClient().from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const nextOrder = maxRow ? maxRow.sort_order + 1 : 0;
    const { error } = await requireClient().from('categories').upsert({ name, sort_order: nextOrder }, { onConflict: 'name', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  async function removeCategory(name) {
    const { error } = await requireClient().from('categories').delete().eq('name', name);
    if (error) throw new Error(error.message);
  }

  async function categoryUsage(name) {
    const { count, error } = await requireClient().from('posts').select('slug', { count: 'exact', head: true }).eq('category', name);
    if (error) throw new Error(error.message);
    return count || 0;
  }

  return { init, login, logout, getSession, loadAll, savePost, deletePost, addCategory, removeCategory, categoryUsage };
})();
