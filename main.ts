import { chromium } from "@playwright/test";
import { stringify } from "csv-stringify/sync";
import dayjs from "dayjs";
import fs from "node:fs/promises";
import path from "path";

type CancerData = {
	type: string;
	url: string;
	drugs: Drug[];
};
type Drug = {
	name: string;
	shortName: string; // Name but without the () if there is an alternative name
	description: string;
	fdaApproved: boolean;
	earliestFdaApprovalDate?: dayjs.Dayjs;
	cancerType: string;
	urls: {
		cancerGov: string;
		dailyMedUrl?: string;
	};
	clinicalStudies: {
		previewText?: string;
	};
};

const limit = 2;
const baseUrls = {
	cancerGov: "https://www.cancer.gov",
	dailyMed: "https://dailymed.nlm.nih.gov",
};

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto(`${baseUrls.cancerGov}/about-cancer/treatment/drugs/cancer-type`, { waitUntil: "networkidle" });

// Scrape cancer types
const ul = page.locator(".no-bullets.no-description").first();
const liElements = await ul.locator("li").all();
const scraped = await Promise.all(
	liElements.map(async (li) => {
		const anchor = li.locator("a");
		const [href, name] = await Promise.all([anchor.getAttribute("href"), anchor.innerText()]);
		const match = name.match(/Drugs Approved for (.+)/i);
		return {
			name: match?.[1] || name,
			href: href || "",
		};
	}),
);

const data = scraped.map(({ name, href }): CancerData => {
	return {
		type: name,
		url: href.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href}`,
		drugs: [],
	};
});
console.log(`Scraped ${data.length} cancer types.`);

// Scrape drug names for each cancer type
const dataIncluded = limit > 0 ? data.slice(0, limit) : data;
for await (const cancer of dataIncluded) {
	await page.goto(cancer.url, { waitUntil: "networkidle" });

	const body = page.locator("#cgvBody");
	const headers = await body.locator("h2", { hasText: /Drugs approved (for|to)/i, hasNotText: /prevent/i }).all();
	const uniqueHrefs = new Set<string>();

	await Promise.all(
		headers.map(async (header) => {
			const headerParent = header.locator("..");
			const ul = headerParent.locator("ul.no-bullets.no-description");
			const liElements = await ul.locator("li").all();

			const scraped = await Promise.all(
				liElements.map(async (li): Promise<Drug | undefined> => {
					const anchor = li.locator("a");
					const [href, name] = await Promise.all([anchor.getAttribute("href"), anchor.innerText()]);
					if (href && !uniqueHrefs.has(href)) {
						uniqueHrefs.add(href); // Prevent duplicates from being included (same drug but different brand name)
						return {
							name,
							shortName: name.replace(/\(.*\)/g, "").trim(),
							description: "",
							cancerType: cancer.type,
							fdaApproved: false,
							urls: { cancerGov: href.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href}` },
							clinicalStudies: {},
						};
					}
				}),
			);

			cancer.drugs = scraped.filter((drug) => !!drug);
			console.log(`Scraped ${cancer.drugs.length} drugs for ${cancer.type}`);
		}),
	);
}

