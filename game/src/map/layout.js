// SALTWORKS: an original map, a salt-evaporation compound on a dry coast. Each character is a
// 2 m square seen from above, north at the top. Wardens spawn in the Control Yard (north),
// Raiders at the Loading Dock (south). Two pump stations hold the charge sites:
//   Pump A (north-west): reached by the long Brine Yard lane or the Pipe Run connector from mid.
//   Pump B (north-east): reached by the Evaporator Tunnels or the Valve Alley connector.
//   Mid, the Pump Hall, links the Dock to the Control Yard through the narrow Sluice doors.
//
//   #  concrete wall (5 m)        C  stacked salt crates (2.2 m)   c  low pallet (1 m)
//   .  open ground                a  Pump A site floor             b  Pump B site floor
//   T  Raider spawn               D  Warden spawn
export const CELL = 2;

export const ROWS = [
	'########################################',
	'#aaaaaaaaaa##DDDDDDDDDDDDDD##bbbbbbbbbb#',
	'#aaaaaaaaaa##DDDDDDDDDDDDDD##bbbbbbbbbb#',
	'#aaCCaaaaaa..DDDDDDDDDDDDDD..bbbbbbCCbb#',
	'#aaCCaaacca..D............D..bccbbbCCbb#',
	'#aaaaaaacca##..............##bccbbbbbbb#',
	'#aaaaaaaaaa#######....#######bbbbbbbbbb#',
	'#acaaaaaaaa#######....#######bbbbbbbbcb#',
	'#acaaaCaaaa#######....#######bbbbCbbbcb#',
	'#aaaaaaaaaa#######....#######bbbbbbbbbb#',
	'##....##..########....########..##....##',
	'#......#........................#......#',
	'#......#........................#......#',
	'#......#######............#######......#',
	'#......#######..CC........#######...CC.#',
	'#.cc...#######..CC........#######......#',
	'#......#######....CCCC....#######......#',
	'#......#######........cc..#######......#',
	'#......#######............#######cc....#',
	'#......#######....cc......#######......#',
	'#....CC#######............#######......#',
	'#......#######............#######......#',
	'#......###########....###########......#',
	'#......###########....###########....cc#',
	'#cc....###########....###########......#',
	'#......###########....###########......#',
	'#......#........................#......#',
	'#..............TTTTTTTTTT..............#',
	'#..............TTTTTTTTTT..............#',
	'#......#.......TTTTTTTTTT.......#......#',
	'#......#........................#......#',
	'########################################',
];

export const COLS = ROWS[0].length;
export const DEPTH = ROWS.length;
export const WIDTH_M = COLS * CELL;
export const DEPTH_M = DEPTH * CELL;

export const SOLID_HEIGHT = { '#': 5, C: 2.2, c: 1.0 };
export const OUTER_WALL_HEIGHT = 7;

// Named places, in cell coordinates (col, row). Bots route between them and the HUD calls them out.
export const CALLOUTS = [
	{ name: 'Pump A', c0: 1, r0: 1, c1: 10, r1: 9 },
	{ name: 'Pump B', c0: 29, r0: 1, c1: 38, r1: 9 },
	{ name: 'Control Yard', c0: 11, r0: 1, c1: 28, r1: 5 },
	{ name: 'Sluice', c0: 18, r0: 6, c1: 21, r1: 10 },
	{ name: 'Brine Yard', c0: 1, r0: 10, c1: 6, r1: 26 },
	{ name: 'Pipe Run', c0: 8, r0: 10, c1: 13, r1: 12 },
	{ name: 'Pump Hall', c0: 14, r0: 11, c1: 25, r1: 21 },
	{ name: 'Valve Alley', c0: 26, r0: 10, c1: 31, r1: 12 },
	{ name: 'Evaporators', c0: 33, r0: 10, c1: 38, r1: 26 },
	{ name: 'Hall Ramp', c0: 18, r0: 22, c1: 21, r1: 25 },
	{ name: 'Loading Dock', c0: 1, r0: 26, c1: 38, r1: 30 },
];

// The named place a world position is in ('' between places), for the HUD and bot radio calls.
export function calloutAt(x, z) {
	const c = x / CELL; const r = z / CELL;
	for (const area of CALLOUTS) if (c >= area.c0 && c < area.c1 + 1 && r >= area.r0 && r < area.r1 + 1) return area.name;
	return '';
}

// Where each side holds when defending, and the angle it watches (radians, 0 = north, clockwise).
// Each entry: [col, row, yaw]. Attackers pick lanes; defenders take these posts.
export const POSTS = {
	A: [[6, 7, Math.PI * 0.9], [9, 3, Math.PI * 1.1], [2, 2, Math.PI * 0.85]],
	B: [[33, 7, Math.PI * 1.1], [30, 3, Math.PI * 0.95], [37, 2, Math.PI * 1.2]],
	mid: [[19, 9, Math.PI], [24, 4, Math.PI * 1.15]],
};

// Attack lanes: a route of cells from the Dock to a site entrance. The last cell is inside the site.
export const LANES = {
	A: {
		long: [[4, 26], [4, 18], [4, 11], [4, 8]],
		short: [[19, 24], [18, 17], [15, 12], [9, 11], [8, 7]],
	},
	B: {
		long: [[35, 26], [35, 18], [35, 11], [35, 8]],
		short: [[20, 24], [21, 17], [24, 12], [30, 11], [31, 7]],
	},
	mid: [[19, 24], [19, 14], [19, 11], [19, 7]],
};

// The charge's plant zone in each site: cells of 'a' or 'b'.
export const SITE_CHAR = { A: 'a', B: 'b' };
