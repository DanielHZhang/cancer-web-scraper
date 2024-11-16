import { chromium } from "@playwright/test";
import { stringify } from "csv-stringify/sync";
import fs from "node:fs/promises";
import path from "path";

type CancerData = {
	type: string;
	url: string;
	drugs: Drug[];
};
type Drug = {
	name: string;
	purpose: "prevent" | "treat" | "unknown";
	fdaApproved: boolean;
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
	await Promise.all(
		headers.map(async (header) => {
			const headerParent = header.locator("..");
			const ul = headerParent.locator("ul.no-bullets.no-description");
			const liElements = await ul.locator("li").all();
			const scraped = await Promise.all(
				liElements.map(async (li) => {
					const anchor = li.locator("a");
					const [href, name] = await Promise.all([anchor.getAttribute("href"), anchor.innerText()]);
					return {
						name,
						href: href || "",
					};
				}),
			);

			const title = (await header.innerText()).toLowerCase();
			let purpose: Drug["purpose"];
			if (title.includes("prevent")) {
				purpose = "prevent";
			} else if (title.includes("treat")) {
				purpose = "treat";
			} else {
				purpose = "unknown";
			}

			cancer.drugs = scraped.map(({ name, href }) => {
				return {
					name,
					purpose,
					cancerType: cancer.type,
					fdaApproved: false,
					urls: { cancerGov: href.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href}` },
					clinicalStudies: {},
				};
			});

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
		continue;
	}

	drug.urls.dailyMedUrl = dailyMedUrl;
	await page.goto(dailyMedUrl, { waitUntil: "networkidle" });

	// Links to search page rather than directly to drug. Pick the first result.
	if (dailyMedUrl.includes("/search.cfm?")) {
		const titleAnchor = page.locator(".drug-info-link").first();
		const resultUrl = await titleAnchor.getAttribute("href");
		if (!resultUrl) {
			continue;
		}
		await page.goto(`${baseUrls.dailyMed}${resultUrl}`, { waitUntil: "networkidle" });
	}

	const sectionTitle = page.locator("a", { hasText: /14\s+CLINICAL\s+STUDIES/i });
	const section = sectionTitle.locator("..");
	const preview = section.locator(".preview-text");
	try {
		const previewText = await preview.innerText({ timeout: 1000 });
		drug.clinicalStudies.previewText = previewText;
	} catch (error) {
		console.warn(`Drug ${drug.name} missing clinical studies preview text`);
	}

	const fdaSearchUrl = "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm";

	console.log("Finished:", drug);
}

// Write results to CSV
const csvRows = [["drug_name", "cancer_type", "purpose", "fda_approved", "clinical_studies"]];
data.forEach((cancer) => {
	cancer.drugs.forEach((drug) => {
		const row = [
			drug.name,
			cancer.type,
			drug.purpose,
			drug.fdaApproved ? "yes" : "no",
			drug.clinicalStudies.previewText || "",
		];
		csvRows.push(row);
	});
});
const csvOutput = stringify(csvRows);
const fileName = path.join(process.cwd(), `output-${Date.now()}.csv`);
await fs.writeFile(fileName, csvOutput, { flag: "w+" });
