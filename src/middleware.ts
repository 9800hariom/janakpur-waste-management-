import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Protect collector routes server-side
  if (
    path.startsWith("/collect") ||
    path.startsWith("/collector") ||
    path.startsWith("/tasks") ||
    path.startsWith("/cleanup")
  ) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", req.url);
      return NextResponse.redirect(loginUrl);
    }

    // Must be role === 'collector' AND status === 'active'
    if (token.role !== "collector" || token.status !== "active") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/collect/:path*",
    "/collector/:path*",
    "/tasks/:path*",
    "/cleanup/:path*",
  ],
};
