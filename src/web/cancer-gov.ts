import type { Page } from "@playwright/test";
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
	const headers = await body.locator("h2", { hasText: /Drugs approved (for|to)/i, hasNotText: /prevent/i }).all();
	const uniqueHrefs = new Set<string>();

	const liElements = await Promise.all(
		headers.map(async (header) => {
			const headerParent = header.locator("..");
			const ul = headerParent.locator("ul.no-bullets.no-description");
			const liElements = await ul.locator("li").all();
			return liElements;
		}),
	);

	const scraped = await Promise.all(
		liElements.flat().map(async (li): Promise<typeof drugs.$inferInsert | undefined> => {
			const anchor = li.locator("a").first();
			let [href, name] = await Promise.all([anchor.getAttribute("href"), anchor.innerText()]);
			if (href && !uniqueHrefs.has(href)) {
				uniqueHrefs.add(href); // Prevent duplicates from being included (same drug but different brand name)
				name = name.split("\n")[0].trim(); // Some names may be split into multiple lines
				const genericName = name
					.match(/\(.+\)/)?.[0]
					.slice(1, -1) // Do not include the parantheses in the result
					.trim();

				return {
					name,
					brandName: name.replace(/\(.*\)/, "").trim(),
					genericName: genericName || name,
					urls: {
						cancerGov: href.startsWith(baseUrls.cancerGov) ? href : `${baseUrls.cancerGov}${href}`,
					},
					cancerId: cancer.id,
				};
			}
		}),
	);

	const filtered = scraped.filter((drug) => !!drug).slice(0, drugLimit > 0 ? drugLimit : Infinity);
	console.log(`Scraped ${filtered.length} drug(s) for cancer: ${cancer.type}.`);

	const result = await db.insert(drugs).values(filtered).onConflictDoNothing();
	console.log(`Inserted ${result.rowsAffected} new drug(s).`);

	return db.query.drugs.findMany({
		where: inArray(
			drugs.name,
			filtered.map(({ name }) => name),
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
	const rowTitle = await row.locator(".column1").innerText();

	if (/FDA\s+Approved/i.test(rowTitle)) {
		const value = await row.locator(".column2").innerText();
		drug.fda.approved = /Yes/i.test(value);
	}

	const labelAnchor = body.locator("a", { hasText: /FDA\s+label\s+information/i });
	let dailyMedUrl = await labelAnchor.getAttribute("href");
	if (dailyMedUrl && dailyMedUrl.startsWith(baseUrls.dailyMed)) {
		drug.urls.dailyMed = dailyMedUrl;
	} else {
		console.warn(drug.name, "label information url is not to dailymed:", dailyMedUrl);
	}

	const [updatedDrug] = await db
		.update(drugs)
		.set({ fda: drug.fda, urls: drug.urls })
		.where(eq(drugs.id, drug.id))
		.returning();

	return updatedDrug;
}
