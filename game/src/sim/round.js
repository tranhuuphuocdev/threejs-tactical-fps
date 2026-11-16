// The round and the match: freeze and buy, the live round, the planted fuse, the end of round
// pause, round-win money and the loss streak, sides swapping at halftime, and the match point.
import { ROUND, ECONOMY, TEAM } from '../config.js';
import { CELL, ROWS } from '../map/layout.js';
import { giveWeapon } from '../core/actors.js';

const SPAWNS = { T: [], D: [] };
ROWS.forEach((row, r) => {
	for (let c = 0; c < row.length; c += 1) if (row[c] === 'T' || row[c] === 'D') SPAWNS[row[c]].push([c, r]);
});

export function createRound() {
	return {
		number: 0, phase: 'freeze', timer: 0, elapsed: 0,
		scores: [0, 0],             // by squad
		lossStreak: [0, 0],         // by squad
		winner: -1, reason: '', matchWinner: -1,
		squadSide: [TEAM.RAIDERS, TEAM.WARDENS],
	};
}

// Spread five spawn points through a side's spawn yard, shuffled by the match RNG.
function spawnPoints(state, letter) {
	const cells = SPAWNS[letter].slice();
	for (let i = cells.length - 1; i > 0; i -= 1) {
		const j = Math.floor(state.random() * (i + 1));
		[cells[i], cells[j]] = [cells[j], cells[i]];
	}
	const picked = [];
	for (const cell of cells) {
		if (picked.every((p) => Math.abs(p[0] - cell[0]) + Math.abs(p[1] - cell[1]) >= 2)) picked.push(cell);
		if (picked.length === 5) break;
	}
	return picked;
}

function resetForRound(state, actor, cell, firstRound) {
	if (!actor.alive || firstRound) {
		actor.primary.def = null;
		giveWeapon(actor.sidearm, 'hornet');
		actor.armor = 0; actor.helmet = false; actor.kit = false;
		actor.grenades.frag = 0; actor.grenades.smoke = 0; actor.grenades.flash = 0;
	} else {
		if (actor.primary.def) giveWeapon(actor.primary, actor.primary.def.id);
		giveWeapon(actor.sidearm, actor.sidearm.def.id);
	}
	actor.alive = true;
	actor.health = 100;
	actor.pos.set((cell[0] + 0.5) * CELL, 0, (cell[1] + 0.5) * CELL);
	actor.prevPos.copy(actor.pos);
	actor.viewPos.copy(actor.pos);
	actor.vel.set(0, 0, 0);
	actor.yaw = actor.team === TEAM.RAIDERS ? 0 : Math.PI;
	actor.prevYaw = actor.yaw;
	actor.pitch = 0; actor.punchPitch = 0; actor.punchYaw = 0; actor.shotsFired = 0;
	actor.crouching = false; actor.crouchAmount = 0;
	actor.active = actor.primary.def ? 1 : 2;
	actor.cooldown = 0; actor.reloading = 0; actor.switching = 0; actor.scoped = false; actor.rescope = 0;
	actor.hasCharge = false; actor.using = 0; actor.flash = 0;
	actor.roundKills = 0; actor.roundDamage = 0;
	actor.lastAttacker = -1;
}

export function startRound(state) {
	const round = state.round;
	const first = round.number === 0;
	const half = round.number === ROUND.halftimeAfter;
	if (half) {
		round.squadSide.reverse();
		round.lossStreak[0] = 0; round.lossStreak[1] = 0;
	}
	round.number += 1;
	round.phase = 'freeze';
	round.timer = ROUND.freezeTime;
	round.elapsed = 0;
	round.winner = -1;
	round.reason = '';

	const points = { T: spawnPoints(state, 'T'), D: spawnPoints(state, 'D') };
	const used = { T: 0, D: 0 };
	for (const a of state.actors) {
		a.team = round.squadSide[a.squad];
		if (first || half) a.money = ECONOMY.start;
		const letter = a.team === TEAM.RAIDERS ? 'T' : 'D';
		resetForRound(state, a, points[letter][used[letter]++], first || half);
	}
	const raiders = state.actors.filter((a) => a.team === TEAM.RAIDERS);
	const carrier = raiders.find((a) => a.isPlayer) ?? raiders[Math.floor(state.random() * raiders.length)];
	carrier.hasCharge = true;
	const c = state.charge;
	c.state = 'carried'; c.carrier = carrier.id; c.site = ''; c.fuse = 0; c.defuser = -1; c.planter = -1;
	state.grenades.clear();
	const e = state.events.emit('roundStart');
	e.amount = round.number; e.flag = half;
}

export function stepRound(state, dt) {
	const round = state.round;
	round.timer -= dt;
	if (round.phase === 'freeze') {
		if (round.timer <= 0) {
			round.phase = 'live';
			round.timer = ROUND.roundTime;
			round.elapsed = 0;
			state.events.emit('live');
		}
		return;
	}
	if (round.phase === 'live' || round.phase === 'planted') {
		round.elapsed += dt;
		const raidersAlive = state.actors.some((a) => a.alive && a.team === TEAM.RAIDERS);
		const wardensAlive = state.actors.some((a) => a.alive && a.team === TEAM.WARDENS);
		if (round.phase === 'live') {
			if (!raidersAlive) endRound(state, TEAM.WARDENS, 'Raiders eliminated');
			else if (!wardensAlive) endRound(state, TEAM.RAIDERS, 'Wardens eliminated');
			else if (round.timer <= 0) endRound(state, TEAM.WARDENS, 'Time ran out');
		}
		return;
	}
	if (round.phase === 'post' && round.timer <= 0) {
		if (round.matchWinner >= 0) { round.phase = 'over'; state.events.emit('matchOver'); return; }
		startRound(state);
	}
}

// End the round: winner is a side (TEAM.*). Pays both squads and checks the match.
export function endRound(state, winnerSide, reason) {
	const round = state.round;
	if (round.phase === 'post' || round.phase === 'over') return;
	const winSquad = round.squadSide[0] === winnerSide ? 0 : 1;
	const loseSquad = 1 - winSquad;
	round.phase = 'post';
	round.timer = ROUND.postTime;
	round.winner = winSquad;
	round.reason = reason;
	round.scores[winSquad] += 1;
	round.lossStreak[winSquad] = 0;
	const lossPay = Math.min(ECONOMY.lossMax, ECONOMY.lossBase + ECONOMY.lossStep * round.lossStreak[loseSquad]);
	round.lossStreak[loseSquad] += 1;
	const objective = reason.startsWith('Pump') || reason.startsWith('Charge') || reason.startsWith('Time');
	const planted = state.charge.state === 'planted' || state.charge.state === 'exploded' || state.charge.state === 'defused';
	for (const a of state.actors) {
		let pay = a.squad === winSquad ? (objective ? ECONOMY.winObjective : ECONOMY.winElimination) : lossPay;
		if (a.squad === loseSquad && a.team === TEAM.RAIDERS && planted) pay += ECONOMY.plantedLossTeamBonus;
		a.money = Math.min(ECONOMY.max, a.money + pay);
	}
	if (round.scores[winSquad] >= ROUND.winsToTakeMatch) round.matchWinner = winSquad;
	const e = state.events.emit('roundEnd');
	e.amount = winSquad; e.text = reason; e.other = winnerSide;
}
