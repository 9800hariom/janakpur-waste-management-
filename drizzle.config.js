export default {
    dialect: "sqlite",
    schema: "./src/utils/db/schema.ts",
    out: "./drizzle",
    dbCredentials: {
      url: "file:./sqlite.db",
    },
  };