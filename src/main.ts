import "dotenv/config";

import { chromium } from "@playwright/test";
import { batchPages } from "./utils/batch";
import { writeResultsCsv } from "./utils/csv";
import { scrapeCancerTypes, scrapeDrugUrls, scrapeDrugNames } from "./web/cancer-gov";
import { getClinicalTrials } from "./web/clinical-trials-gov/api";
import { scrapeDailyMedInfo } from "./web/dailymed-nih-gov";
import { getFdaInfo } from "./web/fda-gov/api";
import { Command } from "commander";
import { parseIntArg } from "./utils/number";
import { db } from "./db";

interface Argv {
	cancer?: string;
	drugLimit?: number;
}

async function main() {
	const program = new Command()
		.option("-c, --cancer <type>", "limit scraping to specific cancer type")
		.option("-dl, --drug-limit [number]", "limit number of drugs scraped per cancer type", parseIntArg)
		.parse();
	const args = program.opts<Argv>();

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();

	// Scrape cancer types
	const page = await browser.newPage();
	const data = (await scrapeCancerTypes(page)).filter((cancer) => {
		// Limit cancer to specific type if specified
		return args.cancer ? cancer.type.includes(args.cancer.toLowerCase()) : true;
	});
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
			data: args.drugLimit && args.drugLimit > 0 ? cancer.drugs.slice(0, args.drugLimit) : cancer.drugs,
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
