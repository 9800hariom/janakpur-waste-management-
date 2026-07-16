"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CleanupRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/collect");
  }, [router]);
  return null;
}
