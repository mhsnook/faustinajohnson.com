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

Dev-bypass signs you in without a passkey, which is what you want most days.
The passkey flow itself also works locally, with nothing to configure: EmDash
derives the relying-party ID from the request origin, so a server on
`http://localhost:4321` offers `rpId: "localhost"`, which is both a valid RP ID
and a secure context.

Use `localhost` rather than `127.0.0.1` -- an IP address is not a valid RP ID.
A passkey registered against `localhost` is also useless from another device
over `--host`, since the RP ID will not match and plain HTTP to a LAN address
is not a secure context; that needs HTTPS under a hostname, with
`EMDASH_ALLOWED_ORIGINS` listing the extra origin.

### Where outbound links get their origin

Login and recovery mail cannot take the origin from the request, or a spoofed
`Host` header could redirect a login link. EmDash resolves them as
`EMDASH_SITE_URL` (unset here), then the stored `emdash:site_url` option, then
the request URL.

That stored option is written once, when setup completes, from whichever origin
completed it -- `setIfAbsent`, and nothing in EmDash rewrites it afterwards.
Complete setup on the canonical domain. Running it on a `workers.dev` or
preview URL points every future magic link there, and correcting it means
writing the row directly:

```bash
wrangler d1 execute DB --remote \
  --command "update options set value = '\"https://faustinajohnson.com\"' where name = 'emdash:site_url'"
```

Everything else that needs an origin -- passkeys, OAuth, sitemap, robots --
derives it from the request, so each host answers for itself.

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
