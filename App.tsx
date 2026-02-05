import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

import { GameScene } from './components/GameScene';
import { UIOverlay } from './components/UIOverlay';
import { GameState, Entity, UnitType, BuildingType, EntityType, Faction, ResourceType, UpgradeType } from './types';
import { COSTS, INITIAL_CAMERA_POS, UNIT_STATS, AGGRO_RANGE, ENEMY_AGGRO_RANGE, RETALIATION_WINDOW, BUILDING_PRIORITY, QUEUE_SIZE, MAX_WAVES, MAP_SIZE, ENEMY_SPAWN_POINTS } from './constants';
import { generateLore, generateAdvisorTip } from './services/geminiService';

// --- Map Generation Helper ---
const generateForest = (centerX: number, centerZ: number, count: number, namePrefix: string): Entity[] => {
    const trees: Entity[] = [];
    for (let i = 0; i < count; i++) {
        const offsetX = (Math.random() - 0.5) * 16;
        const offsetZ = (Math.random() - 0.5) * 16;
        trees.push({
            id: uuidv4(),
            type: EntityType.RESOURCE,
            subType: ResourceType.WOOD,
            faction: Faction.NEUTRAL,
            position: { x: centerX + offsetX, y: 0, z: centerZ + offsetZ },
            hp: 100,
            maxHp: 100,
            resourceAmount: 500,
            name: `${namePrefix} Tree`,
            lastAttackTime: 0,
            visible: true
        });
    }
    return trees;
};

// --- Initial Map Data ---
const buildInitialMap = (): Entity[] => {
    const entities: Entity[] = [
        // Player Start
        { id: 'th-1', type: EntityType.BUILDING, subType: BuildingType.TOWN_HALL, faction: Faction.PLAYER, position: { x: -60, y: 0, z: -60 }, hp: 1500, maxHp: 1500, name: 'Main Keep', lastAttackTime: 0, visible: true, productionQueue: [], rallyPoint: null },
        { id: 'p-1', type: EntityType.UNIT, subType: UnitType.PEASANT, faction: Faction.PLAYER, position: { x: -55, y: 0, z: -55 }, hp: 220, maxHp: 220, state: 'idle', name: 'Peasant John', lastAttackTime: 0, visible: true },
        { id: 'p-2', type: EntityType.UNIT, subType: UnitType.PEASANT, faction: Faction.PLAYER, position: { x: -55, y: 0, z: -65 }, hp: 220, maxHp: 220, state: 'idle', name: 'Peasant Mike', lastAttackTime: 0, visible: true },
        { id: 'f-1', type: EntityType.UNIT, subType: UnitType.FOOTMAN, faction: Faction.PLAYER, position: { x: -65, y: 0, z: -55 }, hp: 420, maxHp: 420, state: 'idle', name: 'Guard', lastAttackTime: 0, visible: true },

        // Gold Mines
        { id: 'gm-1', type: EntityType.RESOURCE, subType: ResourceType.GOLD, faction: Faction.NEUTRAL, position: { x: -50, y: 0, z: -50 }, hp: 15000, maxHp: 15000, resourceAmount: 15000, name: 'Gold Mine', lastAttackTime: 0, visible: true },
        { id: 'gm-2', type: EntityType.RESOURCE, subType: ResourceType.GOLD, faction: Faction.NEUTRAL, position: { x: 0, y: 0, z: 0 }, hp: 15000, maxHp: 15000, resourceAmount: 15000, name: 'Gold Mine', lastAttackTime: 0, visible: true },
        { id: 'gm-3', type: EntityType.RESOURCE, subType: ResourceType.GOLD, faction: Faction.NEUTRAL, position: { x: 60, y: 0, z: 60 }, hp: 15000, maxHp: 15000, resourceAmount: 15000, name: 'Gold Mine', lastAttackTime: 0, visible: true },

        // Stone Quarries
        { id: 'sq-1', type: EntityType.RESOURCE, subType: ResourceType.STONE, faction: Faction.NEUTRAL, position: { x: -30, y: 0, z: -20 }, hp: 10000, maxHp: 10000, resourceAmount: 10000, name: 'Stone Quarry', lastAttackTime: 0, visible: true },
        { id: 'sq-2', type: EntityType.RESOURCE, subType: ResourceType.STONE, faction: Faction.NEUTRAL, position: { x: 30, y: 0, z: -30 }, hp: 10000, maxHp: 10000, resourceAmount: 10000, name: 'Stone Quarry', lastAttackTime: 0, visible: true },
        { id: 'sq-3', type: EntityType.RESOURCE, subType: ResourceType.STONE, faction: Faction.NEUTRAL, position: { x: 50, y: 0, z: 20 }, hp: 10000, maxHp: 10000, resourceAmount: 10000, name: 'Stone Quarry', lastAttackTime: 0, visible: true },

        // Iron Deposits
        { id: 'ir-1', type: EntityType.RESOURCE, subType: ResourceType.IRON, faction: Faction.NEUTRAL, position: { x: 20, y: 0, z: 40 }, hp: 8000, maxHp: 8000, resourceAmount: 8000, name: 'Iron Deposit', lastAttackTime: 0, visible: true },
        { id: 'ir-2', type: EntityType.RESOURCE, subType: ResourceType.IRON, faction: Faction.NEUTRAL, position: { x: -40, y: 0, z: 60 }, hp: 8000, maxHp: 8000, resourceAmount: 8000, name: 'Iron Deposit', lastAttackTime: 0, visible: true },
    ];

    // Forests
    entities.push(...generateForest(-70, -40, 8, "Ancient"));
    entities.push(...generateForest(-20, -70, 10, "Southern"));
    entities.push(...generateForest(10, 10, 12, "Central"));
    entities.push(...generateForest(60, -20, 8, "Eastern"));
    entities.push(...generateForest(-30, 70, 15, "Northern"));

    return entities;
};

// --- AI Targeting Helper ---
const findEnemyTarget = (enemy: Entity, allEntities: Entity[], now: number): Entity | null => {
    const playerEntities = allEntities.filter(e => e.faction === Faction.PLAYER && e.hp > 0);
    if (playerEntities.length === 0) return null;

    // 1. Retaliation: If we were damaged recently, attack the source
    if (enemy.lastDamagedBy && enemy.lastDamagedAt && (now - enemy.lastDamagedAt < RETALIATION_WINDOW)) {
        const attacker = playerEntities.find(e => e.id === enemy.lastDamagedBy);
        if (attacker && attacker.hp > 0) return attacker;
    }

    // 2. Aggro Range (Nearby Units)
    // Always prioritize immediate threats in proximity
    const nearbyUnits = playerEntities.filter(e => e.type === EntityType.UNIT);
    let closestUnit = null;
    let closestUnitDist = Infinity;
    
    for (const unit of nearbyUnits) {
        const d = Math.sqrt(Math.pow(enemy.position.x - unit.position.x, 2) + Math.pow(enemy.position.z - unit.position.z, 2));
        if (d < ENEMY_AGGRO_RANGE && d < closestUnitDist) {
            closestUnitDist = d;
            closestUnit = unit;
        }
    }
    if (closestUnit) return closestUnit;

    // 3. Strategic Priority (Hunt)
    // Look for buildings first if no units are nearby to threaten us
    const buildings = playerEntities.filter(e => e.type === EntityType.BUILDING);
    if (buildings.length > 0) {
        // Check specific high-value targets first
        for (const type of BUILDING_PRIORITY) {
             const typeBuildings = buildings.filter(b => b.subType === type);
             if (typeBuildings.length > 0) {
                 let closest = null;
                 let minD = Infinity;
                 for (const b of typeBuildings) {
                     const d = Math.sqrt(Math.pow(enemy.position.x - b.position.x, 2) + Math.pow(enemy.position.z - b.position.z, 2));
                     if (d < minD) { minD = d; closest = b; }
                 }
                 if (closest) return closest;
             }
        }
        // Fallback to closest building of any type
        let closest = null;
        let minD = Infinity;
         for (const b of buildings) {
             const d = Math.sqrt(Math.pow(enemy.position.x - b.position.x, 2) + Math.pow(enemy.position.z - b.position.z, 2));
             if (d < minD) { minD = d; closest = b; }
         }
        if (closest) return closest;
    }

    // 4. Global Fallback (Any nearest entity)
    let globalClosest = null;
    let globalMinD = Infinity;
    for (const p of playerEntities) {
        const d = Math.sqrt(Math.pow(enemy.position.x - p.position.x, 2) + Math.pow(enemy.position.z - p.position.z, 2));
        if (d < globalMinD) { globalMinD = d; globalClosest = p; }
    }
    return globalClosest;
};


