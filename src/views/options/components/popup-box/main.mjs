// getter for module path
const MODULE_DIR = (() => {
  const urlPath = new URL(import.meta.url).pathname;
  return urlPath.slice(0, urlPath.lastIndexOf("/") + 1);
})();

// keep in sync with the .3s transitions of the popup elements in layout.css
const CLOSE_ANIMATION_DURATION = 300;


/**
 * Custom element - <popup-box>
 * Accepts two sepcial attributes (and properties):
 * open : boolean - opens or closes the popup
 * type : confirm, alert, prompt, custom (default) - defines the functionality/purpose of the popup
 * Dispatches 2 custom events:
 * close : detail value depends on the popup type
 * open : detail value is always null
 * Special property:
 * value : contains the same value as the detail value of the event
 * Optional property:
 * validate : function - receives the value before the popup closes, returns false to keep it open
 **/
class PopupBox extends HTMLElement {

  /**
   * Construcor
   * Create shadow root and load stylesheet by appending it to the shadow DOM
   **/
  constructor() {
    super();

    this.attachShadow({mode: 'open'}).innerHTML = `
      <link id="popupStylesheet" rel="stylesheet" href="${MODULE_DIR}layout.css">
    `;
    // add a promise and resolve it when the stylesheet is loaded
    this._loaded = new Promise ((resolve) => {
      this.shadowRoot.getElementById("popupStylesheet").onload = resolve;
    });
    // optional callback which can reject a close, set by the consumer before opening the popup
    this.validate = null;
    // true while the closing animation runs, prevents a second close of the same popup
    this._closing = false;
  }

  /**
   * Set observable attributes
   **/
  static get observedAttributes() {
    return ['type', 'open'];
  }

  /**
   * Handles the standard connected callback
   * Opens the popup if the element gets appended to the DOM and the open attribute is set
   **/
  connectedCallback () {
    if (this.open && this.isConnected) this._openPopupBox();
  }


  /**
   * Handles the standard disconnected callback
   * Removes all popup elements from the shadow DOM
   **/
  disconnectedCallback () {
    const popupOverlay = this.shadowRoot.getElementById("popupOverlay");
    const popupWrapper = this.shadowRoot.getElementById("popupWrapper");
    // remove popup elements
    if (popupOverlay) popupOverlay.remove();
    if (popupWrapper) popupWrapper.remove();
  }


  /**
   * Handles the standard attribute change callback
   * Open/close the popup on open attribute change
   * Replace the popup if the popup type changes
   **/
  attributeChangedCallback (name, oldValue, newValue) {
    // do nothing if element is not appended to the DOM
    if (!this.isConnected) return;

    switch (name) {
      case 'open': {
        if (this.hasAttribute('open')) {
          // if previous value was not set open popup
          // == checks for null and undefined
          if (oldValue == null) this._openPopupBox();
        }
        else {
          this._closePopupBox();
        }
      } break;

      case 'type': {
        // defining the element fires this callback for the initial type of every instance,
        // building the popup then would show every closed popup on page load
        if (!this.open) return;
        // remove old popup elements
        const popupOverlay = this.shadowRoot.getElementById("popupOverlay");
        const popupWrapper = this.shadowRoot.getElementById("popupWrapper");
        if (popupOverlay) popupOverlay.remove();
        if (popupWrapper) popupWrapper.remove();
        // create and add new popup
        const popupFragment = this._buildPopupBox();
        this.shadowRoot.append(popupFragment);
      } break;
    }
  }


  get open () {
    return this.hasAttribute('open');
  }

  set open (value) {
    if (value) this.setAttribute('open', '');
    else this.removeAttribute('open');
  }

  get type () {
    return this.getAttribute('type') || 'custom';
  }

  set type (value) {
    this.setAttribute('type', value);
  }


  /**
   * Constructs the main command bar structure and popupOverlay
   * Returns it as a document fragment
   **/
  _buildPopupBox () {
    const template = document.createElement('template');
    template.innerHTML = `
      <div id="popupOverlay"></div>
      <div id="popupWrapper">
        <div id="popupBox">
          <div id="popupBoxHead">
            <div id="popupBoxHeading"><slot name="title">Title..</slot></div>
            <button id="popupBoxCloseButton" type="button"></button>
          </div>
          <div id="popupBoxMain"><slot name="content">Content..</slot></div>
          <div id="popupBoxFooter"></div>
        </div>
      </div>
    `;

    // register event handlers
    const popupOverlay = template.content.getElementById("popupOverlay");
          popupOverlay.addEventListener("click", this._handleCloseButtonClick.bind(this));
    const popupBoxCloseButton = template.content.getElementById("popupBoxCloseButton");
          popupBoxCloseButton.addEventListener("click", this._handleCloseButtonClick.bind(this));

    const popupBoxFooter = template.content.getElementById("popupBoxFooter");

    // add popup type dependent inputs
    switch (this.type) {
      case "alert": {
        const popupBoxConfirmButton = document.createElement("button");
              popupBoxConfirmButton.id = "popupBoxConfirmButton";
              popupBoxConfirmButton.textContent = browser.i18n.getMessage("buttonConfirm");
              popupBoxConfirmButton.addEventListener("click", this._handleCloseButtonClick.bind(this));
        popupBoxFooter.append(popupBoxConfirmButton);
      } break;

      case "confirm": {
        const popupBoxConfirmButton = document.createElement("button");
              popupBoxConfirmButton.id = "popupBoxConfirmButton";
              popupBoxConfirmButton.textContent = browser.i18n.getMessage("buttonConfirm");
              popupBoxConfirmButton.addEventListener("click", this._handleConfirmButtonClick.bind(this));
        const popupBoxCancelButton = document.createElement("button");
              popupBoxCancelButton.id = "popupBoxCancelButton";
              popupBoxCancelButton.textContent = browser.i18n.getMessage("buttonCancel");
              popupBoxCancelButton.addEventListener("click", this._handleCancelButtonClick.bind(this));
        popupBoxFooter.append(popupBoxCancelButton, popupBoxConfirmButton);
      } break;

      case "prompt": {
        const popupBoxInput = document.createElement("input");
              popupBoxInput.id = "popupBoxInput";
              popupBoxInput.addEventListener("keypress", this._handleInputKeypress.bind(this));
        const popupBoxConfirmButton = document.createElement("button");
              popupBoxConfirmButton.id = "popupBoxConfirmButton";
              popupBoxConfirmButton.textContent = browser.i18n.getMessage("buttonConfirm");
              popupBoxConfirmButton.addEventListener("click", this._handleConfirmButtonClick.bind(this));
        popupBoxFooter.append(popupBoxInput, popupBoxConfirmButton);
      } break;
    }

    return template.content;
  }


