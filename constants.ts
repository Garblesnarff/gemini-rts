import { UnitType, BuildingType } from './types';

export const COSTS = {
  [UnitType.PEASANT]: { gold: 50, wood: 0, food: 1, time: 2000 },
  [UnitType.FOOTMAN]: { gold: 120, wood: 20, food: 2, time: 4000 },
  [UnitType.KNIGHT]: { gold: 200, wood: 80, food: 4, time: 6000 },
  [BuildingType.BARRACKS]: { gold: 200, wood: 100, time: 5000 },
  [BuildingType.FARM]: { gold: 80, wood: 40, time: 3000 },
};

export const UNIT_STATS = {
  [UnitType.PEASANT]: { hp: 220, damage: 5, speed: 2.5, range: 1.5 },
  [UnitType.FOOTMAN]: { hp: 420, damage: 12, speed: 3.0, range: 1.5 },
  [UnitType.KNIGHT]: { hp: 800, damage: 25, speed: 4.5, range: 1.5 },
};

export const COLORS = {
  PLAYER: '#3b82f6', // Blue
  ENEMY: '#ef4444', // Red
  NEUTRAL: '#fbbf24', // Gold (resources)
  SELECTION: '#00ff00', // Green ring
};

export const INITIAL_CAMERA_POS = [20, 25, 20] as const;
