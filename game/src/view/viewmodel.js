// The first-person weapon, drawn in its own scene and camera after the world (depth cleared),
// so it never clips into walls and keeps a steady field of view while the world FOV zooms.
// Every model is built once (gun-models.js); switching only toggles visibility.
// Motion is springs: kick on each shot, bob with stride, sway against the mouse, dip on reload,
// raise on draw.
import * as THREE from 'three';
import { buildGunModels, createGunMaterials } from './gun-models.js';

export function createViewmodel(textures, environment) {
	const scene = new THREE.Scene();
	scene.environment = environment;
	scene.environmentIntensity = 0.9;
	const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 10);
	scene.add(new THREE.HemisphereLight('#f4ecdf', '#6b5a45', 1.6));
	const key = new THREE.DirectionalLight('#ffe2b5', 1.8);
	key.position.set(-0.6, 1, 0.4);
	scene.add(key);
	const flashLight = new THREE.PointLight('#ffb35c', 0, 0.8, 2);

	const mats = createGunMaterials();
	const models = buildGunModels(mats);
	const holder = new THREE.Group();
	scene.add(holder);
	for (const m of Object.values(models)) { m.visible = false; holder.add(m); }

	const flash = new THREE.Sprite(new THREE.SpriteMaterial({
		map: textures.puff, color: '#ffc46b', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
	}));
	flash.scale.set(0.1, 0.1, 1);
	flash.visible = false;
	holder.add(flash, flashLight);

	const REST = new THREE.Vector3(0.2, -0.2, -0.52);
	const s = { kick: 0, kickV: 0, swayX: 0, swayY: 0, bob: 0, flashT: 0, current: '', raise: 0, lastActive: -1 };
	let muzzle = new THREE.Vector3();
	let rest = REST;

	function show(key) {
		if (s.current === key) return;
		if (s.current) models[s.current].visible = false;
		models[key].visible = true;
		muzzle = models[key].userData.muzzle;
		rest = models[key].userData.rest ?? REST;
		s.current = key;
	}

	return {
		scene, camera,
		setSleeve(color) { mats.sleeve.color.set(color); },
		fire() {
			s.kickV += 7.5;
			s.flashT = 0.05;
			flash.material.rotation = Math.random() * Math.PI;
		},
		// dt: frame seconds. view: { modelKey, speed, onGround, reload (0..1 or -1), switching (0..1), lookX, lookY, scoped, crouch }
		update(dt, view) {
			show(view.modelKey);
			holder.visible = !view.scoped && view.visible;
			// Kick spring: a stiff, damped spring so each shot snaps back before the next.
			s.kickV += (-s.kick * 220 - s.kickV * 22) * dt;
			s.kick += s.kickV * dt;
			// Sway trails the mouse; bob follows stride.
			s.swayX += (-view.lookX * 0.9 - s.swayX) * Math.min(1, dt * 10);
			s.swayY += (view.lookY * 0.9 - s.swayY) * Math.min(1, dt * 10);
			const stride = view.onGround ? Math.min(1, view.speed / 6) : 0.15;
			s.bob += dt * (6 + view.speed * 1.3);
			const bobX = Math.sin(s.bob) * 0.011 * stride;
			const bobY = Math.abs(Math.cos(s.bob)) * 0.009 * stride;
			const reloadDip = view.reload >= 0 ? Math.sin(Math.min(1, view.reload) * Math.PI) : 0;
			const raise = view.switching;

			holder.position.set(
				rest.x + bobX + s.swayX * 0.04,
				rest.y - bobY + s.swayY * 0.03 - reloadDip * 0.12 - raise * 0.28 - view.crouch * 0.01,
				rest.z + s.kick * 0.06,
			);
			holder.rotation.set(s.kick * 0.09 - reloadDip * 0.5 + raise * 0.6, s.swayX * 0.4, reloadDip * 0.35);

			s.flashT -= dt;
			flash.visible = s.flashT > 0;
			flash.position.copy(muzzle);
			flashLight.position.copy(muzzle);
			flashLight.intensity = s.flashT > 0 ? 0.35 : 0;
		},
		// The muzzle's position in world space, for the start of the player's tracers.
		muzzleWorld(worldCamera, out) {
			out.copy(muzzle);
			holder.updateMatrixWorld();
			out.applyMatrix4(holder.matrixWorld);
			// Viewmodel space is camera space: carry it into the world camera's frame.
			return worldCamera.localToWorld(out);
		},
	};
}