  /**
   * Builds and opens the popup
   * Dispatches the open event listener
   **/
  _openPopupBox () {
    this._loaded.then(() => {
      // the popup can be closed again before the stylesheet finished loading
      if (!this.open) return;

      // remove leftovers of a close animation which never finished
      this.shadowRoot.getElementById("popupOverlay")?.remove();
      this.shadowRoot.getElementById("popupWrapper")?.remove();

      // delete old value if any
      delete this.value;

      const popupFragment = this._buildPopupBox();

      const popupOverlay = popupFragment.getElementById("popupOverlay");
      const popupBox = popupFragment.getElementById("popupBox");

      popupOverlay.classList.add("po-hide");
      popupBox.classList.add("pb-hide");

      // append to shadow dom
      this.shadowRoot.append(popupFragment);

      // trigger reflow
      popupBox.offsetHeight;

      // cleanup classes after animation
      popupOverlay.addEventListener("transitionend", function removePopupOverlay(event) {
        // prevent the event from firing for child transitions
        if (event.currentTarget === event.target) {
          popupOverlay.removeEventListener("transitionend", removePopupOverlay);
          popupOverlay.classList.remove("po-show");
        }
      });
      popupBox.addEventListener("animationend", function removePopupBox(event) {
        // prevent the event from firing for child transitions
        if (event.currentTarget === event.target) {
          popupBox.removeEventListener("transitionend", removePopupBox);
          popupBox.classList.remove("pb-show");
        }
      });

      // start show animation
      popupOverlay.classList.replace("po-hide", "po-show");
      popupBox.classList.replace("pb-hide", "pb-show");

      // the popup is open again, so it can be closed again as well
      this._closing = false;

      // dispatch custom open event
      this.dispatchEvent(new CustomEvent("open"));
    });
  }


  /**
   * Closes the popup and removes it from the shadow dom
   * Dispatches the close event listener with the given value as detail
   **/
  _closePopupBox () {
    // the close is already running, a second call would dispatch the event twice
    if (this._closing) return;
    this._closing = true;

    const popupOverlay = this.shadowRoot.getElementById("popupOverlay");
    const popupWrapper = this.shadowRoot.getElementById("popupWrapper");
    const popupBox = this.shadowRoot.getElementById("popupBox");

    // the popup can be closed before it finished rendering, then there is nothing to animate
    if (popupOverlay && popupWrapper && popupBox) {
      popupOverlay.classList.add("po-hide");
      popupBox.classList.add("pb-hide");
    }

    // the animation is a nicety, the nodes have to be gone even if transitionend never fires
    window.setTimeout(() => {
      popupOverlay?.remove();
      popupWrapper?.remove();
    }, CLOSE_ANIMATION_DURATION);

    // dispatch custom close event
    this.dispatchEvent(new CustomEvent("close", {
      detail: this.value
    }));
  }


  /**
   * Checks the optional validate callback for the given value before closing
   * Returns false if the validation rejected the close
   **/
  _canClose (value) {
    if (typeof this.validate !== "function") return true;
    return this.validate(value) !== false;
  }


  /**
   * Closes the popup unless the validation rejects it
   * Also removes the nodes if the open attribute disappeared while they stayed in the dom
   **/
  _requestClose () {
    // the regular case, the attribute change runs the closing animation
    if (this.open) {
      this.open = false;
      return;
    }
    // without this the popup would be stuck forever, the open attribute could never change again
    this._closePopupBox();
  }


  /**
   * Listenes for the close button click, closes the popup and passes null as the detail value
   **/
  _handleCloseButtonClick (event) {
    // validate before the value is written, a rejected close must not change the state
    if (!this._canClose(null)) return;
    // remove open attribute and close popup
    this.value = null;
    this._requestClose();
  }


  /**
   * Listenes for the confirm button click, closes the popup and passes the input value or true as the detail value
   **/
  _handleConfirmButtonClick (event) {
    const popupBoxInput = this.shadowRoot.getElementById("popupBoxInput");
    // the value is either true or the input value if type "prompt" was used
    const value = popupBoxInput ? popupBoxInput.value : true;
    // validate before the value is written, a rejected close must not change the state
    if (!this._canClose(value)) return;
    this.value = value;
    // remove open attribute and close popup
    this._requestClose();
  }


  /**
   * Listenes for the cancel button click, closes the popup and passes false as the detail value
   **/
  _handleCancelButtonClick (event) {
    // set value to false
    this.value = false;
    // remove open attribute and close popup
    this._requestClose();
  }


  /**
   * Listenes for the enter key press and runs the cofirm button function
   **/
  _handleInputKeypress (event) {
     if (event.key === "Enter") this._handleConfirmButtonClick();
  }
}

// define custom element
window.customElements.define('popup-box', PopupBox);