import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Entity, UnitType, BuildingType, ResourceType, Faction, Projectile, FloatingText } from '../types';
import { COLORS } from '../constants';

interface EntityProps {
  entity: Entity;
}

const HealthBar = ({ hp, maxHp }: { hp: number; maxHp: number }) => {
  return (
    <Html position={[0, 3, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
      <div className="w-12 h-1.5 bg-gray-900 border border-gray-700 rounded-sm overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-green-500 to-green-400" 
          style={{ width: `${Math.max(0, (hp / maxHp) * 100)}%` }}
        />
      </div>
    </Html>
  );
};

export const FloatingText3D: React.FC<{ data: FloatingText }> = ({ data }) => {
    return (
        <group position={[data.position.x, data.position.y + 2 + (1 - data.life) * 2, data.position.z]}>
             <Html center style={{ pointerEvents: 'none' }}>
                <span style={{ 
                    color: data.color, 
                    fontWeight: 'bold', 
                    fontSize: '16px', 
                    textShadow: '1px 1px 2px black',
                    opacity: data.life 
                }}>
                    {data.text}
                </span>
            </Html>
        </group>
    );
}

export const Projectile3D: React.FC<{ data: Projectile, startPos: any, endPos: any }> = ({ data, startPos, endPos }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    
    useFrame(() => {
        if(meshRef.current) {
            // Lerp position based on progress
            meshRef.current.position.x = THREE.MathUtils.lerp(startPos.x, endPos.x, data.progress);
            meshRef.current.position.y = THREE.MathUtils.lerp(startPos.y + 1, endPos.y + 1, data.progress) + Math.sin(data.progress * Math.PI) * 2; // Arc
            meshRef.current.position.z = THREE.MathUtils.lerp(startPos.z, endPos.z, data.progress);
            
            meshRef.current.lookAt(endPos.x, endPos.y, endPos.z);
        }
    });

    return (
        <mesh ref={meshRef}>
            <coneGeometry args={[0.05, 0.4, 8]} rotation={[Math.PI/2, 0, 0]}/>
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
        </mesh>
    );
};

export const Unit3D: React.FC<EntityProps> = ({ entity }) => {
  const meshRef = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      const currentPos = meshRef.current.position;
      const targetX = entity.position.x;
      const targetZ = entity.position.z;
      
      // Interpolate position for smooth movement
      currentPos.x = THREE.MathUtils.lerp(currentPos.x, targetX, 15 * delta);
      currentPos.z = THREE.MathUtils.lerp(currentPos.z, targetZ, 15 * delta);
      
      // Rotation logic
      if ((entity.targetPos && entity.state === 'moving') || entity.state === 'gathering' || entity.state === 'returning' || entity.state === 'attacking') {
          // If attacking, look at target (need target pos, but for now we look at movement or keep rotation)
          // For simple RTS, looking in movement dir is usually fine, or update rotation based on targetId in game loop
          const dx = targetX - currentPos.x;
          const dz = targetZ - currentPos.z;
          if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
              const angle = Math.atan2(dx, dz);
              meshRef.current.rotation.y = angle;
          }
      }
    }
  });

  const color = entity.faction === Faction.PLAYER ? COLORS.PLAYER : COLORS.ENEMY;

  const geometry = useMemo(() => {
    if (entity.subType === UnitType.PEASANT) return <cylinderGeometry args={[0.3, 0.3, 1, 8]} />;
    if (entity.subType === UnitType.FOOTMAN) return <capsuleGeometry args={[0.4, 1, 4, 8]} />;
    if (entity.subType === UnitType.KNIGHT) return <boxGeometry args={[0.8, 1.4, 1.2]} />;
    if (entity.subType === UnitType.ARCHER) return <cylinderGeometry args={[0.2, 0.3, 1.1, 6]} />; // Slimmer
    return <boxGeometry args={[0.5, 1, 0.5]} />;
  }, [entity.subType]);

  return (
    <group 
      ref={meshRef} 
      position={[entity.position.x, entity.position.y, entity.position.z]}
    >
      {/* Selection Ring */}
      {entity.selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.6, 0.7, 32]} />
          <meshBasicMaterial color={COLORS.SELECTION} opacity={0.8} transparent side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Body */}
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        {geometry}
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshStandardMaterial color="#fca5a5" />
      </mesh>

      {/* Accessories */}
      {entity.subType === UnitType.ARCHER && (
           <mesh position={[0, 0.8, 0]} rotation={[0,0,Math.PI/4]}>
               <torusGeometry args={[0.4, 0.05, 4, 8, Math.PI]} />
               <meshStandardMaterial color="#5D4037" />
           </mesh>
      )}

      {entity.subType === UnitType.FOOTMAN && (
           <mesh position={[-0.4, 0.8, 0.2]} rotation={[0,0,0]}>
               <boxGeometry args={[0.1, 0.6, 0.6]} />
               <meshStandardMaterial color="#94a3b8" />
           </mesh>
      )}

      {/* Carried Resource */}
      {entity.carryAmount && entity.carryAmount > 0 && (
          <group position={[0, 1.6, 0]}>
               <mesh>
                   <sphereGeometry args={[0.2, 8, 8]} />
                   <meshStandardMaterial color={entity.carryType === ResourceType.GOLD ? "#fbbf24" : "#5D4037"} />
               </mesh>
          </group>
      )}

      <HealthBar hp={entity.hp} maxHp={entity.maxHp} />
    </group>
  );
};

