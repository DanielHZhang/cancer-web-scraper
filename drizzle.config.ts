import "dotenv/config";

import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/config";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/schema.ts",
	out: "./src/db/migrations",
	dbCredentials: {
		url: databaseUrl,
	},
});
