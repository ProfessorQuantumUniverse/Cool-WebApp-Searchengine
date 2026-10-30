import { fold, hostOf, tokenize, buildIndex, correctionsFor, completionFor, search, dailyShuffle } from './search.js';

const DATA_URL = 'data.json';
const PREVIEWS_URL = 'previews/index.json';
const CACHE_KEY = 'cwa-catalogue';
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
    eyebrow: $('#eyebrow'),
    footerMeta: $('#footer-meta'),
    toast: $('#toast'),
    detail: $('#detail'),
};

let entries = [];
let categories = [];
let categoryById = new Map();
let entryById = new Map();
let newSince = 0;
let previews = {};   // id -> { v, icon, failed } from previews/index.json

const SORTS = ['relevance', 'name', 'name-desc', 'recent'];
const state = { q: '', cats: [], tag: '', fav: false, sort: 'relevance' };

// ---------- helpers ----------

function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

// ---------- filtering ----------

function currentResults() {
    const tokens = tokenize(state.q);
    let list = entries;
    if (state.cats.length) list = list.filter(e => state.cats.includes(e.category));
    if (state.tag) list = list.filter(e => e.tags.includes(state.tag));
    if (state.fav) list = list.filter(e => favorites.has(e.id));

    list = tokens.length ? search(list, tokens) : [...list];
    const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    if (state.sort === 'name') list.sort(byName);
    if (state.sort === 'name-desc') list.sort((a, b) => byName(b, a));
    if (state.sort === 'recent') list.sort((a, b) => (b.added || '').localeCompare(a.added || '') || a.name.localeCompare(b.name));
    const corrected = [...new Set(tokens.flatMap(correctionsFor))];
    // highlight corrected spellings as well
    return { list, tokens: [...tokens, ...corrected], corrected };
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

function faviconHTML(e, large = false, id = '') {
    const cls = 'favicon' + (large ? ' favicon-lg' : '');
    const idAttr = id ? ` id="${id}"` : '';
    if (!previews[e.id]?.icon) return `<span class="${cls} favicon-fallback"${idAttr} aria-hidden="true">${escapeHTML(e.name[0])}</span>`;
    return `<img class="${cls}"${idAttr} src="previews/icons/${encodeURIComponent(e.id)}.webp" alt="" width="32" height="32" loading="lazy" decoding="async" data-letter="${escapeHTML(e.name[0])}">`;
}

function shotURL(e, size) {
    const p = previews[e.id];
    return p?.v ? `previews/${encodeURIComponent(e.id)}${size === 'sm' ? '-sm' : ''}.webp?v=${p.v}` : '';
}

// Card preview: a lazily loaded screenshot over the generated placeholder.
function shotHTML(e) {
    const letter = `<span class="shot-letter">${escapeHTML(e.name[0])}</span>`;
    const sm = shotURL(e, 'sm');
    if (!sm) return `<div class="card-shot" aria-hidden="true">${letter}</div>`;
    return `<div class="card-shot is-loading" aria-hidden="true">${letter}<img class="shot-img" src="${sm}" srcset="${sm} 480w, ${shotURL(e, 'lg')} 1024w" sizes="(max-width: 560px) calc(100vw - 32px), 320px" width="480" height="270" alt="" loading="lazy" decoding="async"></div>`;
}

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/></svg>';

const STAGGER = 12;     // cards that fade in one after another on the first render
let cardIndex = 0;

function cardHTML(e, tokens) {
    const isNew = e.added && new Date(e.added).getTime() >= newSince;
    const cat = categoryById.get(e.category);
    const i = cardIndex++;
    return `<li${i < STAGGER ? ` style="--i: ${i}"` : ''}>
        <article class="card" style="--dot: var(--c-${escapeHTML(e.category)})">
            ${shotHTML(e)}
            <div class="card-body">
                <div class="card-top">
                    ${faviconHTML(e)}
                    <div>
                        <h3 class="card-title"><a class="card-link" href="#${escapeHTML(e.id)}" data-open="${escapeHTML(e.id)}">${highlight(e.name, tokens)}</a></h3>
                        <p class="card-tagline">${highlight(e.tagline, tokens)}</p>
                    </div>
                </div>
                <div class="card-foot">
                    <span class="cat" title="${escapeHTML(cat?.name)}"><span class="dot"></span>${escapeHTML(e.category)}</span>
                    <span class="domain">${escapeHTML(e._host)}</span>
                    ${isNew ? '<span class="badge-new">New</span>' : ''}
                </div>
            </div>
            <button type="button" class="fav-button" data-id="${escapeHTML(e.id)}" aria-pressed="${favorites.has(e.id)}" aria-label="Favourite ${escapeHTML(e.name)}">${STAR}</button>
        </article>
    </li>`;
}

function sectionHTML({ title, description, dot, items, tokens, total, catId }) {
    const more = catId && total > items.length
        ? `<button type="button" class="button show-more" data-cat="${escapeHTML(catId)}">Show all ${total} <span aria-hidden="true">→</span></button>`
        : '';
    const index = dot ? categories.findIndex(c => c.id === dot) + 1 : 0;
    return `<section class="section">
        ${title ? `<div class="section-head">
            ${index ? `<span class="section-index">${String(index).padStart(2, '0')}</span>` : ''}
            <h2>${dot ? `<span class="dot" style="--dot: var(--c-${escapeHTML(dot)})"></span>` : ''}${escapeHTML(title)}</h2>
            ${description ? `<p>${escapeHTML(description)}</p>` : ''}
        </div>` : ''}
        <ul class="grid">${items.map(e => cardHTML(e, tokens)).join('')}</ul>
        ${more}
    </section>`;
}

function renderCategories() {
    const counts = new Map();
    for (const e of entries) counts.set(e.category, (counts.get(e.category) || 0) + 1);
    const button = (id, name, count) => `<li><button type="button" class="category-button" data-cat="${escapeHTML(id)}" aria-pressed="${id ? state.cats.includes(id) : !state.cats.length}">
        ${id ? `<span class="dot" style="--dot: var(--c-${escapeHTML(id)})"></span>` : ''}
        <span class="label">${escapeHTML(name)}</span><span class="count">${count}</span>
    </button></li>`;
    els.categoryList.innerHTML = button('', 'All sites', entries.length)
        + categories.map(c => button(c.id, c.name, counts.get(c.id) || 0)).join('');
}

function renderFilters() {
    const pills = state.cats.map(id => `<button type="button" class="filter-pill" data-clear-cat="${escapeHTML(id)}"><span class="dot" style="--dot: var(--c-${escapeHTML(id)})"></span>${escapeHTML(categoryById.get(id).name)} <span aria-hidden="true">×</span><span class="visually-hidden">Remove filter</span></button>`);
    if (state.tag) pills.push(`<button type="button" class="filter-pill" data-clear="tag">Tag: ${escapeHTML(state.tag)} <span aria-hidden="true">×</span><span class="visually-hidden">Remove filter</span></button>`);
    if (state.fav) pills.push(`<button type="button" class="filter-pill" data-clear="fav">Favourites only <span aria-hidden="true">×</span><span class="visually-hidden">Remove filter</span></button>`);
    els.filters.innerHTML = pills.join('');
    els.filters.hidden = !pills.length;
}

function render() {
    const { list, tokens, corrected } = currentResults();
    cardIndex = 0;
    const browsing = !tokens.length && !state.cats.length && !state.tag && !state.fav && state.sort === 'relevance';

    els.categoryList.querySelectorAll('.category-button').forEach(btn => {
        const id = btn.dataset.cat;
        btn.setAttribute('aria-pressed', id ? state.cats.includes(id) : !state.cats.length);
    });
    els.favToggle.setAttribute('aria-pressed', state.fav);
    els.sort.value = state.sort;
    renderFilters();

    const noun = list.length === 1 ? 'site' : 'sites';
    els.count.innerHTML = tokens.length
        ? `<strong>${list.length}</strong> ${noun} matching “${escapeHTML(state.q.trim())}”`
            + (corrected.length && list.length ? ` <span class="correction">· incl. ${corrected.slice(0, 3).map(c => `<em>${escapeHTML(c)}</em>`).join(', ')}</span>` : '')
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
    } else if (state.cats.length && !tokens.length) {
        // one section per chosen category, each in the chosen order
        els.sections.innerHTML = categories.filter(c => state.cats.includes(c.id)).map(c => {
            const items = list.filter(e => e.category === c.id);
            return items.length ? sectionHTML({ title: c.name, description: c.description, dot: c.id, items, tokens }) : '';
        }).join('');
    } else {
        els.sections.innerHTML = sectionHTML({ items: list, tokens });
    }
}

