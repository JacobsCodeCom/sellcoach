"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Legacy path — keep query params, land on the slim `/ext` record surface. */
export default function ExtCaptureRedirectPage() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}

function Redirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const qs = params.toString();
    router.replace(qs ? `/ext?${qs}` : "/ext");
  }, [router, params]);
  return (
    <section className="ext-section">
      <p className="muted">Opening…</p>
    </section>
  );
}
