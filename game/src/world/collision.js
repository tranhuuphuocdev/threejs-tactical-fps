// The solid world as axis-aligned boxes, merged from the map's cells, with a uniform grid for
// broad-phase queries. One job: answer "where can a body stand" and "what does a ray hit".
// Bodies are vertical boxes (radius, height) moved per axis so they slide along walls.
import { CELL, ROWS, COLS, DEPTH, SOLID_HEIGHT, OUTER_WALL_HEIGHT } from '../map/layout.js';
import { MOVE } from '../config.js';

function isBorder(c, r) {
	return c === 0 || r === 0 || c === COLS - 1 || r === DEPTH - 1;
}

// Greedy rectangle merge of equal-height solid cells, so a long wall is one box, not twenty.
function mergeCells() {
	const used = ROWS.map((row) => new Uint8Array(row.length));
	const rects = [];
	for (let r = 0; r < DEPTH; r += 1) {
		for (let c = 0; c < COLS; c += 1) {
			const ch = ROWS[r][c];
			if (used[r][c] || !(ch in SOLID_HEIGHT)) continue;
			const border = isBorder(c, r);
			const same = (cc, rr) => !used[rr][cc] && ROWS[rr][cc] === ch && isBorder(cc, rr) === border;
			let c1 = c;
			while (c1 + 1 < COLS && same(c1 + 1, r)) c1 += 1;
			let r1 = r;
			for (;;) {
				if (r1 + 1 >= DEPTH) break;
				let full = true;
				for (let k = c; k <= c1; k += 1) if (!same(k, r1 + 1)) { full = false; break; }
				if (!full) break;
				r1 += 1;
			}
			for (let rr = r; rr <= r1; rr += 1) for (let k = c; k <= c1; k += 1) used[rr][k] = 1;
			rects.push({ ch, c0: c, r0: r, c1, r1, border });
		}
	}
	return rects;
}

