// Bot navigation: A* over the map's 2 m cells (8-way, no corner cutting), then string-pulled
// with line-of-sight checks so bots walk straight lines instead of staircases. Paths are written
// into caller-owned arrays of points; the search reuses typed arrays and never allocates per node.
import { CELL, ROWS, COLS, DEPTH, SOLID_HEIGHT } from '../map/layout.js';

const SQRT2 = Math.SQRT2;
const N = COLS * DEPTH;

export function createNav() {
	const walkable = new Uint8Array(N);
	for (let r = 0; r < DEPTH; r += 1) {
		for (let c = 0; c < COLS; c += 1) walkable[r * COLS + c] = ROWS[r][c] in SOLID_HEIGHT ? 0 : 1;
	}
	const extra = new Float32Array(N);
	for (let r = 1; r < DEPTH - 1; r += 1) {
		for (let c = 1; c < COLS - 1; c += 1) {
			let near = 0;
			for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if (!walkable[(r + dr) * COLS + c + dc]) near += 1;
			extra[r * COLS + c] = near * 0.15;
		}
	}

	const g = new Float32Array(N);
	const f = new Float32Array(N);
	const parent = new Int32Array(N);
	const state = new Uint32Array(N); // search id * 2 (+1 when closed)
	const heap = new Int32Array(N * 8);
	let heapSize = 0;
	let search = 0;
	const cells = new Int32Array(N);

	function heapPush(node) {
		let i = heapSize++;
		heap[i] = node;
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (f[heap[p]] <= f[heap[i]]) break;
			const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
		}
	}
	function heapPop() {
		const top = heap[0];
		heap[0] = heap[--heapSize];
		let i = 0;
		for (;;) {
			const l = i * 2 + 1; const r = l + 1; let m = i;
			if (l < heapSize && f[heap[l]] < f[heap[m]]) m = l;
			if (r < heapSize && f[heap[r]] < f[heap[m]]) m = r;
			if (m === i) break;
			const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
		}
		return top;
	}

	function cellOf(x, z) {
		const c = Math.min(COLS - 1, Math.max(0, Math.floor(x / CELL)));
		const r = Math.min(DEPTH - 1, Math.max(0, Math.floor(z / CELL)));
		return r * COLS + c;
	}

	function nearestWalkable(index) {
		if (walkable[index]) return index;
		const c0 = index % COLS; const r0 = (index / COLS) | 0;
		for (let ring = 1; ring < 4; ring += 1) {
			for (let dr = -ring; dr <= ring; dr += 1) {
				for (let dc = -ring; dc <= ring; dc += 1) {
					const c = c0 + dc; const r = r0 + dr;
					if (c >= 0 && r >= 0 && c < COLS && r < DEPTH && walkable[r * COLS + c]) return r * COLS + c;
				}
			}
		}
		return index;
	}

	function clearLine(ax, az, bx, bz) {
		const dx = bx - ax; const dz = bz - az;
		const steps = Math.ceil(Math.hypot(dx, dz) / (CELL * 0.25));
		for (let i = 1; i <= steps; i += 1) {
			const t = i / steps;
			const x = ax + dx * t; const z = az + dz * t;
			for (let k = 0; k < 4; k += 1) {
				const ox = (k & 1 ? 0.45 : -0.45); const oz = (k & 2 ? 0.45 : -0.45);
				if (!walkable[cellOf(x + ox, z + oz)]) return false;
			}
		}
		return true;
	}

	function findPath(sx, sz, tx, tz, out) {
		search += 1;
		const base = search * 2;
		const start = nearestWalkable(cellOf(sx, sz));
		const goal = nearestWalkable(cellOf(tx, tz));
		const gc = goal % COLS; const gr = (goal / COLS) | 0;
		heapSize = 0;
		g[start] = 0;
		f[start] = 0;
		parent[start] = -1;
		state[start] = base;
		heapPush(start);
		let reached = false;
		while (heapSize > 0) {
			const node = heapPop();
			if (state[node] === base + 1) continue;
			state[node] = base + 1;
			if (node === goal) { reached = true; break; }
			const c = node % COLS; const r = (node / COLS) | 0;
			for (let dr = -1; dr <= 1; dr += 1) {
				for (let dc = -1; dc <= 1; dc += 1) {
					if (!dr && !dc) continue;
					const nc = c + dc; const nr = r + dr;
					if (nc < 0 || nr < 0 || nc >= COLS || nr >= DEPTH) continue;
					const next = nr * COLS + nc;
					if (!walkable[next] || state[next] === base + 1) continue;
					if (dr && dc && (!walkable[r * COLS + nc] || !walkable[nr * COLS + c])) continue;
					const cost = g[node] + (dr && dc ? SQRT2 : 1) + extra[next];
					if (state[next] === base && cost >= g[next]) continue;
					state[next] = base;
					g[next] = cost;
					const hx = Math.abs(nc - gc); const hz = Math.abs(nr - gr);
					f[next] = cost + Math.max(hx, hz) + (SQRT2 - 1) * Math.min(hx, hz);
					parent[next] = node;
					if (heapSize < heap.length) heapPush(next);
				}
			}
		}
		if (!reached) return 0;
		let count = 0;
		for (let n = goal; n !== -1; n = parent[n]) cells[count++] = n;
		let written = 0;
		let ax = sx; let az = sz;
		let i = count - 1;
		while (i >= 0) {
			let j = 0;
			for (j = 0; j < i; j += 1) {
				const cx = (cells[j] % COLS + 0.5) * CELL; const cz = (((cells[j] / COLS) | 0) + 0.5) * CELL;
				if (clearLine(ax, az, cx, cz)) break;
			}
			const cell = cells[j];
			let px = (cell % COLS + 0.5) * CELL; let pz = (((cell / COLS) | 0) + 0.5) * CELL;
			if (j === 0) { px = tx; pz = tz; if (!walkable[cellOf(tx, tz)]) { px = (goal % COLS + 0.5) * CELL; pz = (((goal / COLS) | 0) + 0.5) * CELL; } }
			if (written >= out.length) out.push({ x: 0, z: 0 });
			out[written].x = px; out[written].z = pz; written += 1;
			ax = px; az = pz;
			i = j - 1;
		}
		return written;
	}

	return { findPath, clearLine, cellOf, walkable };
}
