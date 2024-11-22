import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { analyzeDailyMedStudy } from "../analyze/dailymed-study-info";
import { analyzeTherapyType } from "../analyze/therapy-type";
import { baseUrls } from "../config";
import { db, type Drug, drugs, TherapyType } from "../db";
import dayjs from "dayjs";
import { retryRateLimit } from "../analyze/openai";

export async function scrapeDailyMedInfo(page: Page, drug: Drug) {
	if (!drug.urls.dailyMed) {
		console.log(drug.name, "missing DailyMed url, skipping scrape");
		return drug;
	}
	if (drug.dailyMed.retrievedAt) {
		console.log(drug.name, "using cached DailyMed data");
		return drug;
	}

	await page.goto(drug.urls.dailyMed, { waitUntil: "networkidle" });

	// Links to search page rather than directly to drug. Pick the first result.
	if (drug.urls.dailyMed.includes("/search.cfm?")) {
		try {
			const titleAnchor = page.locator(".drug-info-link").first();
			const resultUrl = await titleAnchor.getAttribute("href");
			if (!resultUrl) {
				throw new Error("No results.");
			}
			await page.goto(`${baseUrls.dailyMed}${resultUrl}`, { waitUntil: "networkidle" });
		} catch (error) {
			console.warn(drug.name, "has no search results on dailymed:", drug.urls.dailyMed);
			return drug;
		}
	}

	const [description, studyText] = await Promise.all([
		getDrugDescription(page).catch(() => console.warn(drug.name, "missing description section")),
		getClinicalStudyText(page).catch(() => console.warn(drug.name, "missing clinical studies section")),
	]);
	if (description) {
		drug.description = description;
		console.log(drug.name, "scraped DailyMed drug description");
	}
	if (studyText) {
		drug.dailyMed.studyText = studyText;
		console.log(drug.name, "scraped DailyMed study text");
	}
	if (!description && !studyText) {
		console.warn(drug.name, "no info could be scraped from DailyMed");
		return drug; // No new info was scraped
	}

	const [updatedDrug] = await db
		.update(drugs)
		.set({
			description: drug.description,
			dailyMed: {
				...drug.dailyMed,
				retrievedAt: dayjs().toISOString(),
			},
		})
		.where(eq(drugs.id, drug.id))
		.returning();

	return updatedDrug;
}

export async function analyzeDailyMedInfo(drug: Drug) {
	if (!drug.description && !drug.dailyMed.studyText) {
		console.warn(drug.name, "skipping analysis due to missing DailyMed info");
		return drug;
	}
	if (drug.therapyType || drug.dailyMed.studyName || drug.dailyMed.studyN) {
		console.log(drug.name, "using cached GPT analysis");
		return drug;
	}
	try {
		const [therapyResult, studyInfoResult] = await Promise.all([
			drug.description ? retryRateLimit(() => analyzeTherapyType(drug)) : undefined,
			drug.dailyMed.studyText ? retryRateLimit(() => analyzeDailyMedStudy(drug)) : undefined,
		]);

		if (therapyResult) {
			drug.therapyType = therapyResult.therapyType;
			drug.gptReasoning.therapyType = therapyResult.reasoning;
		}
		if (studyInfoResult) {
			drug.dailyMed.studyName = studyInfoResult.studyName;
			drug.dailyMed.studyN = studyInfoResult.studyNumParticipants;
		}

		const [updatedDrug] = await db
			.update(drugs)
			.set({
				therapyType: drug.therapyType,
				dailyMed: drug.dailyMed,
				gptReasoning: drug.gptReasoning,
			})
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
		.locator(".Section.toggle-content.closed.long-content");
	const previewText = await preview.innerText({ timeout: 2000 });
	return previewText;
}
