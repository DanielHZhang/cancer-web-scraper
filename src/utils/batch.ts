import type { BrowserContext, Page } from "@playwright/test";

interface Params<T, U> {
	context: BrowserContext;
	batchSize: number;
	data: T[];
	run: (page: Page, item: T) => Promise<U>;
}
export async function batchPages<T, U>({ context, batchSize, data, run }: Params<T, U>) {
	let currentIndex = 0;
	const total = data.length;
	const results: U[] = [];
	while (currentIndex < total) {
		await Promise.all(
			data.slice(currentIndex, currentIndex + batchSize).map(async (item) => {
				const page = await context.newPage();
				const result = await run(page, item);
				results.push(result);
				await page.close();
			}),
		);
		currentIndex += batchSize;
	}
	return results;
}
