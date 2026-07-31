import { playerController as BasePlayerController } from "./playerController";

/**
 * Public controller with automatic browser Gamepad API support.
 * Backbone controllers use the standard gamepad mapping exposed by the browser.
 */
export class playerController extends BasePlayerController {
    override async update(delta?: number) {
        this.input.updateGamepad(delta);
        return super.update(delta);
    }

    override updatePlayer(delta: number) {
        const move = this.input.getMoveAxes();
        const analogScale = move.isAnalog ? move.magnitude : 1;
        if (analogScale >= 0.999) {
            super.updatePlayer(delta);
            return;
        }

        // The base movement code normalizes its direction vector. Temporarily scale
        // the configured speeds so partial stick movement remains truly analog.
        const walkSpeed = this.playerSpeed;
        const runSpeed = this.playerRunSpeed;
        const flySpeed = this.playerFlySpeed;
        this.playerSpeed = walkSpeed * analogScale;
        this.playerRunSpeed = runSpeed * analogScale;
        this.playerFlySpeed = flySpeed * analogScale;
        try {
            super.updatePlayer(delta);
        } finally {
            this.playerSpeed = walkSpeed;
            this.playerRunSpeed = runSpeed;
            this.playerFlySpeed = flySpeed;
        }
    }

    /** Enable or disable automatic Gamepad API polling. */
    setGamepadEnabled(enabled: boolean) {
        this.input.setGamepadEnabled(enabled);
    }

    /** Set radial deadzones in the 0-0.95 range. */
    setGamepadDeadzones(moveDeadzone: number, lookDeadzone = moveDeadzone) {
        this.input.setGamepadDeadzones(moveDeadzone, lookDeadzone);
    }

    /** Set right-stick camera speed. */
    setGamepadLookSpeed(speed: number) {
        this.input.setGamepadLookSpeed(speed);
    }

    /** Return the active browser gamepad index, or null when disconnected. */
    getGamepadIndex() {
        return this.input.getGamepadIndex();
    }
}
