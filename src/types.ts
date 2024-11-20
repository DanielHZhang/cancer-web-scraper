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
		previewText?: string;
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
