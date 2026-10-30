'use strict';

const DATA_URL = 'data.json';
const REPO_URL = 'https://github.com/ProfessorQuantumUniverse/Cool-WebApp-Searchengine';
const FAVORITES_KEY = 'cwa-favorites';
const SECTION_PREVIEW = 8;      // cards per category on the overview
const NEW_DAYS = 90;            // entries added within this many days get a "New" badge

const $ = sel => document.querySelector(sel);

const els = {
    search: $('#search-input'),
    searchForm: $('#search-form'),
    categoryList: $('#category-list'),
    sections: $('#sections'),
    count: $('#result-count'),
    empty: $('#empty'),
    filters: $('#active-filters'),
    sort: $('#sort-select'),
    favToggle: $('#favorites-toggle'),
    random: $('#random-btn'),
    reset: $('#reset-btn'),
    heroSub: $('#hero-sub'),
    footerMeta: $('#footer-meta'),
    toast: $('#toast'),
    detail: $('#detail'),
};

let entries = [];
let categories = [];
let categoryById = new Map();
let entryById = new Map();
let newSince = 0;

const state = { q: '', cat: '', tag: '', fav: false, sort: 'relevance' };

// ---------- helpers ----------

function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fold(str) {
    return String(str ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function displayAddress(url) {
    try {
        const u = new URL(url);
        const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
        return u.hostname.replace(/^www\./, '') + path;
    } catch { return url; }
}

function safeHref(url) {
    try {
        const u = new URL(url);
        return ['http:', 'https:'].includes(u.protocol) ? u.href : '#';
    } catch { return '#'; }
}

function formatDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

let toastTimer;
function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

// ---------- favourites ----------

let favorites = new Set();
try { favorites = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []); } catch { /* storage unavailable */ }

function toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch { /* ignore */ }
    toast(favorites.has(id) ? 'Added to favourites' : 'Removed from favourites');
    document.querySelectorAll(`.fav-button[data-id="${CSS.escape(id)}"]`).forEach(btn => {
        btn.setAttribute('aria-pressed', favorites.has(id));
    });
    if (state.fav) render();
}

// ---------- search ----------

function indexEntry(e) {
    const cat = categoryById.get(e.category);
    e._host = hostOf(e.url);
    e._name = fold(e.name);
    e._nameWords = e._name.split(/[^a-z0-9]+/).filter(Boolean);
    e._tagline = fold(e.tagline);
    e._desc = fold(e.description);
    e._tags = e.tags.map(fold);
    e._cat = fold(cat ? cat.name : '');
    for (const w of `${e._name} ${e._tags.join(' ')} ${e._tagline} ${e._desc}`.split(/[^a-z0-9]+/)) {
        if (w.length > 3) vocabulary.add(w);
    }
}

// Words from all entries, used to correct typos in search terms ("satelite" -> "satellite").
const vocabulary = new Set();
const corrections = new Map();

function correctionsFor(t) {
    if (t.length < 5) return [];
    if (!corrections.has(t)) {
        let known = false;
        for (const w of vocabulary) if (w.startsWith(t)) { known = true; break; }
        corrections.set(t, known ? [] : [...vocabulary].filter(w => withinOneEdit(w, t)));
    }
    return corrections.get(t);
}

function withinOneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++edits > 1) return false;
        if (a.length > b.length) i++;
        else if (a.length < b.length) j++;
        else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
}

function scoreToken(e, t) {
    let s = 0;
    if (e._name === t) s = 12;
    else if (e._name.startsWith(t)) s = 9;
    else if (e._nameWords.some(w => w.startsWith(t))) s = 7;
    else if (e._name.includes(t)) s = 5;
    if (e._tags.includes(t)) s = Math.max(s, 6);
    else if (e._tags.some(tag => tag.startsWith(t))) s = Math.max(s, 4);
    if (s) return s;
    if (e._tagline.includes(t)) return 3;
    if (e._cat.includes(t) || e._host.includes(t)) return 2;
    if (e._desc.includes(t)) return 1;
    return 0;
}

