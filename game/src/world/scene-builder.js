// Builds the visible map from the same boxes the collision world uses, so what you see is what
// stops a bullet. Boxes of one material are merged into a single geometry (a handful of draw calls
// for the whole map), with UVs scaled to world metres so textures never stretch.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { CELL, ROWS, COLS, DEPTH, WIDTH_M, DEPTH_M, CALLOUTS } from '../map/layout.js';

// Face order of a box: +x, -x, +y, -y, +z, -z; each face gets UVs in metres / texture scale.
function pushBox(target, minX, minY, minZ, maxX, maxY, maxZ, scale) {
	const faces = [
		[[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [1, 0, 0], maxZ - minZ, maxY - minY, -minZ],
		[[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [-1, 0, 0], maxZ - minZ, maxY - minY, minZ],
		[[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [0, 1, 0], maxX - minX, maxZ - minZ, minX],
		[[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [0, -1, 0], maxX - minX, maxZ - minZ, minX],
		[[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [0, 0, 1], maxX - minX, maxY - minY, minX],
		[[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [0, 0, -1], maxX - minX, maxY - minY, -maxX],
	];
	for (const [a, b, c, d, n, w, h, u0] of faces) {
		if (n[1] === -1) continue; // nobody sees the underside
		const base = target.positions.length / 3;
		target.positions.push(...a, ...b, ...c, ...d);
		for (let i = 0; i < 4; i += 1) target.normals.push(...n);
		const us = u0 / scale; const vs = n[1] === 1 ? 0 : minY / scale;
		target.uvs.push(us, vs, us + w / scale, vs, us + w / scale, vs + h / scale, us, vs + h / scale);
		target.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
	}
}

function geometryFrom(target) {
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
	geo.setAttribute('normal', new THREE.Float32BufferAttribute(target.normals, 3));
	geo.setAttribute('uv', new THREE.Float32BufferAttribute(target.uvs, 2));
	geo.setIndex(target.indices);
	geo.computeBoundingSphere();
	return geo;
}

const bucket = () => ({ positions: [], normals: [], uvs: [], indices: [] });

// Sky dome: a vertical gradient from warm horizon to cool zenith, drawn inside a sphere.
function skyDome(radius) {
	const skyMat = new THREE.ShaderMaterial({
		side: THREE.BackSide, depthWrite: false, fog: false,
		uniforms: { top: { value: new THREE.Color(PALETTE.sky) }, bottom: { value: new THREE.Color(PALETTE.skyHorizon) } },
		vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
		fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.45, h)), 1.0); }',
	});
	return new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), skyMat);
}

// Image-based light for metals and gloss: the sky and the salt flats prefiltered once (PMREM),
// so gun steel and helmets reflect the same afternoon the scene is lit by.
export function makeEnvironment(renderer) {
	const envScene = new THREE.Scene();
	envScene.add(skyDome(50));
	const flats = new THREE.Mesh(new THREE.CircleGeometry(48, 32), new THREE.MeshBasicMaterial({ color: PALETTE.ground }));
	flats.rotation.x = -Math.PI / 2; flats.position.y = -2;
	const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: '#fff4dc' }));
	sunDisc.position.set(-20, 35, 15);
	envScene.add(flats, sunDisc);
	const pmrem = new THREE.PMREMGenerator(renderer);
	const env = pmrem.fromScene(envScene, 0.03).texture;
	pmrem.dispose();
	return env;
}

