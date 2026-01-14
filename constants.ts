import { UnitType, BuildingType } from './types';

export const COSTS = {
  [UnitType.PEASANT]: { gold: 50, wood: 0, food: 1, time: 2000 },
  [UnitType.FOOTMAN]: { gold: 120, wood: 20, food: 2, time: 4000 },
  [UnitType.ARCHER]:  { gold: 140, wood: 60, food: 2, time: 3500 },
  [UnitType.KNIGHT]:  { gold: 200, wood: 80, food: 4, time: 6000 },
  
  [BuildingType.BARRACKS]: { gold: 200, wood: 100, time: 5000 },
  [BuildingType.FARM]:     { gold: 80, wood: 40, time: 3000 },
  [BuildingType.TOWER]:    { gold: 150, wood: 120, time: 4000 },
};

export const UNIT_STATS = {
  // Units
  [UnitType.PEASANT]: { hp: 220, damage: 5, speed: 3.5, range: 1.5, attackSpeed: 1000, visionRange: 8 },
  [UnitType.FOOTMAN]: { hp: 420, damage: 12, speed: 4.0, range: 1.5, attackSpeed: 1200, visionRange: 8 },
  [UnitType.ARCHER]:  { hp: 280, damage: 14, speed: 4.5, range: 12.0, attackSpeed: 1500, visionRange: 10 }, 
  [UnitType.KNIGHT]:  { hp: 800, damage: 25, speed: 5.5, range: 1.5, attackSpeed: 1400, visionRange: 9 },
  
  // Buildings
  [BuildingType.TOWN_HALL]: { hp: 1500, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 14 },
  [BuildingType.BARRACKS]: { hp: 800, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 8 },
  [BuildingType.FARM]: { hp: 400, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 6 },
  [BuildingType.TOWER]: { hp: 600, damage: 30, speed: 0, range: 15.0, attackSpeed: 1000, visionRange: 16 },
  
  // Resources
  'Gold': { hp: 10000, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 0 },
  'Wood': { hp: 100, damage: 0, speed: 0, range: 0, attackSpeed: 0, visionRange: 0 },
};

export const COLORS = {
  PLAYER: '#3b82f6', // Blue
  ENEMY: '#ef4444', // Red
  NEUTRAL: '#fbbf24', // Gold (resources)
  SELECTION: '#00ff00', // Green ring
};

export const INITIAL_CAMERA_POS = [20, 25, 20] as const;