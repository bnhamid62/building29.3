import { api } from "./http";
import type {
  Apartment,
  ApartmentDetail,
  AuditEntry,
  BuildingSettings,
  ContributionRow,
  DocumentRow,
  FinancialReport,
  NotificationItem,
  DashboardSummary,
  LoginResponse,
  Payment,
  Project,
  ProjectDetail,
  ReceiptResponse,
  ResidentRow,
  User,
  AvailabilitySlot,
  Booking,
  CameraRow,
  Complaint,
  ComplaintDetail,
  Facility,
  Meeting,
  MeetingDetail,
  Vote,
  VoteDetail,
} from "./types";

export const authApi = {
  login: (identifier: string, password: string) =>
    api.post<LoginResponse>("/auth/login", { identifier, password }),
  me: () => api.get<User>("/auth/me"),
  logout: () => api.post<{ ok: boolean }>("/auth/logout"),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ ok: boolean }>("/auth/change-password", { current_password, new_password }),
};

export const buildingApi = {
  settings: () => api.get<BuildingSettings>("/settings"),
  /** Manager only, validated and audited server-side. */
  updateSettings: (input: Record<string, unknown>) =>
    api.patch<BuildingSettings>("/settings", input),
  dashboard: () => api.get<DashboardSummary>("/dashboard"),
};

export const notificationsApi = {
  list: () => api.get<NotificationItem[]>("/notifications"),
  unreadCount: () => api.get<{ unread: number }>("/notifications/unread-count"),
  markRead: (id: number) => api.post<{ ok: boolean }>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ ok: boolean }>("/notifications/read-all"),
  /** Manager only: broadcast to everyone, one apartment, or one resident. */
  broadcast: (input: Record<string, unknown>) =>
    api.post<{ sent: number }>("/notifications", input),
  /** Web Push: server-held VAPID public key (optional — subscription still works without it). */
  vapidKey: () => api.get<{ public_key: string | null }>("/notifications/vapid-public-key"),
  /** Web Push: store this browser's subscription on the PHP API. */
  subscribe: (input: { endpoint: string; p256dh: string; auth: string; user_agent?: string }) =>
    api.post<{ ok: boolean }>("/notifications/subscribe", input),
  unsubscribe: (endpoint: string) =>
    api.post<{ ok: boolean }>("/notifications/unsubscribe", { endpoint }),
};

export const contributionsApi = {
  list: (projectId: number) => api.get<ContributionRow[]>(`/projects/${projectId}/contributions`),
  update: (projectId: number, apartmentId: number, input: Record<string, unknown>) =>
    api.patch<{ ok: boolean }>(`/projects/${projectId}/contributions/${apartmentId}`, input),
};

export const auditApi = {
  list: (filters?: {
    entity?: string;
    action?: string;
    actor_id?: number;
    from?: string;
    to?: string;
    limit?: number;
  }) => {
    const search = new URLSearchParams();
    Object.entries(filters ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
    });
    const qs = search.toString();
    return api.get<AuditEntry[]>(`/audit-logs${qs ? `?${qs}` : ""}`);
  },
};

export const filesApi = {
  list: () => api.get<DocumentRow[]>("/files"),
  upload: (form: FormData) => api.upload<{ id: number; file_id: number }>("/files", form),
  download: (id: number, filename: string) => api.download(`/files/${id}/download`, filename),
  remove: (id: number) => api.delete<{ ok: boolean }>(`/files/${id}`),
};

export const reportsApi = {
  financial: () => api.get<FinancialReport>("/reports/financial"),
};

export const apartmentsApi = {
  list: () => api.get<Apartment[]>("/apartments"),
  detail: (id: number) => api.get<ApartmentDetail>(`/apartments/${id}`),
};

export const residentsApi = {
  list: () => api.get<ResidentRow[]>("/residents"),
  create: (input: Record<string, unknown>) => api.post<{ id: number }>("/residents", input),
  update: (id: number, input: Record<string, unknown>) =>
    api.patch<{ ok: boolean }>(`/residents/${id}`, input),
  resetPassword: (id: number, password: string) =>
    api.post<{ ok: boolean }>(`/residents/${id}/reset-password`, { password }),
};

export const projectsApi = {
  list: () => api.get<Project[]>("/projects"),
  detail: (id: number) => api.get<ProjectDetail>(`/projects/${id}`),
  create: (input: Record<string, unknown>) => api.post<{ id: number }>("/projects", input),
  update: (id: number, input: Record<string, unknown>) =>
    api.patch<{ ok: boolean }>(`/projects/${id}`, input),
  /** Manager only. Irreversible: freezes required amounts server-side and in the database. */
  lock: (id: number) =>
    api.post<{ ok: boolean; financially_locked: boolean }>(`/projects/${id}/lock`),
};

