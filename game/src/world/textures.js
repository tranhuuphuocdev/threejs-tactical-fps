// Procedural textures painted on canvases at load: no image files, no network. Each is drawn
// once at 512 px with a seeded noise so the look is the same on every machine, then uploaded
// with mipmaps and the GPU's best anisotropic filtering so surfaces stay sharp at grazing angles.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function canvas(size) {
	const el = document.createElement('canvas');
	el.width = size; el.height = size;
	return [el, el.getContext('2d')];
}

function speckle(ctx, size, count, colors, alpha, random, maxR = 2) {
	for (let i = 0; i < count; i += 1) {
		ctx.globalAlpha = alpha * (0.4 + random() * 0.6);
		ctx.fillStyle = colors[(random() * colors.length) | 0];
		const r = 0.5 + random() * maxR;
		ctx.fillRect(random() * size, random() * size, r, r);
	}
	ctx.globalAlpha = 1;
}

function finish(el, anisotropy, repeat = true) {
	const tex = new THREE.CanvasTexture(el);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = anisotropy;
	tex.generateMipmaps = true;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	if (repeat) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
	return tex;
}

// Cast concrete with form-tie holes and pour lines: walls are 2 m per repeat.
function concrete(anisotropy) {
	const size = 512; const [el, ctx] = canvas(size); const random = rng(11);
	ctx.fillStyle = PALETTE.concrete; ctx.fillRect(0, 0, size, size);
	speckle(ctx, size, 9000, [PALETTE.concreteDark, PALETTE.concreteLight, '#a99f8f'], 0.35, random);
	for (let i = 0; i < 40; i += 1) {
		ctx.globalAlpha = 0.06; ctx.fillStyle = random() > 0.5 ? PALETTE.concreteDark : PALETTE.concreteLight;
		const w = 40 + random() * 160; ctx.fillRect(random() * size, random() * size, w, w * 0.4);
	}
	ctx.globalAlpha = 1;
	ctx.strokeStyle = PALETTE.concreteDark; ctx.lineWidth = 3; ctx.globalAlpha = 0.55;
	ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
	ctx.beginPath(); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.lineWidth = 1.5; ctx.stroke();
	ctx.globalAlpha = 0.7; ctx.fillStyle = '#5d564c';
	for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
		ctx.beginPath(); ctx.arc(x * size, y * size, 5, 0, Math.PI * 2); ctx.fill();
	}
	// Salt bloom along the base of each panel.
	const grad = ctx.createLinearGradient(0, size, 0, size * 0.8);
	grad.addColorStop(0, 'rgba(240,236,226,0.45)'); grad.addColorStop(1, 'rgba(240,236,226,0)');
	ctx.globalAlpha = 1; ctx.fillStyle = grad; ctx.fillRect(0, size * 0.8, size, size * 0.2);
	return finish(el, anisotropy);
}

