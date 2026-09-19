# Backbone / Gamepad Controls

Backbone and other browser-compatible standard gamepads are detected automatically after `player.init()` binds its input events. Connect the controller and press a button once so the browser exposes it to the page.

## Quick preview test

1. Open the deployed `glTF` demo on the phone with the Backbone connected.
2. Tap the page once, then press any controller button so the browser exposes the gamepad.
3. Confirm the left stick moves the character, the right stick rotates the camera, and A jumps.
4. When testing a newly deployed preview, fully refresh the page first so the phone does not keep an older JavaScript bundle.

## On foot

| Control | Action |
| --- | --- |
| Left stick | Move in 360 degrees with analog speed |
| Right stick | Rotate the camera |
| A / Cross | Jump; ascend while flying |
| RB / R1 or left-stick click | Sprint |
| B / Circle | Toggle flight mode |
| X / Square | Enter or exit a nearby vehicle |
| Y / Triangle | Toggle first-person / third-person view |
| D-pad | Digital movement fallback |

## In a vehicle

| Control | Action |
| --- | --- |
| Left stick | Steer |
| Right stick | Rotate the camera |
| RT / R2 | Accelerate |
| LT / L2 | Reverse |
| A / Cross | Brake |
| RB / R1 or left-stick click | Drift |
| X / Square | Exit vehicle |
| Y / Triangle | Toggle first-person / third-person view |

## Optional tuning

The normal package import now exposes a gamepad-enabled `playerController`:

```ts
import { playerController } from "three-player-controller";

const player = new playerController();
player.setGamepadDeadzones(0.18, 0.14);
player.setGamepadLookSpeed(0.55);
```

Available runtime methods:

- `setGamepadEnabled(boolean)`
- `setGamepadDeadzones(moveDeadzone, lookDeadzone?)`
- `setGamepadLookSpeed(speed)`
- `getGamepadIndex()`

Keyboard, mouse, touch controls, and programmatic `setInput()` calls continue to work alongside the gamepad. Input-held states are tracked separately so releasing one device does not cancel a button still held on another device.
