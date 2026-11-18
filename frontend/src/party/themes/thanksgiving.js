// Thanksgiving set: November 1 through the Sunday after Thanksgiving (see ../season.js).
// Quiz rows are [question, right answer, wrong, wrong, wrong]; word categories have two groups of four.
const easy = [
  ['What bird is the star of most Thanksgiving dinners?', 'Turkey', 'Chicken', 'Duck', 'Goose'],
  ['What month is Thanksgiving in the United States?', 'November', 'October', 'December', 'September'],
  ['What day of the week is Thanksgiving in the U.S.?', 'Thursday', 'Monday', 'Friday', 'Sunday'],
  ['Which pie is a Thanksgiving classic?', 'Pumpkin pie', 'Key lime pie', 'Pizza pie', 'Banana cream pie'],
  ['What is the red sauce served with Thanksgiving turkey?', 'Cranberry sauce', 'Ketchup', 'Salsa', 'Hot sauce'],
  ['What sound does a turkey make?', 'Gobble gobble', 'Quack quack', 'Oink oink', 'Cock-a-doodle-doo'],
  ['What is the bready side dish often cooked inside the turkey?', 'Stuffing', 'Frosting', 'Batter', 'Pudding'],
  ['What do you call Thanksgiving dinner with friends instead of family?', 'Friendsgiving', 'Buddyfeast', 'Pal Day', 'Crewsday'],
  ['What wishbone game do two people play after Thanksgiving dinner?', 'Pull it until it snaps', 'Throw it like a dart', 'Hide it', 'Spin it'],
  ['What do you call a long nap after a giant meal?', 'A food coma', 'A snack attack', 'A dinner dream', 'A gravy train'],
];
const medium = [
  ['Which parade fills New York with giant balloons on Thanksgiving morning?', 'Macy\'s', 'Rose Parade', 'Mardi Gras', 'Saks'],
  ['What is the name of the Pilgrims\' ship from 1620?', 'The Mayflower', 'The Santa Maria', 'The Titanic', 'The Endeavour'],
  ['Which NFL team plays at home every Thanksgiving?', 'Detroit Lions', 'Green Bay Packers', 'New York Giants', 'Chicago Bears'],
  ['Which other NFL team also hosts a game every Thanksgiving?', 'Dallas Cowboys', 'Kansas City Chiefs', 'Chicago Bears', 'Miami Dolphins'],
  ['What day comes right after Thanksgiving, known for shopping?', 'Black Friday', 'Cyber Monday', 'Super Saturday', 'Small Business Sunday'],
  ['What is a baby turkey called?', 'A poult', 'A kit', 'A cub', 'A calf'],
  ['Which Native American people shared the 1621 harvest feast with the Pilgrims?', 'The Wampanoag', 'The Cherokee', 'The Sioux', 'The Navajo'],
  ['Which country celebrates its Thanksgiving in October?', 'Canada', 'Mexico', 'England', 'Australia'],
  ['Which side dish is topped with crispy fried onions?', 'Green bean casserole', 'Mashed potatoes', 'Corn bread', 'Cranberry sauce'],
  ['In "A Charlie Brown Thanksgiving", what does Snoopy serve?', 'Toast, popcorn and jelly beans', 'Pizza and soda', 'Turkey and pie', 'Hot dogs'],
];
const hard = [
  ['Which president made Thanksgiving a national holiday in 1863?', 'Abraham Lincoln', 'George Washington', 'Thomas Jefferson', 'Teddy Roosevelt'],
  ['Where did the Pilgrims settle in 1620?', 'Plymouth', 'Jamestown', 'Boston', 'Salem'],
  ['Whose letter-writing campaign helped make Thanksgiving a national holiday?', 'Sarah Josepha Hale', 'Betsy Ross', 'Martha Washington', 'Clara Barton'],
  ['Which president moved Thanksgiving a week earlier in 1939, nicknamed "Franksgiving"?', 'Franklin D. Roosevelt', 'Herbert Hoover', 'Harry Truman', 'Calvin Coolidge'],
  ['What did the first Thanksgiving in 1621 most likely NOT have?', 'Pumpkin pie', 'Venison', 'Corn', 'Fowl'],
  ['About how fast can a wild turkey run?', 'About 25 mph', 'About 5 mph', 'About 60 mph', 'About 2 mph'],
  ['What is the flap of skin hanging under a turkey\'s beak called?', 'A wattle', 'A gizzard', 'A crest', 'A beak sock'],
];
const expert = [
  ['In what year did the first Macy\'s Thanksgiving Day Parade march?', '1924', '1952', '1899', '1936'],
  ['Which cartoon cat was the Macy\'s parade\'s first character balloon, in 1927?', 'Felix the Cat', 'Garfield', 'Sylvester', 'Tom'],
  ['Which state produces the most cranberries?', 'Wisconsin', 'Massachusetts', 'Maine', 'Oregon'],
  ['Which state raises the most turkeys?', 'Minnesota', 'Texas', 'Iowa', 'Ohio'],
  ['In what year did Congress fix Thanksgiving as the fourth Thursday of November?', '1941', '1863', '1789', '1920'],
  ['Which Founding Father called the turkey "a much more respectable bird" than the bald eagle?', 'Benjamin Franklin', 'Thomas Jefferson', 'John Adams', 'Alexander Hamilton'],
];

