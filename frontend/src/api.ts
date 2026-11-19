// Cliente HTTP centralizado para la API de Studio Capilar

const BASE_URL = (import.meta as any).env?.VITE_API_URL ?? '';

const TOKEN_KEY = 'studio_capilar_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Error estructurado del backend
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code: string = data?.error?.code ?? 'UNKNOWN_ERROR';
    const message: string =
      data?.error?.message ?? `Error ${response.status}`;
    if (response.status === 401) {
      clearToken();
      window.location.href = '/ingreso';
    }
    throw new ApiError(code, message, response.status);
  }

  return data as T;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Role = 'cliente' | 'profesional' | 'administrador';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Service {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  active: boolean;
}

export interface ScheduleEntry {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface Professional {
  id: string;
  name: string;
  email: string;
  active: boolean;
  schedule?: ScheduleEntry[];
}

export interface Block {
  id: string;
  professionalId: string;
  startAt: string;
  endAt: string;
  reason?: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  clientName?: string;
  professionalId: string;
  professionalName?: string;
  serviceId: string;
  serviceName?: string;
  startAt: string;
  endAt: string;
  status: 'reservado' | 'completado' | 'cancelado' | 'ausente';
  priceCents?: number;
  cancelReason?: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  active: boolean;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  me: () => apiFetch<{ user: User }>('/api/auth/me'),
};

// ── Services ─────────────────────────────────────────────────────────────────

export const servicesApi = {
  list: (includeInactive = false) =>
    apiFetch<{ services: Service[] }>(
      `/api/services${includeInactive ? '?includeInactive=true' : ''}`,
    ),

  create: (body: { name: string; durationMin: number; priceCents: number }) =>
    apiFetch<{ service: Service }>('/api/services', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: Partial<{ name: string; durationMin: number; priceCents: number; active: boolean }>) =>
    apiFetch<{ service: Service }>(`/api/services/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

// ── Professionals ─────────────────────────────────────────────────────────────

export const professionalsApi = {
  list: () => apiFetch<{ professionals: Professional[] }>('/api/professionals'),

  get: (id: string) =>
    apiFetch<{ professional: Professional }>(`/api/professionals/${id}`),

  create: (body: { name: string; email: string; password: string; phone?: string }) =>
    apiFetch<{ professional: Professional }>('/api/professionals', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: Partial<{ name: string; active: boolean }>) =>
    apiFetch<{ professional: Professional }>(`/api/professionals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  getSchedule: (id: string) =>
    apiFetch<{ schedule: ScheduleEntry[] }>(`/api/professionals/${id}/schedule`),

  setSchedule: (id: string, schedule: ScheduleEntry[]) =>
    apiFetch<{ schedule: ScheduleEntry[] }>(`/api/professionals/${id}/schedule`, {
      method: 'PUT',
      body: JSON.stringify({ schedule }),
    }),

  listBlocks: (id: string, from: string, to: string) =>
    apiFetch<{ blocks: Block[] }>(`/api/professionals/${id}/blocks?from=${from}&to=${to}`),

  createBlock: (id: string, body: { startAt: string; endAt: string; reason?: string }) =>
    apiFetch<{ block: Block }>(`/api/professionals/${id}/blocks`, { method: 'POST', body: JSON.stringify(body) }),

  deleteBlock: (professionalId: string, blockId: string) =>
    apiFetch<void>(`/api/professionals/${professionalId}/blocks/${blockId}`, { method: 'DELETE' }),

  availability: (id: string, serviceId: string, date: string) =>
    apiFetch<{ slots: string[] }>(
      `/api/professionals/${id}/availability?serviceId=${serviceId}&date=${date}`,
    ),
};

// ── Appointments ──────────────────────────────────────────────────────────────

export const appointmentsApi = {
  list: () => apiFetch<{ appointments: Appointment[] }>('/api/appointments'),

  get: (id: string) =>
    apiFetch<{ appointment: Appointment }>(`/api/appointments/${id}`),

  create: (body: {
    professionalId: string;
    serviceId: string;
    startAt: string;
    clientId?: string;
  }) =>
    apiFetch<{ appointment: Appointment }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  cancel: (id: string, reason?: string) =>
    apiFetch<{ appointment: Appointment }>(`/api/appointments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  complete: (id: string) =>
    apiFetch<{ appointment: Appointment }>(`/api/appointments/${id}/complete`, {
      method: 'POST',
    }),

  noShow: (id: string) =>
    apiFetch<{ appointment: Appointment }>(`/api/appointments/${id}/no-show`, {
      method: 'POST',
    }),
};

// ── Clients ───────────────────────────────────────────────────────────────────

export const clientsApi = {
  list: () => apiFetch<{ clients: Client[] }>('/api/clients'),

  update: (id: string, body: Partial<{ name: string; phone: string; active: boolean }>) =>
    apiFetch<{ client: Client }>(`/api/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convierte centavos a string ARS con 2 decimales */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(cents / 100);
}

const TZ = 'America/Argentina/Buenos_Aires';

/** Convierte ISO UTC a hora local Buenos Aires */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Convierte ISO UTC a fecha + hora local Buenos Aires */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const WEEKDAY_NAMES = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
];
