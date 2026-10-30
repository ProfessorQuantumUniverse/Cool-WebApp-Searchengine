# Cool WebApps

**[► Open the catalogue](https://professorquantumuniverse.github.io/Cool-WebApp-Searchengine/)**

A hand-picked catalogue of useful, curious and beautiful websites: interactive maps, satellite imagery, space and astronomy tools, science simulations, open data, AI experiments, developer helpers and the odd toy. More than 400 entries in 16 categories.

## Features

- **Instant search** across names, taglines, descriptions, tags and domains. Typos are corrected carefully ("satelite" finds satellite, short words are left alone), and the field completes the word you are typing (accept with <kbd>Tab</kbd> or <kbd>→</kbd>). Everything runs in the browser.
- **Categories, tags and favourites.** Pick several categories at once; sort by best match, A–Z, Z–A or date. Favourites are stored only in your browser.
- **Shareable links.** Every search, filter and entry has its own URL (for example `?cat=maps,space` or `#nukemap`).
- **Preview images** on every card and in the detail view, taken by our own pipeline and served from this repository.
- **Fast repeat visits.** The catalogue is shown from the last visit's copy while a fresh one loads, and a small service worker keeps images and fonts.
- **"Surprise me"** opens a random site.
- **Light and dark mode**, responsive layout, keyboard friendly (press <kbd>/</kbd> to search).
- No framework, no build step: plain HTML, CSS and JavaScript.

## Data

All entries live in [`data.json`](data.json); there is no external database. The file has three parts:

```json
{
  "updated": "2026-10-29",
  "categories": [
    { "id": "maps", "name": "Maps & Geodata", "description": "Interactive maps, GIS portals and cartography tools" }
  ],
  "entries": [
    {
      "id": "nukemap",
      "name": "NUKEMAP",
      "tagline": "Simulate the effects of a nuclear detonation",
      "description": "Alex Wellerstein's map that shows blast radius, fallout and casualties for any weapon yield at any location.",
      "url": "https://nuclearsecrecy.com/nukemap/",
      "category": "science",
      "tags": ["nuclear", "simulation", "history", "map"],
      "source": "sheet"
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `id` | Unique, lowercase with dashes. Used in links (`#id`). |
| `name`, `tagline`, `description` | Short name, one-line summary, one or two sentences. |
| `url` | Clean URL without tracking or map-position parameters. |
| `category` | One of the category ids. |
| `tags` | Lowercase keywords for search. |
| `added` | Optional date (`YYYY-MM-DD`); recent entries get a "New" badge. |
| `source` | Where the entry came from (`sheet` = the former Google Sheet, `bookmarks` = browser bookmarks). |

To add a site, add an entry to `data.json` and run the check:

```sh
node scripts/validate.mjs
```

Or [suggest a site](https://github.com/ProfessorQuantumUniverse/Cool-WebApp-Searchengine/issues/new?template=suggest-site.yml): the form on the website opens this issue form with everything filled in.

## Preview images

Screenshots and favicons live in [`previews/`](previews/) and are made by [`scripts/previews.mjs`](scripts/previews.mjs) (Playwright with an ad and cookie-banner blocker, then WebP via sharp). `previews/index.json` lists which entries have an image, a short hash for cache busting, and why a capture failed.

The [Previews workflow](.github/workflows/previews.yml) runs on every push that changes `data.json` and only photographs new entries. Run it by hand from the Actions tab to re-shoot entries (`ids`), everything (`all`) or failed ones (`retry_failed`). To run it locally:

```sh
npm ci
npx playwright install chromium
npm run previews -- --ids nukemap,zoom-earth
```

## Running locally

`data.json` is loaded with `fetch`, so the page needs to be served over HTTP rather than opened as a file:

```sh
npx serve .
```

## Credits

Fonts: [Geist and Geist Mono](https://github.com/vercel/geist-font) (SIL Open Font License, see [`fonts/OFL.txt`](fonts/OFL.txt)). Favicons are fetched from Google when the previews are made. Made by [@ProfessorQuantumUniverse](https://github.com/ProfessorQuantumUniverse).

## License

GNU General Public License v3.0, see [`LICENSE`](LICENSE).
