"""Adds Shop Stride's starter recipes to the Community tab, so a new shopper never opens it empty. Safe to re-run.

The recipes are posted by a "Shop Stride" account (shopstride@weltzcraft.com) that can't sign in: it has no
password and is banned from signing in. A recipe already posted by that account with the same title is skipped,
so re-running only adds new ones. Run by .github/workflows/grocery-runner-store.yml ([stride-seed]).
Never prints keys or the access token."""
import json
import os
import urllib.error
import urllib.request

TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = os.environ["SUPABASE_PROJECT_ID"]
API = f"https://api.supabase.com/v1/projects/{REF}"
EMAIL = "shopstride@weltzcraft.com"
AUTHOR = "Shop Stride"


def req(method, url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", "User-Agent": "shop-stride-seed", **(headers or {})})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            text = resp.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {url.split('?')[0]} failed: {e.code} {e.read().decode()[:200]}")


def sql(query):
    return req("POST", f"{API}/database/query", {"query": query}, {"Authorization": f"Bearer {TOKEN}"})


def lit(value):
    """A SQL string literal."""
    return "'" + str(value).replace("'", "''") + "'"


def i(item, amount="", pantry=False):
    return {"item": item, "amount": amount, "pantry": pantry}


RECIPES = [
    ("breakfast", "Sheet pan pancakes", "🥞", 25, "6", [
        i("pancake mix", "3 cups"), i("milk", "2 cups"), i("eggs", "2"), i("blueberries", "1 cup"),
        i("maple syrup", "to serve"), i("butter", "2 tbsp", True)]),
    ("breakfast", "Breakfast burritos", "🌯", 20, "4", [
        i("large flour tortillas", "4"), i("eggs", "8"), i("breakfast sausage", "1 lb"), i("frozen hash browns", "2 cups"),
        i("shredded cheddar", "1 cup"), i("salsa", "1 jar"), i("salt", "", True), i("pepper", "", True)]),
    ("lunch", "Turkey club wraps", "🥪", 10, "4", [
        i("large flour tortillas", "4"), i("sliced deli turkey", "1 lb"), i("bacon", "8 slices"), i("romaine lettuce", "1 head"),
        i("tomatoes", "2"), i("mayonnaise", "1/4 cup", True)]),
    ("lunch", "Chicken Caesar salad", "🥗", 15, "4", [
        i("rotisserie chicken", "1"), i("romaine lettuce", "2 heads"), i("Caesar dressing", "1 bottle"), i("croutons", "1 bag"),
        i("parmesan cheese", "1/2 cup"), i("lemon", "1")]),
    ("dinner", "One-pot chili", "🌶️", 45, "6", [
        i("ground beef", "2 lb"), i("yellow onion", "1"), i("kidney beans", "2 cans"), i("diced tomatoes", "2 cans"),
        i("tomato sauce", "1 can"), i("chili powder", "2 tbsp", True), i("cumin", "1 tsp", True),
        i("shredded cheddar", "to serve"), i("sour cream", "to serve")]),
    ("dinner", "Sheet pan chicken fajitas", "🌮", 35, "4", [
        i("chicken breasts", "1.5 lb"), i("bell peppers", "3"), i("yellow onion", "1"), i("fajita seasoning", "1 packet"),
        i("flour tortillas", "8"), i("sour cream", "to serve"), i("salsa", "to serve"), i("olive oil", "2 tbsp", True)]),
    ("dinner", "Spaghetti and meatballs", "🍝", 30, "4", [
        i("spaghetti", "1 lb"), i("frozen meatballs", "1 bag"), i("marinara sauce", "1 jar"), i("parmesan cheese", "to serve"),
        i("garlic bread", "1 loaf")]),
    ("sides", "Garlic roasted potatoes", "🥔", 40, "4", [
        i("baby potatoes", "2 lb"), i("garlic", "4 cloves"), i("fresh parsley", "1 bunch"), i("olive oil", "3 tbsp", True),
        i("salt", "", True)]),
    ("sides", "Honey glazed carrots", "🥕", 25, "4", [
        i("carrots", "2 lb"), i("honey", "2 tbsp"), i("butter", "2 tbsp", True), i("salt", "", True)]),
    ("snacks", "Game day queso dip", "🧀", 15, "8", [
        i("Velveeta", "1 lb"), i("Rotel diced tomatoes and chiles", "1 can"), i("ground sausage", "1/2 lb"),
        i("tortilla chips", "1 big bag")]),
    ("snacks", "Ranch snack mix", "🥨", 10, "10", [
        i("Chex cereal", "1 box"), i("pretzels", "1 bag"), i("oyster crackers", "1 bag"), i("ranch seasoning", "1 packet"),
        i("vegetable oil", "1/2 cup", True)]),
    ("desserts", "Brownie sundaes", "🍨", 35, "8", [
        i("brownie mix", "1 box"), i("eggs", "2"), i("vanilla ice cream", "1 carton"), i("hot fudge", "1 jar"),
        i("whipped cream", "1 can"), i("vegetable oil", "1/2 cup", True)]),
    ("desserts", "No-bake cheesecake cups", "🍰", 20, "6", [
        i("cream cheese", "8 oz"), i("whipped topping", "8 oz"), i("graham crackers", "1 sleeve"), i("strawberries", "1 lb"),
        i("sugar", "1/2 cup", True)]),
    ("drinks", "Berry banana smoothies", "🥤", 5, "2", [
        i("frozen mixed berries", "2 cups"), i("bananas", "2"), i("vanilla yogurt", "1 cup"), i("milk", "1 cup")]),
    ("drinks", "Sparkling lemonade", "🍋", 10, "8", [
        i("lemons", "6"), i("sparkling water", "2 liters"), i("fresh mint", "1 bunch"), i("sugar", "3/4 cup", True)]),
]

