import dayjs from "dayjs";
import { baseUrls } from "../../config";
import type { GetDrugResponse } from "./types";
import type { Drug } from "../../types";

export async function getFdaInfo(drug: Drug) {
	const brandApprovalDate = await getApprovalDate(drug.brandName, "brand");
	drug.earliestFdaApprovalDate = brandApprovalDate;

	if (!brandApprovalDate || drug.genericName !== drug.brandName) {
		const genericApprovalDate = await getApprovalDate(drug.genericName, "generic");

		if (genericApprovalDate && (!brandApprovalDate || genericApprovalDate.isBefore(brandApprovalDate))) {
			drug.earliestFdaApprovalDate = genericApprovalDate;
		}
	}

	console.log(`Fetched FDA approval info for ${drug.name}.`);
}

export async function getApprovalDate(drugName: string, type: "brand" | "generic") {
	try {
		drugName = drugName.toLowerCase();
		const query = new URLSearchParams({
			search: `openfda.${type}_name:"${drugName}"`, // Quotes ensures an exact match
			limit: "50",
		});
		const response = await fetch(`${baseUrls.fdaDrugsApi}?${query.toString()}`);
		if (!response.ok) {
			throw response;
		}

		const data: GetDrugResponse = await response.json();
		const now = dayjs();
		let earliestApprovalDate = now;

		data.results.forEach((drug) => {
			drug.submissions.forEach((submission) => {
				// Only include original and approved submissions
				if (submission.submission_type === "ORIG" && submission.submission_status === "AP") {
					const approvalDate = dayjs(submission.submission_status_date, "YYYYMMDD");
					if (!approvalDate.isValid()) {
						return console.warn(
							`Approval date for ${drug.application_number} submission ${submission.submission_number} is invalid`,
						);
					}
					if (approvalDate.isBefore(earliestApprovalDate)) {
						earliestApprovalDate = approvalDate;
					}
				}
			});
		});

		return earliestApprovalDate !== now ? earliestApprovalDate : undefined;
	} catch (error) {
		if (error instanceof Response) {
			if (error.status === 404) {
				console.warn(`api.fda.gov could not find ${drugName}.`);
			} else {
				console.error("api.fda.gov API request failed:", error);
			}
		} else {
			console.error(error);
		}
		return undefined;
	}
}
