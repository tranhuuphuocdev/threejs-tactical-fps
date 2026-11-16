// Buying: one function for the player's buy menu and the bots' buy logic, so both pay the same
// prices under the same rules (buy time, spawn zone, carrying limits).
import { WEAPONS, GRENADES, GEAR, TEAM, ROUND } from '../config.js';
import { giveWeapon, grenadeCount } from '../core/actors.js';
import { CELL, ROWS } from '../map/layout.js';

export const CATALOG = [
	{ id: 'anvil', kind: 'weapon', key: '1' },
	{ id: 'wasp', kind: 'weapon', key: '2' },
	{ id: 'kestrel', kind: 'weapon', key: '3' },
	{ id: 'harrow', kind: 'weapon', key: '4' },
	{ id: 'longwatch', kind: 'weapon', key: '5' },
	{ id: 'vest', kind: 'gear', key: '6' },
	{ id: 'helmet', kind: 'gear', key: '7' },
	{ id: 'frag', kind: 'grenade', key: '8' },
	{ id: 'flash', kind: 'grenade', key: '9' },
	{ id: 'smoke', kind: 'grenade', key: '0' },
	{ id: 'kit', kind: 'gear', key: '-' },
];

export function priceOf(id) {
	return (WEAPONS[id] ?? GRENADES[id] ?? GEAR[id]).price;
}

export function nameOf(id) {
	return (WEAPONS[id] ?? GRENADES[id] ?? GEAR[id]).name;
}

export function inBuyZone(actor) {
	const c = Math.floor(actor.pos.x / CELL); const r = Math.floor(actor.pos.z / CELL);
	const ch = ROWS[r]?.[c];
	const own = actor.team === TEAM.RAIDERS ? 'T' : 'D';
	if (ch === own) return true;
	// The spawn yards around the marked cells count too: within 10 m of the spawn's centre row.
	const spawnRow = actor.team === TEAM.RAIDERS ? 28 : 2;
	return Math.abs(r - spawnRow) <= 3;
}

export function buyOpen(state, actor) {
	const round = state.round;
	return actor.alive && (round.phase === 'freeze' || (round.phase === 'live' && round.elapsed < ROUND.buyTime)) && inBuyZone(actor);
}

// Why an item cannot be bought right now, or '' when it can.
export function refusal(state, actor, id) {
	if (!buyOpen(state, actor)) return 'Buy time is over';
	const price = priceOf(id);
	if (actor.money < price) return 'Not enough money';
	if (WEAPONS[id]) {
		const slot = WEAPONS[id].slot === 1 ? actor.primary : actor.sidearm;
		if (slot.def && slot.def.id === id) return 'Already carried';
	} else if (GRENADES[id]) {
		if (actor.grenades[id] >= (id === 'flash' ? 2 : 1)) return 'Carrying the limit';
		if (grenadeCount(actor) >= 4) return 'Carrying four grenades';
	} else if (id === 'vest') {
		if (actor.armor >= 100) return 'Already armoured';
	} else if (id === 'helmet') {
		if (actor.armor >= 100 && actor.helmet) return 'Already armoured';
	} else if (id === 'kit') {
		if (actor.team !== TEAM.WARDENS) return 'Wardens only';
		if (actor.kit) return 'Already carried';
	}
	return '';
}

export function buy(state, actor, id) {
	const why = refusal(state, actor, id);
	if (why) return why;
	let price = priceOf(id);
	if (id === 'helmet' && actor.armor >= 100) price = 350; // just the helmet
	actor.money -= price;
	if (WEAPONS[id]) {
		const def = WEAPONS[id];
		const slot = def.slot === 1 ? actor.primary : actor.sidearm;
		giveWeapon(slot, id);
		actor.active = def.slot;
		actor.switching = 0.35;
		actor.reloading = 0;
		actor.scoped = false;
	} else if (GRENADES[id]) {
		actor.grenades[id] += 1;
	} else if (id === 'vest') {
		actor.armor = 100;
	} else if (id === 'helmet') {
		actor.armor = 100; actor.helmet = true;
	} else if (id === 'kit') {
		actor.kit = true;
	}
	const e = state.events.emit('bought');
	e.actor = actor.id; e.text = id;
	return '';
}
