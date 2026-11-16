// Every tuning number of SALTLINE in one place: simulation rate, movement, round rules,
// economy, the arsenal and the bots. Systems read from here; nothing else holds magic numbers.

export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;

export const TEAM = Object.freeze({ RAIDERS: 0, WARDENS: 1 });
export const TEAM_NAME = ['Raiders', 'Wardens'];
export const TEAM_SIZE = 5;

// Raiders attack: they carry the breach charge to a pump station and hold it until it blows.
// Wardens defend: they stop the plant, or cut the charge before its fuse runs out.
export const ROLE = Object.freeze({ ATTACK: 'attack', DEFEND: 'defend' });

export const MOVE = Object.freeze({
	runSpeed: 6.2,          // m/s with a knife-light load; weapons scale it down
	walkFactor: 0.52,       // Shift: quiet and steady
	crouchFactor: 0.34,
	groundAccel: 9.5,       // per second, as a multiple of wish speed (source-style accelerate)
	airAccel: 1.2,
	friction: 7.0,
	stopSpeed: 1.6,
	gravity: 16,
	jumpSpeed: 5.4,
	radius: 0.34,
	standHeight: 1.78,
	crouchHeight: 1.18,
	eyeStand: 1.62,
	eyeCrouch: 1.06,
	crouchRate: 7,          // eye height blend per second
	stepHeight: 0.42,
	footstepSpeed: 3.4,     // above this horizontal speed footsteps are audible
});

export const ROUND = Object.freeze({
	freezeTime: 6,
	buyTime: 20,
	roundTime: 115,
	postTime: 6,
	fuseTime: 40,
	plantTime: 3.2,
	defuseTime: 7,
	defuseKitTime: 3.5,
	winsToTakeMatch: 7,
	halftimeAfter: 6,       // sides swap after this many rounds
});

export const ECONOMY = Object.freeze({
	start: 800,
	max: 16000,
	winElimination: 3250,
	winObjective: 3500,
	lossBase: 1400,
	lossStep: 500,
	lossMax: 3400,
	plantBonus: 300,
	plantedLossTeamBonus: 800,
	defuseBonus: 300,
});

// The arsenal. Damage is per bullet before armour and hit-zone scaling. Spread is in radians of
// cone half-angle. recoil is the climb per shot in radians; sway walks the pattern sideways.
// accurateSpeed: below this horizontal speed (m/s) a shot takes no movement penalty.
export const WEAPONS = Object.freeze({
	hornet: {
		id: 'hornet', name: 'P9 Hornet', slot: 2, price: 200, kill: 300,
		damage: 28, armorPen: 0.5, headMult: 4, range: 30, falloff: 0.82,
		interval: 0.15, auto: false, mag: 13, reserve: 52, reload: 2.1,
		spread: 0.006, moveSpread: 0.045, airSpread: 0.12, crouchMult: 0.8,
		recoil: 0.018, sway: 0.004, recover: 0.11, maxRecoil: 0.08,
		speed: 0.96, accurateSpeed: 2.2, sound: { pitch: 1.35, body: 0.6 }, model: 'pistol',
	},
	anvil: {
		id: 'anvil', name: 'Anvil .50', slot: 2, price: 700, kill: 300,
		damage: 56, armorPen: 0.85, headMult: 4, range: 40, falloff: 0.85,
		interval: 0.32, auto: false, mag: 7, reserve: 35, reload: 2.3,
		spread: 0.005, moveSpread: 0.08, airSpread: 0.2, crouchMult: 0.8,
		recoil: 0.06, sway: 0.01, recover: 0.16, maxRecoil: 0.14,
		speed: 0.92, accurateSpeed: 2.0, sound: { pitch: 0.8, body: 1.1 }, model: 'heavyPistol',
	},
	wasp: {
		id: 'wasp', name: 'Wasp SMG', slot: 1, price: 1250, kill: 600,
		damage: 25, armorPen: 0.6, headMult: 3.2, range: 22, falloff: 0.72,
		interval: 0.075, auto: true, mag: 30, reserve: 120, reload: 2.4,
		spread: 0.012, moveSpread: 0.024, airSpread: 0.14, crouchMult: 0.85,
		recoil: 0.0105, sway: 0.006, recover: 0.13, maxRecoil: 0.1,
		speed: 0.96, accurateSpeed: 3.0, sound: { pitch: 1.2, body: 0.7 }, model: 'smg',
	},
	kestrel: {
		id: 'kestrel', name: 'Kestrel AR', slot: 1, price: 2700, kill: 300,
		damage: 33, armorPen: 0.78, headMult: 4, range: 60, falloff: 0.94,
		interval: 0.1, auto: true, mag: 30, reserve: 90, reload: 2.5,
		spread: 0.0035, moveSpread: 0.11, airSpread: 0.25, crouchMult: 0.75,
		recoil: 0.016, sway: 0.009, recover: 0.12, maxRecoil: 0.16,
		speed: 0.86, accurateSpeed: 1.9, sound: { pitch: 1.0, body: 1.0 }, model: 'rifle',
	},
	harrow: {
		id: 'harrow', name: 'Harrow BR', slot: 1, price: 3100, kill: 300,
		damage: 38, armorPen: 0.86, headMult: 4, range: 70, falloff: 0.96,
		interval: 0.115, auto: true, mag: 25, reserve: 75, reload: 2.8,
		spread: 0.003, moveSpread: 0.12, airSpread: 0.26, crouchMult: 0.72,
		recoil: 0.019, sway: 0.011, recover: 0.12, maxRecoil: 0.18,
		speed: 0.84, accurateSpeed: 1.8, sound: { pitch: 0.88, body: 1.2 }, model: 'battleRifle',
	},
	longwatch: {
		id: 'longwatch', name: 'Longwatch LR', slot: 1, price: 4750, kill: 100,
		damage: 115, armorPen: 0.97, headMult: 2.5, range: 120, falloff: 0.99,
		interval: 1.45, auto: false, mag: 5, reserve: 25, reload: 3.6,
		spread: 0.08, scopedSpread: 0.0006, moveSpread: 0.16, airSpread: 0.35, crouchMult: 0.9,
		recoil: 0.09, sway: 0.0, recover: 0.3, maxRecoil: 0.09,
		speed: 0.78, accurateSpeed: 1.3, zoom: 3.2, sound: { pitch: 0.62, body: 1.6 }, model: 'sniper',
	},
});

