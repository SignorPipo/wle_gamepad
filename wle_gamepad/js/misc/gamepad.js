//If you don't want the PP "namespace" just search and replace PP. with empty string

PP.Handedness =
{
    LEFT: "left",
    RIGHT: "right"
};

PP.ButtonType = {
    SELECT: 0,  //Trigger
    SQUEEZE: 1, //Grip
    THUMBSTICK: 3,
    BOTTOM_BUTTON: 4, // A or X button on oculus quest controller, also triggered for "touchpad" press on other controllers
    TOP_BUTTON: 5  // B or Y button
};

PP.ButtonEvent = {
    PRESSED_START: 0,
    PRESSED_END: 1,
    PRESSED: 2, //Every frame that it is pressed
    NOT_PRESSED: 3, //Every frame that it is not pressed
    TOUCHED_START: 4,
    TOUCHED_END: 5,
    TOUCHED: 6, //Every frame that it is touched
    NOT_TOUCHED: 7, //Every frame that it is not touched
    VALUE_CHANGED: 8,
    ALWAYS: 9, //callback every frame for this button
};

PP.ButtonInfo = class ButtonInfo {
    constructor() {
        this.myPressed = false;
        this.myPrevPressed = false;

        this.myTouched = false;
        this.myPrevTouched = false;

        this.myValue = 0.0;
        this.myPrevValue = 0.0;
    }
};

PP.AxesEvent = {
    X_CHANGED: 0,
    Y_CHANGED: 1,
    AXES_CHANGED: 2,
    ALWAYS: 3
};

//index 0 is x, index 1 is y
PP.AxesInfo = class AxesInfo {
    constructor() {
        this.myAxes = new Float32Array(2);
        this.myAxes.fill(0.0);

        this.myPrevAxes = new Float32Array(2);
        this.myPrevAxes.fill(0.0);
    }
};