// ---------- URL state ----------

function readURL() {
    const p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    const cats = (p.get('cat') || '').split(',');
    state.cats = categories.map(c => c.id).filter(id => cats.includes(id));
    state.tag = p.get('tag') || '';
    state.fav = p.get('fav') === '1';
    state.sort = SORTS.includes(p.get('sort')) ? p.get('sort') : 'relevance';
    els.search.value = state.q;
}

function writeURL(push = false) {
    const p = new URLSearchParams();
    if (state.q.trim()) p.set('q', state.q.trim());
    if (state.cats.length) p.set('cat', state.cats.join(','));
    if (state.tag) p.set('tag', state.tag);
    if (state.fav) p.set('fav', '1');
    if (state.sort !== 'relevance') p.set('sort', state.sort);
    const qs = p.toString().replace(/%2C/g, ','); // keep ?cat=maps,space readable
    const url = location.pathname + (qs ? '?' + qs : '') + location.hash;
    history[push ? 'pushState' : 'replaceState'](null, '', url);
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Filter, category and sort changes cross-fade the results; typing only gets a light fade.
function renderAnimated(kind) {
    if (reducedMotion.matches) { render(); return; }
    if (kind === 'swap' && document.startViewTransition) { document.startViewTransition(render); return; }
    render();
    els.sections.classList.remove('refresh');
    void els.sections.offsetWidth; // restart the animation
    els.sections.classList.add('refresh');
}

function update(changes, { push = true, scroll = false } = {}) {
    Object.assign(state, changes);
    writeURL(push);
    renderAnimated(push ? 'swap' : 'typing');
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

    detail.shot.innerHTML = `<span class="shot-letter">${escapeHTML(e.name[0])}</span>`;
    detail.shot.style.setProperty('--dot', `var(--c-${e.category})`);
    const src = shotURL(e, 'lg');
    detail.shot.classList.toggle('is-loading', !!src);
    detail.shot.classList.toggle('failed', !src);
    if (src) {
        const img = new Image();
        img.className = 'shot-img';
        img.alt = `Screenshot of ${e.name}`;
        img.fetchPriority = 'high';
        img.src = src;
        detail.shot.append(img);
    }

    detail.icon.outerHTML = faviconHTML(e, true, 'detail-icon');
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
    detail.report.href = issueURL('report-problem.yml', { title: `Problem with "${e.name}"`, entry: e.id, url: e.url });
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
    update({ tag: btn.dataset.tag, q: '', cats: [] }, { scroll: true });
});

