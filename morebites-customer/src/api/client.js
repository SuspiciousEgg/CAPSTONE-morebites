import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const TOKEN_KEY = "auth_token";
const USER_KEY = "current_user";

// Inside the Android emulator, 127.0.0.1 is the emulator itself; 10.0.2.2 is the host PC.
const ANDROID_EMULATOR_HOST = "10.0.2.2";

function expoLanHost() {
  const hostUri = Constants.expoConfig?.hostUri || Constants.linkingUri || "";
  const host = String(hostUri)
    .replace(/^exp:\/\//, "")
    .replace(/^https?:\/\//, "")
    .split(":")[0];
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return host;
  }
  return null;
}

// Host that points at the PC running Laravel:
// physical phone (Expo Go on Wi-Fi) -> Expo LAN IP; Android emulator -> 10.0.2.2.
function pcHost() {
  return expoLanHost() || (Platform.OS === "android" ? ANDROID_EMULATOR_HOST : null);
}

function resolveApiBase() {
  const envUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
  const host = pcHost();
  const envIsLoopback = !envUrl || /localhost|127\.0\.0\.1/.test(envUrl);

  if (host && envIsLoopback) {
    return `http://${host}:8000/api`;
  }
  if (envUrl) return envUrl;
  return "http://127.0.0.1:8000/api";
}

export const API_BASE = resolveApiBase();

export function mediaUrl(path) {
  if (!path) return null;
  const host = pcHost();
  let resolved = String(path);
  if (host && /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?/i.test(resolved)) {
    resolved = resolved.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, `$1${host}`);
  }
  if (/^(https?:|blob:|data:|file:)/i.test(resolved)) return resolved;
  const origin = API_BASE.replace(/\/api\/?$/, "");
  return `${origin}/${resolved.replace(/^\//, "")}`;
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      `Cannot reach the API at ${API_BASE}. Use php artisan serve --host=0.0.0.0 --port=8000 on the same Wi-Fi.`,
    );
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const firstValidationError = data?.errors ? Object.values(data.errors).flat()[0] : null;
    const message =
      firstValidationError ||
      data?.message ||
      `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const authStorage = {
  async saveSession(token, user) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  async updateUser(partial) {
    const current = (await this.getUser()) || {};
    const next = { ...current, ...partial };
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(next));
    return next;
  },
  async getUser() {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  async getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
  },
  async clear() {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, "saved_addresses"]);
  },
};

export const addressStorage = {
  async keyForCurrentUser() {
    const user = await authStorage.getUser();
    const scope = user?.customer_id || user?.id || user?.phone || "guest";
    return `saved_addresses_customer_${scope}`;
  },
  async getForCurrentUser() {
    const key = await this.keyForCurrentUser();
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore parse error
      }
    }
    const legacyRaw = await AsyncStorage.getItem("saved_addresses");
    if (legacyRaw) {
      try {
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed)) return legacyParsed;
      } catch {
        // ignore
      }
    }
    return [];
  },
  async saveForCurrentUser(addresses) {
    const list = Array.isArray(addresses) ? addresses : [];
    const key = await this.keyForCurrentUser();
    const serialized = JSON.stringify(list);
    await AsyncStorage.setItem(key, serialized);
    await AsyncStorage.setItem("saved_addresses", serialized);
    return list;
  },
};

export const customerApi = {
  register: (payload) =>
    request("/customer/register", { method: "POST", body: payload, auth: false }),
  login: (phone, password, device_id) =>
    request("/customer/login", {
      method: "POST",
      body: { phone, password, device_id },
      auth: false,
    }),
  requestPasswordResetOtp: (phone) =>
    request("/customer/forgot-password", {
      method: "POST",
      body: { phone },
      auth: false,
    }),
  verifyPasswordResetOtp: (phone, code) =>
    request("/customer/verify-otp", {
      method: "POST",
      body: { phone, code },
      auth: false,
    }),
  resetPassword: (payload) =>
    request("/customer/reset-password", {
      method: "POST",
      body: payload,
      auth: false,
    }),
  me: () => request("/customer/me"),
  updateProfile: (payload) =>
    request("/customer/profile", { method: "PATCH", body: payload }),
  addresses: () => request("/customer/addresses"),
  addAddress: (payload) =>
    request("/customer/addresses", { method: "POST", body: payload }),
  updateAddress: (id, payload) =>
    request(`/customer/addresses/${id}`, { method: "PUT", body: payload }),
  setDefaultAddress: (id) =>
    request(`/customer/addresses/${id}/default`, { method: "PATCH" }),
  deleteAddress: (id) =>
    request(`/customer/addresses/${id}`, { method: "DELETE" }),
  menu: () => request("/customer/menu", { auth: false }),
  topSelling: () => request("/menu/top-selling", { auth: false }),
  quoteFees: (km = null, address = null, coords = null) => {
    const params = new URLSearchParams();
    if (km != null && km !== "") params.set("km", String(km));
    if (address) params.set("address", address);
    if (coords && coords.latitude != null && coords.longitude != null) {
      params.set("lat", String(coords.latitude));
      params.set("lng", String(coords.longitude));
    }
    const qs = params.toString();
    return request(`/delivery-rates/quote${qs ? `?${qs}` : ""}`, { auth: false });
  },
  orders: () => request("/customer/orders"),
  order: (dbId) => request(`/customer/orders/${dbId}`),
  placeOrder: (payload) =>
    request("/customer/orders", { method: "POST", body: payload }),
  tracking: (dbId) => request(`/customer/orders/${dbId}/tracking`),
  deliveryLocation: (deliveryId) => request(`/deliveries/${deliveryId}/location`),
  rateOrder: (dbId, payload) =>
    request(`/customer/orders/${dbId}/rate`, { method: "POST", body: payload }),
  unreadNotificationsCount: () => request("/notifications/unread-count"),
  notifications: (tab = null) => request(`/notifications${tab ? `?tab=${tab}` : ""}`),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request("/notifications/mark-all-read", { method: "POST" }),
  logout: async () => {
    // Prompt 53: wipe the stored session FIRST so logout can never be undone by a
    // slow/unreachable API, then revoke the server token in the background (time-boxed).
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    await authStorage.clear();
    if (token) revokeServerToken(token);
  },
};

/* ============================================================================
 * PROMPT 53 DIAGNOSTIC REPORT — Logout not clearing session (Customer app)
 * 1. Where the session is stored:
 *    - AsyncStorage only (no SecureStore, no refresh token exists in this app).
 *    - Keys: "auth_token" (Sanctum bearer token, TOKEN_KEY) and "current_user" (cached user, USER_KEY).
 *      "saved_addresses" (legacy unscoped address cache) is also session-bound and cleared on logout.
 *    - Auto-login: app/(auth)/splashscreen.jsx reads "auth_token"; if present and GET /customer/me
 *      succeeds, it routes straight to /(tabs)/home.
 * 2. What Logout did before this fix:
 *    - profile.jsx closed the modal and called customerApi.logout(), which first AWAITED
 *      POST /logout and only afterwards ran authStorage.clear().
 *    - fetch() has no timeout, so on a slow, dropped, or firewalled connection the request could
 *      hang indefinitely. The clear never executed, "auth_token" stayed in AsyncStorage, the server
 *      token was never revoked, and on relaunch the splash screen found a valid token and auto-logged in.
 * 3. Fix:
 *    - Read the token, clear every stored auth key immediately, then revoke the server token
 *      fire-and-forget with an 8s timeout. Local logout is now guaranteed regardless of network.
 *    - Closing the app WITHOUT tapping Logout is unchanged: the token stays and splash auto-logs in.
 * ============================================================================
 */
function revokeServerToken(token) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
  fetch(`${API_BASE}/logout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal: controller?.signal,
  })
    .catch(() => {
      // Ignore: the local session is already gone, so the user stays logged out.
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}