function scoreEntry(e, tokens) {
    let total = 0;
    for (const t of tokens) {
        let s = scoreToken(e, t);
        if (!s) {
            for (const c of correctionsFor(t)) s = Math.max(s, scoreToken(e, c));
        }
        if (!s) return 0;
        total += s;
    }
    return total;
}

// Deterministic shuffle seeded by today's date (mulberry32).
function dailyShuffle(list) {
    let seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    const rand = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// ---------- filtering ----------

function currentResults() {
    const tokens = fold(state.q).split(/\s+/).filter(Boolean);
    let list = entries;
    if (state.cat) list = list.filter(e => e.category === state.cat);
    if (state.tag) list = list.filter(e => e.tags.includes(state.tag));
    if (state.fav) list = list.filter(e => favorites.has(e.id));

    if (tokens.length) {
        list = list.map(e => ({ e, s: scoreEntry(e, tokens) })).filter(r => r.s > 0);
        if (state.sort === 'relevance') list.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
        list = list.map(r => r.e);
    } else {
        list = [...list];
    }
    if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    if (state.sort === 'recent') list.sort((a, b) => (b.added || '').localeCompare(a.added || '') || a.name.localeCompare(b.name));
    // highlight corrected spellings as well
    return { list, tokens: tokens.flatMap(t => [t, ...correctionsFor(t)]) };
}

// ---------- rendering ----------

function highlight(text, tokens) {
    const safe = escapeHTML(text);
    if (!tokens.length) return safe;
    const folded = fold(text);
    const ranges = [];
    for (const t of tokens) {
        let from = 0, i;
        while (t.length > 1 && (i = folded.indexOf(t, from)) !== -1) {
            ranges.push([i, i + t.length]);
            from = i + t.length;
        }
    }
    if (!ranges.length) return safe;
    ranges.sort((a, b) => a[0] - b[0]);
    let out = '', pos = 0;
    for (const [start, end] of ranges) {
        if (start < pos) continue;
        out += escapeHTML(text.slice(pos, start)) + '<mark>' + escapeHTML(text.slice(start, end)) + '</mark>';
        pos = end;
    }
    return out + escapeHTML(text.slice(pos));
}

function faviconHTML(e, large = false) {
    const cls = 'favicon' + (large ? ' favicon-lg' : '');
    const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(e._host)}&sz=64`;
    return `<img class="${cls}" src="${src}" alt="" width="32" height="32" loading="lazy" data-letter="${escapeHTML(e.name[0])}">`;
}

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/></svg>';

function cardHTML(e, tokens) {
    const isNew = e.added && new Date(e.added).getTime() >= newSince;
    const cat = categoryById.get(e.category);
    return `<li>
        <article class="card">
            <div class="card-top">
                ${faviconHTML(e)}
                <div>
                    <h3 class="card-title"><a class="card-link" href="#${escapeHTML(e.id)}" data-open="${escapeHTML(e.id)}">${highlight(e.name, tokens)}</a></h3>
                    <p class="card-tagline">${highlight(e.tagline, tokens)}</p>
                </div>
            </div>
            <div class="card-foot">
                <span class="dot" style="--dot: var(--c-${escapeHTML(e.category)})" title="${escapeHTML(cat?.name)}"></span>
                <span class="domain">${escapeHTML(e._host)}</span>
                ${isNew ? '<span class="badge-new">New</span>' : ''}
            </div>
            <button type="button" class="fav-button" data-id="${escapeHTML(e.id)}" aria-pressed="${favorites.has(e.id)}" aria-label="Favourite ${escapeHTML(e.name)}">${STAR}</button>
        </article>
    </li>`;
}

function sectionHTML({ title, description, dot, items, tokens, total, catId }) {
    const more = catId && total > items.length
        ? `<button type="button" class="button show-more" data-cat="${escapeHTML(catId)}">Show all ${total} <span aria-hidden="true">→</span></button>`
        : '';
    return `<section class="section">
        ${title ? `<div class="section-head">
            ${dot ? `<span class="dot" style="--dot: var(--c-${escapeHTML(dot)})"></span>` : ''}
            <h2>${escapeHTML(title)}</h2>
            ${description ? `<p>${escapeHTML(description)}</p>` : ''}
        </div>` : ''}
        <ul class="grid">${items.map(e => cardHTML(e, tokens)).join('')}</ul>
        ${more}
    </section>`;
}

function renderCategories() {
    const counts = new Map();
    for (const e of entries) counts.set(e.category, (counts.get(e.category) || 0) + 1);
    const button = (id, name, count) => `<li><button type="button" class="category-button" data-cat="${escapeHTML(id)}" aria-pressed="${state.cat === id}">
        ${id ? `<span class="dot" style="--dot: var(--c-${escapeHTML(id)})"></span>` : ''}
        <span class="label">${escapeHTML(name)}</span><span class="count">${count}</span>
    </button></li>`;
    els.categoryList.innerHTML = button('', 'All sites', entries.length)
        + categories.map(c => button(c.id, c.name, counts.get(c.id) || 0)).join('');
}

function renderFilters() {
    const pills = [];
    if (state.tag) pills.push(`<button type="button" class="filter-pill" data-clear="tag">Tag: ${escapeHTML(state.tag)} <span aria-hidden="true">×</span><span class="visually-hidden">Remove filter</span></button>`);
    if (state.fav) pills.push(`<button type="button" class="filter-pill" data-clear="fav">Favourites only <span aria-hidden="true">×</span><span class="visually-hidden">Remove filter</span></button>`);
    els.filters.innerHTML = pills.join('');
    els.filters.hidden = !pills.length;
}

function render() {
    const { list, tokens } = currentResults();
    const browsing = !tokens.length && !state.cat && !state.tag && !state.fav && state.sort !== 'recent';

    els.categoryList.querySelectorAll('.category-button').forEach(btn => {
        btn.setAttribute('aria-pressed', btn.dataset.cat === state.cat);
    });
    els.favToggle.setAttribute('aria-pressed', state.fav);
    els.sort.value = state.sort;
    renderFilters();

    const noun = list.length === 1 ? 'site' : 'sites';
    els.count.innerHTML = tokens.length
        ? `<strong>${list.length}</strong> ${noun} matching “${escapeHTML(state.q.trim())}”`
        : `<strong>${list.length}</strong> ${noun}`;

    els.empty.hidden = list.length > 0;
    if (!list.length) { els.sections.innerHTML = ''; return; }

    if (browsing) {
        // The overview shows a different selection per category each day.
        const daily = dailyShuffle(list);
        els.sections.innerHTML = categories.map(c => {
            const all = daily.filter(e => e.category === c.id);
            if (!all.length) return '';
            return sectionHTML({ title: c.name, description: c.description, dot: c.id, items: all.slice(0, SECTION_PREVIEW), tokens, total: all.length, catId: c.id });
        }).join('');
    } else if (state.cat && !tokens.length) {
        const c = categoryById.get(state.cat);
        els.sections.innerHTML = sectionHTML({ title: c.name, description: c.description, dot: c.id, items: list, tokens });
    } else {
        els.sections.innerHTML = sectionHTML({ items: list, tokens });
    }
}

// ---------- URL state ----------

function readURL() {
    const p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    state.cat = categoryById.has(p.get('cat')) ? p.get('cat') : '';
    state.tag = p.get('tag') || '';
    state.fav = p.get('fav') === '1';
    state.sort = ['relevance', 'name', 'recent'].includes(p.get('sort')) ? p.get('sort') : 'relevance';
    els.search.value = state.q;
}

function writeURL(push = false) {
    const p = new URLSearchParams();
    if (state.q.trim()) p.set('q', state.q.trim());
    if (state.cat) p.set('cat', state.cat);
    if (state.tag) p.set('tag', state.tag);
    if (state.fav) p.set('fav', '1');
    if (state.sort !== 'relevance') p.set('sort', state.sort);
    const qs = p.toString();
    const url = location.pathname + (qs ? '?' + qs : '') + location.hash;
    history[push ? 'pushState' : 'replaceState'](null, '', url);
}

function update(changes, { push = true, scroll = false } = {}) {
    Object.assign(state, changes);
    writeURL(push);
    render();
    if (scroll) {
        const top = document.querySelector('.layout').getBoundingClientRect().top + scrollY - 70;
        if (scrollY > top) scrollTo({ top, behavior: 'smooth' });
    }
}

// ---------- detail dialog ----------

const detail = {
    shot: $('#detail-shot'),
    icon: $('#detail-icon'),
    name: $('#detail-name'),
    tagline: $('#detail-tagline'),
    desc: $('#detail-desc'),
    category: $('#detail-category'),
    domain: $('#detail-domain'),
    addedRow: $('#detail-added-row'),
    added: $('#detail-added'),
    tags: $('#detail-tags'),
    open: $('#detail-open'),
    fav: $('#detail-fav'),
    copy: $('#detail-copy'),
    report: $('#detail-report'),
};
let detailId = null;

function updateDetailFav() {
    const on = favorites.has(detailId);
    detail.fav.setAttribute('aria-pressed', on);
    detail.fav.textContent = on ? '★ Favourited' : '☆ Favourite';
}

function openDetail(id, { push = true } = {}) {
    const e = entryById.get(id);
    if (!e) return;
    detailId = id;
    const cat = categoryById.get(e.category);

    detail.shot.classList.remove('failed');
    detail.shot.innerHTML = '';
    const img = new Image();
    img.alt = `Screenshot of ${e.name}`;
    img.referrerPolicy = 'no-referrer'; // thum.io's free tier refuses hotlinked requests that send a referrer
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => detail.shot.classList.add('failed'));
    img.src = `https://image.thum.io/get/width/1200/crop/675/${safeHref(e.url)}`;
    detail.shot.append(img);

    detail.icon.outerHTML = faviconHTML(e, true).replace('<img ', '<img id="detail-icon" ');
    detail.icon = $('#detail-icon');

    detail.name.textContent = e.name;
    detail.tagline.textContent = e.tagline;
    detail.desc.textContent = e.description;
    detail.category.innerHTML = `<span class="dot" style="--dot: var(--c-${escapeHTML(e.category)})"></span>${escapeHTML(cat?.name)}`;
    detail.domain.textContent = displayAddress(e.url);
    detail.addedRow.hidden = !e.added;
    detail.added.textContent = e.added ? formatDate(e.added) : '';
    detail.tags.innerHTML = e.tags.map(t => `<li><button type="button" class="tag" data-tag="${escapeHTML(t)}">#${escapeHTML(t)}</button></li>`).join('');
    detail.open.href = safeHref(e.url);
    detail.report.href = `${REPO_URL}/issues/new?labels=entry&title=${encodeURIComponent(`Problem with "${e.name}"`)}&body=${encodeURIComponent(`Entry: ${e.id}\nURL: ${e.url}\n\nWhat's wrong?\n`)}`;
    updateDetailFav();

    if (location.hash !== '#' + id) history[push ? 'pushState' : 'replaceState'](null, '', location.pathname + location.search + '#' + id);
    if (!els.detail.open) els.detail.showModal();
    detail.open.focus();
}

