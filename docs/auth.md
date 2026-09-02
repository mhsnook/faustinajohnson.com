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

Use one application, and change its destination when the site's privacy
changes. The AUD tag belongs to the application and survives edits to its
destinations, so widening or narrowing the reach of the login needs no change
to `.env` and no redeploy.

While the whole site is private:

```
Domain: faustinajohnson.com          (no path)
```

Every request to the site, admin or not, then carries an Access JWT. Public
pages ignore it -- EmDash only runs the Access check on `/_emdash` routes that
are not public -- so the admin is identified throughout, and nothing has to
change on the day the site opens up.

When the site goes public, narrow that same application to the admin path:

```
Domain: faustinajohnson.com    Path: _emdash/admin
```

The path matters from that point on. Two `/_emdash` routes are served to
anonymous visitors: images come from `/_emdash/api/media/file/...` and the
search box on `/posts` calls `/_emdash/api/search`. EmDash treats both as
public routes, so an application still covering all of `/_emdash` -- or the
whole hostname -- would put a login wall in front of the portfolio's own
images.

Check the AUD on the application's Overview tab after any such edit. It should
be unchanged; if it ever is not, update `.env` and redeploy.

### Why the rest of /_emdash needs no application

Access sets the `CF_Authorization` cookie for the whole hostname, and EmDash
reads the JWT from that cookie when the `Cf-Access-Jwt-Assertion` header is
absent. So the admin UI's own fetches to `/_emdash/api/...` carry a verifiable
identity even though no Access application fronts those paths, and an
anonymous request to a private API route arrives with neither header nor
cookie and gets a 401.

The Access application's job is to issue the JWT and to give the login
redirect somewhere to land. Enforcement everywhere else is EmDash's.

### Do not run two applications on this hostname

An application covering the whole site and a second one covering
`_emdash/admin` overlap, and the two mint JWTs with different AUD tags for the
same hostname. EmDash checks the JWT against the single `CF_ACCESS_AUD` it was
built with, so whichever application wrote the `CF_Authorization` cookie last
decides whether the admin works. The symptom is specific: the admin page loads
-- that request carries the header from the application whose path matched --
but every fetch to `/_emdash/api/...` comes back 401, because those fall back
to the cookie.

`wrangler tail` shows it as `[external-auth] Auth error:` with a JWT audience
mismatch. If you need different policies for the public site and the admin,
the site-wide application is the one to retire.

To gate `faustinajohnson-com.workers.dev` as well, add it as another
destination on the same application rather than as a second application.

## Who gets in, and as what

Admission is the Access policy's decision. A valid JWT is enough to be let in,
and if no user matches the identity's email, EmDash creates one on the spot.
Keep the Access policy as narrow as the list of people who should be able to
edit the site.

While one site-wide application is doing both jobs, that policy is also the
list of people who can read the private site -- and with `defaultRole` at 50,
every one of them becomes an EmDash admin the moment they open the admin URL.
Either keep the reader list and the editor list the same until the site goes
public, or lower `defaultRole` first.

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
