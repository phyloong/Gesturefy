# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## What this is

Gesturefy is a Firefox-only (Manifest V2) mouse gesture extension. Everything in `src/` is the shipped extension: there is no `package.json`, no checked-in build tooling, no test suite, and no lint/format configuration. `src/manifest.json` is loaded directly as a temporary add-on (`strict_min_version` 148.0).

The only generated file in `src/` is `src/core/bundle/content.bundle.js` — a rollup CommonJS build of `src/core/content.mjs` plus every module it imports, needed because Firefox content scripts cannot be ES modules. Manifest points the content script at that bundle; background and options pages use native ES modules. **Any change to `content.mjs` or to a module it reaches (controllers, models, utils, both views, config-manager, listener-detach-observer, user-script-runner) has no effect until the bundle is rebuilt.** Rebuild steps and the rollup config are in `src/core/bundle/README.md`; the rollup output must stay `core/bundle/content.bundle.js`.

Packaging/release (CI does this on a published release via `.github/workflows/publish.yaml`, which also uploads to AMO):

```bash
cd src && zip -r ../extension.zip .
```

`extension.zip` at the repository root is generated and git-ignored.

## Runtime layout

Three contexts, all talking through `browser.runtime` messages:

1. **Background page** — `src/core/bundle/background.html` loads `src/core/background.mjs`. Owns the parsed `Gesture`/`Command` set, matches patterns against gestures, executes commands, handles install/update, and proxies API calls for user scripts.
2. **Content script** — the bundle in every frame at `document_start` (`all_frames`, `match_about_blank`, `match_origin_as_fallback`). Detects gestures, draws the overlay, and executes page-side helpers.
3. **Options/installation pages** — `src/views/options/index.html` and `src/views/installation/index.html`. The installation page loads `src/core/content.mjs` directly as a module (not through the bundle), so content-script-only APIs there must be optional.

### Gesture pipeline

`content.mjs` wires three controllers (`pointer`-based mouse gestures, rocker, wheel) to views and to the background:

- `MouseGestureController` is a state machine (PASSIVE → PENDING → ACTIVE/ABORTED) emitting `register`/`start`/`update`/`abort`/`end`; it uses capture-phase listeners on `window`, pointer capture, and coalesced pointer events.
- `PatternConstructor` turns the cursor path into a pattern: an array of `[dx, dy]` vectors, split when direction changes exceed a threshold. Patterns are compared with the stored gestures by `getClosestGestureByPattern` (`utils/matching-algorithms.mjs`): `strict` (proportional segment comparison), `shape-independent` (DTW), `combined` (default: DTW prefilter, then DTW + proportion).
- `MouseGestureView` renders the canvas trace and command label. Only the top frame draws; embedded frames translate coordinates with `window.mozInnerScreenX/Y` and forward messages to frame 0.
- `helpers/message-router.mjs` (loaded by the background) is what actually forwards those iframe messages: gesture-view messages go to frame 0, controller prevention messages go to every frame, and popup messages are returned so promise responses pass through.
- `PopupCommandView` appends an iframe popover (listed in `web_accessible_resources`) on `popupRequest` from a command, then the command opens a port named `PopupConnection` to deliver the list and receive the selection.
- `content.mjs` exposes `window.TARGET`, `isEditableInput`, `isScrollableY`, `scrollToY`, `getClosestElement` because commands inject code strings via `browser.tabs.executeScript`.
- `ListenerObserver` re-runs `main()` when `document.open()` wipes the injected listeners.

Zoom/scroll/selection commands all resolve the target frame with `sender.frameId ?? 0` and often fall back to frame 0 when the source frame has nothing to act on.

### Commands

