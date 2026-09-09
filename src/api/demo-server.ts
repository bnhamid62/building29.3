/**
 * DEMO PREVIEW SERVER — in-browser stand-in for the PHP REST API.
 *
 * It is only used when VITE_API_BASE_URL is empty, so the interface can be
 * reviewed without AppServ running. It mirrors the real API contract exactly
 * (same paths, same payload shapes, same role rules), which means switching to
 * the PHP backend requires no change anywhere else in the app.
 */
import type {
  Apartment,
  ApartmentDetail,
  AuditEntry,
  BuildingSettings,
  ContributionRow,
  DashboardSummary,
  EquipmentRow,
  DocumentRow,
  FinancialReport,
  NotificationItem,
  Payment,
  Project,
  ResidentRow,
  User,
} from "./types";
import { demoModules } from "./demo-modules";

const MODULE_PREFIXES = [
  "/complaints",
  "/votes",
  "/meetings",
  "/facilities",
  "/bookings",
  "/cameras",
];

interface DemoDb {
  apartments: Array<{ id: number; number: string; floor: number }>;
  users: Array<User & { password: string; apartment_id: number | null }>;
  projects: Project[];
  payments: Payment[];
  receiptCounter: number;
  equipment: EquipmentRow[];
  notifications: NotificationItem[];
  auditLogs: AuditEntry[];
  documents: DocumentRow[];
  exempt: Record<string, boolean>;
  requiredOverride: Record<string, number>;
  settings: BuildingSettings;
}

const AR_FIRST = ["محمد", "أحمد", "كريم", "سعيد", "يوسف", "نبيل", "رشيد", "فريد", "سمير", "ياسين"];
const AR_LAST = ["بن عمر", "شريف", "بوعلام", "حداد", "زروقي", "مرابط", "بلقاسم", "عيساوي"];

let db: DemoDb | null = null;

