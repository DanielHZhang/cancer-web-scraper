import "dotenv/config";

import { chromium } from "@playwright/test";
import { Command } from "commander";
import type { Drug } from "./db";
import { batchPages } from "./utils/batch";
import { writeResultsCsv } from "./utils/csv";
import { parseIntArg } from "./utils/number";
import { scrapeCancerTypes, scrapeDrugNames, scrapeDrugUrls } from "./web/cancer-gov";
import { getClinicalTrials } from "./web/clinical-trials-gov/api";
import { analyzeDailyMedInfo, scrapeDailyMedInfo } from "./web/dailymed-nih-gov";
import { getFdaInfo } from "./web/fda-gov/api";

interface Argv {
	cancer?: string;
	drugLimit: number;
}

async function main() {
	const program = new Command()
		.option("-c, --cancer <type>", "limit scraping to specific cancer type")
		.option("-dl, --drug-limit [number]", "limit number of drugs scraped per cancer type", parseIntArg, -1)
		.parse();
	const args = program.opts<Argv>();

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();

	// Scrape cancer types
	const page = await browser.newPage();
	const cancers = await scrapeCancerTypes(page, args.cancer);
	const drugs: Drug[] = [];

	for (const cancer of cancers) {
		const newDrugs = await scrapeDrugNames(page, cancer);
		const updatedDrugs = await batchPages({
			data: args.drugLimit > 0 ? newDrugs.slice(0, args.drugLimit) : newDrugs,
			context,
			batchSize: 20,
			run: async (page, drug) => {
				drug = await scrapeDrugUrls(page, drug);
				drug = await scrapeDailyMedInfo(page, drug);
				drug = await analyzeDailyMedInfo(drug);
				drug = await getFdaInfo(drug);
				drug = await getClinicalTrials(drug);
				console.log("Finished:", drug.name);
				return drug;
			},
		});
		drugs.push(...updatedDrugs);
	}

	await writeResultsCsv(cancers, drugs);
	console.log("Done.");

	await context.close();
	await browser.close();
}

main().catch(console.error);
