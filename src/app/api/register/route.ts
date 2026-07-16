import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/utils/db/dbConfig";
import { Users } from "@/utils/db/schema";
import { eq } from "drizzle-orm";

const citizenRegisterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  wardNumber: z.string().min(1, "Ward Number is required").regex(/^\d+$/, "Ward Number must be numeric"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().min(7, "Phone number must be at least 7 digits").max(15, "Phone number is too long").optional().or(z.literal("")),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      "Password must contain one uppercase, one lowercase, one number, and one special character"),
}).refine((data) => data.email || data.phone, {
  message: "Either Email or Phone Number must be provided",
  path: ["email"],
});

const collectorRegisterSchema = z.object({
  name: z.string().min(1, "Full Name is mandatory"),
  address: z.string().min(1, "Address is mandatory"),
  wardNumber: z.string().min(1, "Ward Number is mandatory").regex(/^\d+$/, "Ward Number must be numeric"),
  governmentId: z.string().min(1, "Government ID or Employee ID is mandatory"),
  phone: z.string().min(7, "Phone Number must be at least 7 digits").max(15, "Phone number is too long"),
  email: z.string().email("Valid Email is mandatory"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      "Password must contain one uppercase, one lowercase, one number, and one special character"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { role } = body;

    if (role === "collector") {
      const parsedData = collectorRegisterSchema.parse(body);

      // Unique check: Email
      const existingEmail = await db.select().from(Users).where(eq(Users.email, parsedData.email)).execute();
      if (existingEmail.length > 0) {
        return NextResponse.json({ error: "User with this email already exists" }, { status: 400 });
      }

      // Unique check: Phone
      const existingPhone = await db.select().from(Users).where(eq(Users.phone, parsedData.phone)).execute();
      if (existingPhone.length > 0) {
        return NextResponse.json({ error: "User with this phone number already exists" }, { status: 400 });
      }

      // Unique check: Government ID
      const existingGovId = await db.select().from(Users).where(eq(Users.governmentId, parsedData.governmentId)).execute();
      if (existingGovId.length > 0) {
        return NextResponse.json({ error: "User with this Government ID already exists" }, { status: 400 });
      }

      const hashedPassword = await bcrypt.hash(parsedData.password, 10);
      const [user] = await db.insert(Users).values({
        email: parsedData.email,
        name: parsedData.name,
        fullName: parsedData.name,
        password: hashedPassword,
        role: "collector",
        address: parsedData.address,
        wardNumber: parsedData.wardNumber,
        phone: parsedData.phone,
        governmentId: parsedData.governmentId,
        status: "active",
        rewardPoints: 0,
      }).returning().execute();

      return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, { status: 201 });

    } else {
      // Default to citizen
      const parsedData = citizenRegisterSchema.parse(body);

      // Verify email is unique if provided
      if (parsedData.email) {
        const existingEmail = await db.select().from(Users).where(eq(Users.email, parsedData.email)).execute();
        if (existingEmail.length > 0) {
          return NextResponse.json({ error: "User with this email already exists" }, { status: 400 });
        }
      }

      // Verify phone is unique if provided
      if (parsedData.phone) {
        const existingPhone = await db.select().from(Users).where(eq(Users.phone, parsedData.phone)).execute();
        if (existingPhone.length > 0) {
          return NextResponse.json({ error: "User with this phone number already exists" }, { status: 400 });
        }
      }

      // Citizen email is set to phone + "@smart janakpur waste management.com" if email is empty
      const userEmail = parsedData.email || `${parsedData.phone}@smart janakpur waste management.com`;
      const hashedPassword = await bcrypt.hash(parsedData.password, 10);
      
      const [user] = await db.insert(Users).values({
        email: userEmail,
        name: parsedData.name,
        fullName: parsedData.name,
        password: hashedPassword,
        role: "citizen",
        address: parsedData.address,
        wardNumber: parsedData.wardNumber,
        phone: parsedData.phone || null,
        status: "active",
        rewardPoints: 0,
      }).returning().execute();

      return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, { status: 201 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: (error as any).errors[0].message }, { status: 400 });
    }
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