// Scrape drug details
const allDrugs: Drug[] = [];
if (limit >= 0) {
	for (let i = 0; i < dataIncluded.length; i += 1) {
		if (i >= limit) break;
		allDrugs.push(...data[i].drugs);
	}
}
for await (const drug of allDrugs) {
	await page.goto(drug.urls.cancerGov, { waitUntil: "networkidle" });

	const body = page.locator("#cgvBody");
	const row = body.locator(".two-columns.brand-fda").last();
	const rowTitle = await row.locator(".column1").innerText();

	if (/FDA\s+Approved/i.test(rowTitle)) {
		const value = await row.locator(".column2").innerText();
		drug.fdaApproved = /Yes/i.test(value);
	}

	const labelAnchor = body.locator("a", { hasText: /FDA\s+label\s+information/i });
	const dailyMedUrl = await labelAnchor.getAttribute("href");
	if (!dailyMedUrl || !dailyMedUrl.startsWith(baseUrls.dailyMed)) {
		console.warn(drug.name, "label information url is not to dailymed:", dailyMedUrl);
		continue;
	}

	drug.urls.dailyMedUrl = dailyMedUrl;
	await page.goto(dailyMedUrl, { waitUntil: "networkidle" });

	// Links to search page rather than directly to drug. Pick the first result.
	if (dailyMedUrl.includes("/search.cfm?")) {
		const titleAnchor = page.locator(".drug-info-link").first();
		const resultUrl = await titleAnchor.getAttribute("href");
		if (!resultUrl) {
			console.warn(drug.name, "has no search results on dailymed:", dailyMedUrl);
			continue;
		}
		await page.goto(`${baseUrls.dailyMed}${resultUrl}`, { waitUntil: "networkidle" });
	}

	// Get drug description from dailymed
	try {
		const descriptionSection = page
			.locator(".drug-label-sections")
			.locator("a", { hasText: /11\s+DESCRIPTION/i })
			.locator("..")
			.locator(".Section.toggle-content");
		const description = await descriptionSection.innerText();
		drug.description = description;
	} catch (error) {
		console.warn(drug.name, "missing description section");
	}

	// Get clinical studies info from dailymed
	try {
		const preview = page
			.locator(".drug-label-sections")
			.locator("a", { hasText: /14\s+CLINICAL\s+STUDIES/i })
			.locator("..")
			.locator(".preview-text");
		const previewText = await preview.innerText({ timeout: 1000 });
		drug.clinicalStudies.previewText = previewText;
	} catch (error) {
		console.warn(drug.name, "missing clinical studies section");
	}

	// Search for drug on FDA database to find approval date
	if (drug.fdaApproved) {
		const fdaSearchUrl = "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm";
		await page.goto(fdaSearchUrl, { waitUntil: "networkidle" });
		const form = page.locator("#DrugNameform");
		const input = form.locator("input", { has: form.locator(".form-control") });
		await input.fill(drug.name);
		const submitButton = form.locator("button", { hasText: "Search" });
		await submitButton.click();

		await page.waitForEvent("domcontentloaded");

		const resultsTable = page.locator(".table").first();
		const nameMatchAnchor = resultsTable.locator("a", { hasText: drug.shortName });
		const matchList = await nameMatchAnchor.locator("..").locator("ul").locator("li").all();

		// Go to each FDA drug result page and find the earliest approval
		const now = dayjs();
		let earliestApprovalDate = now;
		for (const match of matchList) {
			const fdaDrugUrl = await match.locator("a").getAttribute("href");
			if (!fdaDrugUrl) {
				continue;
			}
			await page.goto(fdaDrugUrl, { waitUntil: "networkidle" });
			const originApprovalTable = page.locator("#exampleApplOrig");
			const tableRows = await originApprovalTable.locator("tbody").locator("tr").all();

			const actionDateCol = 0;
			const actionTypeCol = 2;
			await Promise.all(
				tableRows.map(async (row) => {
					const tds = await row.locator("td").all();
					const actionType = tds.at(actionTypeCol);
					if (!actionType) {
						return;
					}
					const approvalText = await actionType.innerText();
					const isApproval = /approval/i.test(approvalText);
					if (!isApproval) {
						return;
					}
					const actionDate = tds.at(actionDateCol);
					if (!actionDate) {
						return;
					}
					const dateText = await actionDate.innerText();
					const approvalDate = dayjs(dateText, "MM/DD/YYYY");
					if (approvalDate.isBefore(earliestApprovalDate)) {
						earliestApprovalDate = approvalDate;
					}
				}),
			);
		}
		if (earliestApprovalDate !== now) {
			drug.earliestFdaApprovalDate = earliestApprovalDate;
		}
		// console.warn(drug.name, "no drug details url found in FDA search");
	}

	console.log("Finished:", drug);
}

// Write results to CSV
const csvRows = [["drug_name", "cancer_type", "fda_approved", "clinical_studies"]];
data.forEach((cancer) => {
	cancer.drugs.forEach((drug) => {
		const row = [
			drug.name,
			//
			cancer.type,
			drug.fdaApproved ? "yes" : "no",
			drug.clinicalStudies.previewText || "",
		];
		csvRows.push(row);
	});
});
const csvOutput = stringify(csvRows);
const fileName = path.join(process.cwd(), `output-${Date.now()}.csv`);
await fs.writeFile(fileName, csvOutput, { flag: "w+" });

console.log("Done.");
