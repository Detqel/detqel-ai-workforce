import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Drizzle commands");

export default defineConfig({
  schema: "./src/infrastructure/database/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
