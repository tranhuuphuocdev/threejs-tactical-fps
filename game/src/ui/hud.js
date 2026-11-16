// The heads-up display, in the DOM over the canvas. Every field is written only when its value
// changes (a cached last value per element), so the HUD costs nothing on a quiet frame and never
// forces a layout during a firefight. Also: the kill feed, the buy menu, the scoreboard, the
// minimap (a pre-rendered map layer plus dots), hit and damage indicators, flash and scope.
import { TEAM, TEAM_NAME, WEAPONS, ROUND, GRENADES } from '../config.js';
import { CATALOG, priceOf, nameOf, refusal, buyOpen } from '../sim/shop.js';
import { activeSlot } from '../core/actors.js';
import { ROWS, COLS, DEPTH, CELL, calloutAt } from '../map/layout.js';
import { PALETTE } from '../palette.js';
import { inaccuracy } from '../sim/weapons.js';

const $ = (id) => document.getElementById(id);
const FEED_ROWS = 5;

function fmtTime(t) {
	const s = Math.max(0, Math.ceil(t));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud(actors, onBuy) {
	const el = {
		health: $('hp'), armor: $('ap'), money: $('money'), mag: $('mag'), reserve: $('reserve'), weapon: $('weapon-name'),
		timer: $('timer'), round: $('round-no'), scoreUs: $('score-us'), scoreThem: $('score-them'),
		sideUs: $('side-us'), sideThem: $('side-them'), pipsUs: $('pips-us'), pipsThem: $('pips-them'),
		feed: $('feed'), center: $('center-msg'), centerSub: $('center-sub'), progress: $('progress'), progressFill: $('progress-fill'),
		progressLabel: $('progress-label'), crosshair: $('crosshair'), hitmarker: $('hitmarker'), damage: $('damage-ring'),
		flash: $('flash'), scope: $('scope'), buy: $('buy'), buyList: $('buy-list'), buyMoney: $('buy-money'), buyNote: $('buy-note'),
		board: $('board'), boardBody: $('board-body'), hint: $('hint'), radio: $('radio'), radioWho: $('radio-who'), radioText: $('radio-text'), place: $('place'), spectate: $('spectate'),
		grenades: $('nades'), charge: $('charge-icon'), timerBox: $('timer-box'), vignette: $('vignette'), fps: $('fps'),
	};
	const last = new Map();
	function set(node, key, value, prop = 'textContent') {
		if (last.get(key) === value) return;
		last.set(key, value);
		if (prop === 'textContent') node.textContent = value;
		else if (prop === 'class') node.className = value;
		else if (prop === 'hidden') node.hidden = value;
		else node.style.setProperty(prop, value);
	}

	const pips = [el.pipsUs, el.pipsThem].map((box) => Array.from({ length: 5 }, () => {
		const i = document.createElement('i'); box.appendChild(i); return i;
	}));
	const feedRows = Array.from({ length: FEED_ROWS }, () => {
		const row = document.createElement('div'); row.className = 'feed-row'; row.hidden = true;
		row.innerHTML = '<b class="k"></b><span class="w"></span><b class="v"></b>';
		el.feed.appendChild(row);
		return { row, k: row.children[0], w: row.children[1], v: row.children[2], t: -99 };
	});
	let feedNext = 0;

	const buyRows = CATALOG.map((item) => {
		const b = document.createElement('button');
		b.type = 'button'; b.className = 'buy-item';
		const stat = WEAPONS[item.id] ? `${WEAPONS[item.id].damage} dmg · ${Math.round(60 / WEAPONS[item.id].interval)} rpm · ${WEAPONS[item.id].mag} rds`
			: GRENADES[item.id] ? 'utility' : 'gear';
		b.innerHTML = `<kbd>${item.key}</kbd><span class="n">${nameOf(item.id)}</span><span class="s">${stat}</span><span class="p">$${priceOf(item.id)}</span>`;
		b.addEventListener('click', () => onBuy(item.id));
		el.buyList.appendChild(b);
		return { item, b };
	});

	const boardRows = actors.map(() => {
		const tr = document.createElement('tr');
		tr.innerHTML = '<td class="n"></td><td></td><td></td><td></td><td></td>';
		el.boardBody.appendChild(tr);
		return tr;
	});

	const mini = $('minimap'); const mctx = mini.getContext('2d');
	const scale = mini.width / (COLS * CELL);
	const base = document.createElement('canvas'); base.width = mini.width; base.height = mini.height;
	const bctx = base.getContext('2d');
	bctx.fillStyle = 'rgba(20,24,28,0.82)'; bctx.fillRect(0, 0, base.width, base.height);
	for (let r = 0; r < DEPTH; r += 1) {
		for (let c = 0; c < COLS; c += 1) {
			const ch = ROWS[r][c];
			bctx.fillStyle = ch === '#' ? '#0b0d0f' : ch === 'C' || ch === 'c' ? '#6d5a40' : ch === 'a' || ch === 'b' ? '#6b4a2c' : '#4a4f52';
			bctx.fillRect(c * CELL * scale, r * CELL * scale, CELL * scale + 0.5, CELL * scale + 0.5);
		}
	}
	bctx.fillStyle = PALETTE.accent; bctx.font = '700 13px system-ui, sans-serif'; bctx.textAlign = 'center';
	bctx.fillText('A', 6 * CELL * scale, 5 * CELL * scale); bctx.fillText('B', 34 * CELL * scale, 5 * CELL * scale);
	let miniT = 0;

	function drawMinimap(state, viewer) {
		mctx.drawImage(base, 0, 0);
		const board = state.intel[viewer.team];
		for (const a of actors) {
			if (!a.alive) continue;
			const ally = a.team === viewer.team;
			if (!ally && state.time - board[a.id].t > 2) continue;
			const x = (ally ? a.pos.x : board[a.id].x) * scale; const z = (ally ? a.pos.z : board[a.id].z) * scale;
			mctx.fillStyle = ally ? (a === viewer ? '#ffffff' : (a.team === TEAM.RAIDERS ? PALETTE.raiders : PALETTE.wardens)) : '#ff3b2f';
			mctx.beginPath(); mctx.arc(x, z, a === viewer ? 3.6 : 3, 0, Math.PI * 2); mctx.fill();
			if (a === viewer) {
				mctx.strokeStyle = '#ffffff'; mctx.lineWidth = 1.5; mctx.beginPath();
				mctx.moveTo(x, z); mctx.lineTo(x + Math.sin(a.yaw) * 9, z - Math.cos(a.yaw) * 9); mctx.stroke();
			}
		}
		const c = state.charge;
		if (c.state === 'dropped' || c.state === 'planted' || (c.state === 'carried' && viewer.team === TEAM.RAIDERS)) {
			const holder = c.state === 'carried' ? actors[c.carrier] : null;
			const x = (holder ? holder.pos.x : c.pos.x) * scale; const z = (holder ? holder.pos.z : c.pos.z) * scale;
			mctx.fillStyle = c.state === 'planted' && Math.floor(state.time * 4) % 2 ? '#ff2a1a' : PALETTE.accent;
			mctx.fillRect(x - 3, z - 3, 6, 6);
		}
	}

	let hitT = 0; let hitHead = false;
	let radioT = 0;
	let messageT = 0;

	function feed(killer, victim, weapon, head, playerId) {
		const r = feedRows[feedNext]; feedNext = (feedNext + 1) % FEED_ROWS;
		r.row.hidden = false; r.t = performance.now();
		r.k.textContent = killer ? killer.name : '';
		r.k.style.color = killer ? (killer.team === TEAM.RAIDERS ? PALETTE.raiders : PALETTE.wardens) : '';
		r.v.textContent = victim.name;
		r.v.style.color = victim.team === TEAM.RAIDERS ? PALETTE.raiders : PALETTE.wardens;
		r.w.textContent = `${WEAPONS[weapon]?.name ?? (weapon === 'frag' ? 'Frag' : weapon === 'charge' ? 'Blast' : weapon)}${head ? ' ◎' : ''}`;
		r.row.classList.toggle('mine', (killer && killer.id === playerId) || victim.id === playerId);
		el.feed.appendChild(r.row); // newest at the bottom
	}

	function message(text, sub = '', seconds = 2.5) {
		el.center.textContent = text; el.centerSub.textContent = sub;
		el.center.parentElement.hidden = false;
		messageT = seconds;
	}

	return {
		feed, message,
		radio(who, text) {
			el.radioWho.textContent = who; el.radioText.textContent = text;
			el.radio.hidden = false; radioT = 3.5;
		},
		hitMarker(head) { hitT = 0.22; hitHead = head; },
		setBuyOpen(open) { set(el.buy, 'buyOpen', !open, 'hidden'); },
		get buyVisible() { return !el.buy.hidden; },
		setBoard(open) { set(el.board, 'board', !open, 'hidden'); },
		showFps(fps) { set(el.fps, 'fps', `${fps} fps`); },

		update(state, player, viewer, dt, spectating) {
			const round = state.round;
			const us = player.squad; const them = 1 - us;
			set(el.scoreUs, 'su', String(round.scores[us]));
			set(el.scoreThem, 'st', String(round.scores[them]));
			set(el.sideUs, 'sdu', TEAM_NAME[round.squadSide[us]]);
			set(el.sideThem, 'sdt', TEAM_NAME[round.squadSide[them]]);
			set(el.sideUs, 'sduc', `side ${round.squadSide[us] === TEAM.RAIDERS ? 'raiders' : 'wardens'}`, 'class');
			set(el.sideThem, 'sdtc', `side ${round.squadSide[them] === TEAM.RAIDERS ? 'raiders' : 'wardens'}`, 'class');
			set(el.round, 'rn', `Round ${round.number}`);
			const planted = round.phase === 'planted';
			set(el.timer, 'tm', planted ? '' : fmtTime(round.timer));
			set(el.timerBox, 'tb', planted ? 'planted' : round.phase === 'freeze' ? 'freeze' : round.timer < 10 && round.phase === 'live' ? 'low' : '', 'class');
			for (let s = 0; s < 2; s += 1) {
				let k = 0;
				for (const a of actors) {
					if (a.squad !== (s === 0 ? us : them)) continue;
					set(pips[s][k], `p${s}${k}`, a.alive ? 'on' : '', 'class'); k += 1;
				}
			}

			const v = viewer;
			set(el.health, 'hp', String(Math.max(0, Math.ceil(v.health))));
			set(el.armor, 'ap', String(Math.ceil(v.armor)));
			set(el.armor.parentElement, 'apc', v.helmet ? 'stat panel helmet' : 'stat panel', 'class');
			set(el.money, 'mo', `$${v.money}`);
			const slot = activeSlot(v);
			if (slot) {
				set(el.mag, 'mg', String(slot.mag));
				set(el.reserve, 'rs', `/ ${slot.reserve}`);
				set(el.weapon, 'wn', v.reloading > 0 ? `${slot.def.name} · reloading` : slot.def.name);
				set(el.mag.parentElement, 'mgc', slot.mag === 0 ? 'ammo empty' : slot.mag <= slot.def.mag * 0.25 ? 'ammo low' : 'ammo', 'class');
			} else {
				set(el.mag, 'mg', v.active === 4 ? String(v.grenades[v.grenadeKind]) : '');
				set(el.reserve, 'rs', '');
				set(el.weapon, 'wn', v.active === 4 ? GRENADES[v.grenadeKind].name : 'Breach charge');
				set(el.mag.parentElement, 'mgc', 'ammo', 'class');
			}
			set(el.grenades, 'nd', `${'●'.repeat(v.grenades.frag)}${'◐'.repeat(v.grenades.flash)}${'○'.repeat(v.grenades.smoke)}`);
			set(el.charge, 'ch', !v.hasCharge, 'hidden');
			set(el.place, 'pl', calloutAt(v.pos.x, v.pos.z));
			set(el.spectate, 'sp', spectating ? `Spectating ${v.name}` : '', 'textContent');
			set(el.spectate, 'sph', !spectating, 'hidden');

			const cone = v.alive ? inaccuracy(v) : 0;
			const px = Math.round(4 + cone * window.innerHeight / (2 * Math.tan(state.fovRad / 2)));
			set(el.crosshair, 'gap', `${Math.min(80, px)}px`, '--gap');
			set(el.crosshair, 'xh', !v.alive || v.scoped || spectating, 'hidden');

			hitT = Math.max(0, hitT - dt);
			set(el.hitmarker, 'hm', hitT > 0 ? (hitHead ? 'on head' : 'on') : '', 'class');

			const since = state.time - v.damageTime;
			if (since < 0.9 && v.lastAttacker >= 0 && !spectating) {
				const rel = v.damageYaw - v.yaw;
				set(el.damage, 'dr', `rotate(${rel.toFixed(2)}rad)`, 'transform');
				set(el.damage, 'do', (1 - since / 0.9).toFixed(2), 'opacity');
			} else set(el.damage, 'do', '0', 'opacity');
			set(el.vignette, 'vg', v.alive && v.health < 35 ? String((1 - v.health / 35) * 0.7) : '0', 'opacity');

			const flash = v.flash > 0 ? Math.min(1, v.flash / Math.max(0.5, v.flashTotal * 0.5)) : 0;
			set(el.flash, 'fl', flash.toFixed(2), 'opacity');
			set(el.scope, 'sc', !v.scoped, 'hidden');

			if (v.using > 0) {
				const total = v.team === TEAM.RAIDERS ? ROUND.plantTime : (v.kit ? ROUND.defuseKitTime : ROUND.defuseTime);
				set(el.progress, 'pg', false, 'hidden');
				set(el.progressFill, 'pf', `${Math.min(100, (v.using / total) * 100).toFixed(1)}%`, 'width');
				set(el.progressLabel, 'plb', v.team === TEAM.RAIDERS ? 'Arming charge' : (v.kit ? 'Cutting wires (kit)' : 'Cutting wires'));
			} else set(el.progress, 'pg', true, 'hidden');

			let hint = '';
			if (!spectating && v.alive) {
				if (buyOpen(state, v) && !this.buyVisible) hint = 'B  buy menu';
				if (v.hasCharge && round.phase === 'live') hint = state.siteAt(v.pos.x, v.pos.z) ? 'Hold E to arm the charge' : 'Carry the charge to Pump A or Pump B';
				if (v.team === TEAM.WARDENS && state.charge.state === 'planted' && Math.hypot(v.pos.x - state.charge.pos.x, v.pos.z - state.charge.pos.z) < 1.6) hint = 'Hold E to cut the charge';
			}
			if (spectating) hint = 'Click: next teammate';
			set(el.hint, 'hi', hint);

			radioT -= dt;
			if (radioT <= 0 && !el.radio.hidden) el.radio.hidden = true;
			messageT -= dt;
			if (messageT <= 0 && !el.center.parentElement.hidden) el.center.parentElement.hidden = true;

			const now = performance.now();
			for (const r of feedRows) if (!r.row.hidden && now - r.t > 6000) r.row.hidden = true;

			miniT -= dt;
			if (miniT <= 0) { miniT = 1 / 20; drawMinimap(state, v); }

			if (!el.buy.hidden) {
				set(el.buyMoney, 'bm', `$${player.money}`);
				const left = round.phase === 'freeze' ? round.timer + ROUND.buyTime : ROUND.buyTime - round.elapsed;
				set(el.buyNote, 'bn', `Buy time ${Math.max(0, Math.ceil(left))} s · keys or click`);
				for (const { item, b } of buyRows) {
					const why = refusal(state, player, item.id);
					set(b, `b${item.id}`, why ? 'buy-item off' : 'buy-item', 'class');
					if (b.title !== why) b.title = why;
				}
			}
			if (!el.board.hidden) {
				const order = actors.slice().sort((a, b) => a.squad - b.squad || b.kills - a.kills);
				order.forEach((a, i) => {
					const tr = boardRows[i];
					const cls = `${a.team === TEAM.RAIDERS ? 'raiders' : 'wardens'}${a.alive ? '' : ' dead'}${a.isPlayer ? ' me' : ''}`;
					if (tr.className !== cls) tr.className = cls;
					const cells = tr.children;
					const vals = [a.name, String(a.kills), String(a.deaths), `$${a.money}`, a.hasCharge ? 'charge' : a.kit ? 'kit' : ''];
					for (let k = 0; k < 5; k += 1) if (cells[k].textContent !== vals[k]) cells[k].textContent = vals[k];
				});
			}
		},
	};
}
