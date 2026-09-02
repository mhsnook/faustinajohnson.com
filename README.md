# Personal portfolio website

A website built with [EmDash](https://github.com/emdash-cms/emdash), a full-stack TypeScript CMS on Astro, running on Cloudflare Workers. Scaffolded from the EmDash `starter-cloudflare` template: posts, pages, categories and tags with minimal styling, meant as a base to build on.

## What's Included

- Posts with category and tag archives
- Static pages via slug routing
- Seed data with demo content
- D1 database and R2 storage pre-configured
- Dark/light mode support

## Pages

| Page | Route |
|---|---|
| Homepage | `/` |
| All posts | `/posts` |
| Single post | `/posts/:slug` |
| Category archive | `/category/:slug` |
| Tag archive | `/tag/:slug` |
| Static pages | `/:slug` |
| 404 | fallback |

## Infrastructure

- **Runtime:** Cloudflare Workers
- **Database:** D1
- **Storage:** R2
- **Framework:** Astro with `@astrojs/cloudflare`

## Local Development

```bash
pnpm install
pnpm dev
```

The site runs at http://localhost:4321 and the admin UI at
http://localhost:4321/_emdash/admin. On first run EmDash creates the local
database and loads `seed/seed.json`.

Other scripts: `pnpm build`, `pnpm build:local`, `pnpm preview`, `pnpm typecheck`.

## Admin access

The deployed admin sits behind Cloudflare Access, so signing in at the edge is
the only sign-in. It needs `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in
`.env` (see `.env.example`) and one Access application over the site. While the
whole site is private that application covers the bare hostname; when the site
opens up, narrowing it to the `_emdash/admin` path leaves the admin gated and
its AUD unchanged. Locally, `pnpm build:local` swaps back to passkeys so the
admin is reachable without an Access JWT.

Full setup, the identity and role model, and how to add people are in
[docs/auth.md](docs/auth.md).

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
