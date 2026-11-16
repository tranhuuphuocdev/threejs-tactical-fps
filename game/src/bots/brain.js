// One bot's decisions each tick, written into its intent exactly as the player's keys and mouse
// are: so bots obey the same movement, spread and recoil rules. Priorities, highest first:
//   engage   an enemy in sight: react, settle the aim, stop, fire in bursts, strafe between them
//   seek     an enemy lost from sight or a sound heard: check the spot, pre-aimed
//   objective plant, defuse, fetch the dropped charge, follow the lane, or hold a post
import { BOT, TEAM, ROUND, GRENADE_THROW } from '../config.js';
import { CELL, calloutAt } from '../map/layout.js';
import { activeSlot, eyeHeight } from '../core/actors.js';
import { canSee, report } from './perception.js';
import { plantSpot } from './tactics.js';
import { siteAt } from '../sim/objective.js';

export function createBrain(skill) {
	return {
		skill,
		role: 'attack', site: 'A', area: 'A',
		route: [], routeIdx: 0,
		post: { x: 0, z: 0, yaw: 0 },
		path: [], pathLen: 0, pathIdx: 0, goalX: 0, goalZ: 0, repath: 0,
		target: -1, visible: false, seenAt: -99, lastSeenX: 0, lastSeenZ: 0, lastSeenT: -99,
		heardX: 0, heardZ: 0, heardT: -99,
		aimErrX: 0, aimErrY: 0,
		burstLeft: 0, pause: 0,
		strafe: 1, strafeT: 0,
		think: 0,
		stuck: 0, lastX: 0, lastZ: 0,
		lookYaw: 0, lookPitch: 0,
		crouchHold: false,
		mode: 'idle',
		toss: { kind: '', x: 0, z: 0 },   // a grenade throw in progress (kind '' when none)
	};
}

export function resetBrain(brain, state, bot) {
	brain.target = -1; brain.visible = false; brain.lastSeenT = -99; brain.heardT = -99;
	brain.pathLen = 0; brain.pathIdx = 0; brain.repath = 0; brain.burstLeft = 0; brain.pause = 0;
	brain.think = state.random() * BOT.thinkInterval;
	brain.lookYaw = bot.yaw; brain.lookPitch = 0;
	brain.lastX = bot.pos.x; brain.lastZ = bot.pos.z; brain.stuck = 0;
	brain.mode = 'idle';
	brain.toss.kind = '';
}

function angleDiff(a, b) {
	let d = a - b;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return d;
}

// Perception pass: pick the nearest visible enemy, report it, keep the engagement's timing.
function perceive(state, bot, brain) {
	let best = null; let bestD = Infinity;
	for (const other of state.actors) {
		if (!other.alive || other.team === bot.team) continue;
		if (!canSee(state, bot, other)) continue;
		report(state, bot, other);
		const d = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
		const sticky = other.id === brain.target ? 0.7 : 1; // keep the current target unless much closer
		if (d * sticky < bestD) { bestD = d * sticky; best = other; }
	}
	if (best) {
		if (!brain.visible || brain.target !== best.id) {
			const [r0, r1] = BOT.reaction;
			brain.seenAt = state.time + (r0 + (r1 - r0) * state.random()) * (1.6 - brain.skill * 0.8);
			const err = BOT.aimError * (1.5 - brain.skill);
			brain.aimErrX = (state.random() - 0.5) * 2 * err;
			brain.aimErrY = (state.random() - 0.5) * err;
			brain.burstLeft = 0; brain.pause = 0;
			if (state.round.phase !== 'freeze') radio(state, bot, `Contact, ${calloutAt(best.pos.x, best.pos.z) || 'close'}`);
		}
		brain.target = best.id; brain.visible = true;
		brain.lastSeenX = best.pos.x; brain.lastSeenZ = best.pos.z; brain.lastSeenT = state.time;
	} else {
		brain.visible = false;
	}
}

// A short team call ("Contact, Pump Hall"), at most one per side every few seconds.
function radio(state, bot, text) {
	const last = state.tactics.lastRadio;
	if (state.time - last[bot.team] < 3.5) return;
	last[bot.team] = state.time;
	const e = state.events.emit('radio');
	e.actor = bot.id; e.text = text;
}

