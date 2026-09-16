/** Map Arc GraphQL LVTenantUser -> members.json row */
export function mapMember(r) {
  const company = typeof r.company === "string" ? r.company : r.company?.name || null;
  const profileBadge = r.profileBadge
    ? {
        id: r.profileBadge.id,
        name: r.profileBadge.name,
        pictureUrl: r.profileBadge.pictureUrl,
        description: r.profileBadge.description || null,
      }
    : null;
  return {
    id: r.id,
    userId: r.userId,
    nanoId: r.nanoId,
    name: r.displayName || [r.firstName, r.lastName].filter(Boolean).join(" "),
    firstName: r.firstName || null,
    lastName: r.lastName || null,
    headline: r.headline || null,
    position: r.position || null,
    company,
    pictureUrl: r.pictureUrl || null,
    city: r.city || null,
    state: r.state || null,
    country: r.country || null,
    location: r.displayLocation || [r.city, r.state, r.country].filter(Boolean).join(", ") || null,
    points: r.totalContributionPoints || 0,
    badges: r.totalContributionBadgeCount || 0,
    role: r.role || null,
    badge: profileBadge?.name || null,
    profileBadge,
  };
}

export function withRanks(members) {
  return members
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .map((m, i) => ({ ...m, rank: i + 1 }));
}
