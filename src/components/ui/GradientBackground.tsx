"use client";

import { motion, AnimatePresence } from "framer-motion";

interface GradientBackgroundProps {
  primaryColor: string;
  secondaryColor: string;
}

export function GradientBackground({ primaryColor, secondaryColor }: GradientBackgroundProps) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Base dark */}
      <div className="absolute inset-0 bg-[#0a0a0f]" />

      {/* Animated gradient blobs */}
      <AnimatePresence mode="sync">
        <motion.div
          key={`${primaryColor}-${secondaryColor}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {/* Top-left blob */}
          <div
            className="absolute -top-1/4 -left-1/4 w-[80%] h-[80%] rounded-full blur-[120px] opacity-30"
            style={{ background: primaryColor }}
          />
          {/* Bottom-right blob */}
          <div
            className="absolute -bottom-1/4 -right-1/4 w-[70%] h-[70%] rounded-full blur-[120px] opacity-25"
            style={{ background: secondaryColor }}
          />
          {/* Center accent */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50%] h-[50%] rounded-full blur-[100px] opacity-15"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
      }} />
    </div>
  );
}
