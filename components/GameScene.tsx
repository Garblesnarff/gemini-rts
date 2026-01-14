import React, { useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { Entity, EntityType, BuildingType, PlacementMode } from '../types';
import { Unit3D, Building3D, Resource3D } from './WorldEntities';

interface GameSceneProps {
  entities: Entity[];
  placementMode: PlacementMode;
  onSelectEntity: (id: string, multi: boolean) => void;
  onRightClickGround: (pos: THREE.Vector3) => void;
  onRightClickEntity: (targetId: string) => void;
  onPlaceBuilding: (pos: THREE.Vector3) => void;
}

const GhostBuilding: React.FC<{ type: BuildingType, position: THREE.Vector3 }> = ({ type, position }) => {
  const isTownHall = type === BuildingType.TOWN_HALL;
  
  return (
    <group position={position}>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[isTownHall ? 4 : 3, 2, isTownHall ? 4 : 3]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
      </mesh>
       <mesh position={[0, 2.5, 0]}>
        <coneGeometry args={[isTownHall ? 3 : 2.5, 2, 4]} rotation={[0, Math.PI/4, 0]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.4} />
      </mesh>
      <gridHelper args={[isTownHall ? 4 : 3, isTownHall ? 4 : 3, 0x3b82f6, 0x3b82f6]} position={[0, 0.1, 0]} />
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

export const GameScene: React.FC<GameSceneProps> = ({ 
  entities, 
  placementMode,
  onSelectEntity,
  onRightClickGround,
  onRightClickEntity,
  onPlaceBuilding
}) => {
  const groundRef = useRef<THREE.Mesh>(null);
  const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null);
  const [marker, setMarker] = useState<{pos: THREE.Vector3, color: string, id: number} | null>(null);

  const spawnMarker = (pos: THREE.Vector3, color: string) => {
      setMarker({ pos, color, id: Date.now() });
  };

  const handleGroundPointerMove = (e: any) => {
    const x = Math.round(e.point.x);
    const z = Math.round(e.point.z);
    setHoverPos(new THREE.Vector3(x, 0, z));
  };

  return (
    <>
      <OrbitControls 
        makeDefault 
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2.2} 
        maxDistance={60}
        minDistance={10}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN, 
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: null // Free up Right Click for Game Actions
        }}
      />
      
      <ambientLight intensity={0.6} color="#dbeafe" />
      <directionalLight 
        position={[50, 50, 25]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
      >
        <orthographicCamera attach="shadow-camera" args={[-50, 50, 50, -50]} />
      </directionalLight>

      <Environment preset="park" />
      <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} />

      {/* Terrain */}
      <mesh 
        ref={groundRef} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0, 0]} 
        receiveShadow
        onPointerMove={handleGroundPointerMove}
        onClick={(e) => {
             e.stopPropagation();
             if (placementMode.active && hoverPos) {
                 onPlaceBuilding(hoverPos);
             } else {
                 onSelectEntity('', false);
             }
        }}
        onContextMenu={(e) => {
             e.stopPropagation(); // Stop bubbling
             e.nativeEvent.preventDefault(); // Stop Browser Menu
             spawnMarker(e.point, '#00ff00');
             onRightClickGround(e.point);
        }}
      >
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#4d7c0f" roughness={1} />
      </mesh>
      
      {/* Click Marker */}
      {marker && <ClickMarker key={marker.id} position={marker.pos} color={marker.color} />}

      {/* Ghost Building */}
      {placementMode.active && placementMode.type && hoverPos && (
          <GhostBuilding type={placementMode.type} position={hoverPos} />
      )}

      <gridHelper args={[100, 50, 0x000000, 0x000000]} position={[0, 0.01, 0]} rotation={[0,0,0]}>
         <meshBasicMaterial attach="material" color="black" transparent opacity={0.1} />
      </gridHelper>

      {/* Entities */}
      {entities.map(entity => {
        return (
            <group 
                key={entity.id} 
                onClick={(e) => {
                    e.stopPropagation();
                    onSelectEntity(entity.id, e.shiftKey);
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
        );
      })}
    </>
  );
};
