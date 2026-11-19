// Steps with times for the suggested recipes (written for Shop Stride). A step marked `during` runs at the
// same time as the step before it ("meanwhile cook the pasta", rice cooking while you chop), so the total
// time is the longer of the step-by-step time and when the last of those side steps finishes.

export type Step = { text: string; minutes: number; during?: boolean };

const s = (minutes: number, text: string): Step => ({ minutes, text });
const d = (minutes: number, text: string): Step => ({ minutes, text, during: true });

export const STEPS: Record<string, Step[]> = {
  tacos: [
    s(5, 'Heat the oven to 350°F. Shred the lettuce and dice the tomatoes.'),
    s(10, 'Brown the ground beef in a large skillet over medium-high heat, breaking it up, until no pink is left. Drain the fat.'),
    s(5, 'Stir in the taco seasoning and the water the packet calls for. Simmer 5 minutes, until thick.'),
    d(5, 'Warm the taco shells on a sheet pan in the oven, 5 minutes.'),
    s(3, 'Fill the shells with beef and top with the cheese, lettuce, tomatoes, sour cream and salsa.'),
  ],
  stirfry: [
    s(3, 'Rinse the rice. Bring it to a boil with 3 cups of water, then cover and turn the heat to low.'),
    d(23, 'Let the rice simmer 18 minutes, then rest off the heat 5 minutes.'),
    s(8, 'Cut the chicken into bite-size pieces and the broccoli into florets. Mince the garlic and ginger and slice the green onions.'),
    s(2, 'Whisk the soy sauce, sugar, cornstarch and 1/4 cup water for the sauce.'),
    s(6, 'Heat 1 tbsp of the oil in a large skillet or wok over high heat. Cook the chicken until browned and cooked through, about 6 minutes, then set it aside.'),
    s(4, 'Add the rest of the oil, the broccoli and 2 tbsp water. Stir-fry until bright green and crisp-tender, about 3 minutes, then add the garlic and ginger for 30 seconds.'),
    s(2, 'Return the chicken, pour in the sauce and toss until glossy and thick, about 2 minutes. Top with the green onions and serve over the rice.'),
  ],
  spaghetti: [
    s(2, 'Heat the oven for the garlic bread as its package says. Put a big pot of well-salted water on high heat to boil.'),
    s(5, 'Dice the onion and mince the garlic.'),
    s(9, 'Brown the beef and onion in the olive oil over medium-high heat, about 8 minutes. Drain the fat, then stir in the garlic for 1 minute.'),
    s(15, 'Pour in the marinara sauce and simmer 15 minutes, stirring now and then.'),
    d(10, 'Cook the spaghetti in the boiling water until al dente, about 10 minutes. Save a cup of the pasta water, then drain.'),
    d(12, 'Bake the garlic bread as the package says, usually 10 to 12 minutes.'),
    s(3, 'Toss the spaghetti with the sauce, loosening it with a splash of pasta water. Serve with parmesan cheese and the garlic bread.'),
  ],
  sheetpan: [
    s(15, 'Heat the oven to 425°F, about 15 minutes. Meanwhile halve the potatoes, cut the peppers, onion and zucchini into chunks, and slice the sausage into coins.'),
    s(2, 'Toss the potatoes on a sheet pan with half the oil, half the Italian seasoning, salt and pepper.'),
    s(15, 'Roast the potatoes for 15 minutes.'),
    s(2, 'Toss the sausage, peppers, onion and zucchini with the rest of the oil and seasoning and add them to the pan.'),
    s(20, 'Roast until the potatoes are tender and the sausage is browned, about 20 minutes, stirring once.'),
  ],
  chili: [
    s(5, 'Dice the onion. Drain and rinse the beans.'),
    s(10, 'Brown the beef with the onion in a large pot over medium-high heat, about 10 minutes. Drain most of the fat.'),
    s(1, 'Stir in the chili powder, cumin and a big pinch of salt for 1 minute.'),
    s(30, 'Add the diced tomatoes, tomato sauce and beans. Simmer uncovered for 30 minutes, stirring now and then, until thick.'),
    s(3, 'Taste for salt and serve topped with the cheese and sour cream.'),
  ],
  salmon: [
    s(12, 'Heat the oven to 400°F, about 12 minutes. Meanwhile snap the woody ends off the asparagus, mince the garlic, slice one lemon, juice the other and chop the parsley.'),
    s(2, 'Melt the butter with the garlic and lemon juice, about 2 minutes.'),
    s(3, 'Put the salmon and asparagus on a sheet pan. Brush the salmon with the lemon butter, drizzle the asparagus with the oil and season everything with salt and pepper.'),
    s(15, 'Bake until the salmon flakes easily, 12 to 15 minutes.'),
    s(1, 'Top with the lemon slices and parsley.'),
  ],
  burgers: [
    s(10, 'Heat the grill to medium-high, about 10 minutes.'),
    d(5, 'Slice the tomatoes and onion and separate the lettuce leaves.'),
    d(5, 'Shape the beef into 6 patties a little wider than the buns, press a dimple in the middle and salt both sides.'),
    s(8, 'Grill the patties 4 minutes a side. Add the cheese slices for the last minute and toast the buns on the grill.'),
    s(3, 'Build the burgers with lettuce, tomato, onion, pickles, ketchup and mustard.'),
  ],
  alfredo: [
    s(2, 'Put a big pot of salted water on high heat to boil.'),
    s(3, 'Mince the garlic and chop the parsley. Season the chicken with salt and pepper.'),
    s(12, 'Cook the chicken in a large skillet over medium-high heat, 6 minutes a side, until cooked through. Let it rest, then slice.'),
    d(10, 'Cook the fettuccine in the boiling water until al dente, about 10 minutes, and drain.'),
    s(4, 'In the same skillet melt the butter and cook the garlic for 30 seconds. Add the cream, simmer 3 minutes, then stir in the parmesan until smooth.'),
    s(2, 'Toss the pasta in the sauce and season with pepper. Top with the chicken and parsley.'),
  ],
  quesadillas: [
    s(5, 'Pull the rotisserie chicken off the bone and shred it. Thinly slice the pepper.'),
    s(16, 'Fill one half of each tortilla with cheese, chicken and pepper and fold it over. Cook two at a time in a dry skillet over medium heat, 2 minutes a side, about 16 minutes for all of them.'),
    d(3, 'Slice the avocados.'),
    s(2, 'Cut the quesadillas into wedges and serve with the salsa, sour cream and avocado.'),
  ],
  pancakes: [
    s(12, 'Heat the oven to 400°F, about 12 minutes, and lay the bacon on a foil-lined sheet pan.'),
    s(18, 'Bake the bacon until crisp, about 18 minutes.'),
    d(3, 'Mix the pancake mix with milk and an egg as the box says, and fold in half the blueberries.'),
    d(15, 'Melt a little butter on a griddle over medium heat. Cook the pancakes, flipping when bubbles form, about 15 minutes for all of them.'),
    s(4, 'Whisk 8 eggs and scramble them in a little butter over medium-low heat, about 4 minutes.'),
    s(2, 'Serve with butter, maple syrup and the rest of the blueberries.'),
  ],
  curry: [
    s(3, 'Rinse the rice. Bring it to a boil with 3 cups of water, then cover and turn the heat to low.'),
    d(20, 'Let the rice simmer 15 minutes, then rest off the heat 5 minutes.'),
    s(5, 'Dice the onion and mince the garlic and ginger. Drain and rinse the chickpeas.'),
    s(6, 'Cook the onion in the oil over medium heat until soft, about 5 minutes. Add the garlic, ginger and curry powder for 1 minute.'),
    s(15, 'Add the chickpeas, diced tomatoes and coconut milk. Simmer 15 minutes, until slightly thick.'),
    s(2, 'Stir in the spinach until it wilts. Salt to taste and serve over the rice.'),
  ],
  blts: [
    s(10, 'Heat the oven to 400°F, about 10 minutes, and lay the bacon on a foil-lined sheet pan.'),
    s(18, 'Bake the bacon until crisp, about 18 minutes, then drain it on paper towels.'),
    d(8, 'Heat the soup in a pot over medium heat as the can says, about 8 minutes.'),
    d(5, 'Wash and dry the lettuce and slice the tomatoes.'),
    s(4, 'Toast the bread, spread it with mayonnaise and build the sandwiches with bacon, lettuce and tomato.'),
  ],
  caesar: [
    s(10, 'Heat the grill or a grill pan to medium-high, about 10 minutes. Meanwhile pound the chicken to an even thickness, rub it with the oil and season with pepper.'),
    s(12, 'Grill the chicken 6 minutes a side, until it reaches 165°F inside.'),
    s(5, 'Let the chicken rest 5 minutes.'),
    d(5, 'Chop the romaine and cut the lemon into wedges.'),
    s(3, 'Slice the chicken. Toss the romaine with the dressing, croutons and parmesan, top with the chicken and serve with the lemon wedges.'),
  ],
  potroast: [
    s(8, 'Pat the roast dry and season it well with salt and pepper. Brown it on all sides in a hot skillet, about 8 minutes (optional, but it adds flavor).'),
    s(10, 'Cut the carrots into chunks and the onion into wedges, and halve any big potatoes. Put them in the slow cooker with the roast on top.'),
    s(3, 'Whisk the broth with the tomato paste, pour it over and add the thyme.'),
    s(480, 'Cook on low for 8 hours (or high for 5) until the beef pulls apart.'),
    s(5, 'Shred the beef, pull out the thyme stems and serve with the vegetables and juices.'),
  ],
  friedrice: [
    s(3, 'Rinse the rice. Bring it to a boil with 3 cups of water, then cover and turn the heat to low.'),
    s(18, 'Let the rice simmer 18 minutes. Meanwhile thaw the shrimp in a bowl of cold water, slice the green onions and mince the garlic.'),
    s(10, 'Spread the rice on a sheet pan and let it cool 10 minutes so it fries instead of steaming. (Cold leftover rice works even better.) Pat the shrimp dry.'),
    s(3, 'Heat 1 tbsp vegetable oil in a large skillet over high heat. Cook the shrimp until pink, about 3 minutes, then set aside.'),
    s(2, 'Scramble the eggs in the pan, then push them to the side.'),
    s(5, 'Add the rest of the vegetable oil, the garlic and the peas and carrots, then the rice. Fry, stirring, until hot and a little crisp, about 5 minutes.'),
    s(2, 'Stir in the soy sauce, sesame oil, shrimp and green onions.'),
  ],
  pizza: [
    s(20, 'Heat the oven to 475°F with a pan or pizza stone inside, about 20 minutes. Take the dough out of the fridge so it warms up and stretches easily.'),
    s(5, 'Stretch the dough on a floured surface into a 14-inch round and move it to a sheet of parchment.'),
    s(3, 'Spread the sauce, then the mozzarella and pepperoni. Brush the edge with olive oil.'),
    s(12, 'Slide the pizza on its parchment onto the hot pan. Bake until the crust is deep golden and the cheese bubbles, 10 to 12 minutes.'),
    d(3, 'Toss the bagged salad with the dressing.'),
    s(2, 'Let the pizza rest 2 minutes, then slice it.'),
  ],
  bowls: [
    s(3, 'Rinse the rice. Bring it to a boil with 3 cups of water, then cover and turn the heat to low.'),
    d(23, 'Let the rice simmer 18 minutes, then rest 5 minutes. Fluff it with the juice of one lime and some chopped cilantro.'),
    s(3, 'Toss the chicken with the chili powder, cumin, salt and 1 tbsp of the oil.'),
    s(12, 'Cook the chicken in the rest of the oil in a skillet over medium-high heat, 6 minutes a side. Let it rest, then slice.'),
    d(5, 'Warm the drained black beans and the corn together in a small pot. Chop the lettuce and slice the avocados.'),
    s(3, 'Build the bowls: rice, lettuce, chicken, beans and corn, salsa, avocado and a wedge of the second lime.'),
  ],
  lentilsoup: [
    s(8, 'Dice the onion, carrots and celery. Mince the garlic and rinse the lentils.'),
    s(8, 'Cook the onion, carrots and celery in the oil over medium heat until soft, about 7 minutes. Add the garlic and cumin for 1 minute.'),
    s(35, 'Add the lentils, broth and diced tomatoes. Bring to a boil, about 5 minutes, then simmer partly covered until the lentils are tender, about 30 minutes.'),
    s(2, 'Stir in the spinach and the juice of the lemon. Salt to taste.'),
  ],
  tofu: [
    s(3, 'Rinse the brown rice. Bring it to a boil with 3 cups of water, then cover and turn the heat to low.'),
    d(50, 'Let the rice simmer 45 minutes, then rest 5 minutes. Everything else happens while it cooks.'),
    s(15, 'Press the tofu between towels under something heavy for 15 minutes. Meanwhile cut the broccoli into florets, slice the pepper, trim the snap peas and mince the garlic and ginger.'),
    s(2, 'Cut the tofu into cubes and toss them with the cornstarch.'),
    s(10, 'Fry the tofu in 2 tbsp of the oil over medium-high heat, turning, until crisp on all sides, about 10 minutes. Set aside.'),
    s(5, 'Stir-fry the broccoli, snap peas and pepper in the rest of the oil, about 4 minutes. Add the garlic and ginger for 30 seconds.'),
    s(2, 'Add the tofu and tamari and toss. Sprinkle with the sesame seeds and serve over the rice.'),
  ],
  steakpotato: [
    s(15, 'Heat the oven to 425°F, about 15 minutes. Meanwhile cut the potatoes into chunks and take the steak out of the fridge.'),
    s(2, 'Toss the potatoes on a sheet pan with 2 tbsp of the oil, salt, pepper and the rosemary leaves.'),
    s(20, 'Roast the potatoes for 20 minutes.'),
    d(5, 'Trim the green beans, smash the garlic and season the steak well with salt and pepper.'),
    s(15, 'Turn the potatoes and roast 15 more minutes until crisp. Meanwhile sear the steak in the rest of the oil in a very hot skillet, 4 minutes a side for medium-rare, then let it rest 5 minutes.'),
    d(5, 'Sauté the green beans with the garlic in the steak pan, about 5 minutes.'),
    s(2, 'Slice the steak against the grain and serve with the potatoes and green beans.'),
  ],
  greekchicken: [
    s(15, 'Heat the oven to 425°F, about 15 minutes. Meanwhile toss the chicken with 2 tbsp of the oil, the oregano, salt and the zest and juice of one lemon, and cut the onion into wedges.'),
    s(2, 'Spread the chicken and onion on a sheet pan.'),
    s(15, 'Roast for 15 minutes.'),
    s(12, 'Add the tomatoes and olives, drizzle with the rest of the oil and roast until the chicken reaches 175°F, about 12 minutes.'),
    d(5, 'Dice the cucumber and stir it into the yogurt with a squeeze of the second lemon and a pinch of salt.'),
    s(2, 'Crumble the feta on top and serve with the cucumber yogurt and lemon wedges.'),
  ],
  turkeychili: [
    s(5, 'Dice the onion and mince the garlic. Drain and rinse the beans.'),
    s(9, 'Brown the turkey with the onion in a large pot, about 8 minutes. Add the garlic, cumin and oregano for 1 minute.'),
    s(25, 'Add the broth, beans and green chiles. Bring to a boil, about 5 minutes, then simmer 20 minutes, mashing some of the beans against the pot to thicken it.'),
    s(5, 'Stir in the corn and cook 5 minutes.'),
    s(2, 'Finish with the lime juice, salt to taste and chopped cilantro.'),
  ],
  pulledpork: [
    s(5, 'Mix the paprika, salt and brown sugar and rub it all over the pork.'),
    s(3, 'Put the pork in the slow cooker with all but 1 tbsp of the vinegar and half the barbecue sauce.'),
    s(480, 'Cook on low for 8 hours (or high for 5) until it falls apart.'),
    s(10, 'Shred the pork, skim the fat from the juices and stir in the rest of the sauce.'),
    d(5, 'Toss the coleslaw mix with the mayonnaise and the last tablespoon of vinegar.'),
    s(3, 'Toast the buns if you like and pile them with pork and slaw.'),
  ],
  chickentacos: [
    s(3, 'Put the chicken in the slow cooker, sprinkle it with the taco seasoning and pour the salsa over.'),
    s(360, 'Cook on low for 6 hours (or high for 3) until it shreds easily.'),
    s(5, 'Shred the chicken right in the sauce with two forks.'),
    d(5, 'Thinly slice the cabbage, slice the avocados, chop the cilantro and cut the limes into wedges.'),
    s(3, 'Warm the tortillas in a dry skillet and fill them with chicken, cabbage, avocado, cilantro and a squeeze of lime.'),
  ],
  shrimpzoodles: [
    s(8, 'Spiralize the zucchini (or buy it spiralized). Halve the tomatoes, mince the garlic and peel the shrimp if needed.'),
    s(3, 'Cook the shrimp in half the oil over medium-high heat until pink, about 3 minutes. Season with salt and set aside.'),
    s(3, 'Add the rest of the oil, the garlic, red pepper flakes and tomatoes and cook until the tomatoes soften, about 3 minutes.'),
    s(2, 'Toss in the zucchini noodles just until warm, about 2 minutes, so they don’t go soggy.'),
    s(1, 'Return the shrimp and add the lemon juice, salt and torn basil.'),
  ],
  omelet: [
    s(12, 'Cook the hash browns in 1 tbsp of the oil in a large skillet over medium-high heat until crisp, about 12 minutes, flipping once.'),
    d(5, 'Dice the onion and pepper, and whisk 8 eggs with salt and pepper.'),
    d(4, 'In a second pan soften the onion and pepper in the rest of the oil, about 4 minutes, then stir in the spinach until it wilts.'),
    s(3, 'Pour the eggs into the vegetables and stir gently over medium-low heat until just set, about 3 minutes.'),
    s(1, 'Serve the eggs over the potatoes with salsa.'),
  ],
  oats: [
    s(5, 'In 4 jars, stir together the oats (1/2 cup each), 2 cups of the almond milk, the chia seeds and a drizzle of honey.'),
    s(3, 'Slice the strawberries and add them on top.'),
    s(480, 'Refrigerate overnight, about 8 hours (at least 4).'),
    s(2, 'In the morning, top with sliced bananas and more honey. Eat cold, or warm it briefly in the microwave.'),
  ],
  macncheese: [
    s(12, 'Heat the oven to 375°F and bring a pot of salted water to a boil, about 12 minutes. Meanwhile grate the cheese.'),
    s(6, 'Cook the macaroni 2 minutes less than the package says, about 6 minutes, and drain.'),
    d(7, 'Melt 3 tbsp of the butter, whisk in the flour for 1 minute, then whisk in the milk. Simmer until thick, about 6 minutes.'),
    s(3, 'Off the heat, stir most of the cheese and the macaroni into the sauce with a pinch of salt. Pour it into a baking dish.'),
    s(2, 'Melt the last tablespoon of butter, toss it with the panko breadcrumbs and sprinkle them over the top with the remaining cheese.'),
    s(20, 'Bake until bubbling and golden, about 20 minutes.'),
  ],
  blackbean: [
    s(15, 'Heat the oven to 425°F, about 15 minutes. Meanwhile peel and cube the sweet potatoes and toss them with the oil, chili powder and salt.'),
    s(25, 'Roast the sweet potatoes until tender and browned, about 25 minutes, stirring once.'),
    d(8, 'Warm the drained black beans in a small pot. Dice the onion, slice the avocados, chop the cilantro and cut the limes into wedges.'),
    s(3, 'Warm the tortillas in a dry skillet and fill them with sweet potatoes, beans, avocado, onion and cilantro, with a squeeze of lime.'),
  ],
  pestopasta: [
    s(10, 'Bring a big pot of salted water to a boil, about 10 minutes. Meanwhile halve the tomatoes and tear the mozzarella.'),
    s(11, 'Cook the penne until al dente, about 11 minutes. Save a cup of the pasta water and drain.'),
    s(2, 'Toss the hot pasta with the pesto, spinach and a splash of pasta water until the spinach wilts.'),
    s(1, 'Fold in the tomatoes and mozzarella. Serve with parmesan.'),
  ],
};

/**
 * The times a step's text mentions, in minutes ("6 minutes a side" counts twice, "10 to 12 minutes" counts 12).
 * Used by the tests so a step's label always matches what it says.
 */
export function mentionedMinutes(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:–|-|to)\s*(\d+(?:\.\d+)?))?\s*(?:more\s+)?(seconds?|minutes?|hours?)(\s+(?:a|per)\s+side)?/gi;
  for (const m of text.matchAll(re)) {
    let n = Number(m[2] ?? m[1]);
    if (/^second/i.test(m[3])) n /= 60;
    if (/^hour/i.test(m[3])) n *= 60;
    if (m[4]) n *= 2;
    out.push(n);
  }
  return out;
}

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
