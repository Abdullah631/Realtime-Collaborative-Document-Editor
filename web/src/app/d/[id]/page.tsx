import { Suspense } from "react";
import { FullPageSpinner } from "@/lib/auth";
import { DocumentRoute } from "./DocumentRoute";

export default function DocumentPage() {
  return (
    <Suspense fallback={<FullPageSpinner label="Opening document…" />}>
      <DocumentRoute />
    </Suspense>
  );
}
