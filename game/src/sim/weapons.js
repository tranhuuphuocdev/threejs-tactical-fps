// Firing, recoil, spread, reloading, switching, scoping and throwing, for player and bots alike.
// Accuracy is earned: the cone grows with speed beyond the weapon's accurate speed, in the air and
// with every shot of a spray, and shrinks when crouched. Recoil kicks the view up and then walks
// it sideways in a fixed per-weapon pattern a player can learn to pull against.
import * as THREE from 'three';
import { GRENADES, GRENADE_THROW } from '../config.js';
import { activeSlot, eyeHeight, grenadeCount, viewDirection } from '../core/actors.js';
import { horizontalSpeed, maxSpeed } from './movement.js';
import { traceShot } from './ballistics.js';
import { applyDamage } from './combat.js';

const dir = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const traceResult = { distance: 0, victim: null, zone: '', nx: 0, ny: 0, nz: 0, hitWorld: false };
const SWITCH_TIME = 0.42;

// Horizontal recoil walk: up the first shots, then a slow drift right, a swing left, and back.
function sway(shot) {
	if (shot < 4) return 0;
	return Math.sin((shot - 4) * 0.42) * 1.6 + 0.4;
}

// The cone half-angle (radians) the next bullet is drawn from.
export function inaccuracy(actor) {
	const slot = activeSlot(actor);
	if (!slot) return 0;
	const def = slot.def;
	let cone = actor.scoped && def.scopedSpread ? def.scopedSpread : def.spread;
	const top = maxSpeed(actor);
	const speed = horizontalSpeed(actor);
	if (speed > def.accurateSpeed) cone += def.moveSpread * Math.min(1, (speed - def.accurateSpeed) / Math.max(0.1, top - def.accurateSpeed));
	if (!actor.onGround) cone += def.airSpread;
	if (actor.crouchAmount > 0.6 && actor.onGround) cone *= def.crouchMult;
	if (def.auto) cone += Math.min(actor.shotsFired, 12) * def.spread * 0.45;
	return cone;
}

function startReload(state, actor, slot) {
	if (actor.reloading > 0 || slot.mag >= slot.def.mag || slot.reserve <= 0) return;
	actor.reloading = slot.def.reload;
	actor.scoped = false;
	const e = state.events.emit('reload');
	e.actor = actor.id; e.weapon = slot.def.id; e.x = actor.pos.x; e.y = actor.pos.y; e.z = actor.pos.z;
}

function finishReload(slot) {
	const need = slot.def.mag - slot.mag;
	const take = Math.min(need, slot.reserve);
	slot.mag += take;
	slot.reserve -= take;
}

export function selectSlot(state, actor, which) {
	if (which === actor.active) return;
	if (which === 1 && !actor.primary.def) return;
	if (which === 4 && grenadeCount(actor) === 0) return;
	if (which === 5 && !actor.hasCharge) return;
	actor.active = which;
	actor.switching = SWITCH_TIME;
	actor.reloading = 0;
	actor.scoped = false;
	actor.rescope = 0;
	actor.shotsFired = 0;
	if (which === 4 && actor.grenades[actor.grenadeKind] === 0) nextGrenadeKind(actor);
	const e = state.events.emit('switch');
	e.actor = actor.id; e.amount = which;
}

export function nextGrenadeKind(actor) {
	const order = ['frag', 'flash', 'smoke'];
	const start = order.indexOf(actor.grenadeKind);
	for (let i = 1; i <= 3; i += 1) {
		const kind = order[(start + i) % 3];
		if (actor.grenades[kind] > 0) { actor.grenadeKind = kind; return; }
	}
}

function bestWeaponSlot(actor) {
	if (actor.primary.def) return 1;
	return 2;
}

// One bullet from the actor's eye along its punched view, with spread drawn from the shared RNG.
function fireBullet(state, actor, slot) {
	const def = slot.def;
	const cone = inaccuracy(actor);
	viewDirection(actor.yaw + actor.punchYaw, actor.pitch + actor.punchPitch, dir);
	right.set(Math.cos(actor.yaw), 0, Math.sin(actor.yaw));
	up.crossVectors(right, dir).normalize();
	const angle = state.random() * Math.PI * 2;
	const radius = cone * Math.sqrt(state.random());
	dir.addScaledVector(right, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius).normalize();

	const ex = actor.pos.x; const ey = actor.pos.y + eyeHeight(actor); const ez = actor.pos.z;
	traceShot(state, actor, ex, ey, ez, dir.x, dir.y, dir.z, 200, traceResult);
	const d = traceResult.distance;
	const e = state.events.emit('shot');
	e.actor = actor.id; e.weapon = def.id;
	e.x = ex; e.y = ey; e.z = ez;
	e.x2 = ex + dir.x * d; e.y2 = ey + dir.y * d; e.z2 = ez + dir.z * d;
	e.nx = traceResult.nx; e.ny = traceResult.ny; e.nz = traceResult.nz;
	e.flag = traceResult.hitWorld;
	e.head = traceResult.zone === 'head';
	e.other = traceResult.victim ? traceResult.victim.id : -1;
	if (traceResult.victim) {
		const falloff = def.falloff ** (d / 10);
		applyDamage(state, traceResult.victim, actor, def.id, def.damage * falloff, traceResult.zone, def.armorPen, def.headMult);
	}
}

