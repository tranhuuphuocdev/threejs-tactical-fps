// First-person weapon models. Each part is a side profile (a THREE.Shape traced in metres,
// forward along +x, up along +y) extruded to its width with bevelled edges, so receivers, stocks,
// grips and curved magazines have real silhouettes and catch highlights on their edges. Round
// parts (barrels, handguards, scopes) are lathed cylinders. Materials share a procedural
// roughness map, so steel shows wear and polymer reads matte. Built once at load.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

// Grainy roughness: mid grey with speckle and fine scratches (green channel is what three reads).
function wearTexture() {
	const size = 256; const el = document.createElement('canvas'); el.width = size; el.height = size;
	const ctx = el.getContext('2d');
	ctx.fillStyle = '#8a8a8a'; ctx.fillRect(0, 0, size, size);
	let seed = 7;
	const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
	for (let i = 0; i < 6000; i += 1) {
		const v = 90 + rnd() * 110 | 0;
		ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(rnd() * size, rnd() * size, 1.5, 1.5);
	}
	ctx.strokeStyle = 'rgba(40,40,40,0.5)'; ctx.lineWidth = 0.6;
	for (let i = 0; i < 70; i += 1) {
		const x = rnd() * size; const y = rnd() * size;
		ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 8); ctx.stroke();
	}
	const tex = new THREE.CanvasTexture(el);
	tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3);
	return tex;
}

export function createGunMaterials() {
	const wear = wearTexture();
	const std = (color, roughness, metalness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, roughnessMap: wear, bumpMap: wear, bumpScale: 0.25, ...extra });
	return {
		metal: std(PALETTE.gunmetal, 0.55, 0.85),
		steel: std('#8b9298', 0.4, 0.9),
		dark: std('#141619', 0.6, 0.7),
		polymer: std('#2c3034', 0.95, 0.05),
		tan: std('#8f7a5a', 0.9, 0.05),
		grip: std('#26231f', 1, 0, { bumpScale: 0.6 }),
		olive: std('#4f5a3a', 0.85, 0.1),
		accent: new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.6, emissive: PALETTE.accent, emissiveIntensity: 0.2 }),
		lens: new THREE.MeshStandardMaterial({ color: '#203a44', roughness: 0.05, metalness: 0.3, emissive: '#0c3a2a', emissiveIntensity: 0.4 }),
		glove: std('#2a2925', 0.95, 0, { bumpScale: 0.8 }),
		sleeve: std(PALETTE.raidersDark, 1, 0, { bumpScale: 1 }),
	};
}

