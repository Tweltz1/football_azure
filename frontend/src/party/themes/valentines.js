// Valentine's Day set: February 1 through 14 (see ../season.js).
const easy = [
  ['What date is Valentine\'s Day?', 'February 14', 'February 2', 'March 14', 'January 14'],
  ['Which winged baby with a bow and arrow is a Valentine symbol?', 'Cupid', 'Hermes', 'Pegasus', 'Robin Hood'],
  ['What shape is on most Valentine cards?', 'A heart', 'A star', 'A square', 'A moon'],
  ['What flowers are the classic Valentine gift?', 'Red roses', 'Sunflowers', 'Daisies', 'Dandelions'],
  ['What do "XO" stand for at the end of a note?', 'Hugs and kisses', 'Extra orders', 'Tic-tac-toe', 'Okay, ex'],
  ['What candy often comes in a heart-shaped box?', 'Chocolates', 'Jelly beans', 'Gum', 'Candy corn'],
  ['What color is most linked with Valentine\'s Day?', 'Red', 'Green', 'Orange', 'Brown'],
  ['Small heart candies with short messages on them are called what?', 'Conversation hearts', 'Talk tarts', 'Word drops', 'Sweet notes'],
  ['Which Disney dogs share a plate of spaghetti?', 'Lady and the Tramp', '101 Dalmatians', 'The Fox and the Hound', 'Bolt'],
];
const medium = [
  ['In Roman myth, Cupid is the son of which goddess?', 'Venus', 'Juno', 'Minerva', 'Diana'],
  ['Which Shakespeare play has the famous balcony scene?', 'Romeo and Juliet', 'Hamlet', 'Macbeth', 'Othello'],
  ['What is Galentine\'s Day, made famous by "Parks and Recreation"?', 'A day to celebrate friends', 'A day for dogs', 'A day off work', 'A cooking contest'],
  ['Which singer had a hit with "Love Story" in 2008?', 'Taylor Swift', 'Katy Perry', 'Adele', 'Beyonce'],
  ['What is the birthstone for February?', 'Amethyst', 'Ruby', 'Emerald', 'Diamond'],
  ['How do you say "I love you" in French?', 'Je t\'aime', 'Te amo', 'Ich liebe dich', 'Ti amo'],
  ['Which parrot is named for how close pairs stay?', 'Lovebird', 'Macaw', 'Cockatoo', 'Parakeet'],
  ['In "Titanic", what is Kate Winslet\'s character called?', 'Rose', 'Lily', 'Daisy', 'Iris'],
];
const hard = [
  ['What is Cupid\'s name in Greek myth?', 'Eros', 'Ares', 'Apollo', 'Hermes'],
  ['Which movie has the line "You had me at hello"?', 'Jerry Maguire', 'Titanic', 'Notting Hill', 'Pretty Woman'],
  ['In which country do women traditionally give men chocolate on Valentine\'s Day, with "White Day" a month later?', 'Japan', 'France', 'Brazil', 'Canada'],
  ['What does the Latin phrase "amor vincit omnia" mean?', 'Love conquers all', 'Love is blind', 'All you need is love', 'Love at first sight'],
  ['Which candy company made the classic Sweethearts conversation hearts for most of their history?', 'NECCO', 'Hershey', 'Mars', 'Nestle'],
  ['Which Roman festival in mid-February is often linked to Valentine\'s Day\'s origins?', 'Lupercalia', 'Saturnalia', 'Floralia', 'Vestalia'],
];
const expert = [
  ['Which English poet first tied Valentine\'s Day to romance, around 1380?', 'Geoffrey Chaucer', 'William Shakespeare', 'John Milton', 'John Keats'],
  ['Who wrote one of the oldest known valentines, from 1415, while held in the Tower of London?', 'Charles, Duke of Orleans', 'Henry VIII', 'Joan of Arc', 'Richard the Lionheart'],
  ['Who is called the "Mother of the American Valentine" for selling them in the 1840s?', 'Esther Howland', 'Betsy Ross', 'Louisa May Alcott', 'Clara Barton'],
  ['Which composer wrote the "Romeo and Juliet" fantasy overture?', 'Tchaikovsky', 'Mozart', 'Chopin', 'Vivaldi'],
  ['In Wales, what do people give on St. Dwynwen\'s Day, their own day of love?', 'Carved wooden love spoons', 'Red socks', 'Daffodils', 'Silver coins'],
];

const set = {
  levels: [easy, medium, hard, expert],
  categories: [
    { name: 'Sweets', groups: [['Chocolate truffle', 'Fudge', 'Chocolate strawberry', 'Brownie'], ['Conversation hearts', 'Gummy hearts', 'Lollipop', 'Cinnamon hearts']] },
    { name: 'Flowers', groups: [['Rose', 'Tulip', 'Carnation', 'Lily'], ['Daisy', 'Sunflower', 'Orchid', 'Peony']] },
    { name: 'Date night', groups: [['Movie', 'Dinner', 'Bowling', 'Mini golf'], ['Picnic', 'Ice skating', 'Concert', 'Arcade']] },
    { name: 'Famous couples', groups: [['Romeo and Juliet', 'Mickey and Minnie', 'Beauty and the Beast', 'Shrek and Fiona'], ['Lady and the Tramp', 'Kermit and Miss Piggy', 'Popeye and Olive Oyl', 'Barbie and Ken']] },
    { name: 'Card words', groups: [['Be mine', 'Hug me', 'Cutie pie', 'Sweetheart'], ['Love you', 'XOXO', 'True love', 'Soul mate']] },
    { name: 'Gifts', groups: [['Teddy bear', 'Flowers', 'Card', 'Chocolate'], ['Necklace', 'Ring', 'Bracelet', 'Earrings']] },
    { name: 'Pink and red', groups: [['Strawberry', 'Cherry', 'Raspberry', 'Watermelon'], ['Flamingo', 'Bubble gum', 'Cotton candy', 'Pink lemonade']] },
    { name: 'Love stories', groups: [['Titanic', 'The Notebook', 'Notting Hill', 'Pretty Woman'], ['Tangled', 'The Little Mermaid', 'Cinderella', 'Aladdin']] },
  ],
  prompts: [
    'The worst thing to write in a Valentine card',
    'A terrible message for a candy heart',
    'What Cupid does the other 364 days',
    'The least romantic dinner spot',
    'A rejected Valentine\'s Day gift',
    'A pickup line a robot would use',
    'The worst way to ask someone to be your Valentine',
    'What your pet gets you for Valentine\'s Day',
    'A dating profile for a fantasy football team',
    'The worst song to slow dance to',
    'What the giant teddy bear at the store is really thinking',
    'A new flavor of Valentine chocolate nobody wants',
    'A breakup text from your fantasy team',
    'Something you should never say on a first date',
    'The worst thing to find in a heart-shaped box',
    'Cupid\'s biggest mistake',
  ],
  finals: [
    'Write a love poem to pizza',
    'Describe the perfect date in five words',
    'Write the Hood League\'s Valentine to its commissioner',
    'Invent a new candy heart message',
    'Write the first line of a romance novel',
  ],
};

export default set;