def st(minutes, text, during=False):
    return {"text": text, "minutes": minutes, **({"during": True} if during else {})}


def sd(minutes, text):
    return st(minutes, text, True)


# Steps for each starter recipe, by title. A step marked during runs alongside the step before it
# (same rule as the app's src/lib/recipeSteps.ts), and the recipe's time is worked out from them.
STEPS = {
    "Sheet pan pancakes": [
        st(10, "Heat the oven to 425°F, about 10 minutes. Butter a rimmed sheet pan."),
        sd(3, "Whisk the pancake mix, milk and eggs until just combined; a few lumps are fine."),
        st(2, "Spread the batter in the pan and scatter the blueberries over it."),
        st(15, "Bake until golden and a toothpick comes out clean, about 15 minutes."),
        st(2, "Cut into squares and serve with maple syrup."),
    ],
    "Breakfast burritos": [
        st(8, "Brown the sausage in a large skillet over medium-high heat, breaking it up, about 8 minutes. Move it to a plate."),
        st(8, "Cook the hash browns in the sausage fat until crisp, about 8 minutes."),
        sd(2, "Whisk the eggs with salt and pepper."),
        st(3, "Scramble the eggs in the pan over medium-low heat until just set, about 3 minutes."),
        st(1, "Warm the tortillas in the microwave so they fold without cracking."),
        st(4, "Fill each tortilla with eggs, sausage, hash browns, cheddar and a spoonful of salsa, then roll it up."),
    ],
    "Turkey club wraps": [
        st(8, "Cook the bacon in a skillet over medium heat until crisp, about 8 minutes, then drain it on paper towels."),
        sd(4, "Wash and shred the lettuce and slice the tomatoes."),
        st(4, "Spread each tortilla with mayonnaise, then layer the turkey, 2 slices of bacon, lettuce and tomato."),
        st(2, "Roll them up tightly and cut them in half."),
    ],
    "Chicken Caesar salad": [
        st(5, "Pull the rotisserie chicken off the bone and slice or shred it."),
        st(4, "Chop the romaine and cut the lemon into wedges."),
        st(2, "Toss the romaine with the dressing, then top with the chicken, croutons and parmesan. Serve with the lemon wedges."),
    ],
    "One-pot chili": [
        st(4, "Dice the onion. Drain and rinse the beans."),
        st(10, "Brown the beef with the onion in a large pot over medium-high heat, about 10 minutes. Drain most of the fat."),
        st(1, "Stir in the chili powder and cumin for 1 minute."),
        st(30, "Add the diced tomatoes, tomato sauce and beans. Simmer uncovered for 30 minutes, stirring now and then."),
        st(2, "Serve topped with the cheddar and sour cream."),
    ],
    "Sheet pan chicken fajitas": [
        st(15, "Heat the oven to 425°F, about 15 minutes. Meanwhile slice the chicken, peppers and onion into thin strips."),
        st(2, "Toss everything on a sheet pan with the olive oil and fajita seasoning."),
        st(20, "Roast until the chicken is cooked through and the peppers are browned at the edges, about 20 minutes."),
        sd(5, "Wrap the tortillas in foil and warm them in the oven for the last 5 minutes."),
        st(3, "Fill the tortillas with the chicken and peppers and top with sour cream and salsa."),
    ],
    "Spaghetti and meatballs": [
        st(2, "Heat the oven for the garlic bread as its package says. Put a big pot of salted water on to boil."),
        st(20, "Simmer the frozen meatballs in the marinara sauce, covered, until hot all the way through, about 20 minutes."),
        sd(10, "Cook the spaghetti in the boiling water until al dente, about 10 minutes, and drain."),
        sd(12, "Bake the garlic bread as the package says, usually 10 to 12 minutes."),
        st(2, "Toss the spaghetti with some of the sauce, top with the meatballs and parmesan, and serve with the garlic bread."),
    ],
    "Garlic roasted potatoes": [
        st(15, "Heat the oven to 425°F, about 15 minutes. Meanwhile halve the potatoes, mince the garlic and chop the parsley."),
        st(2, "Toss the potatoes with the olive oil and salt on a sheet pan, cut side down."),
        st(25, "Roast until golden and tender, about 25 minutes."),
        st(5, "Toss in the garlic and roast 5 more minutes."),
        st(1, "Sprinkle with the parsley."),
    ],
    "Honey glazed carrots": [
        st(5, "Peel the carrots and cut them into coins."),
        st(8, "Simmer the carrots in salted water until just tender, about 8 minutes, then drain."),
        st(3, "Melt the butter in the same pan, stir in the honey and carrots, and cook until glazed, about 3 minutes."),
    ],
    "Game day queso dip": [
        st(8, "Brown the sausage in a saucepan over medium heat, about 8 minutes. Drain the fat."),
        sd(2, "Cut the Velveeta into cubes."),
        st(6, "Add the Velveeta and the Rotel with its juice. Stir over low heat until smooth, about 6 minutes."),
        st(1, "Serve warm with the tortilla chips."),
    ],
    "Ranch snack mix": [
        st(10, "Heat the oven to 250°F, about 10 minutes."),
        sd(3, "Whisk the oil with the ranch seasoning in a big bowl."),
        sd(2, "Add the Chex cereal, pretzels and oyster crackers and toss until coated."),
        st(30, "Spread the mix on two sheet pans and bake 30 minutes, stirring every 10 minutes."),
        st(10, "Let it cool on the pans, about 10 minutes."),
    ],
    "Brownie sundaes": [
        st(10, "Heat the oven as the brownie box says, about 10 minutes, and grease the pan."),
        sd(3, "Stir the brownie mix with the eggs, oil and the water the box calls for."),
        st(28, "Bake as the box says, usually 25 to 28 minutes."),
        st(15, "Let the brownies cool for 15 minutes, then cut them into squares."),
        sd(2, "Warm the hot fudge in the microwave."),
        st(3, "Top each brownie with a scoop of ice cream, hot fudge and whipped cream."),
    ],
    "No-bake cheesecake cups": [
        st(2, "Soften the cream cheese (microwave it briefly if it’s cold from the fridge)."),
        st(3, "Crush the graham crackers and spoon them into 6 cups."),
        st(4, "Beat the cream cheese with the sugar until smooth, then fold in the whipped topping."),
        st(4, "Slice the strawberries."),
        st(3, "Spoon the filling over the crumbs and top with the strawberries."),
        st(60, "Chill for at least 1 hour."),
    ],
    "Berry banana smoothies": [
        st(2, "Peel and break up the bananas."),
        st(1, "Blend the berries, bananas, yogurt and milk until smooth, about 1 minute."),
        st(1, "Pour into 2 glasses."),
    ],
    "Sparkling lemonade": [
        st(3, "Warm the sugar with 3/4 cup water, stirring until it dissolves, about 3 minutes."),
        st(10, "Let the syrup cool for 10 minutes."),
        sd(8, "Juice the lemons; you need about 1 cup of juice."),
        st(2, "Stir the lemon juice and syrup together in a pitcher, then add the sparkling water and ice."),
        st(1, "Serve with mint leaves."),
    ],
}


