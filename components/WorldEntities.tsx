import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { Entity, UnitType, BuildingType, ResourceType, Faction, Projectile, FloatingText, Position } from '../types';
import { COLORS } from '../constants';

interface EntityProps {
  entity: Entity;
}

// --- Shared Geometries ---
// Reusing geometries reduces GPU memory overhead and setup time
const PEASANT_GEO = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
const FOOTMAN_GEO = new THREE.CapsuleGeometry(0.4, 1, 4, 8);
const KNIGHT_GEO = new THREE.BoxGeometry(0.8, 1.4, 1.2);
const ARCHER_GEO = new THREE.CylinderGeometry(0.2, 0.3, 1.1, 6);
const DEFAULT_UNIT_GEO = new THREE.BoxGeometry(0.5, 1, 0.5);

// Adjust pivots if necessary by translating geometry, or handle in mesh position
PEASANT_GEO.translate(0, 0, 0); 

const HealthBar = ({ hp, maxHp }: { hp: number; maxHp: number }) => {
  const healthPct = Math.max(0, hp / maxHp);
  const width = 1.2;
  const height = 0.15;

  // Optimized: Use simple meshes in a Billboard instead of HTML overlay
  return (
    <Billboard position={[0, 3.5, 0]}>
        <mesh position={[0, 0, 0]}>
            <planeGeometry args={[width + 0.05, height + 0.05]} />
            <meshBasicMaterial color="black" />
        </mesh>
        <mesh position={[(-width + (width * healthPct)) / 2, 0, 0.01]}>
            <planeGeometry args={[width * healthPct, height]} />
            <meshBasicMaterial color={healthPct > 0.5 ? "#22c55e" : "#ef4444"} />
        </mesh>
    </Billboard>
  );
};

