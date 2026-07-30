# ADR-0011: cookieHelper — secure-by-default attributes, encoded values, no HttpOnly claim

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §2 item 23 (F23), ADR-0004 (TypeError contract), ADR-0005 (hand-rolled scan precedent), ADR-0010 (storage subpath contract), ROADMAP 6.2

## Context

`cookieHelper` writes `document.cookie`, a string-concatenation API with no structure and no
escaping. Everything that makes a cookie safe or unsafe is expressed as an attribute in that
string, which means **the defaults a helper chooses _are_ its security posture**: a caller
who writes `cookieHelper.set('session', token)` and thinks no further inherits whatever the
library decided about `SameSite`, `Secure`, `Path`, and `Domain`.

Three specific hazards shape the design:

1. **Attribute injection.** `document.cookie = name + '=' + value` with an unescaped value
   lets `value = 'x; Domain=evil.example'` graft a real attribute onto the cookie. Values
   frequently come from user or server data.
2. **Surprising platform defaults.** Omitting `Path` does not mean "site-wide": the browser
   defaults to the *current directory*, so a cookie written on `/admin/page` is invisible on
   `/`. Omitting `SameSite` means modern browsers apply `Lax`, but older ones apply `None`
   semantics — leaving it implicit makes CSRF exposure browser-dependent.
3. **The `HttpOnly` illusion.** v1 of the intake spec claimed `HttpOnly` support, and the
   spec itself records this as *factually wrong*: `HttpOnly` cookies are invisible to
   client-side JavaScript **by design**. No library running in a page can read or set them.

## Decision

**Secure-by-default attributes, always explicit:**

- `SameSite=Lax` by default — CSRF mitigation that still allows top-level navigation.
  Accepted case-insensitively; `'None'` is **refused unless `Secure` is also in effect**,
  because browsers silently reject that combination and the caller would otherwise believe
  a cookie was set that never was.
- `Secure` **inferred from the page**: on by default when `location.protocol === 'https:'`,
  off on `http:` so `http://localhost` development works. An explicit `secure` value always
  wins in both directions. If reading `location` throws, HTTPS is treated as unproven — the
  flag is omitted and `SameSite=None` is refused.
- `Path=/` by default — the site-wide scope callers actually expect, stated explicitly
  rather than inheriting the current-directory default.
- `Domain` **omitted** by default — host-only is the narrower scope; a `Domain` attribute
  *widens* a cookie to subdomains, so it must be asked for.

**Injection is prevented structurally, not by filtering.** Names are validated as RFC 6265
`token`s by a hand-rolled character scan (no regex — ADR-0005 house style), rejecting control
characters, space, and every separator `()<>@,;:\"/[]?={}`. Names and values are then
`encodeURIComponent`-encoded, so `;`, `,`, CR and LF cannot survive into a delimiter
position: a crafted value is stored **as data** and read back verbatim. `path` and `domain`
are attribute values the caller controls directly, so they are rejected if they contain `;`.
This is asserted as a property (any value, adversarial or arbitrary, yields exactly the
caller's attribute list — never more).

**`HttpOnly` is refused with a `TypeError`, not ignored.** Silently dropping the option would
let a caller believe they got a protection they did not; the error names the reason and points
at `Set-Cookie` on the server. `httpOnly: false` is refused too — the option does not exist
on this surface.

**Outside a browser, every operation no-ops with a one-time `console.warn`** (spec F23):
`get`/`getAll` return `undefined`/`{}`, `set`/`remove` do nothing, `isSupported()` reports the
mode. The warning fires **once per process**, not per call, so a server-rendered app does not
flood its logs. Argument validation still runs in Node — a malformed name throws there too,
so bugs surface in SSR rather than only in the browser.

**Reads never throw.** A value this library did not write may contain a raw `%` that is not a
valid escape; `decodeURIComponent` raises `URIError` on those, so an undecodable component is
returned verbatim. `getAll()` returns a **null-prototype** object, so a cookie named
`__proto__` is an ordinary entry rather than a prototype mutation (the `groupBy`-returns-`Map`
reasoning, applied here).

## Consequences

- The safe thing is the default: a caller who passes no attributes gets `Lax`, site-wide
  scope, host-only, and `Secure` on HTTPS. Widening scope or relaxing `SameSite` is a
  visible, deliberate argument.
- Values round-trip exactly, including delimiters and unicode, because both directions
  percent-code. Cookies written by a server (unencoded) still read correctly, since decoding
  falls back to the raw text.
- Cookie **size** is not policed: percent-encoding expands values, and the ~4 KB per-cookie
  browser limit is silently enforced by the browser (an oversized `document.cookie` write is
  simply dropped). Surfacing that would require reading the cookie back after every write; it
  is documented as a non-goal here rather than half-solved.
- `Expires` is not offered — `Max-Age` (seconds) expresses the same intent without date
  formatting and clock-skew questions. Deletion goes through `remove`, which writes
  `Max-Age=0` and forwards `path`/`domain`, since a delete only lands when those match the
  original write.
- Real-browser verification across Chromium/Firefox/WebKit is roadmap **6.4** (Playwright);
  until then the contract is proven against a `document.cookie` accessor fake that models
  the platform's read/write asymmetry (writes take attributes, reads never echo them).

## Alternatives considered

- **Pass attributes through verbatim, no defaults** — "unopinionated", but it makes every
  call site responsible for CSRF posture and inherits the current-directory `Path` surprise.
  Rejected: F23 exists to make the safe choice the easy one.
- **Filter dangerous characters out of values** (strip `;`, CR, LF) — silently corrupts data
  and is a blocklist, the same class of mistake ADR-003 rejects for HTML sanitization.
  Encoding preserves the value *and* removes the hazard.
- **Support `HttpOnly`** — impossible from a page; claiming it would be the security lie the
  spec explicitly removed from v1.
- **Default `SameSite=Strict`** — stronger, but it breaks the ordinary case of following a
  link back into the site and would push callers to disable it wholesale. `Lax` is the
  defensible default; `Strict` is one argument away.
- **Always set `Secure`** — correct on HTTPS, but silently breaks `http://localhost`
  development, which teaches callers to pass `secure: false` everywhere. Inferring from the
  page keeps production safe without that habit.
- **Warn on every no-op call in Node** — noisy enough in SSR to be filtered out and ignored,
  which defeats the purpose. One warning per process is the signal without the flood.
