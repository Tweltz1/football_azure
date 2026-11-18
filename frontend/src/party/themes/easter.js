// Easter and spring set: the two weeks before Easter Sunday through Easter Monday (see ../season.js).
const easy = [
  ['Who hides eggs for kids on Easter?', 'The Easter Bunny', 'The Tooth Fairy', 'Santa', 'A leprechaun'],
  ['What do kids carry to collect eggs?', 'A basket', 'A bucket', 'A lunchbox', 'A pillowcase'],
  ['What do people color with dye before Easter?', 'Eggs', 'Potatoes', 'Rocks', 'Shoes'],
  ['Which marshmallow candy is shaped like a little chick?', 'Peeps', 'Jujubes', 'Mike and Ike', 'Dots'],
  ['What baby bird hatches from an egg on a farm?', 'A chick', 'A calf', 'A kitten', 'A pup'],
  ['What season is Easter in, in the U.S.?', 'Spring', 'Summer', 'Fall', 'Winter'],
  ['What day of the week is Easter?', 'Sunday', 'Saturday', 'Friday', 'Monday'],
  ['What vegetable do cartoon bunnies love to munch?', 'Carrots', 'Celery', 'Corn', 'Peas'],
  ['What does Bugs Bunny always ask?', 'What\'s up, Doc?', 'Who\'s there?', 'Got milk?', 'Where\'s the beef?'],
];
const medium = [
  ['Which egg-shaped candy from Cadbury has a gooey center?', 'Creme Egg', 'Kinder Egg', 'Robin Egg', 'Jelly Egg'],
  ['Which white, trumpet-shaped flower is a classic Easter decoration?', 'Lily', 'Rose', 'Daisy', 'Sunflower'],
  ['At the White House Easter Egg Roll, what do kids push the eggs with?', 'A spoon', 'Their nose', 'A stick', 'A broom'],
  ['What is the Sunday before Easter called?', 'Palm Sunday', 'Super Sunday', 'Ash Sunday', 'Green Sunday'],
  ['Which immigrants brought the Easter Bunny tradition to America?', 'Germans', 'Brazilians', 'Japanese', 'Egyptians'],
  ['What are the 40 days before Easter called?', 'Lent', 'Advent', 'Epiphany', 'Pentecost'],
  ['Which Pacific island was named for the day Europeans arrived in 1722?', 'Easter Island', 'Christmas Island', 'Sunday Island', 'Spring Island'],
  ['What meat do many families serve for Easter dinner?', 'Ham', 'Turkey', 'Hot dogs', 'Meatloaf'],
];
const hard = [
  ['Easter falls on the first Sunday after the first full moon after what?', 'The spring equinox', 'The winter solstice', 'Valentine\'s Day', 'Leap day'],
  ['Which Russian jeweler made fancy Easter eggs for the czars?', 'Faberge', 'Cartier', 'Tiffany', 'Swarovski'],
  ['What are the giant stone statues on Easter Island called?', 'Moai', 'Tiki', 'Totems', 'Menhirs'],
  ['Which candy company makes Peeps?', 'Just Born', 'Hershey', 'Mars', 'Nestle'],
  ['Which Christian holiday comes 50 days after Easter?', 'Pentecost', 'Lent', 'Advent', 'Epiphany'],
  ['In "Zootopia", what is the bunny cop\'s name?', 'Judy Hopps', 'Thumper', 'Peter Cottontail', 'Bonnie Bunny'],
];
const expert = [
  ['What is the earliest date Easter can fall on?', 'March 22', 'March 1', 'March 15', 'April 1'],
  ['What is the latest date Easter can fall on?', 'April 25', 'April 30', 'May 5', 'April 18'],
  ['In Australia, which animal sometimes replaces the Easter Bunny?', 'The bilby', 'The kangaroo', 'The koala', 'The wombat'],
  ['About how many imperial eggs did Faberge make for the Russian royal family?', '50', '12', '100', '7'],
  ['Poland\'s Easter Monday water fight is called what?', 'Smigus-dyngus', 'Pisanki', 'Kielbasa Day', 'Paczki Day'],
];

const set = {
  levels: [easy, medium, hard, expert],
  categories: [
    { name: 'Easter basket', groups: [['Jelly beans', 'Peeps', 'Chocolate bunny', 'Robin Eggs'], ['Plastic grass', 'Plastic eggs', 'Bubbles', 'Sidewalk chalk']] },
    { name: 'Baby animals', groups: [['Chick', 'Duckling', 'Bunny', 'Lamb'], ['Puppy', 'Kitten', 'Fawn', 'Foal']] },
    { name: 'Spring flowers', groups: [['Tulip', 'Daffodil', 'Lily', 'Hyacinth'], ['Daisy', 'Pansy', 'Lilac', 'Crocus']] },
    { name: 'Spring weather', groups: [['Rain shower', 'Puddle', 'Rainbow', 'Thunderstorm'], ['Sunshine', 'Breeze', 'Mud', 'Fog']] },
    { name: 'Garden', groups: [['Shovel', 'Rake', 'Hoe', 'Trowel'], ['Watering can', 'Seeds', 'Flower pot', 'Wheelbarrow']] },
    { name: 'Pastels', groups: [['Pastel pink', 'Baby blue', 'Lavender', 'Mint green'], ['Butter yellow', 'Peach', 'Lilac', 'Seafoam']] },
    { name: 'Easter dinner', groups: [['Ham', 'Lamb', 'Deviled eggs', 'Scalloped potatoes'], ['Hot cross buns', 'Carrot cake', 'Lemon bars', 'Dinner rolls']] },
    { name: 'Famous rabbits', groups: [['Bugs Bunny', 'Peter Rabbit', 'Roger Rabbit', 'The Easter Bunny'], ['Thumper', 'The White Rabbit', 'Judy Hopps', 'Br\'er Rabbit']] },
  ],
  prompts: [
    'The worst place to hide an Easter egg',
    'What the Easter Bunny does the other 364 days',
    'A terrible new flavor of jelly bean',
    'What the chocolate bunny thinks right before you bite its ears',
    'A rejected Peeps shape',
    'The worst thing to find inside a plastic egg',
    'The real reason the Easter Bunny hides the eggs',
    'A spring cleaning job nobody wants',
    'The Easter Bunny\'s biggest secret',
    'The first thing a chick says when it hatches',
    'A new Easter tradition that would cause chaos',
    'The worst gift to put in an Easter basket',
    'A terrible name for a spring flower',
    'What happens when the Easter Bunny goes on strike',
    'A new rule for the egg hunt',
    'A spring training tip for your fantasy team',
  ],
  finals: [
    'Write the Easter Bunny\'s resignation letter',
    'Describe the perfect spring day in five words',
    'Invent a new Easter candy',
    'Name the egg hunt champion\'s trophy',
    'Write a spring rule for the Hood League',
  ],
};

export default set;
