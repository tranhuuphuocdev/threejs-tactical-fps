// Boot and the frame loop. The simulation runs at a fixed 60 Hz (game.js); each display frame:
//   1. mouse look is applied straight to the player's view (no tick of latency on aim),
//   2. as many simulation ticks run as real time owes (capped, so a stall never spirals),
//   3. bodies are drawn interpolated between their last two ticks, so motion is smooth at any
//      refresh rate, and that same alpha is handed to hit tests (what you see is what you hit),
//   4. the event queue is drained into effects, audio and the HUD, and the frame is rendered:
//      the world, then the weapon in its own pass.
// ?shot=<name>&seed=N stages a deterministic scene for a screenshot (shots.js).
import * as THREE from 'three';
import { DT, TEAM, WEAPONS } from './config.js';
import { createGame } from './game.js';
import { createHud } from './ui/hud.js';
import { createPlayerControl } from './player-control.js';
import { createInput } from './input.js';
import { hear } from './bots/perception.js';
import { buy } from './sim/shop.js';
import { eyeHeight, viewDirection } from './core/actors.js';
import { buildScene, makeEnvironment } from './world/scene-builder.js';
import { createBodies } from './view/bodies.js';
import { createEffects } from './view/effects.js';
import { createViewmodel } from './view/viewmodel.js';
import { createTextures } from './world/textures.js';
import { createAudio } from './view/audio.js';
import { PALETTE } from './palette.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '', 10) || ((Date.now() % 100000) + 1);

const BASE_FOV = 74;
if (params.has('debug')) window.__saltline = { get game() { return game; } }; // test hook: inspect the match from the console

// Renderer: device pixel ratio (capped at 2) and MSAA for crisp edges; ACES tone mapping.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!shot });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.autoClear = false;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

const textures = createTextures(renderer);
const game = createGame(seed);
const { state, player } = game;
const environment = makeEnvironment(renderer);
buildScene(scene, state.collision, textures, { shadowMap: 2048, environment });
const bodies = createBodies(scene, state.actors);
const viewmodel = createViewmodel(textures, environment);
const effects = createEffects(scene, textures);
const audio = createAudio();
const hud = createHud(state.actors, (id) => buy(state, player, id));
const input = createInput(renderer.domElement, onLockChange);
const control = createPlayerControl(input, hud);

const overlay = document.getElementById('overlay');
const overlayCopy = document.getElementById('overlay-copy');
const playButton = document.getElementById('play');
let chosenSide = TEAM.RAIDERS;
let chosenSkill = 0.6;
let matchStarted = false;
let spectateIndex = 0;

for (const b of document.querySelectorAll('#side-pick .choice')) {
	b.addEventListener('click', () => {
		chosenSide = Number(b.dataset.side);
		for (const o of document.querySelectorAll('#side-pick .choice')) o.setAttribute('aria-pressed', String(o === b));
	});
}
for (const b of document.querySelectorAll('#skill-pick button')) {
	b.addEventListener('click', () => {
		chosenSkill = Number(b.dataset.skill);
		for (const o of document.querySelectorAll('#skill-pick button')) o.setAttribute('aria-pressed', String(o === b));
	});
}
playButton.addEventListener('click', () => {
	audio.start();
	if (!matchStarted || state.round.phase === 'over') {
		game.newMatch(chosenSide, chosenSkill);
		matchStarted = true;
		accumulator = 0;
	}
	input.requestLock();
});
renderer.domElement.addEventListener('click', () => {
	if (!matchStarted) return;
	if (!input.state.locked && !hud.buyVisible) input.requestLock();
	else if (!player.alive) spectateIndex += 1;
});

function onLockChange(locked) {
	if (locked) { overlay.hidden = true; return; }
	if (hud.buyVisible || shot) return;
	overlay.hidden = false;
	if (matchStarted && state.round.phase !== 'over') {
		overlayCopy.textContent = 'Paused. The match goes on around you: click DEPLOY to return.';
		playButton.textContent = 'RESUME';
	}
}

