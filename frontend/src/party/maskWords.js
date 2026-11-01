// Who's Behind the Mask? secret words. Each category has two groups of four similar words.
// Humans get one word; vampires see the other three from its group (close, but never the real one),
// and a caught vampire tries to pick the real word out of a lineup that leaves those three out.

export const CATEGORIES = [
  { name: 'Monsters', groups: [['Werewolf', 'Bigfoot', 'Wolfman', 'Yeti'], ['Ghost', 'Phantom', 'Poltergeist', 'Banshee']] },
  { name: 'Undead', groups: [['Zombie', 'Mummy', 'Skeleton', 'Frankenstein'], ['Vampire bat', 'Dracula', 'Ghoul', 'Grim Reaper']] },
  { name: 'Spooky places', groups: [['Graveyard', 'Crypt', 'Tomb', 'Mausoleum'], ['Haunted house', 'Castle', 'Abandoned mansion', 'Old barn']] },
  { name: 'Fall outings', groups: [['Pumpkin patch', 'Corn maze', 'Apple orchard', 'Hayride'], ['Haunted trail', 'Fright fest', 'Ghost tour', 'Scary movie night']] },
  { name: 'Halloween candy', groups: [['Snickers', 'Twix', 'Milky Way', '3 Musketeers'], ['Skittles', 'Starburst', 'Sour Patch Kids', 'Jolly Rancher']] },
  { name: 'Costumes', groups: [['Pirate', 'Cowboy', 'Ninja', 'Knight'], ['Princess', 'Fairy', 'Mermaid', 'Witch']] },
  { name: 'Creepy critters', groups: [['Spider', 'Scorpion', 'Cockroach', 'Centipede'], ['Bat', 'Owl', 'Crow', 'Raven']] },
  { name: 'Halloween movies', groups: [['Hocus Pocus', 'Halloweentown', 'Twitches', 'The Witches'], ['Ghostbusters', 'Beetlejuice', 'Casper', 'Monster House']] },
  { name: 'Witchy things', groups: [['Cauldron', 'Potion', 'Spell book', 'Crystal ball'], ['Broomstick', 'Magic wand', 'Pointy hat', 'Black cat']] },
  { name: 'Fall foods', groups: [['Pumpkin pie', 'Apple pie', 'Pecan pie', 'Sweet potato pie'], ['Caramel apple', 'Candy apple', 'Popcorn ball', 'Kettle corn']] },
  { name: 'Spooky sounds', groups: [['Creaky door', 'Footsteps', 'Knocking', 'Floorboards'], ['Howling wolf', 'Evil laugh', 'Scream', 'Owl hoot']] },
  { name: 'Decorations', groups: [['Jack-o\'-lantern', 'Scarecrow', 'Hay bale', 'Corn stalks'], ['Fake cobwebs', 'Tombstone', 'Inflatable ghost', 'Plastic skeleton']] },
];

/** Every word in a category. */
export const wordsOf = (cat) => cat.groups.flat();
