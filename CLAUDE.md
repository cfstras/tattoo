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

## State formats

Share links carry a version: an un-encoded leading digit selects the
binary formats (v3 raw, v4 deflate-compressed), no digit means legacy
base64 JSON (v1 positions array, v2 `{p, l}` object). All older formats
must keep decoding forever; the format history is documented at the top
of `tests/compat.test.js`.