export const PRIMARIES = ['wasp', 'kestrel', 'harrow', 'longwatch'];
export const SIDEARMS = ['hornet', 'anvil'];

export const GRENADES = Object.freeze({
	frag: { id: 'frag', name: 'Frag', price: 300, fuse: 1.7, damage: 100, radius: 7.5 },
	smoke: { id: 'smoke', name: 'Smoke', price: 300, fuse: 1.6, duration: 16, radius: 4.6 },
	flash: { id: 'flash', name: 'Flash', price: 200, fuse: 1.4, radius: 22, maxBlind: 3.2 },
});
export const GRENADE_THROW = Object.freeze({ speed: 17, upward: 3.2, bounce: 0.42, friction: 0.7, radius: 0.08 });

export const GEAR = Object.freeze({
	vest: { id: 'vest', name: 'Plate vest', price: 650 },
	helmet: { id: 'helmet', name: 'Vest + helmet', price: 1000 },
	kit: { id: 'kit', name: 'Cutter kit', price: 400, team: ROLE.DEFEND },
});

// Damage taken through armour: the armour soaks (1 - armorPen) of a body hit and loses half of
// what it soaks. A helmet makes head hits armoured too.
export const ARMOR_RATIO = 0.5;

// Hit zones are measured from the feet; a crouch scales them by crouchHeight / standHeight.
export const HITBOX = Object.freeze({
	head: { y: 1.6, r: 0.135, mult: 1 },          // the weapon's headMult applies
	chest: { y0: 1.02, y1: 1.46, r: 0.25, mult: 1 },
	stomach: { y0: 0.82, y1: 1.02, r: 0.23, mult: 1.2 },
	legs: { y0: 0.0, y1: 0.82, r: 0.2, mult: 0.75 },
});

export const BOT = Object.freeze({
	fov: Math.PI * 0.68,      // full cone angle of sight
	sightRange: 70,
	thinkInterval: 0.12,      // seconds between perception passes
	reaction: [0.28, 0.48],   // seconds from first sight to first shot
	aimError: 0.05,           // radians at first sight, shrinking while the target stays in view
	aimSettle: 1.6,           // how fast the error shrinks per second
	burst: [3, 6],
	hearGunshot: 42,
	hearStep: 13,
	turnRate: 7.5,            // radians per second of yaw while not aiming
	memory: 4.5,              // seconds a last-seen position is worth chasing
});