// Precompile every shader the match can use (world, figures, weapon, effects, lights at zero),
// so the first shot, first kill and first explosion never stall on a compile.
renderer.compile(scene, camera);
renderer.compile(viewmodel.scene, viewmodel.camera);

const look = { x: 0, y: 0 };
const camPos = new THREE.Vector3();
const forward = new THREE.Vector3();
const muzzle = new THREE.Vector3();
let accumulator = 0;
let lastTime = performance.now();
let fpsFrames = 0; let fpsTime = 0;
let fov = BASE_FOV;

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	viewmodel.camera.aspect = camera.aspect;
	viewmodel.camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});
viewmodel.camera.aspect = camera.aspect;
viewmodel.camera.updateProjectionMatrix();

// Who the camera follows: the player, or a living teammate while the player is dead.
function viewTarget() {
	if (player.alive || !matchStarted) return player;
	const mates = state.actors.filter((a) => a.alive && a.team === player.team && !a.isPlayer);
	if (mates.length === 0) return player;
	return mates[spectateIndex % mates.length];
}

function drainEvents() {
	state.events.drain((e) => {
		if (e.type === 'shot' || e.type === 'step' || e.type === 'land') hear(state, e);
		if (e.type === 'shot' && e.actor === player.id) viewmodel.fire();
		effects.onEvent(e, state, player.alive ? player.id : -1, muzzle);
		audio.onEvent(e, player.id);
		switch (e.type) {
			case 'hit': if (e.other === player.id && e.actor !== player.id) hud.hitMarker(e.head); break;
			case 'kill': hud.feed(state.actors[e.other] ?? null, state.actors[e.actor], e.weapon, e.head, player.id); break;
			case 'roundStart':
				hud.message(e.flag ? 'Halftime: sides swap' : `Round ${e.amount}`, player.team === TEAM.RAIDERS ? 'Raiders: buy (B), then take a pump station' : 'Wardens: buy (B), then hold Pump A and Pump B', 3);
				viewmodel.setSleeve(player.team === TEAM.RAIDERS ? PALETTE.raidersDark : PALETTE.wardensDark);
				spectateIndex = 0;
				break;
			case 'live': hud.message('Go', '', 1); control.toggleBuy(state, player, false); break;
			case 'planted': hud.message(`Charge armed at Pump ${e.text}`, player.team === TEAM.WARDENS ? 'Retake the site and cut it' : 'Hold the site for 40 seconds', 3); break;
			case 'defused': hud.message('Charge cut', '', 2); break;
			case 'chargeDropped': if (player.team === TEAM.RAIDERS) hud.message('', 'The charge was dropped', 1.5); break;
			case 'roundEnd': {
				const won = e.amount === player.squad;
				hud.message(won ? 'Round won' : 'Round lost', e.text, 5);
				audio.roundEnd(won);
				break;
			}
			case 'matchOver': {
				const won = state.round.matchWinner === player.squad;
				input.exitLock();
				overlay.hidden = false;
				overlayCopy.textContent = `${won ? 'Victory' : 'Defeat'}, ${state.round.scores[player.squad]} to ${state.round.scores[1 - player.squad]}. You: ${player.kills} kills, ${player.deaths} deaths.`;
				playButton.textContent = 'PLAY AGAIN';
				break;
			}
			default:
		}
	});
}

// Mouse look and the fixed-step simulation for one display frame.
function simulate(dt) {
	input.takeLook(look);
	if (!matchStarted || state.round.phase === 'over') return 1;
	if (player.alive) {
		const slot = player.active === 1 ? player.primary : player.sidearm;
		const zoom = player.scoped && slot.def?.zoom ? slot.def.zoom : 1;
		player.yaw += look.x / zoom;
		player.pitch = Math.max(-1.52, Math.min(1.52, player.pitch - look.y / zoom));
	}
	accumulator += dt;
	let steps = 0;
	while (accumulator >= DT && steps < 8) {
		control.apply(state, player);
		game.tick();
		accumulator -= DT;
		steps += 1;
	}
	if (steps === 8) accumulator = 0;
	return accumulator / DT;
}

