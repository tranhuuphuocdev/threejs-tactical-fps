// The breach charge: carried by a Raider, planted at a pump station, defused by a Warden.
// Plant: stand in a site with the charge and hold Use for plantTime. Defuse: stand over the
// charge and hold Use for defuseTime (halved with a cutter kit). Moving, or taking a hit as a bot,
// cancels. A dropped charge is picked up by the first Raider to walk over it.
import { ROUND, ECONOMY, TEAM } from '../config.js';
import { CELL, ROWS, COLS, DEPTH } from '../map/layout.js';
import { applyDamage } from './combat.js';

export function siteAt(x, z) {
	const c = Math.floor(x / CELL); const r = Math.floor(z / CELL);
	if (c < 0 || r < 0 || c >= COLS || r >= DEPTH) return '';
	const ch = ROWS[r][c];
	return ch === 'a' ? 'A' : ch === 'b' ? 'B' : '';
}

export function stepObjective(state, dt) {
	const c = state.charge;
	const round = state.round;
	if (round.phase !== 'live' && round.phase !== 'planted') return;

	if (c.state === 'dropped') {
		for (const a of state.actors) {
			if (!a.alive || a.team !== TEAM.RAIDERS) continue;
			if (Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) < 1.0) {
				a.hasCharge = true; c.state = 'carried'; c.carrier = a.id;
				const e = state.events.emit('chargePicked'); e.actor = a.id;
				break;
			}
		}
	}

	for (const a of state.actors) {
		if (!a.alive) continue;
		const wantsUse = a.intent.use;
		if (a.team === TEAM.RAIDERS && a.hasCharge && c.state === 'carried') {
			const site = siteAt(a.pos.x, a.pos.z);
			if (wantsUse && site && a.onGround) {
				if (a.using === 0) { const e = state.events.emit('plantStart'); e.actor = a.id; }
				a.using += dt;
				if (a.using >= ROUND.plantTime) plant(state, a, site);
			} else a.using = 0;
		} else if (a.team === TEAM.WARDENS && c.state === 'planted') {
			const near = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) < 1.6;
			if (wantsUse && near && a.onGround) {
				if (a.using === 0) { c.defuser = a.id; const e = state.events.emit('defuseStart'); e.actor = a.id; e.flag = a.kit; }
				a.using += dt;
				if (a.using >= (a.kit ? ROUND.defuseKitTime : ROUND.defuseTime)) defuse(state, a);
			} else {
				a.using = 0;
				if (c.defuser === a.id) c.defuser = -1;
			}
		} else a.using = 0;
	}

	if (c.state === 'planted') {
		c.fuse -= dt;
		c.beep -= dt;
		if (c.beep <= 0) {
			// Beeps quicken as the fuse burns: from every second down to ten a second.
			c.beep = Math.max(0.1, Math.min(1, c.fuse / ROUND.fuseTime) * 1.0);
			const e = state.events.emit('beep'); e.x = c.pos.x; e.y = c.pos.y; e.z = c.pos.z; e.amount = c.fuse;
		}
		if (c.fuse <= 0) explode(state);
	}
}

function plant(state, actor, site) {
	const c = state.charge;
	actor.using = 0;
	actor.hasCharge = false;
	c.state = 'planted'; c.carrier = -1; c.site = site; c.fuse = ROUND.fuseTime; c.beep = 0; c.defuser = -1;
	c.pos.set(actor.pos.x, 0.02, actor.pos.z);
	c.planter = actor.id;
	actor.money = Math.min(ECONOMY.max, actor.money + ECONOMY.plantBonus);
	state.round.phase = 'planted';
	state.round.timer = ROUND.fuseTime;
	if (actor.active === 5) { actor.active = actor.primary.def ? 1 : 2; actor.switching = 0.4; }
	const e = state.events.emit('planted'); e.actor = actor.id; e.text = site;
	e.x = c.pos.x; e.y = c.pos.y; e.z = c.pos.z;
}

function defuse(state, actor) {
	const c = state.charge;
	actor.using = 0;
	c.state = 'defused';
	actor.money = Math.min(ECONOMY.max, actor.money + ECONOMY.defuseBonus);
	const e = state.events.emit('defused'); e.actor = actor.id;
	state.endRound(TEAM.WARDENS, 'Charge cut');
}

function explode(state) {
	const c = state.charge;
	c.state = 'exploded';
	const e = state.events.emit('explode'); e.x = c.pos.x; e.y = c.pos.y; e.z = c.pos.z;
	for (const a of state.actors) {
		if (!a.alive) continue;
		const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z);
		if (d < 22) applyDamage(state, a, null, 'charge', 500 * (1 - d / 22) ** 1.4, 'blast', 0.8, 1);
	}
	state.endRound(TEAM.RAIDERS, 'Pump station breached');
}
