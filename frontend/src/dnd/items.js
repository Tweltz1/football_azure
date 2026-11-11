// What the things in your pack do, what they cost at a shop, and what a shop gives you for them.
// use: the effect the engine runs when you use it (it's used up). passive: works just by carrying it.
// bonus: uses your bonus action in a fight instead of your action. target/range: who it can be aimed at.

export const ITEMS = {
  'Potion of Healing': { price: 25, use: 'heal', bonus: true, icon: '🧪', hint: 'Heal 2d4+2 HP' },
  'Smoke bomb': { price: 15, use: 'smoke', bonus: true, icon: '💨', hint: 'You and allies within 10 ft are hard to hit this round' },
  'Rope (50 ft)': { price: 5, use: 'rope', target: 'foe', range: 1, icon: '🪢', hint: 'Tie up a foe next to you (Athletics): it loses its next turn' },
  'Holy water': { price: 20, use: 'holy', target: 'foe', range: 4, icon: '💧', hint: 'Throw 20 ft: 2d6, or 4d6 to the undead' },
  'Scroll of Shield': { price: 30, use: 'shield', bonus: true, icon: '📜', hint: '+5 AC for the rest of the fight' },
  'Bag of caltrops': { price: 8, use: 'caltrops', icon: '📍', hint: '1d4 to every foe next to you' },
  'Wand of sparks': { price: 25, use: 'sparks', target: 'foe', range: 6, icon: '⚡', hint: 'Zap a foe within 30 ft: 2d6' },
  'Dwarven ale': { price: 4, use: 'ale', bonus: true, icon: '🍺', hint: 'Heal 1d4 and +1d6 on your next roll' },
  'Map fragment': { price: 12, use: 'map', icon: '🗺️', hint: 'Shows every trap on this map' },
  'Strange key': { price: 15, use: 'key', icon: '🗝️', hint: 'Opens a chest next to you safely, with extra gold' },
  'Potion of Climbing': { price: 15, use: 'climb', bonus: true, icon: '🧗', hint: '+10 ft of movement this turn' },
  Lantern: { price: 10, passive: true, icon: '🏮', hint: '+2 to Search, and you spot traps more easily' },
  'Elven cloak': { price: 60, passive: true, icon: '🧥', hint: '+5 to Sneak' },
  'Lucky coin': { price: 20, passive: true, icon: '🪙', hint: '+1 on every check' },
  'Boots of springing': { price: 60, passive: true, icon: '👢', hint: '+5 ft speed' },
  'Ring of warmth': { price: 30, passive: true, icon: '💍', hint: 'Never cold. Sells well' },
  'Silver dagger': { price: 25, icon: '🗡️', hint: 'Worth a fair bit to a merchant' },
  'Gem worth 50 gp': { price: 50, icon: '💎', hint: 'Sell it at a shop' },
  'Ancient coin': { price: 50, icon: '🏺', hint: 'A collector would pay well' },
};

/** What every shop sells. */
export const SHOP_STOCK = [
  'Potion of Healing', 'Smoke bomb', 'Rope (50 ft)', 'Holy water', 'Bag of caltrops', 'Dwarven ale', 'Scroll of Shield',
  'Wand of sparks', 'Map fragment', 'Lantern', 'Lucky coin', 'Elven cloak', 'Boots of springing',
];

/** Folk who run a shop wherever they stand. */
export const MERCHANT_ROLES = new Set(['Merchant', 'Barkeep', 'Blacksmith', 'Camp cook', 'Herbalist', 'Fisherman', 'Dwarf prospector']);

/** Folk who call the guards when you rob them. */
export const GUARDED_ROLES = new Set(['Merchant', 'Barkeep', 'Blacksmith', 'Village elder', 'Guard', 'Servant', 'Priest']);

/** The undead, who holy water burns. */
export const UNDEAD = new Set(['skeleton', 'zombie', 'ghoul', 'wight']);

/** What a shop pays for an item: half its price, at least a coin. */
export const sellValue = (item) => Math.max(1, Math.floor((ITEMS[item]?.price || 2) / 2));

/** What a shop charges, with a friend’s discount. */
export const buyPrice = (item, friendly = false) => Math.max(1, Math.round((ITEMS[item]?.price || 0) * (friendly ? 0.8 : 1)));

export const hasItem = (sheet, item) => Boolean(sheet && sheet.inventory && sheet.inventory.includes(item));
