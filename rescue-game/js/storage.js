// LocalStorage wrapper for settings and best scores. Safe when storage is unavailable.
const KEY = 'rescue-game.v1';
const defaults = { muted: false, bestScore: 0, bestRescued: 0, hintsDone: false, plays: 0, mission: 0, difficulty: 'normal', bests: {}, storyUnlocked: 1, storyDone: false, storyChapter: 0 };

export const storage = {
  data: { ...defaults },
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* storage blocked or corrupt: fall back to defaults */ }
    return this.data;
  },
  /** Best result for a mission/difficulty pair: { score, rescued } (zeros when never played). */
  bestFor(id, diff) { return (this.data.bests && this.data.bests[id + ':' + diff]) || { score: 0, rescued: 0 }; },
  /** Record a result; returns true when it beats the previous best score. */
  recordBest(id, diff, score, rescued) {
    if (!this.data.bests) this.data.bests = {};
    const k = id + ':' + diff, cur = this.bestFor(id, diff);
    const isBest = score > cur.score;
    this.data.bests[k] = { score: Math.max(cur.score, score), rescued: Math.max(cur.rescued, rescued) };
    this.save();
    return isBest;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },
};
