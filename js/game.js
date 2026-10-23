// Game state machine + main loop (fixed-timestep simulation, variable-rate rendering).
import { STEP, MAX_FRAME, MAX_STEPS } from './constants.js';
import { World } from './world.js';
import { Rain } from './weather.js';
import { storage } from './storage.js';
import { MISSIONS, DIFFICULTIES, DIFF_ORDER, buildConfig } from './missions.js';
import { medalGoals } from './scoring.js';
import { CHAPTERS, introFor, outroFor } from './story.js';
import { Coach, buildDebrief, lossBanner, crashText } from './coach.js';

const FAST_EVT = [{ type: 'grab_fast' }], NO_EVT = [];

export const STATE = { STORY: 'STORY', CUTSCENE: 'CUTSCENE', TITLE: 'TITLE', PLAYING: 'PLAYING', PAUSED: 'PAUSED', SUCCESS: 'MISSION_SUCCESS', FAILED: 'MISSION_FAILED' };

const DIFF_NOTES = {
  easy: 'Gentler wind, later and smaller tornado, riders never lose their grip, more fuel. Score x0.75.',
  normal: 'The intended experience. Riders hold on tight. Score x1.',
  hard: 'Gale winds, early big tornado, riders can SLIP off the rope, thirsty engine, faster tide, smaller searchlight. Score x1.5.',
};
const HAZARD_HINTS = {
  TIDE: 'SEA IS RISING: low rocks flood first and the helicopter cannot swim.',
  'THIN AIR': 'THIN AIR: less lift up high. Hold lift and plan your climbs.',
  FUEL: 'FUEL: it burns while you fly. Hover low over the SAFE ZONE to refuel.',
  NIGHT: 'BLACKOUT: follow the flares and the edge arrows.',
};

export class Game {
  constructor({ renderer, ui, audio, input }) {
    this.renderer = renderer; this.ui = ui; this.audio = audio; this.input = input;
    this.world = new World();
    this.rain = new Rain();
    this.state = STATE.TITLE;
    const d = storage.data;
    this.mission = Math.min(Math.max(0, d.mission | 0), MISSIONS.length - 1);
    this.diff = DIFFICULTIES[d.difficulty] ? d.difficulty : 'normal';
    // brand-new pilots start on EASY (they can change it); anyone who already played keeps their saved choice
    if ((d.plays | 0) === 0 && !d.diffChosen) this.diff = 'easy';
    this.world.reset(this.mission, this.diff);
    this.coach = new Coach(storage.data);
    this.coachMark = null; this.sawFast = false; this.tutorialRequest = false;
    this.acc = 0; this.last = 0; this.titleT = 0;
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this.report = null;
    this.mode = 'free';                 // 'free' | 'story'
    this.chapter = Math.min(Math.max(0, d.storyChapter | 0), CHAPTERS.length - 1);
    this.radioShown = false;
    this.stats = { steps: 0, frames: 0 };
    this.renderer.snapCamera(this.world);
  }

  // ---------------------------------------------------------------- mission select (title screen)
  selectInfo() {
    const m = MISSIONS[this.mission];
    const best = storage.bestFor(m.id, this.diff);
    const medals = {};                                                   // earned medal per difficulty for this mission
    for (const k of DIFF_ORDER) medals[k] = storage.bestFor(m.id, k).medal;
    return {
      index: this.mission, count: MISSIONS.length, name: m.name, blurb: m.blurb, tags: m.tags,
      diff: this.diff, diffNote: DIFF_NOTES[this.diff], best, medals, goals: medalGoals(buildConfig(this.mission, this.diff)),
    };
  }

  /** Keep the weather matched to the place: mode from the theme, density rising with the storm. */
  _rain(dt) {
    const w = this.world, p = w.theme.precip;
    if (this._rainTheme !== w.theme) { this._rainTheme = w.theme; this.rain.setMode(p.mode, p.density); }
    this.rain.setDensity(p.density * (0.8 + 0.5 * w.intensity + 0.25 * (w.squall || 0)));
    this.rain.update(dt, w.wind.x);
  }