// ---------- suggest a site ----------

// Opens one of the issue forms in .github/ISSUE_TEMPLATE with its text fields filled in.
function issueURL(template, fields) {
    const p = new URLSearchParams({ template });
    for (const [key, value] of Object.entries(fields)) if (value) p.set(key, value);
    return `${REPO_URL}/issues/new?${p}`;
}

// Same key as scripts/validate.mjs uses to spot duplicate urls.
function urlKey(url) {
    try {
        const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
        return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
    } catch { return ''; }
}

const suggest = {
    dialog: $('#suggest'),
    form: $('#suggest-form'),
    url: $('#suggest-url'),
    known: $('#suggest-known'),
    category: $('#suggest-category'),
};

function knownEntry(url) {
    const key = urlKey(url);
    return key ? entries.find(e => urlKey(e.url) === key) : null;
}

function updateKnown() {
    const e = knownEntry(suggest.url.value.trim());
    suggest.known.classList.remove('error');
    suggest.url.removeAttribute('aria-invalid');
    suggest.known.hidden = !e;
    if (e) suggest.known.innerHTML = `Already in the catalogue: <a href="#${escapeHTML(e.id)}" data-open="${escapeHTML(e.id)}">${escapeHTML(e.name)}</a>.`;
}

$('#suggest-btn').addEventListener('click', ev => {
    if (!entries.length) return; // catalogue not loaded: fall back to the plain link
    ev.preventDefault();
    if (suggest.category.options.length === 1) {
        suggest.category.insertAdjacentHTML('beforeend', categories.map(c => `<option value="${escapeHTML(c.name)}">${escapeHTML(c.name)}</option>`).join(''));
    }
    updateKnown();
    suggest.dialog.showModal();
    suggest.url.focus();
});

