// Shared world constants. World units are arbitrary "pixels" of a 3600x1400 mountain range.
export const WORLD_W = 3600;
export const WORLD_H = 1400;
export const GRAVITY = 900;          // units / s^2
export const STEP = 1 / 60;          // fixed physics timestep
export const MAX_FRAME = 0.1;        // max real time (s) accumulated per rendered frame
export const MAX_STEPS = 5;          // max physics steps per rendered frame
export const MISSION_TIME_LIMIT = 210; // seconds before the storm wins outright

// Rope passengers: up to MAX_RIDERS survivors hang on the rope. A new passenger grabs the hook, then climbs up
// to the first free slot (rope node index, counted from the helicopter) so the hook is free for the next one.
export const MAX_RIDERS = 3;
export const RIDER_SLOTS = [5, 9, 13];
export const CLIMB_SPEED = 3.0;   // rope nodes per second
