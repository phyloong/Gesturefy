import { Config } from "/views/options/main.mjs";

import { fetchJSONAsObject } from "/core/utils/commons.mjs";

// renders the gesture list, injected by the gestures page module which owns the list
let renderGestureList = null;

// stores the built-in gesture sets (default and edge) loaded from the extension resources
let builtinGestureSets = [];

// set to true once both built-in resources are loaded, ownership, name validation and the dangling check depend on it
let builtinSetsLoaded = false;

// stores the command definitions which are used to look up the permissions of a command
let commandDefinitions = null;

// stores the id of the gesture set which is currently previewed in the gesture set menu
let previewSetId = null;

// set to true while the page hash is restored to prevent the leave confirmation from firing again
let isRestoringHash = false;


/**
 * Adds the gesture set bar, the selection panel and the popups and loads the built-in sets
 * The given render function is used to show either the stored or the previewed gestures
 **/
export function initGestureSets ({ renderGestureList: renderer }) {
  if (typeof renderer !== "function") {
    throw new TypeError("initGestureSets requires a renderGestureList callback");
  }
  renderGestureList = renderer;

  gestureSetSetup();
  // load the built-in gesture sets, the bar cannot tell None from a built-in set before the resources are known
  loadGestureSets().then(onGestureSetsLoaded).catch((error) => console.error(error));
}


/**
 * Loads the built-in gesture sets from the extension resources.
 * The default set is derived from the default gestures, the remaining built-in sets are read from the gesture sets resource.
 **/
async function loadGestureSets () {
  // settle every resource separately so a failing source does not discard the others
  const [defaultsResult, gestureSetsResult, commandsResult] = await Promise.allSettled([
    fetchJSONAsObject(browser.runtime.getURL("/resources/json/defaults.json")),
    fetchJSONAsObject(browser.runtime.getURL("/resources/json/gesture-sets.json")),
    fetchJSONAsObject(browser.runtime.getURL("/resources/json/commands.json"))
  ]);

  // a missing command resource must not degrade to an empty permission list, apply stays disabled instead
  commandDefinitions = (commandsResult.status === "fulfilled" && Array.isArray(commandsResult.value)) ?
    commandsResult.value :
    null;

  const defaults = defaultsResult.status === "fulfilled" ? defaultsResult.value : null;
  const gestureSetsResource = gestureSetsResult.status === "fulfilled" ? gestureSetsResult.value : null;

  builtinGestureSets = [
    ...(Array.isArray(defaults?.Gestures) ?
      [{
        id: "builtin:default",
        nameKey: "gestureSetDefaultName",
        descriptionKey: "gestureSetDefaultDescription",
        gestures: defaults.Gestures
      }] :
      []),
    ...(Array.isArray(gestureSetsResource) ? gestureSetsResource : [])
  ];

  // both resources are required for a complete built-in list
  builtinSetsLoaded = Array.isArray(defaults?.Gestures) && Array.isArray(gestureSetsResource);
}


/**
 * Updates the gesture set ui after the built-in gesture sets have been loaded
 * Reports an active gesture set id which does not resolve to any set,
 * refreshes the bar and the panel state and re-renders the list if the panel is open
 **/
function onGestureSetsLoaded () {
  // saving a set compares the name against the built-in names, so it needs both resources
  document.getElementById("gestureSetSaveButton").disabled = !builtinSetsLoaded;
  checkActiveGestureSetId();
  renderGestureSetBar();
  updateGestureSetPanelState();
  // the panel can already be open if the user opened it before the resources were loaded
  if (!document.getElementById("gestureSetPanel").hidden) renderGestureSetList();
}


/**
 * Returns all gesture sets, built-in sets first followed by the user defined sets sorted by their creation date
 **/
function getGestureSets () {
  // a stored set must never shadow a built-in set, everything else counts as user defined
  const userGestureSets = (Config.get("GestureSets") ?? [])
    .filter((gestureSet) => gestureSet && !isBuiltinSet(gestureSet))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  return [ ...builtinGestureSets, ...userGestureSets ];
}


/**
 * Returns the gesture set with the given id or null if it does not exist
 **/
function findGestureSet (id) {
  if (id === null || id === undefined) return null;
  return getGestureSets().find((gestureSet) => gestureSet.id === id) ?? null;
}


