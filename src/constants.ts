// ============================================================
// GAME CONSTANTS — All tunable parameters in one place
// ============================================================

// --- Player Movement (CoD4-accurate ratios) ---
export const PLAYER = {
  // Speeds (units per second)
  WALK_SPEED: 5.0,
  SPRINT_SPEED: 8.5,
  CROUCH_SPEED: 3.0,
  PRONE_SPEED: 0.75,
  ADS_SPEED: 2.5,

  // Jump
  JUMP_FORCE: 7.0,
  GRAVITY: -20.0,

  // Eye heights for each stance
  STAND_HEIGHT: 1.7,
  CROUCH_HEIGHT: 1.0,
  PRONE_HEIGHT: 0.4,

  // Height transition speed (units/sec)
  STANCE_TRANSITION_SPEED: 4.0,

  // Player collision
  RADIUS: 0.4,
  STEP_HEIGHT: 0.35,

  // Sprint stamina (seconds)
  SPRINT_DURATION: 4.0,
  SPRINT_REGEN_RATE: 0.5, // per second (so 2s to regen)

  // Mouse
  MOUSE_SENSITIVITY: 0.002,

  // Head bob
  HEAD_BOB_FREQUENCY: 8.0,
  HEAD_BOB_AMPLITUDE: 0.035,
  SPRINT_BOB_MULTIPLIER: 1.5,

  // Acceleration / deceleration
  ACCELERATION: 30.0,
  DECELERATION: 20.0,

  // Health
  MAX_HEALTH: 100,
  HEALTH_REGEN_DELAY: 5.0, // seconds before regen starts
  HEALTH_REGEN_RATE: 15, // hp per second
} as const;

// --- Weapon (Bolt-Action Sniper) ---
export const WEAPON = {
  // Damage
  BODY_DAMAGE: 70,
  HEAD_DAMAGE: 150, // instant kill since max HP is 100
  LIMB_DAMAGE: 45,

  // Ammo
  MAG_SIZE: 5,
  RESERVE_AMMO: 20,

  // Timing (seconds)
  BOLT_ACTION_TIME: 1.2,
  RELOAD_TIME: 3.0,
  ADS_TRANSITION_TIME: 0.25,

  // ADS
  ADS_FOV: 15,
  NORMAL_FOV: 75,

  // Scope sway
  SCOPE_SWAY_AMOUNT: 0.008,
  SCOPE_SWAY_SPEED: 1.5,
  PRONE_SWAY_MULTIPLIER: 0.3,
  HOLD_BREATH_SWAY_MULTIPLIER: 0.05,
  HOLD_BREATH_DURATION: 3.0,

  // Recoil
  RECOIL_PITCH: 0.04,
  RECOIL_RECOVERY_SPEED: 2.0,

  // Bullet
  BULLET_RANGE: 500,
  TRACER_DURATION: 0.15,
  MUZZLE_FLASH_DURATION: 0.05,
} as const;

// --- Enemy AI ---
export const ENEMY = {
  // Health
  MAX_HEALTH: 100,
  HEAD_MULTIPLIER: 2.0,

  // Detection ranges (units) vary by player stance
  DETECT_RANGE_STANDING: 80,
  DETECT_RANGE_CROUCHING: 50,
  DETECT_RANGE_PRONE: 30,

  // AI timing
  REACTION_TIME: 0.6, // seconds before shooting after detection
  PATROL_SPEED: 1.5,
  COMBAT_SPEED: 2.5,

  // Shooting
  FIRE_RATE: 1.5, // shots per second
  ACCURACY: 0.15, // spread angle (radians)
  DAMAGE: 15,

  // Detection
  FOV: Math.PI * 0.6, // ~108 degrees field of view
  ALERT_DURATION: 5.0, // seconds to stay alert after losing sight

  // Count
  TOTAL_ENEMIES: 10,
} as const;

// --- Map ---
export const MAP = {
  SIZE: 120, // total map size (units)
  GROUND_Y: 0,
  BUILDING_COLORS: {
    WALL: 0x8B7D6B,
    WALL_DARK: 0x6B5D4B,
    FLOOR: 0x7A6B5A,
    ROOF: 0x5A4B3A,
    CONCRETE: 0x9B9B8B,
    SAND: 0xC4A882,
    SANDBAG: 0x8B7355,
    METAL: 0x4A4A4A,
    VEHICLE_BODY: 0x3D4A3D,
    VEHICLE_RUST: 0x6B4423,
  },
  BOUNDARY_HEIGHT: 8,
} as const;

// --- Rendering ---
export const RENDER = {
  FOG_COLOR: 0xC4A875,
  FOG_NEAR: 30,
  FOG_FAR: 150,
  AMBIENT_LIGHT_COLOR: 0xFFE4B5,
  AMBIENT_LIGHT_INTENSITY: 0.5,
  SUN_COLOR: 0xFFF5E0,
  SUN_INTENSITY: 1.8,
  SHADOW_MAP_SIZE: 2048,
  SKY_COLOR: 0xC4A875,
} as const;

// --- Game States ---
export const GameState = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
} as const;
export type GameState = typeof GameState[keyof typeof GameState];

// --- Player Stance ---
export const Stance = {
  STANDING: 'STANDING',
  CROUCHING: 'CROUCHING',
  PRONE: 'PRONE',
} as const;
export type Stance = typeof Stance[keyof typeof Stance];

// --- Enemy States ---
export const EnemyState = {
  PATROL: 'PATROL',
  ALERT: 'ALERT',
  COMBAT: 'COMBAT',
  DEAD: 'DEAD',
} as const;
export type EnemyState = typeof EnemyState[keyof typeof EnemyState];
