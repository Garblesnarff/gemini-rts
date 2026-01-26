

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Entity, EntityType, BuildingType, PlacementMode, Projectile, FloatingText, Faction, CommandMode } from '../types';
import { Unit3D, Building3D, Resource3D, Projectile3D, FloatingText3D, RallyPoint3D } from './WorldEntities';
import { UNIT_STATS, DRAG_THRESHOLD, MAP_SIZE } from '../constants';

interface GameSceneProps {
  entities: Entity[];
  projectiles: Projectile[];
  floatingTexts: FloatingText[];
  placementMode: PlacementMode;
  commandMode: CommandMode;
  cameraTarget: THREE.Vector3 | null;
  onSelectEntity: (ids: string[], multi: boolean) => void;
  onRightClickGround: (pos: THREE.Vector3) => void;
  onRightClickEntity: (targetId: string) => void;
  onPlaceBuilding: (pos: THREE.Vector3) => void;
  onSelectionChange: (box: {start: {x:number, y:number}, current: {x:number, y:number}} | null) => void;
  onAttackMove: (pos: THREE.Vector3) => void;
}

const getCameraDirections = (camera: THREE.Camera) => {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  
  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  
  return { forward, right };
};

const GhostBuilding: React.FC<{ type: BuildingType, position: THREE.Vector3 }> = ({ type, position }) => {
  const isTownHall = type === BuildingType.TOWN_HALL;
  const isTower = type === BuildingType.TOWER;
  const isCannonTower = type === BuildingType.CANNON_TOWER;
  const isBlacksmith = type === BuildingType.BLACKSMITH;
  
  return (
    <group position={position}>
      {isCannonTower ? (
        <group>
            <mesh position={[0, 1.5, 0]} raycast={() => null}>
                <cylinderGeometry args={[1.5, 2.0, 3, 8]} />
                <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
            </mesh>
            <mesh position={[0, 2.5, 1.2]} rotation={[Math.PI/6, 0, 0]} raycast={() => null}>
                <cylinderGeometry args={[0.3, 0.4, 2, 8]} />
                <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
            </mesh>
        </group>
      ) : isTower ? (
        <mesh position={[0, 2, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.8, 1.2, 4, 6]} />
            <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
        </mesh>
      ) : isBlacksmith ? (
        <mesh position={[0, 1.5, 0]} raycast={() => null}>
            <boxGeometry args={[3, 3, 3]} />
            <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
        </mesh>
      ) : (
          <>
            <mesh position={[0, 1, 0]} raycast={() => null}>
                <boxGeometry args={[isTownHall ? 4 : 3, 2, isTownHall ? 4 : 3]} />
                <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
            </mesh>
            <mesh position={[0, 2.5, 0]} raycast={() => null}>
                <coneGeometry args={[isTownHall ? 3 : 2.5, 2, 4]} rotation={[0, Math.PI/4, 0]} />
                <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
            </mesh>
          </>
      )}
      <gridHelper args={[4, 4, 0x3b82f6, 0x3b82f6]} position={[0, 0.1, 0]} />
    </group>
  );
};

const ClickMarker: React.FC<{ position: THREE.Vector3, color?: string }> = ({ position, color = '#00ff00' }) => {
    const [scale, setScale] = useState(0);
    const [opacity, setOpacity] = useState(1);
    
    useFrame((_, delta) => {
        setScale(s => Math.min(s + delta * 5, 1));
        setOpacity(o => Math.max(o - delta * 2, 0));
    });

    if (opacity <= 0) return null;

    return (
        <mesh position={[position.x, 0.2, position.z]} rotation={[-Math.PI/2, 0, 0]} scale={scale} raycast={() => null}>
            <ringGeometry args={[0.5, 0.7, 32]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} />
        </mesh>
    );
};

