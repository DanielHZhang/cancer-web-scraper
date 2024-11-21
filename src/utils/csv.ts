import { stringify } from "csv-stringify/sync";
import dayjs from "dayjs";
import fs from "node:fs/promises";
import path from "node:path";
import { outputFolder } from "../config";
import { TherapyType, type Cancer, type Drug } from "../db";

type TupleN<T, N, R extends T[] = []> = R["length"] extends N ? R : TupleN<T, N, [...R, T]>;

export async function writeResultsCsv(cancers: Cancer[], drugs: Drug[]) {
	const cancerIdMap = new Map([...cancers.map((cancer) => [cancer.id, cancer] as const)]);
	const csvRows: TupleN<string, 12>[] = [
		[
			"cancer_type",
			"drug_generic_name",
			"drug_brand_name",
			"drug_therapy_type",
			"fda_approved",
			"fda_approval_date",
			"dailymed_study_name",
			"dailymed_study_n",
			"rct_completed_count",
			"rct_total_count",
			"rct_completed_n",
			"rct_total_n",
		],
	];

	drugs.forEach((drug) => {
		const { dailyMed, clinicalTrials } = drug;
		const cancer = cancerIdMap.get(drug.cancerId);
		csvRows.push([
			cancer?.type ?? "",
			drug.genericName,
			drug.brandName,
			drug.therapyType ?? TherapyType.Unknown,
			drug.fda.approved ? "yes" : "no",
			drug.fda.earliestApprovalDate ? dayjs(drug.fda.earliestApprovalDate).format("YYYY-MM-DD") : "",
			dailyMed.studyName ?? "",
			dailyMed.studyN ? dailyMed.studyN.toString() : "",
			clinicalTrials.completedCount != null ? clinicalTrials.completedCount.toString() : "",
			clinicalTrials.totalCount != null ? clinicalTrials.totalCount.toString() : "",
			clinicalTrials.completedN != null ? clinicalTrials.completedN.toString() : "",
			clinicalTrials.totalN != null ? clinicalTrials.totalN.toString() : "",
		]);
	});

	await fs.mkdir(outputFolder, { recursive: true }).catch();
	const csvOutput = stringify(csvRows);
	const outputFileName = path.join(outputFolder, `output-${dayjs().format("YYYY-MM-DD-HHmm")}.csv`);
	await fs.writeFile(outputFileName, csvOutput, { flag: "w+" });
}
