// World effects driven by simulation events: tracers, bullet holes, impact dust and sparks,
// blood, grenade and charge models, smoke clouds, explosions and their light. Every object is
// pooled at load (tracer rods, holes in one instanced mesh, particles in two
// point clouds), so the busiest firefight renders with the same allocations as an empty map.
import * as THREE from 'three';
import { createParticles } from './particles.js';
import { PALETTE } from '../palette.js';

const TRACERS = 48;
const HOLES = 160;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const scaleOne = new THREE.Vector3(1, 1, 1);
const zAxis = new THREE.Vector3(0, 0, 1);

export function createEffects(scene, textures) {
	const dust = createParticles(scene, textures.puff, 1400, false);
	const glow = createParticles(scene, textures.puff, 600, true);

	// Tracers: thin glowing rods, one pooled mesh each, stretched between the streak's tail and head.
	const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
	const tracers = Array.from({ length: TRACERS }, () => {
		const mesh = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
			color: '#ffd38a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
		}));
		mesh.visible = false; mesh.frustumCulled = false;
		scene.add(mesh);
		return { mesh, t: 1, life: 0.1, sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0 };
	});
	let tracerNext = 0;

	const holeTex = makeHoleTexture();
	const holes = new THREE.InstancedMesh(
		new THREE.PlaneGeometry(0.11, 0.11),
		new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
		HOLES,
	);
	holes.count = 0;
	holes.frustumCulled = false;
	scene.add(holes);
	let holeNext = 0;

	const grenadeGeo = new THREE.SphereGeometry(0.07, 10, 8);
	const grenadeMats = {
		frag: new THREE.MeshStandardMaterial({ color: '#4d5538', roughness: 0.6 }),
		smoke: new THREE.MeshStandardMaterial({ color: '#8a8f94', roughness: 0.5 }),
		flash: new THREE.MeshStandardMaterial({ color: '#c9c4b8', roughness: 0.4 }),
	};
	const grenadeMeshes = Array.from({ length: 16 }, () => {
		const m = new THREE.Mesh(grenadeGeo, grenadeMats.frag);
		m.visible = false; m.castShadow = true; scene.add(m);
		return m;
	});
	const charge = new THREE.Group();
	const chargeBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.5 }));
	chargeBody.position.y = 0.08; chargeBody.castShadow = true;
	const chargeLed = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }));
	chargeLed.position.set(0.08, 0.175, 0);
	charge.add(chargeBody, chargeLed);
	charge.visible = false;
	scene.add(charge);

	const blastLight = new THREE.PointLight('#ffb062', 0, 26, 1.6);
	const muzzleLight = new THREE.PointLight('#ffc070', 0, 9, 2);
	scene.add(blastLight, muzzleLight);
	let blastT = 0; let muzzleT = 0;
	let shake = 0;

	function addTracer(sx, sy, sz, ex, ey, ez) {
		const tr = tracers[tracerNext];
		tracerNext = (tracerNext + 1) % TRACERS;
		const len = Math.hypot(ex - sx, ey - sy, ez - sz);
		tr.t = 0; tr.life = Math.min(0.12, 0.025 + len / 450);
		tr.sx = sx; tr.sy = sy; tr.sz = sz; tr.ex = ex; tr.ey = ey; tr.ez = ez;
	}

	function addHole(x, y, z, nx, ny, nz) {
		vA.set(nx, ny, nz);
		q.setFromUnitVectors(zAxis, vA);
		vB.set(x + nx * 0.005, y + ny * 0.005, z + nz * 0.005);
		m4.compose(vB, q, scaleOne);
		holes.setMatrixAt(holeNext, m4);
		holeNext = (holeNext + 1) % HOLES;
		holes.count = Math.min(HOLES, holes.count + 1);
		holes.instanceMatrix.needsUpdate = true;
	}

	function impact(x, y, z, nx, ny, nz) {
		for (let i = 0; i < 4; i += 1) {
			dust.emit(x, y, z, nx * 1.2 + (Math.random() - 0.5) * 1.2, ny * 1.2 + Math.random() * 1.2, nz * 1.2 + (Math.random() - 0.5) * 1.2,
				0.16, 3, 0.5 + Math.random() * 0.3, 0xd8ccb4, 0.6, 2.5, 0.6);
		}
		for (let i = 0; i < 3; i += 1) {
			glow.emit(x, y, z, nx * 4 + (Math.random() - 0.5) * 5, ny * 4 + Math.random() * 4, nz * 4 + (Math.random() - 0.5) * 5,
				0.035, 0, 0.18, 0xffc46b, 1, 1, 9);
		}
	}

	function blood(x, y, z, head) {
		const n = head ? 9 : 5;
		for (let i = 0; i < n; i += 1) {
			dust.emit(x, y, z, (Math.random() - 0.5) * 2.4, Math.random() * 1.6, (Math.random() - 0.5) * 2.4,
				head ? 0.14 : 0.11, 1.5, 0.35 + Math.random() * 0.25, 0x8a1c14, 0.85, 3, 4);
		}
	}

	function explosion(x, y, z, big) {
		const s = big ? 2.2 : 1;
		for (let i = 0; i < 26 * s; i += 1) {
			const a = Math.random() * Math.PI * 2; const sp = (2 + Math.random() * 7) * s;
			glow.emit(x, y + 0.3, z, Math.cos(a) * sp, Math.random() * 6 * s, Math.sin(a) * sp, 0.9 * s, 2, 0.35 + Math.random() * 0.3, 0xff9a3c, 1, 3, 2);
		}
		for (let i = 0; i < 18 * s; i += 1) {
			const a = Math.random() * Math.PI * 2; const sp = (1 + Math.random() * 3) * s;
			dust.emit(x, y + 0.4, z, Math.cos(a) * sp, 1 + Math.random() * 2.5 * s, Math.sin(a) * sp, 1.4 * s, 2.6, 1.6 + Math.random(), 0x5b544a, 0.7, 1.4, -0.3);
		}
		blastLight.position.set(x, y + 1.2, z);
		blastT = big ? 0.6 : 0.3;
		shake = Math.max(shake, big ? 1 : 0.5);
	}

	function flashBurst(x, y, z) {
		glow.emit(x, y + 0.2, z, 0, 0, 0, 3.5, 1, 0.2, 0xffffff, 1, 0, 0);
		blastLight.position.set(x, y + 0.5, z);
		blastT = 0.15;
	}

	function onEvent(e, state, playerId, muzzle) {
		switch (e.type) {
			case 'shot': {
				const own = e.actor === playerId;
				const sx = own ? muzzle.x : e.x; const sy = own ? muzzle.y : e.y - 0.12; const sz = own ? muzzle.z : e.z;
				addTracer(sx, sy, sz, e.x2, e.y2, e.z2);
				if (e.flag) { impact(e.x2, e.y2, e.z2, e.nx, e.ny, e.nz); addHole(e.x2, e.y2, e.z2, e.nx, e.ny, e.nz); }
				if (e.other >= 0 && e.other !== playerId) blood(e.x2, e.y2, e.z2, e.head);
				if (!own) { muzzleLight.position.set(e.x, e.y, e.z); muzzleT = 0.05; }
				break;
			}
			case 'detonate':
				if (e.weapon === 'frag') explosion(e.x, e.y, e.z, false);
				else if (e.weapon === 'flash') flashBurst(e.x, e.y, e.z);
				break;
			case 'explode':
				explosion(e.x, e.y, e.z, true);
				break;
			case 'roundStart':
				holes.count = 0; holeNext = 0; dust.clear(); glow.clear();
				break;
			default:
		}
	}

	let smokeTick = 0;
	function update(dt, state, camera, pixelScale) {
		for (let i = 0; i < TRACERS; i += 1) {
			const tr = tracers[i];
			if (tr.t >= 1) { tr.mesh.visible = false; continue; }
			tr.t = Math.min(1, tr.t + dt / tr.life);
			const head = Math.min(1, tr.t * 1.25); const tail = Math.max(0, tr.t * 1.25 - 0.35);
			const m = tr.mesh;
			m.position.set(tr.sx + (tr.ex - tr.sx) * tail, tr.sy + (tr.ey - tr.sy) * tail, tr.sz + (tr.ez - tr.sz) * tail);
			vA.set(tr.sx + (tr.ex - tr.sx) * head, tr.sy + (tr.ey - tr.sy) * head, tr.sz + (tr.ez - tr.sz) * head);
			const len = m.position.distanceTo(vA);
			m.visible = len > 0.01;
			m.lookAt(vA);
			const thick = 0.012 + 0.004 * m.position.distanceTo(camera.position) / 10;
			m.scale.set(thick, thick, len);
			m.material.opacity = 1 - tr.t * 0.6;
		}

		const items = state.grenades.items;
		for (let i = 0; i < items.length; i += 1) {
			const g = items[i]; const m = grenadeMeshes[i];
			m.visible = g.active;
			if (g.active) {
				m.position.copy(g.pos);
				m.material = grenadeMats[g.kind];
			}
		}
		const c = state.charge;
		charge.visible = c.state === 'dropped' || c.state === 'planted' || c.state === 'defused';
		if (charge.visible) {
			charge.position.copy(c.pos);
			chargeLed.visible = c.state !== 'planted' || c.beep > 0.06 || c.fuse < 3;
		}

		smokeTick -= dt;
		if (smokeTick <= 0) {
			smokeTick = 0.09;
			for (const s of state.grenades.smokes) {
				if (!s.active) continue;
				const r = state.grenades.smokeRadius(s);
				if (r < 0.3) continue;
				for (let k = 0; k < 3; k += 1) {
					const a = Math.random() * Math.PI * 2; const d = Math.random() * r * 0.75;
					dust.emit(s.x + Math.cos(a) * d, Math.max(0.6, s.y - 0.6 + Math.random() * r * 0.7), s.z + Math.sin(a) * d,
						(Math.random() - 0.5) * 0.3, 0.05, (Math.random() - 0.5) * 0.3, r * 1.25, 0.35, 2.6, 0xc9c6bf, 0.9, 0.2, 0);
				}
			}
		}

		dust.update(dt, pixelScale);
		glow.update(dt, pixelScale);

		blastT = Math.max(0, blastT - dt);
		blastLight.intensity = blastT > 0 ? 80 * blastT : 0;
		muzzleT = Math.max(0, muzzleT - dt);
		muzzleLight.intensity = muzzleT > 0 ? 12 : 0;
		shake = Math.max(0, shake - dt * 1.8);
		return shake;
	}

	return { onEvent, update, impact, explosion, addTracer, objects: [holes, charge, ...grenadeMeshes, dust.points, glow.points] };
}

function makeHoleTexture() {
	const size = 64; const el = document.createElement('canvas'); el.width = size; el.height = size;
	const ctx = el.getContext('2d');
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, 'rgba(15,12,10,1)'); g.addColorStop(0.35, 'rgba(30,26,22,0.95)'); g.addColorStop(0.6, 'rgba(70,62,52,0.5)'); g.addColorStop(1, 'rgba(70,62,52,0)');
	ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
	const tex = new THREE.CanvasTexture(el); tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}