export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    resources: { gold: 200, wood: 100, stone: 0, iron: 0, food: 1, maxFood: 10 },
    entities: buildInitialMap(),
    projectiles: [],
    floatingTexts: [],
    selection: [],
    controlGroups: {},
    messages: [{ id: 'init', text: 'Welcome to Realm of Aethelgard.', type: 'info', timestamp: Date.now() }],
    placementMode: { active: false, type: null, cost: { gold: 0, wood: 0 } },
    commandMode: { active: false, type: null },
    gameOver: false,
    gameWon: false,
    wave: 1,
    upgrades: {} as Record<UpgradeType, boolean>,
    stats: {
        unitsTrained: 0,
        unitsLost: 0,
        enemiesKilled: 0,
        resourcesGathered: { gold: 0, wood: 0, stone: 0, iron: 0 },
        timeElapsed: 0
    }
  });

  const [selectionBox, setSelectionBox] = useState<{start: {x:number, y:number}, current: {x:number, y:number}} | null>(null);
  const [cameraTarget, setCameraTarget] = useState<THREE.Vector3 | null>(new THREE.Vector3(-60, 0, -60));
  const [timeToNextWave, setTimeToNextWave] = useState(300);

  const waveTimerRef = useRef(0);
  const nextWaveTimeRef = useRef(300); // 5 minutes for first wave
  const lastKeyTimeRef = useRef<{key: string, time: number}>({ key: '', time: 0 });

  const addMessage = useCallback((text: string, type: 'info' | 'alert' | 'lore' = 'info') => {
    setGameState(prev => ({
      ...prev,
      messages: [...prev.messages, { id: uuidv4(), text, type, timestamp: Date.now() }]
    }));
  }, []);

  // --- Input Handling (Keyboard) ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (gameState.gameOver) return;

          // 1. Command Mode (A, P)
          if (e.code === 'KeyA') {
              setGameState(prev => ({
                  ...prev,
                  placementMode: { active: false, type: null, cost: {gold:0, wood:0} },
                  commandMode: { active: true, type: 'ATTACK_MOVE' }
              }));
              return;
          }
          if (e.code === 'KeyP') {
              setGameState(prev => ({
                  ...prev,
                  placementMode: { active: false, type: null, cost: {gold:0, wood:0} },
                  commandMode: { active: true, type: 'PATROL' }
              }));
              return;
          }

          // 2. Immediate Commands (H, S)
          if (e.code === 'KeyH') {
              handleCommand('HOLD');
              return;
          }
          if (e.code === 'KeyS') {
              handleCommand('STOP');
              return;
          }

          // 3. Escape to Cancel
          if (e.code === 'Escape') {
              setGameState(prev => ({
                  ...prev,
                  placementMode: { active: false, type: null, cost: {gold:0, wood:0} },
                  commandMode: { active: false, type: null },
                  selection: []
              }));
              return;
          }

          // 4. Control Groups (1-9)
          const isNum = /Digit[1-9]/.test(e.code);
          if (isNum) {
              const groupNum = e.key;
              if (e.ctrlKey) {
                  // Save group
                  setGameState(prev => {
                      if (prev.selection.length === 0) return prev;
                      const newGroups = { ...prev.controlGroups, [groupNum]: prev.selection };
                      return { 
                          ...prev, 
                          controlGroups: newGroups,
                          messages: [...prev.messages, { id: uuidv4(), text: `Group ${groupNum} assigned.`, type: 'info', timestamp: Date.now() }] 
                      };
                  });
              } else {
                  // Load group
                  setGameState(prev => {
                      const group = prev.controlGroups[groupNum];
                      if (!group || group.length === 0) return prev;
                      
                      // Double tap detection
                      const now = Date.now();
                      if (lastKeyTimeRef.current.key === groupNum && now - lastKeyTimeRef.current.time < 300) {
                          // Center Camera
                          const firstEnt = prev.entities.find(en => en.id === group[0]);
                          if (firstEnt) {
                              setCameraTarget(new THREE.Vector3(firstEnt.position.x, firstEnt.position.y, firstEnt.position.z));
                          }
                      }
                      lastKeyTimeRef.current = { key: groupNum, time: now };

                      return {
                          ...prev,
                          selection: group,
                          entities: prev.entities.map(en => ({
                              ...en,
                              selected: group.includes(en.id)
                          }))
                      };
                  });
              }
          }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.gameOver]);


  const handleSelectEntity = (ids: string[], multi: boolean) => {
    if (gameState.placementMode.active || gameState.commandMode.active) return; 

    setGameState(prev => {
        const visibleIds = ids.filter(id => {
            const ent = prev.entities.find(e => e.id === id);
            return ent && ent.visible;
        });

        let newSelection = multi ? [...prev.selection, ...visibleIds] : visibleIds;
        newSelection = [...new Set(newSelection)];

        return {
            ...prev,
            selection: newSelection,
            entities: prev.entities.map(e => ({
                ...e,
                selected: newSelection.includes(e.id)
            }))
        };
    });
  };

  const handleRightClickGround = (point: THREE.Vector3) => {
    if (gameState.placementMode.active || gameState.commandMode.active) {
        setGameState(prev => ({ 
            ...prev, 
            placementMode: { active: false, type: null, cost: {gold:0, wood:0} },
            commandMode: { active: false, type: null }
        }));
        return;
    }

    setGameState(prev => {
      const selectedIds = prev.selection;
      if (selectedIds.length === 0) return prev;
      
      // If buildings are selected, set Rally Point
      const buildingSelected = prev.entities.find(e => selectedIds.includes(e.id) && e.type === EntityType.BUILDING);
      if (buildingSelected && selectedIds.length === 1) {
          return {
              ...prev,
              entities: prev.entities.map(e => e.id === buildingSelected.id ? { ...e, rallyPoint: {x: point.x, y:0, z: point.z} } : e),
              messages: [...prev.messages, { id: uuidv4(), text: "Rally point set.", type: 'info', timestamp: Date.now() }]
          };
      }

      // Unit Movement
      return {
        ...prev,
        entities: prev.entities.map(e => {
          if (selectedIds.includes(e.id) && e.faction === Faction.PLAYER && e.type === EntityType.UNIT) {
            return {
              ...e,
              state: 'moving',
              targetPos: { x: point.x, y: 0, z: point.z },
              targetId: null,
              attackMoveDestination: null,
              patrolPoints: undefined,
              holdPosition: false
            };
          }
          return e;
        })
      };
    });
  };

  const handleAttackMove = (point: THREE.Vector3) => {
      const isPatrol = gameState.commandMode.type === 'PATROL';
      const isAttack = gameState.commandMode.type === 'ATTACK_MOVE';

      setGameState(prev => {
          const selectedIds = prev.selection;
          return {
              ...prev,
              commandMode: { active: false, type: null },
              entities: prev.entities.map(e => {
                  if (selectedIds.includes(e.id) && e.faction === Faction.PLAYER && e.type === EntityType.UNIT) {
                      const baseUpdates: Partial<Entity> = {
                          state: 'moving',
                          targetPos: { x: point.x, y: 0, z: point.z },
                          targetId: null,
                          holdPosition: false
                      };

                      if (isPatrol) {
                          return {
                              ...e,
                              ...baseUpdates,
                              patrolPoints: [ { ...e.position }, { x: point.x, y: 0, z: point.z } ],
                              patrolIndex: 1,
                              attackMoveDestination: null
                          }
                      } else {
                          // Attack Move
                          return {
                              ...e,
                              ...baseUpdates,
                              attackMoveDestination: { x: point.x, y: 0, z: point.z },
                              patrolPoints: undefined
                          }
                      }
                  }
                  return e;
              }),
              messages: [...prev.messages, { id: uuidv4(), text: isPatrol ? "Patrol route set." : "Attack Move!", type: 'info', timestamp: Date.now() }]
          };
      });
  };

  const handleRightClickEntity = (targetId: string) => {
    setGameState(prev => {
      if (prev.commandMode.active) {
          // If we click an entity while in attack command mode, it's just a direct attack
          return { ...prev, commandMode: { active: false, type: null } }; // Continue to logic below
      }

      const target = prev.entities.find(e => e.id === targetId);
      if (!target || !target.visible) return prev;
      
      let actionTriggered = false;

      const newEntities = prev.entities.map(e => {
          if (prev.selection.includes(e.id) && e.faction === Faction.PLAYER && e.type === EntityType.UNIT) {
            // Reset special states
            const resetState = { patrolPoints: undefined, holdPosition: false, attackMoveDestination: null };

            // Attack Enemy
            if (target.faction === Faction.ENEMY) {
                actionTriggered = true;
                return { 
                    ...e, 
                    ...resetState,
                    state: 'attacking', 
                    targetId: target.id, 
                    targetPos: null
                };
            }
            // Gather Resource
            if (target.type === EntityType.RESOURCE && e.subType === UnitType.PEASANT) {
                actionTriggered = true;
                return { 
                    ...e, 
                    ...resetState,
                    state: 'gathering', 
                    targetId: target.id, 
                    targetPos: null, 
                    lastResourceId: target.id
                };
            }
            // Follow/Guard (Basic Move to pos)
            actionTriggered = true;
            return { 
                ...e, 
                ...resetState,
                state: 'moving', 
                targetPos: target.position, 
                targetId: null
            };
          }
          return e;
      });

      return {
        ...prev,
        entities: newEntities,
        messages: actionTriggered ? [...prev.messages, { id: uuidv4(), text: "Orders received.", type: 'info', timestamp: Date.now() }] : prev.messages
      };
    });
  };

  const handlePlaceBuilding = (pos: THREE.Vector3) => {
      const { active, type, cost } = gameState.placementMode;
      if (!active || !type) return;

      const isVisible = gameState.entities.some(e => {
          if (e.faction !== Faction.PLAYER || e.hp <= 0) return false;
          const stats = UNIT_STATS[e.subType as keyof typeof UNIT_STATS];
          const range = stats?.visionRange || 8;
          const dx = e.position.x - pos.x;
          const dz = e.position.z - pos.z;
          return (dx * dx + dz * dz) <= (range * range);
      });

      if (!isVisible) {
          addMessage("Cannot build in unexplored territory!", 'alert');
          return;
      }

      const canAfford = 
        gameState.resources.gold >= cost.gold && 
        gameState.resources.wood >= cost.wood && 
        gameState.resources.stone >= (cost.stone || 0);

      if (canAfford) {
          const peasantId = gameState.selection.find(id => {
              const ent = gameState.entities.find(e => e.id === id);
              return ent && ent.subType === UnitType.PEASANT;
          });
          
          if (peasantId) {
              const newBuilding: Entity = {
                id: uuidv4(),
                type: EntityType.BUILDING,
                subType: type,
                faction: Faction.PLAYER,
                position: { x: pos.x, y: 0, z: pos.z },
                hp: UNIT_STATS[type].hp,
                maxHp: UNIT_STATS[type].hp,
                name: type,
                lastAttackTime: 0,
                visible: true,
                productionQueue: [],
                rallyPoint: { x: pos.x + 5, y: 0, z: pos.z + 5 } // Default rally
              };
              
              setGameState(prev => ({
                  ...prev,
                  resources: {
                      ...prev.resources,
                      gold: prev.resources.gold - cost.gold,
                      wood: prev.resources.wood - cost.wood,
                      stone: prev.resources.stone - (cost.stone || 0)
                  },
                  entities: [...prev.entities, newBuilding],
                  placementMode: { active: false, type: null, cost: {gold:0, wood:0} }
              }));
              addMessage(`Construction of ${type} complete!`);
          } else {
              addMessage("No peasant selected to build!");
              setGameState(prev => ({ ...prev, placementMode: { active: false, type: null, cost: {gold:0, wood:0} } }));
          }
      } else {
          addMessage("Not enough resources!");
      }
  };

  const handleTrainUnit = (type: UnitType) => {
    const cost = COSTS[type];
    
    // Check Food Limit
    const unitFood = cost.food || 1;
    if (gameState.resources.food + unitFood > gameState.resources.maxFood) {
        addMessage("Need more farms!", 'alert');
        return;
    }

    if (gameState.resources.gold >= cost.gold && gameState.resources.wood >= cost.wood) {
       const buildingId = gameState.selection[0];
       
       setGameState(prev => {
            const building = prev.entities.find(e => e.id === buildingId);
            if (!building || !building.productionQueue) return prev;
            if (building.productionQueue.length >= QUEUE_SIZE) {
                return {
                    ...prev,
                    messages: [...prev.messages, { id: uuidv4(), text: "Production queue full!", type: 'alert', timestamp: Date.now() }]
                };
            }

            // Deduct resources immediately
            const newResources = {
                ...prev.resources,
                gold: prev.resources.gold - cost.gold,
                wood: prev.resources.wood - cost.wood,
                // Food is updated dynamically in loop
            };

            const updatedBuilding = {
                ...building,
                productionQueue: [
                    ...building.productionQueue, 
                    { id: uuidv4(), type: 'UNIT', name: type, progress: 0, totalTime: cost.time }
                ]
            };

            return {
                ...prev,
                resources: newResources,
                entities: prev.entities.map(e => e.id === buildingId ? updatedBuilding : e),
                messages: [...prev.messages, { id: uuidv4(), text: `Training ${type}...`, type: 'info', timestamp: Date.now() }]
            };
       });
    } else {
        addMessage("Not enough resources!", 'alert');
    }
  };

  const handleResearch = (type: UpgradeType) => {
      const cost = COSTS[type];
      if (gameState.resources.gold >= cost.gold && gameState.resources.wood >= cost.wood) {
          const buildingId = gameState.selection[0];
          setGameState(prev => {
              const building = prev.entities.find(e => e.id === buildingId);
              if (!building || !building.productionQueue) return prev;
              
              if (building.productionQueue.length > 0) {
                  return { ...prev, messages: [...prev.messages, { id: uuidv4(), text: "Research queue busy!", type: 'alert', timestamp: Date.now() }] };
              }

              const newResources = {
                  ...prev.resources,
                  gold: prev.resources.gold - cost.gold,
                  wood: prev.resources.wood - cost.wood
              };
              
               const updatedBuilding = {
                  ...building,
                  productionQueue: [
                      { id: uuidv4(), type: 'UPGRADE', name: type, progress: 0, totalTime: cost.time }
                  ]
              };

               return {
                  ...prev,
                  resources: newResources,
                  entities: prev.entities.map(e => e.id === buildingId ? updatedBuilding : e),
                  messages: [...prev.messages, { id: uuidv4(), text: `Researching ${type}...`, type: 'info', timestamp: Date.now() }]
              };
          });
      } else {
          addMessage("Not enough resources!", 'alert');
      }
  };

  const handleBuild = (type: BuildingType) => {
      setGameState(prev => ({
          ...prev,
          placementMode: { active: true, type, cost: COSTS[type] }
      }));
      addMessage("Select location to build.");
  };

  const handleLore = async (entity: Entity) => {
      addMessage("Consulting the archives...", 'info');
      const lore = await generateLore(entity);
      addMessage(lore, 'lore');
  };

  const handleAdvisor = async () => {
      addMessage("Summoning advisor...", 'info');
      const tip = await generateAdvisorTip(gameState.resources, gameState.entities.filter(e => e.faction === Faction.PLAYER && e.type === EntityType.UNIT).length);
      addMessage(tip, 'lore');
  }

  const handleCommand = (cmd: 'ATTACK_MOVE' | 'STOP' | 'HOLD' | 'PATROL') => {
      if (cmd === 'ATTACK_MOVE' || cmd === 'PATROL') {
          setGameState(prev => ({
              ...prev,
              commandMode: { active: true, type: cmd }
          }));
      } else if (cmd === 'STOP') {
          setGameState(prev => ({
              ...prev,
              entities: prev.entities.map(e => {
                  if (prev.selection.includes(e.id) && e.faction === Faction.PLAYER && e.type === EntityType.UNIT) {
                      return {
                          ...e,
                          state: 'idle',
                          targetId: null,
                          targetPos: null,
                          patrolPoints: undefined,
                          attackMoveDestination: null,
                          holdPosition: false
                      };
                  }
                  return e;
              })
          }));
          addMessage("Units Stopped.");
      } else if (cmd === 'HOLD') {
          setGameState(prev => ({
              ...prev,
              entities: prev.entities.map(e => {
                  if (prev.selection.includes(e.id) && e.faction === Faction.PLAYER && e.type === EntityType.UNIT) {
                      return {
                          ...e,
                          state: 'idle',
                          targetId: null,
                          targetPos: null,
                          patrolPoints: undefined,
                          attackMoveDestination: null,
                          holdPosition: true
                      };
                  }
                  return e;
              })
          }));
          addMessage("Holding Position.");
      }
  };

  const handleMinimapClick = (u: number, v: number) => {
    // Convert UV (0-1) to World Coords (-60 to 60)
    const x = (u * MAP_SIZE) - (MAP_SIZE / 2);
    const z = (v * MAP_SIZE) - (MAP_SIZE / 2);
    setCameraTarget(new THREE.Vector3(x, 0, z));
  };

  const handleMinimapCommand = (u: number, v: number) => {
    const x = (u * MAP_SIZE) - (MAP_SIZE / 2);
    const z = (v * MAP_SIZE) - (MAP_SIZE / 2);
    handleRightClickGround(new THREE.Vector3(x, 0, z));
  };

  // --- GAME LOOP ---
  useEffect(() => {
    const interval = setInterval(() => {
        setGameState(prev => {
            if (prev.gameOver) return prev;

            const now = Date.now();
            let newEntities = [...prev.entities];
            let newResources = { ...prev.resources };
            let messages = [...prev.messages];
            let newProjectiles = [...prev.projectiles];
            let newFloatingTexts = [...prev.floatingTexts];
            let newUpgrades = { ...prev.upgrades };
            let newStats = { ...prev.stats };
            let hasChanges = false;
            let currentWave = prev.wave;
            let gameOver = false;
            let gameWon = false;

            const delta = 1000/30; // approx ms per frame
            const deltaSeconds = delta / 1000;
            newStats.timeElapsed += deltaSeconds;

            // Helper for Stats with Upgrades
            const getStats = (type: UnitType | BuildingType) => {
                const base = UNIT_STATS[type];
                const s = { ...base };
                if (prev.upgrades[UpgradeType.IRON_SWORDS] && (type === UnitType.FOOTMAN || type === UnitType.KNIGHT)) {
                    s.damage += 3;
                }
                if (prev.upgrades[UpgradeType.STEEL_ARROWS] && (type === UnitType.ARCHER || type === BuildingType.TOWER)) {
                    s.damage += 4;
                }
                if (prev.upgrades[UpgradeType.LEATHER_ARMOR] && (type === UnitType.FOOTMAN || type === UnitType.ARCHER)) {
                    s.hp += 50; 
                }
                if (prev.upgrades[UpgradeType.PLATE_ARMOR] && (type === UnitType.KNIGHT)) {
                    s.hp += 100;
                }
                return s;
            };

            // 1. WAVE LOGIC
            waveTimerRef.current += deltaSeconds;
            if (Math.floor(waveTimerRef.current) % 1 === 0) {
                 const remaining = Math.max(0, Math.ceil(nextWaveTimeRef.current - waveTimerRef.current));
                 setTimeToNextWave(remaining); 
            }

            if (waveTimerRef.current >= nextWaveTimeRef.current) {
                if (currentWave < MAX_WAVES) {
                    waveTimerRef.current = 0;
                    currentWave++;
                    nextWaveTimeRef.current = 120; // Subsequent waves every 120s
                    
                    // Wave Logic: Calculate count and active spawn points
                    const baseCount = (currentWave * 2) + 2;
                    let activeSpawns = [ENEMY_SPAWN_POINTS[0]]; // Always North
                    if (currentWave > 3) activeSpawns.push(ENEMY_SPAWN_POINTS[1]); // East
                    if (currentWave > 6) activeSpawns.push(ENEMY_SPAWN_POINTS[3]); // South East
                    if (currentWave === MAX_WAVES) activeSpawns = ENEMY_SPAWN_POINTS; // All sides
                    
                    const spawnCount = Math.floor(baseCount * activeSpawns.length * 0.6); // Slightly adjusted formula

                    messages.push({ id: uuidv4(), text: `Wave ${currentWave} approaching!`, type: 'alert', timestamp: Date.now() });

                    for(let i=0; i<spawnCount; i++) {
                        const spawnPoint = activeSpawns[Math.floor(Math.random() * activeSpawns.length)];
                        const spawnPos = { 
                            x: spawnPoint.x + (Math.random() - 0.5) * 10, 
                            y: 0, 
                            z: spawnPoint.z + (Math.random() - 0.5) * 10 
                        };
                        
                        // Determine Unit Type based on wave composition
                        let subType = UnitType.PEASANT;
                        if (i % 3 === 0) subType = UnitType.FOOTMAN;
                        if (currentWave >= 4 && i % 4 === 0) subType = UnitType.FOOTMAN; // More footmen
                        if (currentWave >= 7 && i % 3 === 1) subType = UnitType.ARCHER; // Add Archers
                        
                        // Boss logic for Wave 10
                        if (currentWave === MAX_WAVES && i === 0) subType = UnitType.KNIGHT; // Mini-boss

                        // Create enemy
                        const newEnemy: Entity = {
                            id: uuidv4(),
                            type: EntityType.UNIT,
                            subType, 
                            faction: Faction.ENEMY,
                            position: spawnPos,
                            hp: UNIT_STATS[subType]?.hp || 420, 
                            maxHp: UNIT_STATS[subType]?.hp || 420,
                            state: 'idle', 
                            name: 'Invader',
                            lastAttackTime: 0,
                            visible: false,
                            targetPriority: 'units' // Default priority
                        };
                        
                        // Immediate Target Acquisition for Spawns
                        const initialTarget = findEnemyTarget(newEnemy, newEntities, now);
                        if (initialTarget) {
                            newEnemy.state = 'attacking';
                            newEnemy.targetId = initialTarget.id;
                        } else {
                            // Fallback move to base center if no targets found (e.g. all dead)
                            newEnemy.state = 'moving';
                            newEnemy.targetPos = { x: -60, y: 0, z: -60 };
                        }

                        newEntities.push(newEnemy);
                    }
                    hasChanges = true;
                }
            }

            // 2. PRODUCTION QUEUES
            const spawnedUnits: Entity[] = [];

            newEntities = newEntities.map(e => {
                if (e.type === EntityType.BUILDING && e.productionQueue && e.productionQueue.length > 0) {
                    const currentQueue = [...e.productionQueue];
                    const currentItem = { ...currentQueue[0] };
                    
                    currentItem.progress += delta;
                    
                    if (currentItem.progress >= currentItem.totalTime) {
                        // Complete Item
                        if (currentItem.type === 'UNIT') {
                            const spawnPos = { x: e.position.x + 3, y: 0, z: e.position.z + 3 };
                            const uStats = getStats(currentItem.name as UnitType);
                            const newUnit: Entity = {
                                id: uuidv4(),
                                type: EntityType.UNIT,
                                subType: currentItem.name as UnitType,
                                faction: Faction.PLAYER,
                                position: spawnPos,
                                hp: uStats.hp,
                                maxHp: uStats.hp,
                                state: 'idle',
                                name: `${currentItem.name}`,
                                lastAttackTime: 0,
                                visible: true,
                            };
                            
                            newStats.unitsTrained++;

                            // Check Rally Point
                            if (e.rallyPoint) {
                                newUnit.state = 'moving';
                                newUnit.targetPos = e.rallyPoint;
                                newUnit.attackMoveDestination = e.rallyPoint; // Auto attack move to rally
                            }
                            spawnedUnits.push(newUnit);
                            messages.push({ id: uuidv4(), text: `${currentItem.name} Ready!`, type: 'info', timestamp: Date.now() });
                        } else if (currentItem.type === 'UPGRADE') {
                             newUpgrades[currentItem.name as UpgradeType] = true;
                             messages.push({ id: uuidv4(), text: `${currentItem.name} Researched!`, type: 'info', timestamp: Date.now() });
                        }
                        
                        // Shift queue
                        const newQueue = currentQueue.slice(1);
                        hasChanges = true;
                        return { ...e, productionQueue: newQueue };
                    } else {
                        // Update progress in immutable way
                        currentQueue[0] = currentItem;
                        hasChanges = true;
                        return { ...e, productionQueue: currentQueue };
                    }
                }
                return e;
            });

            if (spawnedUnits.length > 0) {
                newEntities = [...newEntities, ...spawnedUnits];
                hasChanges = true;
            }

            // 3. VISIBILITY & ENTITY UPDATE LOOP
            const playerEntities = newEntities.filter(e => e.faction === Faction.PLAYER && e.hp > 0);
            const damageMap: Record<string, number> = {};
            const resourceMap: Record<string, number> = {}; 
            const healingMap: Record<string, number> = {}; // New Map for Healing
            
            // Fog of War Logic
            newEntities = newEntities.map(entity => {
                if (entity.faction === Faction.PLAYER) {
                    return { ...entity, visible: true };
                } else {
                    let isVisible = false;
                    for (const p of playerEntities) {
                        const stats = getStats(p.subType as UnitType);
                        const range = stats?.visionRange || 8;
                        const dx = entity.position.x - p.position.x;
                        const dz = entity.position.z - p.position.z;
                        if (dx*dx + dz*dz < (range + 0.5) * (range + 0.5)) {
                            isVisible = true;
                            break;
                        }
                    }
                    if (entity.visible !== isVisible) {
                        hasChanges = true;
                        return { ...entity, visible: isVisible };
                    }
                    return entity;
                }
            });

            // Projectile Physics
            newProjectiles = newProjectiles.map(p => {
                const target = prev.entities.find(e => e.id === p.targetId);
                if (!target) return { ...p, progress: 2 }; 
                const speed = p.speed || 0.05; 
                const nextProgress = p.progress + speed;
                return { ...p, progress: nextProgress };
            });

            const hitProjectiles = newProjectiles.filter(p => p.progress >= 1);
            newProjectiles = newProjectiles.filter(p => p.progress < 1);
            if (hitProjectiles.length > 0 || newProjectiles.length !== prev.projectiles.length) hasChanges = true;

            // Damage Calc
            hitProjectiles.forEach(p => {
                
                if (p.splash && p.splashRadius) {
                    // Splash Damage: Find entities near the primary target
                    const targetEntity = prev.entities.find(e => e.id === p.targetId);
                    if (targetEntity) {
                        const splashCenter = targetEntity.position;
                        newEntities.forEach(e => {
                            if (e.faction === Faction.ENEMY && e.hp > 0) {
                                const dx = e.position.x - splashCenter.x;
                                const dz = e.position.z - splashCenter.z;
                                const dist = Math.sqrt(dx*dx + dz*dz);
                                
                                if (dist <= p.splashRadius!) {
                                    const falloff = 1 - (dist / p.splashRadius!) * 0.5;
                                    const splashDmg = Math.floor(p.damage * falloff);
                                    damageMap[e.id] = (damageMap[e.id] || 0) + splashDmg;
                                    
                                    // Retaliation for splash victims
                                    if (e.faction === Faction.ENEMY) {
                                        const source = prev.entities.find(s => s.id === p.sourceId);
                                        if (source && source.faction === Faction.PLAYER) {
                                            e.lastDamagedBy = source.id;
                                            e.lastDamagedAt = now;
                                            hasChanges = true;
                                        }
                                    }

                                    if (e.visible) {
                                        newFloatingTexts.push({ 
                                            id: uuidv4(), 
                                            text: `-${splashDmg}`, 
                                            position: { ...e.position }, 
                                            color: '#f97316', 
                                            life: 1 
                                        });
                                    }
                                }
                            }
                        });
                        
                        // Retaliation for primary target
                         if (targetEntity.faction === Faction.ENEMY) {
                             const source = prev.entities.find(s => s.id === p.sourceId);
                             if (source && source.faction === Faction.PLAYER) {
                                 targetEntity.lastDamagedBy = source.id;
                                 targetEntity.lastDamagedAt = now;
                                 hasChanges = true;
                             }
                         }
                    }

                } else {
                    // Single Target Damage
                    damageMap[p.targetId] = (damageMap[p.targetId] || 0) + p.damage;
                    
                    const target = newEntities.find(e => e.id === p.targetId);
                    if (target && target.faction === Faction.ENEMY) {
                         const source = prev.entities.find(e => e.id === p.sourceId);
                         if (source && source.faction === Faction.PLAYER) {
                             target.lastDamagedBy = source.id;
                             target.lastDamagedAt = now;
                             hasChanges = true;
                         }
                    }

                    const t = prev.entities.find(e => e.id === p.targetId);
                    if (t && t.visible) {
                        newFloatingTexts.push({ id: uuidv4(), text: `-${p.damage}`, position: { ...t.position }, color: '#ef4444', life: 1 });
                    }
                }
            });

            // Pre-calculate Obstacles for Collision
            const obstacles = prev.entities.filter(e => e.type === EntityType.BUILDING || e.type === EntityType.RESOURCE);

            // Entity Logic Loop
            newEntities = newEntities.map(entity => {
                const CARRY_CAPACITY = 10;
                const TICK_SPEED = 0.033;
                
                let currentEntity = { ...entity };
                let pos = { ...currentEntity.position };
                const stats = getStats(currentEntity.subType as UnitType);

                if (currentEntity.faction === Faction.PLAYER && currentEntity.type === EntityType.UNIT) {
                    if (currentEntity.maxHp < stats.hp) {
                         hasChanges = true;
                         currentEntity.maxHp = stats.hp;
                    }
                }

                // Separation Logic (Soft Collision with other Units)
                if (currentEntity.type === EntityType.UNIT && (currentEntity.state === 'moving' || currentEntity.state === 'attacking' || currentEntity.state === 'gathering' || currentEntity.state === 'returning')) {
                    const separationRadius = 1.0;
                    let moveX = 0, moveZ = 0;
                    let count = 0;
                    prev.entities.forEach(other => {
                        if (currentEntity.id !== other.id && other.type === EntityType.UNIT) {
                            const dx = currentEntity.position.x - other.position.x;
                            const dz = currentEntity.position.z - other.position.z;
                            const dSq = dx*dx + dz*dz;
                            if (dSq < separationRadius * separationRadius && dSq > 0.001) {
                                const d = Math.sqrt(dSq);
                                moveX += (dx / d) / d;
                                moveZ += (dz / d) / d;
                                count++;
                            }
                        }
                    });
                    if (count > 0) {
                        const pushStrength = 0.05;
                        pos.x += moveX * pushStrength;
                        pos.z += moveZ * pushStrength;
                        hasChanges = true;
                    }

                    // --- Hard Collision with Buildings/Resources ---
                    const unitRadius = (stats as any).collisionRadius || 0.5;
                    obstacles.forEach(obs => {
                        const obsStats = UNIT_STATS[obs.subType as keyof typeof UNIT_STATS];
                        const obsRadius = (obsStats as any)?.collisionRadius || 2.0;
                        const minSeparation = unitRadius + obsRadius;
                        
                        const dx = pos.x - obs.position.x;
                        const dz = pos.z - obs.position.z;
                        const dist = Math.sqrt(dx*dx + dz*dz);
                        
                        if (dist < minSeparation) {
                            // Push out
                            const pushFactor = (minSeparation - dist) / dist;
                            if (dist > 0.001) {
                                pos.x += dx * pushFactor;
                                pos.z += dz * pushFactor;
                                hasChanges = true;
                            }
                        }
                    });
                }

                if (currentEntity.type === EntityType.UNIT && currentEntity.faction === Faction.PLAYER) {
                    const isAttackMove = currentEntity.state === 'moving' && (currentEntity.attackMoveDestination || currentEntity.patrolPoints);
                    const isIdle = currentEntity.state === 'idle';

                    if ((isIdle || isAttackMove) && !currentEntity.holdPosition) {
                        let closestEnemy = null;
                        let minDst = AGGRO_RANGE;
                        for(const other of prev.entities) {
                            if (other.faction === Faction.ENEMY && other.hp > 0 && other.visible) {
                                const d = Math.sqrt(Math.pow(currentEntity.position.x - other.position.x, 2) + Math.pow(currentEntity.position.z - other.position.z, 2));
                                if (d < minDst) {
                                    minDst = d;
                                    closestEnemy = other;
                                }
                            }
                        }
                        if (closestEnemy) {
                            hasChanges = true;
                            currentEntity.state = 'attacking';
                            currentEntity.targetId = closestEnemy.id;
                        }
                    } else if (currentEntity.holdPosition && isIdle) {
                        const range = stats.range || 2;
                        for(const other of prev.entities) {
                            if (other.faction === Faction.ENEMY && other.hp > 0 && other.visible) {
                                const d = Math.sqrt(Math.pow(currentEntity.position.x - other.position.x, 2) + Math.pow(currentEntity.position.z - other.position.z, 2));
                                if (d <= range) {
                                    hasChanges = true;
                                    currentEntity.state = 'attacking';
                                    currentEntity.targetId = other.id;
                                }
                            }
                        }
                    }
                }
                
                // --- ENEMY AI LOGIC ---
                if (currentEntity.faction === Faction.ENEMY && currentEntity.type === EntityType.UNIT) {
                    // Check if current target is invalid
                    let needsNewTarget = false;
                    
                    if (currentEntity.targetId) {
                         const currentTarget = prev.entities.find(e => e.id === currentEntity.targetId);
                         if (!currentTarget || currentTarget.hp <= 0) {
                             needsNewTarget = true;
                         }
                    } else if (currentEntity.state === 'idle' || (currentEntity.state === 'moving' && !currentEntity.targetId)) {
                        needsNewTarget = true;
                    }

                    if (needsNewTarget) {
                        const newTarget = findEnemyTarget(currentEntity, prev.entities, now);
                        if (newTarget) {
                             hasChanges = true;
                             currentEntity.state = 'attacking';
                             currentEntity.targetId = newTarget.id;
                             currentEntity.targetPos = null;
                        } else if (!currentEntity.targetPos) {
                             // No targets at all? Move to center of player base area just in case
                             hasChanges = true;
                             currentEntity.state = 'moving';
                             currentEntity.targetPos = { x: -60, y: 0, z: -60 };
                        }
                    }
                }
                
                // --- Temple Healing Logic ---
                if (currentEntity.subType === BuildingType.TEMPLE && currentEntity.faction === Faction.PLAYER && currentEntity.hp > 0) {
                     if (now - currentEntity.lastAttackTime > 2000) {
                         // Range 8 healing
                         prev.entities.forEach(target => {
                            if (target.faction === Faction.PLAYER && target.type === EntityType.UNIT && target.hp < target.maxHp && target.hp > 0) {
                                const distSq = Math.pow(currentEntity.position.x - target.position.x, 2) + Math.pow(currentEntity.position.z - target.position.z, 2);
                                if (distSq <= 64) { // 8 * 8
                                     healingMap[target.id] = (healingMap[target.id] || 0) + 5;
                                     newFloatingTexts.push({
                                         id: uuidv4(),
                                         text: "+5",
                                         position: { ...target.position, y: 3 },
                                         color: "#22c55e",
                                         life: 1
                                     });
                                     hasChanges = true;
                                }
                            }
                         });
                         currentEntity.lastAttackTime = now;
                     }
                }

                if ((currentEntity.subType === BuildingType.TOWER || currentEntity.subType === BuildingType.CANNON_TOWER) && currentEntity.faction === Faction.PLAYER) {
                    if (now - currentEntity.lastAttackTime > stats.attackSpeed) {
                         const range = stats.range || 15;
                         const target = prev.entities.find(e => {
                             if (e.faction !== Faction.ENEMY || !e.visible) return false;
                             const d = Math.sqrt(Math.pow(currentEntity.position.x - e.position.x, 2) + Math.pow(currentEntity.position.z - e.position.z, 2));
                             return d <= range;
                         });
                         if (target) {
                             const isCannon = currentEntity.subType === BuildingType.CANNON_TOWER;
                             newProjectiles.push({
                                 id: uuidv4(),
                                 startPos: { x: currentEntity.position.x, y: 4, z: currentEntity.position.z },
                                 targetId: target.id,
                                 sourceId: currentEntity.id, // Source ID
                                 speed: isCannon ? 0.06 : 0.1,
                                 progress: 0,
                                 damage: stats.damage,
                                 splash: isCannon,
                                 splashRadius: isCannon ? (stats as any).splashRadius : undefined
                             });
                             hasChanges = true;
                             currentEntity.lastAttackTime = now;
                         }
                    }
                }

                if (currentEntity.state === 'moving' && currentEntity.targetPos) {
                    const dx = currentEntity.targetPos.x - pos.x;
                    const dz = currentEntity.targetPos.z - pos.z;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    const speed = (stats.speed || 3) * TICK_SPEED;
                    
                    if (dist < 0.5) {
                        hasChanges = true;
                        
                        if (currentEntity.patrolPoints && currentEntity.patrolIndex !== undefined) {
                            const nextIndex = (currentEntity.patrolIndex + 1) % 2;
                            currentEntity.patrolIndex = nextIndex;
                            currentEntity.targetPos = currentEntity.patrolPoints[nextIndex];
                        } else {
                            currentEntity.state = 'idle';
                            currentEntity.targetPos = null;
                            currentEntity.attackMoveDestination = null;
                        }
                    } else {
                        hasChanges = true;
                        pos.x += (dx/dist) * speed;
                        pos.z += (dz/dist) * speed;
                    }
                }

                if (currentEntity.state === 'gathering') {
                    if ((currentEntity.carryAmount || 0) >= CARRY_CAPACITY) {
                        const townHall = prev.entities.find(e => e.faction === Faction.PLAYER && e.subType === BuildingType.TOWN_HALL);
                        if (townHall) {
                            hasChanges = true;
                            currentEntity.state = 'returning';
                            currentEntity.targetId = townHall.id;
                        } else {
                            currentEntity.state = 'idle';
                        }
                    } else {
                        const target = prev.entities.find(t => t.id === currentEntity.targetId);
                        if (!target || target.hp <= 0) {
                             if ((currentEntity.carryAmount || 0) > 0) {
                                 const townHall = prev.entities.find(e => e.faction === Faction.PLAYER && e.subType === BuildingType.TOWN_HALL);
                                 if (townHall) {
                                     hasChanges = true;
                                     currentEntity.state = 'returning';
                                     currentEntity.targetId = townHall.id;
                                     currentEntity.lastResourceId = null;
                                 } else {
                                     currentEntity.state = 'idle';
                                 }
                            } else {
                                currentEntity.state = 'idle';
                            }
                        } else {
                            const dx = target.position.x - pos.x;
                            const dz = target.position.z - pos.z;
                            const dist = Math.sqrt(dx*dx + dz*dz);
                            if (dist > 2.5) {
                                 const speed = (stats.speed || 2.5) * TICK_SPEED;
                                 hasChanges = true;
                                 pos.x += (dx/dist) * speed;
                                 pos.z += (dz/dist) * speed;
                            } else {
                                if (Math.random() > 0.90) { 
                                    const gatherAmount = 1;
                                    resourceMap[target.id] = (resourceMap[target.id] || 0) + gatherAmount;
                                    hasChanges = true;
                                    currentEntity.carryAmount = (currentEntity.carryAmount || 0) + gatherAmount;
                                    currentEntity.carryType = target.subType as ResourceType;
                                }
                            }
                        }
                    }
                }

                if (currentEntity.state === 'returning') {
                     const townHall = prev.entities.find(t => t.id === currentEntity.targetId);
                     if (!townHall) {
                         hasChanges = true;
                         currentEntity.state = 'idle';
                     } else {
                         const dx = townHall.position.x - pos.x;
                         const dz = townHall.position.z - pos.z;
                         const dist = Math.sqrt(dx*dx + dz*dz);
                         if (dist > 4.0) { 
                             const speed = (stats.speed || 2.5) * TICK_SPEED;
                             hasChanges = true;
                             pos.x += (dx/dist) * speed;
                             pos.z += (dz/dist) * speed;
                         } else {
                             const amount = currentEntity.carryAmount || 0;
                             if (currentEntity.carryType === ResourceType.GOLD) {
                                 newResources.gold += amount;
                                 newStats.resourcesGathered.gold += amount;
                             }
                             if (currentEntity.carryType === ResourceType.WOOD) {
                                 newResources.wood += amount;
                                 newStats.resourcesGathered.wood += amount;
                             }
                             if (currentEntity.carryType === ResourceType.STONE) {
                                 newResources.stone += amount;
                                 newStats.resourcesGathered.stone += amount;
                             }
                             if (currentEntity.carryType === ResourceType.IRON) {
                                 newResources.iron += amount;
                                 newStats.resourcesGathered.iron += amount;
                             }
                             
                             const color = currentEntity.carryType === ResourceType.GOLD ? '#fbbf24' : 
                                           currentEntity.carryType === ResourceType.IRON ? '#f97316' : 
                                           currentEntity.carryType === ResourceType.STONE ? '#9ca3af' : '#166534';

                             newFloatingTexts.push({ id: uuidv4(), text: `+${amount}`, position: {x: pos.x, y: 3, z: pos.z}, color, life: 1 });
                             hasChanges = true;
                             
                             currentEntity.carryAmount = 0;
                             currentEntity.carryType = undefined;
                             
                             if (currentEntity.lastResourceId) {
                                 currentEntity.state = 'gathering';
                                 currentEntity.targetId = currentEntity.lastResourceId;
                             } else {
                                 currentEntity.state = 'idle';
                             }
                         }
                     }
                }
                
                if (currentEntity.state === 'attacking' && currentEntity.targetId) {
                     const target = prev.entities.find(t => t.id === currentEntity.targetId);
                     
                     if (!target || target.hp <= 0 || !target.visible) {
                         hasChanges = true;
                         if (currentEntity.attackMoveDestination) {
                             currentEntity.state = 'moving';
                             currentEntity.targetPos = currentEntity.attackMoveDestination;
                             currentEntity.targetId = null;
                         } else if (currentEntity.patrolPoints && currentEntity.patrolIndex !== undefined) {
                              currentEntity.state = 'moving';
                              currentEntity.targetPos = currentEntity.patrolPoints[currentEntity.patrolIndex];
                              currentEntity.targetId = null;
                         } else {
                              // If enemy AI lost target, it needs to re-acquire.
                              // Setting idle will trigger re-acquisition in next loop
                              currentEntity.state = 'idle';
                              currentEntity.targetId = null;
                         }
                     } else {
                         const range = stats.range || 2;
                         const dx = target.position.x - pos.x;
                         const dz = target.position.z - pos.z;
                         const dist = Math.sqrt(dx*dx + dz*dz);

                         if (currentEntity.holdPosition && dist > range) {
                             hasChanges = true;
                             currentEntity.state = 'idle';
                             currentEntity.targetId = null;
                         } else if (dist > range) {
                             const speed = (stats.speed || 3) * TICK_SPEED;
                             hasChanges = true;
                             pos.x += (dx/dist) * speed;
                             pos.z += (dz/dist) * speed;
                         } else {
                             if (now - currentEntity.lastAttackTime > stats.attackSpeed) {
                                 hasChanges = true;
                                 const dmg = stats.damage || 5;
                                 if (range > 3) {
                                     newProjectiles.push({
                                         id: uuidv4(),
                                         startPos: { x: pos.x, y: 1.5, z: pos.z },
                                         targetId: target.id,
                                         sourceId: currentEntity.id, // Source ID
                                         speed: 0.1,
                                         progress: 0,
                                         damage: dmg
                                     });
                                 } else {
                                     damageMap[target.id] = (damageMap[target.id] || 0) + dmg;
                                     if (target.faction === Faction.ENEMY && currentEntity.faction === Faction.PLAYER) {
                                         target.lastDamagedBy = currentEntity.id;
                                         target.lastDamagedAt = now;
                                     }
                                     if (target.visible) {
                                        newFloatingTexts.push({ id: uuidv4(), text: `-${dmg}`, position: { ...target.position }, color: '#ef4444', life: 1 });
                                     }
                                 }
                                 currentEntity.lastAttackTime = now;
                             }
                         }
                     }
                }

                currentEntity.position = pos;
                return currentEntity;
            });

            newEntities = newEntities.map(e => {
                let newHp = e.hp;
                if (damageMap[e.id]) newHp -= damageMap[e.id];
                if (resourceMap[e.id]) newHp -= resourceMap[e.id]; 
                
                // Apply Healing
                if (healingMap[e.id]) {
                     newHp = Math.min(e.maxHp, newHp + healingMap[e.id]);
                }

                if (newHp <= 0 && e.hp > 0) {
                     if (e.faction === Faction.PLAYER && e.type === EntityType.UNIT) newStats.unitsLost++;
                     if (e.faction === Faction.ENEMY && e.type === EntityType.UNIT) newStats.enemiesKilled++;
                }
                
                return { ...e, hp: newHp };
            });

            const survivingEntities = newEntities.filter(e => e.hp > 0);
            
            // Calculate Food Dynamically
            let currentFood = 0;
            let currentMaxFood = 10; // Base Capacity
            survivingEntities.forEach(e => {
                if (e.faction === Faction.PLAYER) {
                    if (e.subType === BuildingType.TOWN_HALL) currentMaxFood += 10;
                    if (e.subType === BuildingType.FARM) currentMaxFood += 8;

                    if (e.type === EntityType.UNIT) {
                         const c = COSTS[e.subType as UnitType];
                         if (c) currentFood += (c.food || 1);
                    }
                    if (e.type === EntityType.BUILDING && e.productionQueue) {
                         e.productionQueue.forEach(q => {
                             if (q.type === 'UNIT') {
                                  const c = COSTS[q.name as UnitType];
                                  if (c) currentFood += (c.food || 1);
                             }
                         });
                    }
                }
            });
            newResources.food = currentFood;
            newResources.maxFood = currentMaxFood;

            if (currentWave === MAX_WAVES && survivingEntities.filter(e => e.faction === Faction.ENEMY).length === 0) {
                 gameOver = true;
                 gameWon = true;
            }

            const townHall = survivingEntities.find(e => e.subType === BuildingType.TOWN_HALL && e.faction === Faction.PLAYER);
            if (!townHall && !prev.gameOver) {
                messages.push({ id: uuidv4(), text: 'The Kingdom has fallen! Game Over.', type: 'alert', timestamp: Date.now() });
                gameOver = true;
                gameWon = false;
            }
            
            if (survivingEntities.length !== prev.entities.length) hasChanges = true;
            if (JSON.stringify(newUpgrades) !== JSON.stringify(prev.upgrades)) hasChanges = true;
            if (newStats.timeElapsed !== prev.stats.timeElapsed) hasChanges = true;

            newFloatingTexts = newFloatingTexts.map(ft => ({ ...ft, life: ft.life - 0.02 })).filter(ft => ft.life > 0);
            if (newFloatingTexts.length !== prev.floatingTexts.length) hasChanges = true;
            
            const newSelection = prev.selection.filter(id => survivingEntities.find(e => e.id === id));
            
            return hasChanges ? { 
                ...prev, 
                entities: survivingEntities, 
                resources: newResources, 
                projectiles: newProjectiles, 
                floatingTexts: newFloatingTexts,
                wave: currentWave,
                gameOver,
                gameWon,
                messages,
                selection: newSelection,
                upgrades: newUpgrades,
                stats: newStats
            } : prev;
        });
    }, 1000 / 30); 
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full bg-black relative">
      <Canvas shadows camera={{ position: INITIAL_CAMERA_POS, fov: 50 }}>
        <GameScene 
            entities={gameState.entities} 
            projectiles={gameState.projectiles}
            floatingTexts={gameState.floatingTexts}
            placementMode={gameState.placementMode}
            commandMode={gameState.commandMode}
            cameraTarget={cameraTarget}
            onSelectEntity={handleSelectEntity}
            onRightClickGround={handleRightClickGround}
            onRightClickEntity={handleRightClickEntity}
            onPlaceBuilding={handlePlaceBuilding}
            onSelectionChange={setSelectionBox}
            onAttackMove={handleAttackMove}
        />
      </Canvas>
      {selectionBox && (
          <div style={{
              position: 'absolute',
              left: Math.min(selectionBox.start.x, selectionBox.current.x),
              top: Math.min(selectionBox.start.y, selectionBox.current.y),
              width: Math.abs(selectionBox.current.x - selectionBox.start.x),
              height: Math.abs(selectionBox.current.y - selectionBox.start.y),
              border: '2px solid #00ff00',
              backgroundColor: 'rgba(0, 255, 0, 0.2)',
              pointerEvents: 'none',
              zIndex: 100
          }} />
      )}
      {gameState.gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 text-white flex-col">
              <h1 className={`text-6xl font-fantasy mb-4 ${gameState.gameWon ? 'text-green-500' : 'text-red-500'}`}>
                  {gameState.gameWon ? 'VICTORY' : 'DEFEAT'}
              </h1>
              <p className="text-xl mb-8 font-ui">
                  {gameState.gameWon 
                    ? "The realm is safe. You have conquered the darkness." 
                    : "The Realm of Aethelgard has fallen."}
              </p>
              
              <div className="grid grid-cols-2 gap-x-12 gap-y-4 text-gray-300 font-ui mb-8 text-sm">
                   <div className="text-right text-gray-500">Time Survived:</div>
                   <div className="text-left font-bold text-white">{Math.floor(gameState.stats.timeElapsed)}s</div>
                   
                   <div className="text-right text-gray-500">Enemies Vanquished:</div>
                   <div className="text-left font-bold text-red-400">{gameState.stats.enemiesKilled}</div>
                   
                   <div className="text-right text-gray-500">Units Trained:</div>
                   <div className="text-left font-bold text-blue-400">{gameState.stats.unitsTrained}</div>
                   
                   <div className="text-right text-gray-500">Units Lost:</div>
                   <div className="text-left font-bold text-gray-400">{gameState.stats.unitsLost}</div>
                   
                   <div className="text-right text-gray-500">Gold Gathered:</div>
                   <div className="text-left font-bold text-gold-400">{gameState.stats.resourcesGathered.gold}</div>

                   <div className="text-right text-gray-500">Wood Gathered:</div>
                   <div className="text-left font-bold text-green-400">{gameState.stats.resourcesGathered.wood}</div>
              </div>

              <button 
                onClick={() => window.location.reload()} 
                className="px-8 py-3 bg-stone-800 border border-gold-500 hover:bg-gold-600 hover:text-black hover:border-white transition-all font-fantasy uppercase tracking-widest"
              >
                Restart Chronicle
              </button>
          </div>
      )}
      <UIOverlay 
        gameState={gameState} 
        timeToNextWave={timeToNextWave}
        onTrainUnit={handleTrainUnit}
        onResearch={handleResearch}
        onBuild={handleBuild}
        onGetLore={handleLore}
        onGetAdvisor={handleAdvisor}
        onCommand={handleCommand}
        onMinimapClick={handleMinimapClick}
        onMinimapCommand={handleMinimapCommand}
      />
    </div>
  );
}