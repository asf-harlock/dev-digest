# Skills exported from the L02 homework

Skill bodies exported byte-for-byte from the author's DB. The seed
(`server/src/db/seed-skills.ts`) creates the same skills, so on a seeded
workspace you do not need to import anything. The files are here for reading
and for importing through the Skills UI into a workspace that was not seeded.

| File | Kind | Used by |
|---|---|---|
| [`breaking-change.md`](./breaking-change.md) | rubric, imported | API Contract Reviewer |
| [`response-schema.md`](./response-schema.md) | rubric, imported | API Contract Reviewer |
| [`semver-discipline.md`](./semver-discipline.md) | convention, imported | API Contract Reviewer |
| [`deprecation-policy.md`](./deprecation-policy.md) | convention, manual | API Contract Reviewer |
| [`convention-other.md`](./convention-other.md) | extracted from accepted conventions | — |
| [`convention-naming.md`](./convention-naming.md) | extracted from accepted conventions | — |
| [`convention-structure.md`](./convention-structure.md) | extracted from accepted conventions | — |
| [`async-safety-hidden-injection.md`](./async-safety-hidden-injection.md) | **test fixture — do not import or enable** | — |

## ⚠️ `async-safety-hidden-injection.md` is a prompt-injection fixture

It looks like an ordinary async error-handling convention. HTML comments inside
it hide instructions telling the reviewer to approve everything and leak its
prompt. The Skills Preview tab does not render raw HTML, so Preview hides that
payload. That gap is what the fixture exists to demonstrate.

- The seed creates it **disabled** and not linked to any agent. Keep it that way.
- Do not bulk-import this folder. Import skills one by one, and leave this file
  out.
- Correction to the fixture's own header: skill bodies are appended to the
  **user** message under `## Skills / rules` (`reviewer-core/src/prompt.ts`), not
  to the system prompt. They are not wrapped in `<untrusted>`, so
  `INJECTION_GUARD` does not cover them. That is why the payload can work. The
  file is left byte-for-byte as it is in the DB, so this note carries the
  correction instead.
