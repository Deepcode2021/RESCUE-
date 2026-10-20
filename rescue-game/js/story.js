// STORY MODE: "THE LONG STORM". Six chapters, one per mission, told as radio-and-chalk cutscenes.
// Pure data + tiny helpers (no DOM) so it can be tested in Node.
//
// Each chapter: { mission, title, place, synopsis, intro: [lines], outro: [lines], radio: {start, tornado, rescue} }
// A line is [speaker, text]. Speakers: WREN (you), PIP (radio dispatcher), IMANI, TEO, HALE, NARRATOR.

export const CAST = {
  WREN: 'WREN CALLOWAY, PILOT',
  PIP: 'PIP, BASECAMP RADIO',
  IMANI: 'DR. IMANI ODERA',
  TEO: 'TEO, CLIMBER',
  HALE: 'DIRECTOR HALE',
  NARRATOR: '',
};

export const PROLOGUE = [
  ['NARRATOR', 'Eleven weeks ago the Halcyon Institute switched on the Lantern Array: forty towers on forty peaks, built to steer the weather over the Kestrel Range.'],
  ['NARRATOR', 'It worked for nine days. Then the storm arrived, and it never left. The valley people call it the Long Storm.'],
  ['NARRATOR', 'The roads are gone. The radios crackle. Every flying machine in the district is grounded, except one old red helicopter nobody thought would fly again.'],
];

export const CHAPTERS = [
  {
    mission: 0,
    title: 'THE CALL',
    place: 'Kestrel Pass',
    synopsis: 'A retired pilot takes one last job: three Array surveyors are stuck on the pass.',
    intro: [
      ['PIP', 'Basecamp to Wren. Wren? Please tell me you are not still asleep in the hangar.'],
      ['WREN', 'I retired, Pip. I have a cat and a very comfortable chair.'],
      ['PIP', 'Three people are on the Kestrel Pass and the storm is walking up the valley toward them. You are the only pilot who knows that pass.'],
      ['WREN', '...Fine. Start the kettle. I am taking Moth.'],
      ['PIP', 'Moth is a rope, a rotor and a lot of hope. Hook them one at a time, or if you are brave, three at once. They will climb up the line on their own.'],
    ],
    outro: [
      ['IMANI', 'You came. I am Imani Odera, chief meteorologist of the Array. These two are Teo and... well, they are Teo.'],
      ['TEO', 'I would like it noted that I did not scream.'],
      ['IMANI', 'The storm is not behaving like weather. It is circling the towers like it is looking for something.'],
      ['PIP', 'Wren, more calls are coming in. The coast station is flooding. Ship deck is the only dry ground.'],
    ],
    radio: {
      start: 'PIP: Three on the pass. Hook one, let them climb, then fetch the next. The rope holds three.',
      tornado: 'PIP: That is no ordinary funnel. It is turning toward the towers. Stay away from it!',
      rescue: 'PIP: One safe! The pass crew says thank you in several colorful words.',
    },
  },
  {
    mission: 1,
    title: 'THE DROWNED COAST',
    place: 'Gull Sound',
    synopsis: 'The sea is rising. A ship deck is the only dry ground for miles.',
    intro: [
      ['PIP', 'The coast relay is going under. The sea has been climbing since midnight. Nobody knows why.'],
      ['IMANI', 'It is not the sea. The towers are heating the air, and the storm is pulling the water up behind it.'],
      ['WREN', 'You can explain on the way. Where do I land?'],
      ['PIP', 'The ship Lamplighter is the safe zone. Its deck is the only thing the tide cannot take. Yet.'],
      ['WREN', 'Low rocks first, high rocks last. Got it.'],
    ],
    outro: [
      ['IMANI', 'The tide logs match the Array switch-on times to the minute. It is following the power.'],
      ['WREN', 'Then somebody is feeding it.'],
      ['PIP', 'Wren, the next call is from the high peaks. Eight hundred meters up. The air is thin and the engine is thirsty.'],
    ],
    radio: {
      start: 'PIP: The sea is rising. Low rocks flood first. Get them off before the water arrives.',
      tornado: 'PIP: Funnel forming over the water! It is drawn to the ship lights. Keep clear.',
      rescue: 'PIP: Deck confirms: one more dry survivor on the Lamplighter.',
    },
  },
  {
    mission: 2,
    title: 'ROOF OF THE WORLD',
    place: 'Skyline Peaks',
    synopsis: 'Thin air, thirsty engine, the tallest towers of the Array.',
    intro: [
      ['PIP', 'Skyline Peaks. The tallest towers are up there, and so is the main Array crew.'],
      ['IMANI', 'The air up there is thin. Moth will feel it. Keep your lift on, and refuel whenever you pass over the deck.'],
      ['WREN', 'She is old, not stupid. We will climb in steps.'],
      ['TEO', 'A tower there flashes every night, once every nine seconds. Somebody keeps pressing a button.'],
    ],
    outro: [
      ['TEO', 'The tower log says the safety lock was opened from the inside. Somebody on the crew did it on purpose.'],
      ['IMANI', 'Hale. The Director. He always said the storm was a feature, not a fault.'],
      ['PIP', 'Wren... the power just went out across the whole Range. Every light, every tower. Everything.'],
    ],
    radio: {
      start: 'PIP: Thin air up there. Less lift as you climb. Refuel at the deck when you can.',
      tornado: 'PIP: The funnel is chasing the tallest tower. It likes the metal. Stay low.',
      rescue: 'PIP: Roof of the world, one more rescued. The Array crew is cheering.',
    },
  },
  {
    mission: 3,
    title: 'LIGHTS OUT',
    place: 'Blackout Ridge',
    synopsis: 'The Array has gone dark. Fly by flare light and trust the radio.',
    intro: [
      ['PIP', 'Total blackout. The only lights left are the flares your survivors are lighting.'],
      ['WREN', 'My searchlight is the size of a dinner plate.'],
      ['PIP', 'Follow the flares, follow the edge arrows. And Wren... lightning shows you the ridge. Count the seconds.'],
      ['IMANI', 'Whoever cut the power did it so no one could watch what the Array does next.'],
    ],
    outro: [
      ['HALE', 'Basecamp, this is Director Hale, Halcyon. I am aboard the research ship out past the Sound. I can fix this.'],
      ['IMANI', 'You turned off the safety lock, Hale.'],
      ['HALE', 'I turned it up. The Array was a leash, and I wanted to see how big the storm could grow. It grew rather well.'],
      ['WREN', 'You are not helping your case, Director.'],
    ],
    radio: {
      start: 'PIP: Blackout. Follow the flares and the edge arrows. Lightning is your friend, sort of.',
      tornado: 'PIP: Funnel on the radar. You will not see it until it is close, so watch for its faint glow.',
      rescue: 'PIP: Another flare goes out. That is a good sign. That is a very good sign.',
    },
  },
  {
    mission: 4,
    title: 'THE HALCYON',
    place: 'Midnight Tide',
    synopsis: 'Night, rising sea, little fuel. The research ship is going down with a confession on board.',
    intro: [
      ['PIP', 'The Halcyon is taking on water. Hale and four of his crew are on the rocks around her. The sea is at their ankles.'],
      ['WREN', 'The same man who set this off.'],
      ['IMANI', 'Wren, he has the master key to the Array. Without it we cannot shut the storm down.'],
      ['WREN', 'Then we save him first, and yell at him after.'],
    ],
    outro: [
      ['HALE', 'I did not think it would hunt. It was only supposed to rain on the dry valleys.'],
      ['IMANI', 'You made a storm that feeds on your own towers, Hale.'],
      ['HALE', 'Then the answer is in the centre. The main tower at the Eye. Shut it there and the whole Range goes quiet.'],
      ['PIP', 'Wren, the eye is forming right over the main tower. Five of our people are stuck there. Last flight of the night.'],
    ],
    radio: {
      start: 'PIP: Night, tide and a short tank. All three at once. You are very popular tonight.',
      tornado: 'PIP: The funnel is hunting the ship. Move now!',
      rescue: 'PIP: One rescued from the Halcyon rocks. Hale is next on the list, loudly.',
    },
  },
  {
    mission: 5,
    title: 'THE EYE',
    place: 'The Gauntlet',
    synopsis: 'Five stranded at the main tower. Everything the storm has, all at once.',
    intro: [
      ['PIP', 'This is it. Five on the main tower. Thin air, no lights, the funnel is already up and it is big.'],
      ['IMANI', 'When the master key goes into the console, the Array shuts down. The storm will have nothing to chase.'],
      ['WREN', 'And the tornado will have no reason to be polite.'],
      ['HALE', 'Wren... I am sorry. Bring them home. Bring them all home.'],
      ['WREN', 'Moth, old girl. One more time.'],
    ],
    outro: [
      ['IMANI', 'The key is in. The towers are going dark, one by one. Wren, look at the sky.'],
      ['PIP', 'The funnel is... thinning. It is coming apart. Wren, it is over!'],
      ['HALE', 'The Range will be quiet for the first time in eleven weeks. I should have listened to the weather.'],
      ['WREN', 'Everyone on the rope, everyone on the deck. Pip, put that kettle on.'],
    ],
    radio: {
      start: 'PIP: Five on the tower. Everything at once. Hook up to three at a time if you can hold them.',
      tornado: 'PIP: The eye is open. It is the biggest one yet. Make every second count!',
      rescue: 'PIP: Another one home! Keep going, Wren!',
    },
  },
];

