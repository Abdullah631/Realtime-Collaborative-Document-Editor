"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { supabase } from "@/lib/supabase";

export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-neutral-600 sm:inline">{email}</span>
      <Avatar email={email} />
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          router.replace("/login");
        }}
        className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
