# Recovery guide

Use findings from `scripts/check-project.js`; do not print raw `.env` contents or raw authenticated errors.

## Environment

- Node below 20: locate a compatible executable or guide installation. Prefer a per-session PATH or absolute executable over a global shell change.
- Dependency download ENOTFOUND: the execution environment cannot resolve the service. This is not proof that the user's normal terminal has the same problem. Provide an installation command for that terminal if necessary.
- sharp import failure: check installation platform/architecture and lockfile installation. Do not bypass cover rendering and report a complete build.
- npm audit advisories: identify affected dependencies and compatible upgrade paths. Do not run `npm audit fix --force`. Publishing requires a separate decision after the actual risk and outstanding checks are understood.

## Notion

- Token missing: guide entry into local `.env`. Never ask for the secret in chat.
- HTTP 401: token is invalid or revoked; guide the user to inspect it locally.
- HTTP 403: inspect Integration read-content capability and page access.
- HTTP 404: inspect both the resource ID and page connection. Do not assume missing resource rather than missing access.
- Database/view/data-source confusion: `databaseId` currently uses the database query endpoint with Notion-Version `2022-06-28`. Resolve the database, not its view or `collection://` ID.
- Empty title or wrong title: the trip title is read from the overview's enclosing page, traversing column/block parents. Check access to that page; fallback is `coverMeta.title` or the trip identifier.
- Missing notes: verify page IDs and supported block types. Do not insert placeholder text to hide a failed read.

## Maps and generated data

- Missing Lat/Lng: inspect the supplied address and API response. International lookups retry using the address alone. Ask for a corrected address or coordinates if unresolved; never invent coordinates.
- Domestic automatic geocoding: requires `GAODE_KEY`. Existing coordinates do not require an API lookup.
- Unknown City: compare the Places City value with the config's city keys. Preserve user content and propose the smallest correction.
- Boundary missing: inspect the city search term and map service availability. Do not substitute a different city's boundary or copy the author's original trip.
- Overpass failure: inspect status and query bounds. Use existing caches when valid; do not automatically force a complete refetch.
- Empty/partial road layers: distinguish a warning from a total build failure and report the degraded layer. Files written successfully are not proof every map layer downloaded.
- `CLUSTER_ROADS_MISSING`: major road layers are present but a located place has no matching nonempty detailed road cache. Run a normal fetch and recheck; do not substitute an unrelated cluster or mark the map complete.
- Small changes in automatic coordinates can change rounded cluster keys. Normal refresh now reuses coordinates when the name, address, city and region are unchanged. On failed or empty road requests, a previous road cache can be retained only for identical place membership with movements within 100 metres. A changed address must not silently reuse its old coordinates. `--full` explicitly retries geocoding.

## Preview

- EPERM on localhost: run preview in the user's own terminal if permitted; do not change firewall or proxy settings.
- Connection refused: check whether preview is still running and whether its port changed. Do not refetch Notion just to restart a stopped preview.
- Updated files but stale page: rebuild after fetch, then reload. Confirm the requested content in the UI.
- Browser tools unavailable: state what was checked from files and what requires user/browser verification. Do not claim to have clicked controls.

## Preserve project boundaries

Keep credentials in `.env`; generated content in `data/`; build output in `dist/`. Check ignored paths and pending files before any authorized submission. Avoid copying unrelated recordings, source-site assets, private notes, or credentials into a public deliverable.
