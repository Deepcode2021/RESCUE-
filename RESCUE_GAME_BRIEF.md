# RESCUE? — Full Project Brief (v5), written so another AI can pick the project up cold

## 1. What it is
"RESCUE?" is a chaotic, physics-based helicopter rescue game that runs in a browser.
You fly a small helicopter (called **Moth** in the story) through a storm, hook stranded survivors with a swinging rope,
carry them to a safe pad and lower them in. The rope, survivors, wind and a tornado are all simulated, so most of the fun and
the danger is physical: swing the rope too hard and you knock survivors off ledges; fly into the rotor path and you shred people.

Tone: dark-funny, chalk/pixel look, survivors shout jokes ("I HAVE SNACKS. PLEASE COME."). Gore exists (blood, ragdolls, gibs).

## 2. Tech stack (deliberately minimal)
- Vanilla **HTML5 + CSS3 + ES-module JavaScript**. No frameworks, no bundler, no build step, no assets (no images, no audio files).
- **Canvas 2D** rendering. Pixel art (helicopter, buildings, landmarks) is *baked from code* onto offscreen canvases at start-up.
- **Web Audio API**: every sound is generated procedurally (oscillators + filtered noise). There is an optional `attachMusic(url)` slot.
- **LocalStorage** for settings, per-mission/difficulty best scores, story progress (key `rescue-game.v1`).
- Needs an HTTP server because of ES modules (`python -m http.server 8000`, then open http://localhost:8000). Opening index.html from disk fails.
- Tests: plain **Node** scripts (no framework) because the simulation core is DOM-free; **Playwright (Python)** was used only for screenshots and e2e checks.
- ~5,000 lines total. Platform of the user: Windows, Git Bash, VS Code.

## 3. Architecture
Fixed-timestep simulation (`STEP = 1/60`, max frame 0.1 s, max 5 steps per rendered frame) separated from rendering.
`World` is DOM-free and fully testable in Node. `Game` owns the state machine, UI, audio and renderer.

World size 3600 x 1400 units, gravity 900 u/s^2. Terrain is a heightfield (cell width DX = 30).

### File map (js/)
| File | Responsibility |
|---|---|
| main.js | entry point, wiring, resize/visibility handling, exposes `__rescue` for tests |
| game.js | state machine (TITLE, STORY, CUTSCENE, PLAYING, PAUSED, MISSION_SUCCESS, MISSION_FAILED), loop, story/mission flow, event->banner/sound handling, `_rain()` weather sync |
| world.js | the whole simulation: stepping everything, rider logic, blade/fuselage kills, gore/shred, scoring, end conditions, storm escalation, ambient FX emitters |
| helicopter.js | rigid body: collective (lift), tilt spring-damper, thrust vector, drag, wind, crash thresholds, `face` (-1/0/1) for sprite view |
| rope.js | Verlet rope, 20 nodes, 24 constraint sweeps, adjustable segment length 5..17 (line ~95..323 units), per-node loads, terrain collision |
| survivors.js | survivor state machine, physics, grip, climbing, rope impulse, grab test, ragdoll hookup |
| ragdoll.js | 11-point Verlet ragdoll (head, neck, pelvis, elbows, hands, knees, feet), `sever`, `kick`, `eachPiece` |
| terrain.js | seeded heightfield; mountain/sea terrain and `_generateCity` (flat rooftops separated by street-level gaps) |
| weather.js | `Wind` (smooth base + scheduled gusts + turbulence); `Rain` pool with modes rain/snow/petal/sand |
| tornado.js | growing vortex force field (inward + tangential + lift) |
| particles.js | pooled `Sparks`, `Debris`, `Popups`, `Blood` (1500, sticks to ground and fades), `Gibs` (160 body chunks), `Puffs` (steam/dust/smoke/spray) |
| sprites.js | baked pixel helicopter, 3 views (left/front/right), 3.2 world units per pixel |
| cityart.js | baked pixel buildings (5 kinds) and layered parallax scenery with real landmarks; resolves landmark-tip "marks" for lights |
| themes.js, themefx.js | per-place tint/sky/sun/weather data and the canvas effect drawing (beacons, searchlights, neon, fog, birds, haze, sirens) |
| renderer.js | all drawing, camera, ragdoll/gib/blood drawing, colour-grade pass |
| audio.js | procedural loops (rain, wind, rotor, winch, tension drone) and one-shot effects, per-city ambient cues |
| story.js | all story text (data only) |
| dialogue.js | event-driven survivor speech with cooldowns |
| input.js, ui.js, storage.js, physics.js, utils.js, constants.js, missions.js | input smoothing (keyboard + touch), DOM menus/HUD, LocalStorage, collision helpers, helpers, constants, mission catalogue |

Render order (world space): sky gradient (screen space) -> parallax scenery layers (+landmark lights) -> tornado -> debris -> terrain or city -> water -> safe pad -> rooftop neon -> survivors -> rope -> helicopter -> steam/dust puffs -> sparks -> popups -> **colour-grade multiply tint** -> gibs and blood (drawn after the tint so blood stays red) -> screen space: night darkness, fog/haze/birds/sheets/sirens, precipitation, wind streaks, lightning, red gore flash, indicators, speech bubbles, vignette.

## 4. Controls
| Action | Keyboard | Touch |
|---|---|---|
| Tilt/thrust left, right | A D or arrows | left/right buttons |
| Lift / descend | W, Up, Space / S, Down | up/down buttons |
| Rope reel in / let out | hold Q / hold E | ROPE up/down buttons |
| Pause | Esc or P | pause button |
| Restart | R | retry buttons |
Title screen: arrows pick mission, keys 1/2/3 pick difficulty.

## 5. Core mechanic: how a rescue works
1. Hover gently over a survivor. If the hook is within **36 units** of the chest and relative speed is under **380 u/s**, they grab on (state ATTACHED_TO_ROPE).
2. Up to **3 riders** on the rope (`MAX_RIDERS = 3`). A new rider grabs the hook then **climbs up the rope by themselves** (3 rope nodes/s) to slot 5, 9 or 13, freeing the hook for the next pick-up. Each rider is a real weight on the Verlet rope.
3. Fly to the **SAFE ZONE** (flat pad) and lower the rope. When any rider reaches the pad, everyone hanging inside it hops off together = **convoy bonus** (40 x (n-1) x difficulty multiplier).
4. A survivor who falls and lands in the pad is rescued too. A fall with impact > 660 is lethal (splat).
5. The rope is physical: swinging it into a survivor transfers impulse and can knock them off. Knocked survivors on slopes can be re-hooked.

### Survivor states
WAITING, FALLING, ATTACHED_TO_ROPE, RESCUED, LOST (causes: tornado, splat, blown, drowned, blades, crushed). Standing survivors have static friction (wind never drags them off ledges).

### Grip / slipping (Hard only)
`cfg.slip` is true only on Hard. Then grip drains with time, violent hook acceleration, dragging on rock, strong wind and tornado proximity (x1.1 per extra rider, x0.6 while climbing); at 0 the rider lets go and falls alone. On Easy/Normal riders never slip.

### Kills / gore
- **Rotor blades**: the rotor disc segment (about +-64 units wide, 35 above the hub) kills a standing or falling survivor => the body is **shredded into 11 gib pieces** (head, torso, arm/leg segments) with outward + rotor-tangential velocity, spin, bounce on terrain and a blood trail; plus ~270 blood particles, red screen flash, shake, "SHREDDED!" banner and gore sound.
- **Fuselage**: relative speed above 170 u/s = crushed (ragdoll with limbs severed); slower = a knock.
- **Splat / tornado / drowning** have their own handling (drowned bodies sink with no ragdoll).
- Falling survivors flail on a driven ragdoll; dead ones become free Verlet ragdolls.

### Helicopter
Pixel sprite with left/front/right views; turns through the front view when reversing. Collective lift, tilt, drag, wind. Crashes when skids hit harder than 330 or body harder than 150, or if it touches water. Crash drops all riders.

### Scoring
+100 per rescue (+50 if that survivor was never dropped), convoy bonus, time bonus when everyone is saved ((parTime - duration) x 2, parTime = 40 x survivors + 20), +250 flawless bonus (all rescued, none dropped); all multiplied by difficulty (0.75 / 1 / 1.5). A mission is a success when at least half are rescued (or all rescued even if crashed). Bests are saved per mission AND difficulty.

## 6. Hazards ("factors")
- **STORM** (always): gusting wind + a growing tornado that appears at a set time, with a warning 6 s before. Tornado pulls helicopter, survivors, debris; a rider in the core dies.
- **TIDE**: sea rises during the mission; low rocks/streets flood, survivors drown, the helicopter cannot touch water.
- **THIN AIR**: lift decreases with altitude (`thin` factor, smoothstep between 350 and 1050 units above base).
- **FUEL**: burns while flying; hover low over the SAFE ZONE to refuel; empty tank = engine out; low fuel shows engine smoke.
- **NIGHT**: darkness with a small searchlight around the helicopter, flare rings on survivors, edge arrows, lightning lights the world.
- **Storm escalation (v5)**: `world.intensity` rises smoothly to 75% of the time limit (more wind, rain density, lightning rate, tension drone). Every ~30-60 s a **gust front** (squall) lasts 7 s with a banner (wind boost 30% Easy / 50% Normal / 75% Hard). Lightning can spark off rooftops.

## 7. Difficulty presets
| | Easy | Normal | Hard |
|---|---|---|---|
| wind | x0.7 | x1 | x1.35 |
| tornado delay / size | x1.6 / x0.8 | x1 / x1 | x0.7 / x1.2 |
| rider slipping | no | no | **yes** |
| grip drain | x0.7 | x1 | x1.3 |
| fuel | x1.3 | x1 | x0.8 |
| tide speed | x0.6 | x1 | x1.5 |
| thin air | x0.6 | x1 | x1.1 |
| darkness / searchlight | 0.8 / 1.25 | 1 / 1 | 1 / 0.8 |
| time limit | x1.2 | x1 | x0.9 |
| score | x0.75 | x1 | x1.5 |

## 8. The 11 missions (levels)
Each has a visual `theme`. Time limit = seconds before the storm wins (Normal). "Tornado at" = seconds until it appears.
| # | Id / name | Theme | Survivors | Hazards | Tornado at | Time | Notes |
|---|---|---|---|---|---|---|---|
| 1 | pass / MOUNTAIN PASS | alps | 3 | storm | 16 s | 210 | the classic: 3 narrow peaks |
| 2 | sea / STORM SEA | harbor | 3 | storm, tide | 26 s | 230 | sea stacks, ship deck as safe zone, tide max 62 |
| 3 | tall / SKYLINE PEAKS | himalaya | 4 | storm, thin air 0.22, fuel 200 s | 26 s | 280 | huge mountains, tiny ledges |
| 4 | night / BLACKOUT RIDGE | alps | 4 | storm, night 0.94 | 16 s | 260 | random peaks, searchlight/flares |
| 5 | midnight / MIDNIGHT TIDE | harbor | 4 | storm, tide, night 0.9, fuel 190 s | 15 s | 270 | |
| 6 | gauntlet / THE GAUNTLET | himalaya | 5 | storm, thin air, fuel 210 s, night 0.92, grip x1.1 | 12 s (big, 235 radius) | 330 | everything at once |
| 7 | paris / PARIS FLOOD | paris | 4 | storm, tide 0.35 | 22 s | 250 | Haussmann rooftops, Eiffel backdrop |
| 8 | mumbai / MUMBAI MONSOON | mumbai | 5 | storm, tide 0.6 | 20 s | 270 | slum tin-roof shacks packed together |
| 9 | newyork / MANHATTAN | newyork | 4 | storm, thin air 0.14, fuel 220 s | 24 s | 290 | glass towers 250-720 high |
| 10 | tokyo / TOKYO NEON | tokyo | 4 | storm, night 0.86, fuel 200 s | 20 s | 280 | neon blackout, Shibuya feel |
| 11 | dubai / DUBAI HEIGHTS | dubai | 5 | storm, thin air 0.22, fuel 215 s | 16 s | 330 | supertalls 380-1000 high |
Missions 1-6 are mountain/sea/storm (also used by Story). Missions 7-11 are **city levels** with rooftop terrain: flat roofs separated by street-level gaps with steep one-cell walls; the street level becomes water on flood levels using the tide mechanic. City missions are Free Play only. Configs live in `js/missions.js` (`MISSIONS`, `DIFFICULTIES`, `buildConfig`).

## 9. Place themes and parallax backgrounds (v5)
Parallax scenery is baked pixel art in 2-4 layers (par 0.08 stars, 0.1-0.5 skylines/mountains) with real landmarks. A colour grade (multiply tint) and sky gradient per theme; marks (beacon positions) are resolved by scanning the baked layer for the tallest painted pixel at the landmark's x.
| Theme | Landmarks / backdrop | Colour & sky | Weather | Special FX |
|---|---|---|---|---|
| alps | layered mountain ranges, pines | cold blue | rain | fog, birds |
| harbor | lighthouse, cargo ships, crane, oil rig | teal | heavy rain | fog, birds, lighthouse sweeping beam, blinking crane lights |
| himalaya | huge peaks, prayer flags, radio mast | indigo/violet, pale moon | snow | fog |
| paris | Eiffel Tower, Sacre-Coeur, Arc de Triomphe, Notre-Dame | rose dusk, full moon | rain | Eiffel searchlight + twinkle burst, fog, pigeon flock, rooftop steam |
| mumbai | Sea Link bridge, Gateway of India, slum skyline | green monsoon | very heavy rain, more lightning | rain sheets sweeping across screen, crows, steam |
| newyork | Empire State, Chrysler, One WTC, Statue of Liberty | steel-blue whiteout | snow | blinking red aircraft lights, beam, steam stacks, sirens |
| tokyo | Tokyo Tower, Skytree, Mt Fuji | magenta/purple night, red sun disc | cherry petals | neon rooftop strips and sign glows, fog |
| dubai | Burj Khalifa, Burj Al Arab | amber/gold, big orange sun | sandstorm | heat haze, glints, blinking Burj lights |
Rooftop FX in world space: steam plumes, rotor downwash dust (sand in Dubai, spray over water), engine smoke at low fuel.

## 10. Audio (all procedural)
- Loops: rain/precipitation (character changes per theme), wind (follows wind strength, tornado), rotor chop (follows collective), winch ratchet (only while rope length changes), low tension drone (grows with storm intensity).
- One-shots: click, grab, rope hit, impact, rescue arpeggio, lost, warning siren, splash, chop, thunder (delayed after lightning), crash, success, fail, **gore splat**, **grip creak** (Hard), **convoy fanfare**, **gust-front whoosh**.
- Per-place ambient cue every 14-30 s: Paris church bell, Mumbai horns, NYC siren, Tokyo crossing ding, Dubai sand gust, harbor foghorn, Himalaya wind chimes.
- Not verified by a human ear.

## 11. Story mode: "THE LONG STORM"
Six chapters = missions 1-6, with a prologue, typewriter cutscenes (tap/Enter/Space advance, Esc or SKIP), in-mission radio lines, and an epilogue. Progress is saved; "RESTART STORY" wipes it. Difficulty applies. All text in `js/story.js`.

**Setup**: Eleven weeks ago the **Halcyon Institute** switched on the **Lantern Array** (forty towers on forty peaks built to steer the weather over the **Kestrel Range**). It worked for nine days; then the storm arrived and never left ("the Long Storm"). Roads are gone, radios crackle, only one old red helicopter can fly.

**Cast**: **Wren Calloway** (player, retired rescue pilot, owns a cat and a comfortable chair, flies *Moth*); **Pip** (basecamp radio dispatcher); **Dr. Imani Odera** (chief meteorologist of the Array); **Teo** (climber, "I did not scream"); **Director Hale** (Halcyon director who secretly turned the safety lock up, not off); Narrator.

**Chapters**
1. THE CALL (Kestrel Pass, mission 1): retired Wren is pulled back for three Array surveyors on the pass. Imani: the storm circles the towers as if searching for something.
2. THE DROWNED COAST (Gull Sound, mission 2): rising sea; ship Lamplighter's deck is the only safe zone. Tide logs match Array switch-on times, so someone is feeding it.
3. ROOF OF THE WORLD (Skyline Peaks, mission 3): thin air and thirsty engine. Tower log shows the safety lock was opened from inside by Hale; then the whole Range loses power.
4. LIGHTS OUT (Blackout Ridge, mission 4): total blackout, fly by flare light. Hale radios in from a research ship, admitting he "turned it up", wanting to see how big the storm could grow.
5. THE HALCYON (Midnight Tide, mission 5): the research ship is sinking; save Hale (he holds the master key). Storm feeds on the towers; the answer is at the Eye, the main tower.
6. THE EYE (The Gauntlet, mission 6): five stranded at the main tower, everything at once. The key shuts the Array down; the tornado thins and dies. Hale apologises.
Epilogue: dawn breaks "enormous, unreasonable blue"; the towers stay silent with lamps at their feet; Wren sits in the chair for nearly an hour, then Pip calls about a problem on the northern ridge ("...Put the kettle on."). THE END; Free Play keeps every mission on all difficulties.

## 12. Survivor dialogue
Event-keyed lines with cooldowns (waiting, urgent, ropeHit, grabbed, slipping, climbing, falling, tornado, rescued, landed, lost, tide, drowned). Examples: "ROPE DAY. WORST LEG DAY.", "TELL MY DOG I LOVED HIM!", "WHY IS THE ROPE ANGRY?".

## 13. UI
HUD: mission/difficulty, rescued n/total, time, score, wind meter, fuel (if used), air % (thin air), sea level (tide), `ON ROPE n/3 - LINE nm`. Banners ("RESCUED!", "CONVOY x3!", "GUST FRONT! HOLD TIGHT", "SHREDDED!"), speech bubbles, edge indicators, mission select, results screen with score breakdown, pause menu, story screen, touch buttons sized `min(54px,11vw)` rope and `min(66px,13vw)` pad (phone layout verified in 390px wide emulation).

## 14. Testing (honest status)
- `node tests/sim.mjs` 18 checks; `sim2.mjs` 38 (all 11x3 layouts, wind creep, tide, drowning, fuel, thin air, difficulty scaling, blade shredding, gibs); `multi.mjs` 19 (3-rider convoy, 4th refused, solo slip, no slip on Easy/Normal, slip on Hard, crash with riders); `story.mjs` 8. All pass.
- `node tests/matrix.mjs` runs an autopilot bot across every mission x difficulty. The bot is mediocre (struggles on flood and Hard levels) and is **not** a balance judge.
- Playwright screenshots verified every level's look and a blade kill; no console errors.
- **Not verified**: human playtest/balance, audio loudness and taste (never heard), real touch devices (only emulated).
- Test helpers set `w.escalate = false` and `w.nextSquall = 1e9` to keep old physics tests deterministic.

## 15. Version history
- v1 base game (Mountain Pass, tornado, rope rescue, chalk look, procedural audio).
- v2 six missions, Easy/Normal/Hard, tide, thin air, fuel, night.
- v3 up to 3 rope riders that climb, convoy bonus, Story mode with 6 chapters.
- v4 adjustable rope (Q/E), pixel helicopter with 3 views, ragdoll survivors and blood, rotor/fuselage kills, 5 city missions with rooftops, real-landmark parallax backdrops.
- v5 blade shredding into gibs, Hard-only grip slipping, per-city themes (tint, sky, weather, landmark lights, neon, fog, birds, haze), storm escalation + gust fronts, downwash/steam/smoke effects, many new sound effects and per-city ambient cues.

## 15b. v6 / Roadmap Phase 1 (first five minutes) — see DEVELOPMENT_ROADMAP.md
New `js/coach.js` (DOM-free): guided tutorial (6 steps read from real world state), context hints with lifetime caps, loss/crash explanations (`buildDebrief`). World gained `incidents`, `rings`, `grab_fast` and `near_miss` events. UI: coach panel, HUD zone/survivor distances and wind word, results "WHAT HAPPENED". New pilots default to Easy and get the tutorial automatically on Mountain Pass (tornado held back and clock extended while it runs). Settings: HINTS on/off, TUTORIAL replay (pause + title). Tests: `tests/coach.mjs` (49 checks).

## 16. Ideas not yet done (good next steps)
Human balance pass on Hard and gust fronts; mobile device testing; real music via `attachMusic`; story chapters for the city missions; more missions; leaderboards; settings screen for gore on/off; slow-motion hit-stop on gore; save/replay.

## 17. Gotchas for a new maintainer
- Always run through an HTTP server (ES modules).
- Keep gameplay randomness on `world.rnd`; cosmetic randomness on `world.fxRnd` so visual changes never alter simulation.
- Rope tests that teleport the helicopter must also snap the rope, or the swept rope kills survivors.
- Blood/gibs are drawn after the colour-grade tint on purpose.
- Terrain `version` and mission id key the baked-art cache in the renderer.

## 15c. v7 / Roadmap Phase 2 (medals, personal bests, results) — see DEVELOPMENT_ROADMAP.md
`js/scoring.js` (pure score formula + Bronze/Silver/Gold tiers, thresholds provisional), `js/records.js` (record rules + save migration, saveVersion 2),
`World.report()` now delegates to them and adds `breakdown`, `medal`, `medalInfo`, `remaining`, `runId`, `practice`. `Game.finishMission()` records each run once;
tutorial runs are practice (no medal, no record). Records per `mission:difficulty`: score, rescued, medal, bestTime, completions, attempts. Test: `tests/scoring.mjs`.
