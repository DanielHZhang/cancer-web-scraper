/**
 * Trims extra whitespace in the template string. This includes extra whitespace at the beginning of each newline.
 */
export function fmt(strings: { raw: readonly string[] }, ...substitutions: any[]) {
	const str = String.raw(strings, ...substitutions);
	const nonWhitespaceIndex = /\S/.exec(str)?.index ?? 0;

	let count = 0;
	for (let i = 0; i < nonWhitespaceIndex; i += 1) {
		const char = str[i];
		if (char === "\n") {
			count = 0;
		} else if (char === " " || char === "\t") {
			count += 1;
		}
	}

	const removeAmount = count === 0 ? "+" : `{${count}}`; // Remove all leading whitespace if string starts with character
	const leadingWhitespaceRegex = new RegExp(`^[ \\t\\r\\v]${removeAmount}`, "gm");
	return str.replace(leadingWhitespaceRegex, "").trim();
}
