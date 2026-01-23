

import React from 'react';
import { 
  Coins, 
  Trees, 
  Utensils, 
  Sword, 
  Hammer, 
  Users,
  Scroll,
  Sparkles,
  ShieldAlert,
  Skull,
  MousePointer2,
  Crosshair,
  TowerControl,
  Anvil,
  Shield,
  ArrowUp,
  CircleStop,
  Hand,
  Mountain,
  Triangle,
  Hourglass
} from 'lucide-react';
import { GameState, Entity, UnitType, BuildingType, EntityType, Faction, UpgradeType } from '../types';
import { COSTS, UNIT_STATS, MAP_SIZE } from '../constants';

interface UIOverlayProps {
  gameState: GameState;
  timeToNextWave?: number;
  onTrainUnit: (type: UnitType) => void;
  onResearch: (type: UpgradeType) => void;
  onBuild: (type: BuildingType) => void;
  onGetLore: (entity: Entity) => void;
  onGetAdvisor: () => void;
  onCommand: (cmd: 'ATTACK_MOVE' | 'STOP' | 'HOLD' | 'PATROL') => void;
  onMinimapClick: (u: number, v: number) => void;
  onMinimapCommand: (u: number, v: number) => void;
}

const Portrait = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    [UnitType.PEASANT]: 'bg-yellow-200',
    [UnitType.FOOTMAN]: 'bg-blue-300',
    [UnitType.KNIGHT]: 'bg-indigo-400',
    [UnitType.ARCHER]: 'bg-green-300',
    [BuildingType.TOWN_HALL]: 'bg-blue-800',
    [BuildingType.BARRACKS]: 'bg-red-800',
    [BuildingType.FARM]: 'bg-green-700',
    [BuildingType.TOWER]: 'bg-stone-500',
    [BuildingType.BLACKSMITH]: 'bg-stone-700',
  };

  return (
    <div className={`w-16 h-16 ${colors[type] || 'bg-gray-500'} rounded border-2 border-gold-500 flex items-center justify-center text-2xl font-bold font-fantasy shadow-inner`}>
      {type[0]}
    </div>
  );
};

