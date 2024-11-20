import type { PathLike } from "fs";
import fs from "node:fs/promises";

export async function fileExists(filePath: PathLike) {
	try {
		await fs.access(filePath);
		return true;
	} catch (error) {
		return false;
	}
}
