// Sound, synthesised with the Web Audio API: no files. Every buffer (gunshots per weapon,
// footsteps, reload clicks, beeps, blasts) is rendered once when audio starts; playing a sound
// is a buffer source through a panner, so a shot is heard from where it was fired.
import { WEAPONS } from '../config.js';

function noiseBuffer(ctx, seconds, shape) {
	const n = Math.floor(ctx.sampleRate * seconds);
	const buf = ctx.createBuffer(1, n, ctx.sampleRate);
	const d = buf.getChannelData(0);
	let seed = 1234567;
	let last = 0;
	for (let i = 0; i < n; i += 1) {
		seed = (seed * 16807) % 2147483647;
		const white = (seed / 2147483647) * 2 - 1;
		d[i] = shape(i / ctx.sampleRate, white, last);
		last = d[i];
	}
	return buf;
}

function gunshot(ctx, pitch, body) {
	return noiseBuffer(ctx, 0.5, (t, w, last) => {
		const crack = w * Math.exp(-t * 55 * pitch);
		const thump = Math.sin(2 * Math.PI * (95 * pitch) * t * (1 - t * 1.2)) * Math.exp(-t * 18) * 0.9 * body;
		const tail = (last * 0.92 + w * 0.08) * Math.exp(-t * 7) * 2.2 * body;
		return Math.max(-1, Math.min(1, crack * 0.9 + thump + tail));
	});
}

