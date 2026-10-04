// Prefer explicit Vite environment variable VITE_API_BASE, fallback to localhost:5501
const API_BASE = (import.meta as any).env?.VITE_API_BASE || ((import.meta as any).env?.PROD ? "/api" : "http://localhost:5501/api");

let authToken: string | null = localStorage.getItem("authToken");
let currentUser: any = null;

export function setAuthToken(token: string) {
  authToken = token;
  localStorage.setItem("authToken", token);
}

export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem("authToken");
  localStorage.removeItem("refreshToken");
}

function setRefreshToken(token: string) {
  localStorage.setItem("refreshToken", token);
}

// One refresh at a time: concurrent 401s share the same request
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    setAuthToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function sessionExpired() {
  clearAuthToken();
  currentUser = null;
  localStorage.removeItem("currentUser");
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

export function getAuthToken() {
  return authToken;
}

export function setCurrentUser(user: any) {
  currentUser = user;
  localStorage.setItem("currentUser", JSON.stringify(user));
}

export function getCurrentUser() {
  if (!currentUser) {
    const stored = localStorage.getItem("currentUser");
    currentUser = stored ? JSON.parse(stored) : null;
  }
  return currentUser;
}

async function fetchAPI(url: string, options: RequestInit = {}, retried = false): Promise<any> {
  const headers: any = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  // Access tokens are short lived: renew once with the refresh token, then retry
  if (response.status === 401 && !retried && authToken && !url.startsWith("/auth/")) {
    refreshing ??= refreshSession().finally(() => { refreshing = null; });
    if (await refreshing) {
      return fetchAPI(url, options, true);
    }
    sessionExpired();
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

export const api = {
  // Auth
  login: async (email: string, password: string) => {
    const data = await fetchAPI("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setCurrentUser(data.user);
    return data;
  },

  register: async (email: string, password: string) => {
    const data = await fetchAPI("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setCurrentUser(data.user);
    return data;
  },

  // Registration
  registerForEvent: async (eventId: string, attendeeData: any) => {
    return fetchAPI(`/events/${eventId}/register`, {
      method: "POST",
      body: JSON.stringify(attendeeData),
    });
  },

  // Tickets
  getMyTicket: async (eventId: string) => {
    return fetchAPI(`/me/ticket?eventId=${eventId}`);
  },

  // Gates
  getGateQR: async (gateId: string) => {
    return fetchAPI(`/gates/${gateId}/qr`);
  },

  getEventGates: async (eventId: string) => {
    return fetchAPI(`/events/${eventId}/gates`);
  },

  toggleGateStatus: async (gateId: string, isActive: boolean) => {
    return fetchAPI(`/gates/${gateId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
  },

  // Check-ins
  checkin: async (mode: string, data: any) => {
    return fetchAPI("/checkins", {
      method: "POST",
      body: JSON.stringify({ mode, ...data }),
    });
  },

  // Metrics
  getEventMetrics: async (eventId: string) => {
    return fetchAPI(`/events/${eventId}/metrics`);
  },

  getGateMetrics: async (eventId: string) => {
    return fetchAPI(`/events/${eventId}/gates/metrics`);
  },

  getRecentCheckins: async (eventId: string, limit = 50) => {
    return fetchAPI(`/events/${eventId}/checkins?limit=${limit}`);
  },

  // Events
  getActiveEvents: async () => {
    return fetchAPI("/events/active");
  },

  getAllEvents: async () => {
    return fetchAPI("/events");
  },

  createEvent: async (eventData: any) => {
    return fetchAPI("/events", {
      method: "POST",
      body: JSON.stringify(eventData),
    });
  },

  // Gates admin
  getGates: async () => {
    return fetchAPI("/gates");
  },

  createGate: async (gateData: any) => {
    return fetchAPI("/gates", {
      method: "POST",
      body: JSON.stringify(gateData),
    });
  },

  // Auth helpers
  getAuthToken: () => authToken,
  getCurrentUser: () => getCurrentUser(),
  clearAuthToken: () => {
    authToken = null;
    currentUser = null;
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("currentUser");
  },
};
