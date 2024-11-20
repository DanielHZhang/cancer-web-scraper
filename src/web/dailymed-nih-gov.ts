import type { Page } from "@playwright/test";
import type { Drug } from "../types";
import { baseUrls } from "../config";
import { analyzeDailyMedStudy } from "../analyze/dailymed-study-info";
import { analyzeTherapyType } from "../analyze/therapy-type";

export async function scrapeDailyMedInfo(page: Page, drug: Drug) {
	if (!drug.urls.dailyMed) {
		return;
	}
	await page.goto(drug.urls.dailyMed, { waitUntil: "networkidle" });

	// Links to search page rather than directly to drug. Pick the first result.
	if (drug.urls.dailyMed.includes("/search.cfm?")) {
		const titleAnchor = page.locator(".drug-info-link").first();
		const resultUrl = await titleAnchor.getAttribute("href");
		if (!resultUrl) {
			console.warn(drug.name, "has no search results on dailymed:", drug.urls.dailyMed);
			return;
		}
		await page.goto(`${baseUrls.dailyMed}${resultUrl}`, { waitUntil: "networkidle" });
	}

	const [description, previewText] = await Promise.all([
		getDrugDescription(page).catch(() => console.warn(drug.name, "missing description section")),
		getClinicalStudyText(page).catch(() => console.warn(drug.name, "missing clinical studies section")),
	]);
	drug.description = description ?? "";
	drug.dailyMed.studyText = previewText ?? undefined;
	console.log(`Scraped DailyMed info for ${drug.name}.`);
}

export async function analyzeDailyMedInfo(drug: Drug) {
	try {
		const [therapyResult, studyInfoResult] = await Promise.all([
			drug.description ? analyzeTherapyType(drug) : undefined,
			drug.dailyMed.studyText ? analyzeDailyMedStudy(drug) : undefined,
		]);
		if (therapyResult) {
			drug.therapyType = therapyResult.therapyType;
		}
		if (studyInfoResult) {
			drug.dailyMed.studyName = studyInfoResult.studyName;
			drug.dailyMed.studyN = studyInfoResult.studyNumParticipants;
		}
	} catch (error) {
		console.error(error);
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
