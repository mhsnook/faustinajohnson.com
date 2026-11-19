This is an EmDash site -- a CMS built on Astro with a full admin UI.

## Commands

```bash
pnpm dev                           # Dev server with HMR, usually at localhost:4321
pnpm build && pnpm preview         # Production build, served locally
npx emdash types                   # Regenerate TypeScript types from a running site
pnpm schema:push --url URL --dry-run      # Push seed/seed.json's schema to a live site

pnpm typecheck                     # astro check
pnpm lint                          # oxlint            (--fix available as lint:fix)
pnpm format                        # changed files    (:staged, :all, :check)
pnpm test                          # vitest run        (test:watch to watch)
```

The admin UI is at `/_emdash/admin`, usually on `http://localhost:4321`, and
`pnpm dev` reaches it with no extra flag -- see "Admin login" below.
`/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin` signs you in as an
admin without a passkey. It is dev-only, so a production build served by
`preview` has no local way into the admin.

### Known dev-mode issues

Every issue this section once tracked as open is now resolved. They are kept
here because the notes and config lines they explain are still in the tree, and
because a hang or an unstyled admin in dev will send the next person looking for
exactly these.

- **emdash-cms/emdash#2626** (closed 2026-09-07, #2937) -- `getBackend()` parked
  its in-flight init promise on a `globalThis` singleton and never cleared it if
  the request that started it was cancelled, wedging every later request in the
  isolate. It now bounds waiters with their own timer, reclaims a stalled init
  after a deadline, and anchors the init with `after()` so it survives the
  cancellation. The fix is in 1.x, so this site has carried it since the 1.5.0
  upgrade.
- **cloudflare/workers-sdk#15550** (closed 2026-09-12, #15574) -- Miniflare's
  writes under `.wrangler/state` triggered Vite hot-update churn on Linux. The
  `vite.server.watch.ignored` entry in `astro.config.mjs` is that workaround, and
  its comment still says "needed until" the issue. Wrangler ships the fix now, so
  the line is a removal candidate -- but drop it only after a cold start and a few
  edits show no reload churn, since it is also what kept #2626 from being hit.
- **emdash-cms/emdash#2572** (closed 2026-11-04, not a bug) -- the admin
  stylesheet 500ing under `astro dev` was the reporter's `react({ include: [...] })`
  matching the CSS request, so React's transform tried to parse it. This project
  passes a bare `react()`, so if an unstyled admin shows up here it is a different
  cause and wants its own investigation.
