---
name: wallet-passes
description: Apple Wallet (.pkpass) and Google Wallet passes — event tickets, membership and loyalty cards, boarding passes, coupons, "Add to Apple Wallet", "Save to Google Wallet". Use when the brief asks for a wallet pass in any form. Signing credentials come from app Secrets (env vars), never from certificate files on disk — a Stencil app is a Worker and has no filesystem. Covers the exact secret names, the Apple/Google enrolment steps to hand the app builder, and how to sign each format on Workers.
metadata:
  agents: [chat, builder]
---

# Wallet passes

A pass is signed on the server and handed to the phone as a file (Apple) or a link
(Google). Both need credentials the app builder gets from Apple and Google themselves —
there is no platform-provided key, so the feature cannot work until they have enrolled
and set the secrets. Build it anyway; build it so it switches on the moment they do.

## Never read certificates from disk

A Stencil app runs as a Cloudflare Worker with no filesystem. `fs.readFileSync`,
`/private/certs/*.pem`, `path.join(process.cwd(), …)` and anything importing `node:fs`
either fail to bundle or throw at runtime. A route that loads its signing certificate
from a file path can never activate, whatever the app builder does.

`passkit-generator` and most Node wallet libraries are out for the same reason. Read the
credentials from `context.cloudflare.env` and sign with WebCrypto instead.

## The secrets

| Secret | Holds |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer team id (10 characters) |
| `APPLE_PASS_TYPE_ID` | Pass Type ID, e.g. `pass.com.example.tickets` |
| `APPLE_PASS_CERT_B64` | Pass Type ID certificate, base64 DER |
| `APPLE_PASS_KEY_B64` | Its private key, base64 DER, **PKCS#8** |
| `APPLE_WWDR_B64` | Apple WWDR G4 intermediate certificate, base64 DER |
| `GOOGLE_WALLET_ISSUER_ID` | Google Wallet issuer id |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` | Service-account JSON key, minified to one line |

Only ask for the half the brief needs.

**Every value must be a single line.** The Secrets form is a one-line field, so a PEM
pasted whole loses its newlines and silently becomes unusable. Base64 the DER instead —
one line, and `atob` hands you the exact bytes WebCrypto wants, with no PEM parsing:

```ts
const der = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
```

## Type them before you read them

App secrets are not on the generated `Env` type, so `env.APPLE_TEAM_ID` is a type error
until you declare it. Declare them **optional** — genuinely absent until the app builder
sets them — in an app-owned ambient file. Not `app/env.d.ts`: that path is platform-
managed and the sync deletes it.

```ts
// app/lib/app-secrets.d.ts
interface Env {
  APPLE_TEAM_ID?: string;
  APPLE_PASS_TYPE_ID?: string;
  APPLE_PASS_CERT_B64?: string;
  APPLE_PASS_KEY_B64?: string;
  APPLE_WWDR_B64?: string;
}
```

Keep that file free of imports and exports — one `import` turns it into a module and the
declaration stops merging into the global `Env`.

## What to tell the app builder

Secrets live in **Settings → Build → Secrets**. They bake in at deploy time, so setting
one changes nothing until the app is published again. Say this explicitly — a
correctly-set secret that hasn't been redeployed is the most common way this looks
broken.

Getting the credentials is on them, and takes real time.

**Apple** — paid Apple Developer membership ($99/yr) → create a Pass Type ID identifier →
generate a certificate for it and export as `.p12` → download the Apple WWDR G4
intermediate. WebCrypto imports PKCS#8 only, so run the key through `-topk8` — harmless
if it already is, and the difference between working and a DataError if it isn't:

```bash
openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out cert.pem
openssl pkcs12 -in Certificates.p12 -nocerts -nodes -out key.pem

openssl x509 -in cert.pem -outform DER | openssl base64 -A              # APPLE_PASS_CERT_B64
openssl pkcs8 -topk8 -nocrypt -in key.pem -outform DER | openssl base64 -A  # APPLE_PASS_KEY_B64
openssl base64 -A -in AppleWWDRCAG4.cer                                 # APPLE_WWDR_B64
```

**Google** — Google Pay & Wallet Console → request an issuer account (free, approval
takes days) → a Google Cloud service account granted the Wallet API role → download its
JSON key and minify it to one line (`jq -c . key.json`; the private key's newlines are
`\n` escapes inside the JSON string and survive). Pass *classes* must exist before any
pass object can reference them; create them from the Console or the Wallet API.

## Degrade, don't crash

Check for the secrets at the point of use. Absent is the normal day-one state, not an
error:

```ts
const env = context.cloudflare.env;
if (!env.APPLE_PASS_CERT_B64 || !env.APPLE_PASS_KEY_B64) {
  return Response.json(
    { error: "Apple Wallet isn't set up yet — add the pass certificate secrets in Settings → Build → Secrets, then publish a new build." },
    { status: 503 },
  );
}
```

Hide the "Add to Apple Wallet" button when its secrets are missing by passing a boolean
from the loader. Never return a certificate, a key or the service-account JSON to the
client, and never log one.

## Google Wallet — a signed JWT, no library

"Save to Google Wallet" is a link to `https://pay.google.com/gp/v/save/<jwt>`. The JWT is
RS256 signed with the service account's private key, which is PKCS#8 already.

```ts
const sa = JSON.parse(env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON!);
const key = await crypto.subtle.importKey(
  "pkcs8",
  der(sa.private_key.replace(/-----[^-]+-----|\s/g, "")),
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  false,
  ["sign"],
);
const claims = {
  iss: sa.client_email,
  aud: "google",
  typ: "savetowallet",
  origins: [new URL(request.url).origin],
  payload: { eventTicketObjects: [ticketObject] },
};
```

Sign `base64url(header) + "." + base64url(claims)`, then append `"." + base64url(signature)`.

## Apple Wallet — a signed .pkpass

A `.pkpass` is a ZIP containing:

- `pass.json` — `formatVersion: 1`, `passTypeIdentifier`, `teamIdentifier`,
  `serialNumber`, `organizationName`, `description`, and exactly one style key
  (`eventTicket`, `boardingPass`, `coupon`, `storeCard`, `generic`).
- `icon.png` and `icon@2x.png` — mandatory; a pass without them fails to open with no
  useful error.
- `manifest.json` — `{ "<filename>": "<SHA-1 hex>" }` for every other file.
- `signature` — a **detached** PKCS#7/CMS signature over the `manifest.json` bytes, DER
  encoded, made with the pass key and carrying both the pass certificate and the WWDR
  certificate.

Pure-JS and Workers-safe: `bun add fflate pkijs asn1js`. `fflate`'s `zipSync` builds the
archive, `crypto.subtle.digest("SHA-1", bytes)` gives the manifest hashes, and pkijs
`SignedData` produces the detached signature (omit `eContent`, put both certificates in
`certificates`, sign through the WebCrypto engine). Check the pkijs call shapes against
the version you install — its API differs across majors.

Serve the bytes as `application/vnd.apple.pkpass` with a `.pkpass` filename; iOS opens it
straight from an ordinary link.
