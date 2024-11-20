import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { analyzeDailyMedStudy } from "../analyze/dailymed-study-info";
import { analyzeTherapyType } from "../analyze/therapy-type";
import { baseUrls } from "../config";
import { db, type Drug, drugs, TherapyType } from "../db";

export async function scrapeDailyMedInfo(page: Page, drug: Drug) {
	if (!drug.urls.dailyMed) {
		return drug;
	}

	await page.goto(drug.urls.dailyMed, { waitUntil: "networkidle" });

	// Links to search page rather than directly to drug. Pick the first result.
	if (drug.urls.dailyMed.includes("/search.cfm?")) {
		const titleAnchor = page.locator(".drug-info-link").first();
		const resultUrl = await titleAnchor.getAttribute("href");
		if (!resultUrl) {
			console.warn(drug.name, "has no search results on dailymed:", drug.urls.dailyMed);
			return drug;
		}
		await page.goto(`${baseUrls.dailyMed}${resultUrl}`, { waitUntil: "networkidle" });
	}

	const [description, studyText] = await Promise.all([
		getDrugDescription(page).catch(() => console.warn(drug.name, "missing description section")),
		getClinicalStudyText(page).catch(() => console.warn(drug.name, "missing clinical studies section")),
	]);
	if (description) {
		drug.description = description;
		console.log(drug.name, "- scraped DailyMed drug description");
	}
	if (studyText) {
		drug.dailyMed.studyText = studyText;
		console.log(drug.name, "- scraped DailyMed study text");
	}
	if (!description && !studyText) {
		console.warn(drug.name, "no info could be scraped from DailyMed");
		return drug; // No new info was scraped
	}

	const [updatedDrug] = await db
		.update(drugs)
		.set({ description: drug.description, dailyMed: drug.dailyMed })
		.where(eq(drugs.id, drug.id))
		.returning();

	return updatedDrug;
}

export async function analyzeDailyMedInfo(drug: Drug) {
	if (drug.therapyType || drug.dailyMed.studyName || drug.dailyMed.studyN) {
		return drug; // Used saved GPT results instead of requerying
	}
	try {
		const [therapyResult, studyInfoResult] = await Promise.all([
			drug.description ? analyzeTherapyType(drug) : undefined,
			drug.dailyMed?.studyText ? analyzeDailyMedStudy(drug) : undefined,
		]);

		drug.therapyType = therapyResult?.therapyType ?? TherapyType.Unknown; // Populate so that GPT is not requeried

		if (studyInfoResult) {
			drug.dailyMed.studyName = studyInfoResult.studyName;
			drug.dailyMed.studyN = studyInfoResult.studyNumParticipants;
		}

		const [updatedDrug] = await db
			.update(drugs)
			.set({ therapyType: drug.therapyType, dailyMed: drug.dailyMed })
			.where(eq(drugs.id, drug.id))
			.returning();

		return updatedDrug;
	} catch (error) {
		console.error(drug.name, "ERROR analyzing daily med info:", error);
		return drug;
	}
}

/**
 * Get drug description from DailyMed.
 */
export async function getDrugDescription(page: Page) {
	const descriptionSection = page
		.locator(".drug-label-sections")
		.locator("a", { hasText: /11\s+DESCRIPTION/i })
		.locator("..")
		.locator(".Section.toggle-content");
	const description = await descriptionSection.innerText({ timeout: 2000 });
	return description;
}

/**
 * Get clinical studies info from DailyMed.
 */
export async function getClinicalStudyText(page: Page) {
	const preview = page
		.locator(".drug-label-sections")
		.locator("a", { hasText: /14\s+CLINICAL\s+STUDIES/i })
		.locator("..")
		.locator(".Section");
	const previewText = await preview.innerText({ timeout: 2000 });
	return previewText;
}
