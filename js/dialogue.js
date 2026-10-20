// Event-driven survivor speech with per-survivor and global cooldowns (no random chatter every frame).
const LINES = {
  waiting: ['STILL HERE! STILL ALIVE!', 'HELLO?? ANYONE??', 'I HAVE SNACKS. PLEASE COME.', 'OVER HERE! THE SMALL ONE!'],
  urgent: ['I CANNOT HOLD MUCH LONGER!', 'THE STORM IS GETTING WORSE!', 'HURRY! PLEASE! HURRY!'],
  ropeHit: ['WHY IS THE ROPE ANGRY?', 'NO! TOO FAST!', 'OW! THE ROPE HIT ME!', 'RUDE!'],
  grabbed: ['GOT THE ROPE! GOT THE ROPE!', "DON'T LET GO!", 'FLY GENTLY. PLEASE.'],
  slipping: ['MY HANDS ARE SLIPPING!', 'I CANNOT HOLD MUCH LONGER!', 'TOO FAST! TOO FAST!'],
  climbing: ['CLIMBING! DO NOT LOOK DOWN!', 'ONE HAND AT A TIME...', 'THIS IS FINE. THIS IS FINE.', 'ROPE DAY. WORST LEG DAY.'],
  falling: ['THAT WAS NOT THE PLAN!', 'NOT THE EXPRESS EXIT!', 'AAAAAAAA!', 'GRAVITY?! NOW?!'],
  tornado: ['THE TORNADO HAS ME!', 'I WAS SO CLOSE!', 'TELL MY DOG I LOVED HIM!', 'NOT THE EXPRESS EXIT!'],
  rescued: ['THANK YOU! I MEAN IT!', 'I LOVE SOLID GROUND!', 'BEST. PILOT. EVER.', 'NEVER AGAIN. MAYBE.'],
  landed: ["I'M OKAY! I THINK!", 'OW. STILL ALIVE.', 'THE GROUND IS... CLOSER THAN I REMEMBER.'],
  lost: ['I WAS SO CLOSE!', 'TELL THE OTHERS I TRIED!'],
  tide: ['IS THE OCEAN... GROWING?!', 'MY FEET ARE GETTING WET!', 'THE SEA IS COMING FOR ME!'],
  drowned: ['GLUB.', "I CAN'T SWIM IN THIS!", 'WHY IS THE FLOOR WET?!']
};

export class Dialogue {
  constructor() { this.globalCd = 0; this.counter = 0; }
  reset() { this.globalCd = 0; this.counter = 0; }
  update(dt) { if (this.globalCd > 0) this.globalCd -= dt; }

  /**
   * Try to make survivor s say a line for the given event key.
   * force = high-priority (ignores cooldowns), used for falling/lost/rescued.
   */
  say(s, key, force = false) {
    const pool = LINES[key];
    if (!pool) return false;
    if (!force && (s.speechCd > 0 || this.globalCd > 0)) return false;
    this.counter++;
    s.speech = pool[(this.counter + s.id) % pool.length];
    s.speechT = force ? 2.6 : 2.2;
    s.speechCd = force ? 1.2 : 3.2;
    this.globalCd = 0.35;
    return true;
  }
}