export const UIOverlay: React.FC<UIOverlayProps> = ({ 
  gameState, 
  timeToNextWave,
  onTrainUnit, 
  onResearch,
  onBuild,
  onGetLore,
  onGetAdvisor,
  onCommand,
  onMinimapClick,
  onMinimapCommand
}) => {
  // Logic for displaying selection
  const selectedCount = gameState.selection.length;
  const primarySelectionId = gameState.selection[0];
  const selectedEntity = gameState.entities.find(e => e.id === primarySelectionId);

  const handleMinimapInteraction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    
    if (e.button === 2) {
        onMinimapCommand(u, v);
    } else {
        onMinimapClick(u, v);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between font-ui text-white">
      
      {/* Top Bar: Resources */}
      <div className="h-12 bg-wood-900 border-b-4 border-gold-600 flex items-center px-4 space-x-6 shadow-lg pointer-events-auto select-none overflow-x-auto">
        <div className="flex items-center space-x-2 text-gold-400">
          <Coins size={18} />
          <span className="font-bold tracking-wider">{Math.floor(gameState.resources.gold)}</span>
        </div>
        <div className="flex items-center space-x-2 text-green-400">
          <Trees size={18} />
          <span className="font-bold tracking-wider">{Math.floor(gameState.resources.wood)}</span>
        </div>
         <div className="flex items-center space-x-2 text-gray-400">
          <Mountain size={18} />
          <span className="font-bold tracking-wider">{Math.floor(gameState.resources.stone)}</span>
        </div>
         <div className="flex items-center space-x-2 text-orange-900">
          <Triangle size={18} fill="currentColor" />
          <span className="font-bold tracking-wider text-orange-400">{Math.floor(gameState.resources.iron)}</span>
        </div>

        <div className="w-[1px] h-6 bg-gray-600 mx-2"></div>

        <div className="flex items-center space-x-2 text-red-400">
          <Utensils size={18} />
          <span className="font-bold tracking-wider">{gameState.resources.food} / {gameState.resources.maxFood}</span>
        </div>
        <div className="flex items-center space-x-2 text-purple-400">
          <Skull size={18} />
          <span className="font-bold tracking-wider">Wave {gameState.wave}</span>
        </div>
        {timeToNextWave !== undefined && (
             <div className="flex items-center space-x-1 text-gray-400 text-sm">
                <Hourglass size={14} />
                <span>{timeToNextWave}s</span>
             </div>
        )}

        <div className="flex-1 text-center font-fantasy text-gold-500 text-xl tracking-widest opacity-80 hidden md:block">
          Realm of Aethelgard
        </div>
        <button 
          onClick={onGetAdvisor}
          className="flex items-center space-x-1 px-3 py-1 bg-purple-900 hover:bg-purple-800 border border-purple-500 rounded text-xs transition-colors whitespace-nowrap"
        >
          <Sparkles size={14} />
          <span>Royal Advisor</span>
        </button>
      </div>
      
      {/* Placement Mode Banner */}
      {gameState.placementMode.active && (
          <div className="w-full bg-blue-900/80 text-center py-2 border-b border-blue-500 animate-pulse">
              <span className="text-blue-100 font-bold uppercase tracking-widest">Select Ground to Build (Right Click Cancel)</span>
          </div>
      )}
      {gameState.commandMode.active && (
          <div className="w-full bg-red-900/80 text-center py-2 border-b border-red-500 animate-pulse">
              <span className="text-red-100 font-bold uppercase tracking-widest">Select Target for {gameState.commandMode.type}</span>
          </div>
      )}

      {/* Middle: Notifications/Messages */}
      <div className="flex-1 flex flex-col items-start justify-start p-4 space-y-2 overflow-hidden pointer-events-none">
         {gameState.messages.slice(-5).map(msg => (
           <div key={msg.id} className={`max-w-md bg-black/60 backdrop-blur-sm p-2 rounded border-l-4 ${msg.type === 'lore' ? 'border-purple-500 text-purple-200' : 'border-gold-500 text-gold-100'} animate-fade-in`}>
             <p className="text-sm shadow-black drop-shadow-md">{msg.text}</p>
           </div>
         ))}
      </div>

      {/* Controls Tip */}
      <div className="absolute bottom-52 left-4 bg-black/50 p-2 rounded text-xs text-gray-300 pointer-events-none">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
                <MousePointer2 size={12} />
                <span>Left: Select | Drag: Box | Right: Action/Rally</span>
            </div>
            <div className="flex items-center space-x-2">
                 <span className="font-bold border border-gray-500 px-1 rounded">A</span>
                 <span>Attack Move</span>
                 <span className="font-bold border border-gray-500 px-1 rounded ml-2">P</span>
                 <span>Patrol</span>
                 <span className="font-bold border border-gray-500 px-1 rounded ml-2">H</span>
                 <span>Hold</span>
                 <span className="font-bold border border-gray-500 px-1 rounded ml-2">S</span>
                 <span>Stop</span>
            </div>
          </div>
      </div>

      {/* Bottom: Action Panel & Minimap */}
      <div className="h-48 bg-wood-900 border-t-4 border-gold-600 flex pointer-events-auto">
        
        {/* Interactive Minimap */}
        <div 
            className="w-48 h-full bg-black border-r-4 border-wood-800 relative overflow-hidden cursor-crosshair"
            onPointerDown={(e) => handleMinimapInteraction(e)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
            <div className="absolute inset-0 bg-green-900 opacity-50 pointer-events-none"></div>
            {gameState.entities.map(e => {
                if (!e.visible) return null;
                return (
                    <div 
                        key={e.id}
                        className={`absolute w-2 h-2 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none ${e.selected ? 'ring-2 ring-white z-10' : ''}`}
                        style={{
                            left: `${(e.position.x + (MAP_SIZE/2)) / MAP_SIZE * 100}%`,
                            top: `${(e.position.z + (MAP_SIZE/2)) / MAP_SIZE * 100}%`,
                            backgroundColor: e.type === EntityType.RESOURCE ? 'gold' : (e.faction === Faction.PLAYER ? '#3b82f6' : '#ef4444')
                        }}
                    />
                );
            })}
        </div>

        {/* Selection Info */}
        <div className="w-64 bg-stone-800 p-4 border-r-4 border-wood-800 flex flex-col items-center text-center">
          {selectedCount > 1 ? (
              <div className="flex flex-col items-center justify-center h-full">
                  <div className="text-gold-400 font-fantasy text-xl mb-2">{selectedCount} Units Selected</div>
                  <div className="grid grid-cols-4 gap-1">
                      {gameState.selection.slice(0, 8).map(id => {
                          const ent = gameState.entities.find(e => e.id === id);
                          return ent ? <div key={id} className="w-8 h-8 rounded bg-blue-500 border border-white"></div> : null;
                      })}
                      {selectedCount > 8 && <div className="text-xs text-gray-400 flex items-center justify-center">...</div>}
                  </div>
              </div>
          ) : selectedEntity ? (
            <>
              <div className="flex items-start w-full space-x-4 mb-2">
                <Portrait type={selectedEntity.subType} />
                <div className="text-left flex-1">
                    <h3 className="text-gold-400 font-fantasy text-lg leading-none mb-1">{selectedEntity.name}</h3>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{selectedEntity.subType}</p>
                    <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div className="bg-green-500 h-full" style={{ width: `${(selectedEntity.hp / selectedEntity.maxHp) * 100}%` }}></div>
                    </div>
                    <p className="text-xs mt-1 text-gray-300">{Math.floor(selectedEntity.hp)} / {selectedEntity.maxHp} HP</p>
                </div>
              </div>
              <div className="w-full h-[1px] bg-gray-600 my-2"></div>
              
              {/* Queue Display for Buildings */}
              {selectedEntity.type === EntityType.BUILDING && selectedEntity.productionQueue && selectedEntity.productionQueue.length > 0 && (
                  <div className="w-full mb-2">
                      <div className="text-xs text-left mb-1 text-gold-400">Production: {selectedEntity.productionQueue[0].name}</div>
                      <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mb-1">
                        <div className="bg-blue-500 h-full transition-all duration-100" style={{ width: `${(selectedEntity.productionQueue[0].progress / selectedEntity.productionQueue[0].totalTime) * 100}%` }}></div>
                      </div>
                      <div className="flex space-x-1">
                          {selectedEntity.productionQueue.slice(1).map((item, idx) => (
                              <div key={idx} className="w-6 h-6 bg-gray-700 border border-gray-500 flex items-center justify-center text-[8px]">
                                  {item.name[0]}
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {/* Stats */}
              <div className="w-full grid grid-cols-2 gap-2 text-xs text-gray-400 mt-auto">
                   {selectedEntity.type === EntityType.UNIT || selectedEntity.subType === BuildingType.TOWER ? (
                       <div className="flex items-center"><Sword size={12} className="mr-1"/> {UNIT_STATS[selectedEntity.subType as UnitType]?.damage || 0} Dmg</div>
                   ) : null}
                  <div className="flex items-center"><ShieldAlert size={12} className="mr-1"/> {Math.floor(selectedEntity.maxHp/100)} Armor</div>
              </div>
            </>
          ) : (
            <div className="text-gray-500 text-sm italic mt-10">No Selection</div>
          )}
        </div>

        {/* Command Card */}
        <div className="flex-1 bg-stone-900 p-4 grid grid-cols-4 grid-rows-2 gap-2">
             {/* General Unit Commands */}
             {selectedEntity && selectedEntity.type === EntityType.UNIT && selectedEntity.faction === Faction.PLAYER && (
                 <>
                   <ActionButton 
                      icon={<Crosshair />} 
                      label="Attack (A)" 
                      cost={{gold:0,wood:0}} 
                      onClick={() => onCommand('ATTACK_MOVE')} 
                   />
                   <ActionButton 
                      icon={<CircleStop />} 
                      label="Stop (S)" 
                      cost={{gold:0,wood:0}} 
                      onClick={() => onCommand('STOP')} 
                   />
                   <ActionButton 
                      icon={<Hand />} 
                      label="Hold (H)" 
                      cost={{gold:0,wood:0}} 
                      onClick={() => onCommand('HOLD')} 
                   />
                   <ActionButton 
                      icon={<ArrowUp />} 
                      label="Patrol (P)" 
                      cost={{gold:0,wood:0}} 
                      onClick={() => onCommand('PATROL')} 
                   />
                 </>
             )}

            {/* Town Hall Production */}
            {selectedEntity && selectedEntity.type === EntityType.BUILDING && selectedEntity.subType === BuildingType.TOWN_HALL && (
                 <ActionButton 
                    icon={<Users />} 
                    label="Train Peasant" 
                    cost={COSTS[UnitType.PEASANT]} 
                    onClick={() => onTrainUnit(UnitType.PEASANT)} 
                    disabled={gameState.resources.gold < COSTS[UnitType.PEASANT].gold || gameState.resources.food + (COSTS[UnitType.PEASANT].food || 1) > gameState.resources.maxFood}
                 />
            )}
            
            {/* Barracks Production */}
            {selectedEntity && selectedEntity.type === EntityType.BUILDING && selectedEntity.subType === BuildingType.BARRACKS && (
                <>
                 <ActionButton 
                    icon={<Sword />} 
                    label="Train Footman" 
                    cost={COSTS[UnitType.FOOTMAN]} 
                    onClick={() => onTrainUnit(UnitType.FOOTMAN)} 
                    disabled={gameState.resources.gold < COSTS[UnitType.FOOTMAN].gold || gameState.resources.wood < COSTS[UnitType.FOOTMAN].wood || gameState.resources.food + (COSTS[UnitType.FOOTMAN].food || 1) > gameState.resources.maxFood}
                 />
                 <ActionButton 
                    icon={<Crosshair />} 
                    label="Train Archer" 
                    cost={COSTS[UnitType.ARCHER]} 
                    onClick={() => onTrainUnit(UnitType.ARCHER)} 
                    disabled={gameState.resources.gold < COSTS[UnitType.ARCHER].gold || gameState.resources.wood < COSTS[UnitType.ARCHER].wood || gameState.resources.food + (COSTS[UnitType.ARCHER].food || 1) > gameState.resources.maxFood}
                 />
                 <ActionButton 
                    icon={<Sword />} 
                    label="Train Knight" 
                    cost={COSTS[UnitType.KNIGHT]} 
                    onClick={() => onTrainUnit(UnitType.KNIGHT)} 
                    disabled={gameState.resources.gold < COSTS[UnitType.KNIGHT].gold || gameState.resources.food + (COSTS[UnitType.KNIGHT].food || 1) > gameState.resources.maxFood}
                 />
                </>
            )}

            {/* Blacksmith Research */}
            {selectedEntity && selectedEntity.type === EntityType.BUILDING && selectedEntity.subType === BuildingType.BLACKSMITH && (
                <>
                 {!gameState.upgrades[UpgradeType.IRON_SWORDS] && (
                   <ActionButton 
                      icon={<Sword />} 
                      label="Iron Swords" 
                      cost={COSTS[UpgradeType.IRON_SWORDS]} 
                      onClick={() => onResearch(UpgradeType.IRON_SWORDS)} 
                      disabled={gameState.resources.gold < COSTS[UpgradeType.IRON_SWORDS].gold}
                   />
                 )}
                 {!gameState.upgrades[UpgradeType.STEEL_ARROWS] && (
                   <ActionButton 
                      icon={<Crosshair />} 
                      label="Steel Arrows" 
                      cost={COSTS[UpgradeType.STEEL_ARROWS]} 
                      onClick={() => onResearch(UpgradeType.STEEL_ARROWS)} 
                      disabled={gameState.resources.gold < COSTS[UpgradeType.STEEL_ARROWS].gold}
                   />
                 )}
                 {!gameState.upgrades[UpgradeType.LEATHER_ARMOR] && (
                   <ActionButton 
                      icon={<Shield />} 
                      label="Leather Armor" 
                      cost={COSTS[UpgradeType.LEATHER_ARMOR]} 
                      onClick={() => onResearch(UpgradeType.LEATHER_ARMOR)} 
                      disabled={gameState.resources.gold < COSTS[UpgradeType.LEATHER_ARMOR].gold}
                   />
                 )}
                 {!gameState.upgrades[UpgradeType.PLATE_ARMOR] && (
                   <ActionButton 
                      icon={<ShieldAlert />} 
                      label="Plate Armor" 
                      cost={COSTS[UpgradeType.PLATE_ARMOR]} 
                      onClick={() => onResearch(UpgradeType.PLATE_ARMOR)} 
                      disabled={gameState.resources.gold < COSTS[UpgradeType.PLATE_ARMOR].gold}
                   />
                 )}
                </>
            )}
            
            {/* Peasant Build Menu */}
            {selectedEntity && selectedEntity.type === EntityType.UNIT && selectedEntity.subType === UnitType.PEASANT && (
                <>
                 <ActionButton 
                    icon={<Hammer />} 
                    label="Build Barracks" 
                    cost={COSTS[BuildingType.BARRACKS]} 
                    onClick={() => onBuild(BuildingType.BARRACKS)} 
                    disabled={gameState.resources.gold < COSTS[BuildingType.BARRACKS].gold}
                 />
                  <ActionButton 
                    icon={<Hammer />} 
                    label="Build Farm" 
                    cost={COSTS[BuildingType.FARM]} 
                    onClick={() => onBuild(BuildingType.FARM)} 
                    disabled={gameState.resources.gold < COSTS[BuildingType.FARM].gold}
                 />
                 <ActionButton 
                    icon={<TowerControl />} 
                    label="Build Tower" 
                    cost={COSTS[BuildingType.TOWER]} 
                    onClick={() => onBuild(BuildingType.TOWER)} 
                    disabled={gameState.resources.gold < COSTS[BuildingType.TOWER].gold || gameState.resources.wood < COSTS[BuildingType.TOWER].wood}
                 />
                 <ActionButton 
                    icon={<Anvil />} 
                    label="Blacksmith" 
                    cost={COSTS[BuildingType.BLACKSMITH]} 
                    onClick={() => onBuild(BuildingType.BLACKSMITH)} 
                    disabled={gameState.resources.gold < COSTS[BuildingType.BLACKSMITH].gold || gameState.resources.wood < COSTS[BuildingType.BLACKSMITH].wood}
                 />
                </>
            )}
        </div>
      </div>
    </div>
  );
};

const ActionButton = ({ icon, label, cost, onClick, disabled }: any) => (
    <button 
        onClick={onClick}
        disabled={disabled}
        className={`
            relative group flex flex-col items-center justify-center p-2 rounded border-2 
            ${disabled ? 'border-gray-700 bg-gray-800 text-gray-600 cursor-not-allowed' : 'border-gold-600 bg-stone-800 hover:bg-stone-700 text-gold-400 cursor-pointer shadow-lg active:scale-95'}
            transition-all
        `}
    >
        {icon}
        <span className="text-[10px] mt-1 font-bold uppercase">{label}</span>
        
        {/* Tooltip */}
        <div className="absolute bottom-full mb-2 hidden group-hover:block w-32 bg-black border border-gold-500 p-2 text-xs text-white z-50">
            <div className="font-bold mb-1">{label}</div>
            <div className="text-gold-400">Gold: {cost.gold}</div>
            {cost.wood > 0 && <div className="text-green-400">Wood: {cost.wood}</div>}
            <div className="text-gray-400">Food: {cost.food || 0}</div>
        </div>
    </button>
);