"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CollectorRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/collect");
  }, [router]);
  return null;
}
