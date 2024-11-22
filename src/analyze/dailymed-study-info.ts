import { Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Drug } from "../db";
import { fmt } from "../utils/prompt";
import { openai } from "./openai";

const studyInfoSchema = T.Object({
	studyName: T.Optional(T.String({ description: "The name of the study, if present." })),
	studyNumParticipants: T.Optional(
		T.Number({ description: "The total number of participants in the study, if present." }),
	),
});

export async function analyzeDailyMedStudy(drug: Drug) {
	if (!drug.dailyMed?.studyText) {
		throw new Error("Missing study text for analysis.");
	}
	const completion = await openai.chat.completions.create({
		model: "gpt-4o",
		messages: [
			{
				role: "system",
				content: fmt`
				You are an expert physician and cancer researcher. Your objective is to output the name and total number of
				study participants in the study text provided by the user. The text content may contain this info or it may
				not. Ensure that you are properly returning this info for the main study, and not supplementary studies that
				may be mentioned in passing. Respond in the specified JSON format.`,
			},
			{
				role: "user",
				content: fmt`
				Drug name: ${drug.name}
				Study text:
				"""
				${drug.dailyMed.studyText.slice(0, 5000)}
				"""`,
			},
		],
		response_format: {
			type: "json_schema",
			json_schema: {
				name: "StudyNameAndNumParticipants",
				description: "This response contains the info you found within the study text, if any.",
				schema: studyInfoSchema,
				strict: false,
			},
		},
		max_tokens: 10000,
	});
	const { content, refusal } = completion.choices[0].message;
	if (refusal) {
		throw new Error(`GPT refused to answer: ${refusal}`);
	}
	if (!content) {
		throw new Error("No content returned.");
	}
	const data = JSON.parse(content);
	Value.Assert(studyInfoSchema, data);
	return data;
}
