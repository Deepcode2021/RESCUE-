# RESCUE?

*Three survivors. One helicopter. Absolutely terrible weather.*

A chaotic physics-based helicopter rescue game. Vanilla HTML5 + CSS3 + ES-module JavaScript, Canvas 2D, Web Audio
(all sounds generated in code) and LocalStorage. No frameworks, no build step, no assets.

## Run it

ES modules need an HTTP server (opening `index.html` straight from disk will not work).

```bash
cd rescue-game
python -m http.server 8000        # or: npx serve .
# open http://localhost:8000
```

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Tilt / thrust left, right | `A` `D` or `←` `→` | ◀ ▶ |
| Lift | `W`, `↑` or `Space` | ▲ |
| Descend | `S` or `↓` | ▼ |
| Rope reel in / let out | hold `Q` / hold `E` | ROPE up / down |
| Pause | `Esc` or `P` | II button |
| Restart mission | `R` | Retry on results / pause menu |

## How a rescue works (one consistent mechanic)

1. Fly over a survivor on a narrow peak. Dangle the hook against them **gently** (relative speed under ~380 u/s,
   within ~36 u of their chest) and they grab on (`ATTACHED_TO_ROPE`).
2. On **Easy and Normal** riders hold on tight. On **Hard only**, their grip drains over time and faster with violent rope
   motion, dragging on rock, strong wind and the tornado, and they slip off and fall. Fly smoothly.
3. Carry them to the **SAFE ZONE** (flat pad, left) and lower them in. That counts as rescued (`RESCUED`).
   A survivor who falls and lands in the zone is rescued too.
4. The rope is a physical object: swinging it into a survivor transfers impulse and can knock them off their ledge.
   Knocked survivors that land on a slope can be re-hooked.

Scoring: +100 per rescue, +50 if that survivor was never dropped, speed bonus, +250 flawless bonus, all
multiplied by the difficulty (x0.75 / x1 / x1.5). Best score and rescue count are saved per mission AND per
difficulty. Winning a mission unlocks NEXT MISSION (same difficulty).

## v4: look, rope and gore

- **Adjustable rope**: hold `Q` to reel in, `E` to let out (about 95 to 320 units); touch has ROPE up/down buttons. The HUD shows line length.
- **Pixel-art helicopter with three views**: left, front (hovering) and right sprites, baked at start-up. It turns through the front view as you reverse; rotors spin and tilt with the airframe.
- **Ragdoll survivors**: falling people flail on a Verlet ragdoll (11 points); dead ones are fully simulated and tumble. Rotor blades and the fuselage are lethal (`CHOPPED!` / `SQUISHED!`), hard landings splatter. Blood sprays, sticks to roofs and walls and fades; blade kills can sever limbs.
- **City levels**: Paris Flood (Eiffel Tower, Sacre-Coeur, Arc de Triomphe, Notre-Dame skyline), Mumbai Monsoon (slum rooftops, Sea Link, Gateway of India), Manhattan (Empire State, Chrysler, One WTC, Statue of Liberty), Tokyo Neon (Tokyo Tower, Skytree, Fuji, neon signs), Dubai Heights (Burj Khalifa, Burj Al Arab). Rooftop terrain, pixel buildings with lit windows, and parallax skylines. The mountain and sea missions got new backdrops too (alps, harbour with lighthouse / rig / ships, himalaya with a radio mast).

## v6: first five minutes (Roadmap Phase 1)

New pilots start on Easy and get a skippable 6-step tutorial on Mountain Pass (`T` skips; replay from the title or pause menu).
Context hints (switch off with HINTS: OFF), grab-range ring, drop-off box, HOOKED/TOO FAST/SO CLOSE feedback, cause-by-cause
loss explanations and a "WHAT HAPPENED" list on the results screen. `Enter` triggers the primary results button, `R` retries.
Details and status of later phases: `DEVELOPMENT_ROADMAP.md`. New test: `node tests/coach.mjs` (49 checks).

## v7: medals, personal bests and results (Roadmap Phase 2)

