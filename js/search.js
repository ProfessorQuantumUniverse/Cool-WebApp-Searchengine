// Search logic without DOM access, shared by the page and the tests.

export function fold(str) {
    return String(str ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function tokenize(query) {
    return fold(query).split(/\s+/).filter(Boolean);
}

const words = str => str.split(/[^a-z0-9]+/).filter(Boolean);

// Typos are only corrected towards words from names, tags, taglines and categories,
// so a stray word in a long description never drags in unrelated results.
const vocabulary = new Set();
// Every word in the catalogue; a search term that starts one of them is not a typo.
const allWords = new Set();
const corrections = new Map();
// Word -> weight for autocomplete; words in names and tags count more.
const completions = new Map();

const MIN_FUZZY = 4;        // shorter terms are never corrected
const CORRECTED = 0.6;      // weight of a match found through a correction

function indexEntry(e, categoryById) {
    const cat = categoryById.get(e.category);
    e._host = hostOf(e.url);
    e._name = fold(e.name);
    e._nameWords = words(e._name);
    e._tagline = fold(e.tagline);
    e._taglineWords = words(e._tagline);
    e._desc = fold(e.description);
    e._descWords = new Set(words(e._desc));
    e._tags = e.tags.map(fold);
    e._cat = fold(cat ? cat.name : '');
    e._catWords = words(e._cat);
    for (const w of [...e._nameWords, ...e._tags.flatMap(words), ...e._taglineWords, ...e._catWords]) {
        if (w.length >= MIN_FUZZY) vocabulary.add(w);
        allWords.add(w);
    }
    for (const w of e._descWords) allWords.add(w);
    const weigh = (list, weight) => {
        for (const w of list) if (w.length >= 3 && /[a-z]/.test(w)) completions.set(w, (completions.get(w) || 0) + weight);
    };
    weigh(e._nameWords, 3);
    weigh(e._tags.flatMap(words), 2);
    weigh(e._taglineWords, 1);
}

export function buildIndex(entries, categoryById) {
    vocabulary.clear();
    allWords.clear();
    corrections.clear();
    completions.clear();
    for (const e of entries) indexEntry(e, categoryById);
    for (const c of categoryById.values()) {
        for (const w of words(fold(c.name))) if (w.length >= 3) completions.set(w, (completions.get(w) || 0) + 2);
    }
}

// The rest of the most likely word for a half-typed last word: "sateli" -> "te".
export function completionFor(query) {
    const last = /(\S+)$/.exec(query)?.[1];
    const t = fold(last);
    if (!last || t.length < 3 || t !== last.toLowerCase()) return ''; // skip accented input, the rest wouldn't line up
    let best = '', bestWeight = 0;
    for (const [w, weight] of completions) {
        if (w.length <= t.length || !w.startsWith(t)) continue;
        if (weight > bestWeight || (weight === bestWeight && w.length < best.length)) { best = w; bestWeight = weight; }
    }
    // A finished word stays as it is: "space" is not pushed towards "spacecraft".
    if ((completions.get(t) || 0) * 2 >= bestWeight) return '';
    return best.slice(t.length);
}

// Optimal string alignment distance (Levenshtein plus swapped neighbours), stops early above max.
function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        let best = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
            if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
            row.push(d);
            if (d < best) best = d;
        }
        if (best > max) return max + 1;
        prev2 = prev;
        prev = row;
    }
    return prev[b.length];
}

// Known words the term was probably meant to be: "satelite" -> ["satellite"].
export function correctionsFor(t) {
    if (t.length < MIN_FUZZY || !/[a-z]/.test(t)) return [];
    if (!corrections.has(t)) {
        let known = false;
        for (const w of allWords) if (w.startsWith(t)) { known = true; break; }
        let found = [];
        if (!known) {
            // Only the closest words count: "astronmy" -> "astronomy", not also "astrodmx".
            const max = t.length >= 8 ? 2 : 1;
            let best = max + 1;
            for (const w of vocabulary) {
                const d = editDistance(w, t, Math.min(max, best));
                if (d < best) { best = d; found = [w]; } else if (d === best && d <= max) found.push(w);
            }
            // Half-typed words: "sateli" is one edit away from the start of "satellite".
            if (!found.length && t.length >= 6) {
                found = [...vocabulary].filter(w => w.length > t.length && editDistance(w.slice(0, t.length), t, 1) <= 1);
            }
        }
        corrections.set(t, found);
    }
    return corrections.get(t);
}

const startsAny = (list, t) => list.some(w => w.startsWith(t));

function scoreToken(e, t) {
    // Very short terms only match at the start of a word ("ai" should not find "Gaia").
    const inside = t.length >= 3 ? (s => s.includes(t)) : () => false;
    let s = 0;
    if (e._name === t) s = 12;
    else if (e._name.startsWith(t)) s = 9;
    else if (startsAny(e._nameWords, t)) s = 7;
    else if (inside(e._name)) s = 5;
    if (e._tags.includes(t)) s = Math.max(s, 6);
    else if (startsAny(e._tags, t)) s = Math.max(s, 4);
    if (s) return s;
    if (startsAny(e._taglineWords, t) || inside(e._tagline)) return 3;
    if (startsAny(e._catWords, t) || e._host.startsWith(t) || inside(e._host)) return 2;
    if (t.length >= 3 ? e._desc.includes(t) : e._descWords.has(t)) return 1;
    return 0;
}

// A correction shorter than the typed term must match a whole word,
// otherwise "plant" -> "plan" would also find "planets" and "planning".
function scoreWholeWord(e, w) {
    if (e._nameWords.includes(w)) return 7;
    if (e._tags.includes(w)) return 6;
    if (e._taglineWords.includes(w)) return 3;
    if (e._catWords.includes(w)) return 2;
    return e._descWords.has(w) ? 1 : 0;
}

export function scoreEntry(e, tokens) {
    let total = 0;
    for (const t of tokens) {
        let s = scoreToken(e, t);
        if (!s) {
            for (const c of correctionsFor(t)) {
                s = Math.max(s, (c.length < t.length ? scoreWholeWord(e, c) : scoreToken(e, c)) * CORRECTED);
            }
        }
        if (!s) return 0;
        total += s;
    }
    return total;
}

// Entries matching all tokens, best match first.
export function search(list, tokens) {
    return list
        .map(e => ({ e, s: scoreEntry(e, tokens) }))
        .filter(r => r.s > 0)
        .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
        .map(r => r.e);
}

// Deterministic shuffle seeded by the given day (mulberry32).
export function dailyShuffle(list, day = new Date().toISOString().slice(0, 10)) {
    let seed = Number(day.replace(/-/g, ''));
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