/**
 * Returns true if the given gesture set belongs to the built-in sets
 * The reserved id namespace decides ownership, so it does not depend on the resources being loaded
 **/
function isBuiltinSet (gestureSet) {
  return typeof gestureSet.id === "string" && gestureSet.id.startsWith("builtin:");
}


/**
 * Returns the id of the currently active gesture set or null
 **/
function getActiveSetId () {
  return Config.get("ActiveGestureSetId") ?? null;
}


/**
 * Returns the display name of the given gesture set
 **/
function getDisplayName (gestureSet) {
  if (!gestureSet) return "";
  if (isBuiltinSet(gestureSet)) return browser.i18n.getMessage(gestureSet.nameKey);
  return gestureSet.name ?? "";
}


/**
 * Returns the translated description of the given built-in gesture set or an empty string
 **/
function getBuiltinDescription (gestureSet) {
  if (isBuiltinSet(gestureSet) && gestureSet.descriptionKey) {
    return browser.i18n.getMessage(gestureSet.descriptionKey);
  }
  return "";
}


/**
 * Checks if the persisted active gesture set id resolves to an existing set
 * Clears the id if it does not resolve, only a missing user defined set is reported to the user
 **/
function checkActiveGestureSetId () {
  const activeSetId = getActiveSetId();
  // only a stored string can point to a set
  if (typeof activeSetId !== "string" || !activeSetId) return;

  const isBuiltinId = activeSetId.startsWith("builtin:");
  // a built-in id can only be judged against the loaded resources, a failing fetch must not discard it
  if (isBuiltinId && !builtinSetsLoaded) return;
  // user defined sets are resolvable without the built-in resources
  if (findGestureSet(activeSetId)) return;

  Config.set("ActiveGestureSetId", null);

  // a built-in set which is not part of the loaded resources means the resource is unavailable,
  // the user did not lose any data, so there is nothing to report
  if (isBuiltinId) {
    console.warn(
      "Active gesture set is not part of the loaded resources",
      activeSetId,
      getGestureSets().map((gestureSet) => gestureSet.id)
    );
    return;
  }

  const gestureSetDanglingPopup = document.getElementById("gestureSetDanglingPopup");
        gestureSetDanglingPopup.open = true;
}


/**
 * Adds the necessary event listeners for the gesture set bar, panel, popups and the leaving page guard
 **/
function gestureSetSetup () {
  const gestureSetSelectButton = document.getElementById("gestureSetSelectButton");
        gestureSetSelectButton.onclick = onGestureSetSelectButtonClick;
        gestureSetSelectButton.title = browser.i18n.getMessage('gestureSetSelectButton');
        gestureSetSelectButton.setAttribute("aria-label", browser.i18n.getMessage('gestureSetSelectButton'));
  const gestureSetSaveButton = document.getElementById("gestureSetSaveButton");
        gestureSetSaveButton.onclick = onGestureSetSaveButtonClick;
        // saving needs the built-in names to reject duplicates
        gestureSetSaveButton.disabled = true;
  const gestureSetPanelCloseButton = document.getElementById("gestureSetPanelCloseButton");
        gestureSetPanelCloseButton.onclick = dismissGestureSetPanel;
        gestureSetPanelCloseButton.title = browser.i18n.getMessage('gestureSetCancelButton');
        gestureSetPanelCloseButton.setAttribute("aria-label", browser.i18n.getMessage('gestureSetCancelButton'));
  const gestureSetCancelButton = document.getElementById("gestureSetCancelButton");
        gestureSetCancelButton.onclick = dismissGestureSetPanel;
  const gestureSetApplyButton = document.getElementById("gestureSetApplyButton");
        gestureSetApplyButton.onclick = onGestureSetApplyButtonClick;
  const gestureSetSavePopup = document.getElementById("gestureSetSavePopup");
        gestureSetSavePopup.validate = validateGestureSetName;
        gestureSetSavePopup.onclose = onGestureSetSavePopupClose;

  // close the panel on outside clicks and escape, discard the preview silently
  document.addEventListener("pointerdown", onDocumentPointerdown, true);
  document.addEventListener("keydown", onDocumentKeydown);
  // intercept navigation away from the gestures tab while a set is previewed
  document.addEventListener("click", onSidebarLinkClick, true);
  window.addEventListener("hashchange", onWindowHashchange);
}