export function createCollisionWorld() {
	const boxes = mergeCells().map((rect) => ({
		minX: rect.c0 * CELL,
		maxX: (rect.c1 + 1) * CELL,
		minZ: rect.r0 * CELL,
		maxZ: (rect.r1 + 1) * CELL,
		minY: 0,
		maxY: rect.border ? OUTER_WALL_HEIGHT : SOLID_HEIGHT[rect.ch],
		kind: rect.ch,
	}));

	// Broad phase: every cell lists the boxes overlapping it.
	const grid = Array.from({ length: COLS * DEPTH }, () => []);
	boxes.forEach((box, index) => {
		for (let r = Math.floor(box.minZ / CELL); r < Math.ceil(box.maxZ / CELL); r += 1) {
			for (let c = Math.floor(box.minX / CELL); c < Math.ceil(box.maxX / CELL); c += 1) grid[r * COLS + c].push(index);
		}
	});

	const stamp = new Uint32Array(boxes.length);
	let query = 0;
	const found = [];

	// Boxes overlapping an XZ rectangle, each once (stamped by query number, no Set per call).
	function gather(minX, minZ, maxX, maxZ) {
		query += 1;
		found.length = 0;
		const c0 = Math.max(0, Math.floor(minX / CELL));
		const c1 = Math.min(COLS - 1, Math.floor(maxX / CELL));
		const r0 = Math.max(0, Math.floor(minZ / CELL));
		const r1 = Math.min(DEPTH - 1, Math.floor(maxZ / CELL));
		for (let r = r0; r <= r1; r += 1) {
			for (let c = c0; c <= c1; c += 1) {
				const list = grid[r * COLS + c];
				for (let i = 0; i < list.length; i += 1) {
					const b = list[i];
					if (stamp[b] !== query) { stamp[b] = query; found.push(boxes[b]); }
				}
			}
		}
		return found;
	}

	function overlaps(box, x, y, z, radius, height) {
		return x + radius > box.minX && x - radius < box.maxX
			&& z + radius > box.minZ && z - radius < box.maxZ
			&& y + height > box.minY && y < box.maxY;
	}

	// Move a body by its velocity for dt. body: { pos: Vector3 (feet), vel: Vector3, onGround }.
	// Resolves X, then Z, then Y; a short ledge (stepHeight) is climbed instead of blocking.
	function moveBody(body, radius, height, dt) {
		const p = body.pos;
		const v = body.vel;
		for (let axis = 0; axis < 2; axis += 1) {
			const delta = (axis === 0 ? v.x : v.z) * dt;
			if (delta === 0) continue;
			if (axis === 0) p.x += delta; else p.z += delta;
			const list = gather(p.x - radius, p.z - radius, p.x + radius, p.z + radius);
			for (let i = 0; i < list.length; i += 1) {
				const box = list[i];
				if (!overlaps(box, p.x, p.y, p.z, radius, height)) continue;
				const rise = box.maxY - p.y;
				if (body.onGround && rise > 0 && rise <= MOVE.stepHeight && !blockedAbove(p.x, box.maxY, p.z, radius, height)) {
					p.y = box.maxY;
					continue;
				}
				if (axis === 0) {
					p.x = delta > 0 ? box.minX - radius - 1e-4 : box.maxX + radius + 1e-4;
					v.x = 0;
				} else {
					p.z = delta > 0 ? box.minZ - radius - 1e-4 : box.maxZ + radius + 1e-4;
					v.z = 0;
				}
			}
		}
		p.y += v.y * dt;
		body.onGround = false;
		if (p.y <= 0) { p.y = 0; if (v.y < 0) v.y = 0; body.onGround = true; }
		const list = gather(p.x - radius, p.z - radius, p.x + radius, p.z + radius);
		for (let i = 0; i < list.length; i += 1) {
			const box = list[i];
			if (!overlaps(box, p.x, p.y, p.z, radius, height)) continue;
			if (v.y <= 0 && p.y > box.maxY - 0.6) {
				p.y = box.maxY; v.y = 0; body.onGround = true;
			} else if (v.y > 0) {
				p.y = box.minY - height; v.y = 0;
			}
		}
		// Standing on a box: still supported if one is right under the feet.
		if (!body.onGround && v.y <= 0) {
			for (let i = 0; i < list.length; i += 1) {
				const box = list[i];
				if (Math.abs(p.y - box.maxY) < 0.02 && p.x + radius > box.minX && p.x - radius < box.maxX
					&& p.z + radius > box.minZ && p.z - radius < box.maxZ) { body.onGround = true; break; }
			}
		}
	}

	function blockedAbove(x, y, z, radius, height) {
		const list = gather(x - radius, z - radius, x + radius, z + radius);
		for (let i = 0; i < list.length; i += 1) if (overlaps(list[i], x, y + 0.01, z, radius, height)) return true;
		return false;
	}

	// Can a body of this size stand here? Used to stand up from a crouch.
	function fits(x, y, z, radius, height) {
		return !blockedAbove(x, y - 0.01, z, radius, height);
	}

	// Ray against the boxes and the ground. Returns the distance (or Infinity) and fills normal.
	// Walks the grid cells along the ray (DDA), testing each cell's boxes once.
	function raycast(ox, oy, oz, dx, dy, dz, maxDist, normal) {
		let best = maxDist;
		let hit = false;
		let nx = 0; let ny = 0; let nz = 0;
		if (dy < 0) {
			const t = -oy / dy;
			if (t >= 0 && t < best) { best = t; hit = true; nx = 0; ny = 1; nz = 0; }
		}
		query += 1;
		let c = Math.floor(ox / CELL);
		let r = Math.floor(oz / CELL);
		const stepC = dx > 0 ? 1 : -1;
		const stepR = dz > 0 ? 1 : -1;
		const tDeltaC = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
		const tDeltaR = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
		let tMaxC = dx !== 0 ? ((dx > 0 ? (c + 1) * CELL - ox : ox - c * CELL) / Math.abs(dx)) : Infinity;
		let tMaxR = dz !== 0 ? ((dz > 0 ? (r + 1) * CELL - oz : oz - r * CELL) / Math.abs(dz)) : Infinity;
		let tCell = 0;
		while (tCell <= best && c >= 0 && r >= 0 && c < COLS && r < DEPTH) {
			const list = grid[r * COLS + c];
			for (let i = 0; i < list.length; i += 1) {
				const b = list[i];
				if (stamp[b] === query) continue;
				stamp[b] = query;
				const box = boxes[b];
				if (slab(box, ox, oy, oz, dx, dy, dz, best) && slabOut.t < best) {
					best = slabOut.t; hit = true;
					nx = slabOut.axis === 0 ? slabOut.sign : 0;
					ny = slabOut.axis === 1 ? slabOut.sign : 0;
					nz = slabOut.axis === 2 ? slabOut.sign : 0;
				}
			}
			if (tMaxC < tMaxR) { tCell = tMaxC; tMaxC += tDeltaC; c += stepC; } else { tCell = tMaxR; tMaxR += tDeltaR; r += stepR; }
		}
		if (normal) normal.set(nx, ny, nz);
		return hit ? best : Infinity;
	}

	// Slab test of one box, no allocation: writes the entry distance, axis and face sign to slabOut.
	const slabOut = { t: 0, axis: -1, sign: 0 };
	function slabAxis(o, d, mn, mx, k) {
		if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
		let t1 = (mn - o) / d;
		let t2 = (mx - o) / d;
		let s = -1;
		if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
		if (t1 > slabOut.t) { slabOut.t = t1; slabOut.axis = k; slabOut.sign = s; }
		if (t2 < slabTmax) slabTmax = t2;
		return slabOut.t <= slabTmax;
	}
	let slabTmax = 0;
	function slab(box, ox, oy, oz, dx, dy, dz, maxT) {
		slabOut.t = 0; slabOut.axis = -1; slabOut.sign = 0; slabTmax = maxT;
		return slabAxis(ox, dx, box.minX, box.maxX, 0)
			&& slabAxis(oy, dy, box.minY, box.maxY, 1)
			&& slabAxis(oz, dz, box.minZ, box.maxZ, 2)
			&& slabOut.axis >= 0;
	}

	function segmentClear(ax, ay, az, bx, by, bz) {
		const dx = bx - ax; const dy = by - ay; const dz = bz - az;
		const len = Math.hypot(dx, dy, dz);
		if (len < 1e-6) return true;
		return raycast(ax, ay, az, dx / len, dy / len, dz / len, len, null) >= len - 1e-3;
	}

	return { boxes, moveBody, raycast, segmentClear, fits };
}
