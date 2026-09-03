# Admin authentication

The admin is behind Cloudflare Access. Access authenticates at the edge and
issues a JWT; EmDash verifies it on every `/_emdash` request and matches it to
a user by email. No second login, and passkeys are off.

`astro.config.mjs` wires this up by passing `auth: access({ ... })` to
`emdash()`.

## Environment

Both values are read at build time. Copy `.env.example` to `.env` and fill
them in:

| Variable                | Where to find it                                                             |
| ----------------------- | ---------------------------------------------------------------------------- |
| `CF_ACCESS_TEAM_DOMAIN` | Zero Trust → Settings → Custom Pages, e.g. `yourteam.cloudflareaccess.com`    |
| `CF_ACCESS_AUD`         | Zero Trust → Access → Applications → the app → Application Audience (AUD) Tag |

Neither is a secret. `pnpm build` refuses to run without them.

Both are compiled into the worker at build time, so setting either as a Worker
variable in the Cloudflare dashboard changes nothing the running code reads. A
dashboard variable edit also builds a new version from the code already
deployed, which means it never ships whatever you last built. `wrangler.jsonc`
carries a copy of both only so the two files agree.

## The Access application

One self-hosted application over the site, and its destination decides how much
of the site it covers. Pointed at the bare hostname it also serves as the
private-preview gate; narrowed to `faustinajohnson.com` + path `_emdash/admin`
it leaves the public site open and still supplies the admin's identity. The AUD
belongs to the application and survives that edit, so switching between the two
needs no change to `.env` and no redeploy.

Keep it to one application on this hostname. A second issues JWTs under a
different AUD, and only one of them can match `CF_ACCESS_AUD`. A path-scoped
application also wins over a site-wide one for the paths it covers, so an admin
page and the `/_emdash/api/*` calls it makes can arrive under two different AUDs.

To count the applications, compare the `kid` in the Access redirect across a
public path and the admin. `kid` is the AUD of whichever application covers that
path:

```bash
for p in / /_emdash/admin /_emdash/api/health; do
  printf '%-22s %s\n' "$p" \
    "$(curl -sS -o /dev/null -w '%{redirect_url}' "https://faustinajohnson.com$p" \
       | grep -oE 'kid=[0-9a-f]{64}' | cut -c5-)"
done
```

One value on every line is correct. Two means two applications.

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

The Access JWT never reaches a local `astro preview`, so `pnpm build:local`
sets `EMDASH_LOCAL_AUTH=1`, which drops `auth` and restores passkeys plus the
dev-bypass endpoint:

```bash
pnpm build:local && pnpm preview
# then: /_emdash/api/setup/dev-bypass?redirect=/_emdash/admin
```

## When the admin shows EmDash's own login

Access let you through and EmDash did not. EmDash falls back to its own login
screen whenever it cannot verify the JWT, and that screen is a dead end here:
passkeys are off, and the email plugin that would send a magic link has to be
activated from inside the admin you cannot reach.

Work through these in order:

1. **Is `CF_ACCESS_AUD` the audience tag?** It is 64 hex characters. A UUID is
   the Application ID, which sits beside it in the dashboard and matches no JWT.
2. **Is there more than one application?** Run the `kid` check above.
3. **Is the corrected build deployed at all?** `npx wrangler versions list`
   prints a source per version. Only `src: wrangler` uploads code; `src: dash`
   is a dashboard edit that reuses the code already running.

`npx wrangler tail` while you load the page shows whether EmDash rejects the
JWT and why.

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
