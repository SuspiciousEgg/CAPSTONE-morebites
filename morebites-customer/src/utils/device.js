import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "device_id";
const LEGACY_DEVICE_ID_KEY = "morebites_device_id";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return "";
  let digits = String(phoneNumber).replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) {
    digits = "0" + digits.slice(2);
  }
  return digits;
}

export function getTrustedDevicesKey(phoneNumber) {
  const clean = normalizePhoneNumber(phoneNumber);
  return `trusted_devices_${clean}`;
}

/**
 * Returns a stable, persistent unique device identifier.
 * - Checks AsyncStorage first for an existing cached ID (under device_id or morebites_device_id).
 * - If not found, generates a pure-JS UUID and stores it permanently in AsyncStorage.
 */
export async function getDeviceId() {
  try {
    const existing =
      (await AsyncStorage.getItem(DEVICE_ID_KEY)) ||
      (await AsyncStorage.getItem(LEGACY_DEVICE_ID_KEY));
    if (existing) {
      await AsyncStorage.setItem(DEVICE_ID_KEY, existing);
      await AsyncStorage.setItem(LEGACY_DEVICE_ID_KEY, existing);
      return existing;
    }

    const deviceId = `dev-${generateUUID()}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    await AsyncStorage.setItem(LEGACY_DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch (err) {
    console.warn("Error resolving deviceId:", err);
    return `dev-${generateUUID()}`;
  }
}

/**
 * Retrieve list of trusted device IDs stored in AsyncStorage for this phone number.
 */
export async function getTrustedDevices(phoneNumber) {
  const clean = normalizePhoneNumber(phoneNumber);
  if (!clean) return [];
  try {
    const key = getTrustedDevicesKey(clean);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Error reading trusted devices:", err);
    return [];
  }
}

/**
 * Check if the specified deviceId is in the account's trusted devices list in AsyncStorage.
 */
export async function isDeviceTrusted(phoneNumber, deviceId) {
  const clean = normalizePhoneNumber(phoneNumber);
  if (!clean || !deviceId) return false;
  const list = await getTrustedDevices(clean);
  return list.includes(deviceId);
}

/**
 * Add a device ID to the account's trusted devices list in AsyncStorage.
 */
export async function addTrustedDevice(phoneNumber, deviceId) {
  const clean = normalizePhoneNumber(phoneNumber);
  if (!clean || !deviceId) return;
  try {
    const key = getTrustedDevicesKey(clean);
    const list = await getTrustedDevices(clean);
    if (!list.includes(deviceId)) {
      list.push(deviceId);
      await AsyncStorage.setItem(key, JSON.stringify(list));
    }
  } catch (err) {
    console.warn("Error saving trusted device:", err);
  }
}
