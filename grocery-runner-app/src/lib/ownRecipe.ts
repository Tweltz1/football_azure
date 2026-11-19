import { capFirst, titleCase } from './caps';
import { RecipeItem } from './recipes';
import { Step, totalMinutes } from './recipeSteps';
import { parseRecipeLines, stepMinutes } from './recipeText';

export type StepDraft = { text: string; minutes: string };

/**
 * A recipe the shopper writes themselves ("Create your own"): ingredients typed one per line,
 * steps with optional minutes. A step left without minutes uses the time its text mentions.
 */
export function buildOwnRecipe(input: { title: string; servings: string; ingredients: string; steps: StepDraft[] }): {
  title: string;
  servings: string;
  items: RecipeItem[];
  steps: Step[];
  minutes?: number;
} {
  const lines = input.ingredients.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = parseRecipeLines(lines, input.title, true).items;
  const steps: Step[] = input.steps
    .map((st) => {
      const text = capFirst(st.text.replace(/\s+/g, ' ').trim()).slice(0, 600);
      const typed = parseInt(st.minutes, 10);
      const minutes = Number.isFinite(typed) && typed >= 0 ? Math.min(typed, 1440) : stepMinutes(text);
      return { text, minutes };
    })
    .filter((st) => st.text.length > 1)
    .slice(0, 40);
  const minutes = steps.length ? totalMinutes(steps) : 0;
  return {
    title: titleCase(input.title.trim()).slice(0, 80) || 'My recipe',
    servings: input.servings.trim().slice(0, 40),
    items,
    steps,
    ...(minutes > 0 ? { minutes } : {}),
  };
}
