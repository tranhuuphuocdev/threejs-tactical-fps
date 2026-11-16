// Thrown utility: frag, smoke and flash. A fixed pool of projectiles bounces off the same boxes
// bullets hit; on its fuse a frag deals falloff damage to bodies in line of sight, a smoke opens a
// sight-blocking cloud, and a flash blinds whoever is facing it.
import * as THREE from 'three';
import { GRENADES, GRENADE_THROW } from '../config.js';
import { eyeHeight, viewDirection } from '../core/actors.js';
import { applyDamage } from './combat.js';

const POOL = 16;
const SMOKES = 6;
const n = new THREE.Vector3();
const look = new THREE.Vector3();

export function createGrenadeSystem() {
	const items = Array.from({ length: POOL }, () => ({
		active: false, kind: 'frag', owner: -1, pos: new THREE.Vector3(), prev: new THREE.Vector3(),
		vel: new THREE.Vector3(), fuse: 0, resting: false, bounces: 0,
	}));
	const smokes = Array.from({ length: SMOKES }, () => ({ active: false, x: 0, y: 0, z: 0, age: 0, life: 0, radius: 0 }));

	function spawn(kind, owner) {
		const g = items.find((item) => !item.active);
		if (!g) return null;
		g.active = true; g.kind = kind; g.owner = owner; g.resting = false; g.bounces = 0;
		return g;
	}

	function clear() {
		for (const g of items) g.active = false;
		for (const s of smokes) s.active = false;
	}

	function smokeRadius(s) {
		const grow = Math.min(1, s.age / 1.1);
		const fade = Math.min(1, (s.life - s.age) / 1.5);
		return s.radius * grow * Math.max(0, fade);
	}

	function blocksSight(ax, ay, az, bx, by, bz) {
		for (const s of smokes) {
			if (!s.active) continue;
			const r = smokeRadius(s) * 0.9;
			if (r < 0.5) continue;
			const dx = bx - ax; const dy = by - ay; const dz = bz - az;
			const len2 = dx * dx + dy * dy + dz * dz;
			let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
			t = Math.max(0, Math.min(1, t));
			const px = ax + dx * t - s.x; const py = ay + dy * t - s.y; const pz = az + dz * t - s.z;
			if (px * px + py * py + pz * pz < r * r) return true;
		}
		return false;
	}

	function step(state, dt) {
		for (const g of items) {
			if (!g.active) continue;
			g.fuse -= dt;
			if (!g.resting) integrate(state, g, dt);
			if (g.fuse <= 0) detonate(state, g);
		}
		for (const s of smokes) {
			if (!s.active) continue;
			s.age += dt;
			if (s.age >= s.life) s.active = false;
		}
	}

	function integrate(state, g, dt) {
		g.prev.copy(g.pos);
		g.vel.y -= 16 * dt;
		const speed = g.vel.length();
		const travel = speed * dt;
		if (travel < 1e-5) return;
		const dx = g.vel.x / speed; const dy = g.vel.y / speed; const dz = g.vel.z / speed;
		const t = state.collision.raycast(g.pos.x, g.pos.y, g.pos.z, dx, dy, dz, travel + GRENADE_THROW.radius, n);
		if (t <= travel + GRENADE_THROW.radius) {
			g.pos.set(g.pos.x + dx * Math.max(0, t - GRENADE_THROW.radius), g.pos.y + dy * Math.max(0, t - GRENADE_THROW.radius), g.pos.z + dz * Math.max(0, t - GRENADE_THROW.radius));
			const vn = g.vel.dot(n);
			g.vel.addScaledVector(n, -2 * vn).multiplyScalar(GRENADE_THROW.bounce);
			if (n.y > 0.5) { g.vel.x *= GRENADE_THROW.friction; g.vel.z *= GRENADE_THROW.friction; }
			g.bounces += 1;
			if (Math.abs(vn) > 2.5) {
				const e = state.events.emit('bounce');
				e.x = g.pos.x; e.y = g.pos.y; e.z = g.pos.z; e.weapon = g.kind;
			}
			if (n.y > 0.5 && g.vel.lengthSq() < 0.5) { g.resting = true; g.vel.set(0, 0, 0); }
		} else {
			g.pos.addScaledVector(g.vel, dt);
		}
	}

	function detonate(state, g) {
		g.active = false;
		const owner = state.actors[g.owner];
		const e = state.events.emit('detonate');
		e.weapon = g.kind; e.actor = g.owner; e.x = g.pos.x; e.y = g.pos.y; e.z = g.pos.z;
		if (g.kind === 'frag') frag(state, g, owner);
		else if (g.kind === 'smoke') openSmoke(g);
		else flash(state, g);
	}

	function frag(state, g, owner) {
		const spec = GRENADES.frag;
		for (const a of state.actors) {
			if (!a.alive) continue;
			const cx = a.pos.x; const cy = a.pos.y + 1.0; const cz = a.pos.z;
			const d = Math.hypot(cx - g.pos.x, cy - g.pos.y, cz - g.pos.z);
			if (d > spec.radius) continue;
			if (!state.collision.segmentClear(g.pos.x, g.pos.y + 0.2, g.pos.z, cx, cy, cz)) continue;
			const friendly = owner && a.team === owner.team && a !== owner;
			const falloff = 1 - d / spec.radius;
			const dmg = spec.damage * falloff * falloff * (friendly ? 0.33 : 1);
			if (dmg >= 1) applyDamage(state, a, owner && !friendly ? owner : null, 'frag', dmg, 'blast', 0.57, 1);
		}
	}

	function openSmoke(g) {
		const s = smokes.find((x) => !x.active) ?? smokes[0];
		s.active = true; s.x = g.pos.x; s.y = Math.max(1.2, g.pos.y + 1.2); s.z = g.pos.z;
		s.age = 0; s.life = GRENADES.smoke.duration; s.radius = GRENADES.smoke.radius;
	}

	function flash(state, g) {
		const spec = GRENADES.flash;
		for (const a of state.actors) {
			if (!a.alive) continue;
			const ex = a.pos.x; const ey = a.pos.y + eyeHeight(a); const ez = a.pos.z;
			const dx = g.pos.x - ex; const dy = g.pos.y - ey; const dz = g.pos.z - ez;
			const d = Math.hypot(dx, dy, dz);
			if (d > spec.radius || !state.collision.segmentClear(ex, ey, ez, g.pos.x, g.pos.y + 0.1, g.pos.z)) continue;
			if (blocksSight(ex, ey, ez, g.pos.x, g.pos.y, g.pos.z)) continue;
			viewDirection(a.yaw, a.pitch, look);
			const facing = (look.x * dx + look.y * dy + look.z * dz) / Math.max(d, 1e-3);
			const facingScale = facing > 0.5 ? 1 : facing > -0.2 ? 0.5 : 0.18;
			const amount = spec.maxBlind * facingScale * (1 - (d / spec.radius) ** 1.5);
			if (amount > a.flash) { a.flash = amount; a.flashTotal = amount; }
		}
	}

	return { items, smokes, spawn, clear, step, blocksSight, smokeRadius };
}
