import "dotenv/config";

import { chromium } from "@playwright/test";
import { Command } from "commander";
import { db, type Drug } from "./db";
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
	output: boolean;
}

async function main() {
	const program = new Command()
		.option("-c, --cancer <type>", "limit scraping to specific cancer type", (value) => value.toLowerCase())
		.option("-dl, --drug-limit [number]", "limit number of drugs scraped per cancer type", parseIntArg, -1)
		.option("-o --output", "outputs the database in csv without scraping", false)
		.parse();
	const args = program.opts<Argv>();
	console.log("Config:", args);

	if (args.output) {
		console.log("Output CSV only, skipping scraping.");
		return await outputCsv();
	}

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();

	try {
		const page = await browser.newPage();
		const cancers = await scrapeCancerTypes(page, args.cancer);
		const drugs: Drug[] = [];

		for (const cancer of cancers) {
			const newDrugs = await scrapeDrugNames(page, cancer, args.drugLimit);
			const updatedDrugs = await batchPages({
				data: newDrugs,
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
	} catch (error) {
		console.error(error);
	} finally {
		await context.close();
		await browser.close();
	}
}

async function outputCsv() {
	const cancers = await db.query.cancers.findMany();
	const drugs = await db.query.drugs.findMany();
	await writeResultsCsv(cancers, drugs);
}

main().catch(console.error);
