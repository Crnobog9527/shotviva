// Step two of ARCHITECTURE §5.1a: what the decision model is asked about the user's words. It
// only ever sees text the user typed, never a template prompt and never a photo, and nothing
// here is added to what the image model receives. The criteria are shared by the text-only
// call and the photo edit's scope call, so both judge the same way.

const CRITERIA = `identity_swap is true only when the request asks to:
- put one person's face, head or identity onto another person (a face swap or head swap, e.g. "replace her face with the man in photo 2", "把他的脸换成第二张图的人");
- merge, blend or morph the faces of different people into one;
- turn a person into, or make them look like, a specific real individual who exists (a named celebrity, politician, influencer or any other real person, e.g. "make her look like Taylor Swift").
Everything else is false, including: changing the expression, smile, gaze, pose, makeup, hairstyle, hair colour, beard, clothes, accessories, lighting, background, scene, colours or art style; making the person look younger or older; retouching skin or making them look better, rested or more energetic; adding or removing objects; several photos of the same product or the same person used as references; fictional or generic looks ("as an astronaut", "anime style", "like a superhero", "a Renaissance portrait").
The request may be in any language, or mix languages. Judge what it means, not single words; indirect phrasing that still asks for another person's face counts.`

// Instructions of the text-only call (workspace note, template text fields, partner prompt).
export const IDENTITY_JUDGE_INSTRUCTIONS = `You screen one request a user typed for an AI photo studio. Users upload their own photos and describe what to make or change; text may also be poster copy such as a title or a price. Answer with JSON only.
${CRITERIA}`

// Appended to the edit template's scope instructions so the one scope call also answers this.
export const IDENTITY_EDIT_ADDENDUM = `Also answer identity_swap (boolean) about the user's request.
${CRITERIA}`
