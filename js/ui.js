// DOM menus, HUD, banners and results. Holds no game logic: it fires callbacks and displays values.
import { fmtTime } from './utils.js';
import { CAST } from './story.js';
import { S } from './survivors.js';
import { MEDAL_STARS, medalName } from './scoring.js';

const stars = (m) => MEDAL_STARS[m] || MEDAL_STARS[0];
const DIFF_SHORT = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' };
const li = (text, mark) => { const n = document.createElement('li'); n.textContent = text; if (mark) n.dataset.mark = mark; return n; };
/** One line describing a personal-best record (works for old records that only have score + rescued). */
export function recordText(b) {
  if (!b || (!b.score && !b.rescued && !b.completions)) return '';
  const parts = [`${b.score} pts`, `${b.rescued} rescued`];
  if (b.medal > 0) parts.push(`${stars(b.medal)} ${medalName(b.medal)}`);
  if (b.bestTime) parts.push(`best full-rescue time ${fmtTime(b.bestTime)}`);
  if (b.attempts > 0) parts.push(`${b.attempts} ${b.attempts === 1 ? 'attempt' : 'attempts'}`);
  return parts.join(' · ');
}

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
    const bt = recordText(info.best);
    e.bestLine.textContent = bt ? `BEST: ${bt}` : 'No rescues on record here. Yet.';
    if (info.medals) {
      const row = $('mMedals');
      row.replaceChildren(...Object.keys(DIFF_SHORT).map((k) => {
        const sp = document.createElement('span'); const m = info.medals[k] | 0;
        sp.textContent = `${DIFF_SHORT[k]} ${stars(m)}`; sp.title = `${DIFF_SHORT[k]}: ${m ? medalName(m) + ' medal' : 'no medal yet'}`;
        sp.setAttribute('aria-label', sp.title); if (k === info.diff) sp.className = 'cur';
        return sp;
      }));
    }
    if (info.goals) $('mGoals').replaceChildren(...info.goals.map((g) => li(`${stars(g.medal)} ${medalName(g.medal)}: ${g.text}`)));
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
    const show = (id, on) => $(id).classList.toggle('hidden', !on);
    $('resTitle').textContent = r.success ? 'MISSION COMPLETE' : 'MISSION FAILED';
    $$('resMsg', r.message);
    // medal (stars + word, so it never relies on colour)
    const med = $('resMedal'), earned = !r.practice && r.success && r.medal > 0;
    med.classList.toggle('earned', earned); med.classList.toggle('none', !earned);
    if (r.practice) { $$('resMedalStars', ''); $$('resMedalName', 'PRACTICE RUN: no medal, nothing recorded'); }
    else if (earned) { $$('resMedalStars', stars(r.medal)); $$('resMedalName', `${medalName(r.medal)} MEDAL`); }
    else { $$('resMedalStars', stars(0)); $$('resMedalName', r.success ? 'NO MEDAL' : 'NO MEDAL (MISSION FAILED)'); }
    // facts
    const half = Math.ceil(r.total / 2);
    $$('resObjLabel', `Objective: rescue ${half === r.total ? 'all' : 'at least ' + half} of ${r.total}`);
    $$('resObj', r.success ? 'MET' : 'NOT MET');
    $$('resRescued', `${r.rescued} / ${r.total}`);
    $$('resLost', String(r.lost));
    $$('resLeft', String(r.remaining));
    show('rowLeft', r.remaining > 0);
    $$('resTime', `${fmtTime(r.duration)} (limit ${fmtTime(r.timeLimit)})`);
    $$('resFuel', `${Math.round(r.fuelLeft || 0)}%`);
    show('rowFuelRes', r.hasFuel);
    $$('resScore', String(r.score));
    // breakdown, collapsed on phones
    const parts = r.breakdown || [];
    $('resParts').replaceChildren(...parts.map((p) => {
      const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td');
      a.textContent = p.label; const sm = document.createElement('small'); sm.textContent = p.detail; a.appendChild(sm);
      b.textContent = '+' + p.points; tr.append(a, b); return tr;
    }));
    $$('resPartsNote', (r.fullClear ? '' : 'Speed, flawless and fuel bonuses are only awarded when everyone is rescued and the helicopter survives. ') +
      `Nothing is ever subtracted: lost survivors and crashes just forfeit points.${r.mult ? ` Difficulty ${r.difficulty} scores x${r.mult}.` : ''}`);
    $('resBreakdown').open = window.innerWidth > 480;
    // records
    const rec = $('resRecord'), info = opts.record;
    rec.replaceChildren();
    if (r.practice) rec.textContent = 'Practice runs never change your records. Play the mission from the menu to earn a medal.';
    else if (info) {
      const fl = [];
      if (info.flags.firstClear) fl.push('FIRST COMPLETION');
      if (info.flags.newScore) fl.push('NEW BEST SCORE');
      if (info.flags.newMedal) fl.push(`NEW MEDAL: ${medalName(r.medal)}`);
      if (info.flags.newTime) fl.push('NEW BEST TIME');
      if (fl.length) { const f = document.createElement('span'); f.className = 'flags'; f.textContent = fl.join(' · '); rec.appendChild(f); }
      const prev = info.prev && info.prev.score > 0 && info.flags.newScore ? ` (previous ${info.prev.score})` : '';
      rec.append(document.createTextNode(`Best here: ${recordText(opts.best)}${prev}`));
    }
    // next medal
    const nm = r.medalInfo && r.medalInfo.next;
    if (r.practice) show('resNext', false);
    else if (!nm) { show('resNext', true); $$('resNextTitle', 'TOP MEDAL REACHED'); $('resNextList').replaceChildren(li('Gold is the highest medal. Beat your best score or time, or try a harder difficulty.')); }
    else {
      show('resNext', true);
      $$('resNextTitle', `${earned ? 'NEXT MEDAL' : 'FIRST MEDAL'}: ${stars(nm.medal)} ${medalName(nm.medal)}`);
      $('resNextList').replaceChildren(...nm.reqs.map((q) => li(q.text, q.met ? '✓' : '✗')));
    }
    const why = opts.debrief || [];
    $('resWhy').classList.toggle('hidden', !why.length);
    $('resWhyList').replaceChildren(...why.slice(0, 6).map((t) => { const n = document.createElement('li'); n.textContent = t; return n; }));
    $('nextBtn').textContent = opts.nextLabel || 'NEXT MISSION';
    $('nextBtn').classList.toggle('hidden', !(r.success && opts.hasNext));
    $('resSub').textContent = opts.sub || `${r.mission} · ${r.difficulty}`;
    this.hideAll();
    this.el.results.classList.remove('hidden');
    this.el.results.scrollTop = 0;
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
