// A pooled particle system drawn as one THREE.Points call: dust, blood, sparks, smoke and fire.
// Particles live in flat typed arrays; a dead particle swaps with the last live one, so the
// update is a single pass with no allocation, and the GPU buffers are rewritten in place.
import * as THREE from 'three';

const VERT = `
attribute float alpha;
attribute float size;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
uniform float scale;
void main() {
	vAlpha = alpha;
	vTint = tint;
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	gl_PointSize = size * scale / max(0.1, -mv.z);
	gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map;
varying float vAlpha;
varying vec3 vTint;
void main() {
	vec4 t = texture2D(map, gl_PointCoord);
	gl_FragColor = vec4(vTint * t.rgb, t.a * vAlpha);
	if (gl_FragColor.a < 0.004) discard;
}`;

export function createParticles(scene, texture, capacity, additive) {
	const pos = new Float32Array(capacity * 3);
	const vel = new Float32Array(capacity * 3);
	const tint = new Float32Array(capacity * 3);
	const alpha = new Float32Array(capacity);
	const size = new Float32Array(capacity);
	const life = new Float32Array(capacity);
	const age = new Float32Array(capacity);
	const grow = new Float32Array(capacity);
	const startAlpha = new Float32Array(capacity);
	const startSize = new Float32Array(capacity);
	const drag = new Float32Array(capacity);
	const gravity = new Float32Array(capacity);
	let count = 0;

	const geo = new THREE.BufferGeometry();
	const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
	const tintAttr = new THREE.BufferAttribute(tint, 3).setUsage(THREE.DynamicDrawUsage);
	const alphaAttr = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
	const sizeAttr = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
	geo.setAttribute('position', posAttr);
	geo.setAttribute('tint', tintAttr);
	geo.setAttribute('alpha', alphaAttr);
	geo.setAttribute('size', sizeAttr);
	geo.setDrawRange(0, 0);
	geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(40, 0, 32), 400);

	const material = new THREE.ShaderMaterial({
		uniforms: { map: { value: texture }, scale: { value: 600 } },
		vertexShader: VERT, fragmentShader: FRAG,
		transparent: true, depthWrite: false,
		blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
	});
	const points = new THREE.Points(geo, material);
	points.frustumCulled = false;
	points.renderOrder = additive ? 3 : 2;
	scene.add(points);

	const color = new THREE.Color();

	// Spawn one particle. colorHex: a THREE.Color-compatible hex number.
	function emit(x, y, z, vx, vy, vz, s, growth, lifetime, colorHex, a, dragK, grav) {
		if (count >= capacity) return;
		const i = count++;
		const i3 = i * 3;
		pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
		vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
		color.setHex(colorHex);
		tint[i3] = color.r; tint[i3 + 1] = color.g; tint[i3 + 2] = color.b;
		startSize[i] = s; size[i] = s; grow[i] = growth;
		startAlpha[i] = a; alpha[i] = a;
		life[i] = lifetime; age[i] = 0;
		drag[i] = dragK; gravity[i] = grav;
	}

	function moveSlot(from, to) {
		const f3 = from * 3; const t3 = to * 3;
		for (let k = 0; k < 3; k += 1) {
			pos[t3 + k] = pos[f3 + k]; vel[t3 + k] = vel[f3 + k]; tint[t3 + k] = tint[f3 + k];
		}
		alpha[to] = alpha[from]; size[to] = size[from]; life[to] = life[from]; age[to] = age[from];
		grow[to] = grow[from]; startAlpha[to] = startAlpha[from]; startSize[to] = startSize[from];
		drag[to] = drag[from]; gravity[to] = gravity[from];
	}

	function update(dt, pixelScale) {
		material.uniforms.scale.value = pixelScale;
		let i = 0;
		while (i < count) {
			age[i] += dt;
			if (age[i] >= life[i]) { count -= 1; if (i !== count) moveSlot(count, i); continue; }
			const i3 = i * 3;
			const k = Math.max(0, 1 - drag[i] * dt);
			vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k - gravity[i] * dt; vel[i3 + 2] *= k;
			pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
			if (pos[i3 + 1] < 0.02) { pos[i3 + 1] = 0.02; vel[i3 + 1] *= -0.3; }
			const t = age[i] / life[i];
			size[i] = startSize[i] * (1 + grow[i] * t);
			// Fade in quickly, out slowly.
			alpha[i] = startAlpha[i] * Math.min(1, t * 12) * (1 - t * t);
			i += 1;
		}
		geo.setDrawRange(0, count);
		if (count > 0) {
			posAttr.clearUpdateRanges(); posAttr.addUpdateRange(0, count * 3); posAttr.needsUpdate = true;
			tintAttr.clearUpdateRanges(); tintAttr.addUpdateRange(0, count * 3); tintAttr.needsUpdate = true;
			alphaAttr.clearUpdateRanges(); alphaAttr.addUpdateRange(0, count); alphaAttr.needsUpdate = true;
			sizeAttr.clearUpdateRanges(); sizeAttr.addUpdateRange(0, count); sizeAttr.needsUpdate = true;
		}
	}

	function clear() { count = 0; geo.setDrawRange(0, 0); }

	return { emit, update, clear, points };
}
