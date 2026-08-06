---
'egl-utils-js': minor
---

New `egl-utils-js/net` entry (ROADMAP 9.2, spec 02 F29-F32, ADR-0020): `isIpv4`,
`parseIpv4`, `formatIpv4`, `ipv4ToKey`, `ipv4FromKey`, and `subnetMaskFromPrefix`. Strict
IPv4 parsing — four decimal octets, no leading zeros, no `inet_aton` shorthand/octal/hex
forms — so a validity check and the parse that follows it can never disagree, which is the
divergence behind allowlist-bypass bugs. The fixed-width key codec (three zero-padded
digits per octet) makes lexicographic order equal numeric address order and turns
octet-aligned network containment into a `startsWith`. Invalid content returns `null`;
only a wrong argument type throws. The root entry is untouched.