  _applySelection() {
    storage.data.mission = this.mission; storage.data.difficulty = this.diff; storage.save();
    this.world.reset(this.mission, this.diff);          // title backdrop previews the chosen mission
    this.titleT = 0;
    this.renderer.snapCamera(this.world);
    this.ui.renderSelect(this.selectInfo());
  }
  selectMission(delta) {
    this.mission = (this.mission + delta + MISSIONS.length) % MISSIONS.length;
    this._applySelection();
  }
  setDifficulty(key) {
    if (!DIFFICULTIES[key]) return;
    this.diff = key; storage.data.diffChosen = true;
    this._applySelection();
  }

  // ---------------------------------------------------------------- story mode
  get isMenuState() { return this.state === STATE.TITLE || this.state === STATE.STORY || this.state === STATE.CUTSCENE; }
  storyProgress() {
    const d = storage.data;
    const unlocked = Math.min(CHAPTERS.length, Math.max(1, d.storyUnlocked | 0));
    return { unlocked, done: !!d.storyDone, current: Math.min(this.chapter, unlocked - 1) };
  }
  storyLabel() {
    const p = this.storyProgress();
    return p.done ? 'COMPLETE: replay any chapter' : (p.unlocked === 1 && !storage.data.storyStarted ? 'A new story' : `Chapter ${p.unlocked} of ${CHAPTERS.length}`);
  }
  openStory() {
    this.state = STATE.STORY; this.mode = 'story';
    const p = this.storyProgress();
    this.chapter = p.current;
    this._backdrop(CHAPTERS[this.chapter].mission);
    this.ui.showStory(CHAPTERS, p.unlocked, this.chapter, p.done);
    this.ui.renderSelect(this.selectInfo());
  }
  _backdrop(mission) {
    this.mission = mission;
    this.world.reset(this.mission, this.diff);
    this.titleT = 0; this.renderer.snapCamera(this.world);
  }
  storyContinue() { this.startChapter(this.storyProgress().done ? CHAPTERS.length - 1 : this.storyProgress().current); }
  startChapter(i) {
    const p = this.storyProgress();
    i = Math.min(i | 0, p.unlocked - 1);
    this.mode = 'story'; this.chapter = i;
    storage.data.storyChapter = i; storage.data.storyStarted = true; storage.save();
    this._backdrop(CHAPTERS[i].mission);
    this.playCutscene(introFor(i), () => this.start(CHAPTERS[i].mission, this.diff));
  }
  storyReset() {
    storage.data.storyUnlocked = 1; storage.data.storyDone = false; storage.data.storyChapter = 0; storage.data.storyStarted = false; storage.save();
    this.chapter = 0; this.openStory();
  }
  playCutscene(pages, onDone) {
    this.state = STATE.CUTSCENE; this.input.enabled = false; this.input.clear();
    this.ui.playCutscene(pages, () => { this.last = performance.now(); onDone(); });
  }
  /** After winning chapter i: its outro (+ epilogue), then the next chapter's intro or the credits. */
  storyAdvance() {
    const i = this.chapter;
    const last = i >= CHAPTERS.length - 1;
    this.playCutscene(outroFor(i), () => { if (last) this.toTitle(); else { this.chapter = i + 1; this.startChapter(i + 1); } });
  }
  radio(text, ms = 6500) { if (this.mode === 'story' && text) this.ui.hint(text, ms); }

  // ---------------------------------------------------------------- lifecycle
  startFree() { this.mode = 'free'; this.start(this.mission, this.diff); }
  /** Only brand-new pilots (no plays on record) get the tutorial automatically, and only on the first mission. */
  _wantAutoTutorial(mission) {
    const d = storage.data;
    return mission === 0 && !d.tutorialDone && d.hints !== false && (d.plays | 0) === 0;
  }
  _touch() { return !!(this.input.usedTouch || document.body.classList.contains('touch')); }

