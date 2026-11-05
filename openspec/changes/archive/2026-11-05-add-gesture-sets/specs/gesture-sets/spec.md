# Spec Delta

## Purpose

Lets users keep, name, and switch between complete gesture collections, including built-in Default and Edge presets, without losing or manually rebuilding their current gestures.

## ADDED Requirements

### Requirement: Gesture sets have identity and ownership

The system SHALL represent each gesture set with a stable identifier, a display name, and an ordered list of gestures. Every set MUST be either built-in or user-defined, and the two kinds MUST use disjoint identifier namespaces. Built-in sets MUST NOT be deletable; user-defined sets MUST be deletable.

#### Scenario: Built-in set offers no delete action

- **WHEN** the set list displays a built-in set
- **THEN** the row is marked as built-in and contains no delete control

#### Scenario: User set offers a delete action

- **WHEN** the set list displays a user-defined set
- **THEN** the row contains a delete control

### Requirement: Built-in Default and Edge sets are always available

The system SHALL provide a Default set and an Edge set whenever the options page loads, independent of stored user data. The Default set MUST contain the shipped default gestures.

#### Scenario: Sets exist on first use

- **WHEN** the options page loads with no user-defined sets
- **THEN** Default and Edge are listed and selectable

#### Scenario: Default set reflects the shipped gestures

- **WHEN** the Default set is applied
- **THEN** the gesture list matches the gestures in `resources/json/defaults.json`

### Requirement: Edge preset reproduces Edge's direction mapping

The Edge set MUST contain all 16 Edge directions: four single directions and twelve two-stroke directions covering close, restore, new tab, reload, tab switching, stop loading, close-other-tabs, and both scroll jumps. It MUST also contain the same Open Gesturefy settings gesture as the Default set.

#### Scenario: Edge directions map to equivalent commands

- **WHEN** the Edge set is applied
- **THEN** left, right, up, and down map to back, forward, page up, and page down, down-then-right maps to close tab, and up-then-down and down-then-up map to scroll bottom and scroll top

#### Scenario: Edge keeps the settings gesture

- **WHEN** the Edge set is applied
- **THEN** the gesture that opens Gesturefy settings is present and uses the same pattern as in the Default set

### Requirement: Active set is persisted

The system SHALL persist the active set identifier and display the corresponding set name, or None when no set is active. Adding, editing, or deleting a gesture MUST clear the active identifier.

#### Scenario: Applying a set persists it

- **WHEN** the user applies a set and later reopens the options page
- **THEN** the bar shows that set's name

#### Scenario: Editing a gesture detaches the active set

- **WHEN** the user adds, edits, or deletes a gesture
- **THEN** the bar shows None and the change remains after reopening the options page

### Requirement: Applying a set is explicit

The system SHALL preview a set selection without writing any gesture to the config. Applying MUST replace all current gestures with the selected set's snapshot, record the selected set as active, clear the preview, and close the selection panel so a successful apply cannot trigger the leave prompt.

#### Scenario: Previewing does not change the stored gestures

- **WHEN** the user selects a different set but has not pressed Apply
- **THEN** the stored gestures are unchanged and the list shows a read-only preview of that set

#### Scenario: Apply replaces gestures

- **WHEN** the user presses Apply for the previewed set
- **THEN** the gesture list matches that set and the bar shows its name

#### Scenario: Apply clears the preview

- **WHEN** the user presses Apply
- **THEN** the panel closes, no set remains previewed, and navigating away does not prompt

### Requirement: Leaving with a previewed set prompts

While a set is previewed and not applied, navigating away from the Gestures tab MUST ask for confirmation. Cancelling MUST keep the user on the Gestures tab; confirming MUST discard the preview. Closing the selection panel MUST discard the preview without a prompt.

#### Scenario: Navigation is intercepted

- **WHEN** a set is previewed and the user navigates to another tab
- **THEN** a confirmation appears; cancelling stays on the Gestures tab and keeps the preview

#### Scenario: Closing the panel discards the preview

- **WHEN** a set is previewed and the user closes the selection panel
- **THEN** the preview is cleared without a prompt

### Requirement: Saving current gestures as a user set

The system SHALL allow the user to save the current gestures under a user-provided name. Names MUST be trimmed and compared case-insensitively against the current locale's built-in display names and existing user names; empty, whitespace-only, built-in, and duplicate names MUST be rejected. A successful save MUST create a user set, make it active, and leave the gestures unchanged.

#### Scenario: Saving succeeds

- **WHEN** the user saves the current gestures with the name "Mine"
- **THEN** a user set named "Mine" is listed, becomes active, and the gestures are unchanged

#### Scenario: Invalid names are rejected

- **WHEN** the user submits an empty name or a duplicate name
- **THEN** no set is created and the prompt reports the problem

### Requirement: Deleting a user set

The system SHALL require confirmation before deleting a user-defined set. Deleting the active set MUST clear the active identifier without changing gestures. Deleting a previewed set MUST also clear the preview.

#### Scenario: Deleting the active set

- **WHEN** the user confirms deletion of the active set
- **THEN** the set is removed, the bar shows None, and the gestures are unchanged

#### Scenario: Deleting a previewed set

- **WHEN** the user confirms deletion of the previewed set
- **THEN** the set is removed and no set remains previewed

### Requirement: Unresolvable active set is reported

When the persisted active set identifier does not resolve to an existing user-defined set, the system SHALL show an alert on options page load, clear the identifier, and leave the gestures unchanged. An identifier that names a built-in set which is missing from the loaded resources MUST be cleared without an alert, because no user data was lost.

#### Scenario: User set is missing after restore

- **WHEN** the options page loads with an active identifier that matches no user-defined set
- **THEN** an alert is shown, the bar shows None, and the gestures remain as stored

#### Scenario: Built-in set resource is unavailable

- **WHEN** the options page loads with an active identifier naming a built-in set the loaded resources do not contain
- **THEN** the identifier is cleared silently, the bar shows None, and the gestures remain as stored

### Requirement: Required permissions are requested before applying

When the selected set contains commands whose optional permissions are not granted, the system SHALL request those permissions from the Apply action. If the request is denied, the system MUST NOT change the gestures or the active identifier.

#### Scenario: Permissions are granted

- **WHEN** the user applies the Edge set on a profile without the sessions permission and grants the request
- **THEN** the Edge set is applied

#### Scenario: Permissions are denied

- **WHEN** the user denies the permission request
- **THEN** the gesture list and active set remain unchanged

### Requirement: Gesture set bar on the Gestures tab

The Gestures tab SHALL show a bottom bar with the current set name or None, a control that opens the set list, and a control that saves the current gestures. The set list MUST distinguish built-in sets from user sets and MUST expose the delete control only on user sets.

#### Scenario: Bar reflects current state

- **WHEN** the Gestures tab is displayed
- **THEN** the bar shows the current set name or None and both controls

#### Scenario: List distinguishes set ownership

- **WHEN** the set list is expanded
- **THEN** built-in sets are marked as built-in and only user sets show a delete control
