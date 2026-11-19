// Steps with times for the suggested recipes (written for Shop Stride). A step marked `during` runs at the
// same time as the step before it ("meanwhile cook the pasta", rice cooking while you chop), so the total
// time is the longer of the step-by-step time and when the last of those side steps finishes.

export type Step = { text: string; minutes: number; during?: boolean };

const s = (minutes: number, text: string): Step => ({ minutes, text });
const d = (minutes: number, text: string): Step => ({ minutes, text, during: true });

export const STEPS: Record<string, Step[]> = {
  tacos: [
    s(5, 'Shred the lettuce, dice the tomatoes and grate the cheese if it isn’t already shredded.'),
    s(10, 'Brown the ground beef in a large skillet over medium-high heat, breaking it up. Drain the fat.'),
    s(5, 'Stir in the taco seasoning and the water the packet calls for. Simmer until thick.'),
    d(5, 'Warm the taco shells on a sheet pan at 350°F.'),
    s(3, 'Fill the shells with beef and top with cheese, lettuce, tomatoes, sour cream and salsa.'),
  ],
  stirfry: [
    s(3, 'Rinse the rice and start it in a pot or rice cooker.'),
    d(20, 'Rice cooks (about 20 minutes, then rest 5).'),
    s(8, 'Cut the chicken into bite-size pieces and the broccoli into florets. Mince the garlic and ginger, slice the green onions.'),
    s(2, 'Whisk the soy sauce, sugar, cornstarch and 1/4 cup water for the sauce.'),
    s(7, 'Heat the oil in a large skillet or wok over high heat. Cook the chicken until browned and cooked through, then set aside.'),
    s(4, 'Stir-fry the broccoli with 2 tbsp water until bright green and crisp-tender. Add the garlic and ginger for 30 seconds.'),
    s(3, 'Return the chicken, pour in the sauce and toss until glossy and thick. Top with green onions and serve over rice.'),
  ],
  spaghetti: [
    s(5, 'Bring a big pot of salted water to a boil. Dice the onion and mince the garlic.'),
    s(10, 'Brown the beef with the onion in olive oil over medium-high heat. Drain, then add the garlic for 1 minute.'),
    s(15, 'Pour in the marinara and simmer, stirring now and then.'),
    d(11, 'Meanwhile cook the spaghetti until al dente. Save a cup of the pasta water, then drain.'),
    d(10, 'Bake the garlic bread as the package says.'),
    s(3, 'Toss the spaghetti with the sauce, loosening with pasta water. Serve with parmesan.'),
  ],
  sheetpan: [
    s(5, 'Heat the oven to 425°F. Halve the potatoes; cut the peppers, onion and zucchini into chunks.'),
    s(3, 'Toss the potatoes with half the oil, salt, pepper and seasoning on a sheet pan.'),
    s(12, 'Roast the potatoes while you slice the sausage into coins.'),
    s(15, 'Add the sausage and the rest of the vegetables tossed in the remaining oil. Roast until browned, stirring once.'),
  ],
  chili: [
    s(5, 'Dice the onion. Drain and rinse the beans.'),
    s(10, 'Brown the beef with the onion in a large pot. Drain most of the fat.'),
    s(2, 'Stir in the chili powder, cumin and a big pinch of salt for 1 minute.'),
    s(30, 'Add the tomatoes, tomato sauce and beans. Simmer uncovered, stirring now and then, until thick.'),
    s(3, 'Taste for salt and serve topped with cheese and sour cream.'),
  ],
  salmon: [
    s(5, 'Heat the oven to 400°F. Snap the woody ends off the asparagus. Mince the garlic, slice one lemon and juice the other.'),
    s(3, 'Melt the butter with the garlic and lemon juice.'),
    s(3, 'Put the salmon and asparagus on a sheet pan. Brush everything with the lemon butter, drizzle the asparagus with oil, and season.'),
    s(13, 'Bake until the salmon flakes easily (12–15 minutes).'),
    s(1, 'Top with lemon slices and chopped parsley.'),
  ],
  burgers: [
    s(10, 'Heat the grill to medium-high. Slice the tomatoes, onion and lettuce.'),
    d(5, 'Shape the beef into 6–8 patties a little wider than the buns, press a dimple in the middle and salt both sides.'),
    s(8, 'Grill the patties 3–4 minutes a side. Add the cheese for the last minute; toast the buns.'),
    s(3, 'Build the burgers with lettuce, tomato, onion, pickles, ketchup and mustard.'),
  ],
  alfredo: [
    s(5, 'Bring a big pot of salted water to a boil. Mince the garlic; season the chicken with salt and pepper.'),
    s(12, 'Cook the chicken in a skillet over medium-high heat, 5–6 minutes a side, until cooked through. Rest, then slice.'),
    d(11, 'Meanwhile cook the fettuccine until al dente and drain.'),
    s(6, 'In the same skillet melt the butter, add the garlic for 30 seconds, then the cream. Simmer 3 minutes and stir in the parmesan.'),
    s(2, 'Toss the pasta in the sauce, top with chicken and parsley.'),
  ],
  quesadillas: [
    s(5, 'Pull the rotisserie chicken off the bone and shred it. Thinly slice the pepper.'),
    s(12, 'Fill each tortilla on one half with cheese, chicken and pepper, fold, and cook in a dry skillet 2–3 minutes a side until golden.'),
    d(3, 'Meanwhile mash or slice the avocados.'),
    s(2, 'Cut into wedges and serve with salsa, sour cream and avocado.'),
  ],
  pancakes: [
    s(18, 'Lay the bacon on a sheet pan and bake at 400°F until crisp.'),
    d(3, 'Meanwhile mix the pancake batter as the box says. Fold in half the blueberries.'),
    d(12, 'Cook the pancakes on a buttered griddle over medium heat, flipping when bubbles form.'),
    s(6, 'Fry or scramble eggs in the bacon fat or butter.'),
    s(2, 'Serve with butter, maple syrup and the rest of the blueberries.'),
  ],
  curry: [
    s(3, 'Start the rice.'),
    d(20, 'Rice cooks.'),
    s(5, 'Dice the onion, mince the garlic and ginger. Drain and rinse the chickpeas.'),
    s(6, 'Cook the onion in oil until soft, then add the garlic, ginger and curry powder for 1 minute.'),
    s(12, 'Add the chickpeas, tomatoes and coconut milk. Simmer until slightly thick.'),
    s(2, 'Stir in the spinach until wilted, salt to taste, and serve over rice.'),
  ],
  blts: [
    s(15, 'Bake the bacon at 400°F on a sheet pan until crisp.'),
    d(8, 'Meanwhile heat the soup on the stove as the can says.'),
    d(5, 'Wash the lettuce and slice the tomatoes. Toast the bread.'),
    s(4, 'Spread the toast with mayonnaise and build the sandwiches with bacon, lettuce and tomato.'),
  ],
  caesar: [
    s(10, 'Heat the grill or a grill pan to medium-high. Pound the chicken to an even thickness, rub with oil and season with pepper.'),
    s(12, 'Grill the chicken 5–6 minutes a side until cooked through. Rest 5 minutes.'),
    d(5, 'Meanwhile chop the romaine and cut the lemon into wedges.'),
    s(3, 'Slice the chicken. Toss the romaine with dressing, croutons and parmesan, and top with the chicken.'),
  ],
  potroast: [
    s(10, 'Pat the roast dry and season well. Brown it on all sides in a hot skillet (optional, but more flavor).'),
    s(10, 'Cut the carrots into chunks and the onion into wedges; halve big potatoes. Put them in the slow cooker with the roast on top.'),
    s(3, 'Whisk the broth with the tomato paste and pour it over; add the thyme.'),
    s(480, 'Cook on low 8 hours (or high 4–5) until the beef pulls apart.'),
    s(5, 'Shred the beef and serve with the vegetables and juices.'),
  ],
  friedrice: [
    s(3, 'Use cold leftover rice if you have it; otherwise cook the rice and spread it on a tray to cool.'),
    s(5, 'Thaw the shrimp under cold water and pat dry. Slice the green onions and mince the garlic.'),
    s(4, 'Heat half the oil in a large skillet over high heat. Cook the shrimp until pink, then set aside.'),
    s(2, 'Scramble the eggs in the pan, then push them to the side.'),
    s(6, 'Add the rest of the oil, the garlic, peas and carrots, then the rice. Fry, stirring, until hot and a little crisp.'),
    s(2, 'Stir in the soy sauce, sesame oil, shrimp and green onions.'),
  ],
  pizza: [
    s(5, 'Heat the oven to 475°F with a pan or pizza stone inside. Let the dough sit out to warm up.'),
    s(5, 'Stretch the dough on a floured surface into a 14-inch round and move it to parchment.'),
    s(3, 'Spread the sauce, then the mozzarella and pepperoni. Brush the edge with olive oil.'),
    s(12, 'Bake until the crust is deep golden and the cheese bubbles.'),
    d(3, 'Meanwhile toss the bagged salad.'),
    s(3, 'Rest the pizza 2 minutes, then slice.'),
  ],
  bowls: [
    s(3, 'Start the rice.'),
    d(20, 'Rice cooks; stir in lime juice and chopped cilantro when it’s done.'),
    s(3, 'Season the chicken with chili powder, cumin, salt and oil.'),
    s(12, 'Cook the chicken in a skillet over medium-high heat, 5–6 minutes a side. Rest, then slice.'),
    d(5, 'Meanwhile warm the beans and corn together. Chop the lettuce and slice the avocados.'),
    s(3, 'Build the bowls: rice, lettuce, chicken, beans and corn, salsa, avocado and a lime wedge.'),
  ],
  lentilsoup: [
    s(8, 'Dice the onion, carrots and celery. Mince the garlic. Rinse the lentils.'),
    s(7, 'Cook the onion, carrots and celery in the oil until soft. Add the garlic and cumin for 1 minute.'),
    s(30, 'Add the lentils, broth and tomatoes. Bring to a boil, then simmer partly covered until the lentils are tender.'),
    s(2, 'Stir in the spinach and the juice of the lemon. Salt to taste.'),
  ],
  tofu: [
    s(3, 'Start the brown rice.'),
    d(40, 'Brown rice cooks (about 40 minutes); the rest happens meanwhile.'),
    s(10, 'Press the tofu between towels for 10 minutes, then cut into cubes and toss with the cornstarch.'),
    s(10, 'Fry the tofu in 2 tbsp oil over medium-high heat, turning, until crisp on all sides. Set aside.'),
    s(5, 'Stir-fry the broccoli, snap peas and pepper in the rest of the oil. Add the garlic and ginger for 30 seconds.'),
    s(2, 'Add the tofu and tamari and toss. Sprinkle with sesame seeds; serve over rice.'),
  ],
  steakpotato: [
    s(5, 'Heat the oven to 425°F. Cut the potatoes into chunks and toss with oil, salt, pepper and the rosemary.'),
    s(35, 'Roast the potatoes, turning once, until crisp. Take the steak out of the fridge to warm up.'),
    d(5, 'Trim the green beans. Season the steak well with salt and pepper.'),
    s(10, 'Sear the steak in a very hot oiled skillet, 4–5 minutes a side for medium-rare. Rest 5 minutes.'),
    d(6, 'Meanwhile sauté the green beans with the garlic in the steak pan or another skillet.'),
    s(2, 'Slice the steak against the grain and serve.'),
  ],
  greekchicken: [
    s(5, 'Heat the oven to 425°F. Toss the chicken with oil, oregano, salt, the zest and juice of one lemon.'),
    s(3, 'Cut the onion into wedges and add it to the sheet pan with the chicken.'),
    s(15, 'Roast 15 minutes.'),
    s(10, 'Add the tomatoes and olives and roast until the chicken reaches 175°F.'),
    d(5, 'Meanwhile dice the cucumber and stir it into the yogurt with a squeeze of lemon and a pinch of salt.'),
    s(2, 'Crumble the feta on top and serve with the cucumber yogurt.'),
  ],
  turkeychili: [
    s(5, 'Dice the onion and mince the garlic. Drain and rinse the beans.'),
    s(8, 'Brown the turkey with the onion in a large pot. Add the garlic, cumin and oregano for 1 minute.'),
    s(20, 'Add the broth, beans and chiles. Simmer; mash some of the beans against the pot to thicken it.'),
    s(5, 'Stir in the corn and cook 5 minutes. Finish with lime juice, salt and chopped cilantro.'),
  ],
  pulledpork: [
    s(5, 'Rub the pork with paprika, salt and brown sugar.'),
    s(3, 'Put it in the slow cooker with the vinegar and half the barbecue sauce.'),
    s(480, 'Cook on low 8 hours (or high 5) until it falls apart.'),
    s(10, 'Shred the pork, skim the fat from the juices and stir in the rest of the sauce.'),
    d(5, 'Meanwhile toss the coleslaw mix with the mayonnaise and a splash of vinegar.'),
    s(2, 'Pile the pork and slaw on the buns.'),
  ],
  chickentacos: [
    s(3, 'Put the chicken in the slow cooker, sprinkle with taco seasoning and pour the salsa over.'),
    s(360, 'Cook on low 6 hours (or high 3) until it shreds easily.'),
    s(5, 'Shred the chicken in the sauce.'),
    d(5, 'Meanwhile thinly slice the cabbage, slice the avocados and cut the limes into wedges.'),
    s(3, 'Warm the tortillas and fill with chicken, cabbage, avocado, cilantro and lime.'),
  ],
  shrimpzoodles: [
    s(8, 'Spiralize the zucchini (or buy it spiralized). Halve the tomatoes and mince the garlic. Peel the shrimp if needed.'),
    s(4, 'Cook the shrimp in half the oil over medium-high heat until pink. Set aside.'),
    s(3, 'Add the rest of the oil, garlic, red pepper flakes and tomatoes until the tomatoes soften.'),
    s(3, 'Toss in the zucchini noodles just until warm, so they don’t go soggy.'),
    s(1, 'Return the shrimp, add lemon juice, salt and torn basil.'),
  ],
  omelet: [
    s(12, 'Cook the hash browns in oil in a large skillet over medium-high heat until crisp, as the bag says.'),
    d(4, 'Meanwhile dice the onion and pepper; whisk the eggs with salt and pepper.'),
    s(4, 'In another pan soften the onion and pepper in oil, then wilt the spinach.'),
    s(3, 'Add the eggs and stir gently over medium-low heat until just set.'),
    s(1, 'Serve the eggs over the potatoes with salsa.'),
  ],
  oats: [
    s(5, 'In jars, stir together the oats, almond milk, chia seeds and a drizzle of honey (about 1/2 cup oats per jar).'),
    s(5, 'Slice the strawberries and bananas; add them on top or keep them for the morning.'),
    s(480, 'Refrigerate overnight (at least 4 hours). Eat cold, or warm 1 minute in the microwave.'),
  ],
  macncheese: [
    s(5, 'Heat the oven to 375°F and bring a pot of salted water to a boil. Grate the cheese.'),
    s(7, 'Cook the macaroni 2 minutes short of the package time and drain.'),
    d(8, 'Meanwhile melt 3 tbsp butter, whisk in the flour for 1 minute, then the milk. Simmer until thick.'),
    s(3, 'Off the heat, stir in most of the cheese and the pasta. Pour into a baking dish.'),
    s(2, 'Top with the remaining cheese and the panko tossed with the last tablespoon of melted butter.'),
    s(20, 'Bake until bubbling and golden.'),
  ],
  blackbean: [
    s(5, 'Heat the oven to 425°F. Peel and cube the sweet potatoes, then toss with oil, chili powder and salt.'),
    s(25, 'Roast the sweet potatoes, stirring once, until tender and browned.'),
    d(5, 'Meanwhile warm the beans, dice the onion, slice the avocados, chop the cilantro and cut the limes.'),
    s(3, 'Warm the tortillas and fill with sweet potatoes, beans, avocado, onion, cilantro and lime.'),
  ],
  pestopasta: [
    s(5, 'Bring a big pot of salted water to a boil. Halve the tomatoes and tear the mozzarella.'),
    s(11, 'Cook the penne until al dente. Save a cup of pasta water and drain.'),
    s(2, 'Toss the hot pasta with the pesto, spinach and a splash of pasta water until the spinach wilts.'),
    s(1, 'Fold in the tomatoes and mozzarella. Serve with parmesan.'),
  ],
};

/** Total minutes, counting side steps as running alongside the step before them. */
export function totalMinutes(steps: Step[]): number {
  let clock = 0; // when the current main step ends
  let lastStart = 0; // when the current main step started
  let end = 0;
  for (const st of steps) {
    if (st.during) {
      end = Math.max(end, lastStart + st.minutes);
    } else {
      lastStart = clock;
      clock += st.minutes;
    }
  }
  return Math.max(clock, end);
}
