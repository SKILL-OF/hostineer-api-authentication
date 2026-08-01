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

See [`SKILL.md`](SKILL.md) for the full finding, how it was verified, and
what to do when `beacon` (Hostineer's real scripting CLI) isn't available.
See [`examples/authkey-soap-call.js`](examples/authkey-soap-call.js) for a
minimal, actually-tested working demonstration.

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
