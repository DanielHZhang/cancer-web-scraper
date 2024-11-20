import type { Page } from "@playwright/test";
import type { CancerData, Drug } from "../types";
import { baseUrls } from "../config";

/**
 * Scrape all cancer types.
 */
export async function scrapeCancerTypes(page: Page) {
	await page.goto(`${baseUrls.cancerGov}/about-cancer/treatment/drugs/cancer-type`, { waitUntil: "networkidle" });
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

	return scraped.map(({ name, href }): CancerData => {
		return {
			type: name,
			url: href.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href}`,
			drugs: [],
		};
	});
}

/**
 * Scrape drug names for each cancer type.
 */
export async function scrapeDrugNames(page: Page, cancer: CancerData) {
	await page.goto(cancer.url, { waitUntil: "networkidle" });
	const body = page.locator("#cgvBody");
	const headers = await body.locator("h2", { hasText: /Drugs approved (for|to)/i, hasNotText: /prevent/i }).all();
	const uniqueHrefs = new Set<string>();

	const promises = headers.map(async (header) => {
		const headerParent = header.locator("..");
		const ul = headerParent.locator("ul.no-bullets.no-description");
		const liElements = await ul.locator("li").all();

		const scraped = await Promise.all(
			liElements.map(async (li): Promise<Drug | undefined> => {
				const anchor = li.locator("a").first();
				let [href, name] = await Promise.all([anchor.getAttribute("href"), anchor.innerText()]);
				if (href && !uniqueHrefs.has(href)) {
					uniqueHrefs.add(href); // Prevent duplicates from being included (same drug but different brand name)
					name = name.split("\n")[0].trim(); // Some names may be split into multiple lines
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
						fda: { approved: false },
						dailyMed: {},
						urls: { cancerGov: href.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href}` },
						clinicalStudies: {
							totalN: -1,
							completedN: -1,
							totalCount: -1,
							completedCount: -1,
						},
					};
				}
			}),
		);

		cancer.drugs = scraped.filter((drug) => !!drug);
		console.log(`Scraped ${cancer.drugs.length} drugs for ${cancer.type}.`);
	});

	await Promise.all(promises);
}

export async function scrapeDrugUrls(page: Page, drug: Drug) {
	await page.goto(drug.urls.cancerGov, { waitUntil: "networkidle" });
	const body = page.locator("#cgvBody");
	const row = body.locator(".two-columns.brand-fda").last();
	const rowTitle = await row.locator(".column1").innerText();

	if (/FDA\s+Approved/i.test(rowTitle)) {
		const value = await row.locator(".column2").innerText();
		drug.fda.approved = /Yes/i.test(value);
	}

	const labelAnchor = body.locator("a", { hasText: /FDA\s+label\s+information/i });
	const dailyMedUrl = await labelAnchor.getAttribute("href");
	if (!dailyMedUrl || !dailyMedUrl.startsWith(baseUrls.dailyMed)) {
		console.warn(drug.name, "label information url is not to dailymed:", dailyMedUrl);
		return;
	}

	drug.urls.dailyMed = dailyMedUrl;
	console.log(`Scraped DailyMed URL for ${drug.name}. FDA approved: ${drug.fda.approved}`);
}
