import type { MessageKey } from "@/i18n/messages";

export const statusKey = (status: string): MessageKey => `st_${status}` as MessageKey;
export const categoryKey = (category: string): MessageKey => `cat_${category}` as MessageKey;
export const priorityKey = (priority: string): MessageKey => `pr_${priority}` as MessageKey;
export const equipmentKey = (status: string): MessageKey => `eq_${status}` as MessageKey;

export function statusTone(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "cancelled") return "destructive";
  if (status === "in_progress" || status === "fundraising") return "secondary";
  return "outline";
}
