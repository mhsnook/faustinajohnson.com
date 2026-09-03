# Admin authentication

The admin is behind Cloudflare Access. Access authenticates at the edge and
issues a JWT; EmDash verifies it on every `/_emdash` request and matches it to
a user by email. No second login, and passkeys are off.

`astro.config.mjs` wires this up by passing `auth: access({ ... })` to
`emdash()`, so the env vars CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be
available to the build.

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

The Access JWT never reaches a local `astro preview`, so `pnpm build:local`
sets `EMDASH_LOCAL_AUTH=1`, which drops `auth` and restores passkeys plus the
dev-bypass endpoint:

```bash
pnpm build:local && pnpm preview
# then: /_emdash/api/setup/dev-bypass?redirect=/_emdash/admin
```

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
