import "dotenv/config";

import { chromium } from "@playwright/test";
import { batchPages } from "./utils/batch";
import { writeResultsCsv } from "./utils/csv";
import { scrapeCancerTypes, scrapeDrugUrls, scrapeDrugNames } from "./web/cancer-gov";
import { getClinicalTrials } from "./web/clinical-trials-gov/api";
import { scrapeDailyMedInfo } from "./web/dailymed-nih-gov";
import { getFdaInfo } from "./web/fda-gov/api";

async function main() {
	const cancerType: string | null = "Breast Cancer";
	const drugLimit: number = 5;

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();

	// Scrape cancer types
	const page = await browser.newPage();
	let data = await scrapeCancerTypes(page);
	if (cancerType) {
		data = data.filter((c) => c.type === cancerType); // Limit cancer to specific type if specified
	}
	console.log(`Scraped ${data.length} cancer types.`);

	// Scrape drugs in parallel
	await batchPages({
		data,
		context,
		batchSize: 20,
		run: scrapeDrugNames,
	});

	for (const cancer of data) {
		await batchPages({
			data: drugLimit > 0 ? cancer.drugs.slice(0, drugLimit) : cancer.drugs,
			context,
			batchSize: 20,
			run: async (page, drug) => {
				await scrapeDrugUrls(page, drug);
				await scrapeDailyMedInfo(page, drug);
				await getFdaInfo(drug);
				await getClinicalTrials(drug);
				console.log("Finished:", drug.name);
			},
		});
	}

	await writeResultsCsv(data);
	console.log("Done.");

	await context.close();
	await browser.close();
}

main().catch(console.error);