- **withastro/astro#17868** -- an unresolvable specifier inside workerd threw an
  uncaught exception, panicked the process, broke the IPC pipe, and corrupted
  Astro's route registry. It surfaced as `Unable to resolve
  [emdash/routes/PluginRegistry]` on a loop at 50-90% CPU. Fixed for this project
  by emdash 0.36.0 (#2808, which stops Vite discovering `astro/app/manifest`
  after startup) together with astro 7.2.10 and @astrojs/cloudflare 14.2.6. A
  `vite.ssr.optimizeDeps.noDiscovery` workaround used to live in
  `astro.config.mjs`; it was removed after two cold starts on the current
  versions showed zero panics, zero reloads, and zero late dep discoveries. Put
  it back only if those reappear.

### Upgrading EmDash

The site moved from 0.36.0 to 1.5.0 on 2026-11-19. Do not hand-bump the
versions; `upgrade-emdash` resolves the npm tag, updates every direct EmDash
package, refreshes the skills in `.agents/skills/`, and writes a work order:

```bash
npx upgrade-emdash@latest --dry-run   # shows the plan, changes nothing
npx upgrade-emdash@latest             # bumps the packages, writes .emdash/UPGRADE.md
```

`.emdash/UPGRADE.md` is gitignored and is the thing to read: it carries only the
changelog entries that cross this project's direct packages, plus the core
migration delta found after install. The 0.36 to 1.5 run put 567 entries in that
file, 28 of them carrying a required action, and four naming a surface this site
touches -- none of which needed a code change here.

Three things that run caught, worth expecting again:

- **A transitive pin can break the build.** A fresh install floated
  `@atcute/repo` ahead of `@atcute/cid`, which the sticky lockfile held back, and
  `astro check` died on a missing `toLinkBytes` export. `pnpm update --depth
  Infinity <package>` on the stale half fixes it. Upstream's own lockfile never
  produces the pair, so this kind of break is ours to resolve, not a bug to
  report.
- **The Worker jumps.** See the bundle note under "Checks".
- **Verification cannot be done anonymously.** While the Access application
  points at the bare hostname it gates the whole site, so every public URL 302s
  to the Access login for anyone signed out. That is the private-preview gate
  described in [docs/auth.md](docs/auth.md), not a broken deploy. Check the site
  in a browser that holds an Access session.

### Running core migrations

Core migrations are forward-only and belong in a serialized step: **build,
migrate, deploy, check**. An Astro build writes `.emdash/migrations.json`, the
manifest `emdash migrate` reads, so migrate and deploy must use the same
artifact -- `pnpm deploy` rebuilds, so run `wrangler deploy` directly after the
build you migrated against.

```bash
npx wrangler d1 time-travel info ba78631b-bd76-4be3-9998-a3daa66c3201
pnpm build
export CLOUDFLARE_API_TOKEN=...   # scoped token with D1 Edit
pnpm exec emdash migrate --status --account-id c9d80e4dec35727da326297ef5b88f04 --d1 ba78631b-bd76-4be3-9998-a3daa66c3201
pnpm exec emdash migrate         --account-id c9d80e4dec35727da326297ef5b88f04 --d1 ba78631b-bd76-4be3-9998-a3daa66c3201
env -u CLOUDFLARE_API_TOKEN pnpm exec wrangler deploy
pnpm exec emdash migrate --check --account-id c9d80e4dec35727da326297ef5b88f04 --d1 ba78631b-bd76-4be3-9998-a3daa66c3201
```

The `--account-id` and `--d1` flags are not optional in practice: the CLI fails
with "A valid Cloudflare account ID is required for D1 migrations" even though
`wrangler.jsonc` carries `account_id`. The `env -u` on the deploy is load-bearing
too -- wrangler prefers `CLOUDFLARE_API_TOKEN` over the `wrangler login` session,
and a token scoped to D1 Edit cannot touch the Worker service.

The recovery point for D1 is a **Time Travel bookmark**, recorded before
migrating: 30 days on Workers Paid. EmDash cannot restore its own JSON backups,
and `wrangler d1 export` refuses this database outright, because a collection
with search enabled puts FTS5 virtual tables in it.

A Worker in the default `auto` migration mode applies pending migrations itself
on the first request, but leaves any migration that would process more than
about 5,000 content rows to the CLI and answers 503 until it is applied. It
recovers within 30 seconds of the command finishing.

### Seeding a fresh database

Content seeds when setup completes, and the dev-bypass endpoint that completes it
is dev-only:

```bash
pnpm dev
curl -L "http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin"
```

### Run only one dev server

Two servers in this repo share `node_modules/.vite`, re-optimize, and bump the `?v=`
hash out from under each other. `Port 4321 is in use` or `Default inspector port 9229
not available` means one is already running:

```bash
ss -ltnp | grep -E ':(4321|9229)'
npx astro dev status && npx astro preview status
```

## Checks

`.github/workflows/pr-checks.yml` runs on every PR into `main`. It reports what
the PR **changed** rather than whether the repo is clean: new vs resolved type
errors, new vs resolved lint findings, formatter drift, Worker and client bundle
size, and the test run. It posts one comment and edits that same comment on each
push.

The shape is one job per **tree**, not one per check. `head` and `base` each
install once and build once, in parallel, then run every check that tree can
answer. `report` fans in, diffs the two, comments, and decides pass or fail.
Two installs and two builds, whatever the number of checks.

What blocks a merge lives in one object, `POLICY` in `.github/ci/gate.cjs`:

| Check     | Rule            | Why                                                        |
| --------- | --------------- | ---------------------------------------------------------- |
| typecheck | `no-new`        | starts at 0 errors, so the gate is usable from day one     |
| lint      | `no-new`        | starts at 0 findings                                       |
| tests     | `no-new`        | any failure blocks                                         |
| format    | `touched-clean` | a file you edited ships formatted; files you did not are not your problem |
| bundle    | byte budgets    | worker +250 kB, client +100 kB gzipped, plus the hard limit |

The Worker has a real ceiling: Cloudflare refuses a deploy over **10 MB
gzipped** on Workers Paid. It sits at about 5.6 MB since the 1.5.0 upgrade, and
the gate fails at the limit whatever the delta. That jump from 2.9 MB was the
upgrade itself, not drift: 1.5 ships a much larger admin, mostly per-locale
message chunks and a plugin registry of about 1 MB gzipped. The `POLICY` deltas
were left as they are, so a one-time step change like that fails the bundle
check and gets merged deliberately rather than quietly raising the budget.

### Two formatters

oxfmt cannot parse `.astro` ([oxc#19715](https://github.com/oxc-project/oxc/issues/19715)),
so Prettier with `prettier-plugin-astro` formats the 24 `.astro` files and oxfmt
formats everything else. Each reads its own ignore file, `.oxfmtignore` and
`.prettierignore`, so the two never rewrite the same file.

- `pnpm format` formats everything changed against the HEAD
- `pnpm format:staged` formats only what is staged, runs on pre-commit
- `pnpm format:all`

## Key Files

| File                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`       | Astro config with `emdash()` integration, database, and storage                    |
| `src/live.config.ts`     | EmDash loader registration (boilerplate -- don't modify)                           |
| `seed/seed.json`         | Schema definition + demo content (collections, fields, taxonomies, menus, widgets) |
| `emdash-env.d.ts`        | Generated types for collections (auto-regenerated on dev server start)             |
| `src/layouts/Base.astro` | Page shell -- top bar, masthead, three-column grid, footer, EmDash wiring          |
| `src/styles/theme.css`   | Design tokens and shared primitives (panels, bevels, kickers, animations)          |
| `src/components/`        | Shared markup -- rails, widget renderer, piece card, image frame                   |
| `src/pages/`             | Astro pages -- all server-rendered                                                 |

## Skills

Agent skills are in `.agents/skills/`. Load them when working on specific tasks:

- **building-emdash-site** -- Querying content, rendering Portable Text, schema design, seed files, site features (menus, widgets, search, SEO, comments, bylines). Start here.
- **creating-plugins** -- Building EmDash plugins with hooks, storage, admin UI, API routes, and Portable Text block types.
- **emdash-cli** -- CLI commands for content management, seeding, type generation, and visual editing flow.

## Documentation

The EmDash docs are available as an MCP server at `https://docs.emdashcms.com/mcp`. When you need to verify an API, hook, config option, field type, or pattern, call `search_docs` against the live documentation rather than relying on training-data recall. The docs reflect current behaviour; assumptions may not.

This template ships with `.mcp.json`, `.cursor/mcp.json`, and `.vscode/mcp.json` so Claude Code, Cursor, and VS Code auto-discover the docs server. Other tools (OpenCode, Windsurf, etc.) need a manual one-time setup -- see [docs.emdashcms.com/docs-mcp](https://docs.emdashcms.com/docs-mcp).

## Rules

- All content pages must be server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- Always call `Astro.cache.set(cacheHint)` on pages that query content.
- Taxonomy names in queries must match the seed's `"name"` field exactly (e.g., `"category"` not `"categories"`).
- `seed/seed.json` only applies to an EMPTY database. A collection or field added to it
  never reaches a site that already has content -- use `pnpm schema:push` for that. It
  reads the seed, diffs it against a running site, and creates only what is missing.
- `pnpm-workspace.yaml` sets `better-sqlite3: false`, so `npx emdash seed` cannot open a database. Seed by starting the dev server, which applies `seed/seed.json` and regenerates `emdash-env.d.ts`. Do not flip that flag -- it is a deliberate supply-chain setting.
- Custom design tokens go in `theme.css` as global classes; per-page layout goes in that page's scoped `<style>` block.

## Pushing a schema change to a live site

`seed/seed.json` only ever runs against an empty database, on the first request after
setup completes. It is the starting shape, not a migration -- a collection added to it
reaches a fresh database and never an existing one, with no warning either way.

`pnpm schema:push` closes that gap. It reads the seed, diffs it against a running
site's schema over the REST API, and creates what is missing.

```bash
pnpm schema:push --url https://faustinajohnson.com --dry-run   # show the plan
pnpm schema:push --url https://faustinajohnson.com             # apply it
pnpm content:push --url https://faustinajohnson.com            # create the seed's entries
npx emdash types --url https://faustinajohnson.com             # refresh the types
```

`schema:push` creates collections and fields, never entries, so a collection it adds
to a live site arrives empty. `content:push` fills it: it creates any seed entry whose
slug is missing and publishes the ones the seed marks published. Both only ever add --
an entry already there keeps whatever it has been reworded to, and a row the seed no
longer carries is left in place.

It only ever adds. A collection or field the live site has and the seed does not is
left alone; a field whose type has drifted is reported, not corrected. A collection
whose `supports` include `search` also gets its index built -- creating a collection
over the API records the support without the `_emdash_fts_<slug>` table behind it, so
it would otherwise be searchable in name only. Menu links are appended, never
rewritten: `applySeed` deletes a menu's items and rebuilds them from the seed, and
overwrites site settings unconditionally, so this does not use it. Running it twice
is safe.

The credential has to be an **admin**. `schema:manage` is Admin (50); everything an
editor does day to day is 40 or below, which is why `access()` provisions at 40. Pass
`--token` with an `ec_pat_`, or set `EMDASH_HEADERS` to the Cloudflare Access service
token pair, since the admin sits behind Access.

`npx emdash migrate` is a different thing and does not replace this: it applies
EmDash's own core migrations at deploy time, and explicitly not user content models.

## Admin login

The admin is behind Cloudflare Access rather than passkeys: `astro.config.mjs`
passes `auth: access({ ... })` to `emdash()`, which bakes the team domain and
the AUD tag into the worker at build time. That is unconditional -- there is no
dev variant of the config.

Locally, go in through the dev-bypass URL rather than `/_emdash/admin`, which
sends an anonymous visitor to the real Access login.

Both values are literals in `astro.config.mjs`, and `CF_ACCESS_TEAM_DOMAIN` /
`CF_ACCESS_AUD` override them from `.env` or the shell -- that is what
`.env.example` is for. Neither is a secret, and they only ever change when the
Access application does.

They are deliberately not in `wrangler.jsonc`. `vars` there is the worker's
runtime environment, and nothing reads these at runtime: `access()` consumes
them while the worker is being built, and a Cloudflare build container is
handed no `vars` at all. Putting them there is what broke two deploys.

Setting up the Access application, the role model, and how people are added
are in [docs/auth.md](docs/auth.md).

## Cloudflare bindings

`wrangler.jsonc` declares four bindings, and the adapter logs two of them on every
dev start. Those lines are informational, not warnings.

| Binding   | Kind   | What it is for                                                    |
| --------- | ------ | ----------------------------------------------------------------- |
| `DB`      | D1     | All content, schema, menus, widgets                               |
| `MEDIA`   | R2     | Where EmDash stores uploaded files                                |
| `IMAGES`  | Images | Cloudflare Images, which `astro:assets` calls to transform images |
| `SESSION` | KV     | Astro sessions, which the Cloudflare adapter enables by default   |
| `LOADER`  | Worker | Plugin sandboxing                                                 |

`MEDIA` and `IMAGES` are complementary, not alternatives: R2 holds the original
file, Cloudflare Images resizes and re-encodes it on the way out. Set
`cloudflare({ imageService: "compile" })` in `astro.config.mjs` to opt out of the
Images binding.

Dev runs against local miniflare state. `wrangler deploy` targets the real D1 and
R2 by name. Adding `"remote": true` to a binding points dev at the live resource --
useful for debugging production data, but it means seeding writes to production.

## Custom domains are not in wrangler.jsonc

`wrangler deploy` does not read this project's `wrangler.jsonc` directly. The
Cloudflare Vite plugin writes `.wrangler/deploy/config.json`, which redirects
wrangler to a generated `dist/server/wrangler.json`. That generated file carries
bindings, vars, triggers and `account_id`, but **drops `routes` and
`workers_dev`** -- so adding routes here does nothing and `wrangler deploy` still
exits 0. It is a silent no-op, not an error.

`faustinajohnson.com` and `www` are attached to the Worker itself (Workers ->
Settings -> Domains & Routes), which is where Cloudflare keeps custom domains
anyway: they persist across deploys and do not need to be redeclared. Change
them there, not here.


## This Site

Faustina Johnson's writer portfolio. The design was imported from the Claude Design
canvas project `Writer Portfolio.dc.html` and lives in `theme.css` plus the
components under `src/components/`.

The home page is the design: one scrolling page with a masthead, a bio block, the
long-form pieces, the method tenets, the field notes list, and a correspondence
call to action. Every other route reuses the same shell.

## Pages

| Page          | Path               | What it shows                                          |
| ------------- | ------------------ | ------------------------------------------------------ |
| Home          | `/`                | Bio, The Work, Method, Field Notes, Correspondence     |
| All pieces    | `/posts`           | Every piece, plus live search across the site          |
| Piece detail  | `/posts/[slug]`    | One long-form piece                                    |
| Field notes   | `/notes`           | Every field note, newest first                         |
| Note detail   | `/notes/[slug]`    | One field note                                         |
| Images        | `/images`          | Every image entry, newest first                        |
| Image detail  | `/images/[slug]`   | One image entry -- main image, MIDI, gallery           |
| Page          | `/[slug]`          | A standalone page (e.g. `/about`, `/method`)           |
| Category      | `/category/[slug]` | Pieces filtered by category                            |
| Tag           | `/tag/[slug]`      | Pieces filtered by tag                                 |

## Schema

- `posts` (labelled "Pieces"): `title`, `kicker`, `featured_image`, `content` (Portable Text), `excerpt`.
  `kicker` is the monospace line above the title, e.g. `i - field report - 9,400 words - the valley`.
- `notes` (labelled "Field Notes"): `title`, `note_date` (datetime), `content`.
  `note_date` drives both the printed dateline and the sort order.
- `tenets` (labelled "Method"): `title`, `numeral`, `body`, `sort_order`. Three entries render the Method grid.
- `images`: `title`, `image` (required, the one every preview uses), `caption`, `location`,
  `taken_on` (datetime, the sort key), `midi` (file), `gallery` (repeater of image + caption).
  One entry is one subject, not one file: the extra views live in `gallery` and show only
  on the entry's own page.
- `pages`: `title`, `kicker`, `portrait` (image), `content`.
  `/about` supplies the home page bio; `/method` supplies the Method heading and pull quote;
  `/correspondence` supplies the closing block.
- `snippets`: `title`, `body`, `group`, `sort_order`. One short piece of copy per entry,
  read by slug. `footer-tagline` and `footer-signoff` are the two lines at the foot of
  every page. `group` and `sort_order` are indexed, for chrome that renders a list.
- Taxonomies: `category` (hierarchical), `tag`.
- Menus: `primary` ("the rooms" nav) and `correspondence` (the two closing buttons).

Site settings hold only `title` and `tagline` -- EmDash's settings schema is fixed and
does not take custom fields.

## Chrome

The decorative rails are widget areas, so they are editable in the admin UI:

| Area        | Where          | Holds                                                  |
| ----------- | -------------- | ------------------------------------------------------ |
| `marquee`   | Top bar        | Ticker lines -- one paragraph per item                 |
| `rail-left` | Left column    | The candle                                             |
| `rail`      | Right column   | Now playing, On the desk, Appeared in, From the field  |

`site:field-photos` ("From the field") renders the four newest `images` entries.

`WidgetRenderer.astro` dispatches on `componentId`. Custom components are prefixed
`site:` (`site:candle`, `site:now-playing`, `site:publications`, `site:field-photos`);
the `core:` widgets EmDash ships with are handled too.

A component widget's props go by three different names, which is easy to get wrong:

| Where            | Key               |
| ---------------- | ----------------- |
| `seed/seed.json` | `props`           |
| Runtime `Widget` | `componentProps`  |
| D1 column        | `component_props` |
| REST API body    | `componentProps`  |

The seeder silently drops any other key -- the original starter seed used `settings`,
so its widget props never reached the database. If a rail block renders its title but
no content, check this first.

## Visual character

Dark, candlelit, letterpress. IM Fell English SC for display and IM Fell English for
body, self-hosted through Astro's `fonts` config and bound to `--font-display` and
`--font-body`. Courier New carries every small uppercase label.

Panels use a two-tone bevel: `.panel` is lit from the top-left and reads as raised,
`.panel--sunk` inverts the border colours and reads as pressed in. Ember red
(`--ember`) marks kickers and accents; amber glows breathe behind the masthead and
the correspondence block.

Every animation is held at its resting frame under `prefers-reduced-motion: reduce`.
The masthead flicker in particular must stay behind that guard.

## What to do here

- Add a piece, a note, or a tenet through the admin UI -- the home page picks it up.
  The Work heading counts its own entries ("Four Pieces") and derives its year range.
- Reuse `.panel`, `.panel--sunk`, `.frame`, `.kicker`, `.chip`, and `.btn` from
  `theme.css` rather than restyling from scratch.
- Add a new rail block as a `site:`-prefixed component widget plus a branch in
  `WidgetRenderer.astro`.

## What not to do

- Don't put colour literals in page styles. Every colour has a token in `theme.css`.
- Don't add a fifth animation without a reduced-motion fallback.
- Don't reach for custom site settings -- EmDash has no such extension point. Use a
  widget area or a `pages` entry.
- Don't set `autoProvision: false` on `access()`. Nothing else in EmDash creates a
  user row, so it locks out everyone who isn't already in the database.
