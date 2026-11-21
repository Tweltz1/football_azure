import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { DEMO } from './demo';
import { EMPTY_PLAN, MealPlan, planWeek } from './mealPlan';
import { Recipe, SUGGESTED } from './recipes';
import { LIBRARY } from './library';
import { useData } from './store';

const KEY = 'shopstride.mealplan.v1';

type PlanApi = {
  plan: MealPlan;
  update: (change: (p: MealPlan) => MealPlan) => void;
  addMeal: (date: string, recipeId: string) => void;
  removeMeal: (date: string, recipeId: string) => void;
  /** Recipes you can plan with: your own, then the built-in ones. */
  pool: Recipe[];
  recipeById: (id: string) => Recipe | undefined;
};

const PlanContext = createContext<PlanApi | null>(null);

/** Screenshot build: a planned week so the Plan tab has something to show. */
function demoPlan(): MealPlan {
  const week = planWeek(0, new Date());
  const ids = ['s-tacos', 's-stirfry', 's-spaghetti', 's-sheetpan', 's-chili'];
  return { ...EMPTY_PLAN, meals: Object.fromEntries(ids.map((id, i) => [week[i + 1], [id]])) };
}

/** The weekly meal plan, saved on the phone. */
export function PlanProvider({ children }: { children: ReactNode }) {
  const { myRecipes } = useData();
  const [plan, setPlan] = useState<MealPlan>(() => (DEMO ? demoPlan() : EMPTY_PLAN));
  const [ready, setReady] = useState(DEMO);

  useEffect(() => {
    if (DEMO) return;
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setPlan({ ...EMPTY_PLAN, ...JSON.parse(raw) }))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (ready && !DEMO) AsyncStorage.setItem(KEY, JSON.stringify(plan)).catch(() => {});
  }, [plan, ready]);

  const api = useMemo<PlanApi>(() => {
    const pool = [...myRecipes, ...SUGGESTED, ...LIBRARY];
    return {
      plan,
      update: (change) => setPlan((p) => change(p)),
      addMeal: (date, id) =>
        setPlan((p) => ({ ...p, meals: { ...p.meals, [date]: [...(p.meals[date] ?? []).filter((x) => x !== id), id] } })),
      removeMeal: (date, id) =>
        setPlan((p) => ({ ...p, meals: { ...p.meals, [date]: (p.meals[date] ?? []).filter((x) => x !== id) } })),
      pool,
      recipeById: (id) => pool.find((r) => r.id === id),
    };
  }, [plan, myRecipes]);

  return <PlanContext.Provider value={api}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanApi {
  const v = useContext(PlanContext);
  if (!v) throw new Error('usePlan outside PlanProvider');
  return v;
}
