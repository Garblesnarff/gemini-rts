export enum EntityType {
  UNIT = 'UNIT',
  BUILDING = 'BUILDING',
  RESOURCE = 'RESOURCE'
}

export enum UnitType {
  PEASANT = 'Peasant',
  FOOTMAN = 'Footman',
  KNIGHT = 'Knight'
}

export enum BuildingType {
  TOWN_HALL = 'Town Hall',
  BARRACKS = 'Barracks',
  FARM = 'Farm'
}

export enum ResourceType {
  GOLD = 'Gold',
  WOOD = 'Wood'
}

export enum Faction {
  PLAYER = 'Player',
  ENEMY = 'Enemy',
  NEUTRAL = 'Neutral'
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  subType: UnitType | BuildingType | ResourceType;
  faction: Faction;
  position: Position;
  hp: number;
  maxHp: number;
  selected?: boolean;
  targetId?: string | null; // ID of entity being targeted (attack/gather)
  targetPos?: Position | null; // Movement destination
  state?: 'idle' | 'moving' | 'gathering' | 'attacking' | 'returning';
  resourceAmount?: number; // For gold mines/trees
  carryAmount?: number; // For peasants carrying resources
  carryType?: ResourceType; // What resource is being carried
  lastResourceId?: string; // To remember which node to go back to after depositing
  name: string; // For flavor
}

export interface PlacementMode {
  active: boolean;
  type: BuildingType | null;
  cost: { gold: number; wood: number };
}

export interface GameState {
  resources: {
    gold: number;
    wood: number;
    food: number;
    maxFood: number;
  };
  entities: Entity[];
  selection: string[]; // Array of selected Entity IDs
  messages: LogMessage[];
  placementMode: PlacementMode;
  gameOver: boolean;
  wave: number;
}

export interface LogMessage {
  id: string;
  text: string;
  type: 'info' | 'alert' | 'lore';
  timestamp: number;
}
