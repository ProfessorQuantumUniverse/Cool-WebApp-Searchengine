// Checks data.json for mistakes before committing: node scripts/validate.mjs
import fs from 'node:fs';

const file = new URL('../data.json', import.meta.url);
const { categories, entries } = JSON.parse(fs.readFileSync(file, 'utf8'));

const errors = [];
const categoryIds = new Set(categories.map(c => c.id));
const ids = new Set();
const urls = new Map();

for (const e of entries) {
    const where = e.id || e.name || JSON.stringify(e).slice(0, 40);
    for (const field of ['id', 'name', 'tagline', 'description', 'url', 'category']) {
        if (typeof e[field] !== 'string' || !e[field].trim()) errors.push(`${where}: missing "${field}"`);
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) errors.push(`${where}: id must be lowercase-with-dashes`);
    if (ids.has(e.id)) errors.push(`${where}: duplicate id`);
    ids.add(e.id);
    if (!categoryIds.has(e.category)) errors.push(`${where}: unknown category "${e.category}"`);
    if (!Array.isArray(e.tags) || e.tags.some(t => t !== t.toLowerCase() || /\s/.test(t))) errors.push(`${where}: tags must be lowercase words`);
    if (e.added && !/^\d{4}-\d{2}-\d{2}$/.test(e.added)) errors.push(`${where}: "added" must be YYYY-MM-DD`);

    let url;
    try { url = new URL(e.url); } catch { errors.push(`${where}: invalid url`); continue; }
    if (!['http:', 'https:'].includes(url.protocol)) errors.push(`${where}: url must be http(s)`);
    if (url.hash) errors.push(`${where}: remove the #fragment from the url`);
    if (/[?&](utm_[a-z]+|si|fbclid|gclid|lat|lon|lng|zoom)=/i.test(url.search)) errors.push(`${where}: remove tracking or map-position parameters`);
    const key = url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '');
    if (urls.has(key)) errors.push(`${where}: same url as ${urls.get(key)}`);
    urls.set(key, e.id);
}

if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
}
console.log(`data.json OK: ${entries.length} entries in ${categories.length} categories`);
