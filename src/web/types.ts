import type { Dayjs } from "dayjs";
import type { TherapyType } from "../db/schema";

export type ScrapedCancerData = {
	type: string;
	url: string;
};

export type ScrapedDrugData = {
	name: string;
	brandName: string;
	genericName: string; // Name but without the () if there is an alternative name
	url: string;
	// description: string;
	// therapyType?: TherapyType;
	// cancerType: string;
	// fda: {
	// 	approved: boolean;
	// 	earliestApprovalDate?: Dayjs;
	// };
	// urls: {
	// 	cancerGov: string;
	// 	dailyMed?: string;
	// };
	// dailyMed: {
	// 	studyText?: string;
	// 	studyName?: string;
	// 	studyN?: number;
	// };
	// clinicalStudies: {
	// 	totalN: number;
	// 	completedN: number;
	// 	totalCount: number;
	// 	completedCount: number;
	// };
};