/**
 * Renders the gesture set menu trigger which shows the previewed set or the applied set
 * The owner of the gesture list calls this after every gesture write, the bar must fall back to None
 **/
export function renderGestureSetBar () {
  const gestureSetBarName = document.getElementById("gestureSetBarName");
  const displayedGestureSet = findGestureSet(previewSetId ?? getActiveSetId());

  gestureSetBarName.textContent = displayedGestureSet ?
    getDisplayName(displayedGestureSet) :
    browser.i18n.getMessage('gestureSetNone');
}


/**
 * Renders all gesture sets in the gesture set panel
 **/
function renderGestureSetList () {
  const gestureSetList = document.getElementById("gestureSetList");
        gestureSetList.textContent = "";

  const fragment = document.createDocumentFragment();
  for (const gestureSet of getGestureSets()) {
    fragment.append(createGestureSetListItem(gestureSet));
  }
  gestureSetList.append(fragment);
}


/**
 * Creates and returns a gesture set list item html element by the given gesture set
 **/
function createGestureSetListItem (gestureSet) {
  const listItem = document.createElement("li");
        listItem.classList.add("gs-item");
        listItem.dataset.gestureSetId = gestureSet.id;
        listItem.onclick = onGestureSetItemClick;

  if (previewSetId === gestureSet.id) listItem.classList.add("gs-item-preview");

  const mainField = document.createElement("div");
        mainField.classList.add("gs-item-main");
  const headField = document.createElement("div");
        headField.classList.add("gs-item-head");

  const nameField = document.createElement("span");
        nameField.classList.add("gs-item-name");
        nameField.textContent = getDisplayName(gestureSet);
  headField.append(nameField);

  // built-in sets are marked and cannot be deleted
  if (isBuiltinSet(gestureSet)) headField.append(createGestureSetTag("gs-item-tag", "gestureSetBuiltinTag"));

  // mark the applied set
  if (gestureSet.id === getActiveSetId()) headField.append(createGestureSetTag("gs-item-applied", "gestureSetApplied"));

  // mark the previewed set if it differs from the applied set
  if (gestureSet.id === previewSetId && previewSetId !== getActiveSetId()) {
    headField.append(createGestureSetTag("gs-item-preview-tag", "gestureSetStaged"));
  }

  mainField.append(headField);

  const description = getBuiltinDescription(gestureSet);
  if (description) {
    const descriptionField = document.createElement("p");
          descriptionField.classList.add("gs-item-description");
          descriptionField.textContent = description;
    mainField.append(descriptionField);
  }

  listItem.append(mainField);

  // only user defined sets can be deleted
  if (!isBuiltinSet(gestureSet)) {
    const removeButton = document.createElement("button");
          removeButton.classList.add("gs-item-delete", "icon-delete");
          removeButton.type = "button";
          removeButton.title = browser.i18n.getMessage('gestureSetDeleteButton');
          removeButton.setAttribute("aria-label", browser.i18n.getMessage('gestureSetDeleteButton'));
          removeButton.onclick = onGestureSetDeleteButtonClick;
    listItem.append(removeButton);
  }

  return listItem;
}


/**
 * Creates and returns a small label spanning the given translated message with the given class
 **/
function createGestureSetTag (className, messageKey) {
  const tagField = document.createElement("span");
        tagField.classList.add(className);
        tagField.textContent = browser.i18n.getMessage(messageKey);
  return tagField;
}


/**
 * Opens the gesture set panel
 **/
function openGestureSetPanel () {
  const gestureSetPanel = document.getElementById("gestureSetPanel");
        gestureSetPanel.hidden = false;
  document.getElementById("gestureSetSelectButton").setAttribute("aria-expanded", "true");

  renderGestureSetList();
  updateGestureSetPanelState();
}


/**
 * Closes the gesture set menu without touching the preview
 **/
function closeGestureSetPanel () {
  const gestureSetPanel = document.getElementById("gestureSetPanel");
        gestureSetPanel.hidden = true;
  document.getElementById("gestureSetSelectButton").setAttribute("aria-expanded", "false");
}


/**
 * Closes the gesture set menu and discards the preview
 **/
function dismissGestureSetPanel () {
  clearPreviewSet();
  closeGestureSetPanel();
}


