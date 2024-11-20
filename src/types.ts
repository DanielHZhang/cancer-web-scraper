import type { Dayjs } from "dayjs";

export type CancerData = {
	type: string;
	url: string;
	drugs: Drug[];
};

export type Drug = {
	name: string;
	brandName: string;
	genericName: string; // Name but without the () if there is an alternative name
	description: string;
	therapyType?: TherapyType;
	cancerType: string;
	fda: {
		approved: boolean;
		earliestApprovalDate?: Dayjs;
	};
	urls: {
		cancerGov: string;
		dailyMed?: string;
	};
	dailyMed: {
		studyText?: string;
		studyName?: string;
		studyN?: number;
	};
	clinicalStudies: {
		totalN: number;
		completedN: number;
		totalCount: number;
		completedCount: number;
	};
};

export enum TherapyType {
	Chemotherapy = "chemotherapy",
	Immunotherapy = "immunotherapy",
	HormonalTherapy = "hormonal therapy",
	TargetedTherapy = "targeted therapy",
	Unknown = "unknown",
}
