"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminUsersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin?tab=search");
  }, [router]);
  return null;
}