export const paymentsApi = {
  list: (params?: { project_id?: number; apartment_id?: number }) => {
    const search = new URLSearchParams();
    if (params?.project_id) search.set("project_id", String(params.project_id));
    if (params?.apartment_id) search.set("apartment_id", String(params.apartment_id));
    const qs = search.toString();
    return api.get<Payment[]>(`/payments${qs ? `?${qs}` : ""}`);
  },
  mine: () => api.get<Payment[]>("/payments/mine"),
  create: (input: Record<string, unknown>) =>
    api.post<{ id: number; receipt_no: string }>("/payments", input),
  reverse: (id: number, reason: string) =>
    api.post<{ id: number }>(`/payments/${id}/reverse`, { reason }),
  receipt: (no: string) => api.get<ReceiptResponse>(`/receipts/${encodeURIComponent(no)}`),
};

export const pdfApi = {
  receipt: (no: string) => api.download(`/pdf/receipts/${encodeURIComponent(no)}`, `${no}.pdf`),
  financialReport: () => api.download("/pdf/reports/financial", "rapport-financier-b29.pdf"),
};

export const complaintsApi = {
  list: () => api.get<Complaint[]>("/complaints"),
  detail: (id: number) => api.get<ComplaintDetail>(`/complaints/${id}`),
  create: (input: Record<string, unknown>) => api.post<{ id: number }>("/complaints", input),
  update: (id: number, input: Record<string, unknown>) =>
    api.patch<{ ok: boolean }>(`/complaints/${id}`, input),
  addNote: (id: number, note: string) =>
    api.post<{ ok: boolean }>(`/complaints/${id}/notes`, { note }),
  addAttachment: (id: number, form: FormData) =>
    api.upload<{ file_id: number }>(`/complaints/${id}/attachments`, form),
  downloadAttachment: (id: number, fileId: number, filename: string) =>
    api.download(`/complaints/${id}/attachments/${fileId}/download`, filename),
};

export const votesApi = {
  list: () => api.get<Vote[]>("/votes"),
  detail: (id: number) => api.get<VoteDetail>(`/votes/${id}`),
  create: (input: Record<string, unknown>) => api.post<{ id: number }>("/votes", input),
  update: (id: number, input: Record<string, unknown>) =>
    api.patch<{ ok: boolean }>(`/votes/${id}`, input),
  ballot: (id: number, optionId: number) =>
    api.post<{ ok: boolean }>(`/votes/${id}/ballot`, { option_id: optionId }),
};

export const meetingsApi = {
  list: () => api.get<Meeting[]>("/meetings"),
  detail: (id: number) => api.get<MeetingDetail>(`/meetings/${id}`),
  create: (input: Record<string, unknown>) => api.post<{ id: number }>("/meetings", input),
  update: (id: number, input: Record<string, unknown>) =>
    api.patch<{ ok: boolean }>(`/meetings/${id}`, input),
  respond: (id: number, input: Record<string, unknown>) =>
    api.post<{ ok: boolean }>(`/meetings/${id}/attendance`, input),
  addDocument: (id: number, form: FormData) =>
    api.upload<{ file_id: number }>(`/meetings/${id}/documents`, form),
  downloadDocument: (id: number, fileId: number, filename: string) =>
    api.download(`/meetings/${id}/documents/${fileId}/download`, filename),
};

export const bookingsApi = {
  facilities: () => api.get<Facility[]>("/facilities"),
  availability: (facilityId: number, from: string, to: string) =>
    api.get<AvailabilitySlot[]>(`/facilities/${facilityId}/availability?from=${from}&to=${to}`),
  list: () => api.get<Booking[]>("/bookings"),
  create: (input: Record<string, unknown>) =>
    api.post<{ id: number; status: string }>("/bookings", input),
  update: (id: number, input: Record<string, unknown>) =>
    api.patch<{ ok: boolean }>(`/bookings/${id}`, input),
};

export const camerasApi = {
  list: () => api.get<CameraRow[]>("/cameras"),
  create: (input: Record<string, unknown>) => api.post<{ id: number }>("/cameras", input),
  update: (id: number, input: Record<string, unknown>) =>
    api.patch<{ ok: boolean }>(`/cameras/${id}`, input),
  remove: (id: number) => api.delete<{ ok: boolean }>(`/cameras/${id}`),
};
