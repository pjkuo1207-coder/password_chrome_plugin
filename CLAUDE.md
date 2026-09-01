# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SmartPass — a privacy-first Chrome extension (Manifest V3) for generating passwords. The
differentiating feature is DOM-aware generation: it reads a target `<input>`'s `minlength`,
`maxlength`, and `pattern` attributes and adjusts the generated password to satisfy them before
it's ever submitted. See `plan.pdf` for the original Chinese-language project brief (phased
milestones, feature list, security rationale) this scaffold was built from.

## Commands

- `npm run dev` — webpack watch build (development mode, source maps) into `dist/`
- `npm run build` — production build into `dist/`
- `npm test` / `npm run test:watch` — run Jest
- `npx jest tests/generator.test.js` — run a single test file
- `npx jest -t "excludes ambiguous"` — run tests matching a name
- `npm run lint` — ESLint over `src/` and `tests/`
- `npm run format` — Prettier write

Loading the extension: run `npm run build`, then in Chrome go to `chrome://extensions`, enable
Developer Mode, "Load unpacked", and select the `dist/` directory (not the repo root — `dist/` is
the only directory containing a valid `manifest.json` alongside the built JS/assets).

## Architecture

**Build**: webpack.config.js has three independent entry points — `background`, `content`,
`popup` — each compiled to a top-level file in `dist/` (`background.js`, `content.js`,
`popup.js`). `CopyPlugin` copies `manifest.json`, `popup.html`, `popup.css`, and
`src/assets/icons/` into `dist/` unchanged. Source files use CommonJS (`require`/`module.exports`)
transpiled by Babel — extension code isn't ESM.

**Permission model — this is the load-bearing design decision**: the manifest requests only
`storage`, `activeTab`, `scripting`, and `contextMenus` — deliberately no `<all_urls>` and no
static `content_scripts` entry. `contextMenus` grants no host access, so it doesn't compromise the
"zero high-risk permissions" goal in `plan.pdf`. `src/content/index.js` is built but *not*
declared in `manifest.json`; it's injected on demand via `chrome.scripting.executeScript` — from
the popup (backed by the `activeTab` grant from the user opening it) or from the background
service worker (in response to a context-menu click or the `generate-and-copy` command, both of
which count as a user gesture). When wiring up new DOM auto-detection or fill-in behavior,
inject-on-demand — don't add a `content_scripts` block, that would silently expand the extension's
host permissions.

Because `chrome.scripting.executeScript` re-runs the content script's top-level code on every
injection, `content/index.js` guards its `chrome.runtime.onMessage` registration with a
`window.__smartpassLoaded` flag — without it, repeated popup opens / hotkey presses / context-menu
clicks on the same tab would stack duplicate listeners and each message would be handled N times.

**Trigger surfaces**, all converging on the same `core/` logic and the same
`SMARTPASS_FILL_PASSWORD` / `SMARTPASS_COPY_PASSWORD` / `SMARTPASS_DETECT_RULES` messages handled
by `content/index.js`. All three surfaces detect DOM constraints (via `SMARTPASS_DETECT_RULES` +
`domParser.suggestRuleFromConstraints`) before generating — this used to be popup-only, which meant
the context menu and hotkey could fill/copy a password that violated the very page they were
acting on; keep that symmetry when adding a new trigger surface, don't let a new one skip
detection:
- **Popup** (`src/popup/`) — on open, calls `detectPageRules()` which injects the content script,
  sends `SMARTPASS_DETECT_RULES`, and if a password field is found, stores the constraints and
  reveals a "Fill field" button. `detectPageRules()` always ends by calling `generate()` exactly
  once (success path, no-field path, and catch path all reach it) — don't add another `generate()`
  call elsewhere in the load sequence, a previous version called it twice and double-wrote history.
  Detection failure (restricted pages, no password field) is caught and falls back to manual mode
  silently — this is an expected, common case, not an error to surface. A failed "Fill field"
  click (page navigated away, field removed by client-side JS) *is* surfaced, via
  `setDetectStatus`.
- **Context menu** (`src/background/index.js`, registered `onInstalled`) — "Fill this field"
  (`contexts: ['editable']`) and "Generate & copy" (all contexts) both inject the content script,
  detect constraints, generate with `core/generator` in the service worker, then message the
  content script to act.