  /**
   * opts.tutorial: true = force the guided tutorial (always Mountain Pass on EASY, saved selection untouched);
   * false = never; undefined = automatic for new pilots.
   */
  start(mission = this.mission, diff = this.diff, opts = {}) {
    const tut = opts.tutorial === true || (opts.tutorial !== false && this._wantAutoTutorial(mission));
    if (tut) { mission = 0; this.mission = 0; }
    else {
      this.mission = mission; this.diff = diff;
      storage.data.mission = mission; storage.data.difficulty = diff;
    }
    this.world.reset(mission, tut ? 'easy' : diff);
    this.world.practice = tut;                         // the guided tutorial is practice: no medals, no records
    const cfg = this.world.cfg;
    this.renderer.snapCamera(this.world);
    this.input.clear();
    this.acc = 0; this.report = null;
    this.state = STATE.PLAYING;
    this.input.enabled = true;
    this.ui.hideAll(); this.ui.showHud(true); this.ui.updateHud(this.world);
    this.ui.banner(tut ? 'TUTORIAL · MOUNTAIN PASS' : `${cfg.name} · ${cfg.diffLabel}`, 2000);
    this.coachMark = null; this.sawFast = false;
    if (tut) { this.coach.startTutorial(this.world); this.ui.hint(''); this.radioShown = false; }
    else {
      this.coach.tut = null; this.coach.reset();
      const hazards = cfg.tags.filter((t) => HAZARD_HINTS[t]).map((t) => HAZARD_HINTS[t]).join('  ');
      this.radioShown = false;
      const radio = this.mode === 'story' ? CHAPTERS[this.chapter].radio.start : '';
      if (radio && storage.data.plays > 0) this.ui.hint(radio + (hazards ? '  ' + hazards : ''), 11000);
      else if (storage.data.plays === 0 && storage.data.hints !== false) {
        const ctl = this._touch() ? 'Left/Right to tilt · Lift to rise · Touch the hook to a survivor (up to 3 can ride), then lower them into the SAFE ZONE'
          : 'A/D tilt & thrust · W/Space lift · S descend · Q/E shorten/lengthen rope · Touch the hook to a survivor GENTLY (they climb the rope, up to 3), then lower them into the SAFE ZONE';
        this.ui.hint((radio ? radio + '  ' : '') + ctl + (hazards ? '  ' + hazards : ''), 16000);
      } else if (hazards) this.ui.hint(hazards, 9000);
      else this.ui.hint('');
    }
    storage.data.plays++; storage.save();
  }

  /** Replay the guided tutorial from the title or pause menu. */
  replayTutorial() { this.mode = 'free'; this.start(0, this.diff, { tutorial: true }); }
  skipTutorial() {
    if (!this.coach.tutorialActive) return;
    this.coach.endTutorial(); this.coachMark = null; this.ui.setCoach(null); storage.save();
    this.ui.banner('TUTORIAL SKIPPED · HINTS STAY ON (PAUSE MENU)', 2200);
  }
  toggleHints() {
    storage.data.hints = storage.data.hints === false; storage.save();
    this.ui.setHintsLabel(storage.data.hints !== false);
    if (storage.data.hints === false && !this.coach.tutorialActive) { this.coach.current = null; this.ui.setCoach(null); }
  }