// Everything the frame shows, at interpolation alpha: camera, figures, weapon, effects, HUD.
function present(dt, alpha) {
	state.viewAlpha = alpha;
	const viewer = viewTarget();
	const spectating = viewer !== player;
	bodies.update(state, alpha, state.time - DT + alpha * DT, player.alive && !spectating);
	camPos.lerpVectors(viewer.prevPos, viewer.pos, alpha);
	if (spectating) {
		// Over the shoulder of a teammate.
		viewDirection(viewer.yaw, -0.18, forward);
		camera.position.set(camPos.x - forward.x * 2.6, camPos.y + 2.1, camPos.z - forward.z * 2.6);
		camera.rotation.set(-0.22, -viewer.yaw, 0);
	} else {
		camera.position.set(camPos.x, camPos.y + eyeHeight(player), camPos.z);
		camera.rotation.set(player.pitch + player.punchPitch, -(player.yaw + player.punchYaw), 0);
	}
	const shake = effects.update(dt, state, camera, renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
	if (shake > 0) {
		camera.rotation.x += (Math.random() - 0.5) * shake * 0.03;
		camera.rotation.y += (Math.random() - 0.5) * shake * 0.03;
	}
	const slot = player.active === 1 ? player.primary : player.sidearm;
	const targetFov = !spectating && player.scoped && slot.def?.zoom ? BASE_FOV / slot.def.zoom : BASE_FOV;
	fov += (targetFov - fov) * Math.min(1, dt * 18);
	if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
	state.fovRad = (camera.fov * Math.PI) / 180;
	viewDirection(viewer.yaw, viewer.pitch, forward);
	audio.setListener(camera.position, forward);

	// Weapon pose, then the muzzle point for this frame's tracers.
	const def = slot.def ?? WEAPONS.hornet;
	let modelKey = player.sidearm.def?.model ?? 'pistol';
	if (player.active === 4) modelKey = 'grenade';
	else if (player.active === 5) modelKey = 'charge';
	else if (player.active === 1 && player.primary.def) modelKey = player.primary.def.model;
	viewmodel.update(dt, {
		modelKey,
		visible: player.alive && !spectating,
		speed: Math.hypot(player.vel.x, player.vel.z),
		onGround: player.onGround,
		reload: player.reloading > 0 ? 1 - player.reloading / def.reload : -1,
		switching: Math.max(0, player.switching / 0.42),
		lookX: look.x, lookY: look.y,
		scoped: player.scoped,
		crouch: player.crouchAmount,
	});
	viewmodel.muzzleWorld(camera, muzzle);
	drainEvents();
	hud.update(state, player, viewer, dt, spectating);
	return spectating;
}

function draw(spectating) {
	renderer.clear();
	renderer.render(scene, camera);
	if (player.alive && !spectating && !player.scoped) {
		renderer.clearDepth();
		renderer.render(viewmodel.scene, viewmodel.camera);
	}
}

function frame(now) {
	const dt = Math.min(0.1, (now - lastTime) / 1000);
	lastTime = now;
	const alpha = simulate(dt);
	draw(present(dt, alpha));
	fpsFrames += 1; fpsTime += dt;
	if (fpsTime >= 0.5) { hud.showFps(Math.round(fpsFrames / fpsTime)); fpsFrames = 0; fpsTime = 0; }
	requestAnimationFrame(frame);
}

if (shot) {
	// Capture mode, driven by tools/shoot.mjs: the tool stages a scene through this hook with the
	// game's own systems, runs its scripted ticks here at a fixed step, and this draws the result.
	overlay.hidden = true;
	matchStarted = true;
	window.__saltline = {
		game, hud,
		capture(plan) {
			let spectating = false;
			for (let i = 0; i < plan.ticks; i += 1) { plan.script(i); game.tick(); spectating = present(DT, 1); }
			hud.message('', '', 0);
			draw(present(0, 1));
			window.__shotReady = true;
		},
	};
} else {
	requestAnimationFrame(frame);
}
