# Design

## Context

See `proposal.md` for motivation and `specs/gesture-sets/spec.md` for the behavior contract.

The Gestures tab is a single view: `views/options/fragments/gestures.inc` provides a search header, a `<ul id="gestureContainer">` whose first child is the add button, and a `<popup-box>` editor. `views/options/gestures.mjs` builds that list once from `Config.get("Gestures")`, keeps a `Map` from list item to `Gesture`, and writes the whole array back on every add, edit, or delete. It does not listen to config changes.

`Gestures` is the runtime source of truth: `background.mjs` rebuilds its gesture set from it on every storage change, and `content.mjs` reads the same key for controller settings. An active set identifier therefore must not become a second runtime input.

The options page already provides the pieces this feature needs: `ConfigManager` with dotted paths, `<popup-box>` with `confirm`/`prompt`/`alert` types, the light/dark/high-contrast token set in `layout.css`, and the `icon-delete` glyph. There is no test suite or build step for options-page modules.

## Goals / Non-Goals

**Goals:**

- Add gesture sets without changing how the extension resolves and executes gestures at runtime.
- Keep the new state compatible with existing configs, backups, and the storage-change reaction already used by the background page.
- Reuse the existing visual language rather than introducing a parallel one.
- Make switching destructive but deliberate, with an explicit Apply step and a way to preserve the current gestures first.

**Non-Goals:**

- Switching `Settings`, `Exclusions`, or any other config alongside the gestures.
- Editing, renaming, or deleting built-in sets.
- Adding a new command (including a true close-all-tabs command).
- Syncing sets across devices or sharing them as files.
- Refreshing the gesture list when the config changes in another tab; that limitation predates this change.

## Decisions

### Gestures stay authoritative; sets are snapshots

Applying a set copies its gesture array into `Config`, exactly like the current UI writes edits. The active identifier is metadata used only for display. This keeps `background.mjs`, `content.mjs`, migration, and the exclusion/matching logic untouched.

Alternative considered: make the active set the resolved source and derive `Gestures` from it. Rejected because every consumer of `Gestures` would need an effective-value resolver, and backup/restore and migration would inherit a new indirection for a UI-only feature.

### Persist the active identifier; clear it on edits

New config keys:

```
GestureSets: []                       // user-defined sets only
ActiveGestureSetId: null              // string | null
```

`GestureSets` is named for config consistency but holds user-defined sets only; built-ins are resources, not config entries.

A user set is `{ id, name, gestures, createdAt }`. Built-ins are not stored. Ids use namespaces rather than numeric ranges:

```
builtin:default
builtin:edge
user:<uuid>
```

The prefix makes ownership decidable without another field and avoids maintaining a numeric counter or colliding on restore.

The three existing write paths in `gestures.mjs` (add, edit, delete) are routed through a helper that writes `Gestures` and sets `ActiveGestureSetId` to `null` in the same step. Applying writes both keys with the set's id. Saving-as appends the new set and points the id at it: the snapshot is exactly the current gestures, so leaving the previous id would make the bar disagree with the content.

Alternative considered: derive the active set by deep-comparing `Gestures` with each set. Rejected because the user chose persisted state, and because it makes "current = None after edit" depend on floating-point equality of recorded patterns.

### Built-in definitions

- **Default** is generated at runtime from `resources/json/defaults.json` (`id: "builtin:default"`), so the shipped defaults stay single-sourced.
- **Edge** lives in a new `resources/json/gesture-sets.json` (`id: "builtin:edge"`) with i18n keys for its name and description. It is fetched by the options page only; the background page does not need it.

Both are merged with the user sets for display, built-ins first, then user sets by `createdAt`.

Established constraint: built-ins are snapshots too. If a future release edits `defaults.json` or the Edge table, users who previously applied the old snapshot keep the old gestures while the identifier still resolves. The identifier records provenance ("last applied"), not content equality.

### Explicit apply with permissions first

The selection panel stages a set in memory. `Apply` then:

1. Reads `commands.json` and collects the `permissions` of every command in the set.
2. Calls `browser.permissions.request` directly from the Apply click — no `permissions.contains` pre-check, because Firefox requires the request to originate from the user-input handler, and `request` resolves `true` without prompting when everything is already granted.
3. If the request is denied, aborts without writing anything.
4. Writes `Gestures` and `ActiveGestureSetId`.
5. Clears the preview and closes the panel so a successful apply cannot trigger the leave prompt.

