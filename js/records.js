// Personal-best records (pure data logic, no DOM or storage access) and save-data sanitising.
// One record per mission + difficulty key, e.g. "pass:normal":
//   { score, rescued, medal, bestTime, completions, attempts }
// Rules: failures never overwrite a completion's score/medal/time; lower values never overwrite higher ones;
// times are only compared for full clears (everyone rescued, no crash) at the same mission and difficulty.
export const SAVE_VERSION = 2;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
const int = (v, d = 0) => Math.floor(num(v, d));

/** Coerce anything into a valid record, keeping every valid field. Old v1 records ({score, rescued}) upgrade cleanly. */
export function cleanRecord(r) {
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  return {
    score: int(o.score), rescued: int(o.rescued),
    medal: Math.min(3, int(o.medal)),
    bestTime: o.bestTime == null ? null : (num(o.bestTime, NaN) > 0 ? num(o.bestTime) : null),
    completions: int(o.completions), attempts: int(o.attempts),
  };
}

/**
 * Apply one finished run to a record. run = { success, score, rescued, medal, duration, fullClear }.
 * Returns { rec, flags } and never mutates the input record.
 */
export function applyRun(prevRec, run) {
  const prev = cleanRecord(prevRec), rec = { ...prev };
  const score = Math.max(0, Math.floor(num(run.score))), rescued = int(run.rescued);
  const flags = { newScore: false, newMedal: false, newTime: false, firstClear: false };
  rec.attempts = prev.attempts + 1;
  rec.rescued = Math.max(prev.rescued, rescued);
  if (run.success) {
    flags.firstClear = prev.completions === 0;
    rec.completions = prev.completions + 1;
    if (score > prev.score) { rec.score = score; flags.newScore = score > 0; }
    const medal = Math.min(3, int(run.medal));
    if (medal > prev.medal) { rec.medal = medal; flags.newMedal = true; }
    if (run.fullClear && num(run.duration) > 0 && (prev.bestTime == null || run.duration < prev.bestTime)) { rec.bestTime = run.duration; flags.newTime = true; }
  } else if (prev.completions === 0 && score > prev.score) {       // partial progress only counts until a real completion exists
    rec.score = score;
  }
  return { rec, flags, prev };
}

/** Repair loaded save data in place without discarding progress. Idempotent. */
export function migrateSave(d) {
  if (!d || typeof d !== 'object') return d;
  const bests = {};
  if (d.bests && typeof d.bests === 'object' && !Array.isArray(d.bests)) {
    for (const k of Object.keys(d.bests)) bests[k] = cleanRecord(d.bests[k]);
  }
  d.bests = bests;
  for (const k of ['plays', 'storyUnlocked', 'storyChapter', 'mission']) {
    if (typeof d[k] === 'string' && d[k].trim() !== '' && Number.isFinite(Number(d[k]))) d[k] = Number(d[k]);   // rescue numbers saved as text
    if (typeof d[k] !== 'number' || !Number.isFinite(d[k]) || d[k] < 0) delete d[k];                           // unusable: fall back to the default
  }
  d.saveVersion = SAVE_VERSION;
  return d;
}
