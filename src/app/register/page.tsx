"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, User, Shield, Phone, MapPin, Building, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "react-hot-toast";

// Validation Schema for Citizen
const citizenSchema = z.object({
  name: z.string().min(1, "Full Name is required"),
  address: z.string().min(1, "Address is required"),
  wardNumber: z.string().min(1, "Ward Number is required").regex(/^\d+$/, "Ward Number must be numeric"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 numeric digits").optional().or(z.literal("")),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      "Password must contain one uppercase, one lowercase, one number, and one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.email || data.phone, {
  message: "Either Email or Phone Number must be provided",
  path: ["email"],
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// Validation Schema for Collector
const collectorSchema = z.object({
  name: z.string().min(1, "Full Name is mandatory"),
  address: z.string().min(1, "Address is mandatory"),
  wardNumber: z.string().min(1, "Ward Number is mandatory").regex(/^\d+$/, "Ward Number must be numeric"),
  governmentId: z.string().min(1, "Government ID or Employee ID is mandatory"),
  phone: z.string().min(1, "Phone Number is required").regex(/^\d{10}$/, "Mobile number must be exactly 10 numeric digits"),
  email: z.string().email("Valid Email is mandatory"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      "Password must contain one uppercase, one lowercase, one number, and one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type CitizenFormData = z.infer<typeof citizenSchema>;
type CollectorFormData = z.infer<typeof collectorSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<"citizen" | "collector">("citizen");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Password visibility states
  const [showCKey, setShowCKey] = useState(false);
  const [showCConf, setShowCConf] = useState(false);
  const [showColKey, setShowColKey] = useState(false);
  const [showColConf, setShowColConf] = useState(false);

  // Form setup for Citizen
  const citizenForm = useForm<CitizenFormData>({
    resolver: zodResolver(citizenSchema),
    defaultValues: {
      name: "",
      address: "",
      wardNumber: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    }
  });

  // Form setup for Collector
  const collectorForm = useForm<CollectorFormData>({
    resolver: zodResolver(collectorSchema),
    defaultValues: {
      name: "",
      address: "",
      wardNumber: "",
      governmentId: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
    }
  });

  const onSubmitCitizen = async (data: CitizenFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, role: "citizen" }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to register.");
      }

      toast.success("Citizen account created successfully!");
      router.push("/login?registered=true");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitCollector = async (data: CollectorFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, role: "collector" }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to register.");
      }

      toast.success("Collector account created successfully!");
      router.push("/login?registered=true");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50 p-4 md:p-8">
      <div className="w-full max-w-lg bg-white/80 backdrop-blur-md p-6 sm:p-8 rounded-3xl border border-white/20 shadow-2xl transition-all duration-300">
        
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Link href="/" className="flex items-center space-x-2">
            <Leaf className="h-9 w-9 text-green-600 animate-pulse" />
            <span className="font-bold text-2xl text-gray-800 tracking-tight">green Janakpur Waste Management</span>
          </Link>
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-800 tracking-tight">Create an Account</h2>
        <p className="text-center text-xs text-gray-500 mt-1 mb-6">Join our community in making waste management efficient.</p>

        {/* Role Toggle Selector */}
        <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 shadow-sm mb-6">
          <button
            type="button"
            onClick={() => { setRole("citizen"); setError(null); }}
            className={`py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 ${
              role === "citizen" ? "bg-white text-green-700 shadow-md" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <User className="w-4 h-4" />
            <span>Citizen</span>
          </button>
          <button
            type="button"
            onClick={() => { setRole("collector"); setError(null); }}
            className={`py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 ${
              role === "collector" ? "bg-white text-green-700 shadow-md" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Collector</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 border border-red-100 p-3.5 rounded-2xl mb-6 text-xs font-semibold animate-shake">
            {error}
          </div>
        )}

        {role === "citizen" ? (
          /* CITIZEN REGISTRATION FORM */
          <form onSubmit={citizenForm.handleSubmit(onSubmitCitizen)} className="space-y-4 text-left">
            <div>
              <Label htmlFor="c-name" className="text-xs font-semibold text-gray-600">Full Name</Label>
              <div className="relative mt-1">
                <Input
                  id="c-name"
                  placeholder="Hariom Yadav"
                  {...citizenForm.register("name")}
                  className={`pl-9 py-5 rounded-xl ${citizenForm.formState.errors.name ? "border-red-500" : ""}`}
                />
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              </div>
              {citizenForm.formState.errors.name && <p className="text-red-500 text-[11px] mt-1">{citizenForm.formState.errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="c-address" className="text-xs font-semibold text-gray-600">Address</Label>
                <div className="relative mt-1">
                  <Input
                    id="c-address"
                    placeholder="Janakpur"
                    {...citizenForm.register("address")}
                    className={`pl-9 py-5 rounded-xl ${citizenForm.formState.errors.address ? "border-red-500" : ""}`}
                  />
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                </div>
                {citizenForm.formState.errors.address && <p className="text-red-500 text-[11px] mt-1">{citizenForm.formState.errors.address.message}</p>}
              </div>

              <div>
                <Label htmlFor="c-ward" className="text-xs font-semibold text-gray-600">Ward Number</Label>
                <div className="relative mt-1">
                  <Input
                    id="c-ward"
                    type="number"
                    inputMode="numeric"
                    maxLength={25}
                    placeholder="1 to 25"
                    {...citizenForm.register("wardNumber")}
                    className={`pl-9 py-5 rounded-xl ${citizenForm.formState.errors.wardNumber ? "border-red-500" : ""}`}
                  />
                  <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                </div>
                {citizenForm.formState.errors.wardNumber && <p className="text-red-500 text-[11px] mt-1">{citizenForm.formState.errors.wardNumber.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="c-email" className="text-xs font-semibold text-gray-600">Email Address (Optional if Phone is set)</Label>
                <Input
                  id="c-email"
                  type="email"
                  placeholder="hariom@example.com"
                  {...citizenForm.register("email")}
                  className={`py-5 rounded-xl mt-1 ${citizenForm.formState.errors.email ? "border-red-500" : ""}`}
                />
                {citizenForm.formState.errors.email && <p className="text-red-500 text-[11px] mt-1">{citizenForm.formState.errors.email.message}</p>}
              </div>

              <div>
                <Label htmlFor="c-phone" className="text-xs font-semibold text-gray-600">Mobile Number (10 Digits Only)</Label>
                <div className="relative mt-1">
                  <Input
                    id="c-phone"
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="9876543210"
                    {...citizenForm.register("phone")}
                    onChange={(e) => {
                      const numericOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
                      citizenForm.setValue("phone", numericOnly, { shouldValidate: true });
                    }}
                    className={`pl-9 py-5 rounded-xl ${citizenForm.formState.errors.phone ? "border-red-500" : ""}`}
                  />
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                </div>
                {citizenForm.formState.errors.phone && <p className="text-red-500 text-[11px] mt-1">{citizenForm.formState.errors.phone.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="c-pass" className="text-xs font-semibold text-gray-600">Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="c-pass"
                    type={showCKey ? "text" : "password"}
                    placeholder="••••••••"
                    {...citizenForm.register("password")}
                    className={`pl-9 pr-10 py-5 rounded-xl ${citizenForm.formState.errors.password ? "border-red-500" : ""}`}
                  />
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <button
                    type="button"
                    onClick={() => setShowCKey(!showCKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-655 focus:outline-none"
                  >
                    {showCKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {citizenForm.formState.errors.password && <p className="text-red-500 text-[11px] mt-1 leading-tight">{citizenForm.formState.errors.password.message}</p>}
              </div>

              <div>
                <Label htmlFor="c-conf" className="text-xs font-semibold text-gray-600">Confirm Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="c-conf"
                    type={showCConf ? "text" : "password"}
                    placeholder="••••••••"
                    {...citizenForm.register("confirmPassword")}
                    className={`pl-9 pr-10 py-5 rounded-xl ${citizenForm.formState.errors.confirmPassword ? "border-red-500" : ""}`}
                  />
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <button
                    type="button"
                    onClick={() => setShowCConf(!showCConf)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-655 focus:outline-none"
                  >
                    {showCConf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {citizenForm.formState.errors.confirmPassword && <p className="text-red-500 text-[11px] mt-1">{citizenForm.formState.errors.confirmPassword.message}</p>}
              </div>
            </div>

            <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 py-6 rounded-2xl font-bold shadow-lg shadow-green-200 text-white transition-all duration-200 mt-2" disabled={isLoading}>
              {isLoading ? "Creating Citizen Account..." : "Create Citizen Account"}
            </Button>
          </form>
        ) : (
          /* COLLECTOR REGISTRATION FORM */
          <form onSubmit={collectorForm.handleSubmit(onSubmitCollector)} className="space-y-4 text-left">
            <div>
              <Label htmlFor="col-name" className="text-xs font-semibold text-gray-600">Full Name</Label>
              <div className="relative mt-1">
                <Input
                  id="col-name"
                  placeholder="Name"
                  {...collectorForm.register("name")}
                  className={`pl-9 py-5 rounded-xl ${collectorForm.formState.errors.name ? "border-red-500" : ""}`}
                />
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              </div>
              {collectorForm.formState.errors.name && <p className="text-red-500 text-[11px] mt-1">{collectorForm.formState.errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="col-address" className="text-xs font-semibold text-gray-600">Address</Label>
                <div className="relative mt-1">
                  <Input
                    id="col-address"
                    placeholder="Janakpur"
                    {...collectorForm.register("address")}
                    className={`pl-9 py-5 rounded-xl ${collectorForm.formState.errors.address ? "border-red-500" : ""}`}
                  />
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                </div>
                {collectorForm.formState.errors.address && <p className="text-red-500 text-[11px] mt-1">{collectorForm.formState.errors.address.message}</p>}
              </div>

              <div>
                <Label htmlFor="col-ward" className="text-xs font-semibold text-gray-600">Ward Number</Label>
                <div className="relative mt-1">
                  <Input
                    id="col-ward"
                    type="number"
                    inputMode="numeric"
                    placeholder="1 To 25 "
                    {...collectorForm.register("wardNumber")}
                    className={`pl-9 py-5 rounded-xl ${collectorForm.formState.errors.wardNumber ? "border-red-500" : ""}`}
                  />
                  <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                </div>
                {collectorForm.formState.errors.wardNumber && <p className="text-red-500 text-[11px] mt-1">{collectorForm.formState.errors.wardNumber.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="col-gov" className="text-xs font-semibold text-gray-600">Government ID / Employee ID</Label>
                <Input
                  id="col-gov"
                 
                  inputMode="numeric"
                  placeholder="ID-98765"
                  {...collectorForm.register("governmentId")}
                  className={`py-5 rounded-xl mt-1 ${collectorForm.formState.errors.governmentId ? "border-red-500" : ""}`}
                />
                {collectorForm.formState.errors.governmentId && <p className="text-red-500 text-[11px] mt-1">{collectorForm.formState.errors.governmentId.message}</p>}
              </div>

              <div>
                <Label htmlFor="col-phone" className="text-xs font-semibold text-gray-600">Mobile Number (10 Digits Only)</Label>
                <div className="relative mt-1">
                  <Input
                    id="col-phone"
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="9812345678"
                    {...collectorForm.register("phone")}
                    onChange={(e) => {
                      const numericOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
                      collectorForm.setValue("phone", numericOnly, { shouldValidate: true });
                    }}
                    className={`pl-9 py-5 rounded-xl ${collectorForm.formState.errors.phone ? "border-red-500" : ""}`}
                  />
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                </div>
                {collectorForm.formState.errors.phone && <p className="text-red-500 text-[11px] mt-1">{collectorForm.formState.errors.phone.message}</p>}
              </div>
            </div>

            <div>
              <Label htmlFor="col-email" className="text-xs font-semibold text-gray-600">Email Address</Label>
              <Input
                id="col-email"
                type="email"
                placeholder="collector@example.com"
                {...collectorForm.register("email")}
                className={`py-5 rounded-xl mt-1 ${collectorForm.formState.errors.email ? "border-red-500" : ""}`}
              />
              {collectorForm.formState.errors.email && <p className="text-red-500 text-[11px] mt-1">{collectorForm.formState.errors.email.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="col-pass" className="text-xs font-semibold text-gray-600">Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="col-pass"
                    type={showColKey ? "text" : "password"}
                    placeholder="••••••••"
                    {...collectorForm.register("password")}
                    className={`pl-9 pr-10 py-5 rounded-xl ${collectorForm.formState.errors.password ? "border-red-500" : ""}`}
                  />
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <button
                    type="button"
                    onClick={() => setShowColKey(!showColKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-655 focus:outline-none"
                  >
                    {showColKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {collectorForm.formState.errors.password && <p className="text-red-500 text-[11px] mt-1 leading-tight">{collectorForm.formState.errors.password.message}</p>}
              </div>

              <div>
                <Label htmlFor="col-conf" className="text-xs font-semibold text-gray-600">Confirm Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="col-conf"
                    type={showColConf ? "text" : "password"}
                    placeholder="••••••••"
                    {...collectorForm.register("confirmPassword")}
                    className={`pl-9 pr-10 py-5 rounded-xl ${collectorForm.formState.errors.confirmPassword ? "border-red-500" : ""}`}
                  />
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <button
                    type="button"
                    onClick={() => setShowColConf(!showColConf)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-655 focus:outline-none"
                  >
                    {showColConf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {collectorForm.formState.errors.confirmPassword && <p className="text-red-500 text-[11px] mt-1">{collectorForm.formState.errors.confirmPassword.message}</p>}
              </div>
            </div>

            <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 py-6 rounded-2xl font-bold shadow-lg shadow-green-200 text-white transition-all duration-200 mt-2" disabled={isLoading}>
              {isLoading ? "Creating Collector Account..." : "Create Collector Account"}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link href="/login" className="text-green-600 hover:underline font-semibold">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