const set = {
  levels: [easy, medium, hard, expert],
  categories: [
    { name: 'Thanksgiving dinner', groups: [['Turkey', 'Ham', 'Roast chicken', 'Duck'], ['Stuffing', 'Mashed potatoes', 'Green bean casserole', 'Sweet potatoes']] },
    { name: 'Desserts', groups: [['Pumpkin pie', 'Pecan pie', 'Apple pie', 'Sweet potato pie'], ['Apple crisp', 'Peach cobbler', 'Bread pudding', 'Pumpkin roll']] },
    { name: 'Football Thanksgiving', groups: [['Touchdown', 'Field goal', 'Safety', 'Two-point conversion'], ['Halftime show', 'Kickoff', 'Overtime', 'Fourth down']] },
    { name: 'Fall clothes', groups: [['Sweater', 'Flannel', 'Hoodie', 'Vest'], ['Boots', 'Beanie', 'Scarf', 'Gloves']] },
    { name: 'Harvest', groups: [['Corn', 'Squash', 'Pumpkin', 'Gourd'], ['Apples', 'Cranberries', 'Pears', 'Grapes']] },
    { name: 'Parade', groups: [['Marching band', 'Float', 'Giant balloon', 'Drum line'], ['Santa', 'Clowns', 'Cheerleaders', 'Dancers']] },
    { name: 'Leftovers', groups: [['Turkey sandwich', 'Turkey soup', 'Pot pie', 'Turkey chili'], ['Cold pizza', 'Mac and cheese', 'Casserole', 'Fried rice']] },
    { name: 'Fall outings', groups: [['Pumpkin patch', 'Corn maze', 'Apple orchard', 'Hayride'], ['Bonfire', 'Football game', 'Turkey trot', 'Leaf pile']] },
  ],
  prompts: [
    'The worst thing to bring to Friendsgiving',
    'What the turkey is really thinking right now',
    'Something you should never say at Thanksgiving dinner',
    'Your uncle\'s hottest take at dinner, in five words',
    'The worst thing to hear from the kitchen on Thanksgiving',
    'What the leftover stuffing would say if it could talk',
    'A Thanksgiving football play name',
    'The most chaotic way to carve a turkey',
    'A rejected Thanksgiving side dish',
    'What the turkey writes on its protest sign',
    'The worst thing to say when it\'s your turn to share what you\'re thankful for',
    'A new name for the food coma after dinner',
    'The real reason Grandma hides the good pie',
    'A Black Friday deal nobody wants',
    'What the Lions say in the locker room on Thanksgiving',
    'The worst job to get stuck with before dinner',
    'A terrible flavor of pie',
  ],
  finals: [
    'Write the toast before Thanksgiving dinner',
    'Invent a new Thanksgiving tradition',
    'What this crew is most thankful for, in five words',
    'The best excuse for eating the whole pie',
    'Write a Thanksgiving rule for the Hood League',
  ],
};

export default set;