- **Score** = rescues (100) + clean pickups (50) + convoy + speed (2 per second under par) + flawless (250) + fuel (0.8 per % left), all x difficulty (0.75 / 1 / 1.5). Speed, flawless and fuel only count when everyone is rescued and the helicopter survives, so reckless speed never pays. Nothing is subtracted. The results screen shows every part under SCORE BREAKDOWN.
- **Medals** (provisional thresholds, not playtested): BRONZE `★☆☆` rescue at least half without crashing first; SILVER `★★☆` rescue all and keep the helicopter intact; GOLD `★★★` Silver + never drop anyone + finish within 80% of the time limit. Failed runs and the tutorial earn nothing.
- **Personal bests** per mission and difficulty: best score, highest medal, best full-rescue time, most rescued, attempts. Failures and worse runs never overwrite them. Story and free play share records. Old saves are upgraded in place and malformed ones are repaired.
- The mission card shows medals per difficulty and the medal goals; the results show the earned medal, new-record flags and what the next medal needs.
- Code: `js/scoring.js` (formula and medals, pure), `js/records.js` (record rules and save migration). Full formula, schema and known issues: `DEVELOPMENT_ROADMAP.md`. New test: `node tests/scoring.mjs` (129 checks).

## v5: gore, themes and a storm that builds

- **Shredding**: rotor contact bursts a survivor into 11 flying pieces (head, torso, arm and leg segments) that spin, bounce and
  trail blood, plus a large blood burst, red screen flash and camera shake. The fuselage still crushes into a ragdoll.
- **Hard-only slipping**: `cfg.slip` is true only on Hard.
- **A theme per place** (`js/themes.js`, `js/themefx.js`): colour grade, sky, sun/moon and weather for each level.
  Paris: rose dusk, moon, Eiffel searchlight and twinkle burst, rain, fog, pigeons, rooftop steam. Mumbai: green monsoon,
  heavy rain and sweeping rain sheets, crows. Manhattan: whiteout snow, blinking spire beacons, steam stacks, sirens.
  Tokyo: neon rooftops, falling petals, red sun. Dubai: sandstorm, heat haze, glints, blinking Burj lights.
  Mountain, harbour and Himalaya levels have their own grades too (lighthouse beam, snow). Landmark lights are placed on the
  baked landmark tips automatically.
- **It gets more intense over time**: the storm ramps up (wind, rain density, lightning rate, a low tension drone) toward 75% of the
  time limit, and every 30 to 60 s a **gust front** hits (stronger on Hard) with a banner and sound.
- **More effects**: rotor downwash dust/spray (sand on Dubai, spray over water), engine smoke on low fuel, lightning hitting rooftops, steam.
- **More sound**: gore splat, winch ratchet while reeling, grip creak (Hard), convoy fanfare, delayed thunder, squall whoosh, tension
  drone, and a rare ambient cue per place (Paris bell, Mumbai horns, NYC siren, Tokyo crossing ding, Dubai sand gust, harbour foghorn).

## Carrying several survivors (up to 3)

Touch the hook to a survivor gently. They grab the rope and **climb up it by themselves** to the first free slot
(5th, 9th, 13th rope segment), which frees the hook so you can pick up a second and a third. Every rider is a real
weight on the Verlet rope (the rope swings heavier), has their own grip meter, and a crowded rope drains grip
slightly faster, so a slipper drops alone and the others keep hanging. Lower the rope until any rider reaches the
SAFE ZONE and everyone hanging inside it hops off together for a **convoy bonus**. A crash drops everyone. The HUD
shows `ON ROPE n/3`.

## Story mode: "The Long Storm"

`STORY MODE` on the title screen: six chapters, one per mission, with a prologue, cutscenes (typewriter text, tap /
Enter / Space to advance, Esc or SKIP to skip), in-mission radio lines from Pip, and an epilogue after chapter 6.
You are Wren Calloway, a retired rescue pilot flying the old helicopter Moth through the storm that the Halcyon
Institute's Lantern Array towers created. Chapters unlock as you win them; progress is saved in LocalStorage and
`RESTART STORY` wipes it. Difficulty applies to story too. All text lives in `js/story.js`.

## Missions

