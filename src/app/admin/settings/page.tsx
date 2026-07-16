"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminSettingsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin?tab=gov");
  }, [router]);
  return null;
}
