import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEMO, demoCommunity } from './demo';
import { File } from 'expo-file-system';
import { hasPhoto, photoUri } from './recipePhotos';
import { Recipe, RecipeItem } from './recipes';
import type { Step } from './recipeSteps';
import { supabase } from './supabase';

// Recipes shoppers share with each other (table grocery_community_recipes, set up by
// tools/setup_accounts.py). Anyone can browse; sharing, reporting and saving need an account.

export const CATEGORIES = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🥞' },
  { key: 'lunch', label: 'Lunch', emoji: '🥪' },
  { key: 'dinner', label: 'Dinner', emoji: '🍲' },
  { key: 'sides', label: 'Sides', emoji: '🥗' },
  { key: 'snacks', label: 'Snacks', emoji: '🥨' },
  { key: 'desserts', label: 'Desserts', emoji: '🍰' },
  { key: 'drinks', label: 'Drinks', emoji: '🥤' },
] as const;
export type Category = (typeof CATEGORIES)[number]['key'];
export const categoryLabel = (key?: string) => CATEGORIES.find((c) => c.key === key)?.label ?? 'Recipe';

type Row = {
  id: string;
  user_id: string;
  author: string;
  title: string;
  category: string;
  emoji: string | null;
  minutes: number | null;
  servings: string | null;
  items: RecipeItem[];
  steps: Step[] | null;
  photo_url: string | null;
  photo_credit: string | null;
  saves: number;
  created_at: string;
};

export type CommunityRecipe = Recipe & { authorId: string; saves: number; createdAt: string };

const COLUMNS = 'id,user_id,author,title,category,emoji,minutes,servings,items,steps,photo_url,photo_credit,saves,created_at';
const PHOTOS = 'grocery-recipe-photos';

const toRecipe = (r: Row): CommunityRecipe => ({
  id: `c-${r.id}`,
  communityId: r.id,
  title: r.title,
  servings: r.servings ?? '',
  minutes: r.minutes ?? undefined,
  emoji: r.emoji ?? CATEGORIES.find((c) => c.key === r.category)?.emoji,
  items: Array.isArray(r.items) ? r.items.filter((i) => i && typeof i.item === 'string') : [],
  steps: Array.isArray(r.steps)
    ? r.steps.filter((st) => st && typeof st.text === 'string').map((st) => ({ text: st.text, minutes: Number(st.minutes) || 0, ...(st.during ? { during: true } : {}) }))
    : undefined,
  imageUrl: r.photo_url ?? undefined,
  photoCredit: r.photo_credit ?? undefined,
  source: 'community',
  author: r.author,
  category: r.category,
  authorId: r.user_id,
  saves: r.saves,
  createdAt: r.created_at,
});

// Recipes opened from the Community list, so the recipe screen can show them without another fetch.
const seen = new Map<string, CommunityRecipe>();
export const cachedCommunityRecipe = (id: string) => seen.get(id);

export async function fetchCommunity(opts: { category?: string; query?: string; sort: 'new' | 'popular' }): Promise<CommunityRecipe[]> {
  if (DEMO) {
    const sample = demoCommunity().filter((r) => !opts.category || r.category === opts.category);
    sample.forEach((r) => seen.set(r.id, r));
    return sample;
  }
  let q = supabase.from('grocery_community_recipes').select(COLUMNS).limit(60);
  if (opts.category) q = q.eq('category', opts.category);
  const text = opts.query?.trim().replace(/[%,()]/g, ' ');
  if (text) q = q.ilike('title', `%${text}%`);
  q = opts.sort === 'popular' ? q.order('saves', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const blocked = new Set(await blockedAuthors());
  const out = ((data ?? []) as Row[]).filter((r) => !blocked.has(r.user_id)).map(toRecipe);
  out.forEach((r) => seen.set(r.id, r));
  return out;
}

export async function fetchCommunityRecipe(communityId: string): Promise<CommunityRecipe | null> {
  const { data, error } = await supabase.from('grocery_community_recipes').select(COLUMNS).eq('id', communityId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = toRecipe(data as Row);
  seen.set(r.id, r);
  return r;
}

/** Uploads the recipe's own photo (taken in the app) so others can see it. Returns its public address. */
async function uploadPhoto(recipe: Recipe): Promise<string | null> {
  if (!recipe.photo || !hasPhoto(recipe.photo)) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const path = `${auth.user.id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.jpg`;
  const bytes = await new File(photoUri(recipe.photo)).bytes();
  const { error } = await supabase.storage.from(PHOTOS).upload(path, bytes, { contentType: 'image/jpeg' });
  if (error) throw new Error(`Couldn’t upload the photo: ${error.message}`);
  return supabase.storage.from(PHOTOS).getPublicUrl(path).data.publicUrl;
}

export async function shareRecipe(recipe: Recipe, category: Category, author: string): Promise<string> {
  const photoUrl = await uploadPhoto(recipe);
  const { data, error } = await supabase
    .from('grocery_community_recipes')
    .insert({
      author: author.trim().slice(0, 40),
      title: recipe.title.trim().slice(0, 80),
      category,
      emoji: recipe.emoji ?? null,
      minutes: recipe.minutes ?? null,
      servings: recipe.servings?.slice(0, 40) || null,
      items: recipe.items.slice(0, 60).map((i) => ({ item: i.item.slice(0, 80), amount: (i.amount ?? '').slice(0, 40), pantry: !!i.pantry })),
      steps: recipe.steps?.length
        ? recipe.steps.slice(0, 40).map((st) => ({ text: st.text.slice(0, 600), minutes: Math.max(0, Math.min(1440, Math.round(st.minutes))), ...(st.during ? { during: true } : {}) }))
        : null,
      photo_url: photoUrl,
    })
    .select('id')
    .single();
  // Row security refuses accounts banned from sharing (after reported recipes were removed).
  if (error?.code === '42501') throw new Error('This account can’t share recipes anymore. Contact shopstride@weltzcraft.com if you think that’s a mistake.');
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function removeShared(communityId: string) {
  // The photo goes too (it's only stored for this recipe).
  const url = seen.get(`c-${communityId}`)?.imageUrl;
  const marker = `/object/public/${PHOTOS}/`;
  if (url?.includes(marker)) await supabase.storage.from(PHOTOS).remove([url.split(marker)[1]]).catch(() => {});
  const { error } = await supabase.from('grocery_community_recipes').delete().eq('id', communityId);
  if (error) throw new Error(error.message);
  seen.delete(`c-${communityId}`);
}

export async function reportRecipe(communityId: string, reason: string) {
  const { error } = await supabase.from('grocery_recipe_reports').insert({ recipe_id: communityId, reason: reason.slice(0, 200) });
  // Reporting twice is fine: the first report already counts.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export function countSave(communityId: string) {
  supabase.rpc('grocery_recipe_saved', { recipe: communityId }).then(() => {}, () => {});
}

// Blocked authors are kept on this phone; their recipes never show again here.
const BLOCK_KEY = 'grocery-runner:blocked-authors';
export async function blockedAuthors(): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(BLOCK_KEY)) ?? '[]');
  } catch {
    return [];
  }
}
export async function blockAuthor(userId: string) {
  const list = await blockedAuthors();
  if (!list.includes(userId)) await AsyncStorage.setItem(BLOCK_KEY, JSON.stringify([...list, userId]));
  for (const [k, r] of seen) if (r.authorId === userId) seen.delete(k);
}
