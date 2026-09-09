import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const TOKEN_KEY = "auth_token";
const USER_KEY = "current_user";

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

function resolveApiBase() {
  const envUrl = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
  const lanHost = expoLanHost();
  const envIsLoopback = !envUrl || /localhost|127\.0\.0\.1/.test(envUrl);

  if (lanHost && envIsLoopback) {
    return `http://${lanHost}:8000/api`;
  }
  if (envUrl) return envUrl;
  return "http://127.0.0.1:8000/api";
}

export const API_BASE = resolveApiBase();

export function mediaUrl(path) {
  if (!path) return null;
  if (/^(https?:|blob:|data:|file:)/i.test(path)) return path;
  const origin = API_BASE.replace(/\/api\/?$/, "");
  return `${origin}/${String(path).replace(/^\//, "")}`;
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
    const message =
      data?.message ||
      data?.errors?.phone?.[0] ||
      data?.errors?.password?.[0] ||
      data?.errors?.full_name?.[0] ||
      data?.errors?.email?.[0] ||
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

export const customerApi = {
  register: (payload) =>
    request("/customer/register", { method: "POST", body: payload, auth: false }),
  login: (phone, password, device_id) =>
    request("/customer/login", {
      method: "POST",
      body: { phone, password, device_id },
      auth: false,
    }),
  me: () => request("/customer/me"),
  updateProfile: (payload) =>
    request("/customer/profile", { method: "PATCH", body: payload }),
  menu: () => request("/customer/menu", { auth: false }),
  quoteFees: (km = null, address = null) => {
    const params = new URLSearchParams();
    if (km != null && km !== "") params.set("km", String(km));
    if (address) params.set("address", address);
    const qs = params.toString();
    return request(`/delivery-rates/quote${qs ? `?${qs}` : ""}`, { auth: false });
  },
  orders: () => request("/customer/orders"),
  order: (dbId) => request(`/customer/orders/${dbId}`),
  placeOrder: (payload) =>
    request("/customer/orders", { method: "POST", body: payload }),
  tracking: (dbId) => request(`/customer/orders/${dbId}/tracking`),
  rateOrder: (dbId, payload) =>
    request(`/customer/orders/${dbId}/rate`, { method: "POST", body: payload }),
  logout: async () => {
    try {
      await request("/logout", { method: "POST" });
    } catch {
      // ignore
    }
    await authStorage.clear();
  },
};
