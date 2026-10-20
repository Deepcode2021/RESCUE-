// DOM menus, HUD, banners and results. Holds no game logic: it fires callbacks and displays values.
import { fmtTime } from './utils.js';
import { CAST } from './story.js';
import { S } from './survivors.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      title: $('title'), pause: $('pause'), results: $('results'), hud: $('hud'), touch: $('touch'),
      banner: $('banner'), hint: $('hint'),
      rescued: $('hudRescued'), time: $('hudTime'), score: $('hudScore'), objective: $('hudObjective'),
      windArrow: $('windArrow'), windBar: $('windBar'),
      bestLine: $('bestLine'),
      mNum: $('mNum'), mName: $('mName'), mDesc: $('mDesc'), mTags: $('mTags'), diffNote: $('diffNote'),
      hudMission: $('hudMission'), hudRope: $('hudRope'), hudLine: $('hudLine'),
      story: $('story'), chapterList: $('chapterList'), storyProg: $('storyProg'), storyContinue: $('storyContinue'),
      cutscene: $('cutscene'), csCard: $('csCard'), csCh: $('csCh'), csTitle: $('csTitle'), csPlace: $('csPlace'),
      csBox: $('csBox'), csWho: $('csWho'), csText: $('csText'), csNext: $('csNext'),
      windWord: $('windWord'), hudNav: $('hudNav'), coach: $('coach'), coachStep: $('coachStep'), coachText: $('coachText'), coachSkip: $('coachSkip'),
      rowFuel: $('rowFuel'), fuelBar: $('fuelBar'), rowSea: $('rowSea'), hudSea: $('hudSea'), rowAir: $('rowAir'), hudAir: $('hudAir'),
    };
    this.cache = {};
    this.bannerTimer = 0; this.hintTimer = 0;
    $('app').addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const fn = this.h[b.dataset.action];
      if (fn) fn(b.dataset.arg);
    });
  }

  _set(key, el, text) { if (this.cache[key] !== text) { el.textContent = text; this.cache[key] = text; } }

  showTitle(info) {
    this.hideAll();
    this.el.title.classList.remove('hidden');
    this.renderSelect(info);
  }

  /** Mission card + difficulty buttons + best score for the current selection. */
  renderSelect(info) {
    const e = this.el;
    e.mNum.textContent = `MISSION ${info.index + 1} / ${info.count}`;
    e.mName.textContent = info.name;
    e.mDesc.textContent = info.blurb;
    e.mTags.replaceChildren(...info.tags.map((t) => { const s = document.createElement('span'); s.textContent = t; return s; }));
    document.querySelectorAll('.diff [data-diff]').forEach((b) => b.classList.toggle('active', b.dataset.diff === info.diff));
    e.diffNote.textContent = info.diffNote;
    e.bestLine.textContent = info.best.score > 0 ? `BEST: ${info.best.score} pts · ${info.best.rescued} rescued` : 'No rescues on record here. Yet.';
  }
  hideAll() {
    for (const k of ['title', 'pause', 'results', 'story', 'cutscene']) this.el[k].classList.add('hidden');
    this.setCoach(null);
  }
  showHud(on) {
    this.el.hud.classList.toggle('hidden', !on);
    this.el.touch.classList.toggle('hidden', !on);
  }
  showPause(on) { this.el.pause.classList.toggle('hidden', !on); }

  setHintsLabel(on) {
    document.querySelectorAll('[data-hints-label]').forEach((s) => { s.textContent = on ? 'HINTS: ON' : 'HINTS: OFF'; });
  }

  /** info = {kind:'tutorial'|'hint', text, step, total} or null. Tutorial shows a step counter and a skip button. */
  setCoach(info) {
    const e = this.el, c = e.coach;
    if (!info) { if (!c.classList.contains('hidden')) { c.classList.add('hidden'); this.cache.coach = null; } return; }
    const key = info.kind + '|' + info.text + '|' + (info.step || 0);
    if (this.cache.coach === key) return;
    this.cache.coach = key;
    c.classList.remove('hidden');
    c.classList.toggle('hintonly', info.kind !== 'tutorial');
    e.coachStep.textContent = info.kind === 'tutorial' ? `TUTORIAL ${info.step} / ${info.total}` : '';
    e.coachText.textContent = info.text;
  }

  setSoundLabel(muted) {
    document.querySelectorAll('[data-sound-label]').forEach((s) => { s.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'; });
  }

  updateHud(world) {
    this._set('r', this.el.rescued, `${world.rescuedCount}/${world.total}`);
    this._set('t', this.el.time, fmtTime(world.ended ? world.endTime : world.time));
    this._set('s', this.el.score, String(world.score));
    const nr = world.riders.length;
    this._set('rope', this.el.hudRope, `${nr}/3`);
    this._set('line', this.el.hudLine, `· LINE ${Math.round(world.rope.length() / 10)}m`);
    const left = world.remaining;
    const obj = nr ? (nr < 3 && world.canGrab() && left > nr ? `${nr} ON ROPE: HOOK MORE, OR LOWER THEM INTO THE SAFE ZONE` : `${nr} ON ROPE: LOWER THEM INTO THE SAFE ZONE`) : (left === 0 ? 'MISSION COMPLETE' : `HOOK A SURVIVOR GENTLY · ${left} LEFT`);
    this._set('o', this.el.objective, obj);
    const cfg = world.cfg;
    this._set('hm', this.el.hudMission, `${cfg.name} · ${cfg.diffLabel}`);
    if (cfg.fuel) {
      this.el.rowFuel.classList.remove('hidden');
      const f = Math.round(world.fuel);
      if (this.cache.fuel !== f) { this.el.fuelBar.style.width = f + '%'; this.cache.fuel = f; this.el.fuelBar.parentElement.classList.toggle('low', f <= 25 && !world.refueling); }
    } else this.el.rowFuel.classList.add('hidden');
    if (cfg.tide) {
      this.el.rowSea.classList.remove('hidden');
      const rise = Math.round(world.terrain.waterBase - world.terrain.waterY);
      this._set('sea', this.el.hudSea, '+' + rise);
    } else this.el.rowSea.classList.add('hidden');
    if (cfg.thin > 0) {
      this.el.rowAir.classList.remove('hidden');
      const a = Math.round(world.air * 100);
      this._set('air', this.el.hudAir, a + '%');
      this.el.rowAir.classList.toggle('warn', a < 85);
    } else this.el.rowAir.classList.add('hidden');
    const wx = world.wind.x, s = world.wind.strength;
    const arrows = (wx >= 0 ? '→' : '←').repeat(1 + Math.round(s * 2));
    this._set('wa', this.el.windArrow, arrows);
    this._set('ww', this.el.windWord, s < 0.2 ? 'CALM' : s < 0.5 ? 'BREEZY' : s < 0.8 ? 'STRONG' : 'GALE');
    // distance to the safe zone and to the nearest survivor that still needs help (10 world units = 1 m)
    const hx = world.heli.x, pad = world.terrain.pad;
    let nd = Infinity, ns = 0;
    for (const sv of world.survivors) if ((sv.state === S.WAITING || sv.state === S.FALLING) && Math.abs(sv.x - hx) < nd) { nd = Math.abs(sv.x - hx); ns = sv.x - hx; }
    const zd = pad.cx - hx;
    this._set('nav', this.el.hudNav, `ZONE ${zd < 0 ? '◀' : '▶'} ${Math.round(Math.abs(zd) / 10)} m` + (nd < Infinity ? `  ·  SURVIVOR ${ns < 0 ? '◀' : '▶'} ${Math.round(nd / 10)} m` : ''));
    const pct = Math.round(s * 100);
    if (this.cache.wb !== pct) { this.el.windBar.style.width = pct + '%'; this.cache.wb = pct; }
  }

  banner(text, ms = 2200, warn = false) {
    const b = this.el.banner;
    b.textContent = text; b.classList.add('show'); b.classList.toggle('warn', warn);
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show', 'warn'), ms);
  }

  hint(text, ms) {
    const h = this.el.hint;
    clearTimeout(this.hintTimer);
    if (!text) { h.classList.add('hidden'); return; }
    h.textContent = text; h.style.opacity = 1; h.classList.remove('hidden');
    this.hintTimer = setTimeout(() => { h.style.opacity = 0; setTimeout(() => h.classList.add('hidden'), 650); }, ms);
  }

  showResults(r, opts) {
    const $$ = (id, v) => { $(id).textContent = v; };
    $('resTitle').textContent = r.success ? 'MISSION COMPLETE' : 'MISSION FAILED';
    $('resSub').textContent = `${r.mission} · ${r.difficulty}`;
    $$('resMsg', r.message);
    $$('resRescued', `${r.rescued} / ${r.total}`);
    $$('resLost', String(r.lost));
    $$('resTime', fmtTime(r.duration));
    $$('resEff', r.efficiency + '%');
    const bonus = [];
    if (r.timeBonus) bonus.push(`speed +${r.timeBonus}`);
    if (r.convoyBonus) bonus.push(`convoy +${r.convoyBonus}`);
    if (r.perfectBonus) bonus.push(`flawless +${r.perfectBonus}`);
    $$('resBonus', bonus.length ? bonus.join(', ') : '—');
    $$('resScore', String(r.score));
    $('resBest').textContent = opts.newBest ? 'NEW BEST SCORE!' : `Best here: ${opts.best.score} pts · ${opts.best.rescued} rescued`;
    const why = opts.debrief || [];
    $('resWhy').classList.toggle('hidden', !why.length);
    $('resWhyList').replaceChildren(...why.slice(0, 6).map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
    $('nextBtn').textContent = opts.nextLabel || 'NEXT MISSION';
    $('nextBtn').classList.toggle('hidden', !(r.success && opts.hasNext));
    $('resSub').textContent = opts.sub || `${r.mission} · ${r.difficulty}`;
    this.hideAll();
    this.el.results.classList.remove('hidden');
    this.showHud(false);
    this.setCoach(null);
    const primary = $(r.success && opts.hasNext ? 'nextBtn' : 'retryBtn'); if (primary) primary.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ story: chapter list
  /** chapters: [{title, place, synopsis}], unlocked = how many are playable, done = story finished */
  showStory(chapters, unlocked, current, done) {
    this.hideAll();
    this.el.story.classList.remove('hidden');
    this.el.chapterList.replaceChildren(...chapters.map((c, i) => {
      const b = document.createElement('button');
      b.className = 'chap' + (i === current ? ' current' : '') + (i < unlocked - (done ? 0 : 1) || (done) ? ' done' : '');
      b.disabled = i >= unlocked;
      b.dataset.action = 'storyChapter'; b.dataset.arg = String(i);
      const t = document.createElement('b'); t.textContent = `${i + 1}. ${i < unlocked ? c.title : '???'}`;
      const s = document.createElement('small'); s.textContent = i < unlocked ? `${c.place}: ${c.synopsis}` : 'Locked. Finish the previous chapter.';
      b.append(t, s);
      return b;
    }));
    const next = Math.min(current, unlocked - 1);
    this.el.storyContinue.textContent = done ? 'REPLAY LAST CHAPTER' : (unlocked === 1 && current === 0 ? 'BEGIN' : `CONTINUE: CHAPTER ${next + 1}`);
  }
  setStoryProgress(text) { this.el.storyProg.textContent = text; }

  // ------------------------------------------------------------------ story: cutscene player (typewriter)
  /** pages: [{card,title,place} | {who,text}]; onDone fires after the last page or on skip. */
  playCutscene(pages, onDone) {
    this.hideAll(); this.showHud(false);
    this.cs = { pages, i: -1, onDone, text: '', shown: 0, t: 0, typing: false, done: false };
    this.el.cutscene.classList.remove('hidden');
    this.advanceCutscene();
  }
  get inCutscene() { return !!(this.cs && !this.cs.done); }
  advanceCutscene() {
    const c = this.cs; if (!c || c.done) return;
    if (c.typing && c.i >= 0 && c.pages[c.i].text) { c.shown = c.text.length; this._csRender(); c.typing = false; return; }   // first tap finishes the line
    c.i++;
    if (c.i >= c.pages.length) return this.skipCutscene();
    const p = c.pages[c.i], e = this.el;
    if (p.card) {
      e.csCard.classList.remove('hidden'); e.csBox.classList.add('hidden');
      e.csCh.textContent = p.card; e.csTitle.textContent = p.title; e.csPlace.textContent = p.place;
      c.typing = false;
    } else {
      e.csCard.classList.add('hidden'); e.csBox.classList.remove('hidden');
      c.text = p.text; c.shown = 0; c.t = 0; c.typing = true;
      e.csWho.textContent = CAST[p.who] || '';
      e.csText.classList.toggle('narr', p.who === 'NARRATOR');
      this._csRender();
    }
  }
  _csRender() { this.el.csText.textContent = this.cs.text.slice(0, this.cs.shown); }
  tickCutscene(dt) {
    const c = this.cs; if (!c || c.done || !c.typing) return;
    c.t += dt; c.shown = Math.min(c.text.length, Math.floor(c.t * 55));
    this._csRender();
    if (c.shown >= c.text.length) c.typing = false;
  }
  skipCutscene() {
    const c = this.cs; if (!c || c.done) return;
    c.done = true;
    this.el.cutscene.classList.add('hidden');
    const f = c.onDone; if (f) f();
  }
}
