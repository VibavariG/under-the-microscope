#!/usr/bin/env node
/**
 * Regenerates docs/feed.xml from docs/posts.json.
 *
 * You usually don't need this — the admin editor (admin/editor.html)
 * regenerates feed.xml automatically whenever you publish, unpublish,
 * or delete an entry (when running in a browser with File System
 * Access support). This script is here as a manual fallback, or for
 * scripting a rebuild in CI.
 *
 * Usage:
 *   node scripts/build-rss.js
 *
 * Edit SITE_URL below to match where the site is actually hosted
 * (e.g. "https://yourname.github.io/under-the-microscope") before running.
 */
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://your-username.github.io/your-repo'; // <-- edit me

const root = path.join(__dirname, '..');
const posts = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'posts.json'), 'utf8'));

function escapeXML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const sorted = posts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

const items = sorted.map(post => {
  const link = `${SITE_URL}/post.html?slug=${encodeURIComponent(post.slug)}`;
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

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Under the Microscope</title>
  <link>${SITE_URL}/index.html</link>
  <description>A register of technical notes.</description>
  <language>en-us</language>
  <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
</channel>
</rss>
`;

fs.writeFileSync(path.join(root, 'docs', 'feed.xml'), xml);
console.log(`feed.xml regenerated with ${sorted.length} entries.`);