function closeDetail() {
    if (els.detail.open) els.detail.close();
}

els.detail.addEventListener('close', () => {
    detailId = null;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});
els.detail.addEventListener('click', ev => {
    if (ev.target === els.detail) closeDetail(); // click on backdrop
});
$('#detail-close').addEventListener('click', closeDetail);
detail.fav.addEventListener('click', () => { toggleFavorite(detailId); updateDetailFav(); });
detail.copy.addEventListener('click', async () => {
    const link = location.origin + location.pathname + '#' + detailId;
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast(link); }
});
detail.tags.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-tag]');
    if (!btn) return;
    closeDetail();
    els.search.value = '';
    update({ tag: btn.dataset.tag, q: '', cat: '' }, { scroll: true });
});

// ---------- events ----------

let searchTimer;
els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => update({ q: els.search.value }, { push: false }), 90);
});
els.search.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && els.search.value) { els.search.value = ''; update({ q: '' }, { push: false }); }
});
els.searchForm.addEventListener('submit', ev => {
    ev.preventDefault();
    clearTimeout(searchTimer);
    update({ q: els.search.value }, { push: false, scroll: true });
    els.search.blur();
});

els.categoryList.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-cat]');
    if (btn) update({ cat: btn.dataset.cat }, { scroll: true });
});