| # | Mission | What is different |
|---|---|---|
| 1 | Mountain Pass | The original: three peaks, storm, tornado |
| 2 | Storm Sea | Open ocean, sea stacks, a ship deck as the safe zone. **Rising tide** floods low rocks (survivors drown, helicopter crashes if it touches water) |
| 3 | Skyline Peaks | Huge mountains. **Thin air** (less lift up high) and **fuel** (hover low over the SAFE ZONE to refuel) |
| 4 | Blackout Ridge | **Night**: tiny searchlight, flares, edge arrows, lightning flashes the world |
| 5 | Midnight Tide | Ocean + night + fuel + rising tide |
| 6 | The Gauntlet | Everything: five survivors, huge peaks, thin air, fuel, night, early big tornado |
| 7 | Paris Flood | Haussmann rooftops, rising river |
| 8 | Mumbai Monsoon | Packed slum roofs, fast flood |
| 9 | Manhattan | Tall towers, thin air, fuel |
| 10 | Tokyo Neon | Night, neon, fuel |
| 11 | Dubai Heights | Supertall towers, thin air, fuel, five survivors |

The story uses missions 1 to 6; the city levels are in Free Play.

Difficulty (Easy / Normal / Hard, keys 1-2-3 on the title screen) scales wind, tornado delay and size, survivor
grip, fuel, tide speed, thin air, darkness, searchlight, time limit and score. Title screen: arrows (or
left/right keys) pick the mission.

## Code map

| File | Responsibility |
|---|---|
| `js/main.js` | entry point, wiring, resize / visibility handling |
| `js/game.js` | state machine (TITLE, PLAYING, PAUSED, MISSION_SUCCESS, MISSION_FAILED), fixed-timestep loop |
| `js/world.js` | DOM-free simulation: steps every object, scoring, end conditions (testable in Node) |
| `js/helicopter.js` | rigid body: collective, tilt spring-damper, thrust vector, drag, wind, collisions |
| `js/rope.js` | Verlet rope, 20 nodes, 24 constraint sweeps, terrain collision (simulation only) |
| `js/survivors.js` | survivor state machine, physics, grip, rope impulse, grab test |
| `js/terrain.js` | seeded heightfield, ledges, `heightAt` / `normalAt` |
| `js/weather.js` | smooth wind with scheduled gusts + turbulence; pooled rain |
| `js/tornado.js` | growing vortex force field: inward + tangential + lift, smooth falloff |
| `js/particles.js`, `js/dialogue.js` | pooled sparks/debris/popups; event-driven speech with cooldowns |
| `js/renderer.js` | all drawing (hand-drawn look via stable per-vertex wobble + chalk duplicate stroke) |
| `js/audio.js` | procedural rotor / wind / rain / effects; `attachMusic(url)` slot for optional music |
| `js/themes.js`, `js/themefx.js` | per-place colour grade, sky, weather mode and effect drawing (beacons, searchlights, neon, fog, birds, haze) |
| `js/ragdoll.js`, `js/sprites.js`, `js/cityart.js` | Verlet ragdoll; baked pixel helicopter views; pixel buildings, landmarks and parallax scenery |
| `js/story.js` | story text: prologue, chapters (intro / outro / radio lines), epilogue |
| `js/scoring.js`, `js/records.js` | Phase 2: score formula, medal tiers, personal-best rules, save migration (pure, no DOM) |
| `js/coach.js` | Phase 1: tutorial, context hints, debrief text |
| `js/input.js`, `js/ui.js`, `js/storage.js` | input smoothing, DOM menus + HUD, LocalStorage |

## Tests

```bash
node tests/sim.mjs                      # 18 headless physics / state-machine checks
node tests/sim2.mjs                     # 38 checks: all 18 mission x difficulty layouts, wind creep, tide, drowning,
                                        # fuel / flameout, thin-air climb margin, difficulty scaling, scoring
node tests/multi.mjs                    # 19 checks: 3-rider convoy, 4th refused, solo slip, no slipping on Easy/Normal, slipping on Hard
node tests/story.mjs                    # story data integrity (chapters map to missions, cast, lengths)
node tests/coach.mjs                    # 49 checks: tutorial, hints, debrief, legacy saves, Game integration
node tests/scoring.mjs                  # 129 checks: score parts, medals, records, migration, Game integration
node tests/mission.mjs 1 230 hard       # autopilot flies one mission (mission index, max seconds, difficulty)
node tests/matrix.mjs                   # autopilot across every mission x difficulty
```

`tests/bot.mjs` is the autopilot. It is a stability / soft-lock detector, not a balance judge: it is a simple
controller, so its win rate is not a measure of how hard a level is for a person. The bot now also fetches extra riders when the hook is free (`CONVOY=1` turns that on; it is greedy and scores worse than the default). Browser checks:
`tests/e2e_story.py` (Playwright, Python). Audio and touch feel were not tested by a human.
