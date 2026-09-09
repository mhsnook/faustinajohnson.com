# Writer portfolio

A writer's portfolio: long-form pieces, field notes, and images from the road.
Built with [EmDash](https://github.com/emdash-cms/emdash), a full-stack
TypeScript CMS on Astro, running on Cloudflare Workers.

It started from the EmDash `starter-cloudflare` template and now carries its own
design — dark and letterpress, set in IM Fell English, with the home page laid
out as one scrolling sequence: masthead, bio, the work, the method, field notes,
and a closing call for correspondence.

## What's Included

- **Pieces** — long-form work, with category and tag archives
- **Field Notes** — short dated entries, newest first
- **Images** — one entry per subject, each with a gallery and an optional MIDI file
- **Method** — three tenets rendered as a grid on the home page
- **Pages** — standalone pages by slug, which also supply the home page's bio,
  method heading, and closing block
- Editable chrome: the marquee and both rails are widget areas
- D1 database and R2 storage pre-configured, with seed data for a fresh install

## Pages

| Page | Route |
|---|---|
| Homepage | `/` |
| All pieces | `/posts` |
| Single piece | `/posts/:slug` |
| Field notes | `/notes` |
| Single note | `/notes/:slug` |
| Images | `/images` |
| Single image | `/images/:slug` |
| Category archive | `/category/:slug` |
| Tag archive | `/tag/:slug` |
| Standalone pages | `/:slug` |
| 404 | fallback |

Every route is server-rendered.

## Infrastructure

- **Runtime:** Cloudflare Workers
- **Database:** D1
- **Storage:** R2, with Cloudflare Images for transforms
- **Framework:** Astro with `@astrojs/cloudflare`

## Local Development

```bash
pnpm install
pnpm dev
```

The site runs at http://localhost:4321 and the admin UI at
http://localhost:4321/_emdash/admin. On first run EmDash creates the local
database and loads `seed/seed.json`.

Other scripts: `pnpm build`, `pnpm preview`, `pnpm typecheck`.

## Admin access

The deployed admin sits behind Cloudflare Access, so signing in at the edge is
the only sign-in. It needs `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in
`.env` (see `.env.example`) and one Access application over the site. Locally,
EmDash falls back to passkeys in dev, so the dev-bypass URL signs you in.

Setting up that application, the identity and role model, and how to add people
are in [docs/auth.md](docs/auth.md).

## Working with migrations

The content model lives in `seed/seed.json` and belongs to the code. Collections
and fields are defined there and pushed to a running site; nobody adds or renames
a field in the admin. The CMS is where the words change, not the shape.

That file only applies to an empty database, on the first request after setup — it
is the starting shape, not a migration. Two scripts carry a change to a site that
already has content, and both only ever add: neither renames, retypes nor deletes.

| Script              | What it does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `pnpm schema:push`  | Creates the collections and fields the site is missing                  |
| `pnpm content:push` | Creates the seed entries whose slug is missing, publishing as the seed says |

Both take `--url`, `--dry-run` to print the plan without sending it, and
`--collection` to narrow the run.

### In dev

Start from nothing — the next `pnpm dev` recreates the database, and the first
request after setup applies the whole seed, schema and content together:

```bash
rm -rf .wrangler
pnpm dev
curl -L "http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/"
```

To rehearse a push against that running site instead, borrow its session cookie:

```bash
COOKIE=$(curl -si "http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/" \
  | grep -i '^set-cookie:' | head -1 | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1)
EMDASH_HEADERS="Cookie: $COOKIE" pnpm schema:push --url http://127.0.0.1:4321 --dry-run
```

### In production

The admin sits behind Access, and schema changes need an admin credential, so the
service token pair goes in `EMDASH_HEADERS`:

```bash
export EMDASH_HEADERS=$'CF-Access-Client-Id: ...\nCF-Access-Client-Secret: ...'
pnpm schema:push  --url https://faustinajohnson.com --dry-run
pnpm schema:push  --url https://faustinajohnson.com
pnpm content:push --url https://faustinajohnson.com
npx emdash types  --url https://faustinajohnson.com
```

Push the schema before merging the code that reads it: both scripts only add, so
the running site ignores a collection it has no templates for, while templates
that arrive before their collection render nothing.

There is one database. `wrangler.jsonc` declares a single D1 id and no preview
database, so a branch's preview deployment reads and writes production data — a
push aimed at a `workers.dev` preview URL migrates the live site.

`npx emdash migrate` is a different thing: it applies EmDash's own core migrations
at deploy time, and explicitly not this site's content model.

## Deploying

One-time setup in your Cloudflare account (names must match `wrangler.jsonc`):

```bash
pnpm exec wrangler d1 create faustinajohnson-com
pnpm exec wrangler r2 bucket create faustinajohnson-com-media
```

Then:

```bash
pnpm deploy
```

Sandboxed plugins use Dynamic Workers, which need a paid Cloudflare plan. To
run without them, remove the `worker_loaders` block from `wrangler.jsonc`.

## See Also

- [EmDash documentation](https://github.com/emdash-cms/emdash/tree/main/docs)
- [EmDash templates](https://github.com/emdash-cms/templates)
