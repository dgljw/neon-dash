/**
 * NEON DASH — tuning constants.
 * Everything gameplay-related lives here so the feel can be adjusted in one place.
 */

/** X position of the three lanes. */
export const LANES = [-2.6, 0, 2.6];

export const CFG = {
  /* ---------------------------------------------------------------- lanes */
  lanes: LANES,
  laneHalfWidth: 1.28,     // half-width of a lane corridor, used for collision
  laneLerp: 16,            // exponential smoothing rate for lane changes
  laneTilt: 0.38,          // max roll (radians) while switching lanes

  /* ---------------------------------------------------------------- speed */
  speedStart: 16,
  speedMax: 54,
  speedRamp: 0.0105,       // speed gained per metre travelled, capped at speedMax

  /* --------------------------------------------------------------- player */
  jumpVelocity: 15.8,
  gravity: -58,
  fastFallMul: 2.4,        // extra gravity when pressing down mid-air
  slideDuration: 0.62,
  standHeight: 1.9,        // collision height, standing
  slideHeight: 0.85,       // collision height, sliding
  bodyHalfWidth: 0.42,     // collision half-width
  bodyHalfDepth: 0.5,      // collision half-depth

  /* --------------------------------------------------------------- spawner */
  spawnZ: -200,            // where new rows appear
  despawnZ: 20,            // where passed objects die
  // Row spacing is derived from a minimum TIME between rows, not a fixed
  // distance. A jump keeps the player above a barrier for 0.545s and they
  // cannot jump again until they land, so two jump-required rows closer than
  // ~0.66s apart would be physically impossible at any skill level.
  // minRowGapTime is that bound plus margin.
  minRowGapTime: 0.80,     // seconds between rows
  rowGapMin: 14,           // metres, floor for very slow speeds
  rowGapMax: 40,           // metres, ceiling so the start is not sparse
  sceneryGap: 11,          // spacing of decorative side pillars

  /* ---------------------------------------------------------------- camera */
  camOffsetX: 0,
  camOffsetY: 3.62,
  camOffsetZ: 7.5,
  camLerp: 7.2,
  camLookZ: -13,
  camLookY: 1.45,
  camShakeDecay: 3.4,

  /* ------------------------------------------------------------- power-ups */
  magnetDuration: 8,
  magnetRadius: 8,
  boostDuration: 5,
  boostMul: 1.68,
  powerupChance: 0.09,     // chance a given row gets a power-up
  powerupCooldown: 110,    // metres that must pass between power-ups

  /* --------------------------------------------------------------- economy */
  coinScore: 12,
  comboWindow: 1.7,        // seconds before the combo multiplier decays
  comboMax: 8,

  /* ------------------------------------------------------------ rendering */
  maxPixelRatio: 2,
  maxDelta: 1 / 20,        // clamp dt so a stall cannot tunnel the player
  fogColor: 0x07030f,
  fogDensity: 0.006,
};

/** Neon palette (3D). */
export const COLOR = {
  bg: 0x07030f,
  cyan: 0x27f4ff,
  magenta: 0xff2fd0,
  violet: 0x8b5cff,
  gold: 0xffd447,
  green: 0x4dffa1,
  danger: 0xff3b5c,
  road: 0x0b0718,
  rail: 0x00d5ff,
  white: 0xffffff,
};

/** CSS-side palette so the DOM UI matches the 3D scene. */
export const CSSCOLOR = {
  cyan: '#27f4ff',
  magenta: '#ff2fd0',
  gold: '#ffd447',
  green: '#4dffa1',
  danger: '#ff3b5c',
};

export const POWERUPS = {
  magnet: { key: 'magnet', label: '磁铁', icon: 'M', color: COLOR.cyan, css: CSSCOLOR.cyan },
  shield: { key: 'shield', label: '护盾', icon: 'S', color: COLOR.green, css: CSSCOLOR.green },
  boost:  { key: 'boost',  label: '加速', icon: 'B', color: COLOR.gold,  css: CSSCOLOR.gold },
};