function goTo(state, bot, brain, x, z) {
	const moved = Math.hypot(x - brain.goalX, z - brain.goalZ) > 1.5;
	if (moved || brain.repath <= 0 || brain.pathLen === 0) {
		brain.goalX = x; brain.goalZ = z;
		brain.pathLen = state.nav.findPath(bot.pos.x, bot.pos.z, x, z, brain.path);
		brain.pathIdx = 0;
		brain.repath = 1.5;
	}
}

// Steer along the path. Returns the remaining distance to the goal; writes the move direction.
const moveDir = { x: 0, z: 0 };
function followPath(bot, brain) {
	moveDir.x = 0; moveDir.z = 0;
	while (brain.pathIdx < brain.pathLen) {
		const p = brain.path[brain.pathIdx];
		const d = Math.hypot(p.x - bot.pos.x, p.z - bot.pos.z);
		if (d < 0.6 && brain.pathIdx < brain.pathLen - 1) { brain.pathIdx += 1; continue; }
		if (d < 0.35) return 0;
		moveDir.x = (p.x - bot.pos.x) / d; moveDir.z = (p.z - bot.pos.z) / d;
		let remaining = d;
		for (let i = brain.pathIdx + 1; i < brain.pathLen; i += 1) {
			remaining += Math.hypot(brain.path[i].x - brain.path[i - 1].x, brain.path[i].z - brain.path[i - 1].z);
		}
		return remaining;
	}
	return 0;
}

// Turn a world-space move direction into forward/right input relative to the bot's yaw.
function applyMove(bot, dx, dz, scale) {
	const fx = Math.sin(bot.yaw); const fz = -Math.cos(bot.yaw);
	bot.intent.forward = (dx * fx + dz * fz) * scale;
	bot.intent.right = (dx * Math.cos(bot.yaw) + dz * Math.sin(bot.yaw)) * scale;
}

function face(brain, x, z, bot) {
	brain.lookYaw = Math.atan2(x - bot.pos.x, -(z - bot.pos.z));
}

export function stepBrain(state, bot, dt) {
	const brain = bot.brain;
	const intent = bot.intent;
	intent.forward = 0; intent.right = 0; intent.fire = false; intent.firePressed = false;
	intent.use = false; intent.walk = false; intent.jump = false; intent.crouch = brain.crouchHold;
	if (!bot.alive) return;
	if (bot.flash > 0) bot.flash = Math.max(0, bot.flash - dt);
	brain.repath -= dt;
	brain.think -= dt;
	if (brain.think <= 0) { brain.think = BOT.thinkInterval; perceive(state, bot, brain); }
	if (state.round.phase === 'freeze') { brain.lookYaw = bot.yaw; return; }

	const slot = activeSlot(bot);
	if (slot && slot.mag === 0 && slot.reserve === 0 && bot.sidearm.mag + bot.sidearm.reserve > 0) intent.select = 2;
	if (brain.toss.kind && brain.visible) brain.toss.kind = ''; // no time for utility in a gunfight
	if (brain.toss.kind) { if (stepToss(state, bot, brain)) { turn(bot, brain, dt); return; } }
	else if (bot.active === 4 || bot.active === 5) intent.select = bot.primary.def ? 1 : 2;

	const target = brain.target >= 0 ? state.actors[brain.target] : null;
	const c = state.charge;
	const defusingClutch = bot.using > 0 && bot.team === TEAM.WARDENS && c.fuse < (bot.kit ? ROUND.defuseKitTime : ROUND.defuseTime) + 0.3 - bot.using;

	if (brain.visible && target && target.alive && !defusingClutch) {
		engage(state, bot, brain, target, dt);
	} else if (!objectiveUrgent(state, bot) && state.time - brain.lastSeenT < BOT.memory && target && target.alive) {
		brain.mode = 'seek';
		goTo(state, bot, brain, brain.lastSeenX, brain.lastSeenZ);
		const rem = followPath(bot, brain);
		face(brain, brain.lastSeenX, brain.lastSeenZ, bot);
		if (rem > 0.5) applyMove(bot, moveDir.x, moveDir.z, 1);
		intent.walk = rem < 8;
		brain.crouchHold = false;
	} else if (!objectiveUrgent(state, bot) && state.time - brain.heardT < 2.5 && brain.role === 'defend') {
		brain.mode = 'listen';
		face(brain, brain.heardX, brain.heardZ, bot);
		const d = Math.hypot(brain.heardX - bot.pos.x, brain.heardZ - bot.pos.z);
		if (d > 10 && d < 30) planToss(bot, brain, 'frag', brain.heardX, brain.heardZ);
		objective(state, bot, brain, true);
	} else {
		objective(state, bot, brain, false);
	}

	turn(bot, brain, dt);
	unstick(state, bot, brain, dt);
}

