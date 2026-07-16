"use client";

import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-orange-50 p-4">
      <div className="w-full max-w-md bg-white/80 backdrop-blur-md p-8 rounded-3xl border border-red-150 shadow-2xl text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-650 animate-bounce">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">Access Denied</h1>
          <p className="text-sm font-bold text-red-600">Error 403: Forbidden</p>
        </div>

        <p className="text-sm text-gray-500 leading-relaxed">
          You do not have the required permissions or role authorization to access this page. Please contact your administrator or log in with a different account.
        </p>

        <div className="pt-4 flex flex-col gap-2">
          <Link href="/" passHref>
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white py-6 rounded-2xl font-bold shadow-lg shadow-red-200 flex items-center justify-center space-x-2">
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