/**
 * Clears the preview and restores the stored gestures
 **/
function clearPreviewSet () {
  if (previewSetId === null) return;
  previewSetId = null;
  renderGestureList();
  refreshGestureSetUi();
}


/**
 * Renders the set list, the panel state and the bar after the set state changed
 **/
function refreshGestureSetUi () {
  renderGestureSetList();
  updateGestureSetPanelState();
  renderGestureSetBar();
}


/**
 * Updates the apply button and the replacement hint according to the preview
 **/
function updateGestureSetPanelState () {
  const gestureSetApplyButton = document.getElementById("gestureSetApplyButton");
  const gestureSetReplaceHint = document.getElementById("gestureSetReplaceHint");
  // apply is only meaningful for a preview which differs from the applied set
  const isPreviewing = previewSetId !== null && previewSetId !== getActiveSetId();

  // without the command definitions the required permissions are unknown, so applying is not safe
  gestureSetApplyButton.disabled = !isPreviewing || commandDefinitions === null;
  gestureSetReplaceHint.textContent = isPreviewing ?
    browser.i18n.getMessage("gestureSetReplaceHint", [ String((Config.get("Gestures") ?? []).length) ]) :
    "";
}


/**
 * Toggles the gesture set menu
 **/
function onGestureSetSelectButtonClick () {
  const gestureSetPanel = document.getElementById("gestureSetPanel");
  if (gestureSetPanel.hidden) openGestureSetPanel();
  else dismissGestureSetPanel();
}


/**
 * Previews the clicked gesture set without writing it to the config
 * Clicking the applied set clears the preview instead, it would not change anything
 **/
function onGestureSetItemClick () {
  const setId = this.dataset.gestureSetId;
  const gestureSet = findGestureSet(setId);
  if (!gestureSet) return;

  if (setId === getActiveSetId()) {
    clearPreviewSet();
    return;
  }

  previewSetId = setId;
  refreshGestureSetUi();
  // show the gestures of the set, the preview stays in memory until it is applied
  renderGestureList(gestureSet.gestures, true);
}


/**
 * Closes the gesture set panel on outside clicks
 * Clicks on the panel, the toggler, the sidebar navigation and popups are ignored
 **/
function onDocumentPointerdown (event) {
  const gestureSetPanel = document.getElementById("gestureSetPanel");
  if (gestureSetPanel.hidden) return;
  if (event.target.closest("#gestureSetPanel")) return;
  if (event.target.closest("#gestureSetSelectButton")) return;
  if (event.target.closest("#Sidebar a[href^=\"#\"]")) return;
  if (event.target.closest("popup-box")) return;

  dismissGestureSetPanel();
}


/**
 * Closes the gesture set panel on escape
 **/
function onDocumentKeydown (event) {
  if (event.key !== "Escape") return;
  // an open popup owns the escape key and must not silently drop the preview
  if (document.querySelector("popup-box[open]")) return;
  const gestureSetPanel = document.getElementById("gestureSetPanel");
  if (gestureSetPanel.hidden) return;

  dismissGestureSetPanel();
}


/**
 * Applies the previewed gesture set
 * Requests the missing optional permissions first, aborts if they are denied
 **/
async function onGestureSetApplyButtonClick () {
  const gestureSet = findGestureSet(previewSetId);
  // without the command definitions the permissions of the set are unknown
  if (!gestureSet || commandDefinitions === null) return;

  const gestureSetApplyButton = document.getElementById("gestureSetApplyButton");
        gestureSetApplyButton.disabled = true;

  // the request has to be the first await in the click handler to keep the firefox user activation
  // firefox resolves true without prompting if all permissions are already granted, so no pre-check is needed
  try {
    const granted = await browser.permissions.request({
      permissions: collectSetPermissions(gestureSet)
    });
    // abort without changing anything if the permissions were denied
    if (!granted) {
      updateGestureSetPanelState();
      return;
    }
  }
  catch (error) {
    // abort without changing anything if the request itself failed
    console.error(error);
    updateGestureSetPanelState();
    return;
  }

  // abort if the panel was dismissed or the set vanished while the permission request was open
  if (previewSetId !== gestureSet.id || !findGestureSet(previewSetId)) {
    updateGestureSetPanelState();
    return;
  }

  Config.set("Gestures", gestureSet.gestures);
  Config.set("ActiveGestureSetId", gestureSet.id);

  // clear the preview and close the menu so leaving the tab does not prompt
  clearPreviewSet();
  closeGestureSetPanel();
}


