// LocalStorage wrapper for settings and personal-best records. Safe when storage is unavailable.
import { applyRun, cleanRecord, migrateSave } from './records.js';
const KEY = 'rescue-game.v1';
const defaults = { muted: false, bestScore: 0, bestRescued: 0, hintsDone: false, plays: 0, mission: 0, difficulty: 'normal', bests: {}, storyUnlocked: 1, storyDone: false, storyChapter: 0,
  // v6 onboarding settings (older saves simply pick these defaults up through Object.assign in load())
  hints: true, tutorialDone: false, hintSeen: {}, diffChosen: false };

export const storage = {
  data: { ...defaults },
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(this.data, migrateSave(parsed));
      }
    } catch (e) { /* storage blocked or corrupt: fall back to defaults */ }
    migrateSave(this.data);
    return this.data;
  },
  /** Personal-best record for a mission/difficulty pair: { score, rescued, medal, bestTime, completions, attempts } (zeros when never played). */
  bestFor(id, diff) { return cleanRecord(this.data.bests && this.data.bests[id + ':' + diff]); },
  /**
   * Record one finished run. run = { success, score, rescued, medal, duration, fullClear }.
   * Returns { rec, prev, flags }. Practice/tutorial runs must not be passed in (the game filters them).
   */
  recordRun(id, diff, run) {
    if (!this.data.bests || typeof this.data.bests !== 'object') this.data.bests = {};
    const out = applyRun(this.data.bests[id + ':' + diff], run);
    this.data.bests[id + ':' + diff] = out.rec;
    this.save();
    return out;
  },
  /** Legacy helper kept for compatibility: record a completed run by score only; true when it beat the previous best score. */
  recordBest(id, diff, score, rescued) {
    return this.recordRun(id, diff, { success: true, score, rescued, medal: 0, duration: 0, fullClear: false }).flags.newScore;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },
};