export const RallyPoint3D: React.FC<{ pos: Position }> = ({ pos }) => {
  return (
    <group position={[pos.x, 0, pos.z]}>
      {/* Flag Pole */}
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 2]} />
        <meshStandardMaterial color="#854d0e" />
      </mesh>
      {/* Flag Cloth */}
      <mesh position={[0.4, 1.6, 0]} rotation={[0, 0, 0]}>
         <boxGeometry args={[0.8, 0.5, 0.05]} />
         <meshStandardMaterial color={COLORS.RALLY} />
      </mesh>
      {/* Base Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
          <ringGeometry args={[0.3, 0.4, 16]} />
          <meshBasicMaterial color={COLORS.RALLY} opacity={0.6} transparent />
      </mesh>
    </group>
  );
};

export const FloatingText3D: React.FC<{ data: FloatingText }> = ({ data }) => {
    // Optimized: Use Drei Text instead of HTML
    return (
        <Billboard position={[data.position.x, data.position.y + 2 + (1 - data.life) * 3, data.position.z]}>
             <Text
                fontSize={0.8}
                color={data.color}
                outlineWidth={0.05}
                outlineColor="black"
                fillOpacity={data.life} // Fade out
                outlineOpacity={data.life}
                characters="0123456789+-"
             >
                {data.text}
             </Text>
        </Billboard>
    );
}

export const Projectile3D: React.FC<{ data: Projectile, startPos: any, endPos: any }> = ({ data, startPos, endPos }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const isCannonball = data.splash;
    
    useFrame(() => {
        if(meshRef.current) {
            meshRef.current.position.x = THREE.MathUtils.lerp(startPos.x, endPos.x, data.progress);
            const arcHeight = isCannonball ? 4 : 2;
            meshRef.current.position.y = THREE.MathUtils.lerp(startPos.y + 1, endPos.y + 1, data.progress) + Math.sin(data.progress * Math.PI) * arcHeight;
            meshRef.current.position.z = THREE.MathUtils.lerp(startPos.z, endPos.z, data.progress);
            meshRef.current.lookAt(endPos.x, endPos.y, endPos.z);
        }
    });

    return (
        <mesh ref={meshRef}>
            {isCannonball ? (
                <>
                    <sphereGeometry args={[0.3, 8, 8]} />
                    <meshStandardMaterial color="#1c1917" metalness={0.8} roughness={0.3} />
                </>
            ) : (
                <>
                    <coneGeometry args={[0.05, 0.4, 8]} rotation={[Math.PI/2, 0, 0]}/>
                    <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
                </>
            )}
        </mesh>
    );
};

export const Unit3D: React.FC<EntityProps> = ({ entity }) => {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  
  // Use Shared Geometry
  const geometry = useMemo(() => {
    if (entity.subType === UnitType.PEASANT) return PEASANT_GEO;
    if (entity.subType === UnitType.FOOTMAN) return FOOTMAN_GEO;
    if (entity.subType === UnitType.KNIGHT) return KNIGHT_GEO;
    if (entity.subType === UnitType.ARCHER) return ARCHER_GEO; 
    return DEFAULT_UNIT_GEO;
  }, [entity.subType]);

  useFrame((state, delta) => {
    // 1. Position Interpolation
    if (groupRef.current) {
      const currentPos = groupRef.current.position;
      const targetX = entity.position.x;
      const targetZ = entity.position.z;
      
      currentPos.x = THREE.MathUtils.lerp(currentPos.x, targetX, 15 * delta);
      currentPos.z = THREE.MathUtils.lerp(currentPos.z, targetZ, 15 * delta);
      
      // Face direction of movement
      if ((entity.targetPos && entity.state === 'moving') || entity.state === 'gathering' || entity.state === 'returning' || entity.state === 'attacking') {
          const dx = targetX - currentPos.x;
          const dz = targetZ - currentPos.z;
          if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
              const angle = Math.atan2(dx, dz);
              groupRef.current.rotation.y = angle;
          }
      }
    }

    // 2. Procedural Walking Animation (Bobbing / Swaying)
    if (bodyRef.current) {
        if (entity.state === 'moving' || entity.state === 'gathering' || entity.state === 'returning' || (entity.state === 'attacking' && !entity.holdPosition)) {
            const speed = 15;
            const bounce = Math.abs(Math.sin(state.clock.elapsedTime * speed)) * 0.1;
            const sway = Math.sin(state.clock.elapsedTime * speed) * 0.05;
            
            bodyRef.current.position.y = 0.6 + bounce;
            bodyRef.current.rotation.z = sway;
        } else {
            // Return to rest
            bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, 0.6, 5 * delta);
            bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, 0, 5 * delta);
        }
    }

    // 3. Damage Flash
    if (materialRef.current) {
        const timeSinceDamage = Date.now() - (entity.lastDamagedAt || 0);
        if (timeSinceDamage < 150) {
            materialRef.current.emissive.setHex(0xffffff);
            materialRef.current.emissiveIntensity = 0.5;
        } else {
            materialRef.current.emissive.setHex(0x000000);
            materialRef.current.emissiveIntensity = 0;
        }
    }
  });

  // Handle visibility check within the return to avoid breaking hook order
  if (!entity.visible && entity.faction !== Faction.PLAYER) return null;

  const color = entity.faction === Faction.PLAYER ? COLORS.PLAYER : COLORS.ENEMY;

  return (
    <group 
      ref={groupRef} 
      position={[entity.position.x, entity.position.y, entity.position.z]}
    >
      {entity.selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.6, 0.7, 32]} />
          <meshBasicMaterial color={COLORS.SELECTION} opacity={0.8} transparent side={THREE.DoubleSide} />
        </mesh>
      )}

      {entity.holdPosition && entity.faction === Faction.PLAYER && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
             <ringGeometry args={[0.5, 0.55, 16]} />
             <meshBasicMaterial color="orange" opacity={0.8} transparent />
          </mesh>
      )}

      {/* Animated Body */}
      <mesh ref={bodyRef} position={[0, 0.6, 0]} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial ref={materialRef} color={color} roughness={0.7} />
      </mesh>
      
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshStandardMaterial color="#fca5a5" />
      </mesh>

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

      {entity.carryAmount && entity.carryAmount > 0 && (
          <group position={[0, 1.6, 0]}>
               <mesh>
                   <sphereGeometry args={[0.2, 8, 8]} />
                   <meshStandardMaterial 
                      color={
                        entity.carryType === ResourceType.GOLD ? "#fbbf24" : 
                        entity.carryType === ResourceType.IRON ? "#78350f" : 
                        entity.carryType === ResourceType.STONE ? "#6b7280" : 
                        "#5D4037"
                      } 
                   />
               </mesh>
          </group>
      )}

      {(entity.selected || entity.hp < entity.maxHp) && (
          <HealthBar hp={entity.hp} maxHp={entity.maxHp} />
      )}
    </group>
  );
};

