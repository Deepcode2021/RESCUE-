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
| Save data (single LocalStorage key `rescue-game.v1`) | `storage.js`, `records.js` |
| Scoring and medals (Phase 2, pure functions) | `scoring.js`, `records.js`, results UI in `ui.js` |
| Onboarding (Phase 1) | `coach.js` + hooks in `game.js`, `ui.js`, `renderer.js`, `world.js` |

## Baseline (Phase 0, before any change this run)
`node tests/sim.mjs` 18/18, `sim2.mjs` 38/38, `multi.mjs` 19/19, `story.mjs` 8/8; `node --check` on every `js/*.js` passes.
`tests/matrix.mjs` (autopilot) runs but the bot is not a balance judge: it fails often on flood/Hard missions.

## Known bugs / risks
- No human playtest has been done. Balance (Hard slipping, gust fronts), audio levels and real touch devices are unverified.
- Autopilot struggles on flood levels (Paris, Mumbai) and Hard; untuned, not evidence of a physics bug.
- Determinism (for Phase 6): gameplay uses `world.rnd`, cosmetics use `world.fxRnd`. Remaining `Math.random()` calls (grep-verified) are in audio, particles, weather precipitation, renderer shake, and gore/ragdoll kicks in `world.js`/`ragdoll.js`. The gore ones move a *dead* survivor's ragdoll, so they must be re-checked before a daily-seed run is called deterministic.
- Results panel is tall on small phones (scrolls).
- (Fixed in Phase 2) Tutorial runs used to count as Easy personal bests; they are now practice runs and record nothing.

## Phases
| # | Phase | Status | Tests required |
|---|---|---|---|
| 0 | Audit and baseline | DONE | baseline suite |
| 1 | First five minutes (tutorial, hints, feedback, explanations) | DONE | `tests/coach.mjs` + all existing suites + browser flow |
| 2 | Medals, personal bests, results | DONE (this run) | `tests/scoring.mjs` + all existing suites + browser flow |
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

## Phase 2 summary: medals, personal bests, results

### Score formula (`js/scoring.js`, pure; the simulation is unchanged)
`score = rescue + clean + convoy + speed + flawless + fuel`, every part is >= 0 so the total can never be negative. M = difficulty multiplier (Easy 0.75, Normal 1, Hard 1.5).

| Part | Points | Condition |
|---|---|---|
| Rescue | 100 x M per survivor delivered | always |
| Clean pickup | 50 x M per delivered survivor who was never dropped | always |
| Convoy | 40 x (n-1) x M when n riders hop off together | accrued live by the world (unchanged) |
| Speed | 2 x M per second under par (par = 40 s x survivors + 20 s) | only if everyone is rescued AND no crash |
| Flawless | 250 x M | everyone rescued, nobody ever dropped, no crash |
| Fuel | 0.8 x M per % fuel left (max 80 x M) | fuel missions only, everyone rescued, no crash |

Limits and rules: nothing is ever subtracted (losing people or crashing only forfeits points and bonuses); speed only counts for a complete, intact rescue, so rushing and dropping people scores less than a careful run (tested: a slow clean run outscores a very fast run with several drops); a run is a "completion" when at least half are rescued without crashing first, or everyone is rescued (the same rule the game always used). The rescue/clean/convoy parts equal the live in-game score; speed and flawless equal the old time/perfect bonuses. The new fuel part is the only addition, so Fuel-mission scores rise by up to 80 x M on complete clears. Invalid inputs (NaN, negative, too large) are clamped.

### Medals (PROVISIONAL, not validated by playtesting)
- Bronze: rescue at least half (rounded up) and do not crash before everyone is saved (identical to a mission "completion").
- Silver: rescue everyone and bring the helicopter home intact.
- Gold: Silver, plus never drop a survivor, plus finish within 80% of the mission time limit (`GOLD_TIME_FRACTION`).
- No medal for failed or abandoned runs. Practice (tutorial) runs never earn medals.
- Shown as stars AND words (monochrome): `☆☆☆` none, `★☆☆` BRONZE, `★★☆` SILVER, `★★★` GOLD.
- Briefing: mission card shows medals earned per difficulty and a "MEDAL GOALS (provisional)" list. Results: earned medal, the checklist for the next medal (with met/unmet marks) and its requirements.

### Personal bests (`js/records.js`, `js/storage.js`)
Per `"<missionId>:<difficulty>"` in the existing `bests` object: `{ score, rescued, medal, bestTime, completions, attempts }`.
- `attempts` counts every non-practice finished run; `rescued` is the maximum ever.
- A successful run raises `score` and `medal` only if higher; a failed run never changes them (before the first completion a failed run may keep a partial score).
- `bestTime` is updated only by a FULL clear (everyone rescued, no crash), only if faster, only for the same mission and difficulty.
- Story and free play share one record per mission + difficulty (documented choice). Tutorial/practice runs record nothing. A run id guard stops the same finished run being recorded twice.
- Migration (`migrateSave`, idempotent, run on every load): old `{score, rescued}` records are upgraded in place; malformed records/`bests`/numbers are sanitised or fall back to defaults; numbers stored as text are recovered; story progress is never touched. Save stamped `saveVersion: 2`.

### Files
New: `js/scoring.js`, `js/records.js`, `tests/scoring.mjs`. Modified: `js/world.js` (report via scoring, `runId`, `practice`), `js/storage.js`, `js/game.js` (once-only processing, practice, briefing info), `js/ui.js`, `index.html`, `style.css` (results, briefing; screens now scroll from the top instead of clipping a tall panel).

### Test results (actually run this session)
`node tests/scoring.mjs` 129/129; `sim.mjs` 18/18; `sim2.mjs` 38/38; `multi.mjs` 19/19; `story.mjs` 8/8; `coach.mjs` 49/49; `node --check` clean on every `js/*.js` and `tests/*.mjs`.
Three of my own new assertions failed on the first run and were corrected as test-authoring mistakes, not to bend code: a wrong arithmetic expectation (hard-run score), a wrong assumption about which difficulty the post-tutorial run uses, and an assumed property "gold time >= par time" that is not a requirement (it is false on Mumbai Normal/Hard, now logged as an INFO note instead of asserted).
Browser (Playwright/Chromium, scripted, 1000x600 and 390x844, no console errors): title medal row + goals, gold/silver/failed/practice results, Enter/R keys, focus on the primary button, records persisting through a reload, no horizontal overflow, buttons reachable by scrolling. Runs were finished programmatically (survivors delivered through the real rules, `finish()`), not flown by hand.

### Known limitations / manual playtesting needed
- Medal thresholds, the 80% gold time and the fuel bonus scale are untested guesses; need real players.
- Gold time is tighter than the par time on Mumbai Normal and Hard (216 s / 194 s vs par 220 s): a clean gold there also implies a speed bonus.
- Legacy records cannot be told apart as success or failure: they keep their score, start at medal 0, `completions` 0.
- Records are not kept per input device or per story-vs-free mode.
- Results panel still scrolls on short screens (desktop 600 px high needs a small scroll to reach the buttons).
- Real touch devices and a human playthrough of the full results flow are untested.
