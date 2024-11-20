import type { BrowserContext, Page } from "@playwright/test";

interface Params<T> {
	context: BrowserContext;
	batchSize: number;
	data: T[];
	run: (page: Page, item: T) => Promise<void>;
}
export async function batchPages<T>({ context, batchSize, data, run }: Params<T>) {
	let currentIndex = 0;
	const total = data.length;
	while (currentIndex < total) {
		await Promise.all(
			data.slice(currentIndex, currentIndex + batchSize).map(async (item) => {
				const page = await context.newPage();
				await run(page, item);
				await page.close();
			}),
		);
		currentIndex += batchSize;
	}
}
