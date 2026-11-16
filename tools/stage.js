// Screenshot staging, injected by tools/shoot.mjs into the running game (?shot=<name>&seed=N).
// Each scene starts a real match, places actors with the same fields the round system sets, and
// returns a script: a number of simulation ticks and what the player does on each (aim, fire,
// throw). The game's own systems do the rest: bullets, damage, kill feed, smoke, blasts and HUD
// are the ones you see in play. Imports are rewritten by the tool to the served game modules.
import { TEAM } from './config.js';
import { CELL } from './map/layout.js';
import { giveWeapon } from './core/actors.js';
import { selectSlot } from './sim/weapons.js';

function place(actor, c, r, yaw, pitch = 0) {
  actor.alive = true;
  actor.pos.set(c * CELL, 0, r * CELL);
  actor.prevPos.copy(actor.pos);
  actor.vel.set(0, 0, 0);
  actor.yaw = yaw; actor.prevYaw = yaw; actor.pitch = pitch;
}

function arm(actor, primary, helmet = true) {
  if (primary) { giveWeapon(actor.primary, primary); actor.active = 1; }
  actor.armor = 100; actor.helmet = helmet;
}

function park(actors, keep) {
  // Actors not in the scene wait in their spawn yards, out of sight.
  for (const a of actors) {
    if (keep.includes(a)) continue;
    const raider = a.team === TEAM.RAIDERS;
    place(a, 6 + a.id * 2.6, raider ? 29.5 : 1.5, raider ? 0 : Math.PI);
    a.brain = null;
  }
}

function goLive(state, timer) {
  state.round.phase = 'live';
  state.round.timer = timer;
  state.round.elapsed = 30;
}

const idle = () => {};

export function stageShot(name, game, hud) {
  const { state, player } = game;
  const A = state.actors;
  if (name === 'buy') {
    game.newMatch(TEAM.RAIDERS, 0.6);
    state.round.number = 4; state.round.scores = [2, 1];
    for (const a of A) a.money = 4100;
    // The Loading Dock at freeze: the squad lines up, the requisition menu open.
    place(player, 20, 30.4, 0.08, 0.02);
    place(A[1], 17.5, 28.2, 0.3); place(A[2], 21.2, 27.4, -0.2); place(A[3], 23.4, 28.6, -0.5); place(A[4], 18.8, 26.6, 0.1);
    A[2].crouching = true; A[2].crouchAmount = 1;
    arm(A[1], 'kestrel'); arm(A[2], 'harrow'); arm(A[3], 'wasp', false); arm(A[4], 'longwatch');
    park(A, A.slice(0, 5));
    hud.setBuyOpen(true);
    return { ticks: 2, script: idle };
  }

  if (name === 'fight') {
    game.newMatch(TEAM.RAIDERS, 0.6);
    goLive(state, 71);
    state.round.number = 6; state.round.scores = [3, 2];
    // Pump Hall, looking north up the hall toward the Sluice: two Wardens push in.
    place(player, 23.6, 20.4, -0.02, 0.03);
    arm(player, 'kestrel');
    place(A[1], 21.0, 17.2, -0.12);
    arm(A[1], 'harrow');
    place(A[5], 23.2, 12.6, Math.PI + 0.05);
    place(A[6], 25.3, 11.6, Math.PI - 0.3);
    arm(A[5], 'kestrel'); arm(A[6], 'wasp');
    A[6].vel.set(-2.5, 0, 0.8);
    park(A, [player, A[1], A[5], A[6]]);
    for (const a of [A[1], A[5], A[6]]) a.brain = null;
    // A smoke blooming at the Sluice doors behind them.
    const smoke = state.grenades.smokes[0];
    smoke.active = true; smoke.x = 20 * CELL; smoke.y = 1.6; smoke.z = 8.6 * CELL; smoke.age = 2.5; smoke.life = 16; smoke.radius = 4.6;
    // Script: a controlled burst at the first Warden's chest while the second returns fire.
    const aimYaw = Math.atan2(A[5].pos.x - player.pos.x, -(A[5].pos.z - player.pos.z));
    return {
      ticks: 26,
      script(i) {
        player.yaw = aimYaw + 0.004; player.prevYaw = player.yaw;
        player.pitch = -0.012;
        player.intent.fire = i >= 10;
        A[6].pos.x -= 0.03;
        A[6].yaw = Math.atan2(player.pos.x - A[6].pos.x, -(player.pos.z - A[6].pos.z));
        A[6].pitch = -0.02;
        A[6].intent.fire = i >= 6;
      },
    };
  }

  if (name === 'retake') {
    game.newMatch(TEAM.WARDENS, 0.6);
    goLive(state, 40);
    state.round.number = 9; state.round.scores = [4, 4];
    // Pump A after the plant: cut the charge under cover of a smoke on the long entrance.
    const c = state.charge;
    for (const a of A) a.hasCharge = false;
    c.state = 'planted'; c.site = 'A'; c.fuse = 17.4; c.beep = 0.4; c.pos.set(5.2 * CELL, 0.02, 5.2 * CELL);
    state.round.phase = 'planted'; state.round.timer = c.fuse;
    place(player, 5.15, 5.95, -0.25, -0.5);
    arm(player, 'harrow'); player.kit = true;
    place(A[1], 8.6, 7.8, -0.9);
    arm(A[1], 'kestrel');
    place(A[2], 2.6, 8.6, 0.2);
    arm(A[2], 'longwatch');
    park(A, [player, A[1], A[2]]);
    for (const a of A) a.brain = null;
    // A smoke already blooming on the A long entrance.
    const s = state.grenades.smokes[0];
    s.active = true; s.x = 4.6 * CELL; s.y = 1.6; s.z = 1.8 * CELL; s.age = 3; s.life = 16; s.radius = 4.6;
    return {
      ticks: 130,
      script(i) {
        player.intent.use = i > 20;
        player.intent.crouch = true;
        player.pitch = -0.5;
      },
    };
  }

  // 'blast': Pump B, a frag lands among Raiders planting; kill feed fills from the real blast.
  game.newMatch(TEAM.WARDENS, 0.6);
  goLive(state, 38);
  state.round.number = 12; state.round.scores = [6, 5];
  place(player, 33.4, 1.9, Math.PI, -0.06);
  arm(player, 'kestrel');
  player.grenades.frag = 1; player.grenades.smoke = 1;
  place(A[5], 33.5, 8.2, 0.1); place(A[6], 35.0, 7.4, -0.3); place(A[7], 31.8, 9.6, 0.4);
  arm(A[5], 'kestrel'); arm(A[6], 'harrow'); arm(A[7], 'wasp');
  A[5].health = 30; A[6].health = 22; A[7].health = 61;
  A[5].crouching = true; A[5].crouchAmount = 1;
  place(A[1], 37.2, 1.6, Math.PI * 1.15);
  arm(A[1], 'longwatch');
  park(A, [player, A[1], A[5], A[6], A[7]]);
  for (const a of A) a.brain = null;
  selectSlot(state, player, 4);
  player.switching = 0;
  return {
    ticks: 128,
    script(i) {
      player.intent.firePressed = i === 2;
      if (i === 2) { player.pitch = 0.2; player.yaw = Math.PI * 1.005; }
      if (i > 20) { player.pitch = -0.07; player.yaw = Math.PI * 0.99; }
      if (i === 104) selectSlot(state, player, 1);
      if (i > 118) player.switching = 0;
    },
  };
}