const FogOfWarOverlay: React.FC<{ entities: Entity[] }> = ({ entities }) => {
    const GRID_SIZE = 256; 
    const WORLD_SIZE = MAP_SIZE;
    
    // Create texture and data buffer once.
    const { texture, data } = useMemo(() => {
        // RGBA (4 bytes per pixel)
        const d = new Uint8Array(GRID_SIZE * GRID_SIZE * 4).fill(0);
        
        // Initial visibility for player start area (-60, -60)
        // Map: (-100, -100) to (100, 100)
        
        const startX = 51; 
        const startY = 204;
        const radius = 30; 

        for(let y=0; y<GRID_SIZE; y++) {
            for(let x=0; x<GRID_SIZE; x++) {
                const dx = x - startX;
                const dy = y - startY;
                if(dx*dx + dy*dy < radius*radius) {
                    const i = (y * GRID_SIZE + x) * 4;
                    d[i] = 255; // R channel
                }
            }
        }

        const t = new THREE.DataTexture(d, GRID_SIZE, GRID_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        return { texture: t, data: d };
    }, []);

    const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: {
            uFogMap: { value: texture }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uFogMap;
            varying vec2 vUv;
            void main() {
                // Read from R channel
                float v = texture2D(uFogMap, vUv).r;
                float finalAlpha = 1.0;
                if (v > 0.9) {
                    finalAlpha = 0.0; // Visible
                } else if (v > 0.4) {
                    finalAlpha = 0.6; // Explored
                }
                gl_FragColor = vec4(0.0, 0.0, 0.0, finalAlpha);
            }
        `,
        transparent: true,
        depthWrite: false,
    }), [texture]);

    useFrame(() => {
        // 1. Decay visibility: Active (255) -> Explored (128)
        // Stride 4 for RGBA
        for (let i = 0; i < data.length; i+=4) {
            if (data[i] > 128) data[i] = 128; 
        }

        // 2. Paint new visibility
        const playerEntities = entities.filter(e => e.faction === Faction.PLAYER && e.hp > 0);
        
        playerEntities.forEach(e => {
            const stats = UNIT_STATS[e.subType as keyof typeof UNIT_STATS];
            const range = stats?.visionRange || 10;
            
            // Map coordinates [-100, 100] to [0, GRID_SIZE-1]
            const gridX = Math.floor(((e.position.x + (WORLD_SIZE/2)) / WORLD_SIZE) * (GRID_SIZE - 1));
            // Invert Z for Grid Y (Top of map is North/-Z is High Y index in this mapping)
            const gridY = Math.floor((((WORLD_SIZE/2) - e.position.z) / WORLD_SIZE) * (GRID_SIZE - 1));
            const gridRange = Math.ceil((range / WORLD_SIZE) * GRID_SIZE);

            // Simple Bounding Box + Circle check
            const minX = Math.max(0, gridX - gridRange);
            const maxX = Math.min(GRID_SIZE - 1, gridX + gridRange);
            const minY = Math.max(0, gridY - gridRange);
            const maxY = Math.min(GRID_SIZE - 1, gridY + gridRange);

            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const dx = x - gridX;
                    const dy = y - gridY;
                    if (dx*dx + dy*dy <= gridRange*gridRange) {
                        const i = (y * GRID_SIZE + x) * 4;
                        data[i] = 255;
                    }
                }
            }
        });

        texture.needsUpdate = true;
    });

    return (
        <mesh 
            rotation={[-Math.PI / 2, 0, 0]} 
            position={[0, 0.3, 0]} 
            raycast={() => null}
        >
            <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
            <primitive object={shaderMaterial} attach="material" />
        </mesh>
    );
};


export const GameScene: React.FC<GameSceneProps> = ({ 
  entities, 
  projectiles, 
  floatingTexts,
  placementMode,
  commandMode,
  cameraTarget,
  onSelectEntity,
  onRightClickGround,
  onRightClickEntity,
  onPlaceBuilding,
  onSelectionChange,
  onAttackMove
}) => {
  const groundRef = useRef<THREE.Mesh>(null);
  const controlsRef = useRef<any>(null); // Reference to OrbitControls
  const keysPressed = useRef<Record<string, boolean>>({});

  const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null);
  const [marker, setMarker] = useState<{pos: THREE.Vector3, color: string, id: number} | null>(null);
  
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{x: number, y: number} | null>(null);
  
  // Right-click Pan Refs
  const rightDragStart = useRef<{x: number, y: number} | null>(null);
  const isRightPanning = useRef(false);
  const panStartCamPos = useRef(new THREE.Vector3());
  const panStartTarget = useRef(new THREE.Vector3());
  const ignoreNextContextMenu = useRef(false);

  const entitiesRef = useRef(entities);
  entitiesRef.current = entities; 

  const { camera, size, gl } = useThree();

  // Move camera if target changes programmatically (e.g. double tap group)
  useEffect(() => {
    if (cameraTarget && controlsRef.current) {
        controlsRef.current.target.set(cameraTarget.x, 0, cameraTarget.z);
        // Only update Y if it's too zoomed out or in, optional, but we keep X/Z sync
        // camera.position.set(cameraTarget.x + 20, 45, cameraTarget.z + 20); // Removed to allow smooth panning without snapping height
        controlsRef.current.update();
    }
  }, [cameraTarget, camera]);

  // Keyboard listeners for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keysPressed.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keysPressed.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    }
  }, []);

  // Pan Event Listeners (Right Click Drag)
  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
        if (e.button === 2) { // Right Click
            rightDragStart.current = { x: e.clientX, y: e.clientY };
            isRightPanning.current = false;
            ignoreNextContextMenu.current = false; // Reset flag to ensure clicks work
            panStartCamPos.current.copy(camera.position);
            if (controlsRef.current) {
                panStartTarget.current.copy(controlsRef.current.target);
            }
        }
    };

    const onPointerMove = (e: PointerEvent) => {
        if (rightDragStart.current) {
            const dx = e.clientX - rightDragStart.current.x;
            const dy = e.clientY - rightDragStart.current.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (!isRightPanning.current && dist > DRAG_THRESHOLD) {
                isRightPanning.current = true;
            }

            if (isRightPanning.current && controlsRef.current) {
                const height = camera.position.y;
                const sensitivity = 0.05 * (height / 25); 
                
                const { forward, right } = getCameraDirections(camera);

                // Calculate movement in camera-relative directions
                // dx (horizontal screen drag) → move along camera's right vector
                // dy (vertical screen drag) → move along camera's forward vector
                // Pulling the world:
                // Drag Right (dx > 0) -> Camera Left (-Right)
                // Drag Down (dy > 0) -> Camera Forward (+Forward)
                
                const moveVector = new THREE.Vector3();
                moveVector.addScaledVector(right, -dx * sensitivity);
                moveVector.addScaledVector(forward, dy * sensitivity);

                camera.position.copy(panStartCamPos.current).add(moveVector);
                controlsRef.current.target.copy(panStartTarget.current).add(moveVector);
                controlsRef.current.update();
            }
        }
    };

    const onPointerUp = (e: PointerEvent) => {
        if (e.button === 2) {
            if (isRightPanning.current) {
                ignoreNextContextMenu.current = true;
            }
            rightDragStart.current = null;
            isRightPanning.current = false;
        }
    };

    // Global context menu suppression during pan logic is handled in specific handlers, 
    // but we add a failsafe listener on the canvas just in case user drags on void
    const onContextMenu = (e: MouseEvent) => {
         if (ignoreNextContextMenu.current) {
            e.preventDefault();
            e.stopPropagation();
         }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);

    return () => {
        canvas.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [camera, gl.domElement]);

  // Update cursor based on mode
  useEffect(() => {
    if (placementMode.active) {
        document.body.style.cursor = 'crosshair';
    } else if (commandMode.active) {
        document.body.style.cursor = 'crosshair';
    } else {
        document.body.style.cursor = 'default';
    }
  }, [placementMode.active, commandMode.active]);

  // Window Event Listeners for Dragging (Selection Box)
  useEffect(() => {
      const handleWindowMove = (e: PointerEvent) => {
          if (isDraggingRef.current && dragStartRef.current) {
               const current = { x: e.clientX, y: e.clientY };
               onSelectionChange({ start: dragStartRef.current, current });
          }
      };

      const handleWindowUp = (e: PointerEvent) => {
          if (isDraggingRef.current && dragStartRef.current) {
              const start = dragStartRef.current;
              const current = { x: e.clientX, y: e.clientY };
              
              const dx = current.x - start.x;
              const dy = current.y - start.y;
              const dist = Math.sqrt(dx*dx + dy*dy);

              if (dist > 10) {
                  // Box Select Logic
                  const minX = Math.min(start.x, current.x);
                  const maxX = Math.max(start.x, current.x);
                  const minY = Math.min(start.y, current.y);
                  const maxY = Math.max(start.y, current.y);

                  const selected: string[] = [];
                  entitiesRef.current.forEach(ent => {
                      if (ent.faction === Faction.PLAYER && ent.type === EntityType.UNIT && ent.visible) {
                          const pos = new THREE.Vector3(ent.position.x, ent.position.y, ent.position.z);
                          pos.project(camera);
                          const x = (pos.x * .5 + .5) * size.width;
                          const y = (-(pos.y * .5) + .5) * size.height;

                          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                              selected.push(ent.id);
                          }
                      }
                  });
                  onSelectEntity(selected, e.shiftKey);
              } else {
                  // Single click on ground (handled here to clear selection if not clicking entity)
                  if (e.target === gl.domElement && !placementMode.active && !commandMode.active) {
                      onSelectEntity([], false);
                  }
              }
              
              isDraggingRef.current = false;
              dragStartRef.current = null;
              onSelectionChange(null);
          }
      };

      window.addEventListener('pointermove', handleWindowMove);
      window.addEventListener('pointerup', handleWindowUp);
      
      return () => {
          window.removeEventListener('pointermove', handleWindowMove);
          window.removeEventListener('pointerup', handleWindowUp);
      };
  }, [camera, size, gl, onSelectEntity, onSelectionChange, placementMode.active, commandMode.active]);


  // Camera Pan Loop (Keyboard only now)
  useFrame((state, delta) => {
    const PAN_SPEED = 40 * delta;
    
    // Get input
    let inputForward = 0;
    let inputRight = 0;

    if (keysPressed.current['KeyW'] || keysPressed.current['ArrowUp']) inputForward += 1;
    if (keysPressed.current['KeyS'] || keysPressed.current['ArrowDown']) inputForward -= 1;
    if (keysPressed.current['KeyA'] || keysPressed.current['ArrowLeft']) inputRight -= 1;
    if (keysPressed.current['KeyD'] || keysPressed.current['ArrowRight']) inputRight += 1;

    if (inputForward !== 0 || inputRight !== 0) {
        const controls = controlsRef.current;
        if (controls) {
            const { forward, right } = getCameraDirections(camera);

            // Normalize diagonal movement
            const len = Math.sqrt(inputForward * inputForward + inputRight * inputRight);
            if (len > 0) {
                inputForward /= len;
                inputRight /= len;
            }

            // Calculate world-space movement
            const moveVector = new THREE.Vector3();
            moveVector.addScaledVector(forward, inputForward * PAN_SPEED);
            moveVector.addScaledVector(right, inputRight * PAN_SPEED);

            const target = controls.target;
            const newTargetX = target.x + moveVector.x;
            const newTargetZ = target.z + moveVector.z;
            
            // Bounds updated for 200x200 map
            const BOUNDS = 90;
            const clampedTargetX = Math.max(-BOUNDS, Math.min(BOUNDS, newTargetX));
            const clampedTargetZ = Math.max(-BOUNDS, Math.min(BOUNDS, newTargetZ));
            
            const deltaX = clampedTargetX - target.x;
            const deltaZ = clampedTargetZ - target.z;
            
            if (deltaX !== 0 || deltaZ !== 0) {
                camera.position.x += deltaX;
                camera.position.z += deltaZ;
                target.x += deltaX;
                target.z += deltaZ;
                controls.update();
            }
        }
    }
  });

  const spawnMarker = (pos: THREE.Vector3, color: string) => {
      setMarker({ pos, color, id: Date.now() });
  };

  const handlePointerDown = (e: any) => {
      // Only drag if not building or commanding
      if (e.button === 0 && !placementMode.active && !commandMode.active) {
          e.stopPropagation(); 
          isDraggingRef.current = true;
          dragStartRef.current = { x: e.clientX, y: e.clientY };
          onSelectionChange({ start: dragStartRef.current, current: dragStartRef.current });
      }
  };

  const handlePointerMove = (e: any) => {
      if (e.intersections.length > 0) {
          const point = e.intersections[0].point;
           setHoverPos(new THREE.Vector3(Math.round(point.x), 0, Math.round(point.z)));
      }
  };

  return (
    <>
      <OrbitControls 
        ref={controlsRef}
        makeDefault 
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2.2} 
        maxDistance={120}
        minDistance={10}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN, 
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: null
        }}
        enabled={!isDraggingRef.current} 
        enablePan={false}
      />
      
      <ambientLight intensity={0.6} color="#dbeafe" />
      <directionalLight 
        position={[80, 80, 40]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
      >
        <orthographicCamera attach="shadow-camera" args={[-100, 100, 100, -100]} />
      </directionalLight>

      <Environment preset="park" />
      <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} />

      <mesh 
        ref={groundRef} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0, 0]} 
        receiveShadow
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onClick={(e) => {
             if (placementMode.active && hoverPos) {
                 e.stopPropagation();
                 onPlaceBuilding(hoverPos);
             } else if (commandMode.active && (commandMode.type === 'ATTACK_MOVE' || commandMode.type === 'PATROL') && hoverPos) {
                 e.stopPropagation();
                 const color = commandMode.type === 'ATTACK_MOVE' ? '#ef4444' : '#3b82f6';
                 spawnMarker(hoverPos, color);
                 onAttackMove(hoverPos); 
             }
        }}
        onContextMenu={(e) => {
             e.stopPropagation(); 
             e.nativeEvent.preventDefault(); 
             if (ignoreNextContextMenu.current) {
                 ignoreNextContextMenu.current = false;
                 return;
             }
             spawnMarker(e.point, '#00ff00');
             onRightClickGround(e.point);
        }}
      >
        <planeGeometry args={[MAP_SIZE, MAP_SIZE]} />
        <meshStandardMaterial color="#4d7c0f" roughness={1} />
      </mesh>

      <FogOfWarOverlay entities={entities} />

      {marker && <ClickMarker key={marker.id} position={marker.pos} color={marker.color} />}
      
      {placementMode.active && placementMode.type && hoverPos && (
          <GhostBuilding type={placementMode.type} position={hoverPos} />
      )}

       {/* Attack Move / Patrol Crosshair Cursor helper */}
       {commandMode.active && hoverPos && (
          <mesh position={[hoverPos.x, 0.5, hoverPos.z]} rotation={[-Math.PI/2, 0, 0]} raycast={() => null}>
             <ringGeometry args={[0.5, 0.6, 16]} />
             <meshBasicMaterial color={commandMode.type === 'ATTACK_MOVE' ? "#ef4444" : "#3b82f6"} opacity={0.8} transparent />
          </mesh>
       )}

      <gridHelper args={[MAP_SIZE, 40, 0x000000, 0x000000]} position={[0, 0.01, 0]} raycast={() => null}>
         <meshBasicMaterial attach="material" color="black" transparent opacity={0.1} />
      </gridHelper>

      {entities.map(entity => (
        <group 
            key={entity.id} 
            onClick={(e) => {
                if (!placementMode.active && !commandMode.active && entity.visible) {
                    e.stopPropagation();
                    onSelectEntity([entity.id], e.shiftKey);
                } else if (commandMode.active && entity.visible) {
                    e.stopPropagation();
                    // Clicking an entity in attack/patrol mode
                    onRightClickEntity(entity.id);
                }
            }}
            onContextMenu={(e) => {
                e.stopPropagation();
                e.nativeEvent.preventDefault();
                if (ignoreNextContextMenu.current) {
                    ignoreNextContextMenu.current = false;
                    return;
                }
                if (entity.visible) {
                    spawnMarker(new THREE.Vector3(entity.position.x, entity.position.y, entity.position.z), '#ef4444');
                    onRightClickEntity(entity.id);
                }
            }}
            onPointerOver={() => { if(entity.visible) document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => document.body.style.cursor = 'default'}
        >
            <Unit3D entity={entity} />
            {entity.type === EntityType.BUILDING && (
                <>
                    <Building3D entity={entity} />
                    {entity.selected && entity.rallyPoint && <RallyPoint3D pos={entity.rallyPoint} />}
                </>
            )}
            {entity.type === EntityType.RESOURCE && <Resource3D entity={entity} />}
        </group>
      ))}

      {projectiles.map(proj => {
          const target = entities.find(e => e.id === proj.targetId);
          if (!target) return null;
          return <Projectile3D key={proj.id} data={proj} startPos={proj.startPos} endPos={target.position} />;
      })}

      {floatingTexts.map(ft => (
          <FloatingText3D key={ft.id} data={ft} />
      ))}
    </>
  );
};