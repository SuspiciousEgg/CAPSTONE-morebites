import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const TOKEN_KEY = "auth_token";
const USER_KEY = "current_user";

// Inside the Android emulator, 127.0.0.1 is the emulator itself; 10.0.2.2 is the host PC.
const ANDROID_EMULATOR_HOST = "10.0.2.2";

function expoLanHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.linkingUri ||
    "";
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

function sendFormDataWithXHR(path, { method = "POST", body, token, auth = true } = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const storedToken = auth ? (token || (await AsyncStorage.getItem(TOKEN_KEY))) : null;
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_BASE}${path}`);
      xhr.setRequestHeader("Accept", "application/json");
      if (storedToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${storedToken}`);
      }

      xhr.onload = () => {
        let data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          data = { message: xhr.responseText };
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          const message =
            data?.message ||
            data?.errors?.phone?.[0] ||
            data?.errors?.email?.[0] ||
            data?.errors?.status?.[0] ||
            data?.errors?.proof_of_delivery?.[0] ||
            `Request failed (${xhr.status})`;
          const error = new Error(message);
          error.status = xhr.status;
          error.data = data;
          reject(error);
        }
      };

      xhr.onerror = (err) => {
        const errorDetails = err?.message || "Network request failed";
        console.error(`[API Network Error] ${method} ${path}:`, err);
        reject(
          new Error(
            `Cannot reach the API at ${API_BASE} (${errorDetails}). On a phone, Laravel must listen on 0.0.0.0 (php artisan serve --host=0.0.0.0 --port=8000) and the phone must be on the same Wi-Fi.`,
          ),
        );
      };

      xhr.ontimeout = () => {
        reject(new Error(`Request to ${API_BASE} timed out.`));
      };

      xhr.send(body);
    } catch (err) {
      reject(err);
    }
  });
}

async function request(path, { method = "GET", body, token, auth = true } = {}) {
  const isForm =
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    (body && typeof body === "object" && Array.isArray(body._parts));

  // Expo's WinterCG fetch implementation throws "Unsupported FormDataPart implementation"
  // when handling React Native's FormData with local file URIs.
  // Native XMLHttpRequest routes directly to React Native's native networking module.
  if (isForm && typeof XMLHttpRequest !== "undefined") {
    return sendFormDataWithXHR(path, { method, body, token, auth });
  }

  const headers = {
    Accept: "application/json",
  };
  if (!isForm) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const storedToken = token || (await AsyncStorage.getItem(TOKEN_KEY));
    if (storedToken) {
      headers.Authorization = `Bearer ${storedToken}`;
    }
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    const errorDetails = err?.message || String(err);
    console.error(`[API Network Error] ${method} ${path}:`, err);
    throw new Error(
      `Cannot reach the API at ${API_BASE} (${errorDetails}). On a phone, Laravel must listen on 0.0.0.0 (php artisan serve --host=0.0.0.0 --port=8000) and the phone must be on the same Wi-Fi.`,
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

/**
 * Unified Mobile Authentication API (works for both Customer & Driver)
 */
export const mobileApi = {
  login: (phone, password, device_id) =>
    request("/mobile/login", {
      method: "POST",
      body: { phone, password, device_id },
      auth: false,
    }),
  me: () => request("/mobile/me"),
  logout: async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    await authStorage.clear();
    if (token) revokeServerToken(token);
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
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    await authStorage.clear();
    if (token) revokeServerToken(token);
  },
};

export const driverApi = {
  login: (phone, password, deviceId) =>
    request("/driver/login", {
      method: "POST",
      body: { phone, password, ...(deviceId ? { device_id: deviceId } : {}) },
      auth: false,
    }),
  me: () => request("/driver/me"),
  orders: (status = "All") =>
    request(`/driver/orders${status && status !== "All" ? `?status=${encodeURIComponent(status)}` : ""}`),
  order: (dbId) => request(`/driver/orders/${dbId}`),
  updateStatus: (dbId, status, proof) => {
    if (proof) {
      const form = new FormData();
      form.append("status", status);
      if (proof.file) {
        form.append("proof_of_delivery", proof.file, proof.fileName || "proof.jpg");
      } else {
        const fileUri = typeof proof === "string" ? proof : proof.uri;
        let fileName = typeof proof === "object" && proof?.fileName ? proof.fileName : "proof.jpg";
        if (!/\.(jpe?g|png|webp)$/i.test(fileName)) {
          fileName = `${fileName}.jpg`;
        }
        const mimeType =
          typeof proof === "object" && proof?.mimeType
            ? proof.mimeType
            : fileName.endsWith(".png")
              ? "image/png"
              : "image/jpeg";

        form.append("proof_of_delivery", {
          uri: fileUri,
          name: fileName,
          type: mimeType,
        });
      }
      return request(`/driver/orders/${dbId}/status`, {
        method: "POST",
        body: form,
      });
    }
    return request(`/driver/orders/${dbId}/status`, {
      method: "PATCH",
      body: { status },
    });
  },
  updateProfile: (payload) =>
    request("/driver/profile", {
      method: "PATCH",
      body: payload,
    }),
  changePassword: (payload) =>
    request("/driver/change-password", {
      method: "POST",
      body: payload,
    }),
  reportIssue: (dbId, issue, notes = "") =>
    request(`/driver/orders/${dbId}/report`, {
      method: "POST",
      body: { issue, notes },
    }),
  updateLocation: (latitude, longitude) =>
    request("/driver/location", {
      method: "PATCH",
      body: { latitude, longitude },
    }),
  updateDeliveryLocation: (deliveryId, latitude, longitude) =>
    request(`/deliveries/${deliveryId}/location`, {
      method: "PATCH",
      body: { latitude, longitude },
    }),
  deliveryLocation: (deliveryId) => request(`/deliveries/${deliveryId}/location`),
  tracking: (dbId) => request(`/driver/orders/${dbId}/tracking`),
  unreadNotificationsCount: () => request("/notifications/unread-count"),
  notifications: (tab = null) => request(`/notifications${tab ? `?tab=${tab}` : ""}`),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request("/notifications/mark-all-read", { method: "POST" }),
  logout: async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    await authStorage.clear();
    if (token) revokeServerToken(token);
  },
};

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
    .catch(() => {})
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}
