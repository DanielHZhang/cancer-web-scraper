import { Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { type Drug, TherapyType } from "../db";
import { fmt } from "../utils/prompt";
import { openai } from "./openai";

const therapySchema = T.Object({
	reasoning: T.String({ maxLength: 400, description: "Your concise reasoning for your choice." }),
	therapyType: T.Enum(TherapyType, { description: "The therapy type you have classified the drug as." }),
});

export async function analyzeTherapyType(drug: Drug) {
	const completion = await openai.chat.completions.create({
		model: "gpt-4o",
		messages: [
			{
				role: "system",
				content: fmt`
				You are an expert physician and cancer drug classifier. Your objective is to output an unbiased, best-effort
				classification of the cancer drug provided by the user, given your extensive medical knowledge. The user will
				provide you with the drug name and a description of the drug, which may include it's pharmacology. Deliberate
				on your reasoning concisely before deciding on your choice. Respond in the specified JSON format.`,
			},
			{
				role: "user",
				content: fmt`
				Drug name: ${drug.name}
				Drug description:
				"""
				${drug.description}
				"""`,
			},
		],
		response_format: {
			type: "json_schema",
			json_schema: {
				name: "ChosenTherapyType",
				description:
					"This response indicates your choice and reasoning for why you have classified the drug as one of the provided cancer therapies.",
				schema: therapySchema,
				strict: false,
			},
		},
		max_tokens: 5000,
	});
	const { content, refusal } = completion.choices[0].message;
	if (refusal) {
		throw new Error(`GPT refused to answer: ${refusal}`);
	}
	if (!content) {
		throw new Error("No content returned.");
	}
	const data = JSON.parse(content);
	Value.Assert(therapySchema, data);
	return data;
}
