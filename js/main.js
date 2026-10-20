// Entry point: wires renderer, audio, input, UI and the game loop.
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game, STATE } from './game.js';
import { storage } from './storage.js';

storage.load();

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
audio.muted = !!storage.data.muted;
const input = new Input();

let game;
const gesture = () => audio.init();      // browsers only allow audio after a user gesture

const ui = new UI({
  play: () => { gesture(); audio.click(); game.startFree(); },
  openStory: () => { gesture(); audio.click(); game.openStory(); },
  storyContinue: () => { gesture(); audio.click(); game.storyContinue(); },
  storyChapter: (i) => { gesture(); audio.click(); game.startChapter(+i); },
  storyReset: () => { gesture(); audio.click(); game.storyReset(); },
  advanceCutscene: () => { gesture(); ui.advanceCutscene(); },
  skipCutscene: () => { audio.click(); ui.skipCutscene(); },
  prevMission: () => { gesture(); audio.click(); game.selectMission(-1); },
  nextMission: () => { gesture(); audio.click(); game.selectMission(1); },
  diff: (key) => { gesture(); audio.click(); game.setDifficulty(key); },
  resume: () => { audio.click(); game.resume(); },
  restart: () => { gesture(); game.restart(); },
  next: () => { gesture(); game.next(); },
  title: () => { audio.click(); game.toTitle(); },
  tutorial: () => { gesture(); audio.click(); game.replayTutorial(); },
  skipTutorial: () => { audio.click(); game.skipTutorial(); },
  hints: () => { gesture(); audio.click(); game.toggleHints(); },
  pause: () => { audio.click(); game.pause(); },
  sound: () => {
    gesture();
    audio.setMuted(!audio.muted);
    storage.data.muted = audio.muted; storage.save();
    ui.setSoundLabel(audio.muted);
    if (!audio.muted) audio.click();
  },
});

game = new Game({ renderer, ui, audio, input });

input.attach(document.getElementById('touch'));
input.onAnyKey = gesture;
input.onPause = () => { if (game.state === STATE.CUTSCENE) ui.skipCutscene(); else game.togglePause(); };
input.onRestart = () => {
  if (game.isMenuState) return;
  game.restart();
};
window.addEventListener('keydown', (e) => {          // title-screen keyboard shortcuts
  if (e.code === 'KeyT' && !e.repeat && game.state === STATE.PLAYING && game.coach.tutorialActive) { game.skipTutorial(); return; }
  if (game.state === STATE.CUTSCENE && !e.repeat && (e.code === 'Space' || e.code === 'ArrowRight')) { e.preventDefault(); ui.advanceCutscene(); return; }
  if (game.state !== STATE.TITLE || e.repeat) return;
  if (e.code === 'ArrowLeft') game.selectMission(-1);
  else if (e.code === 'ArrowRight') game.selectMission(1);
  else if (e.code === 'Digit1') game.setDifficulty('easy');
  else if (e.code === 'Digit2') game.setDifficulty('normal');
  else if (e.code === 'Digit3') game.setDifficulty('hard');
});
input.onEnter = (e) => {
  if (game.state === STATE.TITLE) { e.preventDefault(); ui.h.openStory(); }
  else if (game.state === STATE.CUTSCENE) { e.preventDefault(); ui.advanceCutscene(); }
  else if (game.state === STATE.SUCCESS) { e.preventDefault(); ui.h.next(); }          // Enter = the primary results button
  else if (game.state === STATE.FAILED) { e.preventDefault(); ui.h.restart(); }
};

if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch'); else document.body.classList.add('notouch');
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') { document.body.classList.add('touch'); document.body.classList.remove('notouch'); }
});

ui.setSoundLabel(audio.muted);
ui.setHintsLabel(storage.data.hints !== false);
ui.showTitle(game.selectInfo());
ui.setStoryProgress(game.storyLabel());

// resize / orientation: re-derive the camera scale, never stretch
const onResize = () => { renderer.resize(); };
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);

// auto-pause when the tab is hidden; avoid a huge catch-up step on return
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
  else game.last = performance.now();
});

game.last = performance.now();
function loop(now) {
  game.frame(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// debug / test hook (harmless in production)
window.__rescue = { game, renderer, audio, input, ui, storage };
