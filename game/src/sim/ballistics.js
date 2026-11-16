// Hitscan against the world and against bodies. A body is four zones measured from its feet:
// a head sphere and three vertical cylinders (chest, stomach, legs), all scaled by its crouch.
// What you see is what you hit: the player's shots leave the camera's eye and test each target
// where it was DRAWN on the last frame, not where the simulation has already moved it, so a shot
// on a crosshair that sits on a head lands on that head.
import { HITBOX, MOVE } from '../config.js';

const ZONES = ['head', 'chest', 'stomach', 'legs'];
const normalScratch = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };

// Entry distance of a ray into a vertical cylinder (axis through cx, cz; y from y0 to y1), or -1.
function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1, maxT) {
	const px = ox - cx; const pz = oz - cz;
	const a = dx * dx + dz * dz;
	let tIn = 0; let tOut = maxT;
	if (a < 1e-12) {
		if (px * px + pz * pz > r * r) return -1;
	} else {
		const b = 2 * (dx * px + dz * pz);
		const c = px * px + pz * pz - r * r;
		const disc = b * b - 4 * a * c;
		if (disc < 0) return -1;
		const s = Math.sqrt(disc);
		tIn = Math.max(tIn, (-b - s) / (2 * a));
		tOut = Math.min(tOut, (-b + s) / (2 * a));
	}
	if (Math.abs(dy) < 1e-12) {
		if (oy < y0 || oy > y1) return -1;
	} else {
		let ta = (y0 - oy) / dy; let tb = (y1 - oy) / dy;
		if (ta > tb) { const t = ta; ta = tb; tb = t; }
		tIn = Math.max(tIn, ta); tOut = Math.min(tOut, tb);
	}
	return tIn <= tOut ? tIn : -1;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
	const px = ox - cx; const py = oy - cy; const pz = oz - cz;
	const b = px * dx + py * dy + pz * dz;
	const c = px * px + py * py + pz * pz - r * r;
	const disc = b * b - c;
	if (disc < 0) return -1;
	const t = -b - Math.sqrt(disc);
	return t >= 0 && t <= maxT ? t : -1;
}

// Where a body stands for this shot: where it was drawn on screen for the player's shots
// (viewPos, written by the renderer each frame), else its live simulated position.
function bodyPosition(shooter, target) {
	return shooter.isPlayer ? target.viewPos : target.pos;
}

const zoneHit = { zone: -1 };

// Test one body; returns the entry distance and writes the zone index to hit.zone.
function rayBody(ox, oy, oz, dx, dy, dz, px, py, pz, height, maxT, hit) {
	const s = height / MOVE.standHeight;
	if (rayCylinder(ox, oy, oz, dx, dy, dz, px, pz, 0.45, py, py + height + 0.1, maxT) < 0) return -1;
	let best = maxT; let zone = -1;
	const head = HITBOX.head;
	const th = raySphere(ox, oy, oz, dx, dy, dz, px, py + head.y * s, pz, head.r, best);
	if (th >= 0 && th < best) { best = th; zone = 0; }
	const parts = [HITBOX.chest, HITBOX.stomach, HITBOX.legs];
	for (let i = 0; i < 3; i += 1) {
		const p = parts[i];
		const t = rayCylinder(ox, oy, oz, dx, dy, dz, px, pz, p.r, py + p.y0 * s, py + p.y1 * s, best);
		if (t >= 0 && t < best) { best = t; zone = i + 1; }
	}
	if (zone < 0) return -1;
	hit.zone = zone;
	return best;
}

// Trace one bullet. Fills result { distance, victim (actor or null), zone name, nx, ny, nz }.
export function traceShot(state, shooter, ox, oy, oz, dx, dy, dz, range, result) {
	const worldT = state.collision.raycast(ox, oy, oz, dx, dy, dz, range, normalScratch);
	let best = Number.isFinite(worldT) ? worldT : range;
	result.victim = null; result.zone = '';
	result.nx = normalScratch.x; result.ny = normalScratch.y; result.nz = normalScratch.z;
	result.hitWorld = Number.isFinite(worldT);
	for (const target of state.actors) {
		if (!target.alive || target === shooter || target.team === shooter.team) continue;
		const at = bodyPosition(shooter, target);
		const t = rayBody(ox, oy, oz, dx, dy, dz, at.x, at.y, at.z, target.height, best, zoneHit);
		if (t >= 0 && t < best) {
			best = t; result.victim = target; result.zone = ZONES[zoneHit.zone]; result.hitWorld = false;
		}
	}
	result.distance = best;
	return result;
}
