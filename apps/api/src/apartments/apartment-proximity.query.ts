// Shared by nearby discovery and exact-address search. Parameters are longitude,
// latitude, radius and result limit. Values are always bound, never SQL text.
// Existing catalog points remain a fallback; expired/unverified geometry cannot
// extend coverage beyond that point. This does not confirm arrival or a gate.
export const apartmentProximityQuery = `
WITH q AS (SELECT extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography AS g)
SELECT a.id,a.name,a.address_line1,a.city,a.state,a.postal_code,a.confidence,
  extensions.ST_X(a.point::extensions.geometry) AS lng,
  extensions.ST_Y(a.point::extensions.geometry) AS lat,
  nearest.distance,nearest.basis AS distance_basis
FROM abasong.apartments a CROSS JOIN q
LEFT JOIN LATERAL (
  SELECT CASE WHEN s.persistent_use_approved AND s.verified_at IS NOT NULL AND s.verified_at<=now()
    AND (s.expires_at IS NULL OR s.expires_at>now())
    AND extensions.ST_IsValid(a.boundary) AND NOT extensions.ST_IsEmpty(a.boundary)
    THEN a.boundary ELSE NULL END AS boundary
  FROM abasong.data_sources s WHERE s.id=a.source_id
) area ON true
LEFT JOIN LATERAL (
  SELECT min(extensions.ST_Distance(x.footprint::extensions.geography,q.g)) AS distance
  FROM abasong.apartment_buildings x JOIN abasong.data_sources s ON s.id=x.source_id
  WHERE x.apartment_id=a.id AND x.verified_at<=now()
    AND s.persistent_use_approved AND s.verified_at IS NOT NULL AND s.verified_at<=now()
    AND (s.expires_at IS NULL OR s.expires_at>now())
) b ON true
CROSS JOIN LATERAL (
  SELECT d.distance,d.basis FROM (VALUES
    (extensions.ST_Distance(area.boundary::extensions.geography,q.g),'community_boundary',0),
    (b.distance,'building_footprint',1),
    (extensions.ST_Distance(a.point,q.g),'address_point',2)
  ) d(distance,basis,priority)
  WHERE d.distance IS NOT NULL ORDER BY d.distance,d.priority LIMIT 1
) nearest
WHERE a.status='active' AND (
  extensions.ST_DWithin(a.point,q.g,$3) OR
  extensions.ST_DWithin(area.boundary::extensions.geography,q.g,$3) OR b.distance<=$3)
ORDER BY distance,a.id LIMIT $4`;