function seed(): DemoDb {
  const apartments: DemoDb["apartments"] = [];
  let id = 1;
  for (let floor = 0; floor <= 9; floor++) {
    for (let k = 1; k <= 4; k++) {
      apartments.push({ id, number: floor === 0 ? `RDC-${k}` : `${floor}0${k}`, floor });
      id++;
    }
  }

  const users: DemoDb["users"] = [
    {
      id: 1,
      identifier: "manager",
      full_name: "مدير العمارة (تجريبي)",
      phone: "+213770000001",
      apartment_id: 1,
      person_rank: "primary",
      occupancy: "resident_owner",
      status: "active",
      must_change_password: false,
      photo_path: null,
      last_login_at: null,
      roles: ["manager", "resident"],
      password: "Manager@2026",
    },
  ];
  let uid = 2;
  apartments.slice(1).forEach((apt) => {
    users.push({
      id: uid,
      identifier: `res${String(apt.id).padStart(2, "0")}`,
      full_name: `${AR_FIRST[apt.id % AR_FIRST.length]} ${AR_LAST[apt.id % AR_LAST.length]}`,
      phone: `+2137700${String(apt.id).padStart(5, "0")}`,
      apartment_id: apt.id,
      person_rank: "primary",
      occupancy: "owner",
      status: "active",
      must_change_password: false,
      photo_path: null,
      last_login_at: null,
      roles: ["resident"],
      password: "Resident@2026",
    });
    uid++;
  });

  const now = new Date();
  const iso = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * 86400000).toISOString().slice(0, 19).replace("T", " ");

  const base = (p: Partial<Project>): Project => ({
    id: 0,
    financial_locked_at: null,
    financially_locked: false,
    name_ar: "",
    name_fr: "",
    description_ar: null,
    description_fr: null,
    category: "custom",
    custom_category: null,
    status: "proposed",
    priority: "normal",
    planned_start: null,
    planned_end: null,
    actual_start: null,
    actual_end: null,
    estimated_cost: 0,
    final_cost: null,
    contribution_per_apartment: 0,
    contractor_name: null,
    contractor_phone: null,
    progress: 0,
    notes: null,
    expected_total: 0,
    collected_total: 0,
    remaining_total: 0,
    paid_apartments: 0,
    created_at: iso(40),
    ...p,
  });

  const projects: Project[] = [
    base({
      id: 1,
      name_ar: "صيانة المصعد",
      name_fr: "Maintenance de l'ascenseur",
      category: "elevator",
      status: "in_progress",
      priority: "high",
      estimated_cost: 180000,
      contribution_per_apartment: 4500,
      progress: 60,
      contractor_name: "Sarl Ascenseurs Alger",
      contractor_phone: "+213770000010",
    }),
    base({
      id: 2,
      name_ar: "تنظيف الأجزاء المشتركة",
      name_fr: "Nettoyage des parties communes",
      category: "cleaning",
      status: "fundraising",
      estimated_cost: 80000,
      contribution_per_apartment: 2000,
      progress: 10,
    }),
    base({
      id: 3,
      name_ar: "إصلاح إنارة الطوابق",
      name_fr: "Réparation de l'éclairage des étages",
      category: "lighting",
      status: "completed",
      estimated_cost: 60000,
      final_cost: 58000,
      contribution_per_apartment: 1500,
      progress: 100,
    }),
    base({
      id: 4,
      name_ar: "تركيب كاميرات المراقبة",
      name_fr: "Installation des caméras",
      category: "cameras",
      status: "scheduled",
      priority: "urgent",
      estimated_cost: 240000,
      contribution_per_apartment: 6000,
      progress: 0,
    }),
  ];

  const payments: Payment[] = [];
  let pid = 1;
  let receipt = 0;
  const paidCounts: Record<number, number> = { 1: 26, 2: 9, 3: 40, 4: 0 };
  projects.forEach((project) => {
    const count = paidCounts[project.id] ?? 0;
    for (let i = 1; i <= count; i++) {
      receipt++;
      payments.push({
        id: pid++,
        project_id: project.id,
        apartment_id: i,
        apartment_number: apartments[i - 1]?.number ?? null,
        project_name_ar: project.name_ar,
        project_name_fr: project.name_fr,
        amount: project.contribution_per_apartment,
        method: "cash",
        paid_at: iso((i * 3) % 80),
        notes: null,
        receipt_no: `B29-2026-${String(receipt).padStart(5, "0")}`,
        recorded_by_name: "مدير العمارة (تجريبي)",
        is_reversal: false,
      });
    }
  });

  const equipment: EquipmentRow[] = [
    {
      id: 1,
      name_ar: "المصعد الكهربائي",
      name_fr: "Ascenseur électrique",
      kind: "elevator",
      status: "ok",
      last_check: iso(5).slice(0, 10),
    },
    {
      id: 2,
      name_ar: "إنارة الأجزاء المشتركة",
      name_fr: "Éclairage des communs",
      kind: "lighting",
      status: "degraded",
      last_check: iso(12).slice(0, 10),
    },
    {
      id: 3,
      name_ar: "كاميرات المراقبة",
      name_fr: "Caméras de surveillance",
      kind: "cameras",
      status: "maintenance",
      last_check: iso(20).slice(0, 10),
    },
    {
      id: 4,
      name_ar: "القبو",
      name_fr: "Sous-sol",
      kind: "basement",
      status: "ok",
      last_check: iso(2).slice(0, 10),
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: 1,
      kind: "project",
      title_ar: "مشروع جديد: تركيب كاميرات المراقبة",
      title_fr: "Nouveau projet : caméras de surveillance",
      body_ar: "الحصة لكل شقة 6000 دج.",
      body_fr: "Quote-part par appartement : 6000 DZD.",
      link: "/projects",
      read: false,
      read_at: null,
      created_at: iso(1),
    },
    {
      id: 2,
      kind: "payment",
      title_ar: "تم تسجيل دفعة",
      title_fr: "Paiement enregistré",
      body_ar: "شكرا لدفعكم الأخير.",
      body_fr: "Merci pour votre dernier paiement.",
      link: "/payments",
      read: true,
      read_at: iso(4),
      created_at: iso(5),
    },
  ];

  const settings: BuildingSettings = {
    name_ar: "العمارة رقم 29",
    name_fr: "Immeuble N° 29",
    address_ar: "1500 مسكن، القطب 4، سيدي عبد الله",
    address_fr: "1500 Logements, Q4, Sidi Abdellah",
    currency: "DZD",
    floors: 10,
    apartments_count: 40,
    default_locale: "ar",
    privacy_show_phone: false,
    module_facilities: true,
    module_cameras: true,
    is_demo: 1,
  };

  return {
    apartments,
    users,
    projects,
    payments,
    receiptCounter: receipt,
    equipment,
    notifications,
    auditLogs: [],
    documents: [],
    exempt: {},
    requiredOverride: {},
    settings,
  };
}

function getDb(): DemoDb {
  if (!db) db = seed();
  return db;
}

