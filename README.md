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
