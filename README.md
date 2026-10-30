# Cool WebApps

**[► Open the catalogue](https://professorquantumuniverse.github.io/Cool-WebApp-Searchengine/)**

A hand-picked catalogue of useful, curious and beautiful websites: interactive maps, satellite imagery, space and astronomy tools, science simulations, open data, AI experiments, developer helpers and the odd toy. More than 400 entries in 16 categories.

## Features

- **Instant search** across names, taglines, descriptions, tags and domains, with typo tolerance.
- **Categories, tags and favourites.** Favourites are stored only in your browser.
- **Shareable links.** Every search, filter and entry has its own URL (for example `?cat=space` or `#nukemap`).
- **Detail view** with a live screenshot, description, tags and a direct link.
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

Or [suggest a site](https://github.com/ProfessorQuantumUniverse/Cool-WebApp-Searchengine/issues/new?labels=suggestion&title=Suggest%20a%20site%3A%20) via an issue.

## Running locally

`data.json` is loaded with `fetch`, so the page needs to be served over HTTP rather than opened as a file:

```sh
npx serve .
```

## Credits

Screenshots by [thum.io](https://www.thum.io/), favicons via Google. Made by [@ProfessorQuantumUniverse](https://github.com/ProfessorQuantumUniverse).

## License

GNU General Public License v3.0, see [`LICENSE`](LICENSE).
