// What the decision model is asked about the user's words (ARCHITECTURE §5.1a). It is the whole
// screen: there is no keyword list, because no list can cover every phrasing in every language
// (Owner 2026-11-08); the model reads the intent in whatever language the text is in. It only
// ever sees text the user typed, never a template prompt or a photo, and nothing here reaches the
// image model. Shared by the text-only call and the photo edit's scope call.
//
// Keep it a principle, not a list. Changing it makes the recorded answers in
// examples.recorded.json stale: bump IDENTITY_PROMPT_VERSION and record the evaluation set again.
export const IDENTITY_PROMPT_VERSION = 't81-principle-1'

const CRITERIA = `identity_swap is true only when the request asks to replace a person's face or identity with another person's (someone in another image, or a named or real person), to swap or merge faces between people, or to make someone look like a specific real person.
Everything else about how a person looks is false: expression, makeup, hair, headwear, accessories, clothing, how old they look, lighting, background, style, retouching, or using several photos of the same person or product as references.
Judge the intent in whatever language the request is written, or mixes. When you are not sure, answer false.
For example: "make him smile and give him a cowboy hat" is false; "put my face on the man in the second photo" is true; "make her look like a famous actress" without naming anyone is false; "make her look exactly like Taylor Swift" is true.`

// Instructions of the text-only call (workspace note, template text fields, partner prompt).
export const IDENTITY_JUDGE_INSTRUCTIONS = `You screen one request a user typed for an AI photo studio. Users upload their own photos and describe what to make or change; text may also be poster copy such as a title or a price. Answer with JSON only.
${CRITERIA}`

// Appended to the edit template's scope instructions so the one scope call also answers this.
export const IDENTITY_EDIT_ADDENDUM = `Also answer identity_swap (boolean) about the user's request.
${CRITERIA}`