// Grenades: queue a throw of `kind` at (x, z) if the bot carries one; stepToss draws it, aims a
// lob that lands near the spot (a scan of release angles over the throw's ballistic range) and
// releases it, then the bot goes back to its gun.
function planToss(bot, brain, kind, x, z) {
	if (brain.toss.kind || bot.grenades[kind] <= 0) return;
	brain.toss.kind = kind; brain.toss.x = x; brain.toss.z = z;
}

function lobPitch(distance, height) {
	let best = 0.2; let bestErr = Infinity;
	for (let p = -0.3; p <= 0.9; p += 0.04) {
		const a = p + 0.08;
		const vx = GRENADE_THROW.speed * Math.cos(a);
		const vy = GRENADE_THROW.speed * Math.sin(a) + GRENADE_THROW.upward;
		const t = (vy + Math.sqrt(vy * vy + 32 * height)) / 16;
		const err = Math.abs(vx * t - distance * 0.8); // aim short: it bounces on
		if (err < bestErr) { bestErr = err; best = p; }
	}
	return best;
}

function stepToss(state, bot, brain) {
	const toss = brain.toss;
	if (bot.grenades[toss.kind] <= 0) { toss.kind = ''; return false; }
	bot.grenadeKind = toss.kind;
	if (bot.active !== 4) { bot.intent.select = 4; }
	face(brain, toss.x, toss.z, bot);
	brain.lookPitch = lobPitch(Math.hypot(toss.x - bot.pos.x, toss.z - bot.pos.z), eyeHeight(bot));
	const aimed = Math.abs(angleDiff(brain.lookYaw, bot.yaw)) < 0.05 && Math.abs(brain.lookPitch - bot.pitch) < 0.05;
	if (bot.active === 4 && bot.switching <= 0 && bot.cooldown <= 0 && aimed) {
		bot.intent.firePressed = true;
		const e = state.events.emit('radio');
		e.actor = bot.id; e.text = toss.kind === 'frag' ? 'Frag out' : toss.kind === 'smoke' ? 'Smoke going in' : 'Flashing';
		toss.kind = '';
	}
	return true;
}

function objectiveUrgent(state, bot) {
	const c = state.charge;
	if (bot.team === TEAM.WARDENS && c.state === 'planted') return c.fuse < 18;
	if (bot.hasCharge) return state.round.timer < 30;
	return false;
}

