<div class="content-header">
  <h2 data-i18n="navigationGestures"></h2>
  <form id="gestureSearchForm" class="gl-search">
    <input id="gestureSearchInput" class="gl-search-input">
    <button id="gestureSearchToggleButton" class="gl-search-input-toggle" type="button"></button>
  </form>
</div>
<ul id="gestureContainer" class="gesture-list">
  <li>
    <button id="gestureAddButton" class="gl-add-button" type="button" data-i18n="gestureCreateNewButton"></button>
  </li>
</ul>

<div class="gs-dock">
  <div class="gs-bar">
    <span class="gs-bar-label" data-i18n="gestureSetBarLabel"></span>
    <div class="gs-select">
      <button id="gestureSetSelectButton" class="gs-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="gestureSetPanel">
        <span id="gestureSetBarName" class="gs-trigger-name"></span>
      </button>
      <section id="gestureSetPanel" class="gs-panel" hidden>
        <div class="gs-panel-head">
          <span class="gs-panel-title" data-i18n="gestureSetPanelTitle"></span>
          <button id="gestureSetPanelCloseButton" class="gs-panel-close icon-delete" type="button"></button>
        </div>
        <p id="gestureSetReplaceHint" class="gs-hint"></p>
        <ul id="gestureSetList" class="gs-list"></ul>
        <div class="gs-panel-actions">
          <button id="gestureSetCancelButton" class="gs-button" type="button" data-i18n="gestureSetCancelButton"></button>
          <button id="gestureSetApplyButton" class="gs-button gs-button-primary" type="button" data-i18n="gestureSetApplyButton" disabled></button>
        </div>
      </section>
    </div>
    <button id="gestureSetSaveButton" class="gs-button gs-save-button" type="button" data-i18n="gestureSetSaveButton"></button>
  </div>
</div>

<popup-box id="gesturePopup">
  <span data-i18n="gesturePopupTitleNewGesture" id="gesturePopupHeading" slot="title"></span>
  <div class="gp-wrapper" slot="content">
    <div id="gesturePopupRecordingArea">
      <canvas id="gesturePopupCanvas"></canvas>
      <div id="gesturePopupPatternContainer"></div>
    </div>
    <form id="gesturePopupForm">
      <div class="gp-field">
        <span data-i18n="gesturePopupLabelCommand" class="gp-field-name"></span>
        <p data-i18n="gesturePopupDescriptionCommand" class="gp-field-description"></p>
        <command-select id="gesturePopupCommandSelect" class="command-select-field"></command-select>
      </div>
      <label class="gp-field">
        <span data-i18n="gesturePopupLabelOptionalLabel" class="gp-field-name"></span>
        <p data-i18n="gesturePopupDescriptionOptionalLabel" class="gp-field-description"></p>
        <input id="gesturePopupLabelInput" class="input-field" maxlength="100">
      </label>
      <button id="gesturePopupSaveButton" data-i18n="buttonSave" type="submit"></button>
    </form>
  </div>
</popup-box>
