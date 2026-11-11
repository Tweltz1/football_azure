import { useEffect, useRef } from 'react';
import { useAuth } from './auth';
import { Recipe } from './recipes';
import { useData } from './store';
import { supabase } from './supabase';

// Keeps "Your recipes" in the signed-in account (table grocery_saved_recipes, one row per person),
// so they come back on a new phone. Merges by recipe id; deletions are remembered so they stick.

type Cloud = { recipes: Recipe[]; deleted: string[] };

function merge(local: Recipe[], localDeleted: string[], cloud: Cloud | null): Cloud {
  const deleted = [...new Set([...localDeleted, ...(cloud?.deleted ?? [])])].slice(0, 300);
  const gone = new Set(deleted);
  const byId = new Map<string, Recipe>();
  for (const r of cloud?.recipes ?? []) if (r?.id && !gone.has(r.id)) byId.set(r.id, r);
  for (const r of local) if (!gone.has(r.id)) byId.set(r.id, r); // this phone's copy wins
  const order = [...local.map((r) => r.id), ...(cloud?.recipes ?? []).map((r) => r.id)];
  const recipes = [...new Set(order)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  return { recipes, deleted };
}

export function RecipeSync() {
  const { session } = useAuth();
  const { ready, myRecipes, deletedRecipeIds, replaceRecipes } = useData();
  const uid = session?.user.id;
  const pulledFor = useRef<string | null>(null);
  // Set once the first merge for this account is saved; pushes wait for it so they never overwrite
  // the cloud copy with this phone's list alone.
  const syncedFor = useRef<string | null>(null);

  // On sign-in: pull, merge, keep the merged copy here and in the cloud.
  useEffect(() => {
    if (!ready || !uid || pulledFor.current === uid) return;
    pulledFor.current = uid;
    (async () => {
      const { data } = await supabase.from('grocery_saved_recipes').select('data').eq('user_id', uid).maybeSingle();
      const merged = merge(myRecipes, deletedRecipeIds ?? [], (data?.data as Cloud | undefined) ?? null);
      replaceRecipes(merged.recipes, merged.deleted);
      const { error } = await supabase.from('grocery_saved_recipes').upsert({ user_id: uid, data: merged, updated_at: Date.now() });
      if (error) throw error;
      syncedFor.current = uid;
    })().catch(() => {
      pulledFor.current = null; // try again next time
    });
    // Only when the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid]);

  // After that: push changes a moment after they happen.
  useEffect(() => {
    if (!uid || syncedFor.current !== uid) return;
    const timer = setTimeout(() => {
      supabase
        .from('grocery_saved_recipes')
        .upsert({ user_id: uid, data: { recipes: myRecipes, deleted: deletedRecipeIds ?? [] }, updated_at: Date.now() })
        .then(() => {}, () => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [uid, myRecipes, deletedRecipeIds]);

  useEffect(() => {
    if (!uid) {
      pulledFor.current = null;
      syncedFor.current = null;
    }
  }, [uid]);

  return null;
}
