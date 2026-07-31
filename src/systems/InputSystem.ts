import type { playerController } from "../playerController";
import type { KeyAction, KeyMap } from "../types";

// 默认键位表（动作 -> KeyboardEvent.code 列表）
const defaultKeyMap: Record<KeyAction, string[]> = {
    forward: ["KeyW", "ArrowUp"],
    backward: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    sprint: ["ShiftLeft", "ShiftRight"],
    jump: ["Space"],
    toggleView: ["KeyV"],
    toggleFly: ["KeyF"],
    toggleVehicle: ["KeyE"],
};

type InputSource = "keyboard" | "program" | "gamepad";
type StickState = { x: number; y: number; magnitude: number };

export class InputSystem {
    private ctrl: playerController; // 主控制器引用

    fwd = false; // 前进键
    bkd = false; // 后退键
    lft = false; // 左移键
    rgt = false; // 右移键
    space = false; // 跳跃键 / 车辆刹车
    shift = false; // 加速键 / 车辆漂移

    private keyFwd = false;
    private keyBkd = false;
    private keyLft = false;
    private keyRgt = false;
    private analogMoveX = 0;
    private analogMoveY = 0;

    // 持续动作按来源拆分，避免键盘、触控和手柄互相覆盖释放状态。
    private keyboardJump = false;
    private programJump = false;
    private gamepadJump = false;
    private keyboardSprint = false;
    private programSprint = false;
    private gamepadSprint = false;

    // 标准 Gamepad API（Backbone / Xbox / PlayStation 等标准映射）。
    private gamepadEnabled = true;
    private gamepadIndex: number | null = null;
    private gamepadMoveX = 0;
    private gamepadMoveY = 0;
    private gamepadButtons = new Map<number, boolean>();
    private gamepadMoveDeadzone = 0.18;
    private gamepadLookDeadzone = 0.14;
    private gamepadLookSpeed = 0.55;
    private lastGamepadUpdateTime = performance.now();
    private gamepadFrame: number | null = null;