- **Keyboard shortcuts** (`manifest.json` `commands`) — `_execute_action` (default
  `Ctrl/Cmd+Shift+U`) just opens the popup; `generate-and-copy` (default `Ctrl/Cmd+Shift+G`) is
  handled in `background/index.js`'s `chrome.commands.onCommand` listener and runs the same
  detect-generate-inject-message flow as the copy context-menu item, without opening the popup.

**Module split** (`src/core/`, framework-free, unit-tested in `tests/`):
- `generator.js` — all randomness goes through `globalThis.crypto.getRandomValues` (never
  `Math.random`). Three generation modes: `generatePassword` (charset-based, guarantees at least
  one char from each enabled set, then Fisher-Yates shuffles so guaranteed chars aren't
  positionally predictable), `generatePronounceable` (alternating consonant/vowel syllables),
  `generatePassphrase` (words from the built-in `WORDLIST`).
- `domParser.js` — pure DOM-reading functions (`parseInputConstraints`,
  `suggestRuleFromConstraints`, `findPasswordInputs`) kept independent of `chrome.*` APIs so they
  run under plain jsdom in tests without mocking the extension runtime. The `pattern`→"disable
  symbols" heuristic (`isAlphanumericOnlyPattern`) only inspects the content of the first `[...]`
  character class, not the whole pattern string — this deliberately tolerates surrounding
  anchors/quantifiers (`^`, `$`, `{8,20}`, `+`) and range ordering (`a-zA-Z0-9` vs `A-Za-z0-9`); an
  earlier full-string-literal version matched almost nothing real. It also strips `x-y` alnum
  ranges before scanning for symbol characters, since an unstripped range's `-` would otherwise
  read as a literal hyphen (itself one of `generator.CHARSETS.symbols`) and cause a false negative.
- `popupLogic.js` — `generateConstrainedPassword(baseOptions, constraints)` applies detected
  constraints via `suggestRuleFromConstraints` and falls back to `baseOptions` if the constrained
  result is infeasible (e.g. `maxLength` too short for the number of enabled character groups)
  instead of throwing into the UI. `describeDetectedField` builds the popup's status line; it
  checks `minLength`/`maxLength` against `null`, not truthiness, since `0` is a real length. Both
  are pure and popup-DOM-free specifically so the "what happens when detection and generation
  options conflict" logic has direct unit coverage instead of only being reachable through a
  simulated popup DOM.
- `inject.js` — the one-line `chrome.scripting.executeScript({ target: { tabId }, files:
  ['content.js'] })` wrapper, shared by `popup.js` and `background/index.js` so the injection call
  shape has a single source of truth.
- `storage.js` — wraps `chrome.storage.local` for a capped 5-entry history
  (`HISTORY_LIMIT`) and implements clipboard auto-clear (`copyToClipboardWithAutoClear`,
  default 30s via `CLIPBOARD_CLEAR_MS`): after copying, it re-reads the clipboard before
  overwriting, so it doesn't stomp something else the user copied in the meantime. Called from
  both the popup and `content/index.js` (the latter for context-menu/hotkey-triggered actions).

`background/index.js` and `content/index.js` are thin — they call into `core/` rather than
containing generation/storage logic themselves.

## Testing

Jest env is `node` by default (`jest.config.js`); test files that need a live DOM or `chrome.*`
opt into `@jest-environment jsdom` per-file (`domParser`, `storage`, `content`, `popup`;
`background` and `popupLogic` run under plain `node` since neither touches the DOM). `chrome.*`
APIs are mocked ad hoc per test file (see `tests/background.test.js` and `tests/storage.test.js`
for the pattern — a plain object of `jest.fn()`s assigned to `global.chrome`) rather than through a
shared library; there was no need yet to reach for `jest-chrome`/`sinon-chrome`. Both
`background/index.js` and `content/index.js` guard their top-level `chrome.*` listener
registration with `typeof chrome !== 'undefined'` so they can be `require`d in tests without a
chrome global present at import time — the mock is installed on `global.chrome` *before*
`require`-ing the module under test (see `beforeEach` in `tests/background.test.js`).

`tests/popup.test.js` requires `src/popup/popup.js` directly (it has no exports — it's pure UI
wiring), so it hand-builds a minimal DOM matching every id `popup.js` looks up via
`document.getElementById` *before* requiring the module, and drains pending promise chains with a
handful of `await Promise.resolve()` ticks (`flush()`) rather than fake timers, since nothing in
that path uses `setTimeout`. If you add a new `document.getElementById` lookup to `popup.js`,
add the matching element to that test file's `setupDom()` or every test in the file breaks at
`require` time.
