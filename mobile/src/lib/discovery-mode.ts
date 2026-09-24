// Private Expo Go experiment only. Release builds keep the existing provider flow.
export const DEEZER_TEST_MODE =
  __DEV__ && process.env.EXPO_PUBLIC_DISCOVERY_SOURCE === "deezer";
