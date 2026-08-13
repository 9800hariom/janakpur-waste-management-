export const dynamic = "force-dynamic";

import NextAuthModule from "next-auth";
import CredentialsProviderModule from "next-auth/providers/credentials";
import { getUserByEmail } from "@/utils/db/actions";
import bcryptjs from "bcryptjs";
import { db } from "@/utils/db/dbConfig";
import { Users } from "@/utils/db/schema";
import { eq } from "drizzle-orm";

const NextAuth = (NextAuthModule as any).default || NextAuthModule;
const CredentialsProvider = (CredentialsProviderModule as any).default || CredentialsProviderModule;
const bcrypt = (bcryptjs as any).default || bcryptjs;

const authOptions: any = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email or Phone", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials: any, req: any) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const emailOrPhone = credentials.email;
        let user = null;

        // Auto-provision admin if it's the first time
        const isDefaultAdminEmail = emailOrPhone === "admin@greenjanakpur.com" || emailOrPhone === "admin@green janakpur waste management.com";
        if (isDefaultAdminEmail) {
          const existingAdmin = (await getUserByEmail("admin@greenjanakpur.com")) || (await getUserByEmail("admin@green janakpur waste management.com"));
          if (!existingAdmin) {
            const hashedAdminPassword = await bcrypt.hash("Admin@123", 10);
            const [newAdmin] = await db.insert(Users).values({
              email: "admin@greenjanakpur.com",
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
    async jwt({ token, user }: any) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