function engage(state, bot, brain, target, dt) {
	const intent = bot.intent;
	brain.mode = 'engage';
	const dist = Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
	const s = target.height / 1.78;
	const aimHeight = (brain.skill > 0.65 && dist > 8 ? 1.56 : 1.3) * s;
	const ex = bot.pos.x; const ey = bot.pos.y + eyeHeight(bot); const ez = bot.pos.z;
	const tx = target.pos.x + target.vel.x * 0.06; const tz = target.pos.z + target.vel.z * 0.06;
	const settle = Math.exp(-BOT.aimSettle * brain.skill * Math.max(0, state.time - brain.seenAt + 0.4));
	brain.lookYaw = Math.atan2(tx - ex, -(tz - ez)) + brain.aimErrX * settle;
	brain.lookPitch = Math.atan2(target.pos.y + aimHeight - ey, Math.hypot(tx - ex, tz - ez)) + brain.aimErrY * settle;
	brain.lookPitch -= bot.punchPitch * (0.35 + brain.skill * 0.55);
	brain.lookYaw -= bot.punchYaw * (0.3 + brain.skill * 0.5);

	const slot = activeSlot(bot);
	if (slot && slot.mag === 0) {
		if (dist < 10 && bot.sidearm.mag > 0 && bot.active === 1) intent.select = 2;
		else intent.reload = true;
		applyMove(bot, -Math.sin(bot.yaw) * 0.3 + Math.cos(bot.yaw) * brain.strafe, Math.cos(bot.yaw) * 0.3 + Math.sin(bot.yaw) * brain.strafe, 1);
		return;
	}
	const ready = state.time >= brain.seenAt;
	const yawErr = Math.abs(angleDiff(brain.lookYaw, bot.yaw));
	const pitchErr = Math.abs(brain.lookPitch - bot.pitch);
	const tolerance = Math.max(0.012, Math.atan2(0.25, dist));
	const onTarget = yawErr < tolerance * 1.5 && pitchErr < tolerance * 1.5;

	brain.strafeT -= dt;
	if (brain.strafeT <= 0) { brain.strafe = state.random() < 0.5 ? -1 : 1; brain.strafeT = 0.35 + state.random() * 0.6; }

	if (brain.pause > 0) {
		brain.pause -= dt;
		applyMove(bot, Math.cos(bot.yaw) * brain.strafe, Math.sin(bot.yaw) * brain.strafe, 1);
		intent.walk = dist > 20;
		return;
	}
	if (!ready || !onTarget) {
		brain.crouchHold = false;
		return;
	}
	const sniper = slot && slot.def.zoom;
	if (sniper && !bot.scoped && dist > 6) { intent.aimPressed = true; return; }
	brain.crouchHold = dist > 18 && brain.skill > 0.4 && slot && slot.def.slot === 1;
	if (brain.burstLeft <= 0) {
		const b0 = BOT.burst[0]; const b1 = BOT.burst[1];
		brain.burstLeft = dist < 9 ? 10 : Math.round(b0 + (b1 - b0) * state.random() * (dist < 18 ? 1 : 0.4));
	}
	if (slot.def.auto) intent.fire = true;
	else if (bot.cooldown <= 0) intent.firePressed = true;
	if (bot.cooldown <= 0) {
		brain.burstLeft -= 1;
		if (brain.burstLeft <= 0) brain.pause = dist < 9 ? 0.05 : 0.22 + (1 - brain.skill) * 0.3;
	}
}

