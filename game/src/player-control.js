// The player's keys and mouse buttons become the same intent record the bots fill, once per
// simulation tick. Buy-menu keys are handled here too: while the menu is open, digits buy.
import { selectSlot, nextGrenadeKind } from './sim/weapons.js';
import { CATALOG, buy, buyOpen } from './sim/shop.js';

const SLOT_KEYS = [['Digit1', 1], ['Digit2', 2], ['Digit3', 4], ['Digit4', 4], ['Digit5', 5]];
const BUY_KEYS = new Map(CATALOG.map((item) => [item.key === '-' ? 'Minus' : `Digit${item.key}`, item.id]));

export function createPlayerControl(input, hud) {
	let lastSlot = 1;

	function toggleBuy(state, player, open) {
		const can = buyOpen(state, player);
		const next = open ?? !hud.buyVisible;
		hud.setBuyOpen(next && can);
		if (next && can) input.exitLock(); else if (!input.state.locked) input.requestLock();
	}

	// Called once per tick with the player actor.
	function apply(state, player) {
		const it = player.intent;
		const menu = hud.buyVisible;
		if (input.took('KeyB')) toggleBuy(state, player);
		if (menu && (input.took('Escape') || !buyOpen(state, player))) toggleBuy(state, player, false);
		hud.setBoard(input.down('Tab'));

		if (menu) {
			for (const [code, id] of BUY_KEYS) if (input.took(code)) buy(state, player, id);
		} else {
			for (const [code, slot] of SLOT_KEYS) {
				if (!input.took(code)) continue;
				if (slot === 4 && player.active === 4) nextGrenadeKind(player);
				else { if (player.active !== slot) lastSlot = player.active; it.select = slot; }
			}
			if (input.took('KeyQ')) { const back = lastSlot; lastSlot = player.active; it.select = back; }
			const wheel = input.takeWheel();
			if (wheel !== 0) {
				lastSlot = player.active;
				it.select = player.active === 1 ? 2 : player.primary.def ? 1 : 2;
			}
		}
		const locked = input.state.locked;
		it.forward = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
		it.right = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
		it.walk = input.down('ShiftLeft') || input.down('ShiftRight');
		it.crouch = input.down('ControlLeft') || input.down('KeyC');
		it.jump = input.took('Space');
		it.fire = locked && input.state.fire;
		it.firePressed = locked && input.takeFirePressed();
		it.aimPressed = locked && input.takeAimPressed();
		if (input.took('KeyR')) it.reload = true;
		it.use = input.down('KeyE');
		if (it.select) { selectSlot(state, player, it.select); it.select = 0; }
	}

	return { apply, toggleBuy };
}
