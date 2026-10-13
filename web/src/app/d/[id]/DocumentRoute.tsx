"use client";

import { useParams } from "next/navigation";
import { DocumentScreen } from "@/components/editor/DocumentScreen";
import { RequireAuth } from "@/lib/auth";

export function DocumentRoute() {
  const { id } = useParams<{ id: string }>();
  return <RequireAuth>{(session) => <DocumentScreen key={id} docId={id} email={session.user.email ?? ""} />}</RequireAuth>;
}
