# hostineer-api-authentication

How to correctly authenticate to apnscp/Hostineer's SOAP control-panel API.

**Provider-specific, organization-agnostic.** This repo is scoped to the hosting
provider (Hostineer, running the apnscp/Launchpad control panel), not to any
one organization that happens to host there. If you're the second
organization to discover this the hard way, that's the failure mode this
repo exists to prevent.

## The short version

apnscp does not authenticate via an `Authorization` header. It authenticates
via an `?authkey=<key>` query parameter on the endpoint URL:

```
https://<host>:2083/soap?authkey=<key>
```

## Credential-display boundary

Do not browse to any page that could normally render a plaintext credential.
Hostineer Launchpad API Keys is specifically prohibited. Credentials must move
only as masked workflow inputs or sealed stdin handoffs; they are never a page
to inspect, a terminal value to print, or a log field. The generic provider
rotation operation lives in
[`Agents-Of/Hostineer.com`](https://github.com/Agents-Of/Hostineer.com): it
updates a named GitHub secret, verifies the replacement, and revokes the old
key without emitting either value.

See [`SKILL.md`](SKILL.md) for the full finding, how it was verified, and
how to get `beacon` (Hostineer's real scripting CLI) running when it isn't
already present — install it, don't just treat it as unavailable and fall
back to hand-rolled SOAP. See
[`examples/authkey-soap-call.js`](examples/authkey-soap-call.js) for a
minimal, actually-tested working demonstration of the fallback for when you
genuinely have no PHP runtime to run `beacon` at all.

## What doesn't belong here

Any organization's specific hostnames, secret names, database names, or
rotation/deployment scripts. Those belong in that organization's own ops
repo, with a pointer back to this repo for the authentication mechanism
itself. See `PlayFieldMultiplier/skill-of-secure-credential-automation` for
an example of that split done correctly (a real WordPress-on-Hostineer
implementation, org-specific, built on top of the mechanism documented
here).

## Related

- [`SKILL-OF/secure-credential-automation`](https://github.com/SKILL-OF/secure-credential-automation) —
  general-purpose secure-credential-handling patterns (age encryption,
  GitHub Actions secret rotation), not specific to any provider.
- [`apisnetworks/Beacon`](https://kb.hostineer.com/control-panel/scripting-with-beacon/) —
  Hostineer's own scripting CLI, and the reference implementation this
  repo's finding was confirmed against.
- [`Agents-Of/Hostineer.com`](https://github.com/Agents-Of/Hostineer.com) —
  the provider-wide *operating contract* (declarative stories, read-only
  plan, apply tokens, verify-by-readback) built on top of the auth mechanism
  documented here. That repo owns the mutation-safety layer; this one owns
  getting authenticated and knowing the real method signatures. Cross-link,
  not a duplicate — read both.
- Real apnscp API docs (the actual per-module method reference, always
  check before guessing a method name or assuming a capability doesn't
  exist): https://api.apnscp.com/ / https://api.hostineer.com/docs/ (mirrors).
