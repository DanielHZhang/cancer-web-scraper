import { eq } from "drizzle-orm";
import { baseUrls } from "../../config";
import { db, drugs, type Drug } from "../../db";
import { StudyStatus, type GetStudiesResponse } from "./types";
import dayjs from "dayjs";

/**
 * Query clinicaltrials.gov for the number of trials with the drug
 */
export async function getClinicalTrials(drug: Drug) {
	if (drug.clinicalTrials.retrievedAt) {
		console.log(drug.name, "using cached clinical trials info");
		return drug;
	}
	try {
		let nextPageToken: string | symbol | undefined = Symbol(); // Initially set to symbol so we don't append on first request
		while (nextPageToken) {
			const query = new URLSearchParams({
				format: "json",
				"query.intr": drug.genericName,
				aggFilters: "studyType:int",
				fields: "ProtocolSection",
				countTotal: "true",
				pageSize: "50",
			});
			if (typeof nextPageToken === "string") {
				query.append("pageToken", nextPageToken); // Only append when the token is returned
			}
			const response = await fetch(`${baseUrls.clinicalTrialsApi}?${query.toString()}`, {
				headers: { Accept: "application/json" },
			});
			if (!response.ok) {
				throw response;
			}

			const data: GetStudiesResponse = await response.json();
			const { clinicalTrials: trials } = drug; // Use reference to object when incrementing
			trials.totalN = 0;
			trials.completedN = 0;
			trials.completedCount = 0;
			trials.totalCount = 0;

			for (const study of data.studies) {
				const { designModule, statusModule } = study.protocolSection;
				const { designInfo, enrollmentInfo } = designModule;
				if (designInfo?.allocation !== "RANDOMIZED") {
					continue; // Ignore non-randomized studies
				}
				if (
					statusModule.overallStatus === StudyStatus.COMPLETED ||
					statusModule.lastKnownStatus === StudyStatus.COMPLETED
				) {
					trials.completedN += enrollmentInfo.count;
					trials.completedCount += 1;
				}
				trials.totalN += enrollmentInfo.count;
				trials.totalCount += 1;
			}

			nextPageToken = data.nextPageToken;
		}

		console.log(`Fetched clinical trials info for ${drug.name}.`);

		const [updatedDrug] = await db
			.update(drugs)
			.set({ clinicalTrials: { ...drug.clinicalTrials, retrievedAt: dayjs().toISOString() } })
			.where(eq(drugs.id, drug.id))
			.returning();

		return updatedDrug;
	} catch (error) {
		if (error instanceof Response) {
			console.error(`clinicaltrials.gov API request failed: ${error.status} ${error.statusText}`);
		} else {
			console.error(error);
		}
		return drug;
	}
}