// Extrude a closed side profile [[x, y], ...] to a width, centred, bevelled, facing -z.
function profile(points, width, bevel = 0.004) {
	const shape = new THREE.Shape();
	shape.moveTo(points[0][0], points[0][1]);
	for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
	shape.closePath();
	const geo = new THREE.ExtrudeGeometry(shape, {
		depth: Math.max(0.001, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
	});
	geo.translate(0, 0, -(width - bevel * 2) / 2);
	geo.rotateY(Math.PI / 2); // profile +x (forward) becomes -z
	geo.computeVertexNormals();
	return geo;
}

// A cylinder along the barrel axis from x0 to x1 (forward distances), at height y.
function tube(r, x0, x1, segments = 16) {
	const geo = new THREE.CylinderGeometry(r, r, x1 - x0, segments);
	geo.rotateX(Math.PI / 2);
	geo.translate(0, 0, -(x0 + x1) / 2);
	return geo;
}

function add(group, geo, mat, x = 0, y = 0, z = 0) {
	const m = new THREE.Mesh(geo, mat);
	m.position.set(x, y, z);
	group.add(m);
	return m;
}

// A limb from one point to another: a capsule oriented along the segment (forearms, sleeves).
const UP = new THREE.Vector3(0, 1, 0);
function limb(g, mat, r, ax, ay, az, bx, by, bz) {
	const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
	const len = dir.length();
	const m = add(g, new THREE.CapsuleGeometry(r, len, 4, 12), mat, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
	m.quaternion.setFromUnitVectors(UP, dir.normalize());
	return m;
}

// Gloved hands and sleeved forearms: the trigger hand on the grip, the support hand under the
// handguard, each forearm running back and down out of frame toward the shoulder.
function hands(g, mats, gripX, foreX) {
	add(g, profile([[-0.045, -0.025], [0.012, -0.025], [0.02, -0.1], [-0.04, -0.115]], 0.062, 0.014), mats.glove, 0, 0, -gripX);
	limb(g, mats.glove, 0.034, 0.004, -0.09, gripX + 0.02, 0.03, -0.13, gripX + 0.1);
	limb(g, mats.sleeve, 0.045, 0.03, -0.13, gripX + 0.1, 0.08, -0.22, gripX + 0.42);
	if (foreX === null) return;
	add(g, profile([[-0.045, -0.03], [0.05, -0.03], [0.045, -0.072], [-0.04, -0.082]], 0.064, 0.014), mats.glove, -0.006, 0, -foreX);
	limb(g, mats.glove, 0.032, -0.01, -0.07, -foreX + 0.03, -0.05, -0.1, -foreX + 0.1);
	limb(g, mats.sleeve, 0.043, -0.05, -0.1, -foreX + 0.1, -0.2, -0.22, -foreX + 0.45);
}

// A rifle-class weapon from a few proportions. Units: metres, origin at the trigger.
function longGun(mats, o) {
	const g = new THREE.Group();
	const body = mats[o.body];
	// Upper receiver with a chamfered nose and an ejection port on the right.
	add(g, profile([[-0.13, 0], [o.recv, 0], [o.recv + 0.012, 0.022], [o.recv, 0.052], [-0.11, 0.052], [-0.13, 0.04]], 0.046), mats.metal);
	add(g, profile([[-0.03, 0.012], [0.05, 0.012], [0.05, 0.035], [-0.03, 0.035]], 0.004, 0.001), mats.dark, 0.024, 0, 0);
	// Lower receiver and mag well.
	add(g, profile([[-0.07, -0.032], [0.11, -0.032], [0.115, 0.001], [-0.07, 0.001]], 0.04), body);
	// Pistol grip, raked back.
	add(g, profile([[-0.065, -0.028], [-0.02, -0.028], [-0.035, -0.125], [-0.082, -0.12]], 0.036, 0.006), mats.grip);
	// Trigger guard.
	add(g, profile([[-0.02, -0.03], [0.05, -0.03], [0.05, -0.058], [-0.02, -0.058], [-0.02, -0.052], [0.044, -0.052], [0.044, -0.036], [-0.02, -0.036]], 0.01, 0.001), body);
	// Stock.
	if (o.stock > 0) {
		add(g, profile([[-0.12, 0.045], [-0.12 - o.stock, 0.04], [-0.12 - o.stock, -0.075], [-0.1 - o.stock, -0.08], [-0.14, -0.012]], 0.04, 0.008), body);
		add(g, profile([[-0.12 - o.stock, 0.04], [-0.135 - o.stock, 0.04], [-0.135 - o.stock, -0.08], [-0.12 - o.stock, -0.08]], 0.044, 0.006), mats.grip);
	}
	// Magazine: a curved box mag (more curve on the assault rifle).
	const c = o.magCurve;
	add(g, profile([[0.0, -0.03], [0.07, -0.03], [0.072 + c, -0.09], [0.075 + c * 2.2, -0.03 - o.mag], [0.02 + c * 2.2, -0.035 - o.mag], [0.004 + c, -0.09]], 0.026, 0.004), mats.dark);
	// Handguard (octagonal, railed look), barrel and muzzle device.
	const hgEnd = o.recv + o.guard;
	add(g, tube(0.028, o.recv, hgEnd, 8), body, 0, 0.022, 0).rotation.z = Math.PI / 8;
	add(g, tube(0.011, hgEnd, hgEnd + o.barrel), mats.steel, 0, 0.026, 0);
	add(g, tube(0.017, hgEnd + o.barrel, hgEnd + o.barrel + 0.05, 6), mats.dark, 0, 0.026, 0);
	// Top rail with slots.
	add(g, profile([[-0.11, 0.052], [hgEnd - 0.02, 0.052], [hgEnd - 0.02, 0.064], [-0.11, 0.064]], 0.022, 0.002), mats.dark);
	for (let x = -0.09; x < hgEnd - 0.04; x += 0.024) add(g, new THREE.BoxGeometry(0.024, 0.004, 0.008), mats.metal, 0, 0.066, -x);
	// Optic: a scope tube with lenses, or a red-dot housing.
	if (o.scope) {
		add(g, tube(0.026, -0.08, 0.17, 20), mats.dark, 0, 0.11, 0);
		add(g, tube(0.034, 0.12, 0.2, 20), mats.dark, 0, 0.11, 0);
		add(g, tube(0.03, 0.199, 0.2015, 20), mats.lens, 0, 0.11, 0);
		add(g, profile([[-0.03, 0.064], [0.07, 0.064], [0.07, 0.09], [-0.03, 0.09]], 0.02, 0.002), mats.metal);
	} else {
		add(g, profile([[-0.02, 0.064], [0.045, 0.064], [0.04, 0.108], [-0.015, 0.108]], 0.034, 0.005), mats.dark);
		add(g, tube(0.013, 0.039, 0.041, 16), mats.lens, 0, 0.088, 0);
	}
	// Front sight post on the gas block.
	add(g, profile([[hgEnd - 0.01, 0.04], [hgEnd + 0.02, 0.04], [hgEnd + 0.015, 0.075], [hgEnd, 0.075]], 0.012, 0.002), mats.dark);
	hands(g, mats, -0.045, o.recv + o.guard * 0.55);
	g.userData.muzzle = new THREE.Vector3(0, 0.026, -(hgEnd + o.barrel + 0.06));
	g.userData.rest = o.rest;
	return g;
}

function sidearm(mats, k, slideMat) {
	const g = new THREE.Group();
	const L = 0.19 * k;
	// Slide with front and rear serrations, frame with dust-cover rail, raked grip.
	add(g, profile([[-0.02, 0.006], [L - 0.005, 0.006], [L, 0.018], [L - 0.006, 0.034], [0.0, 0.034], [-0.02, 0.026]].map(([x, y]) => [x, y * k]), 0.03 * k, 0.003), mats[slideMat]);
	for (let i = 0; i < 6; i += 1) add(g, new THREE.BoxGeometry(0.032 * k, 0.016 * k, 0.0025), mats.dark, 0, 0.022 * k, (0.002 + i * 0.006) * k);
	add(g, profile([[0.0, -0.016], [L - 0.02, -0.016], [L - 0.02, 0.006], [0.0, 0.006]].map(([x, y]) => [x, y * k]), 0.028 * k, 0.003), mats.polymer);
	add(g, profile([[0.0, -0.016 * k], [0.045 * k, -0.016 * k], [0.025 * k, -0.11 * k], [-0.025 * k, -0.105 * k]], 0.03 * k, 0.005), mats.grip);
	add(g, profile([[0.04, -0.016], [0.08, -0.016], [0.08, -0.04], [0.04, -0.04], [0.04, -0.034], [0.074, -0.034], [0.074, -0.022], [0.04, -0.022]].map(([x, y]) => [x * k, y * k]), 0.008, 0.001), mats.polymer);
	add(g, tube(0.008 * k, L - 0.004, L + 0.004), mats.dark, 0, 0.02 * k, 0);
	add(g, new THREE.BoxGeometry(0.006, 0.008, 0.008), mats.steel, 0, 0.038 * k, -(L - 0.012));
	add(g, new THREE.BoxGeometry(0.022 * k, 0.008, 0.008), mats.steel, 0, 0.038 * k, 0.012);
	hands(g, mats, 0.015 * k, null);
	add(g, profile([[-0.04, -0.03], [0.04, -0.03], [0.05, -0.1], [-0.04, -0.11]], 0.06, 0.012), mats.glove, -0.035, -0.005, 0);
	g.rotation.y = -0.05;
	g.userData.muzzle = new THREE.Vector3(0, 0.02 * k, -(L + 0.01));
	g.userData.rest = new THREE.Vector3(0.1, -0.1, -0.33);
	return g;
}

export function buildGunModels(mats) {
	const v = (x, y, z) => new THREE.Vector3(x, y, z);
	const models = {
		rifle: longGun(mats, { body: 'polymer', recv: 0.2, guard: 0.2, barrel: 0.14, stock: 0.22, mag: 0.15, magCurve: 0.012, rest: v(0.15, -0.16, -0.36) }),
		battleRifle: longGun(mats, { body: 'tan', recv: 0.22, guard: 0.24, barrel: 0.16, stock: 0.25, mag: 0.12, magCurve: 0.004, rest: v(0.15, -0.16, -0.36) }),
		smg: longGun(mats, { body: 'polymer', recv: 0.15, guard: 0.1, barrel: 0.04, stock: 0.14, mag: 0.19, magCurve: 0, rest: v(0.14, -0.15, -0.34) }),
		sniper: longGun(mats, { body: 'olive', recv: 0.25, guard: 0.26, barrel: 0.3, stock: 0.3, mag: 0.06, magCurve: 0, scope: true, rest: v(0.15, -0.17, -0.37) }),
		pistol: sidearm(mats, 1, 'metal'),
		heavyPistol: sidearm(mats, 1.2, 'steel'),
	};
	const grenade = new THREE.Group();
	add(grenade, new THREE.SphereGeometry(0.042, 20, 14), mats.olive);
	add(grenade, tube(0.016, -0.004, 0.02), mats.steel, 0, 0.045, 0).rotation.x = Math.PI / 2;
	add(grenade, new THREE.BoxGeometry(0.012, 0.06, 0.018), mats.steel, 0.03, 0.03, 0.01);
	hands(grenade, mats, -0.02, null);
	grenade.userData.muzzle = new THREE.Vector3();
	grenade.userData.rest = v(0.13, -0.13, -0.33);
	models.grenade = grenade;
	const charge = new THREE.Group();
	add(charge, profile([[-0.11, -0.06], [0.11, -0.06], [0.11, 0.06], [-0.11, 0.06]], 0.14, 0.01), mats.accent).rotation.y = Math.PI / 2;
	add(charge, new THREE.BoxGeometry(0.12, 0.03, 0.08), mats.dark, 0, 0.07, 0);
	add(charge, new THREE.BoxGeometry(0.03, 0.012, 0.03), mats.lens, 0.03, 0.09, 0);
	hands(charge, mats, -0.02, null);
	charge.userData.muzzle = new THREE.Vector3();
	charge.userData.rest = v(0.0, -0.17, -0.38);
	models.charge = charge;
	return models;
}