export function createAudio() {
	let ctx = null;
	let master = null;
	const buffers = {};
	let listenerReady = false;

	function start() {
		if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
		const Ctor = window.AudioContext || window.webkitAudioContext;
		if (!Ctor) return;
		ctx = new Ctor();
		master = ctx.createGain();
		master.gain.value = 0.55;
		const comp = ctx.createDynamicsCompressor();
		master.connect(comp); comp.connect(ctx.destination);
		for (const def of Object.values(WEAPONS)) buffers[def.id] = gunshot(ctx, def.sound.pitch, def.sound.body);
		buffers.step = noiseBuffer(ctx, 0.08, (t, w, last) => (last * 0.6 + w * 0.4) * Math.exp(-t * 60));
		buffers.land = noiseBuffer(ctx, 0.2, (t, w, last) => (last * 0.85 + w * 0.15) * Math.exp(-t * 25) * 2);
		buffers.click = noiseBuffer(ctx, 0.04, (t, w) => w * Math.exp(-t * 200) * 0.7);
		buffers.reload = noiseBuffer(ctx, 0.6, (t, w) => w * (Math.exp(-((t - 0.05) ** 2) * 9000) + Math.exp(-((t - 0.42) ** 2) * 6000)) * 0.8);
		buffers.bounce = noiseBuffer(ctx, 0.12, (t, w) => (Math.sin(t * 2 * Math.PI * 1900) * 0.5 + w * 0.3) * Math.exp(-t * 45));
		buffers.blast = noiseBuffer(ctx, 2.2, (t, w, last) => (last * 0.96 + w * 0.04) * Math.exp(-t * 2.2) * 9 + Math.sin(t * 2 * Math.PI * 48) * Math.exp(-t * 4) * 0.6);
		buffers.pop = noiseBuffer(ctx, 0.5, (t, w, last) => (last * 0.8 + w * 0.2) * Math.exp(-t * 9) * 2.5);
		buffers.beep = noiseBuffer(ctx, 0.12, (t) => Math.sin(t * 2 * Math.PI * 1760) * Math.min(1, (0.12 - t) * 60) * 0.5);
		buffers.hit = noiseBuffer(ctx, 0.06, (t) => Math.sin(t * 2 * Math.PI * 1300) * Math.exp(-t * 70) * 0.6);
		buffers.head = noiseBuffer(ctx, 0.25, (t) => (Math.sin(t * 2 * Math.PI * 2600) + Math.sin(t * 2 * Math.PI * 3900) * 0.5) * Math.exp(-t * 18) * 0.5);
		buffers.kill = noiseBuffer(ctx, 0.3, (t) => Math.sin(t * 2 * Math.PI * (660 + t * 900)) * Math.exp(-t * 10) * 0.45);
		buffers.hurt = noiseBuffer(ctx, 0.18, (t, w, last) => (last * 0.7 + w * 0.3) * Math.exp(-t * 20) * 1.5);
		buffers.horn = noiseBuffer(ctx, 0.9, (t) => (Math.sin(t * 2 * Math.PI * 220) + Math.sin(t * 2 * Math.PI * 330) * 0.6) * Math.min(1, t * 20) * Math.exp(-t * 2.5) * 0.35);
		buffers.win = noiseBuffer(ctx, 1.2, (t) => [523, 659, 784].reduce((s, f, i) => s + (t > i * 0.12 ? Math.sin(t * 2 * Math.PI * f) : 0), 0) * Math.exp(-t * 2.2) * 0.22);
		buffers.lose = noiseBuffer(ctx, 1.2, (t) => [392, 311, 262].reduce((s, f, i) => s + (t > i * 0.15 ? Math.sin(t * 2 * Math.PI * f) : 0), 0) * Math.exp(-t * 2.2) * 0.22);
		buffers.buy = noiseBuffer(ctx, 0.08, (t) => Math.sin(t * 2 * Math.PI * 990) * Math.exp(-t * 40) * 0.4);
		listenerReady = true;
	}

	function play(name, volume = 1, x = null, y = 0, z = 0, rate = 1) {
		if (!ctx || !buffers[name]) return;
		const src = ctx.createBufferSource();
		src.buffer = buffers[name];
		src.playbackRate.value = rate;
		const gain = ctx.createGain();
		gain.gain.value = volume;
		src.connect(gain);
		if (x === null) {
			gain.connect(master);
		} else {
			const pan = ctx.createPanner();
			pan.panningModel = 'equalpower';
			pan.distanceModel = 'inverse';
			pan.refDistance = 3; pan.rolloffFactor = 1.1; pan.maxDistance = 90;
			pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z;
			gain.connect(pan); pan.connect(master);
		}
		src.start();
	}

	function setListener(pos, forward) {
		if (!listenerReady) return;
		const l = ctx.listener;
		const t = ctx.currentTime;
		if (l.positionX) {
			l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
			l.forwardX.setValueAtTime(forward.x, t); l.forwardY.setValueAtTime(forward.y, t); l.forwardZ.setValueAtTime(forward.z, t);
			l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
		} else {
			l.setPosition(pos.x, pos.y, pos.z);
			l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
		}
	}

	function onEvent(e, playerId) {
		if (!ctx) return;
		const own = e.actor === playerId;
		switch (e.type) {
			case 'shot':
				if (own) play(e.weapon, 0.75, null, 0, 0, 0.97 + Math.random() * 0.06);
				else play(e.weapon, 1.4, e.x, e.y, e.z, 0.95 + Math.random() * 0.1);
				break;
			case 'step': if (!own) play('step', 0.9, e.x, e.y, e.z, 0.8 + Math.random() * 0.4); else play('step', 0.25, null, 0, 0, 0.9 + Math.random() * 0.3); break;
			case 'land': play('land', own ? 0.4 : 1, own ? null : e.x, e.y, e.z); break;
			case 'reload': if (own) play('reload', 0.6); else play('reload', 0.5, e.x, e.y, e.z); break;
			case 'dry': if (own) play('click', 0.7); break;
			case 'switch': if (own) play('click', 0.35, null, 0, 0, 0.7); break;
			case 'bounce': play('bounce', 0.7, e.x, e.y, e.z); break;
			case 'detonate':
				if (e.weapon === 'frag') play('blast', 1.4, e.x, e.y, e.z);
				else play('pop', 1, e.x, e.y, e.z, e.weapon === 'flash' ? 1.6 : 0.7);
				break;
			case 'explode': play('blast', 2.4, e.x, e.y, e.z, 0.6); break;
			case 'beep': play('beep', 0.9, e.x, e.y + 0.3, e.z); break;
			case 'hit':
				if (e.other === playerId) play(e.head ? 'head' : 'hit', 0.8);
				if (e.actor === playerId) play('hurt', 0.8);
				break;
			case 'kill': if (e.other === playerId) play('kill', 0.7); break;
			case 'live': play('horn', 0.6); break;
			case 'bought': if (own) play('buy', 0.6); break;
			case 'plantStart': case 'defuseStart': play('click', 0.8, e.x, e.y, e.z, 0.5); break;
			default:
		}
	}

	function roundEnd(won) { if (ctx) play(won ? 'win' : 'lose', 0.8); }

	return { start, play, onEvent, setListener, roundEnd };
}
