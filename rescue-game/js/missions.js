// Mission catalogue + difficulty presets. buildConfig() merges them into the single config object the world reads.
// Hazards ("factors"): STORM (wind + tornado, always), TIDE (rising sea), THIN AIR (less lift up high),
// FUEL (burns while flying, refill on the SAFE ZONE), NIGHT (blackout, searchlight only).

export const DIFFICULTIES = {
  easy:   { key: 'easy',   label: 'EASY',   wind: 0.7,  tornadoDelay: 1.6, tornadoSize: 0.8, slip: false, grip: 0.7, fuel: 1.3, tide: 0.6, thin: 0.6, dark: 0.8,  light: 1.25, score: 0.75, time: 1.2 },
  normal: { key: 'normal', label: 'NORMAL', wind: 1,    tornadoDelay: 1,   tornadoSize: 1,   slip: false, grip: 1,   fuel: 1,   tide: 1,   thin: 1,   dark: 1,    light: 1,    score: 1,    time: 1 },
  hard:   { key: 'hard',   label: 'HARD',   wind: 1.35, tornadoDelay: 0.7, tornadoSize: 1.2, slip: true, grip: 1.3, fuel: 0.8, tide: 1.5, thin: 1.1, dark: 1,    light: 0.8,  score: 1.5,  time: 0.9 },
};
export const DIFF_ORDER = ['easy', 'normal', 'hard'];

