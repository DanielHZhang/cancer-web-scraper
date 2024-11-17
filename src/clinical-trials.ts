export interface GetStudiesResponse {
	nextPageToken?: string;
	studies: Study[];
	totalCount?: number;
}

export interface Study {
	protocolSection: ProtocolSection;
	hasResults: boolean;
}

export interface ProtocolSection {
	identificationModule: IdentificationModule;
	statusModule: StatusModule;
	descriptionModule: {
		briefSummary: string;
	};
	conditionsModule: {
		conditions: string[];
		keywords: string[];
	};
	designModule: DesignModule;
	armsInterventionsModule: ArmsInterventionsModule;
	outcomesModule: OutcomesModule;
}

type DesignModule = {
	studyType: "INTERVENTIONAL" | "OBSERVATIONAL"; // Assumes a fixed set of values
	phases: string[]; // Adjust with specific phase enums if needed
	designInfo: {
		allocation: string; // Consider defining specific allocation types
		interventionModel: string; // Consider defining specific intervention models
		primaryPurpose: string; // Consider defining specific purposes
		maskingInfo: {
			masking: string; // Consider defining specific masking types
		};
	};
	enrollmentInfo: {
		count: number;
		type: "ACTUAL" | "ESTIMATED"; // Assumes a fixed set of values
	};
};

type ArmGroup = {
	label: string;
	type: string; // Adjust with specific types if known
	description: string;
	interventionNames: string[];
};

type Intervention = {
	type: string; // Adjust with specific intervention types if known
	name: string;
	description: string;
	armGroupLabels: string[];
};

type ArmsInterventionsModule = {
	armGroups: ArmGroup[];
	interventions: Intervention[];
};

type Outcome = {
	measure: string;
	timeFrame: string;
};

type OutcomesModule = {
	primaryOutcomes: Outcome[];
	secondaryOutcomes: Outcome[];
};

// Identification Module
export interface IdentificationModule {
	nctId: string;
	nctIdAliases: string[];
	orgStudyIdInfo: OrgStudyIdInfo;
	secondaryIdInfos: SecondaryIdInfo[];
	briefTitle: string;
	officialTitle: string;
	acronym: string;
	organization: Organization;
}

export interface OrgStudyIdInfo {
	id: string;
	type: OrgStudyIdType;
	link: string;
}

export enum OrgStudyIdType {
	NIH = "NIH",
	FDA = "FDA",
	VA = "VA",
	CDC = "CDC",
	AHRQ = "AHRQ",
	SAMHSA = "SAMHSA",
}

export interface SecondaryIdInfo {
	id: string;
	type: SecondaryIdType;
	domain: string;
	link: string;
}

export enum SecondaryIdType {
	NIH = "NIH",
	FDA = "FDA",
	VA = "VA",
	CDC = "CDC",
	AHRQ = "AHRQ",
	SAMHSA = "SAMHSA",
	OTHER_GRANT = "OTHER_GRANT",
	EUDRACT_NUMBER = "EUDRACT_NUMBER",
	CTIS = "CTIS",
	REGISTRY = "REGISTRY",
	OTHER = "OTHER",
}

interface Organization {
	fullName: string;
	class: OrganizationClass;
}

enum OrganizationClass {
	NIH = "NIH",
	FED = "FED",
	OTHER_GOV = "OTHER_GOV",
	INDIV = "INDIV",
	INDUSTRY = "INDUSTRY",
	NETWORK = "NETWORK",
	AMBIG = "AMBIG",
	OTHER = "OTHER",
	UNKNOWN = "UNKNOWN",
}

interface StatusModule {
	statusVerifiedDate: string;
	overallStatus: StudyStatus;
	lastKnownStatus: StudyStatus;
	delayedPosting: boolean;
	whyStopped?: string;
	expandedAccessInfo?: ExpandedAccessInfo;
	startDateStruct: DateStruct;
	primaryCompletionDateStruct: DateStruct;
	completionDateStruct: DateStruct;
	studyFirstSubmitDate: string;
	studyFirstSubmitQcDate: string;
	studyFirstPostDateStruct: DateStruct;
	resultsWaived: boolean;
	resultsFirstSubmitDate?: string;
	resultsFirstSubmitQcDate?: string;
	resultsFirstPostDateStruct?: DateStruct;
	dispFirstSubmitDate?: string;
	dispFirstSubmitQcDate?: string;
	dispFirstPostDateStruct?: DateStruct;
	lastUpdateSubmitDate: string;
	lastUpdatePostDateStruct: DateStruct;
}

export enum StudyStatus {
	ACTIVE_NOT_RECRUITING = "ACTIVE_NOT_RECRUITING",
	COMPLETED = "COMPLETED",
	ENROLLING_BY_INVITATION = "ENROLLING_BY_INVITATION",
	NOT_YET_RECRUITING = "NOT_YET_RECRUITING",
	RECRUITING = "RECRUITING",
	SUSPENDED = "SUSPENDED",
	TERMINATED = "TERMINATED",
	WITHDRAWN = "WITHDRAWN",
	AVAILABLE = "AVAILABLE",
	NO_LONGER_AVAILABLE = "NO_LONGER_AVAILABLE",
	TEMPORARILY_NOT_AVAILABLE = "TEMPORARILY_NOT_AVAILABLE",
	APPROVED_FOR_MARKETING = "APPROVED_FOR_MARKETING",
	WITHHELD = "WITHHELD",
	UNKNOWN = "UNKNOWN",
}

interface ExpandedAccessInfo {
	hasExpandedAccess: boolean;
	nctId?: string;
	statusForNctId?: ExpandedAccessStatus;
}

enum ExpandedAccessStatus {
	AVAILABLE = "AVAILABLE",
	NO_LONGER_AVAILABLE = "NO_LONGER_AVAILABLE",
	TEMPORARILY_NOT_AVAILABLE = "TEMPORARILY_NOT_AVAILABLE",
	APPROVED_FOR_MARKETING = "APPROVED_FOR_MARKETING",
}

interface DateStruct {
	date: string;
	type: DateType;
}

enum DateType {
	ACTUAL = "ACTUAL",
	ESTIMATED = "ESTIMATED",
}