export function buildScene(scene, collision, textures, quality) {
	scene.background = new THREE.Color(PALETTE.sky);
	scene.fog = new THREE.Fog(PALETTE.fog, 45, 140);
	scene.environment = quality.environment;
	scene.environmentIntensity = 0.45;
	const sky = skyDome(300);
	sky.position.set(WIDTH_M / 2, 0, DEPTH_M / 2);
	sky.renderOrder = -1;
	scene.add(sky);

	const hemi = new THREE.HemisphereLight('#dfe8ee', '#a8906c', 1.25);
	scene.add(hemi);
	const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
	sun.position.set(WIDTH_M / 2 - 30, 55, DEPTH_M / 2 + 22);
	sun.target.position.set(WIDTH_M / 2, 0, DEPTH_M / 2);
	sun.castShadow = true;
	sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
	const cam = sun.shadow.camera;
	cam.left = -52; cam.right = 52; cam.top = 46; cam.bottom = -46; cam.near = 10; cam.far = 140;
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.03;
	sun.shadow.radius = 2.5;
	scene.add(sun, sun.target);

	// Ground: the whole compound, with the site floors laid on top as separate plates.
	const groundMat = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: 1.2, roughness: 0.95, metalness: 0 });
	textures.ground.repeat.set(WIDTH_M / 4, DEPTH_M / 4);
	const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH_M + 80, DEPTH_M + 80), groundMat);
	textures.ground.repeat.set((WIDTH_M + 80) / 4, (DEPTH_M + 80) / 4);
	groundMesh.rotation.x = -Math.PI / 2;
	groundMesh.position.set(WIDTH_M / 2, 0, DEPTH_M / 2);
	groundMesh.receiveShadow = true;
	scene.add(groundMesh);

	const siteMat = new THREE.MeshStandardMaterial({ map: textures.siteGround, bumpMap: textures.siteGround, bumpScale: 1.2, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
	const siteBucket = bucket();
	for (let r = 0; r < DEPTH; r += 1) {
		for (let c = 0; c < COLS; c += 1) {
			const ch = ROWS[r][c];
			if (ch !== 'a' && ch !== 'b') continue;
			const x = c * CELL; const z = r * CELL; const base = siteBucket.positions.length / 3;
			siteBucket.positions.push(x, 0.01, z + CELL, x + CELL, 0.01, z + CELL, x + CELL, 0.01, z, x, 0.01, z);
			for (let i = 0; i < 4; i += 1) siteBucket.normals.push(0, 1, 0);
			siteBucket.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
			siteBucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
		}
	}
	const sites = new THREE.Mesh(geometryFrom(siteBucket), siteMat);
	sites.receiveShadow = true;
	scene.add(sites);

	// Solid boxes, merged per material.
	const wallB = bucket(); const crateB = bucket(); const palletB = bucket();
	for (const box of collision.boxes) {
		const target = box.kind === '#' ? wallB : box.kind === 'C' ? crateB : palletB;
		const scale = box.kind === '#' ? 2.5 : box.kind === 'C' ? 2.2 : 1.0;
		pushBox(target, box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ, scale);
	}
	const wallMat = new THREE.MeshStandardMaterial({ map: textures.concrete, bumpMap: textures.concrete, bumpScale: 2.5, roughness: 0.92 });
	const crateMat = new THREE.MeshStandardMaterial({ map: textures.crate, bumpMap: textures.crate, bumpScale: 3, roughness: 0.8 });
	const palletMat = new THREE.MeshStandardMaterial({ map: textures.pallet, bumpMap: textures.pallet, bumpScale: 2, roughness: 0.85 });
	for (const [b, mat] of [[wallB, wallMat], [crateB, crateMat], [palletB, palletMat]]) {
		const mesh = new THREE.Mesh(geometryFrom(b), mat);
		mesh.castShadow = true; mesh.receiveShadow = true;
		scene.add(mesh);
	}

	// Wall caps: a darker coping strip along the top of every interior wall, so silhouettes read.
	const capB = bucket();
	for (const box of collision.boxes) {
		if (box.kind !== '#') continue;
		pushBox(capB, box.minX - 0.06, box.maxY, box.minZ - 0.06, box.maxX + 0.06, box.maxY + 0.18, box.maxZ + 0.06, 4);
	}
	const caps = new THREE.Mesh(geometryFrom(capB), new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: 0.8 }));
	caps.castShadow = true;
	scene.add(caps);

	addSiteMarkings(scene, textures);
	addProps(scene, collision);
	addSigns(scene, textures);

	return { sun, hemi };
}

