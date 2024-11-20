import { InvalidArgumentError } from "commander";

export function parseIntArg(value: string) {
	const parsedValue = parseInt(value, 10);
	if (isNaN(parsedValue)) {
		throw new InvalidArgumentError("Not a number.");
	}
	return parsedValue;
}
