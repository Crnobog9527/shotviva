// The food templates' toggles as generation flows (ARCHITECTURE §5.1c「餐饮开关的出图流程」).
export { chooseFoodFlow, flowExtraImages, foodToggles, runsFoodFlow, type FoodChoice, type FoodFallback, type FoodFlowKind, type FoodToggles } from './plan'
export { dishReadingSchema, dishText, type DishReader, type DishReaderUsage, type DishReading } from './reading'
export { DISH_READ_TIMEOUT_MS, nearestAspect, runFoodFlow, type FoodDeps, type FoodOutcome, type FoodPlan } from './run'
export { foodPlanOf } from './food-plan'
export { foodStep, withReadCost } from './step'
export type { FoodReport } from './run'