This mirrors `views/options/data-management.mjs` restore, which already collects permissions the same way; keep the collector inside the gesture set module rather than refactoring the unrelated restore flow. The Edge set is the only built-in that currently triggers a request, through its two `RestoreTab` gestures (`sessions`).

Alternative considered: omit `RestoreTab` from the Edge set to keep built-ins permission-free. Rejected because the screenshot used as the source of truth includes reopen-closed-tab twice, and the user asked for a faithful mapping.

### Edge preset mapping

The preset is a direct transcription of Edge's 16 directions, plus the Open Gesturefy settings gesture copied verbatim from the Default set. Single Edge directions scroll a page; they are not top/bottom jumps.

| Edge direction | Command | Pattern |
|---|---|---|
| left | `PageBack` | `[[-1,0]]` |
| right | `PageForth` | `[[1,0]]` |
| up | `ScrollPageUp` | `[[0,-1]]` |
| down | `ScrollPageDown` | `[[0,1]]` |
| down then right | `CloseTab` | `[[0,1],[1,0]]` |
| left then up | `RestoreTab` | `[[-1,0],[0,-1]]` |
| right then up | `NewTab` | `[[1,0],[0,-1]]` |
| right then down | `ReloadTab` | `[[1,0],[0,1]]` |
| up then left | `FocusLeftTab` | `[[0,-1],[-1,0]]` |
| up then right | `FocusRightTab` | `[[0,-1],[1,0]]` |
| down then left | `StopLoading` | `[[0,1],[-1,0]]` |
| left then down | `CloseOtherTabs` | `[[-1,0],[0,1]]` |
| up then down | `ScrollBottom` | `[[0,-1],[0,1]]` |
| down then up | `ScrollTop` | `[[0,1],[0,-1]]` |
| left then right | `CloseTab` | `[[-1,0],[1,0]]` |
| right then left | `RestoreTab` | `[[1,0],[-1,0]]` |

The preset also includes `OpenAddonSettings` using the exact 16-vector pattern from `resources/json/defaults.json`. Copy the array verbatim rather than approximating a circle; this gesture does not exist in Edge and is included at the user's request.

Three deviations are intentional. They are documented here rather than in the UI, the built-in description stays a one-line summary:

- Edge's "close all tabs" maps to `CloseOtherTabs`, which keeps the current tab and skips pinned tabs.
- `RestoreTab` requires the optional `sessions` permission, requested on apply.
- The settings gesture is a Gesturefy-specific addition with no Edge counterpart.

The two-stroke directions depend on drawing a visible corner, see Risks.

Unit vectors are safe: thumbnails fit the path by bounding box, and matching compares direction and proportion, not stored pixel length. Two-stroke patterns must be transcribed in Edge's order; `up then left` and `left then up` are different gestures.

### UI structure

`gestures.inc` gains, after the list:

