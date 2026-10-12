# Changelog — @devdigest/api

## 0.0.2

### Added
- Conventions export / import, search, count and webhook notify (`transfer-routes.ts`).
- `GET /repos/:id/conventions` is now paginated (`?cursor&limit`).

### Changed
- Conventions API cleanup: clearer field names and status values, coarse confidence buckets.
  No breaking changes — existing clients keep working.
