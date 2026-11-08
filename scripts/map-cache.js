// Normal refreshes keep geocoded positions stable unless their search inputs change.
export function usableCoordinates(place) {
  return Number.isFinite(place?.lat) && Number.isFinite(place?.lng)
    && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180
    && place.lat !== 0 && place.lng !== 0
}

export function cachedCoordinates(place, previous) {
  if (!previous || !usableCoordinates(previous)) return null
  // Partial/invalid manually supplied coordinates must be resolved, not replaced
  // silently with a previous automatic result.
  if (place.lat != null || place.lng != null) return null
  for (const field of ['name', 'address', 'city']) {
    if (String(place[field] || '').trim() !== String(previous[field] || '').trim()) return null
  }
  return { lat: previous.lat, lng: previous.lng }
}

function distanceMeters(a, b) {
  const radians = Math.PI / 180
  const dLat = (b.lat - a.lat) * radians
  const dLng = (b.lng - a.lng) * radians
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}

// A nearby old cluster is only a fallback after a failed/empty refresh, never a
// substitute for a changed itinerary. Require identical membership and small moves.
export function clusterRoadFallback(cluster, previousPlaces, roadCache, maxShiftMeters = 100) {
  const previousById = new Map(previousPlaces.map(p => [p.id, p]))
  const previousMembers = cluster.places.map(p => previousById.get(p.id))
  if (!previousMembers.length || previousMembers.some(p => !p)) return null
  const key = previousMembers[0].clusterId
  if (!key || previousMembers.some(p => p.clusterId !== key) || !roadCache?.[key]?.length) return null
  const ids = new Set(cluster.places.map(p => p.id))
  const allPreviousMembers = previousPlaces.filter(p => p.clusterId === key)
  if (allPreviousMembers.length !== ids.size || allPreviousMembers.some(p => !ids.has(p.id))) return null
  for (const p of cluster.places) {
    const old = previousById.get(p.id)
    if (old.city !== p.city || !usableCoordinates(p) || !usableCoordinates(old) || distanceMeters(old, p) > maxShiftMeters) return null
  }
  return { key, roads: roadCache[key] }
}
