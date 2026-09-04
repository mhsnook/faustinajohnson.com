# Where content lands

A map from "I want this to show up there" to the thing you actually edit. Every
admin path below is under `http://localhost:4321/_emdash/admin` locally, or
`https://faustinajohnson.com/_emdash/admin` in production.

## The home page, top to bottom

| Block on `/` | Comes from | Notes |
| --- | --- | --- |
| Top bar ticker | Widget area `marquee` | A **content** widget. One paragraph per ticker line; the lines are joined with `·` and scrolled. |
| Masthead title + lede | Site settings `title` and `tagline` | Settings → General. A settings **logo** replaces the title on the home page only. |
| Masthead kicker | Hardcoded | `long form · field research · cultural context`, in `Base.astro`. |
| Bio | Page entry with slug **`about`** | `title`, `kicker`, `content`, and `portrait`. No portrait uploaded falls back to `public/faustina-johnson.png`. |
| The Work | `posts`, published, newest 4 by `published_on` | Heading counts them ("Four Pieces"); the line beside it is the year range of those four. |
| Method heading + pull quote | Page entry with slug **`method`** | `kicker` and `title` are the heading; `content` renders as the centred quote — write it as a blockquote. |
| Method grid | `tenets` collection, ordered by `sort_order` ascending | Three fit the row. `numeral`, `title`, `body`. |
| Field Notes | `notes`, published, newest 4 by `note_date` | "updated weekly" is hardcoded; the heading links to `/notes`. |
| Correspondence | Page entry with slug **`correspondence`** + menu `correspondence` | `title` and `content` fill the block; the menu's items become the buttons, first one in ember. |
| Footer | Hardcoded | In `Base.astro`. |

The three special page slugs — `about`, `method`, `correspondence` — also render
as ordinary pages at `/about`, `/method`, `/correspondence`. Rename one of those
slugs and its home-page block disappears.

## Every other page

The shell is the same everywhere: top bar, masthead, left nav + `rail-left`,
main column, `rail` on the right, footer.

| Route | Shows |
| --- | --- |
| `/posts` | Every published piece, newest first, plus live search across pieces, notes, pages and images. Tags print under each card. |
| `/posts/[slug]` | One piece. Categories sit in the dateline; tags at the foot. |
| `/notes` | Every published note, newest first by `note_date`. |
| `/notes/[slug]` | One note. The dateline is the masthead kicker. |
| `/images` | Every published image entry, newest first by date. |
| `/images/[slug]` | One image entry: the main image, its caption, the MIDI if it has one, and the rest of the gallery. |
| `/[slug]` | Any `pages` entry. A portrait renders beside the text if the entry has one. |
| `/category/[slug]` | Pieces in that category. |
| `/tag/[slug]` | Pieces with that tag. |

A new page entry is live at `/its-slug` the moment it publishes, but nothing
links to it until you add it to the **`primary`** menu.

## Collections: which one do I write in?

| Want | Collection | Required fields | Where it appears |
| --- | --- | --- | --- |
| A long-form piece | `posts` ("Pieces") | `title`, `published_on` | Home (top 4), `/posts`, its own page, category and tag archives, the "from the field" rail block |
| A short dated entry | `notes` ("Field Notes") | `title`, `note_date` | Home (top 4), `/notes`, its own page |
| A photograph | `images` | `title`, `image` | `/images`, its own page, and the "from the field" rail block on every page |
| A line in the Method grid | `tenets` ("Method") | `title` | Home only — tenets have no page of their own |
| A standalone page | `pages` | `title` | `/[slug]`, plus the home page for the three special slugs |

Drafts are excluded everywhere; publish to make something appear.

## Tagging

`category` (hierarchical) and `tag` (flat) attach to **`posts` only**. Notes,
pages, tenets and images cannot be tagged, and adding a term to one does
nothing.

- Add a category → the piece shows up at `/category/<term>` and the term prints
  in the piece's dateline.
- Add a tag → the piece shows up at `/tag/<term>` and the term prints under the
  card on `/posts` and at the foot of the piece.

Taxonomy names in code are singular: `category`, `tag`. The term slug is what
the URL uses.

## Images

One entry is one subject, not one file: four photographs of the same fort are
one entry, not four. The `image` field is the main one -- it is what the rail,
the index and the link preview all use. Everything else on the entry shows only
on its own page at `/images/<slug>`.

To put a photograph on the site: new entry under Images, upload into `image`,
publish. It is at `/images/<slug>` immediately, on `/images`, and in the "from
the field" rail block if it is one of the four newest.

| Field | Required | What it does |
| --- | --- | --- |
| `title` | yes | The heading, and the label under the thumbnail on `/images`. |
| `image` | yes | The main image. Every preview of this entry uses it. |
| `caption` | | Printed under the image, on the index and the entry page. |
| `location` | | Prints beside the date. |
| `taken_on` | | The sort order everywhere images are listed. |
| `midi` | | A `.mid` file. Plays on the entry page, under the image. |
| `gallery` | | More views of the same subject, each with its own caption. Entry page only. |

Alt text is not a field here. It lives on the upload itself, in the media
library, so one image carries the same alt everywhere it is used. Set it when
you upload, not per entry.

Date is optional but it is the sort key: newest first, and an entry with no
date sorts to the bottom. Give a photo a date if you care where it lands.

`gallery` is a repeater -- add as many rows as you like, up to twelve, each
one an image plus an optional caption. Reordering the rows reorders the strip
on the page.

