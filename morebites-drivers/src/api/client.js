import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const TOKEN_KEY = "auth_token";
const USER_KEY = "current_user";

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

function resolveApiBase() {
  const envUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
  const lanHost = expoLanHost();
  const envIsLoopback = !envUrl || /localhost|127\.0\.0\.1/.test(envUrl);

  // A phone cannot reach the PC via 127.0.0.1. Prefer the Expo LAN IP.
  if (lanHost && envIsLoopback) {
    return `http://${lanHost}:8000/api`;
  }

  if (envUrl) {
    return envUrl;
  }

  return "http://127.0.0.1:8000/api";
}

export const API_BASE = resolveApiBase();

export function mediaUrl(path) {
  if (!path) return null;
  if (/^(https?:|blob:|data:|file:)/i.test(path)) return path;
  const origin = API_BASE.replace(/\/api\/?$/, "");
  return `${origin}/${String(path).replace(/^\//, "")}`;
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

  let data = null;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.errors?.phone?.[0] ||
      data?.errors?.email?.[0] ||
      data?.errors?.status?.[0] ||
      data?.errors?.current_password?.[0] ||
      data?.errors?.password?.[0] ||
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
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  },
};

export const driverApi = {
  login: (phone, password) =>
    request("/driver/login", {
      method: "POST",
      body: { phone, password },
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
    try {
      await request("/logout", { method: "POST" });
    } catch {
      // Ignore network logout errors; clear local session anyway.
    }
    await authStorage.clear();
  },
};
