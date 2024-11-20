import { drizzle } from "drizzle-orm/libsql/node";
import { databaseUrl } from "../config";
import * as schema from "./schema";

export * from "./schema";

export const db = drizzle({
	schema,
	connection: { url: databaseUrl },
});

type CancerSelect = typeof schema.cancers.$inferSelect;
export interface Cancer extends CancerSelect {}

type DrugSelect = typeof schema.drugs.$inferSelect;
export interface Drug extends DrugSelect {}