export const MISSIONS = [
  {
    id: 'pass', name: 'MOUNTAIN PASS', tags: ['STORM'],
    blurb: 'The classic. Three survivors on narrow peaks, and one tornado with a punctual schedule.',
    theme: 'alps', seed: 1, wind: 1, tornado: { at: 16, maxR: 210, x: 3180 }, timeLimit: 210,
    terrain: {
      base: 1200, padY: 1160, ledgeVerts: 3, jitter: 8,
      peaks: [{ x: 700, h: 190, w: 190 }, { x: 960, h: 470, w: 360 }, { x: 1710, h: 600, w: 400 },
        { x: 2090, h: 230, w: 220 }, { x: 2490, h: 520, w: 380 }, { x: 3160, h: 430, w: 300 }],
      survivorPeaks: [1, 2, 4],
    },
  },
  {
    id: 'sea', name: 'STORM SEA', tags: ['STORM', 'TIDE'],
    blurb: 'Survivors on sea stacks. The ocean is rising, and the low rocks go under first. Do not touch the water.',
    theme: 'harbor', seed: 11, wind: 1.1, tornado: { at: 26, maxR: 175, x: 3300 }, timeLimit: 230,
    tide: { rate: 0.5, max: 62 },
    terrain: {
      base: 1200, padY: 1100, ledgeVerts: 3, jitter: 6, water: true, exactLedges: true,
      peaks: [{ x: 760, h: 110, w: 150 }, { x: 1080, h: 330, w: 210 }, { x: 1500, h: 60, w: 130 },
        { x: 1850, h: 50, w: 140 }, { x: 2330, h: 240, w: 200 }, { x: 2800, h: 45, w: 120 }, { x: 3080, h: 160, w: 150 }],
      survivorPeaks: [1, 3, 4],
    },
  },
  {
    id: 'tall', name: 'SKYLINE PEAKS', tags: ['STORM', 'THIN AIR', 'FUEL'],
    blurb: 'Huge mountains, tiny ledges. The air is thin up there and the tank is not infinite. Land on the zone to refuel.',
    theme: 'himalaya', seed: 21, wind: 1.1, tornado: { at: 26, maxR: 185, x: 3300 }, timeLimit: 280,
    thin: 0.22, fuel: { seconds: 200 },
    terrain: {
      base: 1300, padY: 1260, ledgeVerts: 2, jitter: 10,
      peaks: [{ x: 700, h: 200, w: 200 }, { x: 1000, h: 820, w: 420 }, { x: 1300, h: 300, w: 250 }, { x: 1560, h: 640, w: 360 },
        { x: 1850, h: 350, w: 250 }, { x: 2100, h: 900, w: 400 }, { x: 2380, h: 380, w: 250 }, { x: 2650, h: 760, w: 380 }, { x: 3000, h: 300, w: 250 }],
      survivorPeaks: [1, 3, 5, 7],
    },
  },
  {
    id: 'night', name: 'BLACKOUT RIDGE', tags: ['STORM', 'NIGHT'],
    blurb: 'Power is out across the range. All you have is your searchlight, flare beacons and the occasional lightning bolt.',
    theme: 'alps', seed: 31, wind: 1.15, tornado: { at: 16, maxR: 215, x: 3200 }, timeLimit: 260, dark: 0.94,
    terrain: { base: 1200, padY: 1160, ledgeVerts: 3, jitter: 9, random: { count: 5, hMin: 380, hMax: 640, wMin: 270, wMax: 420, survivors: 4 } },
  },
  {
    id: 'midnight', name: 'MIDNIGHT TIDE', tags: ['STORM', 'TIDE', 'NIGHT', 'FUEL'],
    blurb: 'Dark sea, rising water, a thirsty engine. Four survivors on rocks you can barely see.',
    theme: 'harbor', seed: 41, wind: 1.2, tornado: { at: 15, maxR: 215, x: 3150 }, timeLimit: 270, dark: 0.9,
    tide: { rate: 0.5, max: 62 }, fuel: { seconds: 190 },
    terrain: {
      base: 1200, padY: 1100, ledgeVerts: 3, jitter: 6, water: true, exactLedges: true,
      peaks: [{ x: 780, h: 300, w: 200 }, { x: 1250, h: 55, w: 140 }, { x: 1750, h: 220, w: 200 }, { x: 2150, h: 50, w: 130 },
        { x: 2600, h: 380, w: 220 }, { x: 3000, h: 110, w: 150 }],
      survivorPeaks: [0, 2, 3, 4],
    },
  },
  {
    id: 'gauntlet', name: 'THE GAUNTLET', tags: ['STORM', 'THIN AIR', 'FUEL', 'NIGHT'],
    blurb: 'Five survivors, huge peaks, thin air, thirsty engine, no lights, early tornado. Good luck. Truly.',
    theme: 'himalaya', seed: 51, wind: 1.25, tornado: { at: 12, maxR: 235, x: 3300 }, timeLimit: 330, dark: 0.92, grip: 1.1,
    thin: 0.22, fuel: { seconds: 210 },
    terrain: {
      base: 1300, padY: 1260, ledgeVerts: 2, jitter: 10,
      peaks: [{ x: 700, h: 200, w: 200 }, { x: 980, h: 760, w: 380 }, { x: 1450, h: 620, w: 330 }, { x: 1700, h: 300, w: 240 },
        { x: 1980, h: 880, w: 400 }, { x: 2250, h: 330, w: 240 }, { x: 2500, h: 700, w: 360 }, { x: 2760, h: 280, w: 240 }, { x: 3000, h: 800, w: 380 }],
      survivorPeaks: [1, 2, 4, 6, 8],
    },
  },
  {
    id: 'paris', name: 'PARIS FLOOD', tags: ['STORM', 'TIDE'],
    blurb: 'The Seine has burst its banks. Four people on Haussmann rooftops under the Eiffel Tower, and the water keeps climbing.',
    theme: 'paris', seed: 61, wind: 1.05, tornado: { at: 22, maxR: 190, x: 3200 }, timeLimit: 250, tide: { rate: 0.35, max: 70 },
    terrain: { base: 1250, water: true, city: { kinds: ['haussmann'], wMin: 7, wMax: 11, gapMin: 2, gapMax: 3, hMin: 150, hMax: 300, padH: 170, survivors: 4, minSurvH: 160 } },
  },
  {
    id: 'mumbai', name: 'MUMBAI MONSOON', tags: ['STORM', 'TIDE'],
    blurb: 'Dharavi under a monsoon storm. Five survivors on tin-roof shacks packed shoulder to shoulder, the flood rising between them.',
    theme: 'mumbai', seed: 71, wind: 1.2, tornado: { at: 20, maxR: 185, x: 3200 }, timeLimit: 270, tide: { rate: 0.6, max: 70 },
    terrain: { base: 1250, water: true, city: { kinds: ['slum'], wMin: 5, wMax: 8, gapMin: 1, gapMax: 2, hMin: 100, hMax: 210, padH: 150, survivors: 5, minSurvH: 118 } },
  },
  {
    id: 'newyork', name: 'MANHATTAN', tags: ['STORM', 'THIN AIR', 'FUEL'],
    blurb: 'Glass canyons under a storm. Rooftops two hundred meters up, thin air at the top, and a tank that will not last forever.',
    theme: 'newyork', seed: 81, wind: 1.1, tornado: { at: 24, maxR: 195, x: 3250 }, timeLimit: 290, thin: 0.14, fuel: { seconds: 220 },
    terrain: { base: 1300, city: { kinds: ['tower', 'glass'], wMin: 6, wMax: 9, gapMin: 2, gapMax: 3, hMin: 250, hMax: 720, padH: 260, survivors: 4, minSurvH: 250 } },
  },
  {
    id: 'tokyo', name: 'TOKYO NEON', tags: ['STORM', 'NIGHT', 'FUEL'],
    blurb: 'Shibuya after a blackout. Only neon signs and your searchlight. Four survivors on rooftops between the towers.',
    theme: 'tokyo', seed: 91, wind: 1.1, tornado: { at: 20, maxR: 200, x: 3200 }, timeLimit: 280, dark: 0.86, fuel: { seconds: 200 },
    terrain: { base: 1250, city: { kinds: ['neon', 'tower'], wMin: 5, wMax: 8, gapMin: 1, gapMax: 3, hMin: 170, hMax: 480, padH: 210, survivors: 4, minSurvH: 180 } },
  },
  {
    id: 'dubai', name: 'DUBAI HEIGHTS', tags: ['STORM', 'THIN AIR', 'FUEL'],
    blurb: 'Supertalls under a desert storm. Five survivors on the highest roofs you have ever tried to hover over. Bring a full tank.',
    theme: 'dubai', seed: 101, wind: 1.25, tornado: { at: 16, maxR: 220, x: 3300 }, timeLimit: 330, thin: 0.22, fuel: { seconds: 215 },
    terrain: { base: 1350, city: { kinds: ['glass', 'tower'], wMin: 6, wMax: 10, gapMin: 3, gapMax: 4, hMin: 380, hMax: 1000, padH: 340, survivors: 5, minSurvH: 380 } },
  },
];