export const Building3D: React.FC<EntityProps> = ({ entity }) => {
  const isTownHall = entity.subType === BuildingType.TOWN_HALL;
  const isTower = entity.subType === BuildingType.TOWER;
  const isCannonTower = entity.subType === BuildingType.CANNON_TOWER;
  const isBlacksmith = entity.subType === BuildingType.BLACKSMITH;
  const isLumberMill = entity.subType === BuildingType.LUMBER_MILL;
  const isStable = entity.subType === BuildingType.STABLE;
  const isTemple = entity.subType === BuildingType.TEMPLE;
  const isWall = entity.subType === BuildingType.WALL;
  
  if (!entity.visible && entity.faction !== Faction.PLAYER) return null;

  return (
    <group position={[entity.position.x, entity.position.y, entity.position.z]}>
      {entity.selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[isTower || isCannonTower || isWall ? 1.2 : 2.2, isTower || isCannonTower || isWall ? 1.5 : 2.5, 32]} />
          <meshBasicMaterial color={COLORS.SELECTION} opacity={0.6} transparent side={THREE.DoubleSide} />
        </mesh>
      )}

      {isCannonTower ? (
        <group>
            {/* Wider, squatter base */}
            <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[1.5, 2.0, 3, 8]} />
                <meshStandardMaterial color="#44403c" />
            </mesh>
            {/* Cannon barrel */}
            <mesh position={[0, 2.5, 1.2]} rotation={[Math.PI/6, 0, 0]} castShadow>
                <cylinderGeometry args={[0.3, 0.4, 2, 8]} />
                <meshStandardMaterial color="#1c1917" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Platform top */}
            <mesh position={[0, 3.2, 0]} castShadow>
                <cylinderGeometry args={[1.8, 1.5, 0.5, 8]} />
                <meshStandardMaterial color={entity.faction === Faction.PLAYER ? "#1e3a8a" : "#7f1d1d"} />
            </mesh>
        </group>
      ) : isTower ? (
        <group>
            <mesh position={[0, 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.8, 1.2, 4, 6]} />
                <meshStandardMaterial color="#44403c" />
            </mesh>
            <mesh position={[0, 4.2, 0]} castShadow>
                <cylinderGeometry args={[1.2, 0.8, 1, 6]} />
                <meshStandardMaterial color={entity.faction === Faction.PLAYER ? "#1e3a8a" : "#7f1d1d"} />
            </mesh>
        </group>
      ) : isBlacksmith ? (
        <group>
            <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[3, 3, 3]} />
                <meshStandardMaterial color="#292524" roughness={0.9} />
            </mesh>
            <mesh position={[0.8, 3.5, 0.8]}>
                <cylinderGeometry args={[0.4, 0.6, 2, 8]} />
                <meshStandardMaterial color="#1c1917" />
            </mesh>
             <mesh position={[0, 4, 0]}>
                <points>
                   <bufferGeometry>
                       <bufferAttribute attach="attributes-position" count={1} array={new Float32Array([0,0,0])} itemSize={3} />
                   </bufferGeometry>
                   <pointsMaterial color="orange" size={0.5} />
                </points>
            </mesh>
        </group>
      ) : isLumberMill ? (
        <group>
            {/* Base */}
            <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
                <boxGeometry args={[3, 2, 3]} />
                <meshStandardMaterial color="#3f2e21" />
            </mesh>
            {/* Sloped Roof */}
            <mesh position={[0, 2.5, 0]} castShadow>
                <cylinderGeometry args={[0, 2.2, 1.5, 4]} rotation={[0, Math.PI/4, 0]} />
                <meshStandardMaterial color="#5d4037" />
            </mesh>
            {/* Log Pile */}
            <mesh position={[1.5, 0.2, 1.5]} rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.2, 0.2, 2, 8]} />
                <meshStandardMaterial color="#5d4037" />
            </mesh>
            <mesh position={[1.8, 0.2, 1.5]} rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.2, 0.2, 2, 8]} />
                <meshStandardMaterial color="#5d4037" />
            </mesh>
        </group>
      ) : isStable ? (
        <group>
            {/* Wider structure */}
            <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
                <boxGeometry args={[4, 2, 3]} />
                <meshStandardMaterial color="#574835" />
            </mesh>
            {/* Roof */}
            <mesh position={[0, 2.5, 0]} castShadow>
                <coneGeometry args={[3.5, 1.5, 4]} rotation={[0, Math.PI/4, 0]} />
                <meshStandardMaterial color="#d4b996" />
            </mesh>
            <mesh position={[0, 0.5, 1.6]}>
                <boxGeometry args={[3, 1, 0.2]} />
                <meshStandardMaterial color="#3e2723" />
            </mesh>
        </group>
      ) : isTemple ? (
        <group>
             {/* Cylinder base */}
             <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[2, 2.2, 3, 8]} />
                <meshStandardMaterial color="#e5e7eb" />
             </mesh>
             {/* Dome */}
             <mesh position={[0, 3, 0]} castShadow>
                <sphereGeometry args={[2, 16, 8, 0, Math.PI * 2, 0, Math.PI/2]} />
                <meshStandardMaterial color="#fcd34d" metalness={0.3} roughness={0.2} />
             </mesh>
             <pointLight position={[0, 4, 0]} color="gold" intensity={0.5} distance={5} />
        </group>
      ) : isWall ? (
        <group>
            <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
                <boxGeometry args={[2, 2.5, 0.5]} />
                <meshStandardMaterial color="#57534e" roughness={0.9} />
            </mesh>
        </group>
      ) : (
        <group>
            <mesh position={[0, 1, 0]} castShadow receiveShadow>
                <boxGeometry args={[isTownHall ? 4 : 3, 2, isTownHall ? 4 : 3]} />
                <meshStandardMaterial color={entity.faction === Faction.PLAYER ? "#1e3a8a" : "#7f1d1d"} />
            </mesh>
            <mesh position={[0, 2.5, 0]} castShadow>
                <coneGeometry args={[isTownHall ? 3 : 2.5, 2, 4]} rotation={[0, Math.PI/4, 0]} />
                <meshStandardMaterial color="#78350f" />
            </mesh>
        </group>
      )}

      {(entity.selected || entity.hp < entity.maxHp) && (
          <HealthBar hp={entity.hp} maxHp={entity.maxHp} />
      )}
    </group>
  );
};

