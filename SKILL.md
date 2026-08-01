---
name: hostineer-api-authentication
description: Authenticate to apnscp/Hostineer's SOAP control-panel API correctly. The real mechanism is an "?authkey=<key>" query parameter on the endpoint URL — not an HTTP Authorization header of any kind. Provider-specific (Hostineer/apnscp), org-agnostic — applies to any account hosted there, not just one organization.
scope: any agent authenticating to a Hostineer (or other apnscp-based) hosting control panel's SOAP API, for any purpose — password rotation, database management, uptime checks, or any other apnscp method call
trigger: about to write or debug code that calls a Hostineer/apnscp SOAP endpoint (commonly https://<host>:2083/soap), especially if a hand-built Authorization header is involved, an authenticated call is returning 401 despite a fresh/valid API key, or a call is failing/faulting for reasons that look like a wrong or missing parameter
---

# Hostineer / apnscp API Authentication

## The one fact this skill exists to state

apnscp (Hostineer's control-panel API — "apnscp" is Launchpad's old internal
name, still used as the SOAP namespace) does **not** authenticate via an
`Authorization` header of any kind — not `Basic`, not `Bearer`. Every
attempt built that way gets a clean `401` no matter how fresh, valid, or
never-used the API key is.

The real mechanism: an **`?authkey=<key>` query parameter**, appended
directly to the SOAP endpoint URL.

```
https://<host>:2083/soap?authkey=<key>
```

## How this was found

Confirmed by reading the vendor's own reference client
(`apisnetworks/Beacon/Client.php`) — Beacon is Hostineer's real scripting
CLI, and its own source is the authoritative description of how its SOAP
layer actually authenticates. Verified independently, twice, against a real
production endpoint:

1. A WSDL-based PHP `SoapClient`, using `["location" => $endpoint . "?authkey=" . $key]`
   as the client's constructor option, calling a read-only method
   (`common_get_uptime`) — authenticates cleanly.
2. A raw `curl` request with the key embedded in the URL (no WSDL, no
   library) — also authenticates cleanly (confirmed by receiving a normal
   application-level SOAP fault rather than an auth rejection, once past
   the authentication layer).

Both prior attempts using `Authorization: Basic base64("api:" + key)` (a
very natural first guess, since it matches how many other HTTP APIs
authenticate) got a `401` regardless of key validity — that 401 is not
evidence the key is bad.

## Getting past auth is not enough — finding the real method signature matters just as much

Authenticating correctly and then calling the wrong method, or the right
method with the wrong parameters, produces failures that look identical to
an auth problem: an empty response, a fault, or a silently-wrong result.
Two things to know before trusting any method signature:

**The generated docs site (`api.apiscp.com`) is frequently unreachable to
automated agents.** In this environment, WebFetch fails with a domain-wide
TLS trust-chain error (`unable to get local issuer certificate`) on every
`api.apiscp.com` and `kb.apiscp.com` URL tried — confirmed across 5+ distinct
pages, both `http://` and `https://`. `web.archive.org` is separately
blocked entirely. If your agent can't reach these, that's a known tooling
limitation, not evidence the URL is wrong or the content doesn't exist.

**apnscp's actual source is the reliable, more-authoritative alternative,**
and it's on GitLab, not GitHub:
```
https://gitlab.com/apisnetworks/apnscp/-/blob/master/lib/modules/<module>.php
https://gitlab.com/apisnetworks/apnscp/-/raw/master/lib/modules/<module>.php   (raw, fetches cleanly)
```
Module names are lowercase and match the SOAP method prefix (e.g.
`mysql_edit_user` lives in `lib/modules/mysql.php`). If you don't know the
exact filename, list the directory first:
```
https://gitlab.com/api/v4/projects/apisnetworks%2Fapnscp/repository/tree?path=lib/modules&ref=master&per_page=100
```
This is the actual implementation, not a generated summary of it — reading
the real docblock and function body beats a docs-site page even when the
docs site is reachable.

**Read the docblock, not just the method name.** apnscp method docblocks
carry real, non-obvious behavioral warnings. One recurring pattern: a
method taking an `array $opts` parameter (or similar struct) may silently
reset any *omitted* key to a hardcoded server default on every call — not
only when called over SOAP. (Confirmed directly in `mysql.php`'s
`edit_user()`: its own docblock warns about this for SOAP callers
specifically, but the implementation applies the same default-merge to
every caller, transport notwithstanding.) A password-only "partial update"
built without checking this can silently clobber unrelated settings — max
connections, SSL config, whatever else that opts struct covers. Before
writing a partial update through a method like this, find that module's
read/list equivalent (e.g. `mysql_list_users`), read the current row, and
resubmit every field unchanged alongside whatever you actually meant to
change.

## Prefer `beacon` over hand-rolled SOAP/curl entirely — but confirm it's actually there first

Hostineer ships a real CLI for this: **`beacon`**, the scripting companion
to Launchpad. Where it's available, it runs already-authenticated over the
box's own session — no hand-built auth of any kind, no raw SOAP XML, no
risk of a secret ending up in a shell command string at all. This also
sidesteps the struct-encoding problem above: `beacon` already knows how to
serialize array/hash parameters correctly, so a method like `edit_user`
that takes a nested `opts` array doesn't require guessing apnscp's SOAP/WSDL
wire encoding for that struct by hand.

**Read before writing any Hostineer automation**:
https://kb.hostineer.com/control-panel/scripting-with-beacon/

Hostineer's own docs say `beacon` is "preinstalled on all v5+ platforms."
**Don't assume it's present** — check with `which beacon` / `beacon show`
before building anything around it for a given host. It has been observed
missing on at least one real, current-generation Hostineer account.

If `beacon` isn't available and you need a fallback, see
`examples/authkey-soap-call.js` in this repo for a minimal, working
demonstration of the `?authkey=` mechanism via both a WSDL-based client and
raw curl — adapt the method call and body to whatever you actually need to
do; this repo only owns the authentication mechanism, not any particular
organization's rotation/deployment logic built on top of it. For a method
whose parameters include a nested array/struct (like `mysql_edit_user`),
prefer `beacon` over guessing the raw-SOAP encoding of that struct by hand;
if you must fall back to raw SOAP for such a call, verify the encoding
against a read-only call first, and verify the write itself actually did
only what you intended (re-read and diff) before trusting it in production.

## What does not belong in this repo

This repo is scoped to the authentication mechanism only — provider-specific,
organization-agnostic. It does not contain:

- Any organization's specific hostnames, account names, secret names, or
  database names.
- Any organization's actual rotation/deployment scripts (those belong in
  that organization's own ops repo — see, for example,
  `PlayFieldMultiplier/skill-of-secure-credential-automation` for a real
  WordPress-on-Hostineer implementation built on top of this mechanism).
- General secure-credential-handling patterns not specific to Hostineer
  (age encryption, GitHub Actions secret rotation, etc.) — see
  `SKILL-OF/secure-credential-automation` for that.

If you find organization-specific facts creeping into this file, they
belong in that organization's own repo instead, with a pointer back here
for the mechanism itself.
