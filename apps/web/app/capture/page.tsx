"use client";

import { Suspense } from "react";
import { CaptureFlow } from "@/components/capture/CaptureFlow";

export default function CapturePage() {
  return (
    <Suspense fallback={null}>
      <CaptureFlow basePath="/capture" />
    </Suspense>
  );
}
