# Admin authentication

The admin is behind Cloudflare Access. Access authenticates at the edge and
issues a JWT; EmDash verifies it on every `/_emdash` request and matches it to
a user by email. No second login, and passkeys are off.

`astro.config.mjs` wires this up by passing `auth: access({ ... })` to
`emdash()`, so the team domain and the AUD tag must be available to the build.
Both are written as literals in `astro.config.mjs`, so a clone builds with no
setup; `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in the environment or in
`.env` override them, which is how you point a build at a different Access
application.

They do not belong in `wrangler.jsonc` under `vars`. That is the worker's
*runtime* environment, and these are read while the worker is being built.

- Your team domain is one like `yourteam.cloudflareaccess.com`; find it in your
  location bar or under `Zero Trust → Settings`.
- For `CF_ACCESS_AUD`, you go to `Zero Trust → Access` and create a new
  Application. The tag is then under `Applications → the app → Application
  Audience (AUD) Tag`.

Neither is a secret.

## The Access application

One self-hosted application over the site, and its destination decides how much
of the site it covers. Pointed at the bare hostname it also serves as the
private-preview gate; narrowed to `faustinajohnson.com` + path `_emdash/admin`
it leaves the public site open and still supplies the admin's identity. The AUD
belongs to the application and survives that edit, so switching between the two
needs no change to `.env` and no redeploy.

Keep it to one application on this hostname. A second would issue JWTs under a
different AUD, and only one of them can match `CF_ACCESS_AUD`.

## Roles

`defaultRole` in `astro.config.mjs` sets what a newly seen identity is
provisioned as. It is currently 50, the highest: Admin.

| Level | Role        |
| ----- | ----------- |
| 10    | Subscriber  |
| 20    | Contributor |
| 30    | Author      |
| 40    | Editor      |
| 50    | Admin       |

The role is written once, at provisioning, so a change made in the EmDash admin
afterwards sticks. Disabling a user there is a real revocation — 403 even with
a valid JWT.

## Adding people

Add them to the Access policy; they are provisioned on their first visit.
EmDash's own invite flow is passkey registration, so it has no role here.

## Local development

The Access JWT never reaches a local server, so `astro.config.mjs` drops `auth`
whenever `NODE_ENV` is `development`, which restores passkeys plus the
dev-bypass endpoint. `astro dev` sets that itself; a production build does not,
so serving one locally still takes `EMDASH_LOCAL_AUTH=1` via `build:local`:

```bash
pnpm dev                            # or: pnpm build:local && pnpm preview
# then: /_emdash/api/setup/dev-bypass?redirect=/_emdash/admin
```

### Passkeys on localhost

The dev-bypass endpoint signs you in without a passkey, which is what you want
most days. Exercising the passkey flow itself -- registering one, or signing in
with one -- takes one more step.

`wrangler.jsonc` pins `EMDASH_SITE_URL` to `https://faustinajohnson.com` so
outbound links keep pointing at the real site. The `nodejs_compat` flag puts
`vars` on `process.env`, so a local server reads that pin as well, and EmDash
derives the passkey relying-party ID from it. Registration options then come
back as `rp.id: "faustinajohnson.com"` while the page is served from
`localhost`, and the browser rejects the credential: an RP ID has to match the
origin asking for it.

Override it locally. `.dev.vars` is gitignored and both `astro dev` and
`astro preview` read it:

```bash
cp .dev.vars.example .dev.vars     # EMDASH_SITE_URL="http://localhost:4321"
```

Registration and sign-in then both report `rpId: "localhost"`, which is a valid
RP ID in a secure context, and the flow works end to end.

Two things this does not cover. Use `localhost`, not `127.0.0.1` -- an IP
address is not a valid RP ID. And a passkey registered against `localhost` is
useless from another device over `--host`, since the RP ID will not match and
plain HTTP to a LAN address is not a secure context; serving that over HTTPS
under a hostname, with `EMDASH_ALLOWED_ORIGINS` listing the extra origin, is
the way to reach it.

## The CLI

`emdash login` handles the Access redirect itself, via a cached token from
`cloudflared access token` or a browser flow through `cloudflared access
login <url>`. For unattended use, pass an Access service token:

```bash
emdash login --url https://faustinajohnson.com \
  --header "CF-Access-Client-Id: ..." \
  --header "CF-Access-Client-Secret: ..."
```

API tokens are checked before Access, so an existing bearer token keeps
working untouched.
