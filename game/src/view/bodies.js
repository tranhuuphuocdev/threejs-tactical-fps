// Soldier figures for all ten actors, built once from boxes in each side's colours: coveralls
// and a hood for Raiders, fatigues and a cap for Wardens. Each frame a figure is placed at its
// actor's interpolated position, its legs swing with speed, it crouches, aims its torso, and on
// death it falls away from the shot. Nothing is created or freed after load, so a kill never stalls.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { TEAM, MOVE } from '../config.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Rounded parts: capsules for limbs and torso (flattened front to back), spheres for heads.
const capsule = (r, h, depth = 1) => new THREE.CapsuleGeometry(r, Math.max(0.01, h - r * 2), 4, 12).scale(1, 1, depth);
const GEO = {
	leg: capsule(0.09, 0.84, 1.05),
	boot: box(0.17, 0.11, 0.27),
	torso: capsule(0.21, 0.6, 0.62),
	vest: capsule(0.225, 0.44, 0.72),
	pack: box(0.32, 0.36, 0.14),
	head: new THREE.SphereGeometry(0.115, 18, 14).scale(1, 1.12, 1.05),
	visor: box(0.19, 0.05, 0.03),
	cap: new THREE.CylinderGeometry(0.125, 0.13, 0.07, 18),
	brim: box(0.22, 0.02, 0.1),
	hood: new THREE.SphereGeometry(0.14, 18, 12).scale(1, 1.08, 1.05),
	helmet: new THREE.SphereGeometry(0.138, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
	upperArm: capsule(0.065, 0.34),
	forearm: capsule(0.058, 0.32),
	rifle: box(0.06, 0.1, 0.78),
	pistol: box(0.045, 0.1, 0.22),
	charge: box(0.28, 0.2, 0.12),
};

function teamMaterials() {
	const make = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });
	return [
		{ body: make(PALETTE.raiders), dark: make(PALETTE.raidersDark), head: make(PALETTE.raidersDark) },
		{ body: make(PALETTE.wardens), dark: make(PALETTE.wardensDark), head: make(PALETTE.wardensDark) },
	];
}

function mesh(geo, mat, x, y, z, parent) {
	const m = new THREE.Mesh(geo, mat);
	m.position.set(x, y, z);
	m.castShadow = true;
	parent.add(m);
	return m;
}

function buildFigure(shared) {
	const root = new THREE.Group();
	const lean = new THREE.Group();          // falls on death
	root.add(lean);
	const hips = new THREE.Group(); hips.position.y = 0.86; lean.add(hips);
	const legL = new THREE.Group(); legL.position.set(-0.11, 0, 0); hips.add(legL);
	const legR = new THREE.Group(); legR.position.set(0.11, 0, 0); hips.add(legR);
	const parts = { root, lean, hips, legL, legR, team: [], dark: [] };
	for (const leg of [legL, legR]) {
		parts.dark.push(mesh(GEO.leg, null, 0, -0.41, 0, leg));
		mesh(GEO.boot, shared.boot, 0, -0.8, -0.04, leg);
	}
	const torso = new THREE.Group(); torso.position.y = 0.0; hips.add(torso);
	parts.torso = torso;
	parts.team.push(mesh(GEO.torso, null, 0, 0.3, 0, torso));
	parts.vest = mesh(GEO.vest, shared.vest, 0, 0.34, 0, torso);
	parts.pack = mesh(GEO.charge, shared.charge, 0, 0.36, 0.2, torso);
	parts.dark.push(mesh(GEO.pack, null, 0, 0.32, 0.17, torso));
	const neck = new THREE.Group(); neck.position.y = 0.66; torso.add(neck);
	parts.neck = neck;
	mesh(GEO.head, shared.skin, 0, 0.08, 0, neck);
	mesh(GEO.visor, shared.visor, 0, 0.11, -0.125, neck);
	parts.cap = mesh(GEO.cap, null, 0, 0.2, 0, neck);
	parts.brim = mesh(GEO.brim, null, 0, 0.16, -0.17, neck);
	parts.hood = mesh(GEO.hood, null, 0, 0.12, 0.02, neck);
	parts.helmet = mesh(GEO.helmet, shared.helmet, 0, 0.12, 0, neck);
	const arms = new THREE.Group(); arms.position.y = 0.48; torso.add(arms);
	parts.arms = arms;
	for (const side of [-1, 1]) {
		const upper = mesh(GEO.upperArm, null, side * 0.29, -0.1, -0.06, arms);
		upper.rotation.x = 0.9; parts.team.push(upper);
		const fore = mesh(GEO.forearm, shared.skin, side * 0.17, -0.14, -0.3, arms);
		fore.rotation.set(1.45, 0, -side * 0.5);
	}
	parts.rifle = mesh(GEO.rifle, shared.gun, 0.05, -0.08, -0.42, arms);
	parts.pistol = mesh(GEO.pistol, shared.gun, 0.03, -0.1, -0.5, arms);
	return parts;
}

