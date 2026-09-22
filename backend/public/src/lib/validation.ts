import { z } from "zod";

/** Client-side guards only. The PHP API stays the authority for every rule below. */

export const COMPLAINT_CATEGORIES = [
  "elevator",
  "lighting",
  "cleaning",
  "water_leak",
  "cameras",
  "basement",
  "electricity",
  "security",
  "other",
] as const;

export const COMPLAINT_STATUSES = [
  "submitted",
  "under_review",
  "approved",
  "in_progress",
  "resolved",
  "rejected",
] as const;

export const URGENCIES = ["low", "normal", "high", "critical"] as const;

export const FILE_VISIBILITIES = ["manager", "all_residents", "apartment"] as const;

export const paymentSchema = z.object({
  project_id: z.number().int().positive(),
  apartment_id: z.number().int().positive(),
  amount: z.number().positive().max(100_000_000),
  /** Cash only: the building collects contributions in person. */
  method: z.literal("cash"),
  notes: z.string().max(500).optional(),
});

export const subscriptionPaymentSchema = z.object({
  apartment_id: z.number().int().positive(),
  period: z.string().regex(/^\d{4}-\d{2}-01$/),
  amount: z.number().positive().max(100_000_000),
  method: z.literal("cash"),
  notes: z.string().max(500).optional(),
});

export const subscriptionSettingsSchema = z.object({
  monthly_amount: z.number().nonnegative().max(100_000_000),
});

export const complaintSchema = z.object({
  title: z.string().trim().min(3).max(150),
  category: z.enum(COMPLAINT_CATEGORIES),
  urgency: z.enum(URGENCIES),
  location: z.string().trim().max(120).optional(),
  description: z.string().trim().min(5).max(2000),
});

export const documentSchema = z
  .object({
    title: z.string().trim().min(2).max(190),
    category: z.string().trim().max(64).optional(),
    visibility: z.enum(FILE_VISIBILITIES),
    apartment_id: z.number().int().positive().optional(),
  })
  .refine((value) => value.visibility !== "apartment" || !!value.apartment_id, {
    path: ["apartment_id"],
    message: "apartment_required",
  });

export const residentSchema = z.object({
  full_name: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(6).max(30),
  apartment_id: z.number().int().positive(),
});

/** Returns the first Zod issue as a short field path, or null when the value is valid. */
export function firstIssue(result: z.SafeParseReturnType<unknown, unknown>): string | null {
  if (result.success) return null;
  const issue = result.error.issues[0];
  return issue ? `${issue.path.join(".") || "form"}: ${issue.message}` : "form";
}
