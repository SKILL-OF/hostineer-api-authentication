---
name: hostineer-api-authentication
description: Authenticate to apnscp/Hostineer's SOAP control-panel API correctly. The real mechanism is an "?authkey=<key>" query parameter on the endpoint URL — not an HTTP Authorization header of any kind. Provider-specific (Hostineer/apnscp), org-agnostic — applies to any account hosted there, not just one organization.
scope: any agent authenticating to a Hostineer (or other apnscp-based) hosting control panel's SOAP API, for any purpose — password rotation, database management, uptime checks, or any other apnscp method call
trigger: about to write or debug code that calls a Hostineer/apnscp SOAP endpoint (commonly https://<host>:2083/soap), especially if a hand-built Authorization header is involved, or an authenticated call is returning 401 despite a fresh/valid API key
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

## Prefer `beacon` over hand-rolled SOAP/curl entirely — but confirm it's actually there first

Hostineer ships a real CLI for this: **`beacon`**, the scripting companion
to Launchpad. Where it's available, it runs already-authenticated over the
box's own session — no hand-built auth of any kind, no raw SOAP XML, no
risk of a secret ending up in a shell command string at all.

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
organization's rotation/deployment logic built on top of it.

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
