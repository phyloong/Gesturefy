# Tasks

## 1. Data and resources

- [x] 1.1 Add `GestureSets: []` and `ActiveGestureSetId: null` to `resources/json/defaults.json`, and verify `node -e "const d=require('./src/resources/json/defaults.json'); console.log(d.GestureSets, d.ActiveGestureSetId)"` prints the new keys.
- [x] 1.2 Create `resources/json/gesture-sets.json` with the 17-entry Edge preset from `design.md` (16 Edge directions plus the OpenAddonSettings gesture copied verbatim from `defaults.json`) and i18n keys for its name and description, and verify the file parses and contains exactly 17 gestures whose command names all exist in `resources/json/commands.json`.
- [x] 1.3 Add the new strings to `_locales/en/messages.json` (bar label and buttons, built-in tag, applied/preview text, save prompt, delete confirmation, leave confirmation, dangling-id alert, Default/Edge names and descriptions), and verify every new `data-i18n` value and `browser.i18n.getMessage` key used by the feature resolves to a non-empty message.
- [x] 1.4 Update the config shape section of `AGENTS.md` with the two new keys, and verify the documented shape matches `defaults.json`.

## 2. Set model and persistence

- [x] 2.1 Implement built-in and user set resolution in `views/options/gesture-sets.mjs` (Default derived from `defaults.json`, Edge from `gesture-sets.json`, user sets from config, ids in separate namespaces validated against the loaded resources), and verify the options page lists Default and Edge before any user set exists.
- [x] 2.2 Route the existing add, edit, and delete writes in `views/options/gestures.mjs` through a helper that writes `Gestures` and clears `ActiveGestureSetId`, and verify editing any gesture changes the bar to None and that None survives a reload.
- [x] 2.3 Implement the dangling-identifier check on load: alert, clear the identifier, leave `Gestures` untouched, skip the check while the built-in resources are unavailable, and verify by setting a bogus `ActiveGestureSetId` in storage and reloading the options page.
- [x] 2.4 Implement the active-set read path and display name fallback (name or None), and verify applying a set then reloading restores the name.

## 3. UI shell

- [x] 3.1 Add the sticky bar markup and styles to `gestures.inc` and `layout.css`, and verify it stays anchored at the bottom with both a short and a long gesture list.
- [x] 3.2 Add the upward-opening panel with the merged list, built-in tags, applied and preview markers, and user-only delete controls, and verify selecting a row previews it without writing the stored gestures.
- [x] 3.3 Add panel open/close behavior (outside click, Escape, explicit close discards the preview), and verify closing the panel clears the preview without a prompt.
- [x] 3.4 Apply the existing tokens to the bar, panel, rows, buttons, focus states, and the 24px `icon-delete` control, and verify the result in light, dark, and high-contrast themes.

## 4. Apply, save, and delete flows

- [x] 4.1 Implement Apply with permission collection from `commands.json`, `permissions.request`, denial abort, the `Gestures` + active-id write, and clearing the preview and closing the panel; verify applying Edge without `sessions` prompts, denial changes nothing, grant applies all 17 gestures, and leaving the tab immediately after Apply does not prompt. Verify Apply stays disabled when `commands.json` failed to load.
- [x] 4.2 Implement Save-as with the name prompt and trimmed, case-insensitive validation (empty, whitespace-only, built-in name, duplicate user name), and verify a valid name creates an active set with unchanged gestures while invalid names create nothing and keep the prompt open.
- [x] 4.3 Implement delete confirmation for user sets only, and verify deleting the active set yields None with unchanged gestures, deleting a previewed set clears the preview, and built-ins expose no delete control.
- [x] 4.4 Re-render the gesture list after apply, save, and delete, and verify the visible list matches the stored config without a page reload.

## 5. Leaving-page guard

- [x] 5.1 Intercept sidebar navigation and `hashchange` while a set is previewed, show the leave confirmation, and verify cancelling stays on the Gestures tab while confirming navigates and discards the preview.
- [x] 5.2 Verify no confirmation appears when nothing is previewed, including immediately after a successful Apply and when navigating away without a preview.

## 6. Integration checks

- [x] 6.1 Run `openspec validate add-gesture-sets` and `node --check` on each changed `.mjs` file, and verify both pass.
- [x] 6.2 Verify a backup includes `GestureSets` and `ActiveGestureSetId`, and that restoring a config with an unresolvable active id shows the alert and falls back to None.
- [x] 6.3 Verify `git status` shows changes only under `src/views/options/`, `src/resources/json/`, `src/_locales/`, and `AGENTS.md`, confirming `content.bundle.js`, the background page, and the content script were not modified.
