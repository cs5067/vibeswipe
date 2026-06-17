"use client";

import { motion } from "framer-motion";

interface ActionButtonsProps {
  onSkip: () => void;
  onLike: () => void;
  disabled?: boolean;
}

export function ActionButtons({ onSkip, onLike, disabled }: ActionButtonsProps) {
  return (
    <div className="flex items-center justify-center gap-8">
      {/* Skip button */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        whileHover={{ scale: 1.05 }}
        onClick={onSkip}
        disabled={disabled}
        className="w-16 h-16 rounded-full bg-white/5 border border-red-400/30 flex items-center justify-center
                   hover:bg-red-400/10 hover:border-red-400/50 transition-colors disabled:opacity-30"
      >
        <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </motion.button>

      {/* Like button */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        whileHover={{ scale: 1.05 }}
        onClick={onLike}
        disabled={disabled}
        className="w-16 h-16 rounded-full bg-white/5 border border-green-400/30 flex items-center justify-center
                   hover:bg-green-400/10 hover:border-green-400/50 transition-colors disabled:opacity-30"
      >
        <svg className="w-7 h-7 text-green-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </motion.button>
    </div>
  );
}
