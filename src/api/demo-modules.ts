/**
 * DEMO PREVIEW DATA for the community modules (complaints, votes, meetings,
 * bookings, cameras). Mirrors the PHP API contract exactly so the same screens
 * work unchanged once VITE_API_BASE_URL points at AppServ.
 */
import type {
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

export interface DemoCtx {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
  isManager: boolean;
  userId: number;
  userName: string;
  apartmentId: number | null;
  apartmentNumber: string | null;
  apartmentsCount: number;
  fail: (status: number, code: string, message: string) => never;
}

const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const shift = (days: number, hour = 18) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

interface State {
  complaints: Complaint[];
  complaintNotes: Record<number, Array<{ id: number; note: string; author_name: string; created_at: string }>>;
  votes: Vote[];
  voteOptions: Record<number, Array<{ id: number; label_ar: string; label_fr: string; tally: number }>>;
  ballots: Array<{ vote_id: number; apartment_id: number; option_id: number }>;
  meetings: Meeting[];
  attendance: Array<{ meeting_id: number; apartment_id: number; apartment_number: string | null; response: string; attended: boolean }>;
  facilities: Facility[];
  bookings: Booking[];
  cameras: CameraRow[];
  seq: number;
}

let state: State | null = null;

function seed(): State {
  return {
    seq: 100,
    complaints: [
      {
        id: 1,
        title: "تسرب مياه في الطابق الثالث",
        category: "water",
        description: "تسرب مياه من السقف قرب المصعد.",
        status: "in_progress",
        urgency: "high",
        location: "Palier 3",
        apartment_id: 3,
        apartment_number: "RDC-3",
        reporter_id: 3,
        reporter_name: "ساكن تجريبي",
        assigned_to: null,
        assignee_name: null,
        manager_response: "تم إبلاغ السباك.",
        resolved_at: null,
        created_at: now(),
        attachments_count: 0,
      },
    ],
    complaintNotes: {},
    votes: [
      {
        id: 1,
        title_ar: "اختيار شركة تنظيف",
        title_fr: "Choix de l'entreprise de nettoyage",
        description_ar: "التصويت على العرض الأنسب.",
        description_fr: "Vote sur l'offre la plus adaptée.",
        status: "open",
        anonymous: true,
        live_results: true,
        starts_at: shift(-3, 9),
        ends_at: shift(7, 20),
        final_decision: null,
        is_open: true,
        can_vote: true,
        has_voted: false,
        my_option_id: null,
        ballots_count: 12,
      },
    ],
    voteOptions: {
      1: [
        { id: 1, label_ar: "العرض الأول", label_fr: "Offre A", tally: 7 },
        { id: 2, label_ar: "العرض الثاني", label_fr: "Offre B", tally: 5 },
      ],
    },
    ballots: [],
    meetings: [
      {
        id: 1,
        title_ar: "الجمعية العامة السنوية",
        title_fr: "Assemblée générale annuelle",
        starts_at: shift(10),
        location: "Hall de l'immeuble",
        agenda_ar: "الميزانية، المشاريع، الانتخابات.",
        agenda_fr: "Budget, projets, élections.",
        minutes_ar: null,
        minutes_fr: null,
        decisions: null,
        status: "scheduled",
      },
    ],
    attendance: [],
    facilities: [
      {
        id: 1,
        name_ar: "قاعة الاجتماعات",
        name_fr: "Salle de réunion",
        description_ar: "قاعة مشتركة للسكان.",
        description_fr: "Salle commune des résidents.",
        requires_approval: true,
        open_from: "08:00:00",
        open_to: "22:00:00",
        max_hours: 4,
        active: true,
      },
      {
        id: 2,
        name_ar: "السطح المشترك",
        name_fr: "Terrasse commune",
        description_ar: null,
        description_fr: null,
        requires_approval: false,
        open_from: "08:00:00",
        open_to: "20:00:00",
        max_hours: 3,
        active: true,
      },
    ],
    bookings: [],
    cameras: [
      {
        id: 1,
        name: "Entrée principale",
        location: "Rez-de-chaussée",
        status: "online",
        coverage_ar: "المدخل الرئيسي",
        coverage_fr: "Entrée principale",
        last_inspection: shift(-20, 10).slice(0, 10),
        technician_name: null,
        technician_phone: null,
        notes: null,
        resident_visible: true,
      },
      {
        id: 2,
        name: "Parking",
        location: "Sous-sol",
        status: "maintenance",
        coverage_ar: "المرآب",
        coverage_fr: "Parking",
        last_inspection: shift(-40, 10).slice(0, 10),
        technician_name: null,
        technician_phone: null,
        notes: null,
        resident_visible: true,
      },
    ],
  };
}

function db(): State {
  if (!state) state = seed();
  return state;
}

/** Returns undefined when the path is not one of the module endpoints. */
export function demoModules(ctx: DemoCtx): unknown | undefined {
  const d = db();
  const key = `${ctx.method} ${ctx.path}`;
  const b = ctx.body ?? {};
  const managerOnly = () => {
    if (!ctx.isManager) ctx.fail(403, "forbidden", "Manager role required");
  };

  /* ---------------- complaints ---------------- */
  if (key === "GET /complaints") {
    return ctx.isManager ? d.complaints : d.complaints.filter((c) => c.apartment_id === ctx.apartmentId);
  }
  if (key === "POST /complaints") {
    if (ctx.isManager) ctx.fail(403, "forbidden", "Residents report complaints");
    const c: Complaint = {
      id: ++d.seq,
      title: String(b["title"] ?? ""),
      category: String(b["category"] ?? "other"),
      description: String(b["description"] ?? ""),
      status: "new",
      urgency: String(b["urgency"] ?? "normal"),
      location: (b["location"] as string) ?? null,
      apartment_id: ctx.apartmentId ?? 0,
      apartment_number: ctx.apartmentNumber,
      reporter_id: ctx.userId,
      reporter_name: ctx.userName,
      assigned_to: null,
      assignee_name: null,
      manager_response: null,
      resolved_at: null,
      created_at: now(),
      attachments_count: 0,
    };
    d.complaints.unshift(c);
    return { id: c.id };
  }
  const complaintDetail = /^GET \/complaints\/(\d+)$/.exec(key);
  if (complaintDetail) {
    const id = Number(complaintDetail[1]);
    const c = d.complaints.find((x) => x.id === id);
    if (!c) ctx.fail(404, "not_found", "Complaint not found");
    if (!ctx.isManager && c!.apartment_id !== ctx.apartmentId) ctx.fail(403, "forbidden", "Not your complaint");
    const detail: ComplaintDetail = { complaint: c!, updates: d.complaintNotes[id] ?? [], attachments: [] };
    return detail;
  }
  const complaintPatch = /^PATCH \/complaints\/(\d+)$/.exec(key);
  if (complaintPatch) {
    managerOnly();
    const c = d.complaints.find((x) => x.id === Number(complaintPatch[1]));
    if (!c) ctx.fail(404, "not_found", "Complaint not found");
    if (b["status"]) c!.status = String(b["status"]);
    if (b["manager_response"] !== undefined) c!.manager_response = String(b["manager_response"]);
    if (c!.status === "resolved" || c!.status === "closed") c!.resolved_at = now();
    return { ok: true };
  }
  const complaintNote = /^POST \/complaints\/(\d+)\/notes$/.exec(key);
  if (complaintNote) {
    const id = Number(complaintNote[1]);
    const c = d.complaints.find((x) => x.id === id);
    if (!c) ctx.fail(404, "not_found", "Complaint not found");
    if (!ctx.isManager && c.apartment_id !== ctx.apartmentId) ctx.fail(403, "forbidden", "Not your complaint");
    const list = d.complaintNotes[id] ?? (d.complaintNotes[id] = []);
    list.push({ id: ++d.seq, note: String(b["note"] ?? ""), author_name: ctx.userName, created_at: now() });
    return { ok: true };
  }
  if (/^POST \/complaints\/\d+\/attachments$/.test(key)) {
    ctx.fail(400, "demo_mode", "File uploads need the PHP API");
  }

  /* ---------------- votes ---------------- */
  if (key === "GET /votes") {
    return d.votes.filter((v) => ctx.isManager || v.status !== "draft");
  }
  if (key === "POST /votes") {
    managerOnly();
    const id = ++d.seq;
    const options = (b["options"] as Array<{ label_ar: string; label_fr: string }> | undefined) ?? [];
    d.votes.unshift({
      id,
      title_ar: String(b["title_ar"] ?? ""),
      title_fr: String(b["title_fr"] ?? ""),
      description_ar: (b["description_ar"] as string) ?? null,
      description_fr: (b["description_fr"] as string) ?? null,
      status: "open",
      anonymous: true,
      live_results: true,
      starts_at: now(),
      ends_at: String(b["ends_at"] ?? shift(7, 20)),
      final_decision: null,
      is_open: true,
      can_vote: true,
      has_voted: false,
      my_option_id: null,
      ballots_count: 0,
    });
    d.voteOptions[id] = options.map((o, i) => ({ id: id * 100 + i, label_ar: o.label_ar, label_fr: o.label_fr, tally: 0 }));
    return { id };
  }
  const voteDetail = /^GET \/votes\/(\d+)$/.exec(key);
  if (voteDetail) {
    const id = Number(voteDetail[1]);
    const v = d.votes.find((x) => x.id === id);
    if (!v) ctx.fail(404, "not_found", "Vote not found");
    if (!ctx.isManager && v!.status === "draft") ctx.fail(403, "forbidden", "Not published");
    const detail: VoteDetail = {
      vote: { ...v!, results_visible: ctx.isManager || v!.live_results || v!.status === "closed", eligible_apartments: ctx.apartmentsCount },
      options: d.voteOptions[id] ?? [],
    };
    return detail;
  }
  const votePatch = /^PATCH \/votes\/(\d+)$/.exec(key);
  if (votePatch) {
    managerOnly();
    const v = d.votes.find((x) => x.id === Number(votePatch[1]));
    if (!v) ctx.fail(404, "not_found", "Vote not found");
    if (b["status"]) {
      v!.status = String(b["status"]) as Vote["status"];
      v!.is_open = v!.status === "open";
    }
    if (b["final_decision"] !== undefined) v!.final_decision = String(b["final_decision"]);
    return { ok: true };
  }
  const ballot = /^POST \/votes\/(\d+)\/ballot$/.exec(key);
  if (ballot) {
    const id = Number(ballot[1]);
    const v = d.votes.find((x) => x.id === id);
    if (!v) ctx.fail(404, "not_found", "Vote not found");
    if (ctx.isManager || !ctx.apartmentId) ctx.fail(403, "forbidden", "Only residents vote");
    if (!v!.is_open) ctx.fail(409, "vote_closed", "Vote is closed");
    if (d.ballots.some((x) => x.vote_id === id && x.apartment_id === ctx.apartmentId)) {
      ctx.fail(409, "already_voted", "This apartment already voted");
    }
    const optionId = Number(b["option_id"]);
    const opt = (d.voteOptions[id] ?? []).find((o) => o.id === optionId);
    if (!opt) ctx.fail(422, "validation_failed", "Unknown option");
    opt!.tally++;
    d.ballots.push({ vote_id: id, apartment_id: ctx.apartmentId!, option_id: optionId });
    v!.ballots_count++;
    v!.has_voted = true;
    v!.my_option_id = optionId;
    return { ok: true };
  }

  /* ---------------- meetings ---------------- */
  if (key === "GET /meetings") return d.meetings;
  if (key === "POST /meetings") {
    managerOnly();
    const m: Meeting = {
      id: ++d.seq,
      title_ar: String(b["title_ar"] ?? ""),
      title_fr: String(b["title_fr"] ?? ""),
      starts_at: String(b["starts_at"] ?? shift(7)),
      location: (b["location"] as string) ?? null,
      agenda_ar: (b["agenda_ar"] as string) ?? null,
      agenda_fr: (b["agenda_fr"] as string) ?? null,
      minutes_ar: null,
      minutes_fr: null,
      decisions: null,
      status: "scheduled",
    };
    d.meetings.unshift(m);
    return { id: m.id };
  }
  const meetingDetail = /^GET \/meetings\/(\d+)$/.exec(key);
  if (meetingDetail) {
    const id = Number(meetingDetail[1]);
    const m = d.meetings.find((x) => x.id === id);
    if (!m) ctx.fail(404, "not_found", "Meeting not found");
    const rows = d.attendance.filter((a) => a.meeting_id === id && (ctx.isManager || a.apartment_id === ctx.apartmentId));
    const detail: MeetingDetail = { meeting: m!, attendance: rows, documents: [] };
    return detail;
  }
  const meetingPatch = /^PATCH \/meetings\/(\d+)$/.exec(key);
  if (meetingPatch) {
    managerOnly();
    const m = d.meetings.find((x) => x.id === Number(meetingPatch[1]));
    if (!m) ctx.fail(404, "not_found", "Meeting not found");
    if (b["status"]) m!.status = String(b["status"]) as Meeting["status"];
    if (b["minutes_ar"] !== undefined) m!.minutes_ar = String(b["minutes_ar"]);
    if (b["minutes_fr"] !== undefined) m!.minutes_fr = String(b["minutes_fr"]);
    if (b["decisions"] !== undefined) m!.decisions = String(b["decisions"]);
    return { ok: true };
  }
  const rsvp = /^POST \/meetings\/(\d+)\/attendance$/.exec(key);
  if (rsvp) {
    const id = Number(rsvp[1]);
    const apartmentId = ctx.isManager ? Number(b["apartment_id"]) : ctx.apartmentId;
    if (!apartmentId) ctx.fail(422, "validation_failed", "Apartment required");
    const row = d.attendance.find((a) => a.meeting_id === id && a.apartment_id === apartmentId);
    const response = String(b["response"] ?? row?.response ?? "yes");
    if (row) {
      row.response = response;
      if (b["attended"] !== undefined) row.attended = !!b["attended"];
    } else {
      d.attendance.push({
        meeting_id: id,
        apartment_id: apartmentId,
        apartment_number: ctx.isManager ? String(apartmentId) : ctx.apartmentNumber,
        response,
        attended: !!b["attended"],
      });
    }
    return { ok: true };
  }
  if (/^POST \/meetings\/\d+\/documents$/.test(key)) ctx.fail(400, "demo_mode", "File uploads need the PHP API");

  /* ---------------- facilities & bookings ---------------- */
  if (key === "GET /facilities") return d.facilities;
  if (key === "POST /facilities" || /^PATCH \/facilities\/\d+$/.test(key)) {
    managerOnly();
    return { ok: true };
  }
  const availability = /^GET \/facilities\/(\d+)\/availability/.exec(key);
  if (availability) {
    const fid = Number(availability[1]);
    return d.bookings
      .filter((x) => x.facility_id === fid && x.status !== "rejected" && x.status !== "cancelled")
      .map((x) => ({
        id: x.id,
        starts_at: x.starts_at,
        ends_at: x.ends_at,
        status: x.status,
        mine: x.apartment_id === ctx.apartmentId,
        apartment_number: ctx.isManager ? x.apartment_number : null,
      }));
  }
  if (key === "GET /bookings") {
    return ctx.isManager ? d.bookings : d.bookings.filter((x) => x.apartment_id === ctx.apartmentId);
  }
  if (key === "POST /bookings") {
    if (!ctx.apartmentId) ctx.fail(403, "forbidden", "Residents book facilities");
    const facility = d.facilities.find((f) => f.id === Number(b["facility_id"]));
    if (!facility) ctx.fail(404, "not_found", "Facility not found");
    const starts = String(b["starts_at"] ?? "");
    const ends = String(b["ends_at"] ?? "");
    if (!starts || !ends || ends <= starts) ctx.fail(422, "validation_failed", "Invalid time range");
    const clash = d.bookings.some(
      (x) => x.facility_id === facility!.id && x.status !== "rejected" && x.status !== "cancelled" && starts < x.ends_at && ends > x.starts_at,
    );
    if (clash) ctx.fail(409, "slot_taken", "This slot is already booked");
    const booking: Booking = {
      id: ++d.seq,
      facility_id: facility!.id,
      facility_name_ar: facility!.name_ar,
      facility_name_fr: facility!.name_fr,
      apartment_id: ctx.apartmentId,
      apartment_number: ctx.apartmentNumber,
      starts_at: starts,
      ends_at: ends,
      status: facility!.requires_approval ? "pending" : "approved",
      purpose: (b["purpose"] as string) ?? null,
      decision_note: null,
      created_at: now(),
    };
    d.bookings.unshift(booking);
    return { id: booking.id, status: booking.status };
  }
  const bookingPatch = /^PATCH \/bookings\/(\d+)$/.exec(key);
  if (bookingPatch) {
    const bk = d.bookings.find((x) => x.id === Number(bookingPatch[1]));
    if (!bk) ctx.fail(404, "not_found", "Booking not found");
    const status = String(b["status"] ?? "");
    if (!ctx.isManager) {
      if (bk!.apartment_id !== ctx.apartmentId) ctx.fail(403, "forbidden", "Not your booking");
      if (status !== "cancelled") ctx.fail(403, "forbidden", "Residents can only cancel");
    }
    bk!.status = status as Booking["status"];
    if (b["decision_note"] !== undefined) bk!.decision_note = String(b["decision_note"]);
    return { ok: true };
  }

  /* ---------------- cameras ---------------- */
  if (key === "GET /cameras") {
    return ctx.isManager
      ? d.cameras
      : d.cameras
          .filter((c) => c.resident_visible)
          .map((c) => ({ ...c, technician_name: null, technician_phone: null, notes: null }));
  }
  if (key === "POST /cameras" || /^(PATCH|DELETE) \/cameras\/\d+$/.test(key)) {
    managerOnly();
    return { ok: true };
  }

  return undefined;
}
