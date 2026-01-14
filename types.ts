
export enum EntityType {
  UNIT = 'UNIT',
  BUILDING = 'BUILDING',
  RESOURCE = 'RESOURCE'
}

export enum UnitType {
  PEASANT = 'Peasant',
  FOOTMAN = 'Footman',
  KNIGHT = 'Knight',
  ARCHER = 'Archer'
}

export enum BuildingType {
  TOWN_HALL = 'Town Hall',
  BARRACKS = 'Barracks',
  FARM = 'Farm',
  TOWER = 'Scout Tower'
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

export interface QueueItem {
  id: string;
  unitType: UnitType;
  progress: number;
  totalTime: number;
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
  visible?: boolean; // Fog of War visibility status
  
  // Advanced Movement
  attackMoveDestination?: Position | null; // If set, unit returns to moving here after combat

  // Economy
  resourceAmount?: number;
  carryAmount?: number;
  carryType?: ResourceType;
  lastResourceId?: string;
  
  // Buildings
  productionQueue?: QueueItem[];
  rallyPoint?: Position | null;

  // Combat
  lastAttackTime: number;
  name: string;
}

export interface Projectile {
  id: string;
  startPos: Position;
  targetId: string; // Homing arrows for MVP
  speed: number;
  progress: number; // 0 to 1
  damage: number;
}

export interface FloatingText {
  id: string;
  text: string;
  position: Position;
  color: string;
  life: number; // 0 to 1
}

export interface PlacementMode {
  active: boolean;
  type: BuildingType | null;
  cost: { gold: number; wood: number };
}

export interface CommandMode {
  active: boolean;
  type: 'ATTACK_MOVE' | null;
}

export interface GameState {
  resources: {
    gold: number;
    wood: number;
    food: number;
    maxFood: number;
  };
  entities: Entity[];
  projectiles: Projectile[];
  floatingTexts: FloatingText[];
  selection: string[]; 
  controlGroups: Record<string, string[]>; // Key "1" through "9" -> Entity IDs
  messages: LogMessage[];
  placementMode: PlacementMode;
  commandMode: CommandMode;
  gameOver: boolean;
  wave: number;
}

export interface LogMessage {
  id: string;
  text: string;
  type: 'info' | 'alert' | 'lore';
  timestamp: number;
}
