import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { getUserByEmail, saveResetToken } from "@/utils/db/actions";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = forgotPasswordSchema.parse(body);

    const user = await getUserByEmail(email);
    if (!user) {
      // For security, do not reveal if the email exists or not
      return NextResponse.json({ success: true, message: "If an account with that email exists, we sent a password reset link." });
    }

    // Generate random crypto token
    const token = crypto.randomBytes(32).toString("hex");
    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 3600000); 

    await saveResetToken(email, token, expiresAt);

    // MOCK EMAIL SENDING: 
    // In a real app, you would use an email provider like SendGrid here.
    // For now, we return the reset link in the API response so you can test it in the UI.
    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    console.log(`Password reset link generated for ${email}: ${resetUrl}`);

    return NextResponse.json({ 
      success: true, 
      message: "If an account with that email exists, we sent a password reset link.",
      mockResetUrl: resetUrl // This is for development testing ONLY
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: (error as any).errors[0].message }, { status: 400 });
    }
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
