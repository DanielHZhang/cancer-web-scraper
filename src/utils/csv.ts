import { stringify } from "csv-stringify/sync";
import fs from "node:fs/promises";
import type { CancerData } from "../types";
import { outputFolder } from "../config";
import path from "node:path";
import dayjs from "dayjs";

export async function writeResultsCsv(data: CancerData[]) {
	const csvRows = [
		[
			"drug_generic_name",
			"drug_brand_name",
			"cancer_type",
			"fda_approved",
			"fda_approval_date",
			"rct_count",
			"rct_count_completed",
			"rct_total_n",
			"rct_completed_n",
		],
	];
	data.forEach((cancer) => {
		cancer.drugs.forEach((drug) => {
			csvRows.push([
				drug.genericName,
				drug.brandName,
				cancer.type,
				drug.fdaApproved ? "yes" : "no",
				drug.earliestFdaApprovalDate?.format("YYYY-MM-DD") || "unknown",
				drug.clinicalStudies.totalCount >= 0 ? drug.clinicalStudies.totalCount.toString() : "unknown",
				drug.clinicalStudies.totalN >= 0 ? drug.clinicalStudies.totalN.toString() : "unknown",
				drug.clinicalStudies.completedN >= 0 ? drug.clinicalStudies.completedN.toString() : "unknown",
			]);
		});
	});

	const csvOutput = stringify(csvRows);
	await fs.mkdir(outputFolder, { recursive: true }).catch();
	const outputFileName = path.join(outputFolder, `output-${dayjs().format("YYYY-MM-DD-HHmm")}.csv`);
	await fs.writeFile(outputFileName, csvOutput, { flag: "w+" });
}
