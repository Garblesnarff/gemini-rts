
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

import { GameScene } from './components/GameScene';
import { UIOverlay } from './components/UIOverlay';
import { GameState, Entity, UnitType, BuildingType, EntityType, Faction, ResourceType, UpgradeType } from './types';
import { COSTS, INITIAL_CAMERA_POS, UNIT_STATS, AGGRO_RANGE, QUEUE_SIZE } from './constants';
import { generateLore, generateAdvisorTip } from './services/geminiService';

const INITIAL_ENTITIES: Entity[] = [
  { id: 'th-1', type: EntityType.BUILDING, subType: BuildingType.TOWN_HALL, faction: Faction.PLAYER, position: { x: 0, y: 0, z: 0 }, hp: 1500, maxHp: 1500, name: 'Main Keep', lastAttackTime: 0, visible: true, productionQueue: [], rallyPoint: null },
  { id: 'p-1', type: EntityType.UNIT, subType: UnitType.PEASANT, faction: Faction.PLAYER, position: { x: 5, y: 0, z: 5 }, hp: 220, maxHp: 220, state: 'idle', name: 'Peasant John', lastAttackTime: 0, visible: true },
  
  { id: 'gm-1', type: EntityType.RESOURCE, subType: ResourceType.GOLD, faction: Faction.NEUTRAL, position: { x: 10, y: 0, z: -5 }, hp: 10000, maxHp: 10000, resourceAmount: 10000, name: 'Gold Mine', lastAttackTime: 0, visible: true },
  { id: 'tr-1', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: -8, y: 0, z: -8 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Ancient Oak', lastAttackTime: 0, visible: true },
  { id: 'tr-2', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: -10, y: 0, z: -6 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Pine Tree', lastAttackTime: 0, visible: true },
  { id: 'tr-3', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: -12, y: 0, z: -9 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Birch', lastAttackTime: 0, visible: true },
  
  { id: 'tr-4', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: -15, y: 0, z: 10 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Forest', lastAttackTime: 0, visible: true },
  { id: 'tr-5', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: 15, y: 0, z: 12 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Forest', lastAttackTime: 0, visible: true },
];

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    resources: { gold: 200, wood: 100, food: 1, maxFood: 10 },
    entities: INITIAL_ENTITIES,
    projectiles: [],
    floatingTexts: [],
    selection: [],
    controlGroups: {},
    messages: [{ id: 'init', text: 'Welcome to Realm of Aethelgard.', type: 'info', timestamp: Date.now() }],
    placementMode: { active: false, type: null, cost: { gold: 0, wood: 0 } },
    commandMode: { active: false, type: null },
    gameOver: false,
    wave: 1,
    upgrades: {} as Record<UpgradeType, boolean>
  });

  const [selectionBox, setSelectionBox] = useState<{start: {x:number, y:number}, current: {x:number, y:number}} | null>(null);
  const [cameraTarget, setCameraTarget] = useState<THREE.Vector3 | null>(null);

  const waveTimerRef = useRef(0);
  const nextWaveTimeRef = useRef(60);
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

      if (gameState.resources.gold >= cost.gold && gameState.resources.wood >= cost.wood) {
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
                      wood: prev.resources.wood - cost.wood
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
                food: prev.resources.food + (cost.food || 1)
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
            let hasChanges = false;
            let currentWave = prev.wave;

            const delta = 1000/30; // approx ms per frame

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
            waveTimerRef.current += 1/30;
            if (waveTimerRef.current >= nextWaveTimeRef.current) {
                waveTimerRef.current = 0;
                currentWave++;
                const spawnCount = Math.floor(currentWave * 1.5) + 1;
                messages.push({ id: uuidv4(), text: `Wave ${currentWave} approaching!`, type: 'alert', timestamp: Date.now() });
                
                for(let i=0; i<spawnCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = 50;
                    const spawnPos = { x: Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r };
                    newEntities.push({
                         id: uuidv4(),
                         type: EntityType.UNIT,
                         subType: i % 3 === 0 ? UnitType.FOOTMAN : UnitType.PEASANT, 
                         faction: Faction.ENEMY,
                         position: spawnPos,
                         hp: 420,
                         maxHp: 420,
                         state: 'idle',
                         name: 'Invader',
                         lastAttackTime: 0,
                         visible: false
                    });
                }
                hasChanges = true;
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
                const speed = 0.05; 
                const nextProgress = p.progress + speed;
                return { ...p, progress: nextProgress };
            });

            const hitProjectiles = newProjectiles.filter(p => p.progress >= 1);
            newProjectiles = newProjectiles.filter(p => p.progress < 1);
            if (hitProjectiles.length > 0 || newProjectiles.length !== prev.projectiles.length) hasChanges = true;

            // Damage Calc
            const damageMap: Record<string, number> = {};
            hitProjectiles.forEach(p => {
                damageMap[p.targetId] = (damageMap[p.targetId] || 0) + p.damage;
                const t = prev.entities.find(e => e.id === p.targetId);
                if (t && t.visible) {
                    newFloatingTexts.push({ id: uuidv4(), text: `-${p.damage}`, position: { ...t.position }, color: '#ef4444', life: 1 });
                }
            });

            const resourceMap: Record<string, number> = {}; 

            // Entity Logic Loop
            newEntities = newEntities.map(entity => {
                const CARRY_CAPACITY = 10;
                const TICK_SPEED = 0.033;
                let pos = { ...entity.position };
                const stats = getStats(entity.subType as UnitType);

                // Update MaxHP dynamically if upgrade just finished (simple check: if current maxHp < stats.maxHp)
                // Note: This logic runs every frame, but stats.hp is constant unless upgrade changes. 
                // We update maxHp but not current HP to simulate "cap increase".
                if (entity.faction === Faction.PLAYER && entity.type === EntityType.UNIT) {
                    if (entity.maxHp < stats.hp) {
                         // Upgrade applied, heal the difference? Or just raise cap? 
                         // Standard: Raise cap, percentage stays same OR amount stays same. 
                         // Simplest for now: Raise cap, keep current HP (so they look damaged).
                         hasChanges = true;
                         return { ...entity, maxHp: stats.hp };
                    }
                }

                // Unit Separation
                if (entity.type === EntityType.UNIT && (entity.state === 'moving' || entity.state === 'attacking' || entity.state === 'gathering' || entity.state === 'returning')) {
                    const separationRadius = 1.0;
                    let moveX = 0, moveZ = 0;
                    let count = 0;
                    prev.entities.forEach(other => {
                        if (entity.id !== other.id && other.type === EntityType.UNIT) {
                            const dx = entity.position.x - other.position.x;
                            const dz = entity.position.z - other.position.z;
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
                }

                // --- AUTO RETALIATION & ATTACK MOVE SCANNING ---
                if (entity.type === EntityType.UNIT && entity.faction === Faction.PLAYER) {
                    const isAttackMove = entity.state === 'moving' && (entity.attackMoveDestination || entity.patrolPoints);
                    const isIdle = entity.state === 'idle';

                    if ((isIdle || isAttackMove) && !entity.holdPosition) {
                        // Scan for enemies
                        let closestEnemy = null;
                        let minDst = AGGRO_RANGE;
                        
                        for(const other of prev.entities) {
                            if (other.faction === Faction.ENEMY && other.hp > 0 && other.visible) {
                                const d = Math.sqrt(Math.pow(entity.position.x - other.position.x, 2) + Math.pow(entity.position.z - other.position.z, 2));
                                if (d < minDst) {
                                    minDst = d;
                                    closestEnemy = other;
                                }
                            }
                        }

                        if (closestEnemy) {
                            hasChanges = true;
                            return { 
                                ...entity, 
                                state: 'attacking', 
                                targetId: closestEnemy.id, 
                                position: pos,
                                // Maintain special movement states for after combat
                                attackMoveDestination: entity.attackMoveDestination,
                                patrolPoints: entity.patrolPoints,
                                patrolIndex: entity.patrolIndex
                            };
                        }
                    } else if (entity.holdPosition && isIdle) {
                        // Hold Position: Only attack if in range
                        const range = stats.range || 2;
                        for(const other of prev.entities) {
                            if (other.faction === Faction.ENEMY && other.hp > 0 && other.visible) {
                                const d = Math.sqrt(Math.pow(entity.position.x - other.position.x, 2) + Math.pow(entity.position.z - other.position.z, 2));
                                if (d <= range) {
                                    hasChanges = true;
                                    return { 
                                        ...entity, 
                                        state: 'attacking', 
                                        targetId: other.id, 
                                        position: pos
                                    };
                                }
                            }
                        }
                    }
                }
                
                // --- ENEMY AI ---
                if (entity.faction === Faction.ENEMY && entity.type === EntityType.UNIT) {
                    if (entity.state === 'idle' || (entity.state === 'moving' && !entity.targetId)) {
                        let closest = null;
                        let minDst = Infinity;
                        for (const other of prev.entities) {
                            if (other.faction === Faction.PLAYER) {
                                const d = Math.sqrt(Math.pow(entity.position.x - other.position.x, 2) + Math.pow(entity.position.z - other.position.z, 2));
                                if (d < minDst) {
                                    minDst = d;
                                    closest = other;
                                }
                            }
                        }
                        if (closest && minDst < 12) {
                             hasChanges = true;
                             return { ...entity, state: 'attacking', targetId: closest.id, targetPos: null, position: pos };
                        } else if (!entity.targetPos && !closest) {
                             hasChanges = true;
                             return { ...entity, state: 'moving', targetPos: {x:0,y:0,z:0}, position: pos }; 
                        }
                    }
                }
                
                // Building Attack (Towers)
                if (entity.subType === BuildingType.TOWER && entity.faction === Faction.PLAYER) {
                    if (now - entity.lastAttackTime > stats.attackSpeed) {
                         const range = stats.range || 15;
                         const target = prev.entities.find(e => {
                             if (e.faction !== Faction.ENEMY || !e.visible) return false;
                             const d = Math.sqrt(Math.pow(entity.position.x - e.position.x, 2) + Math.pow(entity.position.z - e.position.z, 2));
                             return d <= range;
                         });
                         if (target) {
                             newProjectiles.push({
                                 id: uuidv4(),
                                 startPos: { x: entity.position.x, y: 4, z: entity.position.z },
                                 targetId: target.id,
                                 speed: 0.1,
                                 progress: 0,
                                 damage: stats.damage
                             });
                             hasChanges = true;
                             return { ...entity, lastAttackTime: now };
                         }
                    }
                }

                // Movement
                if (entity.state === 'moving' && entity.targetPos) {
                    const dx = entity.targetPos.x - pos.x;
                    const dz = entity.targetPos.z - pos.z;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    const speed = (stats.speed || 3) * TICK_SPEED;
                    
                    if (dist < 0.5) {
                        hasChanges = true;
                        
                        // Patrol Logic
                        if (entity.patrolPoints && entity.patrolIndex !== undefined) {
                            const nextIndex = (entity.patrolIndex + 1) % 2;
                            return { 
                                ...entity, 
                                position: pos, 
                                patrolIndex: nextIndex, 
                                targetPos: entity.patrolPoints[nextIndex] 
                            };
                        }

                        // Reached destination. Clear attack move flag.
                        return { ...entity, state: 'idle', targetPos: null, position: pos, attackMoveDestination: null };
                    } else {
                        hasChanges = true;
                        pos.x += (dx/dist) * speed;
                        pos.z += (dz/dist) * speed;
                        return { ...entity, position: pos };
                    }
                }

                // Gathering
                if (entity.state === 'gathering') {
                    if ((entity.carryAmount || 0) >= CARRY_CAPACITY) {
                        const townHall = prev.entities.find(e => e.faction === Faction.PLAYER && e.subType === BuildingType.TOWN_HALL);
                        if (townHall) {
                            hasChanges = true;
                            return { ...entity, state: 'returning', targetId: townHall.id, position: pos };
                        }
                        return { ...entity, state: 'idle', position: pos };
                    }
                    const target = prev.entities.find(t => t.id === entity.targetId);
                    if (!target || target.hp <= 0) {
                         if ((entity.carryAmount || 0) > 0) {
                             const townHall = prev.entities.find(e => e.faction === Faction.PLAYER && e.subType === BuildingType.TOWN_HALL);
                             if (townHall) {
                                 hasChanges = true;
                                 return { ...entity, state: 'returning', targetId: townHall.id, lastResourceId: null, position: pos };
                             }
                        }
                        return { ...entity, state: 'idle', position: pos };
                    }
                    const dx = target.position.x - pos.x;
                    const dz = target.position.z - pos.z;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    if (dist > 2.5) {
                         const speed = (stats.speed || 2.5) * TICK_SPEED;
                         hasChanges = true;
                         pos.x += (dx/dist) * speed;
                         pos.z += (dz/dist) * speed;
                         return { ...entity, position: pos };
                    } else {
                        if (Math.random() > 0.90) { 
                            const gatherAmount = 1;
                            resourceMap[target.id] = (resourceMap[target.id] || 0) + gatherAmount;
                            hasChanges = true;
                            return { ...entity, position: pos, carryAmount: (entity.carryAmount || 0) + gatherAmount, carryType: target.subType as ResourceType };
                        }
                        return { ...entity, position: pos };
                    }
                }

                // Returning Resources
                if (entity.state === 'returning') {
                     const townHall = prev.entities.find(t => t.id === entity.targetId);
                     if (!townHall) {
                         hasChanges = true;
                         return { ...entity, state: 'idle', position: pos };
                     }
                     const dx = townHall.position.x - pos.x;
                     const dz = townHall.position.z - pos.z;
                     const dist = Math.sqrt(dx*dx + dz*dz);
                     if (dist > 4.0) { 
                         const speed = (stats.speed || 2.5) * TICK_SPEED;
                         hasChanges = true;
                         pos.x += (dx/dist) * speed;
                         pos.z += (dz/dist) * speed;
                         return { ...entity, position: pos };
                     } else {
                         if (entity.carryType === ResourceType.GOLD) newResources.gold += (entity.carryAmount || 0);
                         if (entity.carryType === ResourceType.WOOD) newResources.wood += (entity.carryAmount || 0);
                         newFloatingTexts.push({ id: uuidv4(), text: `+${entity.carryAmount}`, position: {x: pos.x, y: 3, z: pos.z}, color: '#fbbf24', life: 1 });
                         hasChanges = true;
                         if (entity.lastResourceId) {
                             return { ...entity, position: pos, state: 'gathering', targetId: entity.lastResourceId, carryAmount: 0, carryType: undefined };
                         }
                         return { ...entity, state: 'idle', carryAmount: 0, carryType: undefined, position: pos };
                     }
                }
                
                // Attacking
                if (entity.state === 'attacking' && entity.targetId) {
                     const target = prev.entities.find(t => t.id === entity.targetId);
                     
                     // Target Invalid Check
                     if (!target || target.hp <= 0 || !target.visible) {
                         hasChanges = true;
                         // Resume attack move or Patrol if applicable
                         if (entity.attackMoveDestination) {
                             return { 
                                 ...entity, 
                                 state: 'moving', 
                                 targetPos: entity.attackMoveDestination, 
                                 targetId: null, 
                                 position: pos 
                             };
                         }
                         if (entity.patrolPoints && entity.patrolIndex !== undefined) {
                              return {
                                  ...entity,
                                  state: 'moving',
                                  targetPos: entity.patrolPoints[entity.patrolIndex],
                                  targetId: null,
                                  position: pos
                              };
                         }
                         return { ...entity, state: 'idle', position: pos };
                     }
                     
                     // Hold Position Range Check
                     const range = stats.range || 2;
                     const dx = target.position.x - pos.x;
                     const dz = target.position.z - pos.z;
                     const dist = Math.sqrt(dx*dx + dz*dz);

                     if (entity.holdPosition && dist > range) {
                         hasChanges = true;
                         // Lost target due to hold position
                         return { ...entity, state: 'idle', targetId: null, position: pos };
                     }

                     if (dist > range) {
                         const speed = (stats.speed || 3) * TICK_SPEED;
                         hasChanges = true;
                         pos.x += (dx/dist) * speed;
                         pos.z += (dz/dist) * speed;
                         return { ...entity, position: pos };
                     } else {
                         if (now - entity.lastAttackTime > stats.attackSpeed) {
                             hasChanges = true;
                             const dmg = stats.damage || 5;
                             if (range > 3) {
                                 newProjectiles.push({
                                     id: uuidv4(),
                                     startPos: { x: pos.x, y: 1.5, z: pos.z },
                                     targetId: target.id,
                                     speed: 0.1,
                                     progress: 0,
                                     damage: dmg
                                 });
                             } else {
                                 damageMap[target.id] = (damageMap[target.id] || 0) + dmg;
                                 if (target.visible) {
                                    newFloatingTexts.push({ id: uuidv4(), text: `-${dmg}`, position: { ...target.position }, color: '#ef4444', life: 1 });
                                 }
                             }
                             return { ...entity, lastAttackTime: now, position: pos };
                         }
                         return { ...entity, position: pos };
                     }
                }
                return { ...entity, position: pos };
            });

            newEntities = newEntities.map(e => {
                let newHp = e.hp;
                if (damageMap[e.id]) newHp -= damageMap[e.id];
                if (resourceMap[e.id]) newHp -= resourceMap[e.id]; 
                return { ...e, hp: newHp };
            });

            const survivingEntities = newEntities.filter(e => e.hp > 0);
            const townHall = survivingEntities.find(e => e.subType === BuildingType.TOWN_HALL && e.faction === Faction.PLAYER);
            let gameOver = false;
            if (!townHall && !prev.gameOver) {
                messages.push({ id: uuidv4(), text: 'The Kingdom has fallen! Game Over.', type: 'alert', timestamp: Date.now() });
                gameOver = true;
            }
            if (survivingEntities.length !== prev.entities.length) hasChanges = true;
            if (JSON.stringify(newUpgrades) !== JSON.stringify(prev.upgrades)) hasChanges = true;

            newFloatingTexts = newFloatingTexts.map(ft => ({ ...ft, life: ft.life - 0.02 })).filter(ft => ft.life > 0);
            if (newFloatingTexts.length !== prev.floatingTexts.length) hasChanges = true;
            
            // Clean up selection
            const newSelection = prev.selection.filter(id => survivingEntities.find(e => e.id === id));
            
            return hasChanges ? { 
                ...prev, 
                entities: survivingEntities, 
                resources: newResources, 
                projectiles: newProjectiles,
                floatingTexts: newFloatingTexts,
                wave: currentWave,
                gameOver,
                messages,
                selection: newSelection,
                upgrades: newUpgrades
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
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 text-white flex-col">
              <h1 className="text-6xl font-fantasy text-red-500 mb-4">DEFEAT</h1>
              <p className="text-xl">The Realm of Aethelgard is lost.</p>
              <button onClick={() => window.location.reload()} className="mt-8 px-6 py-2 border border-white hover:bg-white hover:text-black">Restart</button>
          </div>
      )}
      <UIOverlay 
        gameState={gameState} 
        onTrainUnit={handleTrainUnit}
        onResearch={handleResearch}
        onBuild={handleBuild}
        onGetLore={handleLore}
        onGetAdvisor={handleAdvisor}
        onCommand={handleCommand}
      />
    </div>
  );
}
