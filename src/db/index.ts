import { drizzle } from "drizzle-orm/libsql/node";
import { databaseUrl } from "../config";

export const db = drizzle({
	connection: { url: databaseUrl },
});
