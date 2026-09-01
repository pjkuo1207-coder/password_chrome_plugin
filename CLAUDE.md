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
by `content/index.js`. All three surfaces detect DOM constraints and record history themselves —
keep that symmetry when adding a new trigger surface:
- **Popup** (`src/popup/`) — on open, `detectPageRules()` injects the content script, sends
  `SMARTPASS_DETECT_RULES`, and if a password field is found, targets it in `getTargetPasswordField()`
  (content/index.js) — the *focused* password field if there is one, else the first on the page —
  and stores its constraints. `detectPageRules()` always ends by calling `generate()` exactly once
  (success, no-field, and catch paths all reach it) — don't add another `generate()` call
  elsewhere, a previous version called it twice and double-wrote history. Copy is relayed through
  the content script (see "Clipboard" below) with a direct-write fallback for pages that can't be
  scripted. A failed "Fill field" click, a clipboard-copy failure, and an "every character type
  disabled" click on Generate are all surfaced via `setDetectStatus` — detection failure itself
  (restricted page, no password field) is the one case that's expected and silent.
- **Context menu** (`src/background/index.js`, registered `onInstalled`) — "Fill this field"
  (`contexts: ['editable']`) and "Generate & copy" (all contexts) both inject the content script,
  detect constraints, generate via `core/constrainedGenerator`, record history directly (service
  workers have full `chrome.storage` access — no need to relay that through the content script),
  then message the content script to act.
- **Keyboard shortcuts** (`manifest.json` `commands`) — `_execute_action` (default
  `Ctrl/Cmd+Shift+U`) just opens the popup; `generate-and-copy` (default `Ctrl/Cmd+Shift+G`) runs
  the same detect-generate-record-inject-message flow as the copy context-menu item, without
  opening the popup.

**History ownership**: recorded exactly once, by whichever code actually generated the password —
popup.js's `generate()`, or background/index.js's `generateAndFill`/`generateAndCopy`.
`content/index.js`'s message handlers never call `addToHistory` themselves, on purpose: a
fill/copy action re-uses an already-generated (and already-recorded) password, so if the content
script also recorded it, one generation would write two history entries. If you're tempted to add
history-writing to a content-script message handler, don't — find where the password was
generated and add it there instead.

**Clipboard**: `copyToClipboardWithAutoClear` (core/storage.js) schedules its 30s auto-clear via
`setTimeout` in whatever JS realm calls it. A Chrome extension **popup's realm is torn down the
moment the popup closes** — which happens almost immediately after the user clicks Copy and
switches away to paste it — silently killing that timer before it ever fires. So popup.js's Copy
button does *not* call `copyToClipboardWithAutoClear` directly; it relays the copy through the
content script (`SMARTPASS_COPY_PASSWORD`, same message background's copy paths use), whose realm
lives with the tab and survives the popup closing. Direct-write is only the fallback for tabs that
can't be scripted (`chrome://`, the Web Store, ...), where the timer's survival is moot anyway
since there's no content-script alternative. If you add a new way to copy a password, route it
through this same message rather than calling `copyToClipboardWithAutoClear` from the popup.

**Module split** (`src/core/`, framework-free, unit-tested in `tests/`):
- `generator.js` — all randomness goes through `globalThis.crypto.getRandomValues` via
  `randomInt`, which rejection-samples to avoid modulo bias (never `Math.random`). Three
  generation modes: `generatePassword` (charset-based; supports an optional `customCharset` that
  overrides the uppercase/lowercase/numbers/symbols toggles entirely — see domParser.js below —
  and guarantees at least one char from each *group*, i.e. just the one group when customCharset
  is set, then Fisher-Yates shuffles), `generatePronounceable` (alternating consonant/vowel
  syllables; `options.length` is the *total* output length including the numeric suffix when
  `appendNumber` is true), `generatePassphrase` (words from the 128-word `WORDLIST`, default
  `wordCount: 6` for ~52 bits of entropy — a smaller wordlist/wordCount was measured at only ~30
  bits, weak for a "secure" mode). `generatePassword` throws (rather than looping forever) if
  `excludeAmbiguous` strips a group — including a narrow `customCharset` — down to zero characters.
- `domParser.js` — pure DOM-reading/pattern-parsing functions, independent of `chrome.*` APIs so
  they run under plain jsdom in tests. `parseCharacterClass` parses a *non-negated* bracket
  character class (`[A-F0-9]`, `[a-zA-Z0-9_-]`) into an exact character set for
  `generatePassword`'s `customCharset` — this is what lets a hex-only or otherwise
  restricted-charset field actually get a conforming password, not just "symbols on/off".
  `applyPatternQuantifier` reads a `{n}`/`{n,min,max}` quantifier off the pattern for cases where
  a site expresses its length limit only in `pattern`, with no separate `maxlength` attribute.
  Both return null/no-op rather than guessing when they can't confidently parse something (a
  negated class, no bracket at all, `\w`/`\d` shorthand with no literal bracket) — a pattern built
  from multiple bracket groups (lookaheads, alternation) also only has its *first* bracket parsed,
  a known, documented limitation, not a bug to "fix" by writing a full regex engine.
