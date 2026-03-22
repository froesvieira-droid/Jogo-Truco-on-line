import React from 'react';
import { cn, SUIT_SYMBOLS, SUIT_COLORS } from '../utils';
import { Card as CardType } from '../types';
import { motion } from 'motion/react';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  disabled?: boolean;
  hidden?: boolean;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ card, onClick, disabled, hidden, className }) => {
  if (hidden) {
    return (
      <div className={cn(
        "w-16 h-24 bg-blue-800 rounded-lg border-2 border-white flex items-center justify-center shadow-lg",
        className
      )}>
        <div className="w-12 h-20 border border-white/30 rounded flex items-center justify-center">
          <div className="text-white/20 text-2xl font-bold">T</div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={!disabled ? { y: -10 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={cn(
        "w-16 h-24 bg-white rounded-lg border-2 border-gray-300 flex flex-col p-1 shadow-lg cursor-pointer relative",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <div className={cn("text-sm font-bold leading-none", SUIT_COLORS[card.suit])}>
        {card.value}
      </div>
      <div className={cn("text-xs leading-none", SUIT_COLORS[card.suit])}>
        {SUIT_SYMBOLS[card.suit]}
      </div>
      
      <div className={cn("absolute inset-0 flex items-center justify-center text-3xl", SUIT_COLORS[card.suit])}>
        {SUIT_SYMBOLS[card.suit]}
      </div>

      <div className={cn("absolute bottom-1 right-1 rotate-180 flex flex-col items-end", SUIT_COLORS[card.suit])}>
        <div className="text-sm font-bold leading-none">{card.value}</div>
        <div className="text-xs leading-none">{SUIT_SYMBOLS[card.suit]}</div>
      </div>
    </motion.div>
  );
};