els.sections.addEventListener('click', ev => {
    const more = ev.target.closest('.show-more');
    if (more) { update({ cat: more.dataset.cat }, { scroll: true }); return; }
    const fav = ev.target.closest('.fav-button');
    if (fav) { toggleFavorite(fav.dataset.id); return; }
    const link = ev.target.closest('[data-open]');
    if (link && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey) {
        ev.preventDefault();
        openDetail(link.dataset.open);
    }
});

els.filters.addEventListener('click', ev => {
    const pill = ev.target.closest('[data-clear]');
    if (pill) update({ [pill.dataset.clear]: pill.dataset.clear === 'fav' ? false : '' });
});

els.favToggle.addEventListener('click', () => update({ fav: !state.fav }));
els.sort.addEventListener('change', () => update({ sort: els.sort.value }));
els.random.addEventListener('click', () => {
    const pool = currentResults().list;
    const list = pool.length ? pool : entries;
    openDetail(list[Math.floor(Math.random() * list.length)].id);
});
els.reset.addEventListener('click', () => {
    els.search.value = '';
    update({ q: '', cat: '', tag: '', fav: false, sort: 'relevance' });
});

// Fall back to a letter tile when a favicon can't be loaded.
document.addEventListener('error', ev => {
    const img = ev.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('favicon')) return;
    const tile = document.createElement('span');
    tile.className = img.className + ' favicon-fallback';
    if (img.id) tile.id = img.id;
    tile.setAttribute('aria-hidden', 'true');
    tile.textContent = img.dataset.letter || '';
    img.replaceWith(tile);
}, true);

