import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Entity, EntityType, BuildingType, PlacementMode, Projectile, FloatingText, Faction } from '../types';
import { Unit3D, Building3D, Resource3D, Projectile3D, FloatingText3D } from './WorldEntities';
import { UNIT_STATS } from '../constants';

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
        <mesh position={[0, 2, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.8, 1.2, 4, 6]} />
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
    const GRID_SIZE = 128;
    const WORLD_SIZE = 120;
    
    const data = useMemo(() => new Uint8Array(GRID_SIZE * GRID_SIZE).fill(0), []);
    const textureRef = useRef<THREE.DataTexture>(null);

    const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: {
            uFogMap: { value: null }
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
    }), []);

    useFrame(() => {
        if (!textureRef.current) return;

        // 1. Fade active vision to "Explored" (128)
        for (let i = 0; i < data.length; i++) {
            if (data[i] > 128) data[i] = 128; 
        }

        // 2. Project current vision from Player entities
        const playerEntities = entities.filter(e => e.faction === Faction.PLAYER && e.hp > 0);
        
        playerEntities.forEach(e => {
            const stats = UNIT_STATS[e.subType as keyof typeof UNIT_STATS];
            const range = stats?.visionRange || 8;
            
            // X Mapping: -60 to 60 -> 0 to 127
            const gridX = Math.floor(((e.position.x + 60) / 120) * (GRID_SIZE - 1));
            
            // Z Mapping FIX: Because of rotation -PI/2 on X, 
            // UV.y=0 is at Z=60 and UV.y=1 is at Z=-60.
            // So we use (60 - Z) to map correctly.
            const gridY = Math.floor(((60 - e.position.z) / 120) * (GRID_SIZE - 1));
            
            const gridRange = Math.ceil((range / 120) * GRID_SIZE);

            for (let y = -gridRange; y <= gridRange; y++) {
                for (let x = -gridRange; x <= gridRange; x++) {
                    if (x*x + y*y <= gridRange*gridRange) {
                        const px = gridX + x;
                        const py = gridY + y;
                        if (px >= 0 && px < GRID_SIZE && py >= 0 && py < GRID_SIZE) {
                            data[py * GRID_SIZE + px] = 255;
                        }
                    }
                }
            }
        });

        textureRef.current.needsUpdate = true;
    });

    return (
        <mesh 
            rotation={[-Math.PI / 2, 0, 0]} 
            position={[0, 0.3, 0]} 
            raycast={() => null}
        >
            <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
            <primitive object={shaderMaterial} attach="material">
                <dataTexture 
                    ref={textureRef}
                    attach="uniforms-uFogMap-value"
                    args={[data, GRID_SIZE, GRID_SIZE, THREE.RedFormat, THREE.UnsignedByteType]}
                    magFilter={THREE.LinearFilter}
                    minFilter={THREE.LinearFilter}
                />
            </primitive>
        </mesh>
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
          RIGHT: null
        }}
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

      <FogOfWarOverlay entities={entities} />
      
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

      {marker && <ClickMarker key={marker.id} position={marker.pos} color={marker.color} />}
      
      {placementMode.active && placementMode.type && hoverPos && (
          <GhostBuilding type={placementMode.type} position={hoverPos} />
      )}

      <gridHelper args={[120, 60, 0x000000, 0x000000]} position={[0, 0.01, 0]} raycast={() => null}>
         <meshBasicMaterial attach="material" color="black" transparent opacity={0.1} />
      </gridHelper>

      {entities.map(entity => (
        <group 
            key={entity.id} 
            onClick={(e) => {
                e.stopPropagation();
                if (!placementMode.active && entity.visible) {
                    onSelectEntity([entity.id], e.shiftKey);
                }
            }}
            onContextMenu={(e) => {
                e.stopPropagation();
                e.nativeEvent.preventDefault();
                if (entity.visible) {
                    spawnMarker(new THREE.Vector3(entity.position.x, entity.position.y, entity.position.z), '#ef4444');
                    onRightClickEntity(entity.id);
                }
            }}
            onPointerOver={() => { if(entity.visible) document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => document.body.style.cursor = 'default'}
        >
            <Unit3D entity={entity} />
            {entity.type === EntityType.BUILDING && <Building3D entity={entity} />}
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