function totalsFor(project: Project): Project {
  const d = getDb();
  const expected = project.contribution_per_apartment * d.apartments.length;
  const collected = d.payments
    .filter((p) => p.project_id === project.id)
    .reduce((s, p) => s + p.amount, 0);
  const paidApartments = new Set(
    d.payments.filter((p) => p.project_id === project.id).map((p) => p.apartment_id),
  ).size;
  return {
    ...project,
    expected_total: expected,
    collected_total: collected,
    remaining_total: Math.max(0, expected - collected),
    paid_apartments: paidApartments,
  };
}

function publicUser(u: DemoDb["users"][number]): User {
  const { password: _password, ...rest } = u;
  return rest;
}

class DemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let currentUserId: number | null = null;

export function demoRequest(
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
  token: string | null,
): unknown {
  const d = getDb();
  const me = token ? (d.users.find((u) => `demo-token-${u.id}` === token) ?? null) : null;
  if (me) currentUserId = me.id;
  const isManager = !!me?.roles.includes("manager");
  const requireUser = () => {
    if (!me) throw new DemoError(401, "unauthorized", "Authentication required");
    return me;
  };
  const requireManager = () => {
    requireUser();
    if (!isManager) throw new DemoError(403, "forbidden", "Manager role required");
    return me!;
  };

  const key = `${method} ${path}`;

  if (key === "POST /auth/login") {
    const ident = String(body?.["identifier"] ?? "");
    const pwd = String(body?.["password"] ?? "");
    const user = d.users.find((u) => u.identifier === ident || u.phone === ident);
    if (!user || user.password !== pwd)
      throw new DemoError(401, "invalid_credentials", "Identifier or password is incorrect");
    if (user.status !== "active")
      throw new DemoError(403, `account_${user.status}`, "Account is not active");
    user.last_login_at = new Date().toISOString();
    currentUserId = user.id;
    return { access_token: `demo-token-${user.id}`, expires_in: 900, user: publicUser(user) };
  }
  if (key === "POST /auth/logout") {
    currentUserId = null;
    return { ok: true };
  }
  if (key === "POST /auth/refresh") {
    const user = d.users.find((u) => u.id === currentUserId);
    if (!user) throw new DemoError(401, "unauthorized", "No session");
    return { access_token: `demo-token-${user.id}`, expires_in: 900, user: publicUser(user) };
  }
  if (key === "GET /auth/me") return publicUser(requireUser());
  if (key === "POST /auth/change-password") {
    const user = requireUser();
    if (user.password !== String(body?.["current_password"] ?? "")) {
      throw new DemoError(403, "invalid_credentials", "Current password is incorrect");
    }
    const next = String(body?.["new_password"] ?? "");
    if (next.length < 8) throw new DemoError(422, "validation_failed", "Password too short");
    user.password = next;
    user.must_change_password = false;
    return { ok: true };
  }

  const pushAudit = (
    actor: DemoDb["users"][number],
    action: string,
    entity: string,
    entityId: string | null,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) => {
    d.auditLogs.unshift({
      id: (d.auditLogs[0]?.id ?? 0) + 1,
      actor_id: actor.id,
      actor_name: actor.full_name,
      action,
      entity,
      entity_id: entityId,
      before,
      after,
      ip: "127.0.0.1",
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
  };

  if (key === "GET /settings") {
    requireUser();
    return d.settings;
  }
  if (key === "PATCH /settings") {
    const manager = requireManager();
    const before = { ...d.settings };
    const text = (k: string, max: number) => {
      const v = body?.[k];
      if (v === undefined || v === null || String(v).trim() === "") return undefined;
      const value = String(v).trim();
      if (value.length > max) throw new DemoError(422, "validation_failed", `${k} is too long`);
      return value;
    };
    d.settings = {
      ...d.settings,
      name_ar: text("name_ar", 190) ?? d.settings.name_ar,
      name_fr: text("name_fr", 190) ?? d.settings.name_fr,
      address_ar: text("address_ar", 255) ?? d.settings.address_ar,
      address_fr: text("address_fr", 255) ?? d.settings.address_fr,
      currency: text("currency", 8) ?? d.settings.currency,
      default_locale:
        (body?.["default_locale"] as "ar" | "fr" | undefined) ?? d.settings.default_locale,
      privacy_show_phone:
        body?.["privacy_show_phone"] === undefined
          ? d.settings.privacy_show_phone
          : Boolean(body["privacy_show_phone"]),
      module_facilities:
        body?.["module_facilities"] === undefined
          ? d.settings.module_facilities
          : Boolean(body["module_facilities"]),
      module_cameras:
        body?.["module_cameras"] === undefined
          ? d.settings.module_cameras
          : Boolean(body["module_cameras"]),
    };
    pushAudit(
      manager,
      "settings_update",
      "building_settings",
      "1",
      before as unknown as Record<string, unknown>,
      d.settings as unknown as Record<string, unknown>,
    );
    return d.settings;
  }

  if (key === "GET /notifications") {
    const user = requireUser();
    return d.notifications
      .filter((n) => !n.link?.startsWith("__") || isManager)
      .map((n) => ({ ...n }))
      .slice(0, 100) as NotificationItem[];
    void user;
  }
  if (key === "GET /notifications/unread-count") {
    requireUser();
    return { unread: d.notifications.filter((n) => !n.read).length };
  }
  if (key === "POST /notifications/read-all") {
    requireUser();
    d.notifications.forEach((n) => {
      if (!n.read) {
        n.read = true;
        n.read_at = new Date().toISOString();
      }
    });
    return { ok: true };
  }
  const readMatch = /^POST \/notifications\/(\d+)\/read$/.exec(key);
  if (readMatch) {
    requireUser();
    const item = d.notifications.find((n) => n.id === Number(readMatch[1]));
    if (!item) throw new DemoError(404, "not_found", "Notification not found");
    item.read = true;
    item.read_at = new Date().toISOString();
    return { ok: true };
  }
  if (key === "POST /notifications") {
    const manager = requireManager();
    const titleAr = String(body?.["title_ar"] ?? "").trim();
    const titleFr = String(body?.["title_fr"] ?? "").trim();
    if (!titleAr || !titleFr)
      throw new DemoError(422, "validation_failed", "Both titles are required");
    const item: NotificationItem = {
      id: (d.notifications[0]?.id ?? 0) + 1,
      kind: (body?.["kind"] as NotificationItem["kind"]) ?? "system",
      title_ar: titleAr,
      title_fr: titleFr,
      body_ar: (body?.["body_ar"] as string) || null,
      body_fr: (body?.["body_fr"] as string) || null,
      link: (body?.["link"] as string) || null,
      read: false,
      read_at: null,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    d.notifications.unshift(item);
    const apartmentId = body?.["apartment_id"] ? Number(body["apartment_id"]) : null;
    const userId = body?.["user_id"] ? Number(body["user_id"]) : null;
    const recipients = userId
      ? 1
      : apartmentId
        ? d.users.filter((u) => u.apartment_id === apartmentId && u.status === "active").length
        : d.users.filter((u) => u.status === "active").length;
    pushAudit(manager, "notification_broadcast", "notification", String(item.id), null, {
      title_ar: titleAr,
      recipients,
    });
    return { sent: recipients };
  }

  const contribListMatch = /^GET \/projects\/(\d+)\/contributions$/.exec(key);
  if (contribListMatch) {
    requireUser();
    const project = d.projects.find((p) => p.id === Number(contribListMatch[1]));
    if (!project) throw new DemoError(404, "not_found", "Project not found");
    const rows: ContributionRow[] = d.apartments.map((a) => {
      const overrideKey = `${project.id}:${a.id}`;
      const required = d.requiredOverride[overrideKey] ?? project.contribution_per_apartment;
      const exempt = d.exempt[overrideKey] ?? false;
      const paid = d.payments
        .filter((p) => p.project_id === project.id && p.apartment_id === a.id)
        .reduce((sum, p) => sum + p.amount, 0);
      return {
        id: a.id,
        project_id: project.id,
        apartment_id: a.id,
        number: a.number,
        floor: a.floor,
        required,
        paid,
        balance: exempt ? 0 : required - paid,
        exempt,
        settled: exempt || paid >= required,
      };
    });
    return rows;
  }
  const contribUpdateMatch = /^PATCH \/projects\/(\d+)\/contributions\/(\d+)$/.exec(key);
  if (contribUpdateMatch) {
    const manager = requireManager();
    const overrideKey = `${contribUpdateMatch[1]}:${contribUpdateMatch[2]}`;
    const before = {
      required: d.requiredOverride[overrideKey] ?? null,
      exempt: d.exempt[overrideKey] ?? false,
    };
    if (body?.["required_amount"] !== undefined && body["required_amount"] !== "") {
      const amount = Number(body["required_amount"]);
      if (!Number.isFinite(amount) || amount < 0)
        throw new DemoError(422, "validation_failed", "Invalid amount");
      d.requiredOverride[overrideKey] = amount;
    }
    if (body?.["exempt"] !== undefined) d.exempt[overrideKey] = Boolean(body["exempt"]);
    pushAudit(manager, "contribution_update", "project_contribution", overrideKey, before, {
      required: d.requiredOverride[overrideKey] ?? null,
      exempt: d.exempt[overrideKey] ?? false,
    });
    return { ok: true };
  }

  if (key.startsWith("GET /audit-logs")) {
    requireManager();
    const url = new URLSearchParams(path.split("?")[1] ?? "");
    let rows = [...d.auditLogs];
    const entity = url.get("entity");
    const action = url.get("action");
    if (entity) rows = rows.filter((r) => r.entity === entity);
    if (action) rows = rows.filter((r) => r.action === action);
    return rows.slice(0, Number(url.get("limit") ?? 100));
  }

  if (key === "GET /files") {
    const user = requireUser();
    void user;
    return d.documents.filter((doc) => isManager || doc.visibility === "all_residents");
  }
  if (key === "POST /files") {
    const manager = requireManager();
    const file = body?.["file"] as { name?: string; size?: number; type?: string } | undefined;
    const title = String(body?.["title"] ?? "").trim();
    if (!title) throw new DemoError(422, "validation_failed", "Title is required");
    if (!file) throw new DemoError(422, "validation_failed", "No file received");
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(String(file.type)))
      throw new DemoError(415, "unsupported_type", "Only JPEG, PNG, WebP and PDF are allowed");
    if ((file.size ?? 0) > 8 * 1024 * 1024)
      throw new DemoError(413, "file_too_large", "Maximum file size is 8 MB");
    const doc: DocumentRow = {
      id: (d.documents[0]?.id ?? 0) + 1,
      file_id: (d.documents[0]?.file_id ?? 0) + 1,
      title,
      category: (body?.["category"] as string) || null,
      original_name: String(file.name ?? "file"),
      mime: String(file.type),
      size_bytes: Number(file.size ?? 0),
      visibility: (body?.["visibility"] as DocumentRow["visibility"]) ?? "all_residents",
      uploaded_by: manager.full_name,
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    d.documents.unshift(doc);
    pushAudit(manager, "file_upload", "document", String(doc.id), null, {
      title,
      mime: doc.mime,
      size_bytes: doc.size_bytes,
    });
    return { id: doc.id, file_id: doc.file_id };
  }
  const fileDeleteMatch = /^DELETE \/files\/(\d+)$/.exec(key);
  if (fileDeleteMatch) {
    const manager = requireManager();
    const index = d.documents.findIndex((doc) => doc.id === Number(fileDeleteMatch[1]));
    if (index === -1) throw new DemoError(404, "not_found", "Document not found");
    const [removed] = d.documents.splice(index, 1);
    pushAudit(
      manager,
      "file_delete",
      "document",
      String(removed?.id),
      { title: removed?.title ?? "" },
      null,
    );
    return { ok: true };
  }

  if (key === "GET /reports/financial") {
    requireManager();
    const projects = d.projects.filter((p) => p.status !== "cancelled").map(totalsFor);
    const apartments = d.apartments.map((a) => {
      const required = projects.reduce(
        (sum, p) => sum + (d.requiredOverride[`${p.id}:${a.id}`] ?? p.contribution_per_apartment),
        0,
      );
      const paid = d.payments
        .filter((p) => p.apartment_id === a.id)
        .reduce((sum, p) => sum + p.amount, 0);
      return {
        id: a.id,
        number: a.number,
        floor: a.floor,
        required_total: required,
        paid_total: paid,
        balance: required - paid,
      };
    });
    const expected = projects.reduce((sum, p) => sum + p.expected_total, 0);
    const collected = projects.reduce((sum, p) => sum + p.collected_total, 0);
    const settled = apartments.filter((a) => a.balance <= 0).length;
    const report: FinancialReport = {
      generated_at: new Date().toISOString(),
      building: {
        name_ar: d.settings.name_ar,
        name_fr: d.settings.name_fr,
        address_ar: d.settings.address_ar,
        address_fr: d.settings.address_fr,
        currency: d.settings.currency,
      },
      totals: {
        expected_total: expected,
        collected_total: collected,
        remaining_total: Math.max(0, expected - collected),
        apartments_total: apartments.length,
        apartments_settled: settled,
        apartments_unpaid: apartments.length - settled,
        payments_count: d.payments.length,
        reversals_count: d.payments.filter((p) => p.is_reversal).length,
      },
      projects: projects.map((p) => ({
        id: p.id,
        name_ar: p.name_ar,
        name_fr: p.name_fr,
        status: p.status,
        estimated_cost: p.estimated_cost,
        final_cost: p.final_cost,
        expected_total: p.expected_total,
        collected_total: p.collected_total,
        remaining_total: p.remaining_total,
        paying_apartments: p.paid_apartments,
      })),
      apartments,
    };
    return report;
  }

  if (key === "GET /dashboard") {
    const user = requireUser();
    const projects = d.projects.map(totalsFor);
    const expected = projects
      .filter((p) => p.status !== "cancelled")
      .reduce((s, p) => s + p.expected_total, 0);
    const collected = d.payments.reduce((s, p) => s + p.amount, 0);
    const settled = d.apartments.filter((a) => {
      const required = projects
        .filter((p) => p.status !== "cancelled")
        .reduce((s, p) => s + p.contribution_per_apartment, 0);
      const paid = d.payments
        .filter((p) => p.apartment_id === a.id)
        .reduce((s, p) => s + p.amount, 0);
      return paid >= required;
    }).length;
    const apt = d.apartments.find((a) => a.id === user.apartment_id);
    const required = projects
      .filter((p) => p.status !== "cancelled")
      .reduce((s, p) => s + p.contribution_per_apartment, 0);
    const paid = d.payments
      .filter((p) => p.apartment_id === user.apartment_id)
      .reduce((s, p) => s + p.amount, 0);
    const summary: DashboardSummary = {
      expected_total: expected,
      collected_total: collected,
      remaining_total: Math.max(0, expected - collected),
      apartments_total: d.apartments.length,
      apartments_settled: settled,
      apartments_unpaid: d.apartments.length - settled,
      active_projects: projects.filter((p) =>
        ["fundraising", "scheduled", "in_progress", "paused"].includes(p.status),
      ),
      recent_payments: [...d.payments]
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
        .slice(0, 8),
      my_apartment: apt
        ? {
            apartment_number: apt.number,
            floor: apt.floor,
            required,
            paid,
            balance: required - paid,
          }
        : null,
      equipment: d.equipment,
    };
    return summary;
  }

  if (key === "GET /apartments") {
    requireUser();
    const projects = d.projects.map(totalsFor).filter((p) => p.status !== "cancelled");
    const required = projects.reduce((s, p) => s + p.contribution_per_apartment, 0);
    const rows: Apartment[] = d.apartments.map((a) => {
      const paid = d.payments
        .filter((p) => p.apartment_id === a.id)
        .reduce((s, p) => s + p.amount, 0);
      const primary = d.users.find((u) => u.apartment_id === a.id && u.person_rank === "primary");
      const secondary = d.users.find(
        (u) => u.apartment_id === a.id && u.person_rank === "secondary",
      );
      return {
        id: a.id,
        number: a.number,
        floor: a.floor,
        block: null,
        notes: null,
        primary_name: primary?.full_name ?? null,
        secondary_name: secondary?.full_name ?? null,
        required_total: required,
        paid_total: paid,
        balance: required - paid,
      };
    });
    return rows;
  }

  const aptMatch = /^GET \/apartments\/(\d+)$/.exec(key);
  if (aptMatch) {
    requireUser();
    const aptId = Number(aptMatch[1]);
    const apt = d.apartments.find((a) => a.id === aptId);
    if (!apt) throw new DemoError(404, "not_found", "Apartment not found");
    const detail: ApartmentDetail = {
      apartment: { id: apt.id, number: apt.number, floor: apt.floor, block: null, notes: null },
      residents: d.users
        .filter((u) => u.apartment_id === apt.id)
        .map((u) => ({
          id: u.id,
          full_name: u.full_name,
          phone: u.phone,
          person_rank: u.person_rank,
          occupancy: u.occupancy,
          status: u.status,
          last_login_at: u.last_login_at,
        })),
      payments: d.payments
        .filter((p) => p.apartment_id === apt.id)
        .map((p) => ({
          id: p.id,
          amount: p.amount,
          paid_at: p.paid_at,
          method: p.method,
          notes: p.notes,
          name_ar: p.project_name_ar ?? "",
          name_fr: p.project_name_fr ?? "",
          receipt_no: p.receipt_no,
        })),
      contributions: d.projects.map((p) => ({
        project_id: p.id,
        required_amount: p.contribution_per_apartment,
        name_ar: p.name_ar,
        name_fr: p.name_fr,
        status: p.status,
        paid: d.payments
          .filter((x) => x.apartment_id === apt.id && x.project_id === p.id)
          .reduce((s, x) => s + x.amount, 0),
      })),
    };
    return detail;
  }

  if (key === "GET /residents") {
    requireManager();
    const rows: ResidentRow[] = d.users.map((u) => ({
      id: u.id,
      identifier: u.identifier,
      full_name: u.full_name,
      phone: u.phone,
      person_rank: u.person_rank,
      occupancy: u.occupancy,
      status: u.status,
      must_change_password: u.must_change_password,
      last_login_at: u.last_login_at,
      created_at: "",
      apartment_number: d.apartments.find((a) => a.id === u.apartment_id)?.number ?? null,
      apartment_id: u.apartment_id,
    }));
    return rows;
  }
  if (key === "POST /residents") {
    requireManager();
    const apartmentId = Number(body?.["apartment_id"]);
    const rank = (body?.["person_rank"] as "primary" | "secondary") ?? "primary";
    if (
      d.users.some(
        (u) => u.apartment_id === apartmentId && u.person_rank === rank && u.status !== "archived",
      )
    ) {
      throw new DemoError(409, "slot_taken", "This apartment already has this person");
    }
    const identifier = String(body?.["identifier"] ?? "");
    if (d.users.some((u) => u.identifier === identifier))
      throw new DemoError(409, "duplicate", "Identifier already used");
    const newUser = {
      id: Math.max(...d.users.map((u) => u.id)) + 1,
      identifier,
      full_name: String(body?.["full_name"] ?? ""),
      phone: String(body?.["phone"] ?? ""),
      apartment_id: apartmentId,
      person_rank: rank,
      occupancy: (body?.["occupancy"] as "owner" | "resident_owner") ?? "owner",
      status: "active" as const,
      must_change_password: true,
      photo_path: null,
      last_login_at: null,
      roles: ["resident"] as ["resident"],
      password: String(body?.["password"] ?? ""),
    };
    d.users.push(newUser);
    return { id: newUser.id };
  }
  const resMatch = /^PATCH \/residents\/(\d+)$/.exec(key);
  if (resMatch) {
    requireManager();
    const user = d.users.find((u) => u.id === Number(resMatch[1]));
    if (!user) throw new DemoError(404, "not_found", "Resident not found");
    if (body?.["full_name"]) user.full_name = String(body["full_name"]);
    if (body?.["phone"]) user.phone = String(body["phone"]);
    if (body?.["status"]) user.status = body["status"] as User["status"];
    if (body?.["occupancy"]) user.occupancy = body["occupancy"] as User["occupancy"];
    return { ok: true };
  }
  const resetMatch = /^POST \/residents\/(\d+)\/reset-password$/.exec(key);
  if (resetMatch) {
    requireManager();
    const user = d.users.find((u) => u.id === Number(resetMatch[1]));
    if (!user) throw new DemoError(404, "not_found", "Resident not found");
    user.password = String(body?.["password"] ?? "");
    user.must_change_password = true;
    return { ok: true };
  }

  if (key === "GET /projects") {
    requireUser();
    return d.projects.map(totalsFor);
  }
  if (key === "POST /projects") {
    requireManager();
    const project = totalsFor({
      ...(d.projects[0] as Project),
      ...(body as Partial<Project>),
      id: Math.max(...d.projects.map((p) => p.id)) + 1,
      created_at: new Date().toISOString(),
      contribution_per_apartment: Number(body?.["contribution_per_apartment"] ?? 0),
      estimated_cost: Number(body?.["estimated_cost"] ?? 0),
      progress: Number(body?.["progress"] ?? 0),
      final_cost: null,
    } as Project);
    d.projects.push(project);
    return { id: project.id };
  }
  const projMatch = /^(GET|PATCH) \/projects\/(\d+)$/.exec(key);
  if (projMatch) {
    const project = d.projects.find((p) => p.id === Number(projMatch[2]));
    if (!project) throw new DemoError(404, "not_found", "Project not found");
    if (projMatch[1] === "PATCH") {
      requireManager();
      Object.assign(project, {
        ...body,
        estimated_cost: Number(body?.["estimated_cost"] ?? project.estimated_cost),
        contribution_per_apartment: Number(
          body?.["contribution_per_apartment"] ?? project.contribution_per_apartment,
        ),
        progress: Number(body?.["progress"] ?? project.progress),
      });
      return { ok: true };
    }
    requireUser();
    return {
      project: totalsFor(project),
      apartments: d.apartments.map((a) => {
        const paid = d.payments
          .filter((p) => p.project_id === project.id && p.apartment_id === a.id)
          .reduce((s, p) => s + p.amount, 0);
        return {
          id: a.id,
          number: a.number,
          floor: a.floor,
          required: project.contribution_per_apartment,
          paid,
          settled: paid >= project.contribution_per_apartment,
        };
      }),
      stages: [],
    };
  }

  if (key.startsWith("GET /payments")) {
    const user = requireUser();
    if (path.startsWith("/payments/mine")) {
      return d.payments.filter((p) => p.apartment_id === user.apartment_id);
    }
    const url = new URLSearchParams(path.split("?")[1] ?? "");
    let rows = [...d.payments];
    const projectId = url.get("project_id");
    const apartmentId = url.get("apartment_id");
    if (projectId) rows = rows.filter((p) => p.project_id === Number(projectId));
    if (apartmentId) rows = rows.filter((p) => p.apartment_id === Number(apartmentId));
    return rows.sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  }
  if (key === "POST /payments") {
    const manager = requireManager();
    const idem = String(body?.["idempotency_key"] ?? "");
    if (d.payments.some((p) => p.notes === `idem:${idem}`))
      throw new DemoError(409, "duplicate_payment", "Already recorded");
    const project = d.projects.find((p) => p.id === Number(body?.["project_id"]));
    const apt = d.apartments.find((a) => a.id === Number(body?.["apartment_id"]));
    if (!project || !apt) throw new DemoError(404, "not_found", "Project or apartment not found");
    d.receiptCounter++;
    const receiptNo = `B29-2026-${String(d.receiptCounter).padStart(5, "0")}`;
    const payment: Payment = {
      id: Math.max(0, ...d.payments.map((p) => p.id)) + 1,
      project_id: project.id,
      apartment_id: apt.id,
      apartment_number: apt.number,
      project_name_ar: project.name_ar,
      project_name_fr: project.name_fr,
      amount: Number(body?.["amount"] ?? 0),
      method: (body?.["method"] as Payment["method"]) ?? "cash",
      paid_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      notes: (body?.["notes"] as string) ?? null,
      receipt_no: receiptNo,
      recorded_by_name: manager.full_name,
      is_reversal: false,
    };
    d.payments.push(payment);
    return { id: payment.id, receipt_no: receiptNo };
  }
  const revMatch = /^POST \/payments\/(\d+)\/reverse$/.exec(key);
  if (revMatch) {
    const manager = requireManager();
    const original = d.payments.find((p) => p.id === Number(revMatch[1]));
    if (!original) throw new DemoError(404, "not_found", "Payment not found");
    if (d.payments.some((p) => p.is_reversal && p.notes?.includes(`#${original.id}`))) {
      throw new DemoError(409, "already_reversed", "Payment already reversed");
    }
    const reversal: Payment = {
      ...original,
      id: Math.max(...d.payments.map((p) => p.id)) + 1,
      amount: -original.amount,
      paid_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      notes: `#${original.id} ${String(body?.["reason"] ?? "")}`,
      receipt_no: null,
      recorded_by_name: manager.full_name,
      is_reversal: true,
    };
    d.payments.push(reversal);
    return { id: reversal.id };
  }

  const receiptMatch = /^GET \/receipts\/(.+)$/.exec(key);
  if (receiptMatch) {
    const user = requireUser();
    const payment = d.payments.find((p) => p.receipt_no === decodeURIComponent(receiptMatch[1]!));
    if (!payment) throw new DemoError(404, "not_found", "Receipt not found");
    if (!isManager && payment.apartment_id !== user.apartment_id)
      throw new DemoError(403, "forbidden", "Not your apartment");
    const resident = d.users.find(
      (u) => u.apartment_id === payment.apartment_id && u.person_rank === "primary",
    );
    return {
      receipt: {
        ...payment,
        issued_at: payment.paid_at,
        resident_name: resident?.full_name ?? null,
      },
      building: d.settings,
    };
  }

  if (MODULE_PREFIXES.some((prefix) => path.startsWith(prefix))) requireUser();
  const moduleResult = demoModules({
    method,
    path: path.split("?")[0] ?? path,
    body,
    isManager,
    userId: me?.id ?? 0,
    userName: me?.full_name ?? "",
    apartmentId: me?.apartment_id ?? null,
    apartmentNumber: d.apartments.find((a) => a.id === me?.apartment_id)?.number ?? null,
    apartmentsCount: d.apartments.length,
    fail: (status, code, message) => {
      throw new DemoError(status, code, message);
    },
  });
  if (moduleResult !== undefined) return moduleResult;

  throw new DemoError(404, "not_found", `Demo endpoint not implemented: ${key}`);
}

export { DemoError };
