"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminAnalyticsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin?tab=analytics");
  }, [router]);
  return null;
}
