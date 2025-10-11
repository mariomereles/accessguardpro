const API_BASE = "/api";

let authToken: string | null = localStorage.getItem("authToken");
let currentUser: any = null;

export function setAuthToken(token: string) {
  authToken = token;
  localStorage.setItem("authToken", token);
}

export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem("authToken");
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

async function fetchAPI(url: string, options: RequestInit = {}) {
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
    setCurrentUser(data.user);
    return data;
  },

  register: async (email: string, password: string, role = "USER") => {
    const data = await fetchAPI("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, role }),
    });
    setAuthToken(data.accessToken);
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
  createGate: async (gateData: any) => {
    return fetchAPI("/gates", {
      method: "POST",
      body: JSON.stringify(gateData),
    });
  },
};
