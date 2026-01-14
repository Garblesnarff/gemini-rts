import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Entity, UnitType, BuildingType, ResourceType, Faction } from '../types';
import { COLORS } from '../constants';

interface EntityProps {
  entity: Entity;
}

const HealthBar = ({ hp, maxHp }: { hp: number; maxHp: number }) => {
  return (
    <Html position={[0, 2.5, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
      <div className="w-16 h-2 bg-gray-900 border border-gray-700 rounded-sm overflow-hidden">
        <div 
          className="h-full bg-green-500 transition-all duration-300" 
          style={{ width: `${Math.max(0, (hp / maxHp) * 100)}%` }}
        />
      </div>
    </Html>
  );
};

export const Unit3D: React.FC<EntityProps> = ({ entity }) => {
  const meshRef = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      const currentPos = meshRef.current.position;
      const targetX = entity.position.x;
      const targetZ = entity.position.z;
      
      currentPos.x = THREE.MathUtils.lerp(currentPos.x, targetX, 10 * delta);
      currentPos.z = THREE.MathUtils.lerp(currentPos.z, targetZ, 10 * delta);
      
      if ((entity.targetPos && entity.state === 'moving') || (entity.state === 'gathering' || entity.state === 'returning')) {
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
    if (entity.subType === UnitType.PEASANT) return <cylinderGeometry args={[0.4, 0.4, 1.2, 8]} />;
    if (entity.subType === UnitType.FOOTMAN) return <capsuleGeometry args={[0.5, 1, 4, 8]} />;
    if (entity.subType === UnitType.KNIGHT) return <boxGeometry args={[0.8, 1.5, 1.2]} />;
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
          <ringGeometry args={[0.8, 1, 32]} />
          <meshBasicMaterial color={COLORS.SELECTION} opacity={0.6} transparent side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Body */}
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        {geometry}
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      
      {/* Head/Helmet Detail */}
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshStandardMaterial color="#fca5a5" />
      </mesh>

      {/* Weapon/Tool (Procedural) */}
      <mesh position={[0.5, 0.8, 0.3]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.1, 0.1, 0.8]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>

      {/* Carried Resource Visual */}
      {entity.carryAmount && entity.carryAmount > 0 && (
          <group position={[0, 0.8, -0.4]}>
              {entity.carryType === ResourceType.GOLD ? (
                  <mesh>
                      <sphereGeometry args={[0.3, 8, 8]} />
                      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.2} />
                  </mesh>
              ) : (
                  <mesh rotation={[0, 0, Math.PI / 2]}>
                       <cylinderGeometry args={[0.1, 0.1, 0.8, 6]} />
                       <meshStandardMaterial color="#5D4037" />
                  </mesh>
              )}
          </group>
      )}

      <HealthBar hp={entity.hp} maxHp={entity.maxHp} />
    </group>
  );
};

export const Building3D: React.FC<EntityProps> = ({ entity }) => {
  const isTownHall = entity.subType === BuildingType.TOWN_HALL;
  
  return (
    <group position={[entity.position.x, entity.position.y, entity.position.z]}>
      {entity.selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[2.2, 2.5, 32]} />
          <meshBasicMaterial color={COLORS.SELECTION} opacity={0.6} transparent side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Base */}
      <mesh position={[0, 1, 0]} castShadow receiveShadow>
        <boxGeometry args={[isTownHall ? 4 : 3, 2, isTownHall ? 4 : 3]} />
        <meshStandardMaterial color={entity.faction === Faction.PLAYER ? "#1e3a8a" : "#7f1d1d"} />
      </mesh>

      {/* Roof */}
      <mesh position={[0, 2.5, 0]} castShadow>
        <coneGeometry args={[isTownHall ? 3 : 2.5, 2, 4]} rotation={[0, Math.PI/4, 0]} />
        <meshStandardMaterial color="#78350f" />
      </mesh>

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
            {/* Trunk */}
            <mesh position={[0, 1, 0]} castShadow>
                <cylinderGeometry args={[0.3, 0.4, 2, 6]} />
                <meshStandardMaterial color="#3e2723" />
            </mesh>
            {/* Leaves */}
            <mesh position={[0, 2.5, 0]} castShadow>
                <coneGeometry args={[1.5, 2.5, 8]} />
                <meshStandardMaterial color="#166534" />
            </mesh>
        </group>
      )}
    </group>
  );
};