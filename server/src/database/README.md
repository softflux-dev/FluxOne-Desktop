# FluxOne local SQLite

## Runtime (existing installs)

- Schema changes live in numbered files under `migrations/` (`001` … `015`).
- Apply with `npm run migrate` (or `seed` / app boot) via `migrate.js`.
- Do **not** run `FluxOne_Desktop.sql` against a live `fluxone.db`.

## Documentation schema

- **`FluxOne_Desktop.sql`** — final-head CREATE TABLE / INDEX guide after migration 007+ naming (`cash_drawer_*`, not `till_*`).
- For junior onboarding and greenfield understanding only.
- Deprecated tables (`sync_state`, `app_releases`) are documented there; no drop scripts.

## Data

- `seed.js` only runs migrations — no demo employees/products.
- Catalog, store profile, and users come from FluxOne Inventory **cloud bootstrap / sync**.
- Electron `prepare:dist` builds an empty packaging DB under `electron/resources/schema-db`.

## Related

- Folder map: `docs/FOLDER_MAP.md`
