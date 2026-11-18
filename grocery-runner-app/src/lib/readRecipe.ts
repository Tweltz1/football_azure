import { recognizeText } from '../../modules/recipe-reader';
import { parsePastedText, parsePhotoText, parseRecipePage, ParsedRecipe } from './recipeText';
export { cleanLink } from './recipeText';

const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

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
    // Recipe sites turn away requests that don't look like a browser, so ask like Safari on iPhone does.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res: Response;
    try {
      res = await fetch(input.url, { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': SAFARI, 'Accept-Language': 'en-US,en;q=0.9' }, signal: controller.signal });
    } catch {
      throw new Error('Could not open that page. Check your connection and the link, then try again.');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`That site wouldn't open the page (error ${res.status}). Try pasting the ingredients instead.`);
    return checked(parseRecipePage(await res.text()), 'No ingredient list found on that page. Try pasting the ingredients instead.');
  }
  return checked(parsePastedText(input.text), 'No ingredients found. Put one ingredient on each line.');
}
