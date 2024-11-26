import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { analyzeDailyMedStudy } from "../analyze/dailymed-study-info";
import { analyzeTherapyType } from "../analyze/therapy-type";
import { baseUrls } from "../config";
import { db, type Drug, drugs, TherapyType } from "../db";
import dayjs from "dayjs";
import { retryRateLimit } from "../analyze/openai";

export async function scrapeDailyMedInfo(page: Page, drug: Drug): Promise<Drug> {
	if (!drug.urls.dailyMed) {
		console.log(drug.name, "missing DailyMed url, skipping scrape");
		return drug;
	}
	if (drug.dailyMed.retrievedAt) {
		console.log(drug.name, "using cached DailyMed data");
		return drug;
	}

	await page.goto(drug.urls.dailyMed, { waitUntil: "networkidle" });

	// Links to search page rather than directly to drug
	if (drug.urls.dailyMed.includes("/search.cfm?")) {
		try {
			const resultAnchors = await page.locator(".results").locator(".drug-info-link").all();
			const resultUrls = await Promise.all(resultAnchors.map((anchor) => anchor.getAttribute("href")));

			for (const url of resultUrls) {
				if (!url) {
					continue;
				}
				await page.goto(`${baseUrls.dailyMed}${url}`, { waitUntil: "networkidle" });
				const updated = await scrape(page, drug);
				if (updated) {
					return updated;
				}
			}

			throw new Error("Failed to find info on first page of search results");
		} catch (error) {
			console.warn(drug.name, "has no search results on dailymed:", drug.urls.dailyMed);
			return drug;
		}
	}
	// Links directly to drug page
	else {
		const updated = await scrape(page, drug);
		return updated || drug;
	}
}

async function scrape(page: Page, drug: Drug) {
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
		return;
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

/**
 * Get drug description from DailyMed.
 */
async function getDrugDescription(page: Page) {
	const descriptionSection = page
		.locator(".drug-label-sections")
		.locator("a", { hasText: /11\s+DESCRIPTION/i })
		.locator("..")
		.locator(".Section.toggle-content");
	const description = await descriptionSection.innerText({ timeout: 500 });
	return description;
}

/**
 * Get clinical studies info from DailyMed.
 */
async function getClinicalStudyText(page: Page) {
	const preview = page
		.locator(".drug-label-sections")
		.locator("a", { hasText: /14\s+CLINICAL\s+STUDIES/i })
		.locator("..")
		.locator(".Section.toggle-content.closed.long-content");
	const previewText = await preview.innerText({ timeout: 500 });
	return previewText;
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
