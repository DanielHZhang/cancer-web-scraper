import { baseUrls } from "../../config";
import type { Drug } from "../../types";
import { StudyStatus, type GetStudiesResponse } from "./types";

/**
 * Query clinicaltrials.gov for the number of trials with the drug
 */
export async function getClinicalTrials(drug: Drug) {
	let nextPageToken: string | symbol | undefined = Symbol();
	while (nextPageToken) {
		try {
			const query = new URLSearchParams({
				format: "json",
				"query.intr": drug.genericName,
				aggFilters: "studyType:int",
				fields: "ProtocolSection",
				countTotal: "true",
				pageSize: "50",
			});
			if (typeof nextPageToken === "string") {
				query.append("pageToken", nextPageToken);
			}
			const response = await fetch(`${baseUrls.clinicalTrialsApi}?${query.toString()}`, {
				headers: { Accept: "application/json" },
			});
			if (!response.ok) {
				throw response;
			}
			const data: GetStudiesResponse = await response.json();
			if (typeof data.totalCount === "number") {
				drug.clinicalStudies.totalCount = data.totalCount;
			}
			let totalN = 0;
			let completedN = 0;
			let completedCount = 0;
			for (const study of data.studies) {
				const { designModule, statusModule } = study.protocolSection;
				const { designInfo, enrollmentInfo } = designModule;
				if (designInfo?.allocation !== "RANDOMIZED") {
					continue;
				}
				if (
					statusModule.overallStatus === StudyStatus.COMPLETED ||
					statusModule.lastKnownStatus === StudyStatus.COMPLETED
				) {
					completedN += enrollmentInfo.count;
				}
				completedCount += 1;
				totalN += enrollmentInfo.count;
			}
			drug.clinicalStudies.totalN = totalN;
			drug.clinicalStudies.completedN = completedN;
			drug.clinicalStudies.completedCount = completedCount;
			nextPageToken = data.nextPageToken;
		} catch (error) {
			if (error instanceof Response) {
				console.error(`clinicaltrials.gov API request failed: ${error.status} ${error.statusText}`);
			} else {
				console.error(error);
			}
			break;
		}
	}
	console.log(`Fetched clinical trials info for ${drug.name}.`);
}
