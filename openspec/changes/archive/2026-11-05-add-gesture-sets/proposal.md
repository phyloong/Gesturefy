# Proposal

## Why

The Gestures tab currently exposes a single flat gesture list: users can add, edit, and delete individual gestures, but there is no way to keep, name, or switch between complete collections. Users who want an Edge-style layout have to rebuild it by hand, and there is no safe way to park a working set before experimenting with another one.

## What Changes

- Introduce **gesture sets**: named collections of gestures that can be applied, saved, and deleted.
- Ship two built-in sets: **Default** (derived from `resources/json/defaults.json`) and **Edge** (Edge's 16 mouse-gesture directions plus the Default set's Open Gesturefy settings gesture).
- Persist the active set id. Applying a set replaces `Gestures` and records the set id; adding, editing, or deleting a gesture clears the id and shows **None**.
- Add a sticky bar at the bottom of the Gestures tab reading **Gesture set:** followed by a dropdown that shows the current set name, **Save as…**, and an upward-opening menu of sets with name and description. The menu reuses the existing visual language, distinguishes applied from previewed sets, shows the replacement count, and dismisses on outside click, Escape, or its close button. All labels go through the existing i18n pipeline.
- Selecting a set only previews it: the gesture list temporarily shows that set and the menu stays open. **Apply** is the destructive step; closing the menu restores the stored gestures. Leaving the Gestures tab with a preview asks for confirmation.
- Saving the current gestures as a user set prompts for a name. User sets show a delete control on row hover; deleting asks for confirmation. Built-in sets cannot.
- If the persisted active id no longer resolves to a user-defined set, show an alert on load and fall back to **None** without touching the current gestures. An id naming a built-in set that the loaded resources do not contain is cleared silently, because no user data was lost.
- Built-in Edge set mapping: single directions scroll a page, two-stroke directions cover close, restore, new tab, reload, tab switching, stop, and close-other-tabs; the set also reuses the Default set's Open Gesturefy settings gesture. Its two `RestoreTab` gestures require the optional `sessions` permission, requested when the set is applied.

## Capabilities

### New Capabilities

- `gesture-sets`: named gesture collections, built-in presets, active-set persistence, apply/save/delete lifecycle, and the Edge preset mapping.

### Modified Capabilities

None. The project has no existing specs.

## Impact

- `views/options/fragments/gestures.inc` — sticky bar and selection panel markup.
- `views/options/index.html` — hosts the four gesture set popup boxes at body level.
- `views/options/gestures.mjs` — gesture list editor; routes every gesture write through the helper that clears the active id and refreshes the bar.
- `views/options/gesture-sets.mjs` — new module: built-in and user set resolution, bar and panel rendering, preview state, apply/save/delete, permission collection, and the leaving-page guard. It receives the gesture list renderer from `gestures.mjs` so the two modules do not import each other.
- `views/options/layout.css` — bar and panel styles built on existing tokens.
- `resources/json/defaults.json` — new `GestureSets` and `ActiveGestureSetId` defaults.
- `resources/json/gesture-sets.json` — new built-in Edge preset.
- `_locales/*/messages.json` — new strings; only the English source is maintained upstream.
- `AGENTS.md` — config shape documentation for the new keys.
- No changes to the background page or content script, so `content.bundle.js` does not need rebuilding.
- Backup/restore already serializes the whole config, so the new keys are included automatically; restore must tolerate a dangling active id.
