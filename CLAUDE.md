# Node Drawing webapp

A single-file webapp (`index.html`) — draggable numbered nodes with
configurable connection layers, silhouette approximation, share links,
and SVG export. Deployed to GitHub Pages from the `gh-pages` branch;
pushes to `main` run the test suite and then deploy via
`.github/workflows/pages.yml`.

## Tests

- **Always commit tests.** Never leave test scripts in scratchpads,
  temp directories, or session-local folders — write them into
  `tests/` in the same change as the feature or fix they cover.
- `npm test` runs everything: `tests/run-all.js` executes every
  `tests/*.test.js` sequentially and fails on a non-zero exit or any
  printed `FAIL` line. Suites are plain Node + Playwright scripts (no
  framework); log one `PASS`/`FAIL` line per check.
- Keep suites portable: derive the app URL from the test file's path,
  write fixture files to the OS tempdir, and launch Chromium with the
  `CHROMIUM_PATH` override / `/opt/pw-browsers/chromium` / Playwright
  default fallback chain used by the existing suites.
- `tests/compat.test.js` guards the state-format contract with frozen
  fixtures (legacy localStorage payloads and share-hash versions).
  When one fails, fix the loader or add a migration — never regenerate
  a frozen fixture.

## Versioning

Semantic versions come from the `VERSION` file plus Conventional
Commits: the file holds the base (`X.Y.Z`), and every commit on
`main` since it last changed bumps the version by its type —
`type!:` (breaking) bumps major, `feat:` bumps minor, anything else
bumps patch (`scripts/version.sh` computes this; CI uses it). Editing
`VERSION` resets the base. CI stamps the result over the
`__APP_VERSION__` placeholder in `index.html` at deploy time;
unstamped builds display `dev` bottom-right.

## Commit messages

Commit subjects follow Conventional Commits and drive the versioning
above: `<type>(<scope>)?: <description>` with types `feat fix docs
style refactor perf test build ci chore`, and `!` after the type for
breaking changes. The committed `.githooks/commit-msg` hook enforces
this — it activates via `npm install` (the `prepare` script sets
`core.hooksPath`), or manually with
`git config core.hooksPath .githooks`.

## State formats

Share links carry a version: an un-encoded leading digit selects the
binary formats (v3 raw, v4 deflate-compressed), no digit means legacy
base64 JSON (v1 positions array, v2 `{p, l}` object). All older formats
must keep decoding forever; the format history is documented at the top
of `tests/compat.test.js`.