def total_minutes(steps):
    clock = last_start = end = 0
    for x in steps:
        if x.get("during"):
            end = max(end, last_start + x["minutes"])
        else:
            last_start = clock
            clock += x["minutes"]
    return max(clock, end)


# The posting account: find it, or make it (no password, can't sign in).
rows = sql(f"select id from auth.users where email = {lit(EMAIL)} limit 1")
if rows:
    user_id = rows[0]["id"]
    print("Shop Stride account: already there")
else:
    keys = req("GET", f"{API}/api-keys?reveal=true", headers={"Authorization": f"Bearer {TOKEN}"})
    service = next((k["api_key"] for k in keys if k.get("name") == "service_role"), "")
    if not service:
        raise SystemExit("No service_role key found")
    made = req("POST", f"https://{REF}.supabase.co/auth/v1/admin/users",
               {"email": EMAIL, "email_confirm": True, "ban_duration": "876000h", "user_metadata": {"name": AUTHOR}},
               {"Authorization": f"Bearer {service}", "apikey": service})
    user_id = made["id"]
    print("Shop Stride account: made")

# Photos of the dishes (openly licensed, credited), uploaded to the shared-photo bucket once.
PHOTO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "community_photos")
PHOTO_KEYS = {
    "Sheet pan pancakes": "cpancakes", "Breakfast burritos": "cburritos", "Turkey club wraps": "cwraps",
    "Chicken Caesar salad": "ccaesar", "One-pot chili": "cchili", "Sheet pan chicken fajitas": "cfajitas",
    "Spaghetti and meatballs": "cmeatballs", "Garlic roasted potatoes": "cpotatoes", "Honey glazed carrots": "ccarrots",
    "Game day queso dip": "cqueso", "Ranch snack mix": "cchex", "Brownie sundaes": "cbrownie",
    "No-bake cheesecake cups": "ccheesecake", "Berry banana smoothies": "csmoothie", "Sparkling lemonade": "clemonade",
}
CREDITS = json.load(open(os.path.join(PHOTO_DIR, "credits.json"))) if os.path.exists(os.path.join(PHOTO_DIR, "credits.json")) else {}
keys = req("GET", f"{API}/api-keys?reveal=true", headers={"Authorization": f"Bearer {TOKEN}"})
service = next((k["api_key"] for k in keys if k.get("name") == "service_role"), "")


