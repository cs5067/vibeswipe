import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ActionButtonsProps {
  onSkip: () => void;
  onLike: () => void;
  onSave: () => void;
  disabled?: boolean;
}

export function ActionButtons({ onSkip, onLike, onSave, disabled }: ActionButtonsProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, styles.skipButton, disabled && styles.disabled]}
        onPress={onSkip}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={styles.skipIcon}>✕</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.saveButton, disabled && styles.disabled]}
        onPress={onSave}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={styles.saveIcon}>★</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.likeButton, disabled && styles.disabled]}
        onPress={onLike}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={styles.likeIcon}>♥</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    paddingVertical: 16,
  },
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  skipButton: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(248, 113, 113, 0.3)",
  },
  saveButton: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(167, 139, 250, 0.3)",
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  likeButton: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(74, 222, 128, 0.3)",
  },
  skipIcon: {
    fontSize: 28,
    color: "#f87171",
    fontWeight: "300",
  },
  saveIcon: {
    fontSize: 22,
    color: "#a78bfa",
  },
  likeIcon: {
    fontSize: 28,
    color: "#4ade80",
  },
  disabled: {
    opacity: 0.3,
  },
});
