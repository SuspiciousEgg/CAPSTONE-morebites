import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "morebites_device_id";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns a stable, persistent unique device identifier.
 * - Checks AsyncStorage first for an existing cached ID.
 * - If not found, generates a pure-JS UUID and stores it in AsyncStorage.
 */
export async function getDeviceId() {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      return existing;
    }

    const deviceId = `dev-${generateUUID()}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch (err) {
    console.warn("Error resolving deviceId:", err);
    return `dev-${generateUUID()}`;
  }
}