`Command` (`core/models/command.mjs`) is a name plus a settings `Map`. `execute(sender, data)` calls the export of the same name from `core/commands.mjs` with `this` bound to the `Command` instance (so implementations use `this.getSetting("..."))`. `data` is a `GestureContextData` (target element, link, selection text, mouse endpoint in screen coordinates). Commands resolve to `true` on success and `undefined`/`false` when preconditions fail — `RunMultiPurposeCommand` chains commands and stops at the first `true`, so that convention is load-bearing.

Adding a command requires all of:

1. Export `async function Name (sender, data)` in `core/commands.mjs`.
2. Add `{ "command": "Name", "group": "..." }` (optionally with `settings` and `permissions`) to `resources/json/commands.json`; this drives the options command picker, default settings, and optional-permission prompts.
3. Add `commandLabelName` and `commandDescriptionName` to `_locales/en/messages.json`. `Command.toString()` resolves `commandLabel<Name>` via `browser.i18n`, so a missing key renders empty. Only the English file is edited upstream; other locales arrive through Crowdin.
4. For commands with settings, add a `<template data-commands="Name ...">` block to `views/options/fragments/command-setting-templates.inc` with `[name]` inputs matching the settings keys and `data-i18n` labels.
5. If a new API is needed, add it to `optional_permissions` in `manifest.json`; the options UI requests `commands.json` permissions when the command is picked (`command-select`/`command-multi-select`), when a gesture set is applied, and again on backup restore.

`ExecuteUserScript` runs user code in page scope via `window.wrappedJSObject.Function("TARGET", "API", code)` in `helpers/user-script-runner.mjs`; `API.*` calls are forwarded to the background `backgroundScriptAPICall` handler, which invokes `browser.<namespace>.<fn>(...)`.

### Configuration

`ConfigManager` (`helpers/config-manager.mjs`) is a synchronous cache over `browser.storage.local` with dotted-path `get`/`set`/`remove`, defaults from `resources/json/defaults.json`, an `autoUpdate` flag, and a `change` event. Each context constructs its own instance; they stay consistent through `browser.storage.onChanged`. Nothing may read config before `await Config.loaded`.

Config shape:

- `Settings.Gesture.*`, `Settings.Rocker.*`, `Settings.Wheel.*`, `Settings.General.*`
- `Gestures`: array of `{ pattern: [[x,y], ...], command: { name, settings? }, label? }`
- `Exclusions`: URL wildcard patterns matched per frame against `window.location.href` (`*` → `.*`, otherwise anchored literal)
- `GestureSets`: array of user-defined sets `{ id, name, gestures, createdAt }`; built-in sets are resources, not config entries
- `ActiveGestureSetId`: `string | null`, the last applied set id (`builtin:default`, `builtin:edge`, `user:<uuid>`), cleared when a gesture is added, edited, or deleted

Built-in sets live outside the config: Default is derived at runtime from `defaults.json`, Edge comes from `resources/json/gesture-sets.json`.

`core/migration.mjs` is imported by the background purely for upgrade side effects in its own `runtime.onInstalled` listener (v2 → 3.0 format, sync → local storage at 3.0.6, plus 3.2.x fixes such as renamed search commands and the `scrollProportion` setting); it is not part of the config API.

### Options UI

`views/options/index.html` loads the page modules; `main.mjs` fetches every `[data-include]` (`fragments/*.inc`) and binds each `[data-config="Dotted.Path"]` input to `Config` (numeric/boolean coercion on `change`). Interactive pieces are shadow-DOM custom elements in `views/options/components/`: `<command-select>`, `<command-multi-select>`, `<color-picker>` and `<popup-box>` are loaded by `index.html`; `<sortable-multi-select>` is the internal base element imported by `<command-multi-select>`. `exclusions.mjs` owns the Exclusions page and `data-management.mjs` owns reset/backup/restore (reset drops all `optional_permissions`; restore re-requests the permissions implied by the backed-up commands). `gestures.mjs` renders the gesture list with generated SVG thumbnails and records new gestures by driving `MouseGestureController` directly on the options page; it hands its `renderGestureList` to `gesture-sets.mjs`.

`gesture-sets.mjs` owns the gesture set bar under the gesture list, the selection panel, the set popups, and the leave guard. The bar shows the active set name or None, selecting a row previews that set read-only in the gesture list without writing the config, and Apply is the only write; it requests the set's optional permissions first and stays disabled while `commands.json` is unavailable. `gestures.mjs` writes gestures through `writeGestures`, which clears `ActiveGestureSetId` and calls `renderGestureSetBar()`. `<popup-box>` exposes an optional `validate` callback that can reject a close by returning `false`, which the save-as prompt uses to report an invalid name in place.

All user-visible strings go through `data-i18n` / `browser.i18n.getMessage`; only `_locales/en/messages.json` is edited upstream, translations arrive through Crowdin (`crowdin.yml`).

## Conventions and gotchas

- Imports are root-absolute ES module specifiers (`/core/...`, `/views/...`). Keep that style; rollup's custom `resolveId` depends on the leading slash.
- Do not convert the content script to `type: "module"`: the bundle exists precisely because that is unsupported there.
- Firefox-only APIs are used throughout (`browser.*` promises, `tabs.executeScript`, `window.mozInnerScreenX`, `cloneInto`, `wrappedJSObject`, `browserSettings`, popovers). Chrome compatibility is not a goal.
- Only the top frame renders UI; guard any view/popup work with `isEmbeddedFrame()` and route through messages otherwise.
- Code style is consistent across the codebase: 2-space indent, semicolons, `function name (args)` with a space before the parenthesis, large JSDoc block comments above public functions, and singleton default-export objects for controllers/views.
