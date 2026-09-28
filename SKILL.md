---
name: hostineer-api-authentication
description: Authenticate to apnscp/Hostineer's SOAP control-panel API correctly. The real mechanism is an "?authkey=<key>" query parameter on the endpoint URL — not an HTTP Authorization header of any kind. Provider-specific (Hostineer/apnscp), org-agnostic — applies to any account hosted there, not just one organization.
scope: any agent authenticating to a Hostineer (or other apnscp-based) hosting control panel's SOAP API, for any purpose — password rotation, database management, uptime checks, or any other apnscp method call
trigger: about to write or debug code that calls a Hostineer/apnscp SOAP endpoint (commonly https://<host>:2083/soap), especially if a hand-built Authorization header is involved, an authenticated call is returning 401 despite a fresh/valid API key, a call is failing/faulting for reasons that look like a wrong or missing parameter, or `beacon` is missing/not on PATH (it should be installed, not treated as unavailable)
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

**The generated docs site (`api.apnscp.com`, also seen as `api.apiscp.com` —
confirmed both spellings hit the identical failure, so don't waste time
guessing this is a typo problem) is unreachable to at least one real
agent's fetch tooling.** In this environment, WebFetch fails with a
domain-wide TLS trust-chain error (`unable to get local issuer certificate`)
on every URL tried on either spelling, and on `kb.apiscp.com` — confirmed
across 5+ distinct pages, both `http://` and `https://`. `web.archive.org`
is separately blocked entirely. If your agent can't reach these, that's a
known tooling limitation, not evidence the URL is wrong or the content
doesn't exist.

**apnscp's actual source is the reliable, more-authoritative alternative,**
and it's on GitLab, not GitHub:
```
https://gitlab.com/apisnetworks/apnscp/-/blob/master/lib/modules/<module>.php
https://gitlab.com/apisnetworks/apnscp/-/raw/master/lib/modules/<module>.php   (raw, fetches cleanly)
```
This is the actual implementation, not a generated summary of it — reading
the real docblock and function body beats a docs-site page even when the
docs site is reachable.

**A SOAP/beacon method name and its PHP method name are not the same
string — don't grep source for the SOAP name verbatim.** A call like
`mysql_edit_user` or `mysql_store_password` is `<module>_<method>`: the
module name (lowercase, matching a file in `lib/modules/`) is stripped off
as a prefix, and only `<method>` is the actual PHP function name inside
that file. So `mysql_store_password` lives in `lib/modules/mysql.php` as
`function store_password(...)` — **not** `function mysql_store_password`.
Searching a module file for the full SOAP-prefixed name will silently find
nothing and look like the method doesn't exist. If you don't know which
module file a given SOAP method lives in, list the directory first:
```
https://gitlab.com/api/v4/projects/apisnetworks%2Fapnscp/repository/tree?path=lib/modules&ref=master&per_page=100
```
then strip the module prefix before grepping that file for `function
<method>`.

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

## `subdomain_info` returns `false`, not an array, for an account's primary domain

Real incident, 2026-09-27: a preflight check calling
`Web_Module::subdomain_info($host)` before writing to a domain's docroot
worked fine for actual subdomains but threw `SoapFault: ...subdomain_info():
Return value must be of type array, false returned` for the account's own
primary domain.

**Why**: on a standard apnscp/Hostineer account, the **primary domain**
(the one the account itself is created for) is structurally different from
a subdomain added later. Its docroot lives in the account's home folder as
`~/mainwebsite_html` (not `~/<domain>` or `~/public_html`), and is normally
symlinked from `/var/www/<primary-domain>` if the account is set up
correctly. `subdomain_info` is scoped to real subdomain records — it has
nothing to look up for the primary domain and returns `false` rather than
an info array, regardless of whether the domain is live and correctly
configured.

**How to apply**: don't use `subdomain_info` as a universal "does this
domain/path exist and do I own it" preflight check. If the target might be
an account's primary domain, either skip that specific check for it, or use
whatever apnscp method actually covers primary-domain info (check the
account's own site/domain listing method, not the subdomain-specific one) —
and expect the real docroot path to be `~/mainwebsite_html`, not something
derived from the domain name itself.

## Prefer `beacon` over hand-rolled SOAP/curl entirely — install it yourself, don't just give up if it's missing

Hostineer ships a real CLI for this: **`beacon`**, the scripting companion
to Launchpad (source: https://github.com/apisnetworks/beacon). It already
knows how to serialize array/hash parameters correctly, so a method like
`edit_user` that takes a nested `opts` array doesn't require guessing
apnscp's SOAP/WSDL wire encoding for that struct by hand — this is why it's
preferred over raw SOAP/curl at all, not just a convenience.

Hostineer's own docs say `beacon` is "preinstalled on all v5+ platforms."
**Don't assume it's present** — check with `which beacon` / `beacon show`
first. But if it's missing, **install it — don't stop and report it as
unavailable.** This is the single most common failure mode observed in
real agent transcripts working from this skill: an agent finds `beacon`
missing, sometimes even guesses at where it might be installed elsewhere
("it has only ever been installed on machine X"), and stops instead of
just getting it. There is nothing to guess or wait for — installing it
yourself is the intended path, on any machine, every time:

```bash
# One file, ~10MB, bundles all its own PHP dependencies (guzzle,
# symfony/console, etc.) -- no composer, no build step, no admin/root
# rights needed. Only real requirement: PHP 7.4+ or 8.x.
curl -sL -o beacon.phar https://raw.githubusercontent.com/apisnetworks/beacon/master/beacon.phar
php beacon.phar exec --key=<your-api-key> common_get_uptime
```

**`beacon` does not require SSH access to the target account, and does not
need to run "on the box."** It supports full remote operation against any
endpoint, authenticated with the exact same `authkey` this whole skill is
about — via `--endpoint <url>` and `--key <key>` (or `--keyfile <path>` to
keep the key out of argv/process listings, the same discipline you'd apply
to any other secret):

```bash
php beacon.phar exec --endpoint=https://<host>:2083/soap --keyfile=/path/to/keyfile --format=json mysql_list_users
```

Array/hash arguments to `beacon exec` use **one bracket with
comma-separated `key:value` pairs** — confirmed directly in beacon's own
README (`beacon e user_add_user "newuser" "newpassword" "some new user"
'[imap:1,smtp:1]'`). **Not** one bracket per key
(`[key1:val1][key2:val2]`) — that was tried once in a real
implementation built on this skill and was wrong; see the git history of
`PlayFieldMultiplier/skill-of-secure-credential-automation`'s
`examples/wordpress-hostineer-FIXED.js` for exactly what that looked like
and how it was caught (a post-write re-read-and-diff check, since a
partial-looking success is not proof the call did only what was intended).

If you truly cannot get `beacon` running (no PHP runtime available
anywhere, e.g.), see `examples/authkey-soap-call.js` in this repo for a
minimal, working demonstration of the `?authkey=` mechanism via raw
curl/WSDL client — but for any method with a nested array/struct
parameter, verify your raw-SOAP encoding against a read-only call first,
and verify the write itself actually did only what you intended (re-read
and diff) before trusting it in production. Guessing that encoding by hand
is the mistake this whole section exists to help you avoid.

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