suggest.url.addEventListener('input', updateKnown);
suggest.known.addEventListener('click', ev => {
    const link = ev.target.closest('[data-open]');
    if (!link) return;
    ev.preventDefault();
    suggest.dialog.close();
    openDetail(link.dataset.open);
});

suggest.form.addEventListener('submit', ev => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(suggest.form));
    let url = data.url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!urlKey(url)) {
        suggest.url.setAttribute('aria-invalid', 'true');
        suggest.known.textContent = 'Enter the address of the site, for example https://example.com/.';
        suggest.known.classList.add('error');
        suggest.known.hidden = false;
        suggest.url.focus();
        return;
    }
    const name = data.name.trim();
    const link = issueURL('suggest-site.yml', {
        title: `Suggest: ${name || hostOf(url)}`,
        url, name,
        category: data.category,
        tags: data.tags.trim(),
        why: data.why.trim(),
    });
    window.open(link, '_blank', 'noopener');
    suggest.dialog.close();
    suggest.form.reset();
    toast('GitHub opened in a new tab');
});

for (const id of ['#suggest-close', '#suggest-cancel']) $(id).addEventListener('click', () => suggest.dialog.close());
suggest.dialog.addEventListener('click', ev => {
    if (ev.target === suggest.dialog) suggest.dialog.close(); // click on backdrop
});

// ---------- events ----------

// ---------- inline completion ----------

const ghost = { box: $('#search-ghost'), typed: $('#search-ghost .ghost-typed'), rest: $('#search-ghost .ghost-rest') };
let ghostRest = '';

function updateGhost() {
    const input = els.search;
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    ghostRest = document.activeElement === input && atEnd && entries.length ? completionFor(input.value) : '';
    // Once the text scrolls inside the field the overlay would no longer line up.
    if (ghostRest && input.scrollWidth > input.clientWidth) ghostRest = '';
    ghost.typed.textContent = input.value;
    ghost.rest.textContent = ghostRest;
    ghost.box.hidden = !ghostRest;
}

function acceptGhost() {
    if (!ghostRest) return false;
    els.search.value += ghostRest + ' ';
    els.search.dispatchEvent(new Event('input'));
    return true;
}

ghost.rest.addEventListener('mousedown', ev => {
    ev.preventDefault(); // keep focus in the field
    acceptGhost();
});
for (const type of ['focus', 'blur', 'click']) els.search.addEventListener(type, updateGhost);
// caret moves (arrow keys, Home/End); Escape dismisses the suggestion until the next edit
els.search.addEventListener('keyup', ev => { if (ev.key !== 'Escape') updateGhost(); });

// ---------- search field ----------

let searchTimer;
els.search.addEventListener('input', () => {
    updateGhost();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => update({ q: els.search.value }, { push: false }), 90);
});
els.search.addEventListener('keydown', ev => {
    if ((ev.key === 'Tab' && !ev.shiftKey) || ev.key === 'ArrowRight') {
        if (acceptGhost()) ev.preventDefault();
        return;
    }
    if (ev.key === 'Escape') {
        if (ghostRest) {
            ev.preventDefault(); // search inputs clear themselves on Escape otherwise
            ghostRest = '';
            ghost.box.hidden = true;
            return;
        }
        if (els.search.value) { els.search.value = ''; update({ q: '' }, { push: false }); }
    }
});
els.searchForm.addEventListener('submit', ev => {
    ev.preventDefault();
    clearTimeout(searchTimer);
    update({ q: els.search.value }, { push: false, scroll: true });
    els.search.blur();
});

