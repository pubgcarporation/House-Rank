export const TIERS = [
  { n: 5, label: "Architect Tier 5", color: "#4A3D7A" },
  { n: 4, label: "Architect Tier 4", color: "#2F578C" },
  { n: 3, label: "Architect Tier 3", color: "#C9A227" },
  { n: 2, label: "Architect Tier 2", color: "#C4843A", img: "https://d2xo500swnpgl1.cloudfront.net/uploads/arc/ProfileBadge-Verified-2-c55b2608-3249-4692-813b-cc96c9c4166a-1774384786992.png" },
  { n: 1, label: "Architect Tier 1", color: "#8D939E", img: "https://d2xo500swnpgl1.cloudfront.net/uploads/arc/ProfileBadge-Verified-1-36f56ce9-6b6a-40a4-a11e-10f4ada91b9e-1777303176598.png" },
];

const MEMBER = { n: 0, label: "Member", color: "#656B76" };

export function badgeTier(badge) {
  return Number((/Architect\s*Tier\s*(\d+)/i.exec(badge || "") || [])[1]) || 0;
}

export function tierOf(m) {
  return TIERS.find((t) => t.n === badgeTier(m?.badge)) || MEMBER;
}

export function staffBadge(m) {
  const b = m?.profileBadge;
  if (!b?.name || /Architect\s*Tier/i.test(b.name)) return null;
  return b;
}

export function houseBadge(m) {
  const staff = staffBadge(m);
  if (staff?.pictureUrl) return staff;
  const t = tierOf(m);
  const img = m?.profileBadge?.pictureUrl || t.img;
  return img ? { name: t.label, pictureUrl: img } : null;
}

export function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n || 0);
}
