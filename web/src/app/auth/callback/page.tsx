import { Suspense } from "react";
import { FullPageSpinner } from "@/lib/auth";
import { AuthCallback } from "./AuthCallback";

export default function CallbackPage() {
  return (
    <Suspense fallback={<FullPageSpinner label="Signing you in…" />}>
      <AuthCallback />
    </Suspense>
  );
}
