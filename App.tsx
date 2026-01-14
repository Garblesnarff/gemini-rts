import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

import { GameScene } from './components/GameScene';
import { UIOverlay } from './components/UIOverlay';
import { GameState, Entity, UnitType, BuildingType, EntityType, Faction, ResourceType } from './types';
import { COSTS, INITIAL_CAMERA_POS, UNIT_STATS } from './constants';
import { generateLore, generateAdvisorTip } from './services/geminiService';

const INITIAL_ENTITIES: Entity[] = [
  { id: 'th-1', type: EntityType.BUILDING, subType: BuildingType.TOWN_HALL, faction: Faction.PLAYER, position: { x: 0, y: 0, z: 0 }, hp: 1500, maxHp: 1500, name: 'Main Keep', lastAttackTime: 0, visible: true },
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
    messages: [{ id: 'init', text: 'Welcome to Realm of Aethelgard.', type: 'info', timestamp: Date.now() }],
    placementMode: { active: false, type: null, cost: { gold: 0, wood: 0 } },
    gameOver: false,
    wave: 1
  });

  const waveTimerRef = useRef(0);
  const nextWaveTimeRef = useRef(60);

  const addMessage = (text: string, type: 'info' | 'alert' | 'lore' = 'info') => {
    setGameState(prev => ({
      ...prev,
      messages: [...prev.messages, { id: uuidv4(), text, type, timestamp: Date.now() }]
    }));
  };

  const handleSelectEntity = (ids: string[], multi: boolean) => {
    if (gameState.placementMode.active) return; 

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
      if (!target || !target.visible) return prev;
      
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
                visible: true
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
                   const stillBuilding = prev.entities.find(e => e.id === buildingId); 
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
                       name: `${type}`,
                       lastAttackTime: 0,
                       visible: true
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
            let hasChanges = false;
            let currentWave = prev.wave;

            waveTimerRef.current += 1/30;
            if (waveTimerRef.current >= nextWaveTimeRef.current) {
                waveTimerRef.current = 0;
                currentWave++;
                const spawnCount = Math.floor(currentWave * 1.5) + 1;
                addMessage(`Wave ${currentWave} approaching!`, 'alert');
                
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

            const playerEntities = newEntities.filter(e => e.faction === Faction.PLAYER && e.hp > 0);
            
            newEntities = newEntities.map(entity => {
                if (entity.faction === Faction.PLAYER) {
                    return { ...entity, visible: true };
                } else {
                    let isVisible = false;
                    for (const p of playerEntities) {
                        const stats = UNIT_STATS[p.subType as keyof typeof UNIT_STATS];
                        const range = stats?.visionRange || 8;
                        const dx = entity.position.x - p.position.x;
                        const dz = entity.position.z - p.position.z;
                        // Use a slightly larger check here to ensure they pop in smoothly with the shader
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

            const damageMap: Record<string, number> = {};
            hitProjectiles.forEach(p => {
                damageMap[p.targetId] = (damageMap[p.targetId] || 0) + p.damage;
                const t = prev.entities.find(e => e.id === p.targetId);
                if (t && t.visible) {
                    newFloatingTexts.push({ id: uuidv4(), text: `-${p.damage}`, position: { ...t.position }, color: '#ef4444', life: 1 });
                }
            });

            const resourceMap: Record<string, number> = {}; 

            newEntities = newEntities.map(entity => {
                const CARRY_CAPACITY = 10;
                const TICK_SPEED = 0.033;
                let pos = { ...entity.position };
                const stats = UNIT_STATS[entity.subType as UnitType] || UNIT_STATS[UnitType.PEASANT];

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

                if (entity.state === 'moving' && entity.targetPos) {
                    const dx = entity.targetPos.x - pos.x;
                    const dz = entity.targetPos.z - pos.z;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    const speed = (stats.speed || 3) * TICK_SPEED;
                    if (dist < 0.5) {
                        hasChanges = true;
                        return { ...entity, state: 'idle', targetPos: null, position: pos };
                    } else {
                        hasChanges = true;
                        pos.x += (dx/dist) * speed;
                        pos.z += (dz/dist) * speed;
                        return { ...entity, position: pos };
                    }
                }

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
                
                if (entity.state === 'attacking' && entity.targetId) {
                     const target = prev.entities.find(t => t.id === entity.targetId);
                     if (!target || target.hp <= 0 || !target.visible) {
                         hasChanges = true;
                         return { ...entity, state: 'idle', position: pos };
                     }
                     const dx = target.position.x - pos.x;
                     const dz = target.position.z - pos.z;
                     const dist = Math.sqrt(dx*dx + dz*dz);
                     const range = stats.range || 2;
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
            projectiles={gameState.projectiles}
            floatingTexts={gameState.floatingTexts}
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