document.addEventListener('keydown', ev => {
    if (ev.key === '/' && !els.detail.open && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        ev.preventDefault();
        els.search.focus();
        els.search.select();
    }
});

addEventListener('popstate', () => {
    readURL();
    render();
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && entryById.has(id)) openDetail(id, { push: false }); else closeDetail();
});

const masthead = document.querySelector('.masthead');
addEventListener('scroll', () => masthead.classList.toggle('scrolled', scrollY > 8), { passive: true });

// ---------- init ----------

async function init() {
    try {
        const res = await fetch(DATA_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        const data = await res.json();
        categories = data.categories;
        categoryById = new Map(categories.map(c => [c.id, c]));
        entries = data.entries;
        entries.forEach(indexEntry);
        entryById = new Map(entries.map(e => [e.id, e]));
        newSince = new Date(data.updated).getTime() - NEW_DAYS * 864e5;

        els.heroSub.textContent = `${entries.length} sites across ${categories.length} topics: maps, space, science, data, AI and the odd toy.`;
        els.footerMeta.textContent = `${entries.length} sites · last updated ${formatDate(data.updated)}`;

        readURL();
        renderCategories();
        render();

        const id = decodeURIComponent(location.hash.slice(1));
        if (id && entryById.has(id)) openDetail(id, { push: false });
    } catch (err) {
        console.error('Could not load the catalogue:', err);
        els.count.textContent = '';
        els.sections.innerHTML = `<div class="empty"><p class="empty-title">The catalogue could not be loaded.</p><p>${escapeHTML(err.message)}. Please try again later.</p></div>`;
    }
}

init();