/**
 * Gives the user the possibility to save the current gestures as a user defined gesture set
 * A preview is discarded first, so the stored gestures are saved and not the previewed ones
 **/
function onGestureSetSaveButtonClick () {
  dismissGestureSetPanel();

  const gestureSetSavePopup = document.getElementById("gestureSetSavePopup");
  const gestureSetSaveMessage = document.getElementById("gestureSetSaveMessage");
  // a rejected attempt leaves its error message behind, only then the description has to be restored
  if (gestureSetSaveMessage.dataset.invalid) {
    gestureSetSaveMessage.textContent = browser.i18n.getMessage('gestureSetSaveDescription');
    delete gestureSetSaveMessage.dataset.invalid;
  }
  gestureSetSavePopup.open = true;
}


/**
 * Validates the entered name before the popup closes
 * Reports the problem in the popup and keeps it open by returning false
 **/
function validateGestureSetName (value) {
  // cancelled popups pass null or false, there is nothing to validate
  if (typeof value !== "string") return true;

  const errorKey = getGestureSetNameErrorKey(value.trim());
  if (!errorKey) return true;

  const gestureSetSaveMessage = document.getElementById("gestureSetSaveMessage");
        gestureSetSaveMessage.textContent = browser.i18n.getMessage(errorKey);
        gestureSetSaveMessage.dataset.invalid = "true";
  return false;
}


/**
 * Creates a user defined gesture set from the entered name if the popup was confirmed
 **/
function onGestureSetSavePopupClose (event) {
  if (typeof event.detail !== "string") return;

  saveGestureSet(event.detail.trim());
}


/**
 * Returns the i18n key of the validation error for the given gesture set name or null if the name is valid
 * Names are trimmed and compared case-insensitively
 **/
function getGestureSetNameErrorKey (name) {
  if (!name) return "gestureSetSaveInvalidEmpty";

  const normalizedName = name.toLocaleLowerCase();

  const isBuiltinName = builtinGestureSets.some((gestureSet) => {
    return browser.i18n.getMessage(gestureSet.nameKey).toLocaleLowerCase() === normalizedName;
  });
  if (isBuiltinName) return "gestureSetSaveInvalidBuiltin";

  const isUserName = (Config.get("GestureSets") ?? []).some((gestureSet) => {
    return (gestureSet.name ?? "").toLocaleLowerCase() === normalizedName;
  });
  if (isUserName) return "gestureSetSaveInvalidDuplicate";

  return null;
}


/**
 * Saves the current gestures as a user defined gesture set and makes it the active set
 **/
function saveGestureSet (name) {
  const gestureSets = Config.get("GestureSets") ?? [];
  const gestureSet = {
    id: `user:${crypto.randomUUID()}`,
    name: name,
    // snapshot of the current gestures, the gestures themselves stay untouched
    gestures: Config.get("Gestures") ?? [],
    createdAt: Date.now()
  };
  gestureSets.push(gestureSet);

  Config.set("GestureSets", gestureSets);
  // the snapshot is exactly the current gestures so the new set can be active
  Config.set("ActiveGestureSetId", gestureSet.id);

  // the save button closes the panel before it opens the prompt, so only the ui needs to catch up
  refreshGestureSetUi();
}


/**
 * Opens the delete confirmation for the clicked user defined gesture set
 **/
function onGestureSetDeleteButtonClick (event) {
  // prevent the click from previewing the set
  event.stopPropagation();

  const setId = this.closest(".gs-item").dataset.gestureSetId;
  const gestureSet = findGestureSet(setId);
  if (!gestureSet || isBuiltinSet(gestureSet)) return;

  const gestureSetDeletePopup = document.getElementById("gestureSetDeletePopup");
  const gestureSetDeleteMessage = document.getElementById("gestureSetDeleteMessage");
        gestureSetDeletePopup.dataset.gestureSetId = setId;
        gestureSetDeletePopup.addEventListener("close", onGestureSetDeletePopupClose, { once: true });
        gestureSetDeleteMessage.textContent = browser.i18n.getMessage(
          "gestureSetDeleteConfirm",
          [ getDisplayName(gestureSet) ]
        );
        gestureSetDeletePopup.open = true;
}


