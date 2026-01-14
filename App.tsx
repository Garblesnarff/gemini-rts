import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

import { GameScene } from './components/GameScene';
import { UIOverlay } from './components/UIOverlay';
import { GameState, Entity, UnitType, BuildingType, EntityType, Faction, ResourceType } from './types';
import { COSTS, INITIAL_CAMERA_POS, UNIT_STATS } from './constants';
import { generateLore, generateAdvisorTip } from './services/geminiService';

// Initial World Setup
const INITIAL_ENTITIES: Entity[] = [
  // Player Base
  { id: 'th-1', type: EntityType.BUILDING, subType: BuildingType.TOWN_HALL, faction: Faction.PLAYER, position: { x: 0, y: 0, z: 0 }, hp: 1500, maxHp: 1500, name: 'Main Keep' },
  { id: 'p-1', type: EntityType.UNIT, subType: UnitType.PEASANT, faction: Faction.PLAYER, position: { x: 5, y: 0, z: 5 }, hp: 220, maxHp: 220, state: 'idle', name: 'Peasant John' },
  
  // Resources
  { id: 'gm-1', type: EntityType.RESOURCE, subType: ResourceType.GOLD, faction: Faction.NEUTRAL, position: { x: 10, y: 0, z: -5 }, hp: 10000, maxHp: 10000, resourceAmount: 10000, name: 'Gold Mine' },
  { id: 'tr-1', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: -8, y: 0, z: -8 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Ancient Oak' },
  { id: 'tr-2', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: -10, y: 0, z: -6 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Pine Tree' },
  { id: 'tr-3', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: -12, y: 0, z: -9 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Birch' },
  
  // More resources
  { id: 'tr-4', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: -15, y: 0, z: 10 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Forest' },
  { id: 'tr-5', type: EntityType.RESOURCE, subType: ResourceType.WOOD, faction: Faction.NEUTRAL, position: { x: 15, y: 0, z: 12 }, hp: 100, maxHp: 100, resourceAmount: 500, name: 'Forest' },
];

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    resources: { gold: 200, wood: 100, food: 1, maxFood: 10 },
    entities: INITIAL_ENTITIES,
    selection: [],
    messages: [{ id: 'init', text: 'Welcome to Realm of Aethelgard.', type: 'info', timestamp: Date.now() }],
    placementMode: { active: false, type: null, cost: { gold: 0, wood: 0 } },
    gameOver: false,
    wave: 1
  });

  const waveTimerRef = useRef(0);
  const nextWaveTimeRef = useRef(60); // Seconds until next wave

  const addMessage = (text: string, type: 'info' | 'alert' | 'lore' = 'info') => {
    setGameState(prev => ({
      ...prev,
      messages: [...prev.messages, { id: uuidv4(), text, type, timestamp: Date.now() }]
    }));
  };

  // --- Actions ---

  const handleSelectEntity = (id: string, multi: boolean) => {
    if (gameState.placementMode.active) return; // Don't select while placing

    setGameState(prev => {
        if (!id) return { ...prev, entities: prev.entities.map(e => ({...e, selected: false})), selection: [] };
        const entity = prev.entities.find(e => e.id === id);
        if (!entity) return prev;
        
        // MVP: Single select
        return {
            ...prev,
            selection: [id],
            entities: prev.entities.map(e => ({
                ...e,
                selected: e.id === id
            }))
        };
    });
  };

  const handleRightClickGround = (point: THREE.Vector3) => {
    // Cancel placement if active
    if (gameState.placementMode.active) {
        setGameState(prev => ({ ...prev, placementMode: { active: false, type: null, cost: {gold:0, wood:0} } }));
        addMessage("Building cancelled.");
        return;
    }

    setGameState(prev => {
      const selectedIds = prev.selection;
      if (selectedIds.length === 0) return prev;

      return {
        ...prev,
        entities: prev.entities.map(e => {
          if (selectedIds.includes(e.id) && e.faction === Faction.PLAYER && e.type === EntityType.UNIT) {
            return {
              ...e,
              state: 'moving',
              targetPos: { x: point.x, y: 0, z: point.z },
              targetId: null
            };
          }
          return e;
        })
      };
    });
  };

  const handleRightClickEntity = (targetId: string) => {
    setGameState(prev => {
      const target = prev.entities.find(e => e.id === targetId);
      if (!target) return prev;
      
      let actionTriggered = false;

      const newEntities = prev.entities.map(e => {
          if (prev.selection.includes(e.id) && e.faction === Faction.PLAYER && e.type === EntityType.UNIT) {
            if (target.faction === Faction.ENEMY) {
                actionTriggered = true;
                return { ...e, state: 'attacking', targetId: target.id, targetPos: null };
            }
            if (target.type === EntityType.RESOURCE && e.subType === UnitType.PEASANT) {
                actionTriggered = true;
                return { ...e, state: 'gathering', targetId: target.id, targetPos: null, lastResourceId: target.id };
            }
            actionTriggered = true;
            return { ...e, state: 'moving', targetPos: target.position, targetId: null };
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

      if (gameState.resources.gold >= cost.gold && gameState.resources.wood >= cost.wood) {
          // Find a builder (Peasant)
          const peasantId = gameState.selection[0];
          const peasant = gameState.entities.find(e => e.id === peasantId);
          
          if (peasant && peasant.subType === UnitType.PEASANT) {
              const newBuilding: Entity = {
                id: uuidv4(),
                type: EntityType.BUILDING,
                subType: type,
                faction: Faction.PLAYER,
                position: { x: pos.x, y: 0, z: pos.z },
                hp: 1, // Start low HP and build up? MVP: Full HP for now
                maxHp: 1000,
                name: type
              };
              
              setGameState(prev => ({
                  ...prev,
                  resources: {
                      ...prev.resources,
                      gold: prev.resources.gold - cost.gold,
                      wood: prev.resources.wood - cost.wood
                  },
                  entities: [...prev.entities, { ...newBuilding, hp: newBuilding.maxHp }], // Instant build for MVP
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
       const building = gameState.entities.find(e => e.id === buildingId);
       
       if (building) {
           setGameState(prev => ({
               ...prev,
               resources: { 
                   ...prev.resources, 
                   gold: prev.resources.gold - cost.gold,
                   wood: prev.resources.wood - cost.wood,
                   food: prev.resources.food + (cost.food || 1)
               },
               messages: [...prev.messages, { id: uuidv4(), text: `Training ${type}...`, type: 'info', timestamp: Date.now() }]
           }));

           setTimeout(() => {
               setGameState(prev => {
                   const stillBuilding = prev.entities.find(e => e.id === buildingId); // Check if building still exists
                   if (!stillBuilding) return prev;

                   const newUnit: Entity = {
                       id: uuidv4(),
                       type: EntityType.UNIT,
                       subType: type,
                       faction: Faction.PLAYER,
                       position: { 
                           x: building.position.x + 3, 
                           y: 0, 
                           z: building.position.z + 3 
                       },
                       hp: UNIT_STATS[type].hp,
                       maxHp: UNIT_STATS[type].hp,
                       state: 'idle',
                       name: `${type} Recr.`
                   };
                   return {
                       ...prev,
                       entities: [...prev.entities, newUnit],
                       messages: [...prev.messages, { id: uuidv4(), text: `${type} Ready!`, type: 'info', timestamp: Date.now() }]
                   };
               });
           }, COSTS[type].time);
       }
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

  // --- Game Loop (Simulation) ---
  useEffect(() => {
    const interval = setInterval(() => {
        setGameState(prev => {
            if (prev.gameOver) return prev;

            let newEntities = [...prev.entities];
            let newResources = { ...prev.resources };
            let messages = [...prev.messages];
            let hasChanges = false;
            let currentWave = prev.wave;

            // 1. Wave Spawner Logic
            waveTimerRef.current += 1/30;
            if (waveTimerRef.current >= nextWaveTimeRef.current) {
                waveTimerRef.current = 0;
                currentWave++;
                const spawnCount = Math.floor(currentWave / 2) + 1;
                addMessage(`Wave ${currentWave} approaching!`, 'alert');
                
                for(let i=0; i<spawnCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = 40;
                    const spawnPos = { x: Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r };
                    newEntities.push({
                         id: uuidv4(),
                         type: EntityType.UNIT,
                         subType: UnitType.FOOTMAN,
                         faction: Faction.ENEMY,
                         position: spawnPos,
                         hp: 420,
                         maxHp: 420,
                         state: 'idle',
                         name: 'Invader'
                    });
                }
                hasChanges = true;
            }

            // 2. Entity AI & State Update
            const damageMap: Record<string, number> = {};
            const resourceMap: Record<string, number> = {}; // Tracks resource HP depletion

            newEntities = newEntities.map(entity => {
                const CARRY_CAPACITY = 10;
                const TICK_SPEED = 0.033; // ~30FPS

                // --- Enemy AI ---
                if (entity.faction === Faction.ENEMY && entity.type === EntityType.UNIT) {
                    // (Simple Aggro Logic)
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
                        if (closest && minDst < 20) {
                             hasChanges = true;
                             return { ...entity, state: 'attacking', targetId: closest.id, targetPos: null };
                        } else if (!entity.targetPos && !closest) {
                             hasChanges = true;
                             return { ...entity, state: 'moving', targetPos: {x:0,y:0,z:0} }; // March to center if no target
                        }
                    }
                }

                // --- Movement Generic ---
                if (entity.state === 'moving' && entity.targetPos) {
                    const dx = entity.targetPos.x - entity.position.x;
                    const dz = entity.targetPos.z - entity.position.z;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    const speed = (UNIT_STATS[entity.subType as UnitType]?.speed || 3) * TICK_SPEED;

                    if (dist < 0.5) {
                        hasChanges = true;
                        return { ...entity, state: 'idle', targetPos: null };
                    } else {
                        hasChanges = true;
                        return {
                            ...entity,
                            position: {
                                x: entity.position.x + (dx/dist) * speed,
                                y: 0,
                                z: entity.position.z + (dz/dist) * speed
                            }
                        };
                    }
                }

                // --- Gathering Logic (The Work Loop) ---
                if (entity.state === 'gathering') {
                    // Check Capacity First
                    if ((entity.carryAmount || 0) >= CARRY_CAPACITY) {
                        // Find Base
                        const townHall = prev.entities.find(e => e.faction === Faction.PLAYER && e.subType === BuildingType.TOWN_HALL);
                        if (townHall) {
                            hasChanges = true;
                            return { ...entity, state: 'returning', targetId: townHall.id };
                        }
                        hasChanges = true;
                        return { ...entity, state: 'idle' }; // No base to return to
                    }

                    // Check Resource Target
                    const target = prev.entities.find(t => t.id === entity.targetId);
                    
                    // If Resource Dead/Gone
                    if (!target || target.hp <= 0) {
                        // If carrying anything, return it. Else idle.
                        if ((entity.carryAmount || 0) > 0) {
                             const townHall = prev.entities.find(e => e.faction === Faction.PLAYER && e.subType === BuildingType.TOWN_HALL);
                             if (townHall) {
                                 hasChanges = true;
                                 return { ...entity, state: 'returning', targetId: townHall.id, lastResourceId: null };
                             }
                        }
                        hasChanges = true;
                        return { ...entity, state: 'idle' };
                    }

                    const dx = target.position.x - entity.position.x;
                    const dz = target.position.z - entity.position.z;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    
                    if (dist > 2.5) {
                        // Move to Resource
                         const speed = (UNIT_STATS[entity.subType as UnitType]?.speed || 2.5) * TICK_SPEED;
                         hasChanges = true;
                         return {
                            ...entity,
                            position: {
                                x: entity.position.x + (dx/dist) * speed,
                                y: 0,
                                z: entity.position.z + (dz/dist) * speed
                            }
                        };
                    } else {
                        // Work (Harvest)
                        if (Math.random() > 0.85) { 
                            const gatherAmount = 1;
                            resourceMap[target.id] = (resourceMap[target.id] || 0) + gatherAmount;
                            hasChanges = true;
                            
                            return { 
                                ...entity, 
                                carryAmount: (entity.carryAmount || 0) + gatherAmount,
                                carryType: target.subType as ResourceType
                            };
                        }
                        return entity;
                    }
                }

                // --- Returning Logic ---
                if (entity.state === 'returning') {
                     const townHall = prev.entities.find(t => t.id === entity.targetId);
                     if (!townHall) {
                         hasChanges = true;
                         return { ...entity, state: 'idle' };
                     }

                     const dx = townHall.position.x - entity.position.x;
                     const dz = townHall.position.z - entity.position.z;
                     const dist = Math.sqrt(dx*dx + dz*dz);

                     if (dist > 4.0) { // Town hall is big, stop earlier
                         const speed = (UNIT_STATS[entity.subType as UnitType]?.speed || 2.5) * TICK_SPEED;
                         hasChanges = true;
                         return {
                             ...entity,
                             position: {
                                 x: entity.position.x + (dx/dist) * speed,
                                 y: 0,
                                 z: entity.position.z + (dz/dist) * speed
                             }
                         };
                     } else {
                         // Deposit
                         if (entity.carryType === ResourceType.GOLD) newResources.gold += (entity.carryAmount || 0);
                         if (entity.carryType === ResourceType.WOOD) newResources.wood += (entity.carryAmount || 0);
                         hasChanges = true;

                         // Return to work?
                         if (entity.lastResourceId) {
                             return { 
                                 ...entity, 
                                 state: 'gathering', 
                                 targetId: entity.lastResourceId, 
                                 carryAmount: 0, 
                                 carryType: undefined 
                             };
                         }
                         return { ...entity, state: 'idle', carryAmount: 0, carryType: undefined };
                     }
                }
                
                // --- Attacking ---
                if (entity.state === 'attacking' && entity.targetId) {
                     const target = prev.entities.find(t => t.id === entity.targetId);
                     if (!target || target.hp <= 0) {
                         hasChanges = true;
                         return { ...entity, state: 'idle' };
                     }
                     
                     const dx = target.position.x - entity.position.x;
                     const dz = target.position.z - entity.position.z;
                     const dist = Math.sqrt(dx*dx + dz*dz);
                     const range = UNIT_STATS[entity.subType as UnitType]?.range || 2;

                     if (dist > range) {
                         const speed = (UNIT_STATS[entity.subType as UnitType]?.speed || 3) * TICK_SPEED;
                         hasChanges = true;
                         return {
                             ...entity,
                             position: {
                                 x: entity.position.x + (dx/dist) * speed,
                                 y: 0,
                                 z: entity.position.z + (dz/dist) * speed
                             }
                         };
                     } else {
                         if (Math.random() > 0.95) { 
                             const dmg = UNIT_STATS[entity.subType as UnitType]?.damage || 5;
                             damageMap[target.id] = (damageMap[target.id] || 0) + dmg;
                             hasChanges = true;
                         }
                         return entity;
                     }
                }

                return entity;
            });

            // 3. Apply Damage & Resource Depletion
            newEntities = newEntities.map(e => {
                let newHp = e.hp;
                if (damageMap[e.id]) newHp -= damageMap[e.id];
                if (resourceMap[e.id]) newHp -= resourceMap[e.id]; 
                return { ...e, hp: newHp };
            });

            // 4. Cleanup Dead & Win/Loss Check
            const survivingEntities = newEntities.filter(e => e.hp > 0);
            
            // Check Player Town Hall
            const townHall = survivingEntities.find(e => e.subType === BuildingType.TOWN_HALL && e.faction === Faction.PLAYER);
            let gameOver = false;
            
            if (!townHall && !prev.gameOver) {
                messages.push({ id: uuidv4(), text: 'The Kingdom has fallen! Game Over.', type: 'alert', timestamp: Date.now() });
                gameOver = true;
            }

            if (survivingEntities.length !== prev.entities.length) hasChanges = true;

            const newSelection = prev.selection.filter(id => survivingEntities.find(e => e.id === id));
            
            return hasChanges ? { 
                ...prev, 
                entities: survivingEntities, 
                resources: newResources, 
                wave: currentWave,
                gameOver,
                messages,
                selection: newSelection
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
            placementMode={gameState.placementMode}
            onSelectEntity={handleSelectEntity}
            onRightClickGround={handleRightClickGround}
            onRightClickEntity={handleRightClickEntity}
            onPlaceBuilding={handlePlaceBuilding}
        />
      </Canvas>
      
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
        onBuild={handleBuild}
        onGetLore={handleLore}
        onGetAdvisor={handleAdvisor}
      />
    </div>
  );
}