- a sticky bar (`.gs-bar`) reading "Gesture set:" followed by a dropdown trigger that shows the current set name (or None), and a save-as button;
- an upward-opening dropdown (`.gs-panel`) anchored to the trigger, with the merged set list (name and description, Edge's description kept to one sentence), built-in tags, user-only delete controls revealed on row hover, a replacement warning, and cancel/apply buttons.

Selecting a row previews the set: the gesture list is rebuilt from that set's gestures in memory, the trigger shows the previewed name, and nothing is written to the config. The dropdown stays open. Clicking the applied set does not enter preview; it clears any preview and leaves Apply disabled. Apply is the only action that writes. Closing the dropdown (outside click, Escape, close button, cancel) discards the preview and rebuilds the list from the stored gestures. The gesture list is inert while previewing, so an edit cannot write the preview to the config. Deleting the previewed set also discards the preview.

The four `<popup-box>` instances (save-name prompt, delete confirmation, dangling-id alert, leave confirmation) live in `views/options/index.html` at body level, outside `.content`, so they render from any tab instead of being clipped or hidden with the gestures tab.

The save-name prompt validates before it closes: `<popup-box>` calls an optional `validate` callback with the closing value, and a `false` return keeps the popup open. The prompt reports the rejected name in place instead of closing and reopening itself.

The set domain lives in `views/options/gesture-sets.mjs`; `gestures.mjs` keeps the gesture list editor. The two would otherwise import each other, so `gestures.mjs` passes its `renderGestureList` into `initGestureSets` and calls the exported `renderGestureSetBar` after a gesture write. Set ownership is decided by the reserved `builtin:` id namespace rather than by the loaded resources, so the panel cannot offer a delete control for a stored set while the resources are still loading.

All labels are supplied through `browser.i18n.getMessage`; this document names controls, not their literal text.

Styling uses only existing tokens and shapes: `var(--base-color)` surfaces, `1px solid var(--border-color)`, `border-radius: 2px`, the `0 0 10px -4px var(--shadow-color)` hover shadow, 14px/0.5-opacity secondary text, `var(--highlighted-color)` for the applied marker, and `var(--warning-color)` for delete. The delete control reuses `icon-delete` (the X glyph) inside a 24px circle: transparent background and warning-colored icon while visible, warning background and base-colored icon on hover/focus. It is only revealed while the row is hovered or focused. The 24px size sits between the 18px `.excl-remove-button` and the 30px `.gl-remove-button`, while reusing their color and hover semantics.

Applied and previewed are visually distinct: applied gets a check in the highlight color, previewed gets a left inset marker, row emphasis and the preview label. The trigger shows the previewed set while previewing, and the applied set otherwise.

Bottom anchoring uses `position: sticky; bottom: 0` inside `#Gestures`, with a minimum content height so short lists still anchor the bar to the viewport bottom. This avoids `position: fixed` and its sidebar offset, and avoids restructuring the existing grid-based list.

Leaving-page guard: capture sidebar link clicks and `hashchange`. When a set is previewed and the target is not `#Gestures`, prevent navigation, show the leave confirmation, and only navigate after confirmation. Closing the dropdown discards the preview silently. No `beforeunload` handler: closing or reloading the options tab is deliberately outside the guard, which covers in-page navigation only.

### Dangling identifier recovery

On options load, resolve `ActiveGestureSetId` against built-ins plus user sets. If it does not resolve to a user-defined set, show an in-page alert, set the identifier to `null`, and leave `Gestures` untouched. The active id is metadata only, so no runtime behavior is affected by the dangling state; the alert exists to explain why the bar falls back to None.

An identifier that names a built-in set which the loaded resources do not contain is cleared without an alert: built-ins are resources, so a missing one means the resource is unavailable rather than that the user lost a set. The resolution also waits for both built-in resources, so a failing fetch cannot turn a valid id into a false dangling state.

Normal deletion of the active set clears the identifier immediately, so this recovery path is reached only by restore, older data, or corruption.

## Risks / Trade-offs

- **Two-stroke recognition depends on drawing a corner** → `PatternConstructor` splits above roughly 7 degrees and drops segments shorter than 10px. Recorded in the Edge preset section above; the UI description stays a one-line summary. Do not special-case the algorithm.
- **Applying replaces hand-made gestures with no undo** → the selection is previewed and the panel states how many gestures will be replaced; the save-as action is the explicit escape hatch. Do not auto-snapshot.
- **Duplicate or near-duplicate patterns are allowed** → the matcher already returns the closest gesture and the editor only warns on similarity. Built-in sets are internally distinct; user sets may not be. No dedupe in this change.
- **Identifier drift after preset updates** → the active id records what was last applied, not byte equality with the current preset. Accept this; versioning built-in presets is deferred.
- **Another options tab can hold a stale list** → this predates the change. Applying in the active tab re-renders it; cross-tab refresh is out of scope.
- **Permission denial blocks the apply** → intentional, so the Edge set never silently loses its two restore gestures. The user can grant the permission later and retry.
- **`CloseOtherTabs` is not Edge's close-all** → documented in the set description; adding a true `CloseAllTabs` command is out of scope.

## Migration Plan

- Add `GestureSets: []` and `ActiveGestureSetId: null` to `resources/json/defaults.json`. Existing installs resolve both through the defaults fallback; read them defensively as `?? []` and `?? null`.
- No versioned migration is needed: older configs simply have no active set and display None.
- Backups include both keys automatically because they serialize the whole config. Restoring a config whose active id does not resolve exercises the dangling-id path.
- Rollback: remove the bar and panel; the two keys remain inert in storage and can be left or cleared.

## Open Questions

- Whether to add a real `CloseAllTabs` command and remap Edge's close-all direction once available.
- Whether built-in presets should carry a version or hash so the UI can detect that an applied snapshot is outdated after an update.
