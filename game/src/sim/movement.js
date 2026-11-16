// Ground movement for every actor, player and bot alike: friction, then acceleration toward the
// wished velocity (the source-engine model, so stopping and counter-strafing feel crisp), with
// walk and crouch speeds, jumping, and footsteps others can hear.
import { MOVE } from '../config.js';
import { activeSlot } from '../core/actors.js';

const wish = { x: 0, z: 0 };

export function maxSpeed(actor) {
	const slot = activeSlot(actor);
	const weight = slot ? slot.def.speed : 1;
	const scoped = actor.scoped ? 0.55 : 1;
	return MOVE.runSpeed * weight * scoped;
}

export function stepMovement(state, actor, dt) {
	const intent = actor.intent;
	const frozen = state.round.phase === 'freeze' || actor.using > 0;
	const crouchWanted = intent.crouch || actor.using > 0;

	// Crouch eases in and out; standing up needs headroom.
	if (crouchWanted) actor.crouching = true;
	else if (actor.crouching && state.collision.fits(actor.pos.x, actor.pos.y, actor.pos.z, MOVE.radius, MOVE.standHeight)) actor.crouching = false;
	const crouchTarget = actor.crouching ? 1 : 0;
	const blend = Math.min(1, MOVE.crouchRate * dt);
	actor.crouchAmount += (crouchTarget - actor.crouchAmount) * blend;
	actor.height = MOVE.standHeight + (MOVE.crouchHeight - MOVE.standHeight) * actor.crouchAmount;

	let speed = maxSpeed(actor);
	if (actor.crouching) speed *= MOVE.crouchFactor;
	else if (intent.walk) speed *= MOVE.walkFactor;

	// Wished direction in world space from the actor's yaw.
	let f = frozen ? 0 : intent.forward;
	let r = frozen ? 0 : intent.right;
	const len = Math.hypot(f, r);
	if (len > 1) { f /= len; r /= len; }
	const sy = Math.sin(actor.yaw); const cy = Math.cos(actor.yaw);
	wish.x = sy * f + cy * r;
	wish.z = -cy * f + sy * r;
	const wishLen = Math.hypot(wish.x, wish.z);
	const wishSpeed = wishLen > 0 ? speed * Math.min(1, wishLen) : 0;
	if (wishLen > 0) { wish.x /= wishLen; wish.z /= wishLen; }

	const v = actor.vel;
	if (actor.onGround) {
		// Friction.
		const sp = Math.hypot(v.x, v.z);
		if (sp > 0) {
			const control = Math.max(sp, MOVE.stopSpeed);
			const drop = control * MOVE.friction * dt;
			const scale = Math.max(0, sp - drop) / sp;
			v.x *= scale; v.z *= scale;
		}
		accelerate(v, wish, wishSpeed, MOVE.groundAccel, dt);
		if (intent.jump && !frozen && !actor.crouching) {
			v.y = MOVE.jumpSpeed;
			actor.onGround = false;
			intent.jump = false;
		}
	} else {
		accelerate(v, wish, Math.min(wishSpeed, 0.9), MOVE.airAccel * 10, dt);
	}
	v.y -= MOVE.gravity * dt;

	actor.prevPos.copy(actor.pos);
	const wasAir = !actor.onGround;
	const fallSpeed = -v.y;
	state.collision.moveBody(actor, MOVE.radius, actor.height, dt);

	// Footsteps: audible when running (not walking or crouching) and on landing hard.
	const horizontal = Math.hypot(v.x, v.z);
	if (actor.onGround && horizontal > MOVE.footstepSpeed) {
		actor.footstep -= dt * horizontal;
		if (actor.footstep <= 0) {
			actor.footstep = 2.3;
			const e = state.events.emit('step');
			e.actor = actor.id; e.x = actor.pos.x; e.y = actor.pos.y; e.z = actor.pos.z;
		}
	}
	if (wasAir && actor.onGround && fallSpeed > 6) {
		const e = state.events.emit('land');
		e.actor = actor.id; e.x = actor.pos.x; e.y = actor.pos.y; e.z = actor.pos.z;
	}
}

function accelerate(v, dir, wishSpeed, accel, dt) {
	const current = v.x * dir.x + v.z * dir.z;
	const add = wishSpeed - current;
	if (add <= 0) return;
	const amount = Math.min(add, accel * wishSpeed * dt);
	v.x += dir.x * amount;
	v.z += dir.z * amount;
}

export function horizontalSpeed(actor) {
	return Math.hypot(actor.vel.x, actor.vel.z);
}