export const Building3D: React.FC<EntityProps> = ({ entity }) => {
  const isTownHall = entity.subType === BuildingType.TOWN_HALL;
  const isTower = entity.subType === BuildingType.TOWER;
  
  return (
    <group position={[entity.position.x, entity.position.y, entity.position.z]}>
      {entity.selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[isTower ? 1.2 : 2.2, isTower ? 1.5 : 2.5, 32]} />
          <meshBasicMaterial color={COLORS.SELECTION} opacity={0.6} transparent side={THREE.DoubleSide} />
        </mesh>
      )}

      {isTower ? (
        <group>
            {/* Tower Base */}
            <mesh position={[0, 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.8, 1.2, 4, 6]} />
                <meshStandardMaterial color="#44403c" />
            </mesh>
             {/* Tower Top */}
            <mesh position={[0, 4.2, 0]} castShadow>
                <cylinderGeometry args={[1.2, 0.8, 1, 6]} />
                <meshStandardMaterial color={entity.faction === Faction.PLAYER ? "#1e3a8a" : "#7f1d1d"} />
            </mesh>
        </group>
      ) : (
        <group>
             {/* Standard Building Base */}
            <mesh position={[0, 1, 0]} castShadow receiveShadow>
                <boxGeometry args={[isTownHall ? 4 : 3, 2, isTownHall ? 4 : 3]} />
                <meshStandardMaterial color={entity.faction === Faction.PLAYER ? "#1e3a8a" : "#7f1d1d"} />
            </mesh>
            {/* Roof */}
            <mesh position={[0, 2.5, 0]} castShadow>
                <coneGeometry args={[isTownHall ? 3 : 2.5, 2, 4]} rotation={[0, Math.PI/4, 0]} />
                <meshStandardMaterial color="#78350f" />
            </mesh>
        </group>
      )}

      <HealthBar hp={entity.hp} maxHp={entity.maxHp} />
    </group>
  );
};

export const Resource3D: React.FC<EntityProps> = ({ entity }) => {
  const isGold = entity.subType === ResourceType.GOLD;

  return (
    <group position={[entity.position.x, entity.position.y, entity.position.z]}>
       {entity.selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[1.5, 1.8, 32]} />
          <meshBasicMaterial color="white" opacity={0.5} transparent side={THREE.DoubleSide} />
        </mesh>
      )}

      {isGold ? (
        <mesh position={[0, 0.5, 0]} castShadow>
          <dodecahedronGeometry args={[1.2, 0]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} emissive="#f59e0b" emissiveIntensity={0.2} />
        </mesh>
      ) : (
        <group>
            <mesh position={[0, 1, 0]} castShadow>
                <cylinderGeometry args={[0.3, 0.4, 2, 6]} />
                <meshStandardMaterial color="#3e2723" />
            </mesh>
            <mesh position={[0, 2.5, 0]} castShadow>
                <coneGeometry args={[1.5, 2.5, 8]} />
                <meshStandardMaterial color="#166534" />
            </mesh>
        </group>
      )}
    </group>
  );
};