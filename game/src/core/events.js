// A fixed ring of reusable event records. The simulation emits shots, hits, kills and sounds;
// the presentation (effects, audio, HUD) drains them once per rendered frame. Records are
// preallocated with every field, so a firefight never allocates and never triggers a GC pause.
const CAPACITY = 512;

function blank() {
	return {
		type: '', actor: -1, other: -1, weapon: '', amount: 0, head: false, flag: false,
		x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, nx: 0, ny: 0, nz: 0, text: '',
	};
}

export function createEventQueue() {
	const ring = Array.from({ length: CAPACITY }, blank);
	let head = 0;
	let count = 0;

	function emit(type) {
		const record = ring[(head + count) % CAPACITY];
		if (count < CAPACITY) count += 1; else head = (head + 1) % CAPACITY;
		record.type = type; record.actor = -1; record.other = -1; record.weapon = ''; record.amount = 0;
		record.head = false; record.flag = false; record.text = '';
		record.x = record.y = record.z = record.x2 = record.y2 = record.z2 = record.nx = record.ny = record.nz = 0;
		return record;
	}

	function drain(visit) {
		for (let i = 0; i < count; i += 1) visit(ring[(head + i) % CAPACITY]);
		head = 0; count = 0;
	}

	return { emit, drain };
}
