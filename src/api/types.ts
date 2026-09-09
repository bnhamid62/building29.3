export type Role = "manager" | "resident";

export interface User {
  id: number;
  identifier: string;
  full_name: string;
  phone: string;
  apartment_id: number | null;
  person_rank: "primary" | "secondary";
  occupancy: "owner" | "resident_owner";
  status: "active" | "suspended" | "archived";
  must_change_password: boolean;
  photo_path: string | null;
  last_login_at: string | null;
  roles: Role[];
}

export interface LoginResponse {
  access_token: string;
  expires_in: number;
  user: User;
}

export interface Apartment {
  id: number;
  number: string;
  floor: number;
  block: string | null;
  notes: string | null;
  primary_name: string | null;
  secondary_name: string | null;
  required_total: number;
  paid_total: number;
  balance: number;
}

export type ProjectStatus =
  | "proposed"
  | "awaiting_approval"
  | "fundraising"
  | "scheduled"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled";

export type ProjectCategory =
  | "cleaning"
  | "elevator"
  | "lighting"
  | "electricity"
  | "cameras"
  | "basement"
  | "water_leak"
  | "repair"
  | "emergency"
  | "custom";

export interface Project {
  id: number;
  name_ar: string;
  name_fr: string;
  description_ar: string | null;
  description_fr: string | null;
  category: ProjectCategory;
  custom_category: string | null;
  status: ProjectStatus;
  priority: "low" | "normal" | "high" | "urgent";
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  estimated_cost: number;
  final_cost: number | null;
  contribution_per_apartment: number;
  contractor_name: string | null;
  contractor_phone: string | null;
  progress: number;
  notes: string | null;
  expected_total: number;
  collected_total: number;
  remaining_total: number;
  paid_apartments: number;
  /** Set once the project's financial data is approved; amounts then become immutable. */
  financial_locked_at: string | null;
  financially_locked: boolean;
  created_at: string;
}

export interface ProjectApartmentRow {
  id: number;
  number: string;
  floor: number;
  required: number;
  paid: number;
  settled: boolean;
}

export interface ProjectDetail {
  project: Project;
  apartments: ProjectApartmentRow[];
  stages: Array<{ id: number; title_ar: string; title_fr: string; done: number | boolean }>;
}

export interface Payment {
  id: number;
  project_id: number;
  apartment_id: number;
  apartment_number: string | null;
  project_name_ar: string | null;
  project_name_fr: string | null;
  amount: number;
  method: "cash" | "transfer" | "online";
  paid_at: string;
  notes: string | null;
  receipt_no: string | null;
  recorded_by_name: string | null;
  is_reversal: boolean;
}

export interface BuildingSettings {
  name_ar: string;
  name_fr: string;
  address_ar: string | null;
  address_fr: string | null;
  currency: string;
  floors: number;
  apartments_count: number;
  default_locale: "ar" | "fr";
  privacy_show_phone: boolean;
  module_facilities: boolean;
  module_cameras: boolean;
  is_demo?: number | boolean;
}

export interface ReceiptResponse {
  receipt: Payment & { issued_at: string; resident_name: string | null };
  building: BuildingSettings;
}

export interface EquipmentRow {
  id: number;
  name_ar: string;
  name_fr: string;
  kind: string;
  status: "ok" | "degraded" | "down" | "maintenance";
  last_check: string | null;
}

export interface DashboardSummary {
  expected_total: number;
  collected_total: number;
  remaining_total: number;
  apartments_total: number;
  apartments_settled: number;
  apartments_unpaid: number;
  active_projects: Project[];
  recent_payments: Payment[];
  my_apartment: {
    apartment_number: string | null;
    floor: number | null;
    required: number;
    paid: number;
    balance: number;
  } | null;
  equipment: EquipmentRow[];
}

export interface ResidentRow {
  id: number;
  identifier: string;
  full_name: string;
  phone: string;
  person_rank: "primary" | "secondary";
  occupancy: "owner" | "resident_owner";
  status: "active" | "suspended" | "archived";
  must_change_password: number | boolean;
  last_login_at: string | null;
  created_at: string;
  apartment_number: string | null;
  apartment_id: number | null;
}

export interface ApartmentDetail {
  apartment: {
    id: number;
    number: string;
    floor: number;
    block: string | null;
    notes: string | null;
  };
  residents: Array<{
    id: number;
    full_name: string;
    phone: string;
    person_rank: "primary" | "secondary";
    occupancy: string;
    status: string;
    last_login_at: string | null;
  }>;
  payments: Array<{
    id: number;
    amount: number;
    paid_at: string;
    method: string;
    notes: string | null;
    name_ar: string;
    name_fr: string;
    receipt_no: string | null;
  }>;
  contributions: Array<{
    project_id: number;
    required_amount: number;
    name_ar: string;
    name_fr: string;
    status: ProjectStatus;
    paid: number;
  }>;
}

