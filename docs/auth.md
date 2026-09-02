# Admin authentication

The admin UI is behind Cloudflare Access. Access authenticates at the edge and
issues a JWT; EmDash verifies that same JWT on every `/_emdash` request and
matches it to a user by email. There is no second login, and passkeys are off.

`astro.config.mjs` sets this up by passing `auth: access({ ... })` to
`emdash()`. Everything below is the half that lives in the Cloudflare dashboard.

## Environment

Two values are read at build time and baked into the worker bundle. Copy
`.env.example` to `.env` and fill them in:

| Variable                | Where to find it                                                            |
| ----------------------- | --------------------------------------------------------------------------- |
| `CF_ACCESS_TEAM_DOMAIN` | Zero Trust → Settings → Custom Pages, e.g. `yourteam.cloudflareaccess.com`   |
| `CF_ACCESS_AUD`         | Zero Trust → Access → Applications → the app → Application Audience (AUD) Tag |

Neither is a secret. The AUD tag is a public identifier; the JWT's signature,
checked against `https://<team-domain>/cdn-cgi/access/certs`, is what proves
anything. They live in `.env` rather than in the config file because they
differ per Cloudflare account.

`pnpm build` refuses to run without them, so a deploy cannot quietly ship the
wrong login.

## The Access application

Create a self-hosted application scoped to the admin path:

```
Domain: faustinajohnson.com    Path: _emdash/admin
```

The path matters once the site is public. Two `/_emdash` routes are served to
anonymous visitors: images come from `/_emdash/api/media/file/...` and the
search box on `/posts` calls `/_emdash/api/search`. EmDash treats both as
public routes, so an Access application covering all of `/_emdash` — or the
whole hostname — puts a login wall in front of the portfolio's own images.

Add `faustinajohnson-com.workers.dev` as a second application with the same
path to gate the workers.dev URL too.

### Why the rest of /_emdash needs no application

Access sets the `CF_Authorization` cookie for the whole hostname, and EmDash
reads the JWT from that cookie when the `Cf-Access-Jwt-Assertion` header is
absent. So the admin UI's own fetches to `/_emdash/api/...` carry a verifiable
identity even though no Access application fronts those paths, and an
anonymous request to a private API route arrives with neither header nor
cookie and gets a 401.

The Access application's job is to issue the JWT and to give the login
redirect somewhere to land. Enforcement everywhere else is EmDash's.

## Who gets in, and as what

Admission is the Access policy's decision. A valid JWT is enough to be let in,
and if no user matches the identity's email, EmDash creates one on the spot.
Keep the Access policy as narrow as the list of people who should be able to
edit the site.

What EmDash controls is what happens after that:

| Level | Role        |
| ----- | ----------- |
| 10    | Subscriber  |
| 20    | Contributor |
| 30    | Author      |
| 40    | Editor      |
| 50    | Admin       |

- `defaultRole` in `astro.config.mjs` is the level a newly seen identity is
  provisioned at.
- The role is written once, at provisioning. There is no `syncRoles` here, so
  a role changed in the EmDash admin afterwards sticks.
- Disabling a user in the EmDash admin is a real revocation: a disabled user
  gets a 403 even with a perfect Access JWT.

An identity whose email already belongs to a user lands on that account,
passkey history and all.

`defaultRole` is currently 50, so the first Access login lands as an admin
whether or not it matches an existing account. Lowering it is safe only once
a login has confirmed which account the Access identity resolves to: an
identity provisioned below admin cannot promote itself, and passkeys are not
available to fall back on.

## Adding people

Add them to the Access policy. On their first visit they are provisioned at
`defaultRole` and appear in the EmDash user list, where their role can be
raised or lowered.

EmDash's own invite flow does not work behind Access. An invite writes a token
and mails a link to `/_emdash/admin/invite/accept`, where the invitee
registers a passkey — and passkeys are exactly what Access replaces. The
accept page is also under the Access-protected path, so the invitee has to
pass the Access policy before the token is ever read. Once they have passed
it, provisioning has already happened and the token has nothing left to do.

For the same reason, do not set `autoProvision: false` here. Nothing else in
EmDash creates a user row — there is no "add user" endpoint, only setup,
invite-accept, and this auto-provisioning — so turning it off means no one new
can ever be added.

## Local development

The Access JWT never reaches a local `astro preview`, so a normal build leaves
the local admin answering 401 with no way in. `pnpm build:local` sets
`EMDASH_LOCAL_AUTH=1`, which drops `auth` from the config and restores
passkeys plus the dev-bypass endpoint:

```bash
pnpm build:local && pnpm preview
# then: /_emdash/api/setup/dev-bypass?redirect=/_emdash/admin
```

EmDash also falls back to passkeys under `import.meta.env.DEV`, but that does
not help here — `astro dev` is unusable on this stack, and a preview build is
production as far as that check is concerned.

## The CLI

`emdash login` notices the Access redirect and reaches for a cached token from
`cloudflared access token`, or runs `cloudflared access login <url>` for a
browser flow. For unattended use, create an Access service token and pass its
headers through:

```bash
emdash login --url https://faustinajohnson.com \
  --header "CF-Access-Client-Id: ..." \
  --header "CF-Access-Client-Secret: ..."
```

API tokens are checked before Access on every `/_emdash` request, so an
existing bearer token keeps working untouched.
