// New Year's set: December 27 through January 10 (see ../season.js).
const easy = [
  ['What do people count down to on New Year\'s Eve?', 'Midnight', 'Noon', 'Sunrise', 'Dinner'],
  ['What drops in Times Square at midnight on New Year\'s Eve?', 'A giant lit-up ball', 'A giant apple', 'A piano', 'A disco shoe'],
  ['What do people make on January 1 to change a habit?', 'A resolution', 'A reservation', 'A revolution', 'A recipe'],
  ['What do people often throw in the air at midnight?', 'Confetti', 'Pancakes', 'Shoes', 'Socks'],
  ['What is the first month of the year?', 'January', 'December', 'March', 'June'],
  ['What lights up the sky at many midnight celebrations?', 'Fireworks', 'Lightning', 'Flashlights', 'Glow sticks'],
  ['How many seconds are in the classic midnight countdown?', '10', '60', '5', '100'],
  ['What do people often wear on their heads at a New Year\'s party?', 'Party hats', 'Helmets', 'Swim caps', 'Chef hats'],
];
const medium = [
  ['Which city is one of the first big cities to ring in the New Year, with fireworks over its harbor?', 'Sydney', 'London', 'New York', 'Chicago'],
  ['In Spain, what do people eat one of at each stroke of midnight?', 'Grapes', 'Olives', 'Cherries', 'Almonds'],
  ['Which college football game is played in Pasadena around New Year\'s Day?', 'The Rose Bowl', 'The Orange Bowl', 'The Sugar Bowl', 'The Cotton Bowl'],
  ['Which parade rolls through Pasadena on New Year\'s Day?', 'The Rose Parade', 'Macy\'s Parade', 'Mardi Gras', 'The Tulip Parade'],
  ['Which Southern dish is eaten on New Year\'s Day for luck?', 'Black-eyed peas', 'Gumbo', 'Grits', 'Fried okra'],
  ['What is Chinese New Year also commonly called?', 'Lunar New Year', 'Spring Solstice', 'Dragon Day', 'Moon Fest'],
  ['Which TV host was the face of "New Year\'s Rockin\' Eve" for decades?', 'Dick Clark', 'Johnny Carson', 'David Letterman', 'Bob Barker'],
  ['Which Roman god with two faces gives January its name?', 'Janus', 'Jupiter', 'Juno', 'Mars'],
];
const hard = [
  ['What New Year\'s song title means "old long since" in Scots?', 'Auld Lang Syne', 'Jingle Bell Rock', 'Feliz Navidad', 'Let It Snow'],
  ['Which poet wrote the words of "Auld Lang Syne"?', 'Robert Burns', 'William Shakespeare', 'Lord Byron', 'Walter Scott'],
  ['What is New Year\'s Eve called in Scotland?', 'Hogmanay', 'Burns Night', 'Twelfth Night', 'Boxing Day'],
  ['Which festival ends Lunar New Year celebrations?', 'The Lantern Festival', 'The Dragon Boat Festival', 'The Mid-Autumn Festival', 'Qingming'],
  ['Which animal comes first in the Chinese zodiac?', 'Rat', 'Dragon', 'Ox', 'Tiger'],
  ['The "first-footer", the first guest through the door after midnight, is a tradition from where?', 'Scotland', 'Japan', 'Brazil', 'Italy'],
];
const expert = [
  ['In what year did the first ball drop in Times Square?', '1907', '1950', '1882', '1925'],
  ['Which island nation is among the very first to reach midnight?', 'Kiribati', 'Hawaii', 'Iceland', 'Japan'],
  ['Which pope gave us the calendar most of the world uses today?', 'Gregory XIII', 'Julius II', 'Leo X', 'Pius V'],
  ['In Denmark, what do people smash against friends\' doors at New Year\'s?', 'Old plates', 'Eggs', 'Pumpkins', 'Snowballs'],
  ['In Japan, how many times do temple bells ring on New Year\'s Eve?', '108', '12', '100', '365'],
  ['Which U.S. city drops a giant peach on New Year\'s Eve?', 'Atlanta', 'Savannah', 'Charleston', 'Macon'],
];

const set = {
  levels: [easy, medium, hard, expert],
  categories: [
    { name: 'Party gear', groups: [['Confetti', 'Streamers', 'Balloons', 'Glitter'], ['Party hat', 'Noisemaker', 'Tiara', 'Sparkler']] },
    { name: 'Resolutions', groups: [['Go to the gym', 'Run a 5K', 'Do yoga', 'Lift weights'], ['Read more', 'Save money', 'Learn to cook', 'Learn a language']] },
    { name: 'Countdown spots', groups: [['Times Square', 'Las Vegas Strip', 'Sydney Harbour', 'London Eye'], ['Living room', 'Basement party', 'Rooftop', 'Backyard']] },
    { name: 'Party snacks', groups: [['Chips and dip', 'Pigs in a blanket', 'Meatballs', 'Cheese tray'], ['Shrimp cocktail', 'Sliders', 'Wings', 'Nachos']] },
    { name: 'Bowl games', groups: [['Rose Bowl', 'Sugar Bowl', 'Orange Bowl', 'Cotton Bowl'], ['Peach Bowl', 'Fiesta Bowl', 'Citrus Bowl', 'Gator Bowl']] },
    { name: 'Time', groups: [['Watch', 'Alarm clock', 'Hourglass', 'Stopwatch'], ['Midnight', 'Noon', 'Sunrise', 'Sunset']] },
    { name: 'Party drinks', groups: [['Sparkling cider', 'Punch', 'Lemonade', 'Fruit smoothie'], ['Hot cocoa', 'Coffee', 'Iced tea', 'Soda']] },
    { name: 'Fresh starts', groups: [['Planner', 'Calendar', 'Notebook', 'Journal'], ['Haircut', 'New shoes', 'New phone', 'Gym bag']] },
  ],
  prompts: [
    'The worst New Year\'s resolution',
    'A resolution you will break by January 2',
    'What the Times Square ball thinks about all year',
    'The most awkward midnight moment',
    'A terrible thing to yell at midnight',
    'A new name for January',
    'What the gym says about its January members',
    'The worst way to ring in the new year',
    'A bold prediction for this crew next year',
    'The weirdest thing to count down to',
    'The worst party favor',
    'What last year would say if it could talk',
    'A rejected New Year\'s Eve TV special',
    'Something you should not do at the stroke of midnight',
    'The first big headline of the new year',
    'A New Year\'s resolution for your fantasy team',
  ],
  finals: [
    'Describe this room at midnight in five words',
    'Write the first line of next year\'s story',
    'Predict the biggest moment of the new year',
    'Write a toast for the new year',
    'Write a New Year\'s rule for the Hood League',
  ],
};

export default set;