    private boundKeydown = async (e: KeyboardEvent) => this.onKeydown(e); // 键盘按下绑定
    private boundKeyup = (e: KeyboardEvent) => this.onKeyup(e); // 键盘抬起绑定
    private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e); // 鼠标移动绑定
    private boundMouseClick = (e: MouseEvent) => {
        if (e.target === this.ctrl.controls.domElement) this.ctrl.cam.setPointerLock(); // 鼠标点击绑定
    };
    private boundBlur = () => this.resetKeys(); // 页面失焦时重置按键状态
    private gamepadLoop = () => {
        this.updateGamepad();
        if (this.ctrl.isupdate) this.gamepadFrame = window.requestAnimationFrame(this.gamepadLoop);
        else this.gamepadFrame = null;
    };

    private codeToAction = new Map<string, KeyAction>(); // 键码 -> 动作 反查表

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
        this.buildKeyMap();
    }

    // 构建键码：动作 反查表：未传的动作用默认键，传 string/数组则覆盖，传 null 则禁用
    buildKeyMap(userMap?: KeyMap) {
        this.codeToAction.clear();
        for (const action of Object.keys(defaultKeyMap) as KeyAction[]) {
            let codes: string[];
            if (userMap && action in userMap) {
                const v = userMap[action];
                if (v == null) continue;
                codes = Array.isArray(v) ? v : [v];
            } else {
                codes = defaultKeyMap[action];
            }
            for (const code of codes) this.codeToAction.set(code, action);
        }
    }

    // 程序化输入接口（移动端控件和外部输入可复用）。
    setInput(input: Partial<{
        moveX: number; moveY: number;
        lookDeltaX: number; lookDeltaY: number;
        jump: boolean; shift: boolean;
        toggleView: boolean; toggleFly: boolean; toggleVehicle: boolean;
    }>) {
        const c = this.ctrl;

        const prevFwd = this.fwd;
        const prevBkd = this.bkd;
        const prevLft = this.lft;
        const prevRgt = this.rgt;
        let moveChanged = false;
        if (typeof input.moveX === "number") {
            this.analogMoveX = Math.max(-1, Math.min(1, input.moveX));
            moveChanged = true;
        }
        if (typeof input.moveY === "number") {
            this.analogMoveY = Math.max(-1, Math.min(1, input.moveY));
            moveChanged = true;
        }
        if (moveChanged) {
            this.syncDirectionFlags();
            if (prevFwd !== this.fwd || prevBkd !== this.bkd || prevLft !== this.lft || prevRgt !== this.rgt) {
                c.animation.setAnimationByPressed();
            }
        }

        if (typeof input.lookDeltaX === "number" && typeof input.lookDeltaY === "number") {
            c.cam.setToward(input.lookDeltaX, input.lookDeltaY, 0.002);
        }

        if (typeof input.jump === "boolean") this.applyAction("jump", input.jump, "program");
        if (typeof input.shift === "boolean") this.applyAction("sprint", input.shift, "program");

        if (input.toggleView) this.applyAction("toggleView", true, "program");
        if (input.toggleFly) this.applyAction("toggleFly", true, "program");
        if (input.toggleVehicle) this.applyAction("toggleVehicle", true, "program");
    }

    /** 每帧轮询浏览器 Gamepad API。Backbone 在浏览器中使用 standard 映射。 */
    updateGamepad(delta?: number) {
        if (!this.gamepadEnabled || typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
            this.clearGamepadState();
            return;
        }

        const now = performance.now();
        const dt = delta ?? Math.min((now - this.lastGamepadUpdateTime) / 1000, 1 / 20);
        this.lastGamepadUpdateTime = now;

        let pads: (Gamepad | null)[];
        try {
            pads = Array.from(navigator.getGamepads());
        } catch {
            this.clearGamepadState();
            return;
        }

        let pad = this.gamepadIndex == null ? null : pads[this.gamepadIndex];
        if (!pad?.connected) pad = pads.find(p => p?.connected) ?? null;
        if (!pad) {
            this.clearGamepadState();
            return;
        }
        this.gamepadIndex = pad.index;

        const prevFwd = this.fwd;
        const prevBkd = this.bkd;
        const prevLft = this.lft;
        const prevRgt = this.rgt;

        let move = this.applyRadialDeadzone(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0), this.gamepadMoveDeadzone);

        // D-pad fallback for controllers/browsers that do not expose the left stick normally.
        if (move.magnitude === 0) {
            const dpadX = Number(this.buttonPressed(pad, 15)) - Number(this.buttonPressed(pad, 14));
            const dpadY = Number(this.buttonPressed(pad, 12)) - Number(this.buttonPressed(pad, 13));
            if (dpadX !== 0 || dpadY !== 0) {
                const length = Math.hypot(dpadX, dpadY);
                move = { x: dpadX / length, y: dpadY / length, magnitude: 1 };
            }
        }

        // Driving uses the standard triggers when available: RT accelerate, LT reverse.
        if (this.ctrl.controllerMode === 1) {
            const throttle = this.buttonValue(pad, 7);
            const reverse = this.buttonValue(pad, 6);
            if (Math.max(throttle, reverse) > 0.05) move.y = Math.max(-1, Math.min(1, throttle - reverse));
        }

        this.gamepadMoveX = move.x;
        this.gamepadMoveY = move.y;
        this.syncDirectionFlags();
        if (prevFwd !== this.fwd || prevBkd !== this.bkd || prevLft !== this.lft || prevRgt !== this.rgt) {
            this.ctrl.animation.setAnimationByPressed();
        }

        const look = this.applyRadialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, this.gamepadLookDeadzone);
        if (look.magnitude > 0) this.ctrl.cam.setToward(look.x, look.y, this.gamepadLookSpeed * Math.max(0, dt));

        // Standard layout: A jump/brake, B fly, X vehicle, Y view, L3/RB sprint or drift.
        this.applyAction("jump", this.buttonPressed(pad, 0), "gamepad");
        this.applyAction("sprint", this.buttonPressed(pad, 10) || this.buttonPressed(pad, 5), "gamepad");
        this.updateGamepadToggle(pad, 1, "toggleFly");
        this.updateGamepadToggle(pad, 2, "toggleVehicle");
        this.updateGamepadToggle(pad, 3, "toggleView");
    }

    setGamepadEnabled(enabled: boolean) {
        this.gamepadEnabled = enabled;
        if (!enabled) this.clearGamepadState();
    }

    setGamepadDeadzones(moveDeadzone: number, lookDeadzone = moveDeadzone) {
        this.gamepadMoveDeadzone = Math.max(0, Math.min(0.95, moveDeadzone));
        this.gamepadLookDeadzone = Math.max(0, Math.min(0.95, lookDeadzone));
    }

    setGamepadLookSpeed(speed: number) {
        this.gamepadLookSpeed = Math.max(0, speed);
    }

    getGamepadIndex() {
        return this.gamepadIndex;
    }

    bindEvents() {
        this.ctrl.isupdate = true;
        this.ctrl.cam.setPointerLock();
        window.addEventListener("keydown", this.boundKeydown);
        window.addEventListener("keyup", this.boundKeyup);
        window.addEventListener("mousemove", this.boundMouseMove);
        window.addEventListener("click", this.boundMouseClick);
        window.addEventListener("blur", this.boundBlur);
        if (this.gamepadFrame == null && typeof window.requestAnimationFrame === "function") {
            this.lastGamepadUpdateTime = performance.now();
            this.gamepadFrame = window.requestAnimationFrame(this.gamepadLoop);
        }
    }

    unbindEvents() {
        this.ctrl.isupdate = false;
        document.exitPointerLock();
        window.removeEventListener("keydown", this.boundKeydown);
        window.removeEventListener("keyup", this.boundKeyup);
        window.removeEventListener("mousemove", this.boundMouseMove);
        window.removeEventListener("click", this.boundMouseClick);
        window.removeEventListener("blur", this.boundBlur);
        if (this.gamepadFrame != null) {
            window.cancelAnimationFrame(this.gamepadFrame);
            this.gamepadFrame = null;
        }
        this.resetKeys();
    }

    private resetKeys() {
        const c = this.ctrl;
        this.keyFwd = false;
        this.keyBkd = false;
        this.keyLft = false;
        this.keyRgt = false;
        this.analogMoveX = 0;
        this.analogMoveY = 0;
        this.gamepadMoveX = 0;
        this.gamepadMoveY = 0;
        this.keyboardJump = false;
        this.programJump = false;
        this.gamepadJump = false;
        this.keyboardSprint = false;
        this.programSprint = false;
        this.gamepadSprint = false;
        this.space = false;
        this.shift = false;
        this.gamepadButtons.clear();
        this.syncDirectionFlags();
        c.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
        c.animation.setAnimationByPressed();
    }

    private applyAction(action: KeyAction, pressed: boolean, source: InputSource) {
        const c = this.ctrl;
        switch (action) {
            case "forward": this.keyFwd = pressed; this.syncDirectionFlags(); c.animation.setAnimationByPressed(); break;
            case "backward": this.keyBkd = pressed; this.syncDirectionFlags(); c.animation.setAnimationByPressed(); break;
            case "left": this.keyLft = pressed; this.syncDirectionFlags(); c.animation.setAnimationByPressed(); break;
            case "right": this.keyRgt = pressed; this.syncDirectionFlags(); c.animation.setAnimationByPressed(); break;
            case "sprint": {
                if (source === "keyboard") this.keyboardSprint = pressed;
                else if (source === "program") this.programSprint = pressed;
                else this.gamepadSprint = pressed;
                const next = this.keyboardSprint || this.programSprint || this.gamepadSprint;
                if (next === this.shift) break;
                this.shift = next;
                c.animation.setAnimationByPressed();
                c.controls.mouseButtons = next
                    ? { LEFT: 2, MIDDLE: 1, RIGHT: 0 }
                    : { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
                break;
            }
            case "jump": {
                const wasPressed = this.space;
                if (source === "keyboard") this.keyboardJump = pressed;
                else if (source === "program") this.programJump = pressed;
                else this.gamepadJump = pressed;
                this.space = this.keyboardJump || this.programJump || this.gamepadJump;
                if (this.space === wasPressed) break;
                if (this.space) {
                    c.vehicle.cancelBoarding();
                    if (c.controllerMode === 1) break;
                    if (c.isFlying) { c.animation.setAnimationByPressed(); break; }
                    if (!c.playerIsOnGround) break;
                    if (c.animation.isJumping()) break;
                    c.animation.startJump();
                    c.playerVelocity.y = c.jumpHeight;
                    c.setOnGround(false);
                } else if (c.isFlying) {
                    c.animation.setAnimationByPressed();
                }
                break;
            }
            case "toggleView":
                if (pressed) c.cam.changeView();
                break;
            case "toggleFly":
                if (pressed && c.controllerMode === 0) {
                    c.isFlying = !c.isFlying;
                    if (c.isFlying) c.playerVelocity.set(0, 0, 0);
                    c.animation.setAnimationByPressed();
                    if (!c.isFlying && !c.playerIsOnGround) c.animation.startJump(true);
                }
                break;
            case "toggleVehicle":
                if (pressed) {
                    if (c.isFlying) return;
                    if (c.controllerMode === 0) c.vehicle.enter(); else c.vehicle.exit();
                }
                break;
        }
    }

    getMoveAxes() {
        const analog = this.getActiveAnalogAxes();
        if (analog.magnitude > 0) return { ...analog, isAnalog: true };
        const x = Number(this.keyRgt) - Number(this.keyLft);
        const y = Number(this.keyFwd) - Number(this.keyBkd);
        return { x, y, magnitude: x !== 0 || y !== 0 ? 1 : 0, isAnalog: false };
    }

    private getActiveAnalogAxes(): StickState {
        const programMagnitude = Math.min(1, Math.hypot(this.analogMoveX, this.analogMoveY));
        const gamepadMagnitude = Math.min(1, Math.hypot(this.gamepadMoveX, this.gamepadMoveY));
        if (gamepadMagnitude >= programMagnitude) {
            return { x: this.gamepadMoveX, y: this.gamepadMoveY, magnitude: gamepadMagnitude };
        }
        return { x: this.analogMoveX, y: this.analogMoveY, magnitude: programMagnitude };
    }

    private syncDirectionFlags() {
        const threshold = 0.2;
        const analog = this.getActiveAnalogAxes();
        this.fwd = this.keyFwd || analog.y > threshold;
        this.bkd = this.keyBkd || analog.y < -threshold;
        this.lft = this.keyLft || analog.x < -threshold;
        this.rgt = this.keyRgt || analog.x > threshold;
    }

    private updateGamepadToggle(pad: Gamepad, buttonIndex: number, action: KeyAction) {
        const pressed = this.buttonPressed(pad, buttonIndex);
        const wasPressed = this.gamepadButtons.get(buttonIndex) ?? false;
        if (pressed && !wasPressed) this.applyAction(action, true, "gamepad");
        this.gamepadButtons.set(buttonIndex, pressed);
    }

    private buttonPressed(pad: Gamepad, index: number) {
        const button = pad.buttons[index];
        return !!button && (button.pressed || button.value > 0.5);
    }

    private buttonValue(pad: Gamepad, index: number) {
        const button = pad.buttons[index];
        return button ? Math.max(0, Math.min(1, button.value)) : 0;
    }

    private applyRadialDeadzone(x: number, y: number, deadzone: number): StickState {
        const rawMagnitude = Math.min(1, Math.hypot(x, y));
        if (rawMagnitude <= deadzone || rawMagnitude === 0) return { x: 0, y: 0, magnitude: 0 };
        const magnitude = (rawMagnitude - deadzone) / (1 - deadzone);
        const scale = magnitude / rawMagnitude;
        return { x: x * scale, y: y * scale, magnitude };
    }

    private clearGamepadState() {
        if (this.gamepadIndex == null && this.gamepadMoveX === 0 && this.gamepadMoveY === 0 && !this.gamepadJump && !this.gamepadSprint) return;
        const prevFwd = this.fwd;
        const prevBkd = this.bkd;
        const prevLft = this.lft;
        const prevRgt = this.rgt;
        this.gamepadIndex = null;
        this.gamepadMoveX = 0;
        this.gamepadMoveY = 0;
        this.gamepadButtons.clear();
        this.applyAction("jump", false, "gamepad");
        this.applyAction("sprint", false, "gamepad");
        this.syncDirectionFlags();
        if (prevFwd !== this.fwd || prevBkd !== this.bkd || prevLft !== this.lft || prevRgt !== this.rgt) {
            this.ctrl.animation.setAnimationByPressed();
        }
    }

    private onKeydown(e: KeyboardEvent) {
        const action = this.codeToAction.get(e.code);
        if (action) this.applyAction(action, true, "keyboard");
    }

    private onKeyup(e: KeyboardEvent) {
        const action = this.codeToAction.get(e.code);
        if (action) this.applyAction(action, false, "keyboard");
    }

    private onMouseMove(e: MouseEvent) {
        if (document.pointerLockElement === document.body) {
            this.ctrl.cam.setToward(e.movementX, e.movementY, 0.0001);
        }
    }
}