def photo(title):
    """Uploads the starter photo (if there is one) and returns (public url, credit)."""
    key = PHOTO_KEYS.get(title)
    path = os.path.join(PHOTO_DIR, f"{key}.jpg") if key else ""
    if not key or not os.path.exists(path) or not service:
        return None, None
    name = f"starter/{key}.jpg"
    with open(path, "rb") as f:
        data = f.read()
    r = urllib.request.Request(f"https://{REF}.supabase.co/storage/v1/object/grocery-recipe-photos/{name}", data=data, method="POST",
                               headers={"Authorization": f"Bearer {service}", "apikey": service, "Content-Type": "image/jpeg", "x-upsert": "true"})
    try:
        urllib.request.urlopen(r, timeout=60).read()
    except urllib.error.HTTPError as e:
        print(f"Photo for {title}: upload failed {e.code}")
        return None, None
    c = CREDITS.get(key) or {}
    credit = f"{c.get('creator', 'Unknown')[:60]} · {c.get('license', '')}".strip(" ·") if c else None
    return f"https://{REF}.supabase.co/storage/v1/object/public/grocery-recipe-photos/{name}", credit


have = {r["title"]: r["id"] for r in sql(f"select id, title from public.grocery_community_recipes where user_id = {lit(user_id)}::uuid")}
added = updated = 0
for n, (cat, title, emoji, minutes, serves, items) in enumerate(RECIPES):
    steps = STEPS.get(title) or []
    mins = total_minutes(steps) if steps else minutes
    url, credit = photo(title)
    extra = f"steps = {lit(json.dumps(steps))}::jsonb, minutes = {mins}, items = {lit(json.dumps(items))}::jsonb, " \
            f"photo_url = {lit(url) if url else 'photo_url'}, photo_credit = {lit(credit) if credit else 'photo_credit'}"
    if title in have:
        sql(f"update public.grocery_community_recipes set {extra} where id = {lit(have[title])}::uuid")
        updated += 1
    else:
        sql("insert into public.grocery_community_recipes (user_id, author, title, category, emoji, minutes, servings, items, steps, photo_url, photo_credit, created_at) "
            f"values ({lit(user_id)}::uuid, {lit(AUTHOR)}, {lit(title)}, {lit(cat)}, {lit(emoji)}, {mins}, {lit(serves)}, {lit(json.dumps(items))}::jsonb, "
            f"{lit(json.dumps(steps))}::jsonb, {lit(url) if url else 'null'}, {lit(credit) if credit else 'null'}, now() - interval '{n * 7} hours')")
        added += 1
print(f"Starter recipes: {added} added, {updated} updated with steps and photos")
