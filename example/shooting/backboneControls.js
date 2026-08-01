const TRIGGER_THRESHOLD = 0.18;
const MOBILE_BUTTON_LABELS = new Set(["JUMP", "BRAKE", "FLY", "VIEW", "CAR"]);

let activeGamepadIndex = null;
let aimHeld = false;
let fireHeld = false;
let gamepadWasConnected = false;

const style = document.createElement("style");
style.textContent = `
    html.backbone-connected #joy-zone,
    html.backbone-connected body > button,
    html.backbone-connected .source {
        display: none !important;
    }
`;
document.head.appendChild(style);

function getGamepad() {
    if (typeof navigator.getGamepads !== "function") return null;

    let pads;
    try {
        pads = Array.from(navigator.getGamepads());
    } catch {
        return null;
    }

    const active = activeGamepadIndex == null ? null : pads[activeGamepadIndex];
    if (active?.connected) return active;

    const next = pads.find((pad) => pad?.connected) ?? null;
    activeGamepadIndex = next?.index ?? null;
    return next;
}

function buttonValue(gamepad, index) {
    const button = gamepad?.buttons?.[index];
    if (!button) return 0;
    return Math.max(button.pressed ? 1 : 0, Number(button.value) || 0);
}

function dispatchMouse(type, button) {
    document.dispatchEvent(new MouseEvent(type, {
        button,
        buttons: type === "mousedown" ? (button === 0 ? 1 : 2) : 0,
        bubbles: true,
        cancelable: true,
        view: window,
    }));
}

function hideTouchAndDebugUi() {
    // The touch buttons are direct body children. Check their labels as a guard
    // so an unrelated future button is not hidden accidentally.
    for (const button of document.querySelectorAll("body > button")) {
        const label = button.textContent?.trim().toUpperCase();
        if (label && MOBILE_BUTTON_LABELS.has(label)) button.style.display = "none";
    }

    // The transparent right-side touch-look layer is not visible, but disabling it
    // prevents it from swallowing accidental screen touches while using Backbone.
    for (const child of document.body.children) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.style.zIndex === "998" && !child.id) {
            child.style.pointerEvents = "none";
        }

        // Hide the FPS graph added by Stats.js; keep gameplay HUD such as ammo.
        if (child.style.zIndex === "9998" && child.style.left === "0px" && child.style.bottom === "0px") {
            child.style.display = "none";
        }
    }
}

function releaseHeldInputs() {
    if (aimHeld) dispatchMouse("mouseup", 2);
    if (fireHeld) dispatchMouse("mouseup", 0);
    aimHeld = false;
    fireHeld = false;
}

function update() {
    const gamepad = getGamepad();
    const connected = !!gamepad;

    if (connected !== gamepadWasConnected) {
        gamepadWasConnected = connected;
        document.documentElement.classList.toggle("backbone-connected", connected);
        if (!connected) releaseHeldInputs();
    }

    if (gamepad) {
        hideTouchAndDebugUi();

        const nextAimHeld = buttonValue(gamepad, 6) >= TRIGGER_THRESHOLD; // LT / L2
        const nextFireHeld = buttonValue(gamepad, 7) >= TRIGGER_THRESHOLD; // RT / R2

        if (nextAimHeld !== aimHeld) {
            aimHeld = nextAimHeld;
            dispatchMouse(aimHeld ? "mousedown" : "mouseup", 2);
        }

        if (nextFireHeld !== fireHeld) {
            fireHeld = nextFireHeld;
            dispatchMouse(fireHeld ? "mousedown" : "mouseup", 0);
        }
    }

    requestAnimationFrame(update);
}

window.addEventListener("blur", releaseHeldInputs);
window.addEventListener("pagehide", releaseHeldInputs);
requestAnimationFrame(update);
