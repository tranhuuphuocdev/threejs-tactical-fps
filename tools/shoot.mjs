// Capture the entry's screenshots from the game itself: starts headless Chrome, opens each
// ?shot= scene from shots.json on the local server (node serve.ts), injects tools/stage.js to
// stage it through the game's capture hook, waits for __shotReady, and saves a JPEG of the
// viewport. Node 22+ (global WebSocket), no packages.
//   node serve.ts &  then  node tools/shoot.mjs [--out screenshots] [--chrome <path>]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const outDir = opt('--out', 'screenshots');
const chromePath = opt('--chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const base = opt('--base', 'http://localhost:8080/');
const quality = Number(opt('--quality', '94'));
const shots = JSON.parse(readFileSync(new URL('../shots.json', import.meta.url), 'utf8'));
const port = 9333;

const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, '--window-size=1280,720', '--hide-scrollbars',
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shoot-'))}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = nextId++;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
mkdirSync(outDir, { recursive: true });
const stageSource = readFileSync(new URL('./stage.js', import.meta.url), 'utf8').replaceAll("from './", `from '${base}src/`);
for (const shot of shots) {
  await send('Page.navigate', { url: base + shot.query });
  for (let i = 0; i < 100; i += 1) {
    await sleep(100);
    const r = await send('Runtime.evaluate', { expression: '!!window.__saltline' });
    if (r.result?.result?.value) break;
  }
  const name = new URLSearchParams(shot.query.slice(1)).get('shot');
  const run = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => { const m = await import(URL.createObjectURL(new Blob([${JSON.stringify(stageSource)}], { type: 'text/javascript' }))); const h = window.__saltline; h.capture(m.stageShot(${JSON.stringify(name)}, h.game, h.hud)); return 'ok'; })()`,
  });
  if (run.result?.exceptionDetails) console.log(shot.name, run.result.exceptionDetails.exception?.description);
  let ready = false;
  for (let i = 0; i < 100 && !ready; i += 1) {
    await sleep(150);
    const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true' });
    ready = r.result?.result?.value === true;
  }
  await sleep(400);
  const errors = await send('Runtime.evaluate', { expression: 'document.title' });
  const img = await send('Page.captureScreenshot', { format: 'jpeg', quality });
  const bytes = Buffer.from(img.result.data, 'base64');
  writeFileSync(join(outDir, shot.name), bytes);
  console.log(`${shot.name}: ${ready ? 'ready' : 'TIMED OUT'}, ${(bytes.length / 1024).toFixed(0)} KiB (${errors.result?.result?.value})`);
}
ws.close();
chrome.kill();
