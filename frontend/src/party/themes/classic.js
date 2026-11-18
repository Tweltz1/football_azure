// Everyday set: plays between holidays (see ../season.js).
const easy = [
  ['How many days are in a leap year?', '366', '365', '364', '360'],
  ['What is the largest planet in our solar system?', 'Jupiter', 'Saturn', 'Earth', 'Mars'],
  ['How many players does a football team have on the field at once?', '11', '9', '10', '12'],
  ['What color do you get by mixing blue and yellow?', 'Green', 'Purple', 'Orange', 'Brown'],
  ['Which is the fastest land animal?', 'Cheetah', 'Lion', 'Horse', 'Greyhound'],
  ['How many sides does a hexagon have?', '6', '5', '8', '7'],
  ['What do bees make?', 'Honey', 'Milk', 'Silk', 'Butter'],
  ['Which ocean is the largest?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'],
  ['How many points is a touchdown worth?', '6', '7', '3', '5'],
  ['Which planet is called the Red Planet?', 'Mars', 'Venus', 'Mercury', 'Neptune'],
];
const medium = [
  ['What is the capital of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal'],
  ['Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Picasso', 'Van Gogh'],
  ['What is the hardest natural substance?', 'Diamond', 'Gold', 'Iron', 'Quartz'],
  ['How many hearts does an octopus have?', '3', '1', '2', '8'],
  ['What is the smallest country in the world?', 'Vatican City', 'Monaco', 'Malta', 'Liechtenstein'],
  ['In bowling, what is three strikes in a row called?', 'A turkey', 'A hat trick', 'A triple', 'A spare'],
  ['Which element has the chemical symbol O?', 'Oxygen', 'Gold', 'Osmium', 'Iron'],
  ['Which chess piece can only move diagonally?', 'The bishop', 'The rook', 'The knight', 'The king'],
  ['In what country did the Olympic Games begin?', 'Greece', 'Italy', 'France', 'Egypt'],
];
const hard = [
  ['Who wrote "Pride and Prejudice"?', 'Jane Austen', 'Charlotte Bronte', 'Emily Dickinson', 'Mary Shelley'],
  ['Which NFL team went undefeated through the whole season and won the Super Bowl?', 'The 1972 Dolphins', 'The 2007 Patriots', 'The 1985 Bears', 'The 1989 49ers'],
  ['What is the main language spoken in Brazil?', 'Portuguese', 'Spanish', 'French', 'Brazilian'],
  ['Which metal is liquid at room temperature?', 'Mercury', 'Lead', 'Tin', 'Aluminum'],
  ['About how fast does light travel?', '186,000 miles per second', '1,000 miles per hour', '67,000 miles per hour', '5,000 miles per second'],
  ['Which planet has the most known moons?', 'Saturn', 'Jupiter', 'Neptune', 'Uranus'],
];
const expert = [
  ['In what year was the first Super Bowl played?', '1967', '1960', '1970', '1972'],
  ['What is the national animal of Scotland?', 'The unicorn', 'The lion', 'The stag', 'The eagle'],
  ['How many time zones does Russia have?', '11', '5', '7', '15'],
  ['Which is the only U.S. state with a one-syllable name?', 'Maine', 'Utah', 'Iowa', 'Ohio'],
  ['What is the rarest of the eight main blood types?', 'AB negative', 'O positive', 'A positive', 'B positive'],
];

const set = {
  levels: [easy, medium, hard, expert],
  categories: [
    { name: 'Pets', groups: [['Dog', 'Cat', 'Hamster', 'Guinea pig'], ['Goldfish', 'Parrot', 'Turtle', 'Lizard']] },
    { name: 'Pizza toppings', groups: [['Pepperoni', 'Sausage', 'Bacon', 'Ham'], ['Mushroom', 'Onion', 'Green pepper', 'Olive']] },
    { name: 'Sports', groups: [['Football', 'Basketball', 'Baseball', 'Hockey'], ['Tennis', 'Golf', 'Bowling', 'Ping pong']] },
    { name: 'Board games', groups: [['Monopoly', 'Scrabble', 'Clue', 'Risk'], ['Checkers', 'Chess', 'Sorry!', 'Candy Land']] },
    { name: 'Breakfast', groups: [['Pancakes', 'Waffles', 'French toast', 'Crepes'], ['Bacon', 'Eggs', 'Hash browns', 'Sausage']] },
    { name: 'Jobs', groups: [['Doctor', 'Nurse', 'Dentist', 'Vet'], ['Firefighter', 'Police officer', 'Pilot', 'Teacher']] },
    { name: 'Weather', groups: [['Rain', 'Snow', 'Hail', 'Sleet'], ['Tornado', 'Hurricane', 'Blizzard', 'Thunderstorm']] },
    { name: 'Kitchen', groups: [['Fork', 'Spoon', 'Knife', 'Spatula'], ['Toaster', 'Blender', 'Microwave', 'Oven']] },
  ],
  prompts: [
    'The worst name for a fantasy football team',
    'A terrible new flavor of chips',
    'What your dog does when you leave the house',
    'The worst thing to say in a job interview',
    'A rejected superhero power',
    'Something you should never say to a waiter',
    'The worst ride at an amusement park',
    'What the GPS is really thinking',
    'A new reality TV show that would be a disaster',
    'A terrible name for a boat',
    'What the fridge says about you behind your back',
    'The worst thing to hear from your pilot',
    'A rejected name for a pizza place',
    'What really happens in the Hood League group chat',
    'A new emoji nobody needs',
    'The worst thing to bring to a potluck',
  ],
  finals: [
    'Write the opening line of this crew\'s life story',
    'Invent a brand new sport',
    'Describe this room right now in five words',
    'Write a new rule for the Hood League',
    'Name the band this crew would start',
  ],
};

export default set;
