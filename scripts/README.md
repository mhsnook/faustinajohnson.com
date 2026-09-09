# scripts

`seed/seed.json` holds the content model, and it only applies to an empty
database, on the first request after setup — it is the starting shape, not a
migration. These two scripts carry a change to a site that already has content.
Both only ever add: neither renames, retypes nor deletes. Commands and paths are
written from the repository root.

| Script                     | Run with            | What it does                                                                |
| -------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `scripts/dump-schema.mjs`  | `pnpm schema:dump`  | Rewrites the seed's collections from a running site                         |
| `scripts/push-schema.mjs`  | `pnpm schema:push`  | Creates the collections and fields the site is missing                      |
| `scripts/push-content.mjs` | `pnpm content:push` | Creates the seed entries whose slug is missing, publishing as the seed says |

All three take `--url`, `--dry-run` to print the plan without acting on it, and
`--collection` to narrow the run. `schema:dump` also takes `--check`, which writes
nothing and exits non-zero when the site and the seed disagree.

## Changing the shape

Schema changes start in a dev admin and arrive in production as a commit:

```bash
pnpm dev                                                   # shape the collection in the admin
pnpm schema:dump --url http://127.0.0.1:4321               # write it into seed/seed.json
git add seed/seed.json && git commit                       # the change is now the committed truth
pnpm schema:push --url https://faustinajohnson.com --dry-run
pnpm schema:push --url https://faustinajohnson.com
```

The dump only rewrites `collections`. Settings, taxonomies, menus, widget areas
and content stay as committed — they hold copy someone may have reworded on the
live site, and a database is the wrong place to take that from.

Two things to expect. The first dump re-wraps the collections block, because the
seed was hand-written and the dump prints it; the change is formatting only, and
later dumps touch just what changed. And the seed's field order follows the live
`sortOrder`, so reordering fields in the admin shows up as a reordered seed.

`npx emdash export-seed --database <local d1 sqlite>` writes a whole seed, content
included, but only from a local SQLite file, and it drops `titleField` and
`dateField`.

## In dev

Start from nothing — the next `pnpm dev` recreates the database, and the first
request after setup applies the whole seed, schema and content together:

```bash
rm -rf .wrangler
pnpm dev
curl -L "http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/"
```

`--dev-bypass` on the push scripts calls an endpoint emdash 0.36.0 does not serve,
so to reach a running dev site, borrow its session cookie:

```bash
COOKIE=$(curl -si "http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/" \
  | grep -i '^set-cookie:' | head -1 | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1)
EMDASH_HEADERS="Cookie: $COOKIE" pnpm schema:push --url http://127.0.0.1:4321 --dry-run
```

## In production

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
