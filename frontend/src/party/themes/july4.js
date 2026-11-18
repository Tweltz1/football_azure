// Fourth of July set: June 20 through July 6 (see ../season.js).
const easy = [
  ['What date is Independence Day in the U.S.?', 'July 4', 'June 14', 'July 14', 'August 4'],
  ['How many stars are on the U.S. flag?', '50', '13', '48', '52'],
  ['How many stripes are on the U.S. flag?', '13', '50', '10', '15'],
  ['What colors are on the U.S. flag?', 'Red, white and blue', 'Red, white and green', 'Blue and gold', 'Red and yellow'],
  ['What lights up the sky on the Fourth of July?', 'Fireworks', 'Northern lights', 'Glow sticks', 'Flashlights'],
  ['What is the national bird of the U.S.?', 'The bald eagle', 'The turkey', 'The robin', 'The hawk'],
  ['Which country did the U.S. declare independence from?', 'Great Britain', 'France', 'Spain', 'Canada'],
  ['Who was the first U.S. president?', 'George Washington', 'Abraham Lincoln', 'Thomas Jefferson', 'John Adams'],
];
const medium = [
  ['In what year was the Declaration of Independence adopted?', '1776', '1492', '1812', '1865'],
  ['Who was the main author of the Declaration of Independence?', 'Thomas Jefferson', 'George Washington', 'Benjamin Franklin', 'John Adams'],
  ['Which famous bell in Philadelphia has a big crack?', 'The Liberty Bell', 'The Freedom Bell', 'Big Ben', 'The Taco Bell'],
  ['Whose giant signature on the Declaration became slang for a signature?', 'John Hancock', 'John Adams', 'Paul Revere', 'Samuel Adams'],
  ['Which song is the U.S. national anthem?', 'The Star-Spangled Banner', 'America the Beautiful', 'God Bless America', 'My Country, \'Tis of Thee'],
  ['Which famous hot dog eating contest happens every July 4th?', 'Nathan\'s', 'Oscar Mayer\'s', 'Portillo\'s', 'Hebrew National\'s'],
  ['Which statue in New York Harbor was a gift from France?', 'The Statue of Liberty', 'The Lincoln Memorial', 'Mount Rushmore', 'The Thinker'],
  ['Which ancient invention from China gave fireworks their start?', 'Gunpowder', 'Paper', 'The compass', 'Silk'],
];
const hard = [
  ['How many people signed the Declaration of Independence?', '56', '13', '100', '39'],
  ['Who wrote the words to "The Star-Spangled Banner"?', 'Francis Scott Key', 'John Philip Sousa', 'Paul Revere', 'Benjamin Franklin'],
  ['Which two signers and future presidents both died on July 4, 1826?', 'John Adams and Thomas Jefferson', 'Washington and Madison', 'Monroe and Madison', 'Lincoln and Adams'],
  ['Which president was born on the Fourth of July?', 'Calvin Coolidge', 'John F. Kennedy', 'Ronald Reagan', 'Teddy Roosevelt'],
  ['The flag over which fort inspired "The Star-Spangled Banner"?', 'Fort McHenry', 'Fort Sumter', 'Fort Knox', 'Fort Ticonderoga'],
  ['Where is the original Declaration of Independence kept today?', 'The National Archives', 'The White House', 'Independence Hall', 'The Smithsonian'],
];
const expert = [
  ['On what date did the Continental Congress actually vote for independence?', 'July 2, 1776', 'July 4, 1776', 'June 14, 1776', 'August 2, 1776'],
  ['Which president died on July 4, 1831?', 'James Monroe', 'James Madison', 'John Quincy Adams', 'Andrew Jackson'],
  ['Who designed today\'s 50-star flag as a high school project?', 'Robert Heft', 'Betsy Ross', 'Francis Bellamy', 'Samuel Wilson'],
  ['Who was the oldest signer of the Declaration, at 70?', 'Benjamin Franklin', 'John Hancock', 'Samuel Adams', 'Roger Sherman'],
  ['What was the Liberty Bell first called?', 'The State House Bell', 'The Freedom Bell', 'The Penn Bell', 'The Congress Bell'],
];

const set = {
  levels: [easy, medium, hard, expert],
  categories: [
    { name: 'Cookout food', groups: [['Hot dog', 'Hamburger', 'Bratwurst', 'Chicken wings'], ['Corn on the cob', 'Potato salad', 'Baked beans', 'Coleslaw']] },
    { name: 'Fireworks', groups: [['Sparkler', 'Roman candle', 'Firecracker', 'Bottle rocket'], ['Smoke bomb', 'Fountain', 'Snake', 'Pinwheel']] },
    { name: 'Summer fun', groups: [['Swimming', 'Water balloons', 'Slip and slide', 'Sprinkler'], ['Camping', 'Fishing', 'Boating', 'Tubing']] },
    { name: 'American landmarks', groups: [['Statue of Liberty', 'Liberty Bell', 'Mount Rushmore', 'Lincoln Memorial'], ['Grand Canyon', 'Golden Gate Bridge', 'Hoover Dam', 'Space Needle']] },
    { name: 'Founding Fathers', groups: [['George Washington', 'Thomas Jefferson', 'John Adams', 'James Madison'], ['Benjamin Franklin', 'Alexander Hamilton', 'John Hancock', 'John Jay']] },
    { name: 'Yard games', groups: [['Cornhole', 'Horseshoes', 'Ladder toss', 'Bocce'], ['Frisbee', 'Wiffle ball', 'Badminton', 'Croquet']] },
    { name: 'Summer treats', groups: [['Popsicle', 'Ice cream cone', 'Snow cone', 'Sundae'], ['Watermelon', 'Lemonade', 'Apple pie', 'S\'mores']] },
    { name: 'Red and blue', groups: [['Cherry', 'Strawberry', 'Tomato', 'Fire truck'], ['Blueberry', 'Ocean', 'Bluebird', 'Jeans']] },
  ],
  prompts: [
    'The worst thing to bring to a cookout',
    'A rejected name for a firework',
    'What the hot dog is thinking on the grill',
    'The Founding Father who\'d be best at fantasy football',
    'A new amendment nobody asked for',
    'The worst job at the family cookout',
    'What the bald eagle does on its day off',
    'A terrible new flavor of Popsicle',
    'What your dog thinks fireworks are',
    'The worst place to watch fireworks',
    'What Benjamin Franklin would say about your phone',
    'A rejected line from the Declaration of Independence',
    'Something you should never put on the grill',
    'A new event for the hot dog eating contest',
    'The real reason Uncle Sam is pointing at you',
    'The worst thing to yell during the fireworks',
  ],
  finals: [
    'Write the first line of the Hood League\'s Declaration of Independence',
    'Describe a perfect Fourth of July in five words',
    'Invent a new firework and name it',
    'Write a toast for the cookout',
    'Name the national holiday this crew would invent',
  ],
};

export default set;
