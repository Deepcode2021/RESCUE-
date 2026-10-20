// Per-place visual themes (data only, DOM-free): colour grade, sky, weather and the little effects each place gets.
// tint:   multiply colour over the whole scene (white chalk lines pick up the place's colour)
// sky:    [top, mid, horizon] gradient painted behind the parallax layers
// body:   a big soft sun/moon: {x (0..1 screen), y (0..1), r (px), color, disc: bool}
// precip: {mode, density}   fx: names understood by themefx.js
export const THEMES = {
  alps:     { label: 'ALPINE STORM',  tint: '#d6e4f6', sky: ['#07101c', '#16283c', '#2a4057'], body: { x: 0.78, y: 0.2, r: 90, color: '#bcd4ff', disc: false }, precip: { mode: 'rain', density: 0.62 }, fx: ['fog', 'birds'] },
  harbor:   { label: 'STORM HARBOR',  tint: '#cdeaea', sky: ['#04141a', '#0f3038', '#1f4a52'], body: { x: 0.2, y: 0.22, r: 80, color: '#9ff0e8', disc: false }, precip: { mode: 'rain', density: 0.85 }, fx: ['fog', 'birds', 'lighthouse'] },
  himalaya: { label: 'HIGH PEAKS',    tint: '#e0dcf6', sky: ['#080618', '#1e1a3c', '#3c3158'], body: { x: 0.25, y: 0.18, r: 70, color: '#e3d4ff', disc: true }, precip: { mode: 'snow', density: 0.55 }, fx: ['fog'] },
  paris:    { label: 'CITY OF LIGHT', tint: '#f8dcdc', sky: ['#120820', '#33183a', '#5a2b46'], body: { x: 0.7, y: 0.18, r: 46, color: '#ffe9d0', disc: true }, precip: { mode: 'rain', density: 0.55 }, fx: ['fog', 'birds', 'steam', 'lamps'], steam: { rate: 0.5, color: 'warm' } },
  mumbai:   { label: 'MONSOON',       tint: '#d2f2e0', sky: ['#04120e', '#0e2e24', '#1e4a36'], body: { x: 0.3, y: 0.2, r: 70, color: '#a8ffcf', disc: false }, precip: { mode: 'rain', density: 1.0 }, fx: ['fog', 'birds', 'steam', 'sheets'], steam: { rate: 0.35, color: 'grey' }, lightning: 1.5 },
  newyork:  { label: 'WHITEOUT',      tint: '#d3e2f6', sky: ['#0a1018', '#202c40', '#46566e'], body: { x: 0.5, y: 0.26, r: 120, color: '#e0ecff', disc: false }, precip: { mode: 'snow', density: 0.95 }, fx: ['fog', 'steam', 'sirens'], steam: { rate: 1.0, color: 'white' } },
  tokyo:    { label: 'NEON NIGHT',    tint: '#f4d4fa', sky: ['#0c0420', '#2a0c46', '#4a1a60'], body: { x: 0.64, y: 0.46, r: 70, color: '#ff4a62', disc: true }, precip: { mode: 'petal', density: 0.5 }, fx: ['neon', 'fog'] },
  dubai:    { label: 'SANDSTORM',     tint: '#f8dca4', sky: ['#1c0e04', '#47260c', '#7a4416'], body: { x: 0.35, y: 0.4, r: 110, color: '#ffb44a', disc: true }, precip: { mode: 'sand', density: 0.75 }, fx: ['haze', 'glints'] },
};
export const themeOf = (name) => THEMES[name] || THEMES.alps;
