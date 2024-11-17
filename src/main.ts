import { chromium } from "@playwright/test";
import { stringify } from "csv-stringify/sync";
import dayjs from "dayjs";
import fs from "node:fs/promises";
import path from "path";
import { StudyStatus, type GetStudiesResponse } from "./clinical-trials";
import type { CancerData, Drug } from "./types";

const cancerType: string | null = "Breast Cancer";
const drugLimit: number = 5;
export const baseUrls = {
	cancerGov: "https://www.cancer.gov",
	dailyMed: "https://dailymed.nlm.nih.gov",
	clinicalTrialsGov: "https://clinicaltrials.gov/api/v2/studies",
	fdaDatabase: "https://www.accessdata.fda.gov",
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

let data = scraped.map(({ name, href }): CancerData => {
	return {
		type: name,
		url: href.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href}`,
		drugs: [],
	};
});
console.log(`Scraped ${data.length} cancer types.`);

// Limit cancer to specific type if specified
if (cancerType) {
	data = data.filter((c) => c.type === cancerType);
}

// Scrape drug names for each cancer type
for await (const cancer of data) {
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
					const anchor = li.locator("a").first();
					let [href, name] = await Promise.all([anchor.getAttribute("href"), anchor.innerText()]);
					if (href && !uniqueHrefs.has(href)) {
						uniqueHrefs.add(href); // Prevent duplicates from being included (same drug but different brand name)
						name = name.split("\n")[0]; // Some names may be split into multiple lines
						const genericName = name
							.match(/\(.+\)/)?.[0]
							.slice(1, -1) // Do not include the parantheses in the result
							.trim();
						const brandName = name.replace(/\(.*\)/, "").trim();
						return {
							name,
							brandName,
							genericName: genericName || name,
							description: "",
							cancerType: cancer.type,
							fdaApproved: false,
							urls: { cancerGov: href.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href}` },
							clinicalStudies: {
								totalN: -1,
								totalCompletedN: -1,
								totalCount: -1,
							},
						};
					}
				}),
			);

			cancer.drugs = scraped.filter((drug) => !!drug);
			console.log(`Scraped ${cancer.drugs.length} drugs for ${cancer.type}`);
		}),
	);
}

// Limit maximum number of drugs included per cancer if specified
const drugs: Drug[] = [];
if (drugLimit > 0) {
	data.forEach((cancer) => {
		drugs.push(...cancer.drugs.slice(0, drugLimit));
	});
}

