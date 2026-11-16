// The match: one state object holding everything the simulation knows, and the fixed-step tick
// that advances it. Rendering never writes here; it reads the state and drains the event queue.
// Tick order: bots think, everyone moves, everyone fires, grenades fly, the objective and the
// round update. The same tick runs for player and bots, at 60 Hz, independent of frame rate.
import * as THREE from 'three';
import { DT, TEAM } from './config.js';
import { createCollisionWorld } from './world/collision.js';
import { createNav } from './world/nav.js';
import { createEventQueue } from './core/events.js';
import { createRoster } from './core/actors.js';
import { stepMovement } from './sim/movement.js';
import { stepWeapons } from './sim/weapons.js';
import { createGrenadeSystem } from './sim/grenades.js';
import { stepObjective, siteAt } from './sim/objective.js';
import { createRound, startRound, stepRound, endRound } from './sim/round.js';
import { createBrain, resetBrain, stepBrain } from './bots/brain.js';
import { createIntel } from './bots/perception.js';
import { createTactics, planRound, stepTactics } from './bots/tactics.js';

function mulberry32(seed) {
	let a = seed >>> 0;
	return function random() {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function createGame(seed) {
	const collision = createCollisionWorld();
	const state = {
		time: 0,
		random: mulberry32(seed),
		collision,
		nav: createNav(),
		events: createEventQueue(),
		actors: createRoster('You'),
		round: createRound(),
		charge: { state: 'carried', carrier: -1, pos: new THREE.Vector3(), site: '', fuse: 0, beep: 0, defuser: -1, planter: -1 },
		grenades: createGrenadeSystem(),
		intel: createIntel(),
		tactics: createTactics(),
		fovRad: 1.2,
		siteAt,
		endRound: null,
	};
	state.endRound = (side, reason) => endRound(state, side, reason);
	const player = state.actors[0];
	let roundSeen = 0;

	function newMatch(playerSide, skill) {
		state.round = createRound();
		state.round.squadSide = playerSide === TEAM.RAIDERS ? [TEAM.RAIDERS, TEAM.WARDENS] : [TEAM.WARDENS, TEAM.RAIDERS];
		for (const a of state.actors) {
			a.kills = 0; a.deaths = 0; a.alive = false;
			if (!a.isPlayer) a.brain = createBrain(Math.max(0.15, Math.min(0.97, skill + (state.random() - 0.5) * 0.2)));
		}
		roundSeen = 0;
		startRound(state);
	}

	function onRoundBegan() {
		for (const side of state.intel) for (const s of side) s.t = -99;
		for (const a of state.actors) if (a.brain) resetBrain(a.brain, state, a);
		planRound(state);
	}

	function tick() {
		state.time += DT;
		if (state.round.number !== roundSeen) { roundSeen = state.round.number; onRoundBegan(); }
		const actors = state.actors;
		for (let i = 0; i < actors.length; i += 1) actors[i].prevYaw = actors[i].yaw;
		stepTactics(state, DT);
		for (let i = 0; i < actors.length; i += 1) if (actors[i].brain) stepBrain(state, actors[i], DT);
		for (let i = 0; i < actors.length; i += 1) {
			const a = actors[i];
			if (!a.alive) { a.prevPos.copy(a.pos); continue; }
			if (a.isPlayer && a.flash > 0) a.flash = Math.max(0, a.flash - DT);
			stepMovement(state, a, DT);
			stepWeapons(state, a, DT);
		}
		state.grenades.step(state, DT);
		stepObjective(state, DT);
		if (state.round.phase !== 'over') stepRound(state, DT);
	}

	return { state, player, newMatch, tick };
}
