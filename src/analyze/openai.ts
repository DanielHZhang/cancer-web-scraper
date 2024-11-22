import OpenAI, { RateLimitError } from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPEN_AI_API_KEY });

export async function retryRateLimit<T>(func: () => Promise<T>) {
	const maxRetries = 10;
	for (let i = 0; i < maxRetries; i += 1) {
		try {
			const result = await func();
			return result;
		} catch (error) {
			if (error instanceof RateLimitError) {
				const remainingRequests = parseInt(error.headers?.["x-ratelimit-remaining-requests"] ?? "", 10);
				if (isNaN(remainingRequests)) {
					console.error("Missing remaining requests header on error", error);
					throw error;
				}
				if (remainingRequests === 0) {
					const resetRequestsTime = error.headers?.["x-ratelimit-reset-requests"];
					if (!resetRequestsTime) {
						console.error("Missing reset requests header on error", error);
						throw error;
					}
					const secondsUntilResetRequests = parseTimeToSeconds(resetRequestsTime);
					await new Promise((resolve) => setTimeout(resolve, secondsUntilResetRequests * 1000));
					continue;
				}

				const resetTokenTime = error.headers?.["x-ratelimit-reset-tokens"];
				if (!resetTokenTime) {
					console.error("Missing reset tokens header on error", error);
					throw error;
				}
				const secondsUntilResetTokens = parseTimeToSeconds(resetTokenTime);
				await new Promise((resolve) => setTimeout(resolve, secondsUntilResetTokens * 1000));
				continue;
			} else {
				throw error;
			}
		}
	}
	throw new Error("Max retries reached.");
}

function parseTimeToSeconds(timeString: string): number {
	const timeRegex = /(?:(\d+(?:\.\d+)?)ms)|(?:(\d+(?:\.\d+)?)s)|(?:(\d+)m)/g;
	let totalSeconds = 0;

	let match: RegExpExecArray | null;
	while ((match = timeRegex.exec(timeString)) !== null) {
		const [_, milliseconds, seconds, minutes] = match;
		if (milliseconds) {
			totalSeconds += parseFloat(milliseconds) / 1000;
		} else if (seconds) {
			totalSeconds += parseFloat(seconds);
		} else if (minutes) {
			totalSeconds += parseInt(minutes) * 60;
		}
	}

	return totalSeconds + 1; // Add one second leeway
}