els.categoryList.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-cat]');
    if (!btn) return;
    const id = btn.dataset.cat;
    // "All sites" clears the selection, every other category toggles
    const cats = !id ? [] : state.cats.includes(id) ? state.cats.filter(c => c !== id) : categories.map(c => c.id).filter(c => c === id || state.cats.includes(c));
    update({ cats });
});

els.sections.addEventListener('click', ev => {
    const more = ev.target.closest('.show-more');
    if (more) { update({ cats: [more.dataset.cat] }, { scroll: true }); return; }
    const fav = ev.target.closest('.fav-button');
    if (fav) { toggleFavorite(fav.dataset.id); return; }
    const link = ev.target.closest('[data-open]');
    if (link && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey) {
        ev.preventDefault();
        openDetail(link.dataset.open);
    }
});

els.filters.addEventListener('click', ev => {
    const cat = ev.target.closest('[data-clear-cat]');
    if (cat) { update({ cats: state.cats.filter(c => c !== cat.dataset.clearCat) }); return; }
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
    update({ q: '', cats: [], tag: '', fav: false, sort: 'relevance' });
});

// Screenshots fade in over their placeholder; a broken one leaves the placeholder.
document.addEventListener('load', ev => {
    const img = ev.target;
    if (img instanceof HTMLImageElement && img.classList.contains('shot-img')) {
        img.classList.add('loaded');
        img.parentElement.classList.remove('is-loading');
    }
}, true);

// Fall back to a letter tile when a favicon can't be loaded.
document.addEventListener('error', ev => {
    const img = ev.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.classList.contains('shot-img')) {
        img.parentElement.classList.remove('is-loading');
        if (img.parentElement === detail.shot) detail.shot.classList.add('failed');
        img.remove();
        return;
    }
    if (!img.classList.contains('favicon')) return;
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

// The catalogue is shown straight from the last visit's copy and refreshed in the background.
function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

function writeCache(cache) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
}

async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    return res.text();
}

let booted = false;

function apply(dataText, previewsText) {
    const data = JSON.parse(dataText);
    previews = previewsText ? JSON.parse(previewsText) : {};
    categories = data.categories;
    categoryById = new Map(categories.map(c => [c.id, c]));
    entries = data.entries;
    buildIndex(entries, categoryById);
    entryById = new Map(entries.map(e => [e.id, e]));
    newSince = new Date(data.updated).getTime() - NEW_DAYS * 864e5;

    els.eyebrow.innerHTML = `<span><strong>${entries.length}</strong> sites</span><span><strong>${categories.length}</strong> topics</span><span>Updated ${escapeHTML(formatDate(data.updated))}</span>`;
    els.footerMeta.textContent = `${entries.length} sites · last updated ${formatDate(data.updated)}`;

    if (booted) {
        // fresher data arrived: keep the search, filters and scroll position
        state.cats = state.cats.filter(id => categoryById.has(id));
        renderCategories();
        render();
        return;
    }
    booted = true;
    readURL();
    renderCategories();
    els.sections.classList.add('enter');
    render();
    setTimeout(() => els.sections.classList.remove('enter'), 1000);

    const id = decodeURIComponent(location.hash.slice(1));
    if (id && entryById.has(id)) openDetail(id, { push: false });
}

async function init() {
    const cached = readCache();
    if (cached?.data) {
        try { apply(cached.data, cached.previews); } catch { booted = false; }
    }
    try {
        const [data, previewsText] = await Promise.all([
            fetchText(DATA_URL),
            fetchText(PREVIEWS_URL).catch(() => cached?.previews || ''),
        ]);
        if (data !== cached?.data || previewsText !== cached?.previews) {
            apply(data, previewsText);
            writeCache({ data, previews: previewsText });
        }
    } catch (err) {
        if (booted) return; // offline or flaky: the cached copy stays on screen
        console.error('Could not load the catalogue:', err);
        els.count.textContent = '';
        els.sections.innerHTML = `<div class="empty"><p class="empty-title">The catalogue could not be loaded.</p><p>${escapeHTML(err.message)}. Please try again later.</p></div>`;
    }
}

init();

if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* images just load normally */ }));
}
