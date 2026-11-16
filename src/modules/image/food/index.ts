import 'server-only'

// The food templates' toggle flows (ARCHITECTURE §5.1c): the dish reader and its wiring.
export { dishReader, foodDeps, scriptFoodDeps } from './food-deps'
export { createOpenAIDishReader, dishNameNote, dishReadingBody, DISH_READING_SCHEMA } from './openai-dish-reader'
