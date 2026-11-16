// SALTLINE hand-in program (Node 22, standard library only).
//
// The game is the static site under game/ (ES modules, three.js from the import map, no build
// step) and its maker's screenshots are under screenshots/. This program copies both into the
// output directory and writes dossier.json there with the kit's makefun-threejs library, which is
// what the judge reads. The grader runs it with /output; locally, point MAKEFUN_OUTPUT_DIR at a
// scratch folder:
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts      then      node serve.ts   (play on localhost:8080)
//
// Screenshots are captured from the running game by tools/shoot.mjs (see shots.json).

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The gate's limits, passed through so the library refuses what the scorer would refuse.
const LIMITS = {
	text_max_bytes: 163840,                            // what the judge reads of the source
	screenshots: { max: 4, max_bytes: 256 * 1024 },    // 3 to 4 images, 256 KiB each
	game_max_files: 993,                               // game/ shares /output's 1000 entries
	game_max_bytes: 48 * 1024 * 1024,
};

function copyFolder(name: string, required: boolean): void {
	const from = join(repoRoot, name);
	if (!existsSync(from)) {
		if (required) throw new Error(`missing ${name}/ beside main.ts`);
		mkdirSync(join(outputDir, name), { recursive: true });
		return;
	}
	cpSync(from, join(outputDir, name), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyFolder('game', true);
copyFolder('screenshots', false);

const shots = readdirSync(join(outputDir, 'screenshots')).filter((f) => !f.startsWith('.'));
if (shots.length < 3 || shots.length > 4) console.warn(`screenshots/: ${shots.length} images, the gate wants 3 or 4`);

writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, LIMITS));
console.log(`SALTLINE handed in: game/, ${shots.length} screenshots and dossier.json in ${outputDir}`);
