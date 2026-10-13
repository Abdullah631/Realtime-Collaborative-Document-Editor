import { colorFor, initials } from "@/lib/colors";

export function Avatar({ email, size = 28, ring, title }: { email: string; size?: number; ring?: boolean; title?: string }) {
  return (
    <span
      title={title ?? email}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${ring ? "ring-2 ring-white" : ""}`}
      style={{ background: colorFor(email), width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(email)}
    </span>
  );
}
