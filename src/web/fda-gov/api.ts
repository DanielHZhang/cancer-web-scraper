import dayjs from "dayjs";
import { baseUrls } from "../../config";
import { db, drugs, type Drug } from "../../db";
import type { GetDrugResponse } from "./types";
import { eq } from "drizzle-orm";

export async function getFdaInfo(drug: Drug) {
	if (drug.fda.retrievedAt) {
		console.log(drug.name, "using cached FDA info");
		return drug;
	}

	const brandApprovalDate = await getApprovalDate(drug.brandName, "brand");
	if (brandApprovalDate) {
		drug.fda.earliestApprovalDate = brandApprovalDate.toISOString();
	}
	if (!brandApprovalDate || drug.genericName !== drug.brandName) {
		const genericApprovalDate = await getApprovalDate(drug.genericName, "generic");

		if (genericApprovalDate && (!brandApprovalDate || genericApprovalDate.isBefore(brandApprovalDate))) {
			drug.fda.earliestApprovalDate = genericApprovalDate.toISOString();
		}
	}

	console.log(drug.name, "fetched FDA approval info");

	const [updatedDrug] = await db
		.update(drugs)
		.set({ fda: { ...drug.fda, retrievedAt: dayjs().toISOString() } })
		.where(eq(drugs.id, drug.id))
		.returning();

	return updatedDrug;
}

async function getApprovalDate(drugName: string, type: "brand" | "generic") {
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
