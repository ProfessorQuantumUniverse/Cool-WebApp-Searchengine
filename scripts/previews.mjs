// Takes screenshots and fetches favicons for catalogue entries: npm run previews -- [options]
//
//   (no options)      entries that have no preview yet
//   --ids a,b,c       only these entries (re-shoots them)
//   --all             every entry
//   --retry-failed    also entries whose last attempt failed
//   --concurrency n   parallel pages (default 4)
//
// Writes previews/<id>.webp (1024×576), previews/<id>-sm.webp (480×270),
// previews/icons/<id>.webp (64×64) and the manifest previews/index.json.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { PlaywrightBlocker } from '@ghostery/adblocker-playwright';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const dir = new URL('previews/', root);
const iconDir = new URL('previews/icons/', root);
const manifestFile = new URL('index.json', dir);

const VIEWPORT = { width: 1280, height: 720 };
const LARGE = { width: 1024, height: 576 };
const SMALL = { width: 480, height: 270 };
const NAV_TIMEOUT = 25_000;
const SETTLE_MS = 2500;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const opt = name => args.includes(name);
const val = name => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const onlyIds = val('--ids')?.split(',').map(s => s.trim()).filter(Boolean);
const concurrency = Number(val('--concurrency')) || 4;

const { entries } = JSON.parse(await fs.readFile(new URL('data.json', root), 'utf8'));
let manifest = {};
try { manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8')); } catch { /* first run */ }
await fs.mkdir(iconDir, { recursive: true });

// Forget entries that were removed from the catalogue.
const known = new Set(entries.map(e => e.id));
for (const id of Object.keys(manifest)) {
    if (known.has(id)) continue;
    delete manifest[id];
    await Promise.all([`${id}.webp`, `${id}-sm.webp`, `icons/${id}.webp`].map(f => fs.rm(new URL(f, dir), { force: true })));
    console.log(`removed ${id}`);
}

if (onlyIds) {
    const unknown = onlyIds.filter(id => !known.has(id));
    if (unknown.length) { console.error(`unknown ids: ${unknown.join(', ')}`); process.exit(1); }
}

const wanted = e => {
    if (onlyIds) return onlyIds.includes(e.id);
    if (opt('--all')) return true;
    const m = manifest[e.id];
    return !m || (m.failed && opt('--retry-failed'));
};
const shots = entries.filter(wanted);
const icons = entries.filter(e => onlyIds ? onlyIds.includes(e.id) : manifest[e.id]?.icon === undefined || opt('--all'));

console.log(`${shots.length} screenshots, ${icons.length} favicons to fetch`);

async function pool(items, size, fn) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
        while (next < items.length) await fn(items[next++]);
    }));
}

// ---------- favicons ----------

await pool(icons, 8, async e => {
    const host = new URL(e.url).hostname;
    let ok = false;
    try {
        const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
        // Google answers 404 with a generic globe when a site has no icon.
        if (res.ok) {
            const icon = await sharp(Buffer.from(await res.arrayBuffer())).resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 85 }).toBuffer();
            await fs.writeFile(new URL(`${e.id}.webp`, iconDir), icon);
            ok = true;
        }
    } catch { /* treated as missing */ }
    if (!ok) await fs.rm(new URL(`${e.id}.webp`, iconDir), { force: true });
    manifest[e.id] = { ...manifest[e.id], icon: ok };
});

// ---------- screenshots ----------

async function capture(context, e) {
    const page = await context.newPage();
    try {
        await blocker.enableBlockingInPage(page);
        const res = await page.goto(e.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
        await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(SETTLE_MS);
        const png = await page.screenshot({ type: 'png' });

        // An almost uniform image is a blank or still-loading page.
        const { channels } = await sharp(png).stats();
        if (channels.every(c => c.stdev < 3)) throw new Error('blank page');

        const cover = size => sharp(png).resize(size.width, size.height, { fit: 'cover', position: 'top' });
        const large = await cover(LARGE).webp({ quality: 62, effort: 6 }).toBuffer();
        const small = await cover(SMALL).webp({ quality: 62, effort: 6 }).toBuffer();
        await fs.writeFile(new URL(`${e.id}.webp`, dir), large);
        await fs.writeFile(new URL(`${e.id}-sm.webp`, dir), small);
        return crypto.createHash('sha1').update(large).digest('hex').slice(0, 8);
    } finally {
        await page.close().catch(() => {});
    }
}

let blocker;
if (shots.length) {
    blocker = await PlaywrightBlocker.fromPrebuiltFull(fetch); // ads, trackers and cookie notices
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: VIEWPORT,
        userAgent: USER_AGENT,
        locale: 'en-US',
        colorScheme: 'light',
        reducedMotion: 'reduce',
    });
    let done = 0;
    await pool(shots, concurrency, async e => {
        const { icon } = manifest[e.id] || {};
        try {
            // Many failures are transient (HTTP/2 resets, slow first byte), so try twice.
            const v = await capture(context, e).catch(() => capture(context, e));
            manifest[e.id] = { v, icon };
            console.log(`[${++done}/${shots.length}] ok      ${e.id}`);
        } catch (err) {
            const reason = String(err.message || err).split('\n')[0].slice(0, 120);
            // Keep an older screenshot if there is one.
            manifest[e.id] = manifest[e.id]?.v ? manifest[e.id] : { failed: reason, icon };
            console.log(`[${++done}/${shots.length}] failed  ${e.id}: ${reason}`);
        }
    });
    await browser.close();
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await fs.writeFile(manifestFile, JSON.stringify(sorted, null, 1) + '\n');

const values = Object.values(sorted);
console.log(`manifest: ${values.filter(m => m.v).length} screenshots, ${values.filter(m => m.failed).length} failed, ${values.filter(m => m.icon).length} favicons`);