  restart() { this.audio.click(); this.start(this.mission, this.diff, this.coach.tutorialActive ? { tutorial: true } : { tutorial: false }); }
  hasNext() { return this.mode === 'story' ? true : this.mission < MISSIONS.length - 1; }
  next() {
    this.audio.click();
    if (this.mode === 'story') { this.storyAdvance(); return; }
    if (this.hasNext()) this.start(this.mission + 1, this.diff); else this.toTitle();
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED; this.input.enabled = false; this.input.clear();
    this.ui.setCoach(null);
    this.ui.showPause(true);
  }
  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING; this.input.enabled = true; this.acc = 0; this.last = performance.now();
    this.ui.showPause(false);
  }
  togglePause() {
    if (this.state === STATE.PLAYING) this.pause();
    else if (this.state === STATE.PAUSED) this.resume();
  }

  toTitle() {
    this.mode = 'free';
    this.state = STATE.TITLE; this.input.enabled = false; this.input.clear();
    this.world.reset(this.mission, this.diff); this.renderer.snapCamera(this.world);
    this.titleT = 0;
    this.ui.showHud(false); this.ui.hint('');
    this.ui.showTitle(this.selectInfo());
    this.ui.setStoryProgress(this.storyLabel());
  }

  // ---------------------------------------------------------------- loop
  frame(now) {
    const dtReal = Math.min(MAX_FRAME, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.stats.frames++;
    this._fpsAcc += dtReal; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }

    if (this.state === STATE.PLAYING) {
      this.acc += dtReal;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        const sample = this.input.poll(STEP);
        this.world.step(STEP, sample);
        this.acc -= STEP; steps++;
        this.stats.steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;       // spiral-of-death guard
      this._rain(dtReal);
      this.handleEvents();
      const wasTut = this.coach.tutorialActive;
      const info = this.coach.update(this.world, dtReal, this._touch(), this.sawFast ? FAST_EVT : NO_EVT);
      this.sawFast = false;
      this.ui.setCoach(info);
      this.coachMark = info && info.mark ? info : null;
      if (info && info.fresh) { storage.save(); this.audio.tick(); }
      if (wasTut && !this.coach.tutorialActive) {
        storage.save();
        if (this.world.rescuedCount > 0) this.ui.banner('TUTORIAL COMPLETE', 1800);
      }
      this.ui.updateHud(this.world);
      if (this.world.ended && this.world.endTimer > 1.7) this.finishMission();
      this.audio.update(this.world, true);
    } else if (this.state === STATE.CUTSCENE) {
      this.ui.tickCutscene(dtReal);
      this.titleT += dtReal;
      this.world.wind.update(dtReal, this.titleT);
      this.world.heli.rotor += dtReal * 20;
      this.world.debris.update(dtReal, this.world);
      this._rain(dtReal);
      this.audio.update(this.world, null);
    } else if (this.state === STATE.TITLE || this.state === STATE.STORY) {
      // living backdrop: rain, wind, rotor idle, waves — no mission simulation
      this.titleT += dtReal;
      this.world.wind.update(dtReal, this.titleT);
      this.world.heli.rotor += dtReal * 20;
      this.world.debris.update(dtReal, this.world);
      this._rain(dtReal);
      this.audio.update(this.world, null);
    } else if (this.state === STATE.SUCCESS || this.state === STATE.FAILED) {
      // results screen: let the aftermath settle visually
      this.world.step(STEP, { x: 0, lift: 0, ropeToggle: false });
      this._rain(dtReal);
      this.world.events.length = 0;
      this.audio.update(this.world, false);
    } else {
      this.audio.update(this.world, false);       // paused: frozen world, silent loops
    }

    if (this.isMenuState) this.renderer.cam.x += (500 - this.renderer.cam.x) * 0.05;
    else this.renderer.updateCamera(this.world, dtReal);
    this.renderer.render(this);
  }

  handleEvents() {
    const w = this.world, a = this.audio;
    for (let i = 0; i < w.events.length; i++) {
      const e = w.events[i];
      switch (e.type) {
        case 'tornado_warning': this.ui.banner('TORNADO FORMING!', 3200, true); a.warning(); if (this.mode === 'story') this.radio(CHAPTERS[this.chapter].radio.tornado, 6000); break;
        case 'tornado_appear': this.ui.banner('IT IS HERE.', 1800); a.thunder(); break;
        case 'impact': a.impact(e.strength); break;
        case 'rope_hit': a.ropeHit(e.strength); break;
        case 'grab': a.grab(); a.hooked(); this.ui.banner('HOOKED! THEY CLIMB BY THEMSELVES', 1100); break;
        case 'grab_fast': a.tooFast(); this.sawFast = true; break;
        case 'near_miss': a.nearMiss(); this.ui.banner(`SO CLOSE! ${Math.round(e.dist / 10)} m FROM THE SAFE ZONE`, 1700, true); break;
        case 'rescued':
          a.rescue(); this.ui.banner('RESCUED!  +' + e.points, 1200);
          if (this.mode === 'story' && !this.radioShown) { this.radioShown = true; this.radio(CHAPTERS[this.chapter].radio.rescue, 5000); }
          break;
        case 'squall': this.ui.banner('GUST FRONT!  HOLD TIGHT', 2200, true); a.squall && a.squall(); break;
        case 'convoy': this.ui.banner(`CONVOY x${e.n}!  +${e.bonus}`, 1800); a.fanfare(e.n); break;
        case 'lost':
          if (e.cause === 'drowned') a.splash();
          else if (e.cause === 'blades' || e.cause === 'crushed') a.chop();
          else a.lost();
          this.ui.banner(lossBanner(e.cause), 1700, true);
          break;
        case 'dropped': a.lost(); if (e.reason !== 'crash') this.ui.banner(e.reason === 'slipped' ? 'THEY SLIPPED!' : 'DROPPED!', 1100); break;
        case 'lightning': a.thunderLater(); break;
        case 'gore': a.gore(); break;
        case 'heli_crash': a.crash(); this.ui.banner(e.reason === 'water' ? 'SPLASH!' : 'CRASH!', 1500); this.ui.hint(crashText(e.reason, w.fuelOut), 6000); break;
        case 'low_fuel': a.warning(); this.ui.banner(e.level > 1 ? 'FUEL CRITICAL!' : 'LOW FUEL: HOVER OVER THE SAFE ZONE', 2200, true); break;
        case 'out_of_fuel': a.crash(); this.ui.banner('ENGINE OUT!', 2500, true); break;
        case 'refueled': a.rescue(); this.ui.banner('ENGINE RESTARTED', 1500); break;
        case 'end': break;
      }
    }
    w.events.length = 0;
  }

  finishMission() {
    const w = this.world;
    if (this._finishedRun === w.runId) return;           // a run is processed exactly once (no duplicate records)
    this._finishedRun = w.runId;
    const r = w.report();
    this.report = r;
    const cfg = w.cfg;
    let rec = null;                                      // { rec, prev, flags } for real runs; null for practice
    if (!r.practice) {
      rec = storage.recordRun(cfg.id, cfg.diffKey, { success: r.success, score: r.score, rescued: r.rescued, medal: r.success ? r.medal : 0, duration: r.duration, fullClear: r.fullClear });
    }
    const newBest = !!(rec && rec.flags.newScore);
    storage.data.hintsDone = true;
    let nextLabel = 'NEXT MISSION', sub;
    if (this.mode === 'story') {
      const ch = CHAPTERS[this.chapter];
      sub = `Chapter ${this.chapter + 1}: ${ch.title} · ${cfg.diffLabel}`;
      nextLabel = this.chapter >= CHAPTERS.length - 1 ? 'FINISH THE STORY' : 'CONTINUE THE STORY';
      if (r.success) {
        const unlocked = Math.min(CHAPTERS.length, this.chapter + 2);
        storage.data.storyUnlocked = Math.max(storage.data.storyUnlocked | 0, unlocked);
        if (this.chapter >= CHAPTERS.length - 1) storage.data.storyDone = true;
        storage.data.storyChapter = Math.min(this.chapter + 1, CHAPTERS.length - 1);
      }
    }
    storage.save();
    this.state = r.success ? STATE.SUCCESS : STATE.FAILED;
    this.input.enabled = false; this.input.clear();
    this.ui.hint('');
    this.audio[r.success ? 'success' : 'fail']();
    this.ui.showResults(r, { newBest, record: rec, best: storage.bestFor(cfg.id, cfg.diffKey), hasNext: this.hasNext(), nextLabel, sub, debrief: buildDebrief(this.world) });
  }
}

export { DIFF_ORDER };
