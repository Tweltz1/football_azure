import { recognizeText } from '../../modules/recipe-reader';
import { parsePastedText, parsePhotoText, parseRecipePage, ParsedRecipe } from './recipeText';

const checked = (r: ParsedRecipe, hint: string): ParsedRecipe => {
  if (!r.items.length) throw new Error(hint);
  return r;
};

/**
 * Reads a recipe on the phone, with no AI service or API key: photos with Apple's built-in text
 * recognition, links from the page's published recipe data, pasted text as is. Then rules in recipeText.ts
 * turn the lines into shopping items.
 */
export async function readRecipe(input: { photoUri: string } | { url: string } | { text: string }): Promise<ParsedRecipe> {
  if ('photoUri' in input) {
    return checked(
      parsePhotoText(await recognizeText(input.photoUri)),
      'No ingredients found in that photo. Try a sharp, straight-on photo of the ingredient list.',
    );
  }
  if ('url' in input) {
    const res = await fetch(input.url, { headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error(`Could not open that page (${res.status}).`);
    return checked(parseRecipePage(await res.text()), 'No ingredient list found on that page. Try pasting the ingredients instead.');
  }
  return checked(parsePastedText(input.text), 'No ingredients found. Put one ingredient on each line.');
}
