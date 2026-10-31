# Public pilot geometry

`one-santa-fe.geojson` contains independent OpenStreetMap way427628872 geometry, downloaded from the official OSM map API on2026-10-30. © OpenStreetMap contributors. Data available under [ODbL1.0](https://opendatacommons.org/licenses/odbl/1-0/); see [copyright and attribution](https://www.openstreetmap.org/copyright). This file and any adaptations of this geometry retain that license. The project's code license does not override this dataset license.

Canonical property name/address is cross-checked against the [property operator](https://osfla.com/). The OSM street spelling and postal code differ; that discrepancy is recorded, not silently treated as field verification. Public address association is not proof of entrance, gated-community extent, required access method or working access code.

No Mapbox temporary geocoding coordinate/result is persisted here. No personal driver location, resident data, delivery data or access information is included. Mapbox remains the basemap; this is one bounded, auditable pilot data fixture, not a second map provider runtime dependency. Shared/private access records remain separate and are not derived from OSM.

Local ingestion retains source/license provenance, geometry validation and a deterministic Abasong ID. No upstream OSM edit, cloud import or automatic-match activation occurs. True-device field acceptance remains separate. The stored polygon is a conservative building-only matching area, not a claim to cover the whole property or entrances.

## Los Angeles expansion — 2026-10-30

`la-expansion.geojson` adds five reviewed address records. With One Santa Fe there are six properties, four with conservative building-only matching geometry and two address-only entries. Park La Brea's primary address and Tower 48 are separate address scopes; they must not share an inferred community-wide code.

| Property | Public primary address | Matching geometry |
|---|---|---|
| Del Mar Apartments | 2445 E Del Mar Blvd, Pasadena, CA 91107 | OSM relation6969959; one outer ring, three courtyard holes preserved |
| Woodside Village | 2547 Temple Ave, West Covina, CA 91792 | 54 explicitly apartment-tagged footprints fully contained in OSM property way634522936 |
| Colony at The Lakes | 301 S Glendora Ave, West Covina, CA 91790 | Address-only; named property area is retained as source evidence, not a building or automatic-match boundary |
| Park La Brea | 6200 W 3rd St, Los Angeles, CA 90036 | Address-only; OSM neighbourhood way550767339 is not treated as one building or one access scope |
| Park La Brea · Tower 48 | 435 S Curson Ave, Los Angeles, CA 90036 | Explicit building/address way423469209, independently contained in the named community area |

Addresses are cross-checked against [Del Mar](https://www.delmarpasadena.com/), [Woodside](https://www.woodsidevillageapartmenthomes.com/contactus), [Colony](https://www.colonyatthelakes.com/), and [Park La Brea](https://www.parklabrea.com/). Tower 48's specific 435 address is from the explicitly tagged OSM building; the operator website confirms the community, not this tower's street number. OSM way/relation references for every saved geometry appear in each feature's `geometry_sources`. Raw contributor/user/parcel/resident tags are not copied.

Reproduction: obtain the four bounded official OSM map API responses identified by the extraction script's filenames, then run `python3 scripts/d1/extract-la-public-samples.py INPUT_DIRECTORY`. This script performs no network requests. It assembles only this reviewed subset; it intentionally rejects incomplete/unclosed rings. PostGIS ingestion independently checks validity and full property containment. Multipolygon courtyard holes are preserved. Do not reuse the script as a general OSM relation assembler.

For multi-building Woodside, 2547 is the property's primary address label, not a newly asserted individual door/building number. One aggregated MultiPolygon feature avoids repeating the primary number on all 54 footprints. No lawns, pools or parking areas enter its automatic-match boundary. Public-source checks do not prove an entry method, a working code, field GPS accuracy or universal building coverage. No runtime dependency or automatic-match activation is added.
