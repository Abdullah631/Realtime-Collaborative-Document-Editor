import type { Role } from "@/lib/api";

const STYLES: Record<Role, string> = {
  owner: "bg-blue-50 text-blue-700",
  editor: "bg-emerald-50 text-emerald-700",
  viewer: "bg-neutral-100 text-neutral-600",
};

const LABELS: Record<Role, string> = { owner: "Owner", editor: "Can edit", viewer: "Can view" };

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[role]}`}>{LABELS[role]}</span>;
}
