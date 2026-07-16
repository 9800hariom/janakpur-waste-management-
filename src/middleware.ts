import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = (token?.role as string) || "citizen";
    const pathname = req.nextUrl.pathname;

    // Admin has complete access
    if (role === "admin") {
      return NextResponse.next();
    }

    // Protect admin routes
    if (pathname.startsWith("/admin")) {
      return NextResponse.rewrite(new URL("/unauthorized", req.url));
    }

    // Protect collector routes
    if (pathname.startsWith("/collect")) {
      if (role !== "collector") {
        return NextResponse.rewrite(new URL("/unauthorized", req.url));
      }
    }

    // Protect citizen routes
    if (pathname.startsWith("/report") || pathname.startsWith("/rewards")) {
      if (role !== "citizen") {
        return NextResponse.rewrite(new URL("/unauthorized", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/admin/:path*",
    "/collect/:path*",
    "/report/:path*",
    "/rewards/:path*",
  ],
};
