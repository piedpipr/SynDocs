# Adding a new language

SynDocs supports a new language in exactly one place: the extension table in
`languages.ts`. Nothing else needs to change.

## The extension table

@syndocs-embed: packages/core/src/languages.ts <!-- syndocs-synced: 450e127fce9b -->

Add one row to `BY_EXTENSION`. The three fields:

- **`style`** — which comment syntax the language uses (`//`, `#`, `--`, `<!--`, `/*`)
- **`codeBlock`** — the language hint used inside fenced code blocks in the mirror doc
  (this is what GitHub uses for syntax highlighting, e.g. `python`, `rust`, `kotlin`)

That's it. The anchor parser, mirror-path logic, and all four CLI commands pick
up the new language automatically.

## Special cases

Languages without a file extension (like bare `Dockerfile`) need a name-based
check, which is already handled at the top of `getLangConfig`. If you add another
bare-name file type, extend that block the same way.

## What NOT to do

Don't add a language you don't currently use. The table is a reference to extend
from, not a completeness checklist. Implement the languages you need in Phase 1,
then grow the table as new languages appear in your actual codebase.
