type Submission = {
	submission_type: string;
	submission_number: string;
	submission_status: string;
	submission_status_date: string;
	review_priority: string;
	submission_class_code: string;
	submission_class_code_description?: string;
	application_docs?: {
		id: string;
		url: string;
		date: string;
		type: string;
	}[];
};

type OpenFDA = {
	application_number: string[];
	brand_name: string[];
	generic_name: string[];
	manufacturer_name: string[];
	product_ndc: string[];
	product_type: string[];
	route: string[];
	substance_name: string[];
	rxcui: string[];
	spl_id: string[];
	spl_set_id: string[];
	package_ndc: string[];
	nui: string[];
	pharm_class_epc: string[];
	pharm_class_moa: string[];
	pharm_class_pe: string[];
	unii: string[];
};

type ActiveIngredient = {
	name: string;
	strength: string;
};

type Product = {
	product_number: string;
	reference_drug: string;
	brand_name: string;
	active_ingredients: ActiveIngredient[];
	reference_standard: string;
	dosage_form: string;
	route: string;
	marketing_status: string;
	te_code: string;
};

export type DrugData = {
	submissions: Submission[];
	application_number: string;
	sponsor_name: string;
	openfda: OpenFDA;
	products: Product[];
};

export interface GetDrugResponse {
	meta: {
		disclaimer: string;
		terms: string;
		license: string;
		last_updated: string;
		results: {
			skip: number;
			limit: number;
			total: number;
		};
	};
	results: DrugData[];
}
