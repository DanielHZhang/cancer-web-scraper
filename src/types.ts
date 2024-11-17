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
		dailyMedUrl?: string;
	};
	clinicalStudies: {
		totalN: number;
		totalCompletedN: number;
		totalCount: number;
		previewText?: string;
	};
};
