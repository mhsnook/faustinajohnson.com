This is an EmDash site -- a CMS built on Astro with a full admin UI.

## Commands

```bash
pnpm build && pnpm preview         # Run the site -- see "Use astro preview" below
pnpm build:local && pnpm preview   # Same, with a reachable admin UI
npx emdash types                   # Regenerate TypeScript types from a running site

pnpm typecheck                     # astro check
pnpm lint                          # oxlint            (--fix available as lint:fix)
pnpm format                        # oxfmt + prettier  (format:check to check only)
pnpm test                          # vitest run        (test:watch to watch)
```

`pnpm dev` starts, serves one request, and then wedges. Use `pnpm preview`.

The admin UI is at `http://localhost:4321/_emdash/admin`, and reaching it locally
takes `pnpm build:local` -- a plain `pnpm build` expects a Cloudflare Access JWT
that a local preview never has. See "Admin login: Cloudflare Access" below.
Under `build:local`, `/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`
signs you in as an admin without a passkey.

### Use `astro preview`, not `astro dev`

`astro dev` is currently unusable on this stack (emdash 0.35.0 + astro 7.2.9 +
@astrojs/cloudflare + workerd). It serves the first request and then hangs or 500s
every request after, while burning 50-90% CPU. Measured on the same worker, same
D1, same bindings:

| | `astro dev` | `astro preview` |
| --- | --- | --- |
| First request | 200 in 7.0s | 200 in 0.22s |
| Second request | hang, then 500 | 200 in 0.09s |
| Later requests | dead | 200 in ~0.09s |
| Idle CPU / RSS | 53-90% / 1.1-2.1GB | 34% / 544MB |

So the working loop is a rebuild, which costs about ten seconds:

```bash
pnpm build:local && pnpm preview          # localhost:4321
pnpm build:local && pnpm preview --host   # also on the LAN
```

There is no HMR. Rebuild to see a change.

### The upstream bug

`astro dev` serves its first request and then hangs, silently -- no error, no
panic, nothing in the log after the first `[200] /`. That is
**emdash-cms/emdash#2626** (open): `getBackend()` parks its in-flight init promise
on a `globalThis` singleton and never clears it if the request that started it is
cancelled, so every later request in the isolate awaits a promise that will never
settle. Affects 0.34.0 through 0.36.0.

Two related issues are already handled and need no workaround here:

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
- **emdash-cms/emdash#2572** (open) -- the admin stylesheet 500s under `astro dev`
  (`vite:oxc` parse error on the `?direct` CSS request), so the admin UI is
  unstyled in dev.

### Seeding a fresh database

Content seeds when setup completes, and the dev-bypass endpoint that completes it
is dev-only. `astro dev` reliably serves exactly one request, which is enough:

```bash
npx astro dev
curl -L "http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin"
npx astro dev stop
pnpm build:local && npx astro preview --host 0.0.0.0
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
gzipped** on Workers Paid. It currently sits at about 2.9 MB, and the gate fails
at the limit whatever the delta.

### Two formatters, and one trap

oxfmt cannot parse `.astro` ([oxc#19715]), so Prettier with
`prettier-plugin-astro` formats the 24 `.astro` files and oxfmt formats
everything else. `.prettierignore` is what keeps them apart -- it ignores
everything except `.astro`.

That file is also the trap. **oxfmt reads `.prettierignore` by default**, so
without an explicit `--ignore-path .gitignore` it inherits "ignore everything
but `.astro`", formats nothing, reports no drift, and the check passes forever.
Both `package.json` and `.github/ci/collect-static.sh` pass that flag. Keep it.

Prettier only reaches the frontmatter and `<style>` blocks of an `.astro` file
plus its markup; Biome was the alternative and formats the frontmatter only.

[oxc#19715]: https://github.com/oxc-project/oxc/issues/19715

### Pre-existing drift

`seed/seed.json`, `src/styles/theme.css` and `wrangler.jsonc` are unformatted
and deliberately left that way -- reformatting them is a large diff with no
reader. They clear whenever someone edits them. Markdown is excluded outright
(`**/*.md`): the prose here is hand-wrapped, and oxfmt rewrites list
continuations in it.

`.agents/` and `.github/ci/` are excluded from both the linter and the
formatter, and `emdash-env.d.ts` and `worker-configuration.d.ts` are generated.

## Key Files

| File                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`       | Astro config with `emdash()` integration, database, and storage                    |
| `src/live.config.ts`     | EmDash loader registration (boilerplate -- don't modify)                           |
| `seed/seed.json`         | Schema definition + demo content (collections, fields, taxonomies, menus, widgets) |
| `emdash-env.d.ts`        | Generated types for collections (auto-regenerated on dev server start)             |
| `src/layouts/Base.astro` | Page shell -- top bar, masthead, three-column grid, footer, EmDash wiring          |
| `src/styles/theme.css`   | Design tokens and shared primitives (panels, bevels, kickers, animations)         |
| `src/components/`        | Shared markup -- rails, widget renderer, piece card, image frame                  |
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
- `pnpm-workspace.yaml` sets `better-sqlite3: false`, so `npx emdash seed` cannot open a database. Seed by starting the dev server, which applies `seed/seed.json` and regenerates `emdash-env.d.ts`. Do not flip that flag -- it is a deliberate supply-chain setting.
- Custom design tokens go in `theme.css` as global classes; per-page layout goes in that page's scoped `<style>` block.

## Admin login

The admin is behind Cloudflare Access rather than passkeys: `astro.config.mjs`
passes `auth: access({ ... })` to `emdash()`, reading `CF_ACCESS_TEAM_DOMAIN`
and `CF_ACCESS_AUD` from `.env` at build time and baking them into the worker.
`pnpm build` refuses to run without them.

`pnpm build:local` sets `EMDASH_LOCAL_AUTH=1`, which drops `auth` from the
config and restores passkeys plus the dev-bypass endpoint. That is the only way
to reach the admin under `astro preview`, since the Access JWT never gets there.

Setting up the Access application, its path scoping, the identity and role
model, and how people are added are all in [docs/auth.md](docs/auth.md).

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
| Page          | `/[slug]`          | A standalone page (e.g. `/about`, `/method`)           |
| Category      | `/category/[slug]` | Pieces filtered by category                            |
| Tag           | `/tag/[slug]`      | Pieces filtered by tag                                 |

## Schema

- `posts` (labelled "Pieces"): `title`, `kicker`, `featured_image`, `content` (Portable Text), `excerpt`.
  `kicker` is the monospace line above the title, e.g. `i - field report - 9,400 words - the valley`.
- `notes` (labelled "Field Notes"): `title`, `note_date` (datetime), `content`.
  `note_date` drives both the printed dateline and the sort order.
- `tenets` (labelled "Method"): `title`, `numeral`, `body`, `sort_order`. Three entries render the Method grid.
- `pages`: `title`, `kicker`, `portrait` (image), `content`.
  `/about` supplies the home page bio; `/method` supplies the Method heading and pull quote;
  `/correspondence` supplies the closing block.
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