export const Resource3D: React.FC<EntityProps> = ({ entity }) => {
  const isGold = entity.subType === ResourceType.GOLD;
  const isStone = entity.subType === ResourceType.STONE;
  const isIron = entity.subType === ResourceType.IRON;

  if (!entity.visible) return null;

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
      ) : isStone ? (
        <group>
            {/* Stone Quarry Visual: Cluster of grey rocks */}
            <mesh position={[-0.5, 0.6, 0]} castShadow>
                <dodecahedronGeometry args={[0.8, 0]} />
                <meshStandardMaterial color="#6b7280" roughness={0.9} />
            </mesh>
            <mesh position={[0.6, 0.4, 0.4]} castShadow rotation={[0, 1, 0]}>
                <dodecahedronGeometry args={[0.6, 0]} />
                <meshStandardMaterial color="#4b5563" roughness={0.9} />
            </mesh>
            <mesh position={[0.2, 0.5, -0.6]} castShadow rotation={[1, 0, 0]}>
                <icosahedronGeometry args={[0.5, 0]} />
                <meshStandardMaterial color="#9ca3af" roughness={0.9} />
            </mesh>
        </group>
      ) : isIron ? (
        <group>
             {/* Iron Deposit: Angular, metallic, rust colored */}
            <mesh position={[0, 0.8, 0]} castShadow>
                <octahedronGeometry args={[1.2, 0]} />
                <meshStandardMaterial color="#78350f" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 1.0, 0]}>
                <pointLight distance={3} intensity={0.5} color="#f97316" />
            </mesh>
        </group>
      ) : (
        <group>
            {/* Tree */}
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