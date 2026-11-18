// St. Patrick's Day set: March 1 through 17 (see ../season.js).
const easy = [
  ['What color do people wear on St. Patrick\'s Day?', 'Green', 'Purple', 'Orange', 'Pink'],
  ['What lucky plant has four leaves?', 'A four-leaf clover', 'A four-leaf maple', 'A fern', 'A cactus'],
  ['What does a leprechaun keep at the end of a rainbow?', 'A pot of gold', 'A pot of soup', 'A bag of candy', 'A treasure map'],
  ['St. Patrick is the patron saint of which country?', 'Ireland', 'Italy', 'Spain', 'Iceland'],
  ['What date is St. Patrick\'s Day?', 'March 17', 'March 7', 'April 17', 'February 17'],
  ['What tiny shoemaker from Irish legend is a symbol of the day?', 'A leprechaun', 'A gnome', 'An elf', 'A pixie'],
  ['What is a three-leaf clover also called?', 'A shamrock', 'A tulip', 'A thistle', 'A pine cone'],
  ['How many colors are in a rainbow?', '7', '5', '10', '3'],
];
const medium = [
  ['Which city dyes its river green for St. Patrick\'s Day?', 'Chicago', 'Dallas', 'Miami', 'Denver'],
  ['What is the capital of Ireland?', 'Dublin', 'Belfast', 'Cork', 'Galway'],
  ['Which meat goes with cabbage in the classic American St. Patrick\'s Day dinner?', 'Corned beef', 'Meatloaf', 'Pork chops', 'Fried chicken'],
  ['Ireland is often called the Emerald what?', 'Isle', 'Coast', 'Kingdom', 'Valley'],
  ['Which green milkshake shows up at McDonald\'s every March?', 'The Shamrock Shake', 'The Clover Cooler', 'The Lucky Shake', 'The Mint Blast'],
  ['Which stone in Ireland are you supposed to kiss for the "gift of gab"?', 'The Blarney Stone', 'The Rosetta Stone', 'Plymouth Rock', 'The Kiss Rock'],
  ['Legend says St. Patrick drove what animals out of Ireland?', 'Snakes', 'Wolves', 'Rats', 'Bears'],
  ['Which college\'s teams are nicknamed the "Fighting Irish"?', 'Notre Dame', 'Boston College', 'Villanova', 'Georgetown'],
  ['What Irish bread rises with baking soda instead of yeast?', 'Soda bread', 'Sourdough', 'Pita', 'Rye'],
];
const hard = [
  ['What is "Erin go Bragh" usually translated as?', 'Ireland forever', 'Good luck', 'Cheers to you', 'Happy spring'],
  ['Where was St. Patrick actually born?', 'Britain', 'Ireland', 'France', 'Spain'],
  ['What is St. Patrick said to have used the shamrock to explain?', 'The Holy Trinity', 'The seasons', 'Good luck', 'The weather'],
  ['Before green, which color was linked with St. Patrick?', 'Blue', 'Red', 'Gold', 'Purple'],
  ['What instrument appears on Irish euro coins?', 'The harp', 'The fiddle', 'The bagpipes', 'The flute'],
  ['What is the Irish language also called?', 'Gaelic', 'Celtic Latin', 'Erse Norse', 'Breton'],
];
const expert = [
  ['Which Irish county is home to the Cliffs of Moher?', 'Clare', 'Kerry', 'Cork', 'Galway'],
  ['Where was the first recorded St. Patrick\'s Day parade, in 1601?', 'St. Augustine, Florida', 'Boston', 'New York City', 'Dublin'],
  ['Which Irish writer wrote "Ulysses"?', 'James Joyce', 'Oscar Wilde', 'W. B. Yeats', 'Samuel Beckett'],
  ['What is the longest river in Ireland?', 'The Shannon', 'The Liffey', 'The Boyne', 'The Lee'],
  ['Which Irish author wrote "Dracula"?', 'Bram Stoker', 'Mary Shelley', 'Edgar Allan Poe', 'Oscar Wilde'],
  ['In what year did Chicago first dye its river green?', '1962', '1925', '1985', '1948'],
];

const set = {
  levels: [easy, medium, hard, expert],
  categories: [
    { name: 'Lucky charms', groups: [['Four-leaf clover', 'Horseshoe', 'Rabbit\'s foot', 'Lucky penny'], ['Shooting star', 'Wishbone', 'Rainbow', 'Pot of gold']] },
    { name: 'Green things', groups: [['Frog', 'Lime', 'Pickle', 'Broccoli'], ['Grass', 'Leaf', 'Moss', 'Pine tree']] },
    { name: 'Irish places', groups: [['Dublin', 'Cork', 'Galway', 'Belfast'], ['Cliffs of Moher', 'Blarney Castle', 'Ring of Kerry', 'Giant\'s Causeway']] },
    { name: 'Fairy-tale folk', groups: [['Leprechaun', 'Pixie', 'Fairy', 'Gnome'], ['Troll', 'Giant', 'Elf', 'Dwarf']] },
    { name: 'Irish dinner', groups: [['Corned beef', 'Cabbage', 'Potatoes', 'Carrots'], ['Soda bread', 'Shepherd\'s pie', 'Irish stew', 'Colcannon']] },
    { name: 'Rainbow', groups: [['Red', 'Orange', 'Yellow', 'Green'], ['Blue', 'Indigo', 'Violet', 'Pink']] },
    { name: 'Parade', groups: [['Bagpipes', 'Drums', 'Fiddle', 'Tin whistle'], ['Float', 'Banner', 'Top hat', 'Shamrock flag']] },
    { name: 'Gold', groups: [['Gold coin', 'Gold bar', 'Gold nugget', 'Gold ring'], ['Trophy', 'Medal', 'Crown', 'Treasure chest']] },
  ],
  prompts: [
    'What a leprechaun really does with all that gold',
    'The worst place to hide a pot of gold',
    'A rejected name for a lucky charm',
    'What happens if you don\'t wear green',
    'A leprechaun\'s dating profile',
    'The unluckiest thing that could happen today',
    'What is really at the end of the rainbow',
    'A new flavor of Shamrock Shake',
    'A terrible wish to make on a four-leaf clover',
    'The worst parade float',
    'What the snakes said when St. Patrick kicked them out',
    'Something you should never dye green',
    'A leprechaun\'s biggest complaint',
    'A lucky charm for your fantasy team',
    'What you\'d actually do with a pot of gold',
    'A rejected Irish dance move',
  ],
  finals: [
    'Write an Irish blessing for this crew',
    'Invent a new lucky charm',
    'Describe the luckiest day ever in five words',
    'Name the leprechaun hiding in this room',
    'Write a lucky rule for the Hood League',
  ],
};

export default set;