function addSiteMarkings(scene, textures) {
	const geo = new THREE.PlaneGeometry(6, 6);
	for (const [tex, x, z] of [[textures.letterA, 6 * CELL + 1, 4.5 * CELL], [textures.letterB, 33 * CELL + 1, 4.5 * CELL]]) {
		const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
		const decal = new THREE.Mesh(geo, mat);
		decal.rotation.x = -Math.PI / 2;
		decal.position.set(x, 0.02, z);
		decal.receiveShadow = true;
		scene.add(decal);
	}
	// Wall-mounted site letters, visible from the lanes.
	const wallGeo = new THREE.PlaneGeometry(2.6, 2.6);
	for (const [tex, x, z, ry] of [
		[textures.letterA, 3 * CELL + 2, 10 * CELL + 2.02, 0], [textures.letterA, 9 * CELL, 10 * CELL + 2.02, 0],
		[textures.letterB, 33 * CELL - 0.5 + 2, 10 * CELL + 2.02, 0], [textures.letterB, 30 * CELL + 2, 10 * CELL + 2.02, 0],
	]) {
		const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
		const m = new THREE.Mesh(wallGeo, mat);
		m.position.set(x, 3.4, z); m.rotation.y = ry;
		scene.add(m);
	}
}

// Pipes and tanks: evaporator pipework running along the tops of walls, and brine tanks beyond the
// outer wall so the skyline reads as an industrial site. Decoration only, outside every walkable cell.
function addProps(scene, collision) {
	const steel = new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.45, metalness: 0.6 });
	const rust = new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.7, metalness: 0.3 });
	const tankMat = new THREE.MeshStandardMaterial({ color: '#d7d2c8', roughness: 0.55, metalness: 0.25 });
	const pipeGeo = new THREE.CylinderGeometry(0.22, 0.22, 1, 12);
	pipeGeo.rotateZ(Math.PI / 2);
	for (const box of collision.boxes) {
		if (box.kind !== '#' || box.maxY > 6) continue;
		const w = box.maxX - box.minX; const d = box.maxZ - box.minZ;
		if (Math.max(w, d) < 6) continue;
		const pipe = new THREE.Mesh(pipeGeo, w > d ? steel : rust);
		pipe.scale.x = Math.max(w, d);
		if (d > w) pipe.rotation.y = Math.PI / 2;
		pipe.position.set((box.minX + box.maxX) / 2, box.maxY + 0.42, (box.minZ + box.maxZ) / 2);
		pipe.castShadow = true;
		scene.add(pipe);
	}
	const tankGeo = new THREE.CylinderGeometry(4.5, 4.5, 11, 32);
	const roofGeo = new THREE.ConeGeometry(4.6, 1.6, 32);
	const tanks = [[-8, 10], [-8, 26], [WIDTH_M + 8, 12], [WIDTH_M + 8, 30], [20, -9], [60, -9], [30, DEPTH_M + 9], [52, DEPTH_M + 9]];
	for (const [x, z] of tanks) {
		const tank = new THREE.Mesh(tankGeo, tankMat);
		tank.position.set(x, 5.5, z); tank.castShadow = true;
		const roof = new THREE.Mesh(roofGeo, steel);
		roof.position.set(x, 11.8, z);
		scene.add(tank, roof);
	}
	// Light masts in the yards: a pole and a lamp head.
	const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 9, 8);
	const headGeo = new THREE.BoxGeometry(1.2, 0.3, 0.5);
	for (const [c, r] of [[1.2, 1.2], [38.8, 1.2], [1.2, 30.8], [38.8, 30.8]]) {
		const pole = new THREE.Mesh(poleGeo, steel); pole.position.set(c * CELL, 4.5 + 7, r * CELL);
		const head = new THREE.Mesh(headGeo, steel); head.position.set(c * CELL, 16, r * CELL);
		scene.add(pole, head);
	}
}

function addSigns(scene, textures) {
	const geo = new THREE.PlaneGeometry(2.4, 0.6);
	const placed = [
		['PUMP HALL', 19 * CELL + 1, 22 * CELL - 0.02 + 0.04, Math.PI, 3.4],
		['BRINE YARD', 1 * CELL, 26 * CELL - 0.02, 0, 3.4],
		['EVAPORATORS', 39 * CELL - 4, 26 * CELL - 0.02, 0, 3.4],
		['SLUICE', 20 * CELL, 6 * CELL - 0.02 + 0.04, Math.PI, 3.4],
	];
	for (const [text, x, z, ry, y] of placed) {
		const mat = new THREE.MeshBasicMaterial({ map: textures.sign(text) });
		const m = new THREE.Mesh(geo, mat);
		m.position.set(x, y, z); m.rotation.y = ry;
		scene.add(m);
	}
	return CALLOUTS;
}