export function missionCount() { return MISSIONS.length; }

/** Merge mission + difficulty into the config the world uses. Pure function, no side effects. */
export function buildConfig(missionIndex, diffKey) {
  const mi = ((missionIndex % MISSIONS.length) + MISSIONS.length) % MISSIONS.length;
  const m = MISSIONS[mi];
  const d = DIFFICULTIES[diffKey] || DIFFICULTIES.normal;
  const tc = m.terrain;
  const total = tc.city ? tc.city.survivors : (tc.random ? tc.random.survivors : tc.survivorPeaks.length);
  const tideRate = m.tide ? m.tide.rate * d.tide : 0;
  return {
    index: mi, theme: m.theme || 'alps', id: m.id, name: m.name, tags: m.tags, diffKey: d.key, diffLabel: d.label,
    seed: m.seed, total,
    wind: m.wind * d.wind,
    tornado: {
      at: m.tornado.at * d.tornadoDelay, maxR: m.tornado.maxR * d.tornadoSize, grow: 75, x: m.tornado.x,
    },
    timeLimit: Math.round(m.timeLimit * d.time),
    terrain: tc,
    water: !!tc.water,
    tide: m.tide ? { rate: tideRate, max: m.tide.max } : null,
    thin: m.thin ? m.thin * d.thin : 0,
    fuel: m.fuel ? { seconds: m.fuel.seconds * d.fuel } : null,
    dark: m.dark ? Math.min(0.97, m.dark * d.dark) : 0,
    light: d.light,
    grip: (m.grip || 1) * d.grip,
    slip: !!d.slip,                       // only Hard: riders can lose their grip and fall
    scoreMult: d.score,
    parTime: 40 * total + 20,
  };
}
