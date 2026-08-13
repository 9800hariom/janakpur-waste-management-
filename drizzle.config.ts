import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/utils/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "sqlite.db",
  },
});