- `constrainedGenerator.js` — `generateConstrainedPassword(baseOptions, constraints)`: applies
  `domParser.suggestRuleFromConstraints`, then if `constraints.pattern` compiles as a RegExp,
  validates the result against it and retries generation (bounded) until it matches — needed
  because a multi-bracket pattern isn't fully captured by `parseCharacterClass`. If the constrained
  options are infeasible for the length (e.g. a detected `maxLength` too short to fit one char from
  every currently-enabled group — think a legacy 3-4 char PIN field), `relaxGroupsToFitLength`
  degrades by dropping groups (symbols first, lowercase last) rather than either throwing or — the
  previous behavior — silently ignoring the length limit and falling back to a much longer,
  non-conforming password. Only falls all the way back to the caller's plain `baseOptions` if even
  that relaxed attempt throws (which in practice means `baseOptions` itself is invalid, e.g. the
  user unchecked every character-type checkbox — see popup.js). `describeDetectedField` builds the
  popup's status line; it checks `minLength`/`maxLength` against `null`, not truthiness, since `0`
  is a real length. Despite the name, this module isn't popup-specific — `background/index.js`
  uses it too, so the constraint-fitting logic has exactly one implementation.
- `inject.js` — the one-line `chrome.scripting.executeScript({ target: { tabId }, files:
  ['content.js'] })` wrapper, shared by `popup.js` and `background/index.js` so the injection call
  shape has a single source of truth.
- `storage.js` — wraps `chrome.storage.local` for a capped 5-entry history (`HISTORY_LIMIT`) and
  implements clipboard auto-clear (`copyToClipboardWithAutoClear`, default 30s via
  `CLIPBOARD_CLEAR_MS`): after copying, it re-reads the clipboard before overwriting, so it doesn't
  stomp something else the user copied in the meantime. `addToHistory`'s read-modify-write against
  `chrome.storage.local` isn't atomic — concurrent calls *within the same JS realm* aren't a
  concern in practice (each trigger surface only generates once per user action), but a true race
  across two realms simultaneously (e.g. the popup and a content-script action landing at the same
  instant) is a known, accepted, undefended-against limitation, not worth a cross-context lock for
  how rarely it could actually occur.

`background/index.js` and `content/index.js` are thin — they call into `core/` rather than
containing generation/storage logic themselves.

## Testing

Jest env is `node` by default (`jest.config.js`); test files that need a live DOM or `chrome.*`
opt into `@jest-environment jsdom` per-file (`domParser`, `storage`, `content`, `popup`;
`background` and `constrainedGenerator` run under plain `node` since neither touches the DOM).
`chrome.*` APIs are mocked ad hoc per test file (see `tests/background.test.js` and
`tests/storage.test.js` for the pattern — a plain object of `jest.fn()`s assigned to
`global.chrome`) rather than through a shared library; there was no need yet to reach for
`jest-chrome`/`sinon-chrome`. Both `background/index.js` and `content/index.js` guard their
top-level `chrome.*` listener registration with `typeof chrome !== 'undefined'` so they can be
`require`d in tests without a chrome global present at import time — the mock is installed on
`global.chrome` *before* `require`-ing the module under test (see `beforeEach` in
`tests/background.test.js`). Since `background/index.js` now calls `storage.addToHistory`
directly, its chrome mock includes a `storage.local` stub too — omitting it makes every
context-menu/hotkey test fail (addToHistory throws on an undefined `chrome.storage`).

`tests/popup.test.js` requires `src/popup/popup.js` directly (it has no exports — it's pure UI
wiring), so it hand-builds a minimal DOM matching every id `popup.js` looks up via
`document.getElementById` *before* requiring the module, and drains pending promise chains with a
handful of `await Promise.resolve()` ticks (`flush()`) rather than fake timers, since nothing in
that path uses `setTimeout`. If you add a new `document.getElementById` lookup to `popup.js`,
add the matching element to that test file's `setupDom()` or every test in the file breaks at
`require` time.

## Known limitations (accepted, not bugs to "fix" reflexively)

- **Pattern parsing is best-effort, not a regex engine.** `parseCharacterClass` handles a single
  non-negated bracket class. A pattern combining several via lookaheads/alternation
  (`^(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$`) only has its first bracket parsed; `constrainedGenerator`'s
  retry-against-the-full-pattern loop catches some of these by luck, not by design, and gives up
  (best-effort, non-conforming result) after `MAX_PATTERN_RETRY_ATTEMPTS`.
- **History writes aren't atomic across realms.** See storage.js above.
- **Clipboard writes from a message-triggered content-script context** (the context-menu and
  hotkey copy paths, and the popup's relay) rely on Chrome's Clipboard API treating the originating
  user gesture (menu click, key press) as still "active" by the time the async message arrives —
  this is standard, documented Chrome extension behavior, but hasn't been verified against a real
  Chrome install in this environment. If real-world testing turns up silent copy failures on those
  paths specifically (not the direct-write fallback), that's the first thing to check.
