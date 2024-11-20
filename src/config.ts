import path from "path";

export const baseUrls = {
	cancerGov: "https://www.cancer.gov",
	dailyMed: "https://dailymed.nlm.nih.gov",
	clinicalTrialsApi: "https://clinicaltrials.gov/api/v2/studies",
	fdaDrugsApi: "https://api.fda.gov/drug/drugsfda.json",
};

const workDir = process.cwd();
export const cacheFolder = path.join(workDir, ".cache");
export const outputFolder = path.join(workDir, ".output");
