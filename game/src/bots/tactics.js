// Team plans. At each freeze the Raiders pick a site and split across its two lanes (with one
// lurker through mid), and the Wardens spread over both sites and mid. During the round the
// Wardens rotate toward a site once the intel board shows Raiders committing to it, Raiders rush
// the site late in the round, a dropped charge is fetched, and after the plant both teams
// converge on it. Bots also buy here, by the same shop rules as the player.
import { TEAM } from '../config.js';
import { CELL, LANES, POSTS } from '../map/layout.js';
import { buy } from '../sim/shop.js';
import { siteAt } from '../sim/objective.js';

export function createTactics() {
	return { site: 'A', rotateTo: '', rushed: false, think: 0 };
}

const toPoint = ([c, r]) => ({ x: (c + 0.5) * CELL, z: (r + 0.5) * CELL });

// Plant spots: two per site, chosen behind cover.
const PLANT_SPOTS = { A: [[5, 5], [7, 2]], B: [[33, 5], [32, 2]] };

function bestBuy(state, bot) {
	const m = bot.money;
	const b = (id) => buy(state, bot, id);
	if (m >= 3700) {
		const sniper = m >= 6200 && state.random() < 0.18;
		b(sniper ? 'longwatch' : state.random() < 0.55 ? 'kestrel' : 'harrow');
		b('helmet');
	} else if (m >= 2100) {
		b('wasp'); b('vest');
	} else if (m >= 1500 && state.round.number > 1) {
		b('anvil'); b('vest');
	}
	// Utility with what is left, keeping a little back.
	if (bot.money >= 600) b(state.random() < 0.5 ? 'smoke' : 'flash');
	if (bot.money >= 500) b('frag');
	if (bot.team === TEAM.WARDENS && bot.money >= 900) b('kit');
}

export function planRound(state) {
	const t = state.tactics;
	t.site = state.random() < 0.5 ? 'A' : 'B';
	t.rotateTo = '';
	t.rushed = false;
	const raiders = state.actors.filter((a) => a.team === TEAM.RAIDERS && a.brain);
	const wardens = state.actors.filter((a) => a.team === TEAM.WARDENS && a.brain);
	const side = t.site;
	raiders.forEach((bot, i) => {
		const brain = bot.brain;
		const lane = i === raiders.length - 1 && raiders.length > 2 ? LANES.mid
			: i % 2 === 0 ? LANES[side].long : LANES[side].short;
		setRoute(brain, lane, side);
		brain.role = 'attack';
	});
	const order = ['A', 'B', 'A', 'B', 'mid'];
	wardens.forEach((bot, i) => {
		const area = order[i % order.length];
		const posts = POSTS[area];
		const post = posts[Math.floor(state.random() * posts.length)];
		bot.brain.post = { ...toPoint(post), yaw: post[2] };
		bot.brain.area = area;
		bot.brain.role = 'defend';
		bot.brain.route.length = 0;
	});
	for (const bot of [...raiders, ...wardens]) bestBuy(state, bot);
}

function setRoute(brain, lane, site) {
	brain.route.length = 0;
	for (const cell of lane) brain.route.push(toPoint(cell));
	brain.routeIdx = 0;
	brain.site = site;
}

export function plantSpot(site, index) {
	return toPoint(PLANT_SPOTS[site][index % 2]);
}

// Team-level updates, twice a second.
export function stepTactics(state, dt) {
	const t = state.tactics;
	t.think -= dt;
	if (t.think > 0) return;
	t.think = 0.5;
	const round = state.round;
	if (round.phase !== 'live') return;

	// Wardens: rotate to a site where two or more Raiders were seen in the last few seconds.
	const board = state.intel[TEAM.WARDENS];
	const seen = { A: 0, B: 0 };
	for (const a of state.actors) {
		if (a.team !== TEAM.RAIDERS || !a.alive) continue;
		const s = board[a.id];
		if (state.time - s.t > 5) continue;
		const site = siteAt(s.x, s.z) || nearSite(s.x, s.z);
		if (site) seen[site] += 1;
	}
	const hot = seen.A >= 2 ? 'A' : seen.B >= 2 ? 'B' : '';
	if (hot && t.rotateTo !== hot) {
		t.rotateTo = hot;
		for (const bot of state.actors) {
			if (!bot.brain || bot.team !== TEAM.WARDENS || !bot.alive) continue;
			if (bot.brain.area === hot) continue;
			const posts = POSTS[hot];
			const post = posts[bot.id % posts.length];
			bot.brain.post = { ...toPoint(post), yaw: post[2] };
			bot.brain.area = hot;
		}
	}

	// Raiders: late in the round, everyone goes straight for the site.
	if (!t.rushed && round.timer < 40) {
		t.rushed = true;
		for (const bot of state.actors) {
			if (bot.brain && bot.team === TEAM.RAIDERS && bot.alive) bot.brain.routeIdx = bot.brain.route.length;
		}
	}
}

// Within the lanes' last stretch before a site (the area a defender would call "on A").
function nearSite(x, z) {
	const r = z / CELL; const c = x / CELL;
	if (r < 13 && c < 14) return 'A';
	if (r < 13 && c > 25) return 'B';
	return '';
}

