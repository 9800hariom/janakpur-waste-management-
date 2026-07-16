"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, ArrowLeft } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [mockResetUrl, setMockResetUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);
    setMockResetUrl(null);
    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: data.email }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Something went wrong");
      }

      setSuccessMsg(result.message);
      if (result.mockResetUrl) {
        setMockResetUrl(result.mockResetUrl);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center">
            <Leaf className="h-10 w-10 text-green-500 mr-2" />
            <span className="font-bold text-2xl text-gray-800">Smart Janakpur Waste Management</span>
          </Link>
        </div>
        
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Forgot Password</h2>
        <p className="text-center text-gray-500 mb-6 text-sm">Enter your email and we will send you a reset link.</p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm text-center">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6 text-sm text-center break-words">
            <p>{successMsg}</p>
            {mockResetUrl && (
              <div className="mt-4 p-3 bg-white border border-green-200 rounded text-left">
                <p className="text-xs text-gray-500 font-bold mb-1">DEVELOPMENT MOCK LINK:</p>
                <Link href={mockResetUrl} className="text-blue-600 hover:underline">
                  {mockResetUrl}
                </Link>
              </div>
            )}
          </div>
        )}

        {!successMsg && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                {...register("email")}
                className={errors.email ? "border-red-500" : ""}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-gray-600 flex justify-center items-center">
          <Link href="/login" className="text-gray-500 hover:text-gray-800 flex items-center font-medium">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
