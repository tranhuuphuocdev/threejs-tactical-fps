// What a bot knows: who it can see (a cone of vision, walls and smoke in the way, blinded by
// flashes) and what it heard (gunshots far, running footsteps near). Bots never read positions
// they could not perceive; teammates share sightings through the team's intel board.
import { BOT, TEAM_SIZE } from '../config.js';
import { eyeHeight } from '../core/actors.js';

const SIGHT_HEIGHTS = [1.58, 1.15]; // head, then chest

export function createIntel() {
	return [0, 1].map(() => Array.from({ length: TEAM_SIZE * 2 }, () => ({ x: 0, z: 0, t: -99 })));
}

// Can `bot` see `target` right now? Checks range, the view cone, walls, and smoke, eye to head
// and eye to chest (either counts).
export function canSee(state, bot, target) {
	if (bot.flash > 0.6) return false;
	const ex = bot.pos.x; const ey = bot.pos.y + eyeHeight(bot); const ez = bot.pos.z;
	const dx = target.pos.x - ex; const dz = target.pos.z - ez;
	const dist = Math.hypot(dx, dz);
	if (dist > BOT.sightRange) return false;
	if (dist > 2.5) {
		const fx = Math.sin(bot.yaw); const fz = -Math.cos(bot.yaw);
		const cos = (dx * fx + dz * fz) / Math.max(dist, 1e-3);
		if (cos < Math.cos(BOT.fov / 2)) return false;
	}
	const s = target.height / 1.78;
	for (const h of SIGHT_HEIGHTS) {
		const ty = target.pos.y + h * s;
		if (!state.collision.segmentClear(ex, ey, ez, target.pos.x, ty, target.pos.z)) continue;
		if (state.grenades.blocksSight(ex, ey, ez, target.pos.x, ty, target.pos.z)) continue;
		return true;
	}
	return false;
}

// A sound event reaches bots of the other side within its radius.
export function hear(state, event) {
	const source = state.actors[event.actor];
	if (!source) return;
	const radius = event.type === 'shot' ? BOT.hearGunshot : event.type === 'land' ? BOT.hearStep * 1.3 : BOT.hearStep;
	for (const bot of state.actors) {
		if (!bot.brain || !bot.alive || bot.team === source.team) continue;
		const d = Math.hypot(bot.pos.x - event.x, bot.pos.z - event.z);
		if (d > radius) continue;
		bot.brain.heardX = event.x; bot.brain.heardZ = event.z; bot.brain.heardT = state.time;
	}
}

// Post a sighting to the team board so teammates can rotate and pre-aim.
export function report(state, bot, target) {
	const slot = state.intel[bot.team][target.id];
	slot.x = target.pos.x; slot.z = target.pos.z; slot.t = state.time;
}
