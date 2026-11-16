// Keyboard and mouse. Mouse motion is accumulated between frames and consumed by the renderer
// each frame (look never waits for a simulation tick). Pointer lock asks for raw, unaccelerated
// motion where the browser offers it, so a flick of the same length always turns the same angle.
export function createInput(element, onLockChange) {
	const keys = new Set();
	const pressed = new Set();   // keys that went down since the last consume
	const state = {
		lookX: 0, lookY: 0,
		fire: false, firePressed: false, aim: false, aimPressed: false,
		locked: false, sensitivity: 0.0022, wheel: 0,
	};

	function requestLock() {
		const ask = element.requestPointerLock?.({ unadjustedMovement: true });
		if (ask && typeof ask.catch === 'function') ask.catch(() => element.requestPointerLock());
	}

	document.addEventListener('pointerlockchange', () => {
		state.locked = document.pointerLockElement === element;
		if (!state.locked) { keys.clear(); state.fire = false; state.aim = false; }
		onLockChange(state.locked);
	});
	document.addEventListener('mousemove', (event) => {
		if (!state.locked) return;
		state.lookX += event.movementX;
		state.lookY += event.movementY;
	});
	document.addEventListener('mousedown', (event) => {
		if (!state.locked) return;
		if (event.button === 0) { state.fire = true; state.firePressed = true; }
		if (event.button === 2) { state.aim = true; state.aimPressed = true; }
	});
	document.addEventListener('mouseup', (event) => {
		if (event.button === 0) state.fire = false;
		if (event.button === 2) state.aim = false;
	});
	document.addEventListener('wheel', (event) => { if (state.locked) state.wheel += Math.sign(event.deltaY); }, { passive: true });
	document.addEventListener('contextmenu', (event) => event.preventDefault());
	window.addEventListener('keydown', (event) => {
		if (event.code === 'Tab' || (state.locked && (event.code === 'Space' || event.ctrlKey))) event.preventDefault();
		if (!event.repeat) pressed.add(event.code);
		keys.add(event.code);
	});
	window.addEventListener('keyup', (event) => keys.delete(event.code));
	window.addEventListener('blur', () => { keys.clear(); state.fire = false; });

	return {
		state,
		requestLock,
		exitLock: () => document.exitPointerLock?.(),
		down: (code) => keys.has(code),
		// True once per press; the simulation calls it so a tap between ticks is never lost.
		took: (code) => {
			if (!pressed.has(code)) return false;
			pressed.delete(code);
			return true;
		},
		takeLook(out) {
			out.x = state.lookX * state.sensitivity;
			out.y = state.lookY * state.sensitivity;
			state.lookX = 0; state.lookY = 0;
			return out;
		},
		takeFirePressed() { const v = state.firePressed; state.firePressed = false; return v; },
		takeAimPressed() { const v = state.aimPressed; state.aimPressed = false; return v; },
		takeWheel() { const v = state.wheel; state.wheel = 0; return v; },
		clearPresses() { pressed.clear(); state.firePressed = false; state.aimPressed = false; },
	};
}
