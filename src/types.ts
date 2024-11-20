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
	fdaApproved: boolean;
	earliestFdaApprovalDate?: Dayjs;
	cancerType: string;
	urls: {
		cancerGov: string;
		dailyMed?: string;
	};
	clinicalStudies: {
		totalN: number;
		completedN: number;
		totalCount: number;
		completedCount: number;
		previewText?: string;
	};
};
