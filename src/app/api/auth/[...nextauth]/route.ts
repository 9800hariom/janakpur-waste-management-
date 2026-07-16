import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getUserByEmail } from "@/utils/db/actions";
import bcrypt from "bcryptjs";
import { db } from "@/utils/db/dbConfig";
import { Users } from "@/utils/db/schema";
import { eq } from "drizzle-orm";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email or Phone", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const emailOrPhone = credentials.email;
        let user = null;

        // Auto-provision admin if it's the first time
        if (emailOrPhone === "admin@smart janakpur waste management.com") {
          const existingAdmin = await getUserByEmail(emailOrPhone);
          if (!existingAdmin) {
            const hashedAdminPassword = await bcrypt.hash("Admin@123", 10);
            const [newAdmin] = await db.insert(Users).values({
              email: emailOrPhone,
              name: "System Admin",
              fullName: "System Admin",
              password: hashedAdminPassword,
              role: "admin",
              status: "active",
              rewardPoints: 0,
            }).returning().execute();
            user = newAdmin;
          } else {
            user = existingAdmin;
          }
        } else if (emailOrPhone.includes("@")) {
          user = await getUserByEmail(emailOrPhone);
        } else {
          // If it's a phone number, search user by phone number
          const usersList = await db.select().from(Users).where(eq(Users.phone, emailOrPhone)).execute();
          user = usersList[0] || null;
        }

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          role: user.role || "citizen",
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