The MIDI player is a web component loaded from jsDelivr, with a Google-hosted
soundfont, and only on entries that have a MIDI. If the script does not load,
the player falls back to a plain download link.

`title`, `caption` and `location` are indexed, so an image entry can turn up in
the search box on `/posts` alongside pieces and notes. The gallery rows are not
indexed -- a caption you want findable belongs in `caption`.

## Menus

| Menu | Where it renders |
| --- | --- |
| `primary` ("The Rooms") | The left-hand nav on every page. Seeded as anchors into the home page (`/#work`), but any URL works. |
| `correspondence` | The two buttons in the closing block on the home page. First item gets the ember treatment. |

## Rails and the ticker

Three widget areas, all editable in the admin under Widgets.

| Area | Where |
| --- | --- |
| `marquee` | The scrolling line in the top bar. Content widgets only — anything else is ignored. |
| `rail-left` | Under the nav in the left column, every page. |
| `rail` | The right column, every page. |

Widget types that render:

| Type | What you get |
| --- | --- |
| Content | Portable Text in the rail's small type. Bold runs read as labels. |
| Menu | The named menu as a stacked list of links. |
| Component | One of the components below. |

| Component ID | Props | What it draws |
| --- | --- | --- |
| `site:candle` | `caption` | The candle. |
| `site:now-playing` | `track`, `meta`, `progress` (0–100) | Now playing, with the animated bars. |
| `site:publications` | `items` (array of strings) | The "appeared in" list. |
| `site:field-photos` | `caption`, `href` | The four newest `images` entries -- big frame plus three thumbs, each linking to its entry. |
| `core:recent-posts` | `count` (5), `showDate` (true) | A list of recent pieces. |
| `core:categories` | `limit` | Every category, linked. |
| `core:tags` | `limit` | Every tag, linked. |

A component widget's props go by three different names depending on where you
are looking, which is the usual reason a rail block renders its title and
nothing else:

| Where | Key |
| --- | --- |
| `seed/seed.json` | `props` |
| Runtime `Widget` object | `componentProps` |
| D1 column | `component_props` |
| REST API body | `componentProps` |

Anything else the seeder sees is dropped silently.

## Schema changes and the live site

`seed/seed.json` only ever runs against an empty database, on the first request
after setup completes. A site that already has content will not pick up a new
collection from a deploy, however many times you ship it -- the seed is the
starting shape, not a migration.

So a new collection has to reach the live site some other way. That is what
`pnpm schema:push` is for: it reads `seed/seed.json`, compares it against a
running site's schema, and creates whatever is missing.

```bash
pnpm schema:push --url https://faustinajohnson.com --dry-run   # show the plan
pnpm schema:push --url https://faustinajohnson.com             # apply it
npx emdash types --url https://faustinajohnson.com             # refresh the types
```

It only ever adds. A collection or field the live site has and the seed does
not is left alone; a field whose type has drifted from the seed is reported and
not touched. Menu links are appended, never rewritten -- EmDash's own
`applySeed` deletes a menu's items and rebuilds them from the seed, which would
throw away anything added in the admin, so this does not use it. A new link
lands at the end of the menu; drag it where you want it in the admin.

A collection whose `supports` include `search` also gets its full-text index
built and populated. Creating a collection over the API records the support but
not the index behind it, so without that step the collection is searchable in
name only -- nothing it holds ever comes back from the search box. That runs for
collections this script creates; a collection that predates it and is missing
its index needs `POST /search/enable` and `/search/rebuild` by hand.

Running it twice is safe: the second run finds nothing to do.

Authentication, in the order it tries them:

| How | Where it comes from |
| --- | --- |
| `--token`, or `EMDASH_TOKEN` | a `ec_pat_` token from the admin |
| `EMDASH_HEADERS` | `"CF-Access-Client-Id: ...\nCF-Access-Client-Secret: ..."` for the Access service token the admin sits behind |
| `--dev-bypass` | localhost only, and only under `astro dev` |

Whichever you use has to be an **admin**. `schema:manage` is admin-only (role 50);
everything day-to-day publishing needs -- content, media, menus, widgets,
taxonomies -- is editor (role 40) or below. So a site can hand its writers editor
accounts, keep the schema editor out of the admin UI for them entirely, and let
schema changes arrive only through this script. `astro.config.mjs` currently
provisions new Access identities at 50, which gives everyone the schema editor.

The CLI's own `npx emdash schema create` and `add-field` cover simple fields but
take neither `validation` nor `options`, so they cannot express the `gallery`
repeater's sub-fields or the MIDI type restriction. That is why the script
posts the seed's definitions directly rather than shelling out to them.

## Needs a code change, not an edit

| Thing | File |
| --- | --- |
| "✦ enter quietly", "write to me →", the footer lines | `src/layouts/Base.astro` |
| The default masthead kicker on inner pages | `src/layouts/Base.astro` |
| "updated weekly" beside Field Notes | `src/pages/index.astro` |
| How many pieces and notes the home page shows | `src/pages/index.astro` (both are `limit: 4`; the heading's number words stop at four) |
| A new kind of rail block | A component under `src/components/widgets/`, plus a branch in `WidgetRenderer.astro` |
| How many images the rail shows, or the MIDI player's CDN and soundfont | `src/components/widgets/FieldPhotos.astro`, `src/components/MidiPlayer.astro` |
| Site settings beyond `title` and `tagline` | Not extensible — use a widget area or a `pages` entry instead |
