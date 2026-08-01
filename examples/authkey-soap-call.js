#!/usr/bin/env node
/**
 * Minimal working demonstration of apnscp/Hostineer's real SOAP auth
 * mechanism (?authkey= query parameter), via a raw curl request with no
 * secret ever touching a shell command-line string.
 *
 * This is a *mechanism* demonstration, not a ready-to-run rotation script.
 * Adapt HOSTINEER_ENDPOINT, the SOAP method/body, and how you obtain
 * apiKey to your own use case.
 *
 * Usage:
 *   HOSTINEER_ENDPOINT=https://<host>:2083/soap \
 *   HOSTINEER_API_KEY=<key> \
 *   node authkey-soap-call.js
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const endpoint = process.env.HOSTINEER_ENDPOINT;
const apiKey = process.env.HOSTINEER_API_KEY;

if (!endpoint || !apiKey) {
  console.error('Set HOSTINEER_ENDPOINT and HOSTINEER_API_KEY.');
  process.exit(1);
}

// Any read-only, zero-argument method is a safe way to prove auth works
// before building a real call. common_get_uptime is a reasonable default,
// but confirm the method actually exists on the target account first.
const soapMethod = process.argv[2] || 'common_get_uptime';

const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${soapMethod}/>
  </soap:Body>
</soap:Envelope>`;

// The authkey goes into the curl config file's `url =` directive, not a
// header and not the command line — there is no header for this API, the
// query string itself is the auth, so the whole URL (secret included)
// stays inside a file only curl reads, referenced by path only. This is
// the same "never let the secret become part of the string execSync
// treats as the command" property you'd want for any other credential.
let curlConfigPath;
try {
  const endpointWithAuth = `${endpoint}?authkey=${encodeURIComponent(apiKey)}`;
  curlConfigPath = path.join(os.tmpdir(), `curl-cfg-${Date.now()}`);
  const fd = fs.openSync(curlConfigPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try {
    fs.writeSync(fd,
      `url = "${endpointWithAuth}"\n` +
      `header = "Content-Type: text/xml; charset=utf-8"\n` +
      `header = "SOAPAction: http://apnscp.com/namespaces/apnscp#${soapMethod}"\n`
    );
  } finally {
    fs.closeSync(fd);
  }

  const response = execSync(
    `curl -s -X POST -K "${curlConfigPath}" --data-binary @-`,
    { input: soapRequest, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );

  // Never blindly echo the response: not every apnscp installation's fault
  // handling has been verified not to echo request context back. Confirm
  // it doesn't contain the key before printing anything from it.
  const responseIsCleanOfKey = !response.includes(apiKey);
  const isNonAuthFault = /Fault/i.test(response) && !new RegExp(`${soapMethod}Response`, 'i').test(response);

  if (!responseIsCleanOfKey) {
    console.log('Response withheld: it appears to contain the API key. Response length:', response.length, 'bytes.');
  } else if (isNonAuthFault) {
    // A SOAP fault here (e.g. "Missing parameter", "Unknown method") means
    // authentication SUCCEEDED and you've reached real method processing --
    // it is a normal application-level error, not an auth problem. An auth
    // failure looks different: typically a 401 at the HTTP layer before any
    // SOAP envelope comes back at all.
    console.log('Got a SOAP fault (see below) -- if it is about the method/params rather than credentials, auth worked fine:');
    console.log(response);
  } else {
    console.log('Authenticated. Response:');
    console.log(response);
  }
} finally {
  if (curlConfigPath) {
    try {
      fs.unlinkSync(curlConfigPath);
    } catch (e) {
      console.error(`Warning: failed to delete curl config at ${curlConfigPath}: ${e.message}`);
    }
  }
}