export type NotificationKind =
  | "payment"
  | "project"
  | "complaint"
  | "announcement"
  | "meeting"
  | "vote"
  | "booking"
  | "document"
  | "system";

export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  title_ar: string;
  title_fr: string;
  body_ar: string | null;
  body_fr: string | null;
  link: string | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface ContributionRow {
  id: number;
  project_id: number;
  apartment_id: number;
  number: string;
  floor: number;
  required: number;
  paid: number;
  balance: number;
  exempt: boolean;
  settled: boolean;
}

export interface AuditEntry {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: number;
  file_id: number;
  title: string;
  category: string | null;
  original_name: string;
  mime: string;
  size_bytes: number;
  visibility: "manager" | "all_residents" | "apartment";
  apartment_id?: number | null;
  apartment_number?: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface FinancialReport {
  generated_at: string;
  building: {
    name_ar: string;
    name_fr: string;
    address_ar: string | null;
    address_fr: string | null;
    currency: string;
  };
  totals: {
    expected_total: number;
    collected_total: number;
    remaining_total: number;
    apartments_total: number;
    apartments_settled: number;
    apartments_unpaid: number;
    payments_count: number;
    reversals_count: number;
  };
  projects: Array<{
    id: number;
    name_ar: string;
    name_fr: string;
    status: ProjectStatus;
    estimated_cost: number;
    final_cost: number | null;
    expected_total: number;
    collected_total: number;
    remaining_total: number;
    paying_apartments: number;
  }>;
  apartments: Array<{
    id: number;
    number: string;
    floor: number;
    required_total: number;
    paid_total: number;
    balance: number;
  }>;
}

/* ---------------- complaints ---------------- */
export interface Complaint {
  id: number;
  title: string;
  category: string;
  description: string;
  status: string;
  urgency: string;
  location: string | null;
  apartment_id: number;
  apartment_number: string | null;
  reporter_id: number;
  reporter_name: string | null;
  assigned_to: number | null;
  assignee_name: string | null;
  manager_response: string | null;
  resolved_at: string | null;
  created_at: string;
  attachments_count: number;
}

export interface ComplaintDetail {
  complaint: Complaint;
  updates: Array<{ id: number; note: string; author_name: string | null; created_at: string }>;
  attachments: Array<{
    file_id: number;
    original_name: string;
    mime: string;
    size_bytes: number;
    created_at: string;
  }>;
}

/* ---------------- votes ---------------- */
export interface Vote {
  id: number;
  title_ar: string;
  title_fr: string;
  description_ar: string | null;
  description_fr: string | null;
  status: "draft" | "open" | "closed";
  anonymous: boolean;
  live_results: boolean;
  starts_at: string;
  ends_at: string;
  final_decision: string | null;
  is_open: boolean;
  can_vote: boolean;
  has_voted: boolean;
  my_option_id: number | null;
  ballots_count: number;
}

export interface VoteDetail {
  vote: Vote & { results_visible: boolean; eligible_apartments: number };
  options: Array<{ id: number; label_ar: string; label_fr: string; tally: number }>;
}

/* ---------------- meetings ---------------- */
export interface Meeting {
  id: number;
  title_ar: string;
  title_fr: string;
  starts_at: string;
  location: string | null;
  agenda_ar: string | null;
  agenda_fr: string | null;
  minutes_ar: string | null;
  minutes_fr: string | null;
  decisions: string | null;
  status: "scheduled" | "held" | "cancelled";
}

export interface MeetingDetail {
  meeting: Meeting;
  attendance: Array<{
    apartment_id: number;
    apartment_number: string | null;
    response: string;
    attended: boolean;
  }>;
  documents: Array<{
    file_id: number;
    title: string | null;
    original_name: string;
    size_bytes: number;
    visibility: string;
  }>;
}

/* ---------------- facilities & bookings ---------------- */
export interface Facility {
  id: number;
  name_ar: string;
  name_fr: string;
  description_ar: string | null;
  description_fr: string | null;
  requires_approval: boolean;
  open_from: string;
  open_to: string;
  max_hours: number;
  active: boolean;
}

export interface Booking {
  id: number;
  facility_id: number;
  facility_name_ar: string;
  facility_name_fr: string;
  apartment_id: number;
  apartment_number: string | null;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  purpose: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface AvailabilitySlot {
  id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  mine: boolean;
  apartment_number: string | null;
}

/* ---------------- cameras ---------------- */
export interface CameraRow {
  id: number;
  name: string;
  location: string | null;
  status: string;
  coverage_ar: string | null;
  coverage_fr: string | null;
  last_inspection: string | null;
  technician_name?: string | null;
  technician_phone?: string | null;
  notes?: string | null;
  resident_visible: boolean;
}