// Objective behaviour by role. listening: hold still and keep facing the sound.
function objective(state, bot, brain, listening) {
	const c = state.charge;
	const intent = bot.intent;
	brain.crouchHold = false;

	if (bot.team === TEAM.RAIDERS) {
		if (c.state === 'dropped') {
			let nearest = null; let nd = Infinity;
			for (const a of state.actors) {
				if (!a.alive || a.team !== TEAM.RAIDERS || !a.brain) continue;
				const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z);
				if (d < nd) { nd = d; nearest = a; }
			}
			if (nearest === bot) { brain.mode = 'fetch'; return moveTo(state, bot, brain, c.pos.x, c.pos.z, true); }
		}
		if (bot.hasCharge) {
			const site = siteAt(bot.pos.x, bot.pos.z);
			const spot = plantSpot(brain.site, bot.id);
			if (site && Math.hypot(spot.x - bot.pos.x, spot.z - bot.pos.z) < 1.2) {
				brain.mode = 'plant';
				intent.use = true;
				return;
			}
			if (brain.routeIdx >= brain.route.length || site) { brain.mode = 'toSite'; return moveTo(state, bot, brain, spot.x, spot.z, true); }
		}
		if (c.state === 'planted') {
			brain.mode = 'guard';
			const ang = bot.id * 1.3;
			const gx = c.pos.x + Math.cos(ang) * 5; const gz = c.pos.z + Math.sin(ang) * 5;
			const rem = moveTo(state, bot, brain, gx, gz, false);
			if (rem < 1) { face(brain, (CELL * 20), (CELL * 16), bot); intent.crouch = true; }
			return;
		}
		if (brain.routeIdx < brain.route.length) {
			brain.mode = 'route';
			const p = brain.route[brain.routeIdx];
			const rem = moveTo(state, bot, brain, p.x, p.z, true);
			const lastLeg = brain.routeIdx === brain.route.length - 1;
			const go = state.round.elapsed > 22 + bot.id % 4 * 3;
			if (lastLeg && rem < 1.5) {
				// At the last corner: smoke a defender's post, and flash the site as the push starts.
				const s = plantSpot(brain.site, bot.id);
				if (!go) planToss(bot, brain, 'smoke', s.x, s.z);
				else planToss(bot, brain, 'flash', s.x, s.z);
			}
			if (rem < 1.5 && (!lastLeg || go)) brain.routeIdx += 1;
			if (lastLeg && rem < 1.5) { bot.intent.forward = 0; bot.intent.right = 0; }
			intent.walk = lastLeg;
			return;
		}
		brain.mode = 'site';
		const spot = plantSpot(brain.site, bot.id + 1);
		moveTo(state, bot, brain, spot.x + (bot.id % 3 - 1) * 3, spot.z + 2, true);
		return;
	}

	if (c.state === 'planted') {
		let closest = null; let cd = Infinity;
		for (const a of state.actors) {
			if (!a.alive || a.team !== TEAM.WARDENS || !a.brain) continue;
			const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z);
			if (d < cd) { cd = d; closest = a; }
		}
		if (closest === bot) {
			brain.mode = 'defuse';
			const rem = moveTo(state, bot, brain, c.pos.x, c.pos.z, true);
			if (rem < 0.9) { intent.forward = 0; intent.right = 0; intent.use = true; }
			return;
		}
		brain.mode = 'retake';
		const ang = bot.id * 1.7;
		moveTo(state, bot, brain, c.pos.x + Math.cos(ang) * 4, c.pos.z + Math.sin(ang) * 4, true);
		return;
	}
	brain.mode = 'hold';
	const rem = moveTo(state, bot, brain, brain.post.x, brain.post.z, true);
	if (rem < 1 && !listening) {
		brain.lookYaw = brain.post.yaw + Math.sin(state.time * 0.4 + bot.id) * 0.35;
		brain.lookPitch = 0;
		brain.crouchHold = (Math.floor(state.time / 6) + bot.id) % 3 === 0;
	}
}

// Walk the path to (x, z); facing the way it goes unless told otherwise. Returns remaining distance.
function moveTo(state, bot, brain, x, z, faceMove) {
	goTo(state, bot, brain, x, z);
	const rem = followPath(bot, brain);
	if (rem > 0.3) {
		applyMove(bot, moveDir.x, moveDir.z, 1);
		if (faceMove && brain.mode !== 'listen') {
			brain.lookYaw = Math.atan2(moveDir.x, -moveDir.z);
			brain.lookPitch = 0;
		}
	}
	return rem;
}

function turn(bot, brain, dt) {
	const engaging = brain.mode === 'engage';
	const rate = engaging ? 10 + brain.skill * 10 : BOT.turnRate;
	const dy = angleDiff(brain.lookYaw, bot.yaw);
	const k = Math.min(1, dt * rate);
	const maxStep = (engaging ? 12 : 5) * dt;
	bot.yaw += Math.max(-maxStep, Math.min(maxStep, dy * k * (engaging ? 1.6 : 1)));
	bot.pitch += (brain.lookPitch - bot.pitch) * k;
	bot.pitch = Math.max(-1.2, Math.min(1.2, bot.pitch));
}

// A bot that has not moved for a second while it means to: repath, hop, or sidestep.
function unstick(state, bot, brain, dt) {
	const wants = Math.abs(bot.intent.forward) + Math.abs(bot.intent.right) > 0.3;
	const moved = Math.hypot(bot.pos.x - brain.lastX, bot.pos.z - brain.lastZ);
	brain.lastX = bot.pos.x; brain.lastZ = bot.pos.z;
	if (!wants || moved > dt * 1.2) { brain.stuck = Math.max(0, brain.stuck - dt); return; }
	brain.stuck += dt;
	if (brain.stuck > 0.8) {
		brain.repath = 0;
		bot.intent.jump = true;
		bot.intent.right = state.random() < 0.5 ? -1 : 1;
		brain.stuck = 0;
	}
}
