import React, { useState } from 'react';
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
  TowerControl
} from 'lucide-react';
import { GameState, Entity, UnitType, BuildingType, EntityType } from '../types';
import { COSTS, UNIT_STATS } from '../constants';

interface UIOverlayProps {
  gameState: GameState;
  onTrainUnit: (type: UnitType) => void;
  onBuild: (type: BuildingType) => void;
  onGetLore: (entity: Entity) => void;
  onGetAdvisor: () => void;
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
  };

  return (
    <div className={`w-16 h-16 ${colors[type] || 'bg-gray-500'} rounded border-2 border-gold-500 flex items-center justify-center text-2xl font-bold font-fantasy shadow-inner`}>
      {type[0]}
    </div>
  );
};

export const UIOverlay: React.FC<UIOverlayProps> = ({ 
  gameState, 
  onTrainUnit, 
  onBuild,
  onGetLore,
  onGetAdvisor
}) => {
  // Logic for displaying selection
  const selectedCount = gameState.selection.length;
  const primarySelectionId = gameState.selection[0];
  const selectedEntity = gameState.entities.find(e => e.id === primarySelectionId);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between font-ui text-white">
      
      {/* Top Bar: Resources */}
      <div className="h-12 bg-wood-900 border-b-4 border-gold-600 flex items-center px-4 space-x-8 shadow-lg pointer-events-auto select-none">
        <div className="flex items-center space-x-2 text-gold-400">
          <Coins size={20} />
          <span className="font-bold tracking-wider">{Math.floor(gameState.resources.gold)}</span>
        </div>
        <div className="flex items-center space-x-2 text-green-400">
          <Trees size={20} />
          <span className="font-bold tracking-wider">{Math.floor(gameState.resources.wood)}</span>
        </div>
        <div className="flex items-center space-x-2 text-red-400">
          <Utensils size={20} />
          <span className="font-bold tracking-wider">{gameState.resources.food} / {gameState.resources.maxFood}</span>
        </div>
        <div className="flex items-center space-x-2 text-purple-400 ml-4">
          <Skull size={20} />
          <span className="font-bold tracking-wider">Wave {gameState.wave}</span>
        </div>

        <div className="flex-1 text-center font-fantasy text-gold-500 text-xl tracking-widest opacity-80">
          Realm of Aethelgard
        </div>
        <button 
          onClick={onGetAdvisor}
          className="flex items-center space-x-1 px-3 py-1 bg-purple-900 hover:bg-purple-800 border border-purple-500 rounded text-xs transition-colors"
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
          <div className="flex items-center space-x-2">
              <MousePointer2 size={12} />
              <span>Left Click: Select | Drag: Box Select | Right Click: Action</span>
          </div>
      </div>

      {/* Bottom: Action Panel & Minimap */}
      <div className="h-48 bg-wood-900 border-t-4 border-gold-600 flex pointer-events-auto">
        
        {/* Minimap Placeholder */}
        <div className="w-48 h-full bg-black border-r-4 border-wood-800 relative overflow-hidden">
            <div className="absolute inset-0 bg-green-900 opacity-50"></div>
            {gameState.entities.map(e => {
                if (!e.visible) return null;
                return (
                    <div 
                        key={e.id}
                        className={`absolute w-2 h-2 rounded-full transform -translate-x-1/2 -translate-y-1/2 ${e.selected ? 'ring-2 ring-white z-10' : ''}`}
                        style={{
                            left: `${(e.position.x + 50) / 100 * 100}%`,
                            top: `${(e.position.z + 50) / 100 * 100}%`,
                            backgroundColor: e.type === EntityType.RESOURCE ? 'gold' : (e.faction === 'Player' ? '#3b82f6' : '#ef4444')
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
              
              {/* Stats */}
              <div className="w-full grid grid-cols-2 gap-2 text-xs text-gray-400">
                   {selectedEntity.type === EntityType.UNIT || selectedEntity.subType === BuildingType.TOWER ? (
                       <div className="flex items-center"><Sword size={12} className="mr-1"/> {UNIT_STATS[selectedEntity.subType as UnitType]?.damage || 0} Dmg</div>
                   ) : null}
                  <div className="flex items-center"><ShieldAlert size={12} className="mr-1"/> {Math.floor(selectedEntity.maxHp/100)} Armor</div>
              </div>

              <button 
                onClick={() => onGetLore(selectedEntity)}
                className="mt-auto w-full py-1 bg-stone-700 hover:bg-stone-600 text-xs border border-stone-500 rounded flex items-center justify-center space-x-1"
              >
                  <Scroll size={12} />
                  <span>Read Lore</span>
              </button>
            </>
          ) : (
            <div className="text-gray-500 text-sm italic mt-10">No Selection</div>
          )}
        </div>

        {/* Command Card */}
        <div className="flex-1 bg-stone-900 p-4 grid grid-cols-4 grid-rows-2 gap-2">
            {selectedEntity && selectedEntity.type === EntityType.BUILDING && selectedEntity.subType === BuildingType.TOWN_HALL && (
                 <ActionButton 
                    icon={<Users />} 
                    label="Train Peasant" 
                    cost={COSTS[UnitType.PEASANT]} 
                    onClick={() => onTrainUnit(UnitType.PEASANT)} 
                    disabled={gameState.resources.gold < COSTS[UnitType.PEASANT].gold}
                 />
            )}
            {selectedEntity && selectedEntity.type === EntityType.BUILDING && selectedEntity.subType === BuildingType.BARRACKS && (
                <>
                 <ActionButton 
                    icon={<Sword />} 
                    label="Train Footman" 
                    cost={COSTS[UnitType.FOOTMAN]} 
                    onClick={() => onTrainUnit(UnitType.FOOTMAN)} 
                    disabled={gameState.resources.gold < COSTS[UnitType.FOOTMAN].gold || gameState.resources.wood < COSTS[UnitType.FOOTMAN].wood}
                 />
                 <ActionButton 
                    icon={<Crosshair />} 
                    label="Train Archer" 
                    cost={COSTS[UnitType.ARCHER]} 
                    onClick={() => onTrainUnit(UnitType.ARCHER)} 
                    disabled={gameState.resources.gold < COSTS[UnitType.ARCHER].gold || gameState.resources.wood < COSTS[UnitType.ARCHER].wood}
                 />
                 <ActionButton 
                    icon={<Sword />} 
                    label="Train Knight" 
                    cost={COSTS[UnitType.KNIGHT]} 
                    onClick={() => onTrainUnit(UnitType.KNIGHT)} 
                    disabled={gameState.resources.gold < COSTS[UnitType.KNIGHT].gold}
                 />
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