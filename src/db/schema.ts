import { relations } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export interface CancerUrls {
	cancerGov: string;
}

export const cancers = sqliteTable("cancers", {
	id: integer().primaryKey({ autoIncrement: true }),
	type: text().unique().notNull(),
	urls: text({ mode: "json" }).$type<CancerUrls>().notNull(),
});

export const cancersRelations = relations(cancers, ({ many }) => ({
	drugs: many(drugs),
}));

export type DateString = string;

export interface DrugUrls {
	cancerGov: string;
	dailyMed?: string;
}

export interface FdaData {
	retrievedAt?: DateString;
	approved?: boolean;
	earliestApprovalDate?: DateString;
}

export interface DailyMedData {
	retrievedAt?: DateString;
	studyText?: string;
	studyName?: string;
	studyN?: number;
}

export interface ClinicalTrialsData {
	retrievedAt?: DateString;
	totalN?: number;
	completedN?: number;
	totalCount?: number;
	completedCount?: number;
}

export interface GptReasoningData {
	therapyType?: string;
}

export enum TherapyType {
	Chemotherapy = "chemotherapy",
	Immunotherapy = "immunotherapy",
	HormonalTherapy = "hormonal therapy",
	TargetedTherapy = "targeted therapy",
	Unknown = "unknown",
}

export const drugs = sqliteTable(
	"drugs",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		brandName: text().notNull(),
		genericName: text().notNull(),
		description: text(),
		therapyType: text().$type<TherapyType>(),
		urls: text({ mode: "json" }).$type<DrugUrls>().notNull(),
		fda: text({ mode: "json" }).$type<FdaData>().notNull().default({}),
		dailyMed: text({ mode: "json" }).$type<DailyMedData>().notNull().default({}),
		clinicalTrials: text({ mode: "json" }).$type<ClinicalTrialsData>().notNull().default({}),
		gptReasoning: text({ mode: "json" }).$type<GptReasoningData>().notNull().default({}),
		cancerId: integer()
			.notNull()
			.references(() => cancers.id, { onDelete: "cascade" }),
	},
	(table) => ({
		uniqueNameCancerId: unique().on(table.name, table.cancerId),
	}),
);

export const drugsRelations = relations(drugs, ({ one }) => ({
	user: one(cancers, {
		fields: [drugs.cancerId],
		references: [cancers.id],
	}),
}));