//xr-standard mapping is assumed for gamepad
PP.Gamepad = class Gamepad {
    constructor(handedness) {
        this.myHandedness = handedness;

        this.myButtonInfos = [];
        for (let key in PP.ButtonType) {
            this.myButtonInfos[PP.ButtonType[key]] = new PP.ButtonInfo();
        }

        this.myAxesInfo = new PP.AxesInfo();

        this._mySelectStart = false;
        this._mySelectEnd = false;
        this._mySqueezeStart = false;
        this._mySqueezeEnd = false;

        this.mySession = null;
        this.myGamepad = null;

        this._myButtonCallbacks = [];
        for (let typeKey in PP.ButtonType) {
            this._myButtonCallbacks[PP.ButtonType[typeKey]] = [];
            for (let eventKey in PP.ButtonEvent) {
                this._myButtonCallbacks[PP.ButtonType[typeKey]][PP.ButtonEvent[eventKey]] = new Map(); //keys = object, item = callback
            }
        }

        this._myAxesCallbacks = [];
        for (let eventKey in PP.AxesEvent) {
            this._myAxesCallbacks[PP.AxesEvent[eventKey]] = new Map(); //keys = object, item = callback
        }
    }

    getButtonInfo(buttonType) {
        return this.myButtonInfos[buttonType];
    }

    //Callback parameters are (ButtonInfo, Gamepad)
    registerButtonEvent(buttonType, buttonEvent, id, callback) {
        this._myButtonCallbacks[buttonType][buttonEvent].set(id, callback);
    }

    unregisterButtonEvent(buttonType, buttonEvent, id) {
        this._myButtonCallbacks[buttonType][buttonEvent].delete(id);
    }

    getAxesInfo() {
        return this.myAxesInfo;
    }

    //Callback parameters are (AxesInfo, Gamepad)
    registerAxesEvent(axesEvent, id, callback) {
        this._myAxesCallbacks[axesEvent].set(id, callback);
    }

    unregisterAxesEvent(axesEvent, id) {
        this._myAxesCallbacks[axesEvent].delete(id);
    }

    isGamepadActive() {
        //connected == null is to fix webxr emulator that leaves that field undefined
        return this.myGamepad != null && (this.myGamepad.connected == null || this.myGamepad.connected);
    }

    start() {
        if (WL.xrSession) {
            this._setupVREvents(WL.xrSession);
        } else {
            WL.onXRSessionStart.push(this._setupVREvents.bind(this));
        }
    }

    update(dt) {
        this._preUpdateButtonInfos();
        this._updateButtonInfos();
        this._postUpdateButtonInfos();

        this._preUpdateAxesInfos();
        this._updateAxesInfos();
        this._postUpdateAxesInfos();
    }

    _preUpdateButtonInfos() {
        this.myButtonInfos.forEach(function (item) {
            item.myPrevPressed = item.myPressed;
            item.myPrevTouched = item.myTouched;
            item.myPrevValue = item.myValue;
        });
    }

    _updateButtonInfos() {
        this._updateSelectAndSqueezePressed();
        this._updateSingleButtonInfo(PP.ButtonType.SELECT, false);
        this._updateSingleButtonInfo(PP.ButtonType.SQUEEZE, false);
        this._updateSingleButtonInfo(PP.ButtonType.THUMBSTICK, true);
        this._updateSingleButtonInfo(PP.ButtonType.BOTTOM_BUTTON, true);
        this._updateSingleButtonInfo(PP.ButtonType.TOP_BUTTON, true);
    }

    //This sadly must be done this way to be the most compatible
    _updateSelectAndSqueezePressed() {
        let buttonSelect = this.myButtonInfos[PP.ButtonType.SELECT];

        if (this._mySelectStart) {
            buttonSelect.myPressed = true;
        }
        if (this._mySelectEnd) {
            buttonSelect.myPressed = false;
        }

        let buttonSqueeze = this.myButtonInfos[PP.ButtonType.SQUEEZE];
        if (this._mySqueezeStart) {
            buttonSqueeze.myPressed = true;
        }

        if (this._mySqueezeEnd) {
            buttonSqueeze.myPressed = false;
        }
    }

    _updateSingleButtonInfo(buttonType, updatePressed) {
        let button = this.myButtonInfos[buttonType];
        let internalButton = this._getInternalButton(buttonType);

        if (updatePressed) {
            button.myPressed = internalButton.pressed;
        }

        button.myTouched = internalButton.touched;
        button.myValue = internalButton.value;
    }

    _postUpdateButtonInfos() {
        for (let typeKey in PP.ButtonType) {
            let buttonInfo = this.myButtonInfos[PP.ButtonType[typeKey]];
            let buttonCallbacks = this._myButtonCallbacks[PP.ButtonType[typeKey]];

            //PRESSED
            if (buttonInfo.myPressed && !buttonInfo.myPrevPressed) {
                let callbacksMap = buttonCallbacks[PP.ButtonEvent.PRESSED_START];
                this._triggerCallbacks(callbacksMap, buttonInfo);
            }

            if (!buttonInfo.myPressed && buttonInfo.myPrevPressed) {
                let callbacksMap = buttonCallbacks[PP.ButtonEvent.PRESSED_END];
                this._triggerCallbacks(callbacksMap, buttonInfo);
            }

            if (buttonInfo.myPressed) {
                let callbacksMap = buttonCallbacks[PP.ButtonEvent.PRESSED];
                this._triggerCallbacks(callbacksMap, buttonInfo);
            } else {
                let callbacksMap = buttonCallbacks[PP.ButtonEvent.NOT_PRESSED];
                this._triggerCallbacks(callbacksMap, buttonInfo);
            }

            //TOUCHED
            if (buttonInfo.myTouched && !buttonInfo.myPrevTouched) {
                let callbacksMap = buttonCallbacks[PP.ButtonEvent.TOUCHED_START];
                this._triggerCallbacks(callbacksMap, buttonInfo);
            }

            if (!buttonInfo.myTouched && buttonInfo.myPrevTouched) {
                let callbacksMap = buttonCallbacks[PP.ButtonEvent.TOUCHED_END];
                this._triggerCallbacks(callbacksMap, buttonInfo);
            }

            if (buttonInfo.myTouched) {
                let callbacksMap = buttonCallbacks[PP.ButtonEvent.TOUCHED];
                this._triggerCallbacks(callbacksMap, buttonInfo);
            } else {
                let callbacksMap = buttonCallbacks[PP.ButtonEvent.NOT_TOUCHED];
                this._triggerCallbacks(callbacksMap, buttonInfo);
            }

            //VALUE
            if (buttonInfo.myValue != buttonInfo.myPrevValue) {
                let callbacksMap = buttonCallbacks[PP.ButtonEvent.VALUE_CHANGED];
                this._triggerCallbacks(callbacksMap, buttonInfo);
            }

            //ALWAYS
            let callbacksMap = buttonCallbacks[PP.ButtonEvent.ALWAYS];
            this._triggerCallbacks(callbacksMap, buttonInfo);
        }

        this._mySelectStart = false;
        this._mySelectEnd = false;
        this._mySqueezeStart = false;
        this._mySqueezeEnd = false;
    }

    _preUpdateAxesInfos() {
        this.myAxesInfo.myPrevAxes = this.myAxesInfo.myAxes;
    }

    _updateAxesInfos() {
        this.myAxesInfo.myAxes = this._getInternalAxes();
    }

    _postUpdateAxesInfos() {
        //X CHANGED
        if (this.myAxesInfo.myAxes[0] != this.myAxesInfo.myPrevAxes[0]) {
            let callbacksMap = this._myAxesCallbacks[PP.AxesEvent.X_CHANGED];
            this._triggerCallbacks(callbacksMap, this.myAxesInfo);
        }

        //Y CHANGED
        if (this.myAxesInfo.myAxes[1] != this.myAxesInfo.myPrevAxes[1]) {
            let callbacksMap = this._myAxesCallbacks[PP.AxesEvent.Y_CHANGED];
            this._triggerCallbacks(callbacksMap, this.myAxesInfo);
        }

        //BOTH CHANGED
        if (glMatrix.vec2.exactEquals(this.myAxesInfo.myAxes, this.myAxesInfo.myPrevAxes)) {
            let callbacksMap = this._myAxesCallbacks[PP.AxesEvent.AXES_CHANGED];
            this._triggerCallbacks(callbacksMap, this.myAxesInfo);
        }

        //ALWAYS        
        let callbacksMap = this._myAxesCallbacks[PP.AxesEvent.ALWAYS];
        this._triggerCallbacks(callbacksMap, this.myAxesInfo);
    }

    _getInternalButton(buttonType) {
        let buttonData = { pressed: false, touched: false, value: 0 };
        if (this.isGamepadActive()) {
            if (buttonType < this.myGamepad.buttons.length) {
                let gamepadButton = this.myGamepad.buttons[buttonType];
                buttonData.pressed = gamepadButton.pressed;
                buttonData.touched = gamepadButton.touched;
                buttonData.value = gamepadButton.value;
            } else if (buttonType == PP.ButtonType.BOTTOM_BUTTON && this.myGamepad.buttons.length >= 3) {
                //This way if you are using a basic touch controller bottom button will work anyway
                let touchButton = this.myGamepad.buttons[2];
                buttonData.pressed = touchButton.pressed;
                buttonData.touched = touchButton.touched;
                buttonData.value = touchButton.value;
            }
        }

        return buttonData;
    }

    _getInternalAxes() {
        let axes = [0.0, 0.0];
        if (this.isGamepadActive()) {
            let internalAxes = this.myGamepad.axes;
            if (internalAxes.length == 4) {
                //in this case it could be both touch axes or thumbstick axes, that depends on the controller
                //to support both I simply choose the absolute max value (unused axes will always be 0)

                //X
                if (Math.abs(internalAxes[0]) > Math.abs(internalAxes[2])) {
                    axes[0] = internalAxes[0];
                } else {
                    axes[0] = internalAxes[2];
                }

                //Y
                if (Math.abs(internalAxes[1]) > Math.abs(internalAxes[3])) {
                    axes[1] = internalAxes[1];
                } else {
                    axes[1] = internalAxes[3];
                }

            } else if (internalAxes.length == 2) {
                axes[0] = internalAxes[0];
                axes[1] = internalAxes[1];
            }
        }

        //y axis is recorder negative when thumbstick is pressed forward for weird reasons
        axes[1] = -axes[1];

        return axes;
    }

    _setupVREvents(s) {
        this.mySession = s;

        this.mySession.addEventListener('end', function (event) {
            this.mySession = null;
            this.myGamepad = null;
        }.bind(this));

        this.mySession.addEventListener('inputsourceschange', function (event) {
            if (event.removed) {
                for (let item of event.removed) {
                    if (item.gamepad == this.myGamepad) {
                        this.myGamepad = null;
                    }
                }
            }

            if (event.added) {
                for (let item of event.added) {
                    if (item.handedness == this.myHandedness) {
                        this.myGamepad = item.gamepad;
                    }
                }
            }
        }.bind(this));

        this.mySession.addEventListener('selectstart', this._selectStart.bind(this));
        this.mySession.addEventListener('selectend', this._selectEnd.bind(this));

        this.mySession.addEventListener('squeezestart', this._squeezeStart.bind(this));
        this.mySession.addEventListener('squeezeend', this._squeezeEnd.bind(this));
    }

    //Select and Squeeze are managed this way to be more compatible
    _selectStart(event) {
        if (event.inputSource.handedness == this.myHandedness) {
            this._mySelectStart = true;
        }
    }

    _selectEnd(event) {
        if (event.inputSource.handedness == this.myHandedness) {
            this._mySelectEnd = true;
        }
    }

    _squeezeStart(event) {
        if (event.inputSource.handedness == this.myHandedness) {
            this._mySqueezeStart = true;
        }
    }

    _squeezeEnd(event) {
        if (event.inputSource.handedness == this.myHandedness) {
            this._mySqueezeEnd = true;
        }
    }

    _triggerCallbacks(callbacksMap, info) {
        for (let value of callbacksMap.values()) {
            value(info, this);
        }
    }
};