// Scrape drug details
for (const drug of drugs) {
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
		const now = dayjs();
		let earliestApprovalDate = now;
		const findApprovalDate = async () => {
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
		};

		const fdaSearchUrl = `${baseUrls.fdaDatabase}/scripts/cder/daf/index.cfm`;
		const searchFdaForDrug = async (drugName: string) => {
			await page.goto(fdaSearchUrl, { waitUntil: "networkidle" });
			const form = page.locator("#DrugNameform");
			const input = form.locator("input");
			await input.fill(drugName);
			const submitButton = form.locator("button", { hasText: "Search" });
			await submitButton.click();

			// Go to each FDA drug result page and find the earliest approval
			await page.waitForLoadState("networkidle");

			// No results for the drug
			const hasNoResults = await page.locator("h4", { hasText: "Search Did Not Return Any Results" }).count();
			if (hasNoResults > 0) {
				return false;
			}

			const drugApprovalOriginTable = await page.locator("#exampleApplOrig").count();
			const isOnSearchPage = drugApprovalOriginTable === 0;

			// FDA search took us to the results page, process the table
			if (isOnSearchPage) {
				const tableMatches = await page.locator(".table").locator("ul").locator("li").locator("a").all();
				for (const anchor of tableMatches) {
					const fdaDrugUrl = await anchor.getAttribute("href");
					if (!fdaDrugUrl) {
						continue;
					}
					const name = (await anchor.innerText()).toLowerCase();
					if (!name.includes(drug.genericName.toLowerCase()) && !name.includes(drug.brandName.toLowerCase())) {
						continue; // Skip results that do not contain the drug's name at all
					}
					const url = fdaDrugUrl.startsWith(baseUrls.fdaDatabase) ? fdaDrugUrl : `${baseUrls.fdaDatabase}${fdaDrugUrl}`;
					await page.goto(url, { waitUntil: "networkidle" });
					await findApprovalDate();
					await page.goBack();
				}
			}
			// FDA search took us directly to the drug details page, we can skip processing the results table
			else {
				await findApprovalDate();
			}
			if (earliestApprovalDate !== now) {
				drug.earliestFdaApprovalDate = earliestApprovalDate;
			}
			return true;
		};

		const done = await searchFdaForDrug(drug.genericName);
		if (!done) {
			await searchFdaForDrug(drug.brandName); // Search brand name is generic name doesn't return any results
		}
	}

	// Query clinicaltrials.gov for the number of trials with the drug
	let nextPageToken: string | symbol | undefined = Symbol();
	while (nextPageToken) {
		try {
			const query = new URLSearchParams({
				format: "json",
				"query.intr": drug.genericName,
				aggFilters: "studyType:int",
				fields: "ProtocolSection",
				countTotal: "true",
				pageSize: "50",
			});
			if (typeof nextPageToken === "string") {
				query.append("pageToken", nextPageToken);
			}
			const response = await fetch(`${baseUrls.clinicalTrialsGov}?${query.toString()}`, {
				headers: { Accept: "application/json" },
			});
			if (!response.ok) {
				throw new Error(`clinicaltrials.gov API request failed: ${response.status} ${response.statusText}`);
			}
			const data: GetStudiesResponse = await response.json();
			if (typeof data.totalCount === "number") {
				drug.clinicalStudies.totalCount = data.totalCount;
			}
			let totalN = 0;
			let totalCompletedN = 0;
			for (const study of data.studies) {
				const { designModule, statusModule } = study.protocolSection;
				const { designInfo, enrollmentInfo } = designModule;
				if (designInfo.allocation !== "RANDOMIZED") {
					continue;
				}
				if (statusModule.overallStatus === StudyStatus.COMPLETED) {
					totalCompletedN += enrollmentInfo.count;
				}
				totalN += enrollmentInfo.count;
			}
			drug.clinicalStudies.totalN = totalN;
			drug.clinicalStudies.totalCompletedN = totalCompletedN;
			nextPageToken = data.nextPageToken;
		} catch (error) {
			console.error(error);
			break;
		}
	}

	console.log("Finished:", drug);
}

// Write results to CSV
const csvRows = [
	[
		"drug_generic_name",
		"drug_brand_name",
		"cancer_type",
		"fda_approved",
		"fda_approval_date",
		"rct_count",
		"rct_total_n",
		"rct_total_completed_n",
	],
];
data.forEach((cancer) => {
	const drugs = drugLimit > 0 ? cancer.drugs.slice(0, drugLimit) : cancer.drugs;
	drugs.forEach((drug) => {
		csvRows.push([
			drug.genericName,
			drug.brandName,
			cancer.type,
			drug.fdaApproved ? "yes" : "no",
			drug.earliestFdaApprovalDate?.format("YYYY-MM-DD") || "unknown",
			drug.clinicalStudies.totalCount >= 0 ? drug.clinicalStudies.totalCount.toString() : "unknown",
			drug.clinicalStudies.totalN >= 0 ? drug.clinicalStudies.totalN.toString() : "unknown",
			drug.clinicalStudies.totalCompletedN >= 0 ? drug.clinicalStudies.totalCompletedN.toString() : "unknown",
		]);
	});
});
const csvOutput = stringify(csvRows);
const fileName = path.join(process.cwd(), "outputs", `output-${Date.now()}.csv`);
await fs.writeFile(fileName, csvOutput, { flag: "w+" });

console.log("Done.");