// Packed salt flats with a faint 2 m paving grid: floor is 4 m per repeat.
function ground(anisotropy) {
	const size = 512; const [el, ctx] = canvas(size); const random = rng(23);
	ctx.fillStyle = PALETTE.ground; ctx.fillRect(0, 0, size, size);
	speckle(ctx, size, 14000, [PALETTE.groundDark, PALETTE.salt, '#c9b896'], 0.3, random, 2.5);
	ctx.strokeStyle = PALETTE.groundDark; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
	for (let i = 0; i <= 2; i += 1) {
		ctx.beginPath(); ctx.moveTo(i * size / 2, 0); ctx.lineTo(i * size / 2, size); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(0, i * size / 2); ctx.lineTo(size, i * size / 2); ctx.stroke();
	}
	ctx.globalAlpha = 0.18; ctx.lineWidth = 1;
	for (let i = 0; i < 26; i += 1) {
		ctx.beginPath(); let x = random() * size; let y = random() * size; ctx.moveTo(x, y);
		for (let k = 0; k < 5; k += 1) { x += (random() - 0.5) * 50; y += (random() - 0.5) * 50; ctx.lineTo(x, y); }
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
	return finish(el, anisotropy);
}

// Site floor: the same salt with hazard-painted plates.
function siteGround(anisotropy) {
	const size = 512; const [el, ctx] = canvas(size); const random = rng(37);
	ctx.fillStyle = PALETTE.siteFloor; ctx.fillRect(0, 0, size, size);
	speckle(ctx, size, 9000, [PALETTE.groundDark, '#8d8270', PALETTE.salt], 0.28, random, 2.5);
	ctx.strokeStyle = '#3f3a33'; ctx.lineWidth = 4; ctx.globalAlpha = 0.6;
	ctx.strokeRect(8, 8, size - 16, size - 16);
	for (let i = 0; i < 6; i += 1) {
		const x = 20 + random() * (size - 40); const y = 20 + random() * (size - 40);
		ctx.fillStyle = '#4b453c'; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
	}
	ctx.globalAlpha = 1;
	return finish(el, anisotropy);
}

// Salt crates: banded timber with stencilled marks. One face per texture.
function crate(anisotropy) {
	const size = 512; const [el, ctx] = canvas(size); const random = rng(41);
	ctx.fillStyle = PALETTE.crate; ctx.fillRect(0, 0, size, size);
	for (let i = 0; i < 8; i += 1) {
		ctx.fillStyle = i % 2 ? PALETTE.crateDark : PALETTE.crate; ctx.globalAlpha = 0.35;
		ctx.fillRect(0, i * 64, size, 64);
		ctx.globalAlpha = 0.5; ctx.fillStyle = PALETTE.crateDark; ctx.fillRect(0, i * 64, size, 3);
	}
	speckle(ctx, size, 5000, [PALETTE.crateDark, '#b48a55'], 0.3, random, 3);
	ctx.globalAlpha = 1; ctx.strokeStyle = PALETTE.crateDark; ctx.lineWidth = 26;
	ctx.strokeRect(13, 13, size - 26, size - 26);
	ctx.beginPath(); ctx.moveTo(26, 26); ctx.lineTo(size - 26, size - 26); ctx.lineWidth = 22; ctx.stroke();
	ctx.fillStyle = 'rgba(30,26,22,0.55)'; ctx.font = 'bold 56px ui-monospace, Menlo, monospace';
	ctx.textAlign = 'center'; ctx.fillText('NaCl', size * 0.7, size * 0.3);
	ctx.font = 'bold 30px ui-monospace, Menlo, monospace'; ctx.fillText('SALTWORKS 04', size * 0.32, size * 0.82);
	return finish(el, anisotropy);
}

// Pallets: grey steel cage around white salt sacks.
function pallet(anisotropy) {
	const size = 256; const [el, ctx] = canvas(size); const random = rng(53);
	ctx.fillStyle = PALETTE.salt; ctx.fillRect(0, 0, size, size);
	speckle(ctx, size, 2500, ['#d9d2c3', '#ffffff'], 0.5, random, 3);
	ctx.strokeStyle = PALETTE.steel; ctx.lineWidth = 10; ctx.strokeRect(5, 5, size - 10, size - 10);
	ctx.lineWidth = 5;
	for (let i = 1; i < 4; i += 1) { ctx.beginPath(); ctx.moveTo(i * size / 4, 0); ctx.lineTo(i * size / 4, size); ctx.stroke(); }
	ctx.beginPath(); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();
	return finish(el, anisotropy);
}

// A big site letter, painted on the floor and on walls as a decal (transparent background).
function siteLetter(letter, anisotropy) {
	const size = 512; const [el, ctx] = canvas(size);
	ctx.clearRect(0, 0, size, size);
	ctx.strokeStyle = PALETTE.accent; ctx.lineWidth = 22; ctx.globalAlpha = 0.85;
	ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2); ctx.stroke();
	ctx.fillStyle = PALETTE.accent; ctx.font = `900 ${size * 0.62}px system-ui, -apple-system, sans-serif`;
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, size / 2, size * 0.54);
	return finish(el, anisotropy, false);
}

// Painted wayfinding signs: an arrow and a place name.
function sign(text, anisotropy) {
	const w = 512; const h = 128; const el = document.createElement('canvas'); el.width = w; el.height = h;
	const ctx = el.getContext('2d');
	ctx.fillStyle = PALETTE.signBg; ctx.fillRect(0, 0, w, h);
	ctx.fillStyle = PALETTE.accent; ctx.fillRect(0, 0, 16, h);
	ctx.fillStyle = PALETTE.salt; ctx.font = '700 58px system-ui, -apple-system, sans-serif';
	ctx.textBaseline = 'middle'; ctx.fillText(text, 40, h / 2 + 3);
	return finish(el, anisotropy, false);
}

// A soft round puff for smoke, dust and sparks (white, tinted per material).
function puff() {
	const size = 128; const [el, ctx] = canvas(size);
	const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
	const tex = new THREE.CanvasTexture(el); tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

export function createTextures(renderer) {
	const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
	return {
		concrete: concrete(anisotropy),
		ground: ground(anisotropy),
		siteGround: siteGround(anisotropy),
		crate: crate(anisotropy),
		pallet: pallet(anisotropy),
		letterA: siteLetter('A', anisotropy),
		letterB: siteLetter('B', anisotropy),
		sign: (text) => sign(text, anisotropy),
		puff: puff(),
	};
}