function applyRecoil(actor, def) {
	actor.shotsFired += 1;
	const climb = actor.shotsFired === 1 ? def.recoil * 0.7 : def.recoil;
	actor.punchPitch = Math.min(def.maxRecoil, actor.punchPitch + climb);
	actor.punchYaw += def.sway * sway(actor.shotsFired) * 0.5;
	const yawLimit = def.maxRecoil * 0.6;
	actor.punchYaw = Math.max(-yawLimit, Math.min(yawLimit, actor.punchYaw));
}

function recoverRecoil(actor, slot, dt) {
	const recover = slot ? slot.def.recover : 0.12;
	const firingRecently = slot && actor.cooldown > -slot.def.interval * 0.5;
	if (firingRecently) return;
	const k = Math.min(1, dt * (2.8 / recover));
	actor.punchPitch -= actor.punchPitch * k;
	actor.punchYaw -= actor.punchYaw * k;
	if (Math.abs(actor.punchPitch) < 0.0015) actor.shotsFired = 0;
}

function throwGrenade(state, actor, underhand) {
	const kind = actor.grenadeKind;
	if (actor.grenades[kind] <= 0) return;
	const g = state.grenades.spawn(kind, actor.id);
	if (!g) return;
	actor.grenades[kind] -= 1;
	viewDirection(actor.yaw, actor.pitch + 0.08, dir);
	const speed = underhand ? GRENADE_THROW.speed * 0.45 : GRENADE_THROW.speed;
	g.pos.set(actor.pos.x + dir.x * 0.4, actor.pos.y + eyeHeight(actor) - 0.1, actor.pos.z + dir.z * 0.4);
	g.vel.set(dir.x * speed + actor.vel.x * 0.6, dir.y * speed + GRENADE_THROW.upward * (underhand ? 0.4 : 1), dir.z * speed + actor.vel.z * 0.6);
	g.fuse = GRENADES[kind].fuse;
	const e = state.events.emit('throw');
	e.actor = actor.id; e.weapon = kind; e.x = g.pos.x; e.y = g.pos.y; e.z = g.pos.z;
	actor.cooldown = 0.6;
	if (grenadeCount(actor) === 0) selectSlot(state, actor, bestWeaponSlot(actor));
	else if (actor.grenades[kind] === 0) nextGrenadeKind(actor);
}

export function stepWeapons(state, actor, dt) {
	const intent = actor.intent;
	const phase = state.round.phase;
	if (intent.select) { selectSlot(state, actor, intent.select); intent.select = 0; }
	actor.cooldown -= dt;
	if (actor.switching > 0) actor.switching -= dt;
	const slot = activeSlot(actor);
	recoverRecoil(actor, slot, dt);

	if (actor.rescope > 0) {
		actor.rescope -= dt;
		if (actor.rescope <= 0 && slot && slot.def.zoom) actor.scoped = true;
	}
	if (actor.reloading > 0) {
		actor.reloading -= dt;
		if (actor.reloading <= 0 && slot) { actor.reloading = 0; finishReload(slot); }
	}

	const canAct = phase !== 'freeze' && actor.switching <= 0 && actor.using <= 0;
	if (actor.active === 4) {
		if (canAct && actor.cooldown <= 0 && intent.firePressed) throwGrenade(state, actor, false);
		else if (canAct && actor.cooldown <= 0 && intent.aimPressed) throwGrenade(state, actor, true);
		intent.firePressed = false; intent.aimPressed = false;
		return;
	}
	if (!slot) { intent.firePressed = false; return; }
	const def = slot.def;

	// Scope toggles on the aim button for weapons that zoom.
	if (intent.aimPressed) {
		if (def.zoom && actor.reloading <= 0) actor.scoped = !actor.scoped;
		intent.aimPressed = false;
	}
	if (intent.reload) { startReload(state, actor, slot); intent.reload = false; }

	const trigger = def.auto ? intent.fire : intent.firePressed;
	intent.firePressed = false;
	if (!intent.fire) actor.triggerHeld = false;
	if (!canAct || !trigger || actor.reloading > 0 || actor.cooldown > 0) return;
	if (slot.mag <= 0) {
		if (!actor.triggerHeld) {
			const e = state.events.emit('dry');
			e.actor = actor.id;
			actor.triggerHeld = true;
		}
		if (slot.reserve > 0) startReload(state, actor, slot);
		return;
	}
	slot.mag -= 1;
	actor.cooldown = Math.max(actor.cooldown, 0) + def.interval;
	fireBullet(state, actor, slot);
	applyRecoil(actor, def);
	actor.triggerHeld = true;
	if (def.zoom && actor.scoped) { actor.scoped = false; actor.rescope = def.interval; }
	if (slot.mag === 0 && slot.reserve > 0 && !actor.isPlayer) startReload(state, actor, slot);
}
