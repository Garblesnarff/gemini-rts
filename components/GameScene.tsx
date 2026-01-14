import React, { useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Entity, EntityType, BuildingType, PlacementMode, Projectile, FloatingText, Faction } from '../types';
import { Unit3D, Building3D, Resource3D, Projectile3D, FloatingText3D } from './WorldEntities';

interface GameSceneProps {
  entities: Entity[];
  projectiles: Projectile[];
  floatingTexts: FloatingText[];
  placementMode: PlacementMode;
  onSelectEntity: (ids: string[], multi: boolean) => void;
  onRightClickGround: (pos: THREE.Vector3) => void;
  onRightClickEntity: (targetId: string) => void;
  onPlaceBuilding: (pos: THREE.Vector3) => void;
}

const GhostBuilding: React.FC<{ type: BuildingType, position: THREE.Vector3 }> = ({ type, position }) => {
  const isTownHall = type === BuildingType.TOWN_HALL;
  const isTower = type === BuildingType.TOWER;
  
  return (
    <group position={position}>
      {isTower ? (
        <mesh position={[0, 2, 0]}>
            <cylinderGeometry args={[0.8, 1.2, 4, 6]} />
            <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
        </mesh>
      ) : (
          <>
            <mesh position={[0, 1, 0]}>
                <boxGeometry args={[isTownHall ? 4 : 3, 2, isTownHall ? 4 : 3]} />
                <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
            </mesh>
            <mesh position={[0, 2.5, 0]}>
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
        <mesh position={[position.x, 0.2, position.z]} rotation={[-Math.PI/2, 0, 0]} scale={scale}>
            <ringGeometry args={[0.5, 0.7, 32]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} />
        </mesh>
    );
};

// Controls Multi-Selection Logic
const SelectionController = ({ active, onSelect }: { active: boolean, onSelect: (ids: string[]) => void }) => {
    const { camera, scene, gl } = useThree();
    const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
    const [curPos, setCurPos] = useState<{x: number, y: number} | null>(null);

    useEffect(() => {
        if (!active) return;

        const handleMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return; // Only Left Click
            setStartPos({ x: e.clientX, y: e.clientY });
            setCurPos({ x: e.clientX, y: e.clientY });
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (startPos) {
                setCurPos({ x: e.clientX, y: e.clientY });
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (!startPos || !curPos) return;

            // Calculate Box
            const minX = Math.min(startPos.x, curPos.x);
            const maxX = Math.max(startPos.x, curPos.x);
            const minY = Math.min(startPos.y, curPos.y);
            const maxY = Math.max(startPos.y, curPos.y);

            // Simple click check (not a drag)
            if (maxX - minX < 5 && maxY - minY < 5) {
                setStartPos(null);
                setCurPos(null);
                return; 
            }

            // Find entities in box
            const selectedIds: string[] = [];
            
            // Traverse scene for entities (Optimization: Pass entities as prop instead of traversing scene graph, but this works for MVP)
            scene.traverse((object) => {
                // We tagged our entity groups with userData in the main loop or just check proximity
                // Better approach: Project entity positions
            });

            // Using the global event approach requires access to entities.
            // Let's defer actual selection logic to the parent via coordinates if needed, 
            // OR use Raycaster. For box selection, projecting World to Screen is best.
            // Since we can't easily access the React state 'entities' inside this useEffect without deps,
            // we will emit the BOX coordinates and let the parent handle the math, OR rely on a custom event.
            
            // Alternative: We do the math here if we had entities. 
            // To keep it clean, let's use a specialized hook in the parent or pass entities here.
            
            setStartPos(null);
            setCurPos(null);
        };

        // We attach to window to catch drags outside canvas
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [active, startPos, curPos, scene, camera, onSelect]);

    // Render the HTML Box
    if (!startPos || !curPos) return null;
    
    const width = Math.abs(curPos.x - startPos.x);
    const height = Math.abs(curPos.y - startPos.y);
    const left = Math.min(curPos.x, startPos.x);
    const top = Math.min(curPos.y, startPos.y);

    return (
        <Html fullscreen style={{ pointerEvents: 'none', zIndex: 100 }}>
            <div style={{
                position: 'absolute',
                left: left,
                top: top,
                width: width,
                height: height,
                border: '1px solid #00ff00',
                backgroundColor: 'rgba(0, 255, 0, 0.2)',
            }} />
        </Html>
    );
};

export const GameScene: React.FC<GameSceneProps> = ({ 
  entities, 
  projectiles,
  floatingTexts,
  placementMode,
  onSelectEntity,
  onRightClickGround,
  onRightClickEntity,
  onPlaceBuilding
}) => {
  const groundRef = useRef<THREE.Mesh>(null);
  const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null);
  const [marker, setMarker] = useState<{pos: THREE.Vector3, color: string, id: number} | null>(null);
  
  // Selection State
  const [dragStart, setDragStart] = useState<THREE.Vector2 | null>(null);
  const [dragCurrent, setDragCurrent] = useState<THREE.Vector2 | null>(null);
  const { camera, size } = useThree();

  const spawnMarker = (pos: THREE.Vector3, color: string) => {
      setMarker({ pos, color, id: Date.now() });
  };

  const handlePointerDown = (e: any) => {
      if (e.button === 0 && !placementMode.active) {
          setDragStart(new THREE.Vector2(e.clientX, e.clientY));
          setDragCurrent(new THREE.Vector2(e.clientX, e.clientY));
      }
  };

  const handlePointerMove = (e: any) => {
      if (dragStart) {
          setDragCurrent(new THREE.Vector2(e.clientX, e.clientY));
      }
      
      // Ground hover for building placement
      if (e.intersections.length > 0) {
          const point = e.intersections[0].point;
           setHoverPos(new THREE.Vector3(Math.round(point.x), 0, Math.round(point.z)));
      }
  };

  const handlePointerUp = (e: any) => {
      if (dragStart && dragCurrent && !placementMode.active) {
          const dx = dragCurrent.x - dragStart.x;
          const dy = dragCurrent.y - dragStart.y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist > 10) {
              // Box Selection
              const minX = Math.min(dragStart.x, dragCurrent.x);
              const maxX = Math.max(dragStart.x, dragCurrent.x);
              const minY = Math.min(dragStart.y, dragCurrent.y);
              const maxY = Math.max(dragStart.y, dragCurrent.y);

              const selected: string[] = [];
              entities.forEach(ent => {
                  if (ent.faction === Faction.PLAYER && ent.type === EntityType.UNIT) {
                      const pos = new THREE.Vector3(ent.position.x, ent.position.y, ent.position.z);
                      pos.project(camera);
                      const x = (pos.x * .5 + .5) * size.width;
                      const y = (-(pos.y * .5) + .5) * size.height;

                      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                          selected.push(ent.id);
                      }
                  }
              });
              onSelectEntity(selected, false);
          } else {
              // Single Click (handled by entity onClick or Ground onClick)
             // But if we clicked ground, clear selection
             if (e.object === groundRef.current) {
                 onSelectEntity([], false);
             }
          }
      }
      setDragStart(null);
      setDragCurrent(null);
  };

  return (
    <>
      <OrbitControls 
        makeDefault 
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2.2} 
        maxDistance={80}
        minDistance={10}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN, 
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: null // Free up Right Click
        }}
        // Disable orbit controls while dragging selection box
        enabled={!dragStart}
      />
      
      <ambientLight intensity={0.6} color="#dbeafe" />
      <directionalLight 
        position={[50, 50, 25]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
      >
        <orthographicCamera attach="shadow-camera" args={[-60, 60, 60, -60]} />
      </directionalLight>

      <Environment preset="park" />
      <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} />

      {/* Terrain */}
      <mesh 
        ref={groundRef} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0, 0]} 
        receiveShadow
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={(e) => {
             if (placementMode.active && hoverPos) {
                 e.stopPropagation();
                 onPlaceBuilding(hoverPos);
             }
        }}
        onContextMenu={(e) => {
             e.stopPropagation(); 
             e.nativeEvent.preventDefault(); 
             spawnMarker(e.point, '#00ff00');
             onRightClickGround(e.point);
        }}
      >
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#4d7c0f" roughness={1} />
      </mesh>
      
      {/* Selection Box UI */}
      {dragStart && dragCurrent && (
          <Html fullscreen style={{ pointerEvents: 'none', zIndex: 100 }}>
              <div style={{
                  position: 'absolute',
                  left: Math.min(dragStart.x, dragCurrent.x),
                  top: Math.min(dragStart.y, dragCurrent.y),
                  width: Math.abs(dragCurrent.x - dragStart.x),
                  height: Math.abs(dragCurrent.y - dragStart.y),
                  border: '2px solid #00ff00',
                  backgroundColor: 'rgba(0, 255, 0, 0.2)',
                  pointerEvents: 'none'
              }} />
          </Html>
      )}

      {/* Markers & Ghosts */}
      {marker && <ClickMarker key={marker.id} position={marker.pos} color={marker.color} />}
      
      {placementMode.active && placementMode.type && hoverPos && (
          <GhostBuilding type={placementMode.type} position={hoverPos} />
      )}

      <gridHelper args={[120, 60, 0x000000, 0x000000]} position={[0, 0.01, 0]} rotation={[0,0,0]}>
         <meshBasicMaterial attach="material" color="black" transparent opacity={0.1} />
      </gridHelper>

      {/* Entities */}
      {entities.map(entity => (
        <group 
            key={entity.id} 
            onClick={(e) => {
                e.stopPropagation();
                // If in placement mode, do nothing (ground handles it)
                if (!placementMode.active) {
                    onSelectEntity([entity.id], e.shiftKey);
                }
            }}
            onContextMenu={(e) => {
                e.stopPropagation();
                e.nativeEvent.preventDefault();
                spawnMarker(entity.position as any, '#ef4444');
                onRightClickEntity(entity.id);
            }}
            onPointerOver={() => document.body.style.cursor = 'pointer'}
            onPointerOut={() => document.body.style.cursor = 'default'}
        >
            {entity.type === EntityType.UNIT && <Unit3D entity={entity} />}
            {entity.type === EntityType.BUILDING && <Building3D entity={entity} />}
            {entity.type === EntityType.RESOURCE && <Resource3D entity={entity} />}
        </group>
      ))}

      {/* Projectiles */}
      {projectiles.map(proj => {
          const target = entities.find(e => e.id === proj.targetId);
          if (!target) return null;
          return <Projectile3D key={proj.id} data={proj} startPos={proj.startPos} endPos={target.position} />;
      })}

      {/* Floating Text */}
      {floatingTexts.map(ft => (
          <FloatingText3D key={ft.id} data={ft} />
      ))}
    </>
  );
};
