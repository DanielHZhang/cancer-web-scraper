import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export interface DrugUrls {
	cancerGov: string;
	dailyMed?: string;
}

export interface DailyMedData {
	studyText?: string;
	studyName?: string;
	studyN?: number;
}

export interface ClinicalTrialsData {
	totalN: number;
	completedN: number;
	totalCount: number;
	completedCount: number;
}

export enum TherapyType {
	Chemotherapy = "chemotherapy",
	Immunotherapy = "immunotherapy",
	HormonalTherapy = "hormonal therapy",
	TargetedTherapy = "targeted therapy",
	Unknown = "unknown",
}

export const drugs = sqliteTable("drugs", {
	id: integer().primaryKey({ autoIncrement: true }),
	brandName: text().notNull(),
	genericName: text().notNull(),
	description: text(),
	therapyType: text().$type<TherapyType>(),
	fdaApproved: integer({ mode: "boolean" }).default(false),
	fdaEarliestApprovalDate: integer({ mode: "timestamp_ms" }),
	urls: text({ mode: "json" }).$type<DrugUrls>().notNull(),
	dailyMed: text({ mode: "json" }).$type<DailyMedData>(),
	clinicalTrials: text({ mode: "json" }).$type<ClinicalTrialsData>(),
	cancerId: integer()
		.notNull()
		.references(() => cancers.id, { onDelete: "cascade" }),
});

export const drugsRelations = relations(drugs, ({ one }) => ({
	user: one(cancers, {
		fields: [drugs.cancerId],
		references: [cancers.id],
	}),
}));
