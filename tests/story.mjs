// Story data integrity: every chapter maps to a distinct real mission, has intro/outro/radio lines, speakers are known.
import { CHAPTERS, CAST, introFor, outroFor, PROLOGUE, EPILOGUE } from '../js/story.js';
import { MISSIONS } from '../js/missions.js';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' ' + d : '')); };
check('chapters map to the first missions, in order', CHAPTERS.length <= MISSIONS.length && CHAPTERS.every((c, i) => c.mission === i));
check('every chapter has title/place/synopsis', CHAPTERS.every((c) => c.title && c.place && c.synopsis));
check('every chapter has intro, outro and 3 radio lines', CHAPTERS.every((c) => c.intro.length >= 3 && c.outro.length >= 3 && c.radio.start && c.radio.tornado && c.radio.rescue));
const speakers = new Set(); for (const c of CHAPTERS) for (const [w] of [...c.intro, ...c.outro]) speakers.add(w);
for (const [w] of [...PROLOGUE, ...EPILOGUE]) speakers.add(w);
check('every speaker is in the cast list', [...speakers].every((s) => s in CAST), [...speakers].join(','));
check('prologue only before chapter 1', introFor(0).length === CHAPTERS[0].intro.length + PROLOGUE.length + 1 && introFor(1).length === CHAPTERS[1].intro.length + 1);
check('epilogue only after the last chapter', outroFor(CHAPTERS.length - 1).length === CHAPTERS.at(-1).outro.length + EPILOGUE.length && outroFor(0).length === CHAPTERS[0].outro.length);
check('no empty lines', [...CHAPTERS.flatMap((c) => [...c.intro, ...c.outro])].every(([, t]) => t && t.length > 5));
check('longest line fits a dialogue box (<=230 chars)', Math.max(...CHAPTERS.flatMap((c) => [...c.intro, ...c.outro, ...c.radio ? [] : []]).map(([, t]) => t.length)) <= 230);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
