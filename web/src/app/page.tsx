"use client";

import { Dashboard } from "@/components/Dashboard";
import { RequireAuth } from "@/lib/auth";

export default function HomePage() {
  return <RequireAuth>{(session) => <Dashboard email={session.user.email ?? ""} />}</RequireAuth>;
}