/**
 * Deletes the confirmed user defined gesture set without changing the gestures
 **/
function onGestureSetDeletePopupClose (event) {
  const gestureSetDeletePopup = event.currentTarget;
  const setId = gestureSetDeletePopup.dataset.gestureSetId;
  delete gestureSetDeletePopup.dataset.gestureSetId;

  if (event.detail !== true || !setId) return;

  const gestureSets = (Config.get("GestureSets") ?? []).filter((gestureSet) => gestureSet.id !== setId);
  Config.set("GestureSets", gestureSets);

  if (getActiveSetId() === setId) Config.set("ActiveGestureSetId", null);
  // a deleted set cannot stay previewed
  if (previewSetId === setId) previewSetId = null;

  refreshGestureSetUi();

  // keep the preview of another set, otherwise fall back to the stored gestures
  const previewedGestureSet = findGestureSet(previewSetId);
  if (previewedGestureSet) renderGestureList(previewedGestureSet.gestures, true);
  else renderGestureList();
}


/**
 * Collects the deduped optional permissions of all commands used by the given gesture set
 * Only called while the command definitions are loaded
 **/
function collectSetPermissions (gestureSet) {
  const requiredPermissions = [];

  for (const gesture of gestureSet.gestures ?? []) {
    const commandItem = commandDefinitions.find((element) => element.command === gesture.command?.name);
    if (!commandItem || !commandItem.permissions) continue;
    for (const permission of commandItem.permissions) {
      if (!requiredPermissions.includes(permission)) requiredPermissions.push(permission);
    }
  }

  return requiredPermissions;
}


/**
 * Intercepts sidebar navigation away from the gestures tab while a gesture set is previewed
 **/
function onSidebarLinkClick (event) {
  // only intercept plain left clicks, modified clicks must keep their native behavior
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

  const link = event.target.closest('#Sidebar a[href^="#"]');
  if (!link) return;

  const targetHash = link.getAttribute("href");
  if (targetHash === "#Gestures" || previewSetId === null) return;

  event.preventDefault();
  requestLeaveConfirmation(targetHash);
}


/**
 * Intercepts hash changes away from the gestures tab while a gesture set is previewed
 **/
function onWindowHashchange () {
  // ignore hash changes which were triggered to restore the previous hash
  if (isRestoringHash) {
    isRestoringHash = false;
    return;
  }
  if (previewSetId === null) {
    // nothing is previewed, so the menu must not stay open after navigating
    closeGestureSetPanel();
    return;
  }

  const targetHash = window.location.hash;
  if (targetHash === "#Gestures") return;

  // return to the gestures tab first, otherwise the confirmation would be hidden with the tab
  navigateToHash("#Gestures");
  requestLeaveConfirmation(targetHash);
}


/**
 * Opens the leave confirmation for the given navigation target
 **/
function requestLeaveConfirmation (targetHash) {
  const gestureSetLeavePopup = document.getElementById("gestureSetLeavePopup");
        gestureSetLeavePopup.dataset.targetHash = targetHash;
        gestureSetLeavePopup.addEventListener("close", onGestureSetLeavePopupClose, { once: true });
        gestureSetLeavePopup.open = true;
}


/**
 * Discards the preview and navigates on confirmation, stays on the gestures tab otherwise
 **/
function onGestureSetLeavePopupClose (event) {
  const gestureSetLeavePopup = event.currentTarget;
  const targetHash = gestureSetLeavePopup.dataset.targetHash;
  delete gestureSetLeavePopup.dataset.targetHash;

  if (event.detail === true) {
    clearPreviewSet();
    closeGestureSetPanel();
    if (targetHash) navigateToHash(targetHash);
  }
  // restore the gestures tab if the navigation already happened
  else if (window.location.hash !== "#Gestures") {
    navigateToHash("#Gestures");
  }
}


/**
 * Navigates to the given hash without triggering the leave confirmation
 * Replaces the history entry so the guard does not pollute the history
 **/
function navigateToHash (hash) {
  if (window.location.hash === hash) return;
  isRestoringHash = true;
  window.location.replace(hash);
}
