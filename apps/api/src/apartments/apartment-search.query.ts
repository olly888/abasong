import type { QueryConfig } from "pg";

// Names/addresses only. This is candidate search, never apartment membership
// or permission to read a code. Values remain parameterized SQL literals.
export function apartmentSearchQuery(
  query: string,
  limit: number,
): QueryConfig {
  const terms =
    query
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return {
    text: `WITH catalog AS (
      SELECT id,name,address_line1,city,state,postal_code,confidence,
        extensions.ST_X(point::extensions.geometry) AS lng,
        extensions.ST_Y(point::extensions.geometry) AS lat,
        trim(regexp_replace(lower(concat_ws(' ',name,address_line1,city,state,postal_code)),
          '[^[:alnum:]]+', ' ', 'g')) AS search_text
      FROM abasong.apartments WHERE status='active'
    )
    SELECT id,name,address_line1,city,state,postal_code,confidence,lng,lat
    FROM catalog
    WHERE cardinality($1::text[]) > 0 AND NOT EXISTS (
      SELECT 1 FROM unnest($1::text[]) WITH ORDINALITY AS t(term,n)
      WHERE strpos(' ' || search_text || ' ', ' ' || term ||
        CASE WHEN n=cardinality($1::text[]) THEN '' ELSE ' ' END)=0
    )
    ORDER BY (strpos(search_text,$2)>0) DESC, lower(coalesce(name,address_line1)), id
    LIMIT $3`,
    values: [terms, terms.join(" "), limit],
  };
}
