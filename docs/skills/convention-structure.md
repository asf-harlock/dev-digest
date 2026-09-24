# convention-structure

House conventions for `asf-harlock/dev-digest`. Flag changes that violate any rule below and cite the offending `file:line`.

## schema-tables-are-organized-into-domain-files-under-schema-and-r
Schema tables are organized into domain files under `./schema/` and re-exported via a barrel file.

Detected in `server/src/db/schema.ts:15-28`:

```
export * from './schema/core'
```
