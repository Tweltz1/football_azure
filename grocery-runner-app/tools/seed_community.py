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

have = {r["title"] for r in sql(f"select title from public.grocery_community_recipes where user_id = {lit(user_id)}::uuid")}
new = [r for r in RECIPES if r[1] not in have]
if new:
    values = ",\n".join(
        f"({lit(user_id)}::uuid, {lit(AUTHOR)}, {lit(title)}, {lit(cat)}, {lit(emoji)}, {minutes}, {lit(serves)}, {lit(json.dumps(items))}::jsonb, "
        f"now() - interval '{n * 7} hours')"
        for n, (cat, title, emoji, minutes, serves, items) in enumerate(new))
    sql("insert into public.grocery_community_recipes (user_id, author, title, category, emoji, minutes, servings, items, created_at) values\n" + values)
print(f"Starter recipes: {len(new)} added, {len(RECIPES) - len(new)} already there")
