import type { Locator, Page } from "@playwright/test";
import { eq, inArray, like, sql } from "drizzle-orm";
import { baseUrls } from "../config";
import { cancers, db, drugs, type Cancer, type Drug } from "../db";

/**
 * Scrape all cancer types.
 */
export async function scrapeCancerTypes(page: Page, cancerLimit?: string): Promise<Cancer[]> {
	await page.goto(`${baseUrls.cancerGov}/about-cancer/treatment/drugs/cancer-type`, { waitUntil: "networkidle" });
	const ul = page.locator(".no-bullets.no-description").first();
	const liElements = await ul.locator("li").all();

	const scraped = await Promise.all(
		liElements.map(async (li): Promise<typeof cancers.$inferInsert> => {
			const anchor = li.locator("a");
			const [href, name] = await Promise.all([anchor.getAttribute("href"), anchor.innerText()]);
			const match = name.match(/Drugs Approved for (.+)/i);

			return {
				type: (match?.[1] || name).replace(/cancer/i, "").trim(),
				urls: {
					cancerGov: href?.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href || ""}`,
				},
			};
		}),
	);
	console.log(`Scraped ${scraped.length} cancer types.`);

	// Limit cancer to specific type if specified
	const filtered = scraped.filter((cancer) =>
		cancerLimit ? cancer.type.toLowerCase().includes(cancerLimit.toLowerCase()) : true,
	);

	if (filtered.length === 0) {
		throw new Error("No cancer types returned after filtering.");
	}

	const result = await db.insert(cancers).values(filtered).onConflictDoNothing();
	console.log(`Inserted ${result.rowsAffected} new cancer(s).`);

	return db.query.cancers.findMany({
		where: inArray(
			cancers.type,
			filtered.map(({ type }) => type),
		),
	});
}

/**
 * Scrape drug names for the specified cancer type.
 */
export async function scrapeDrugNames(page: Page, cancer: Cancer, drugLimit: number): Promise<Drug[]> {
	await page.goto(cancer.urls.cancerGov, { waitUntil: "networkidle" });
	const body = page.locator("#cgvBody");
	const desiredTitleRegex = /Drugs approved (for|to)/i;
	const undesiredTitleRegex = /prevent/i;
	const headers = await body.locator("h2", { hasText: desiredTitleRegex, hasNotText: undesiredTitleRegex }).all();
	const uniqueHrefs = new Set<string>();

	const drugNameData = await Promise.all(
		headers.map(async (header) => {
			const headerParent = header.locator("..");
			const ul = headerParent.locator("ul.no-bullets.no-description");
			const liElements = await ul.locator("li").all();
			const data: { href: string; name: string }[] = [];

			for (const li of liElements) {
				const anchor = li.locator("a").first();
				const anchorCount = await anchor.count();
				if (anchorCount > 0) {
					const href = await anchor.getAttribute("href");
					if (href && !uniqueHrefs.has(href)) {
						uniqueHrefs.add(href); // Prevent duplicates from being included

						let name: string;
						if (anchorCount > 1) {
							name = await li.innerText(); // Some li's might contain multiple anchor tags, with the name split across them
						} else {
							name = await anchor.innerText();
						}

						data.push({ name, href });
					}
				}

				// Some ul lists will contain multiple titles denoting different drug sections
				// We only want the li's with the appropriate title, skip the li's within the ul under the wrong title
				const innerH2 = anchor.locator("h2").first();
				const innerH2Count = await innerH2.count();
				if (innerH2Count > 0) {
					const title = await innerH2.innerText();
					if (!desiredTitleRegex.test(title) || undesiredTitleRegex.test(title)) {
						break;
					}
				}
			}

			return data;
		}),
	);

	const scraped = await Promise.all(
		drugNameData.flat().map(async ({ name, href }): Promise<typeof drugs.$inferInsert> => {
			const cleanName = name.replace(/\s+/g, " ");
			const genericNameMatch = cleanName.match(/(?:\()(.+)(?:\))/);
			const genericName = genericNameMatch?.at(1) ? genericNameMatch[1].trim() : undefined;

			return {
				name: cleanName,
				brandName: cleanName.replace(/\(.*\)/, "").trim(),
				genericName: genericName || cleanName,
				urls: {
					cancerGov: href.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href}`,
				},
				cancerId: cancer.id,
			};
		}),
	);

	const insertData = scraped.slice(0, drugLimit > 0 ? drugLimit : Infinity);
	console.log(`Scraped ${insertData.length} drug(s) for cancer: ${cancer.type}.`);

	if (insertData.length === 0) {
		console.warn(`No drugs returned from scraping.`);
		return [];
	}

	const result = await db.insert(drugs).values(insertData).onConflictDoNothing();
	console.log(`Inserted ${result.rowsAffected} new drug(s).`);

	return db.query.drugs.findMany({
		where: inArray(
			drugs.name,
			insertData.map(({ name }) => name),
		),
	});
}

/**
 * Scrape the FDA approval status and DailyMed url for each drug.
 */
export async function scrapeDrugUrls(page: Page, drug: Drug) {
	await page.goto(drug.urls.cancerGov, { waitUntil: "networkidle" });
	const body = page.locator("#cgvBody");
	const row = body.locator(".two-columns.brand-fda").last();

	try {
		const rowTitle = await row.locator(".column1").innerText({ timeout: 1000 });
		if (/FDA\s+Approved/i.test(rowTitle)) {
			const value = await row.locator(".column2").innerText();
			drug.fda.approved = /Yes/i.test(value);
		}
	} catch (error) {
		console.warn(drug.name, "missing FDA approval column");
	}

	try {
		const labelAnchor = body.locator("a", { hasText: /FDA\s+label\s+information/i });
		let dailyMedUrl = await labelAnchor.getAttribute("href", { timeout: 1000 });
		if (dailyMedUrl && dailyMedUrl.startsWith(baseUrls.dailyMed)) {
			drug.urls.dailyMed = dailyMedUrl;
		} else {
			console.warn(drug.name, "label information url is not to dailymed:", dailyMedUrl);
		}
	} catch (error) {
		console.warn(drug.name, "missing DailyMed url link");
	}

	const [updatedDrug] = await db
		.update(drugs)
		.set({ fda: drug.fda, urls: drug.urls })
		.where(eq(drugs.id, drug.id))
		.returning();

	return updatedDrug;
}
