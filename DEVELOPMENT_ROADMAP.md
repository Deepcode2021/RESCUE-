# RESCUE? — Development Roadmap

Source of truth: `RESCUE_GAME_BRIEF.md` + the code. Rule: one phase per run, stop at the checkpoint.
Not a Git repository (no commits were made).

## Existing systems (verified in the repo)
| System | Files |
|---|---|
| Fixed-timestep simulation (DOM-free) | `js/world.js`, `js/constants.js` |
| Helicopter, rope (Verlet), survivors, ragdoll | `helicopter.js`, `rope.js`, `survivors.js`, `ragdoll.js` |
| Terrain (mountain, sea, city rooftops) | `terrain.js`, `missions.js` (11 missions, 3 difficulties) |
| Hazards: wind, tornado, tide, thin air, fuel, night, gust fronts | `weather.js`, `tornado.js`, `world.js` |
| Rendering, parallax art, themes, particles | `renderer.js`, `cityart.js`, `sprites.js`, `themes.js`, `themefx.js`, `particles.js` |
| Audio (procedural) | `audio.js` |
| Story "The Long Storm" (6 chapters) | `story.js`, `game.js`, `ui.js` |
| Save data (single LocalStorage key `rescue-game.v1`) | `storage.js` |
| Onboarding (Phase 1) | `coach.js` + hooks in `game.js`, `ui.js`, `renderer.js`, `world.js` |

## Baseline (Phase 0, before any change this run)
`node tests/sim.mjs` 18/18, `sim2.mjs` 38/38, `multi.mjs` 19/19, `story.mjs` 8/8; `node --check` on every `js/*.js` passes.
`tests/matrix.mjs` (autopilot) runs but the bot is not a balance judge: it fails often on flood/Hard missions.

## Known bugs / risks
- No human playtest has been done. Balance (Hard slipping, gust fronts), audio levels and real touch devices are unverified.
- Autopilot struggles on flood levels (Paris, Mumbai) and Hard; untuned, not evidence of a physics bug.
- Determinism (for Phase 6): gameplay uses `world.rnd`, cosmetics use `world.fxRnd`. Remaining `Math.random()` calls (grep-verified) are in audio, particles, weather precipitation, renderer shake, and gore/ragdoll kicks in `world.js`/`ragdoll.js`. The gore ones move a *dead* survivor's ragdoll, so they must be re-checked before a daily-seed run is called deterministic.
- Results panel is tall on small phones (scrolls).
- Tutorial runs on Easy via a forced config; its run still counts as an Easy run for personal bests.

## Phases
| # | Phase | Status | Tests required |
|---|---|---|---|
| 0 | Audit and baseline | DONE | baseline suite |
| 1 | First five minutes (tutorial, hints, feedback, explanations) | DONE (this run) | `tests/coach.mjs` + all existing suites + browser flow |
| 2 | Medals, personal bests, results | TODO | medal criteria, persistence, legacy save |
| 3 | Flight recorder and incident replay | TODO | bounded buffer, no mutation of live world |
| 4 | Cinematic scene framework (Chapter 1 opening) | TODO | skip, reset, camera restore |
| 5 | Character continuity and story flags | TODO | save compatibility, no duplicate flags |
| 6 | Seeded daily challenge | TODO | same date = same setup, separate bests |
| 7 | Shareable incident report | TODO | content matches run, export fallback |
| 8 | Accessibility, gore setting, portal readiness | TODO | setting persistence, non-graphic mode |
| 9 | Human playtest, audio, final polish | TODO | manual checklist (needs real players) |

## Phase 1 summary (what exists now)
1. Skippable interactive tutorial (6 steps, real world state, pointer markers). Automatic for brand-new pilots (no plays on record) on Mountain Pass; replayable from title and pause menu; `T` or SKIP button skips it.
2. Context hints: lift, steer, rope too high / too low, too fast, fly to zone (true distance), lower in, more riders. Each shows at most 3 times in a lifetime; HINTS ON/OFF setting.
3. Feedback: HOOKED! popup, ring and chime; delivery ring; TOO FAST! popup + sound; near-miss banner with real distance.
4. Exact grab-range ring around nearby survivors (red when the hook is too fast), drop-off box over the pad while riders are aboard.
5. Loss/crash/time-out explanations: banner per cause, crash explanation line, "WHAT HAPPENED" list on the results screen.
6. HUD: objective with survivors left, wind word, zone and nearest-survivor distance.
7. Quick restart: RETRY (R), Enter = primary results button (retry on failure, next on success).
8. First-mission pacing: during the tutorial the tornado and gust fronts are held back (tornado arrives about 25 s after it ends) and the clock is extended; new pilots default to Easy. Later missions are unchanged.
