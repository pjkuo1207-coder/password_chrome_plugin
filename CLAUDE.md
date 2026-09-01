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
`storage`, `activeTab`, and `scripting` — deliberately no `<all_urls>` and no static
`content_scripts` entry. `src/content/index.js` is built but *not* declared in `manifest.json`;
it must be injected on demand via `chrome.scripting.executeScript` (from the popup or background,
using the `activeTab` grant from the current user gesture) rather than run persistently on every
page load. When wiring up DOM auto-detection or fill-in, inject-on-demand, don't add a
`content_scripts` block — that would silently expand the extension's host permissions and defeats
the "zero high-risk permissions" goal in `plan.pdf`.

**Module split** (`src/core/`, framework-free, unit-tested in `tests/`):
- `generator.js` — all randomness goes through `globalThis.crypto.getRandomValues` (never
  `Math.random`). Three generation modes: `generatePassword` (charset-based, guarantees at least
  one char from each enabled set, then Fisher-Yates shuffles so guaranteed chars aren't
  positionally predictable), `generatePronounceable` (alternating consonant/vowel syllables),
  `generatePassphrase` (words from the built-in `WORDLIST`).
- `domParser.js` — pure DOM-reading functions (`parseInputConstraints`,
  `suggestRuleFromConstraints`, `findPasswordInputs`) kept independent of `chrome.*` APIs so they
  run under plain jsdom in tests without mocking the extension runtime.
- `storage.js` — wraps `chrome.storage.local` for a capped 5-entry history
  (`HISTORY_LIMIT`) and implements clipboard auto-clear (`copyToClipboardWithAutoClear`,
  default 30s via `CLIPBOARD_CLEAR_MS`): after copying, it re-reads the clipboard before
  overwriting, so it doesn't stomp something else the user copied in the meantime. Everything here
  touches `chrome.*`/`navigator.clipboard`, so it's exercised through the popup, not unit-tested
  directly.

`background/index.js` and `content/index.js` are thin — they call into `core/` rather than
containing generation/storage logic themselves. `popup/popup.js` is the only place all three
`core/` modules are wired together into a UI.

## Testing

Jest env is `node` by default (`jest.config.js`); `tests/domParser.test.js` opts into
`@jest-environment jsdom` per-file since it needs a live DOM. `chrome.*` APIs are not mocked
anywhere yet — tests only cover the framework-free `core/generator.js` and `core/domParser.js`.
