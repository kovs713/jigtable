import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infra/db/shemas/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DB_URL,
  },
});
