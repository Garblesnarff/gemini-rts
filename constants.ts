

import { UnitType, BuildingType, UpgradeType } from './types';

export const MAX_WAVES = 10;
export const MAP_SIZE = 200;
export const DRAG_THRESHOLD = 5;

export const COSTS = {
  [UnitType.PEASANT]: { gold: 50, wood: 0, food: 1, time: 2000 },
  [UnitType.FOOTMAN]: { gold: 120, wood: 20, food: 2, time: 4000 },
  [UnitType.ARCHER]:  { gold: 140, wood: 60, food: 2, time: 3500 },
  [UnitType.KNIGHT]:  { gold: 200, wood: 80, food: 4, time: 6000 },
  
  [BuildingType.BARRACKS]: { gold: 200, wood: 100, time: 5000 },
  [BuildingType.FARM]:     { gold: 80, wood: 40, time: 3000 },
  [BuildingType.TOWER]:    { gold: 150, wood: 120, time: 4000 },
  [BuildingType.BLACKSMITH]: { gold: 200, wood: 150, time: 6000 },

  [UpgradeType.IRON_SWORDS]: { gold: 150, wood: 100, time: 15000 }, // 15s
  [UpgradeType.STEEL_ARROWS]: { gold: 150, wood: 150, time: 15000 },
  [UpgradeType.LEATHER_ARMOR]: { gold: 100, wood: 100, time: 20000 },
  [UpgradeType.PLATE_ARMOR]: { gold: 250, wood: 200, time: 30000 },
};

export const UNIT_STATS = {
  // Units
  [UnitType.PEASANT]: { hp: 220, damage: 5, speed: 3.5, range: 1.5, attackSpeed: 1000, visionRange: 10 },
  [UnitType.FOOTMAN]: { hp: 420, damage: 12, speed: 4.0, range: 1.5, attackSpeed: 1200, visionRange: 10 },
  [UnitType.ARCHER]:  { hp: 280, damage: 14, speed: 4.5, range: 12.0, attackSpeed: 1500, visionRange: 12 }, 
  [UnitType.KNIGHT]:  { hp: 800, damage: 25, speed: 5.5, range: 1.5, attackSpeed: 1400, visionRange: 11 },
  
  // Buildings
  [BuildingType.TOWN_HALL]: { hp: 1500, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 16 },
  [BuildingType.BARRACKS]: { hp: 800, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 10 },
  [BuildingType.FARM]: { hp: 400, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 8 },
  [BuildingType.TOWER]: { hp: 600, damage: 30, speed: 0, range: 15.0, attackSpeed: 1000, visionRange: 18 },
  [BuildingType.BLACKSMITH]: { hp: 700, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 8 },
  
  // Resources
  'Gold': { hp: 15000, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 0 },
  'Wood': { hp: 100, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 0 },
  'Stone': { hp: 10000, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 0 },
  'Iron': { hp: 8000, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 0 },
};

export const COLORS = {
  PLAYER: '#3b82f6', // Blue
  ENEMY: '#ef4444', // Red
  NEUTRAL: '#fbbf24', // Gold (resources)
  SELECTION: '#00ff00', // Green ring
  RALLY: '#fbbf24', // Yellow flag
};

// Start camera offset from the player base (-60, -60)
// Camera at -40, 45, -40 looking at -60, 0, -60
export const INITIAL_CAMERA_POS = [-40, 45, -40] as const; 

export const AGGRO_RANGE = 12;
export const QUEUE_SIZE = 5;

export const ENEMY_SPAWN_POINTS = [
  { x: 0, y: 0, z: 95 },   // North
  { x: 95, y: 0, z: 0 },   // East
  { x: 70, y: 0, z: 70 },  // North East (Boss)
  { x: 70, y: 0, z: -70 }, // South East
];