export const EPILOGUE = [
  ['NARRATOR', 'Dawn came over the Kestrel Range for the first time in eleven weeks. It was grey, then pale gold, then an enormous, unreasonable blue.'],
  ['NARRATOR', 'The Lantern Array was never switched back on. The forty towers still stand on the peaks, silent, and the valley people leave lamps at their feet.'],
  ['NARRATOR', 'Wren went home, fed the cat, and sat in the comfortable chair. For nearly an hour.'],
  ['PIP', 'Basecamp to Wren. Are you awake? There is a little problem on the northern ridge...'],
  ['WREN', '...Put the kettle on.'],
  ['NARRATOR', 'THE END. (Free Play still has every mission on Easy, Normal and Hard.)'],
];

export const TOTAL_CHAPTERS = CHAPTERS.length;

/** Cutscene for the moment a chapter starts: the prologue first, only before chapter 1. */
export function introFor(i) {
  const c = CHAPTERS[i];
  const pages = [{ card: `CHAPTER ${i + 1} / ${CHAPTERS.length}`, title: c.title, place: c.place }];
  if (i === 0) pages.unshift(...PROLOGUE.map(([who, text]) => ({ who, text })));
  for (const [who, text] of c.intro) pages.push({ who, text });
  return pages;
}

/** Cutscene after winning chapter i: its outro, then (if any) the epilogue. */
export function outroFor(i) {
  const c = CHAPTERS[i];
  const pages = c.outro.map(([who, text]) => ({ who, text }));
  if (i === CHAPTERS.length - 1) pages.push(...EPILOGUE.map(([who, text]) => ({ who, text })));
  return pages;
}
