"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MyReportsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/report");
  }, [router]);
  return null;
}
