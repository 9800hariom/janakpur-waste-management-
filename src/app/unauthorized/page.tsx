"use client";

import Link from "next/link";
import { ShieldAlert, ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";

export default function UnauthorizedPage() {
  const { data: session } = useSession();
  const isPendingCollector = session?.user?.role === "collector" && (session?.user as any)?.status === "pending";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-orange-50 p-4">
      <div className="w-full max-w-md bg-white/80 backdrop-blur-md p-8 rounded-3xl border border-red-150 shadow-2xl text-center space-y-6">
        <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center ${isPendingCollector ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-650'} animate-bounce`}>
          {isPendingCollector ? <Clock className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">{isPendingCollector ? "Account Pending" : "Access Denied"}</h1>
          <p className={`text-sm font-bold ${isPendingCollector ? 'text-yellow-600' : 'text-red-600'}`}>
            {isPendingCollector ? "Status: Pending Approval" : "Error 403: Forbidden"}
          </p>
        </div>

        <p className="text-sm text-gray-500 leading-relaxed">
          {isPendingCollector 
            ? "Your Collector account is waiting for Admin approval. You cannot access Collector features until your account is approved."
            : "You do not have the required permissions or role authorization to access this page. Please contact your administrator or log in with a different account."
          }
        </p>

        <div className="pt-4 flex flex-col gap-2">
          <Link href="/" passHref>
            <Button className={`w-full text-white py-6 rounded-2xl font-bold shadow-lg flex items-center justify-center space-x-2 ${isPendingCollector ? 'bg-yellow-500 hover:bg-yellow-600 shadow-yellow-200' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}>
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </Button>
          </Link>
          <Link href="/login" passHref>
            <Button variant="ghost" className="w-full py-6 rounded-2xl text-gray-600 font-semibold hover:bg-gray-150">
              Sign in with another account
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
