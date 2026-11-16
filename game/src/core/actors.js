// Actors: the ten combatants, player and bots alike. Each holds only data; the systems
// (movement, weapons, bots, round) act on it. All ten are made once per match and reset each
// round in place: a death or a respawn creates nothing.
import * as THREE from 'three';
import { WEAPONS, MOVE, TEAM_SIZE } from '../config.js';

export function createWeaponSlot() {
	return { def: null, mag: 0, reserve: 0 };
}

export function giveWeapon(slot, id) {
	const def = WEAPONS[id];
	slot.def = def; slot.mag = def.mag; slot.reserve = def.reserve;
}

const BOT_NAMES = [
	['Rook', 'Vasco', 'Imani', 'Teodor', 'Quill'],
	['Marlow', 'Sable', 'Okafor', 'Linnea', 'Brandt'],
];

function createIntent() {
	return {
		forward: 0, right: 0, walk: false, crouch: false, jump: false,
		fire: false, firePressed: false, reload: false, use: false, aim: false,
		select: 0, throwKind: '', drop: false,
	};
}

export function createActor(id, squad, isPlayer, name) {
	return {
		id, squad, isPlayer, name,
		team: 0,                    // current side: TEAM.RAIDERS or TEAM.WARDENS (swaps at halftime)
		alive: false,
		health: 100, armor: 0, helmet: false, kit: false,
		money: 0,
		pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(),
		viewPos: new THREE.Vector3(),   // where the renderer drew it last frame (hit tests use it)
		onGround: true,
		yaw: 0, pitch: 0, prevYaw: 0,
		punchPitch: 0, punchYaw: 0, shotsFired: 0, // recoil: view punch and the spray index
		crouching: false, crouchAmount: 0,         // 0 standing, 1 fully crouched (eases between)
		height: MOVE.standHeight,
		primary: createWeaponSlot(), sidearm: createWeaponSlot(),
		active: 2,                                 // 1 primary, 2 sidearm, 4 grenade, 5 charge
		grenades: { frag: 0, smoke: 0, flash: 0 }, grenadeKind: 'frag',
		cooldown: 0, reloading: 0, switching: 0, triggerHeld: false,
		scoped: false, rescope: 0,
		hasCharge: false,
		using: 0,                                  // plant or defuse progress (seconds)
		flash: 0, flashTotal: 0,
		footstep: 0,
		lastAttacker: -1, damageYaw: 0, damageTime: 0,
		deathTime: 0, deathYaw: 0,
		kills: 0, deaths: 0, roundKills: 0, roundDamage: 0,
		intent: createIntent(),
		brain: null,
	};
}

export function createRoster(playerName) {
	const actors = [];
	for (let squad = 0; squad < 2; squad += 1) {
		for (let i = 0; i < TEAM_SIZE; i += 1) {
			const isPlayer = squad === 0 && i === 0;
			actors.push(createActor(actors.length, squad, isPlayer, isPlayer ? playerName : BOT_NAMES[squad][i]));
		}
	}
	return actors;
}

export function eyeHeight(actor) {
	return MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * actor.crouchAmount;
}

export function activeSlot(actor) {
	if (actor.active === 1 && actor.primary.def) return actor.primary;
	if (actor.active === 2 && actor.sidearm.def) return actor.sidearm;
	return null;
}

export function grenadeCount(actor) {
	return actor.grenades.frag + actor.grenades.smoke + actor.grenades.flash;
}

// Forward vector of an actor's view (yaw 0 faces -Z, positive yaw turns right).
export function viewDirection(yaw, pitch, out) {
	const cp = Math.cos(pitch);
	return out.set(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}
