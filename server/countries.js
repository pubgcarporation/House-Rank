// Arc country names that GeoNames / Intl spell differently
const ALIASES = {
  "korea, south": "KR",
  "korea, north": "KP",
  "russian federation": "RU",
  "viet nam": "VN",
  "congo, democratic republic of the": "CD",
  "congo, republic of the": "CG",
  "cote d'ivoire": "CI",
  "czech republic": "CZ",
  turkey: "TR",
  "saint kitts and nevis": "KN",
  "saint vincent and the grenadines": "VC",
  "myanmar (burma)": "MM",
  "united states of america": "US",
  "palestine": "PS",
  "macedonia": "MK",
  "swaziland": "SZ",
  "the gambia": "GM",
  "bahamas, the": "BS",
  "gambia, the": "GM",
  us: "US",
  burma: "MM",
  macau: "MO",
  "west bank": "PS",
  "curaçao": "CW",
  "micronesia, federated states of": "FM",
  "saint helena, ascension, and tristan da cunha": "SH",
};

export const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const regions = new Intl.DisplayNames("en", { type: "region" });
const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

export const isoByName = new Map(Object.entries(ALIASES).map(([name, iso]) => [norm(name), iso]));
for (const a of letters) {
  for (const b of letters) {
    const code = a + b;
    const name = regions.of(code);
    if (name !== code && !isoByName.has(norm(name))) isoByName.set(norm(name), code);
  }
}
