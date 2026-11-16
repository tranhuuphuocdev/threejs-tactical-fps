# SALTLINE

A round-based tactical first-person shooter for the browser, built on three.js 0.187.0 with no
build step. Five against five at the Saltworks, an original salt-evaporation compound: the
Raiders carry a breach charge to Pump A or Pump B, the Wardens hold the stations or cut the
charge before it blows. Money between rounds, a buy menu, five guns plus frag, flash and smoke
grenades, first to seven rounds, sides swap at halftime.

## Play

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

WASD move, Shift walk (silent), Ctrl/C crouch, Space jump, mouse look and fire, R reload,
right mouse scope or underhand throw, 1/2/4/5 rifle/pistol/grenades/charge, B buy, E plant or
cut, Tab scoreboard.

## How it is built

- `game/src/game.js`: one state object and a fixed 60 Hz tick (bots, movement, weapons,
  grenades, objective, round). Rendering interpolates between ticks and never writes state.
- `game/src/sim/`: source-style movement, hitscan against head/chest/stomach/leg zones with
  armour, recoil patterns and movement inaccuracy, grenades, the charge, rounds and economy.
- `game/src/bots/`: perception (sight cone, walls, smoke, flashes, hearing), team tactics
  (site picks, lane splits, rotations) and per-bot behaviour on an A* grid.
- `game/src/view/` and `game/src/world/`: procedural textures, merged map geometry, extruded gun
  models, pooled particles, tracers and decals, synthesised positional audio.
- `main.ts` hands the game in for make.fun (copies `game/` and `screenshots/`, writes the
  dossier); `tools/shoot.mjs` captures the screenshots from the running game.

MIT licensed.