export function createBodies(scene, actors) {
	const teams = teamMaterials();
	const shared = {
		skin: new THREE.MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.7 }),
		gun: new THREE.MeshStandardMaterial({ color: PALETTE.gunmetal, roughness: 0.5, metalness: 0.5 }),
		boot: new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.9 }),
		vest: new THREE.MeshStandardMaterial({ color: '#4a4d45', roughness: 0.8 }),
		helmet: new THREE.MeshStandardMaterial({ color: '#3d4340', roughness: 0.55, metalness: 0.2 }),
		visor: new THREE.MeshStandardMaterial({ color: '#1b1f22', roughness: 0.25, metalness: 0.6 }),
		charge: new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.5, emissive: PALETTE.accent, emissiveIntensity: 0.25 }),
	};
	const figures = actors.map(() => {
		const f = buildFigure(shared);
		scene.add(f.root);
		return f;
	});
	let paintedSides = -1;

	function paint() {
		figures.forEach((f, i) => {
			const t = teams[actors[i].team];
			for (const m of f.team) m.material = t.body;
			for (const m of f.dark) m.material = t.dark;
			f.cap.material = t.head; f.brim.material = t.head; f.hood.material = t.head;
			const raider = actors[i].team === TEAM.RAIDERS;
			f.hood.visible = raider; f.cap.visible = !raider; f.brim.visible = !raider;
		});
	}

	function update(state, alpha, time, hidePlayer) {
		let sides = 0;
		for (let i = 0; i < actors.length; i += 1) sides |= actors[i].team << i;
		if (sides !== paintedSides) { paint(); paintedSides = sides; }
		for (let i = 0; i < actors.length; i += 1) {
			const a = actors[i];
			const f = figures[i];
			f.root.visible = !(a.isPlayer && hidePlayer);
			if (!f.root.visible) continue;
			f.root.position.copy(a.viewPos);
			let yawDelta = a.yaw - a.prevYaw;
			if (yawDelta > Math.PI) yawDelta -= Math.PI * 2; else if (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
			f.root.rotation.y = -(a.prevYaw + yawDelta * alpha);
			f.helmet.visible = a.helmet;
			f.vest.visible = a.armor > 0;
			f.pack.visible = a.hasCharge;
			const primary = a.active === 1 && a.primary.def;
			f.rifle.visible = !!primary && a.alive;
			f.pistol.visible = !primary && a.alive;

			if (!a.alive) {
				const t = Math.min(1, (time - a.deathTime) / 0.35);
				const ease = 1 - (1 - t) * (1 - t);
				f.root.rotation.y = -a.deathYaw;
				f.lean.rotation.x = ease * 1.5;
				f.lean.position.y = ease * 0.12;
				f.legL.rotation.x = 0; f.legR.rotation.x = 0;
				f.torso.position.y = 0; f.torso.rotation.x = 0;
				continue;
			}
			f.lean.rotation.x = 0; f.lean.position.y = 0;
			const speed = Math.hypot(a.vel.x, a.vel.z);
			const swing = Math.min(1, speed / MOVE.runSpeed) * 0.7;
			const phase = time * (4 + speed * 1.4) + i;
			f.legL.rotation.x = Math.sin(phase) * swing;
			f.legR.rotation.x = -Math.sin(phase) * swing;
			const c = a.crouchAmount;
			f.hips.position.y = 0.86 - c * 0.42;
			f.legL.rotation.x -= c * 0.9; f.legR.rotation.x -= c * 0.4;
			f.torso.rotation.x = c * 0.15;
			f.arms.rotation.x = a.pitch * 0.9;
			f.neck.rotation.x = a.pitch * 0.5;
			if (a.using > 0) f.arms.rotation.x = -0.8;
		}
	}

	return { update, figures, root: figures.map((f) => f.root), materials: { teams, shared } };
}
