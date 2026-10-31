// Fright Quiz questions, in four levels from easy to expert. The first answer is the right one;
// the game shuffles them. A game climbs the levels question by question, and the TV remembers
// which questions it has shown so repeat games pick fresh ones first.

export const EASY = [
['What do people carve to make a jack-o\'-lantern?', 'A pumpkin', 'A watermelon', 'A potato', 'A coconut'],
  ['What do kids say at the door on Halloween?', 'Trick or treat!', 'Happy birthday!', 'Knock knock!', 'Merry Christmas!'],
  ['What is Halloween\'s date?', 'October 31', 'October 13', 'November 1', 'September 31'],
  ['Which animal is said to sleep hanging upside down?', 'Bat', 'Owl', 'Cat', 'Spider'],
  ['How many legs does a spider have?', '8', '6', '10', '12'],
  ['What does a vampire supposedly hate?', 'Garlic', 'Cheese', 'Chocolate', 'Pickles'],
  ['What color is a classic witch\'s hat?', 'Black', 'Green', 'Yellow', 'Pink'],
  ['What does a witch traditionally fly on?', 'A broomstick', 'A vacuum', 'A skateboard', 'A rake'],
  ['Which monster is wrapped in bandages?', 'Mummy', 'Werewolf', 'Zombie', 'Ghost'],
  ['What does a werewolf turn into?', 'A wolf', 'A bat', 'A cat', 'A bear'],
  ['A werewolf changes under which kind of moon?', 'Full moon', 'Half moon', 'New moon', 'Blue cheese moon'],
  ['What does a ghost famously say?', 'Boo!', 'Moo!', 'Yoo-hoo!', 'Achoo!'],
  ['What is a group of witches called?', 'A coven', 'A flock', 'A pack', 'A herd'],
  ['What do spiders spin?', 'Webs', 'Yarn', 'Cotton candy', 'Rope'],
  ['Which bird is known for hooting at night?', 'Owl', 'Robin', 'Duck', 'Parrot'],
  ['What is a witch\'s big cooking pot called?', 'A cauldron', 'A wok', 'A kettle', 'A crock pot'],
  ['Who built the monster in the classic story "Frankenstein"?', 'Victor Frankenstein', 'Count Dracula', 'Dr. Jekyll', 'Igor'],
  ['Count Dracula is from which region?', 'Transylvania', 'Pennsylvania', 'Narnia', 'Hawaii'],
  ['Which candy is shaped like a tiny tri-colored cone?', 'Candy corn', 'Gummy bear', 'Jelly bean', 'Licorice'],
  ['What is the fear of spiders called?', 'Arachnophobia', 'Claustrophobia', 'Acrophobia', 'Hydrophobia'],
  ['Which of these is NOT a monster?', 'Pumpkin pie', 'Zombie', 'Vampire', 'Werewolf'],
  ['Skeletons are made of what?', 'Bones', 'Rocks', 'Sticks', 'Noodles'],
  ['About how many bones does an adult human have?', '206', '50', '1,000', '12'],
  ['What color is a pumpkin usually?', 'Orange', 'Blue', 'Purple', 'Gray'],
  ['A black cat crossing your path is said to bring what?', 'Bad luck', 'Free candy', 'Rain', 'A pizza'],
  ['What do zombies want to eat in the movies?', 'Brains', 'Broccoli', 'Bananas', 'Bagels'],
  ['In which country did Halloween\'s jack-o\'-lantern tradition start, carving turnips?', 'Ireland', 'Australia', 'Japan', 'Brazil'],
  ['What is the name of the friendly cartoon ghost?', 'Casper', 'Gary', 'Chester', 'Carl'],
  ['In "The Nightmare Before Christmas", who is the Pumpkin King?', 'Jack Skellington', 'Sally', 'Oogie Boogie', 'Zero'],
  ['In "Hocus Pocus", how many Sanderson sisters are there?', '3', '2', '4', '5'],
  ['Which Ghostbusters ghost is green and loves to eat?', 'Slimer', 'Stay Puft', 'Gozer', 'Casper'],
  ['What giant marshmallow monster stomps through the city in "Ghostbusters"?', 'Stay Puft Marshmallow Man', 'Sugar Giant', 'Mr. Fluff', 'The Blob'],
  ['What do you bob for at a Halloween party?', 'Apples', 'Eggs', 'Socks', 'Tennis balls'],
  ['Which of these is a classic Halloween color pair?', 'Orange and black', 'Pink and blue', 'Red and green', 'Gold and silver'],
  ['What do you call a person who brings the dead back as zombies?', 'A necromancer', 'A magician', 'A plumber', 'A dentist'],
  ['What shines through the eyes of a jack-o\'-lantern?', 'A candle', 'A flashlight app', 'The moon', 'A lightning bug'],
  ['How many eyes does a cyclops have?', '1', '2', '3', '4'],
  ['Which creature has snakes for hair?', 'Medusa', 'Mermaid', 'Minotaur', 'Mummy'],
  ['What do you call a baby pumpkin?', 'A pumpkinling... just kidding, a small pumpkin!', 'A squashlet', 'A gourdlet', 'A pumplet'],
  ['Which state is famous for its 1692 witch trials?', 'Massachusetts (Salem)', 'Texas', 'Florida', 'Ohio'],
  ['What are scarecrows meant to scare away?', 'Crows', 'Ghosts', 'Cows', 'Mail carriers'],
  ['What is a "haunted" house said to have?', 'Ghosts', 'A pool', 'Free Wi-Fi', 'Three garages'],
  ['Which of these is a real kind of bat?', 'Vampire bat', 'Werewolf bat', 'Zombie bat', 'Mummy bat'],
  ['What do you call the outfit you wear on Halloween?', 'A costume', 'A uniform', 'A tuxedo', 'A wetsuit'],
  ['Which vegetable are jack-o\'-lanterns related to?', 'Squash', 'Carrot', 'Lettuce', 'Onion'],
  ['How do you say "Halloween" in its original form?', 'All Hallows\' Eve', 'Hollow Weekend', 'Hall of Ween', 'Hello Ween'],
  ['What do mummies come from in old stories?', 'Ancient Egypt', 'Ancient Iceland', 'Antarctica', 'The Moon'],
  ['What noise does a cat make when it\'s spooked?', 'Hiss', 'Moo', 'Quack', 'Oink'],
  ['What sticky treat is often wrapped around an apple in fall?', 'Caramel', 'Ketchup', 'Peanut butter', 'Honey mustard'],
  ['In "Scooby-Doo", what is the dog\'s favorite snack?', 'Scooby Snacks', 'Dog Donuts', 'Bone Bites', 'Pup Pops'],
  ['In "Scooby-Doo", the "monster" is usually...', 'A person in a mask', 'A real ghost', 'A robot', 'An alien'],
  ['Which of these candies is chocolate with peanut butter?', 'Reese\'s Cups', 'Skittles', 'Sour Patch Kids', 'Starburst'],
  ['Where do vampires sleep in the stories?', 'In a coffin', 'In a hammock', 'In a bathtub', 'On a trampoline'],
  ['What do you call a ghost\'s mistake?', 'A boo-boo', 'A spook-up', 'A ghoul-oops', 'A haunt-fault'],
  ['Which monster is green with bolts in its neck?', 'Frankenstein\'s monster', 'Dracula', 'The Wolf Man', 'The Mummy'],
  ['Which month comes right after Halloween?', 'November', 'December', 'September', 'January'],
  ['What do you call a pumpkin\'s top part you cut off to carve?', 'The lid', 'The hat', 'The roof', 'The cap'],
  ['What is the main ingredient inside a pumpkin you scoop out?', 'Seeds and goop', 'Cotton', 'Sand', 'Jelly'],
];

export const MEDIUM = [
  ['In which country did Halloween\'s old Celtic festival, Samhain, begin?', 'Ireland', 'Mexico', 'Japan', 'Brazil'],
  ['Before pumpkins, what did people in Ireland carve into lanterns?', 'Turnips', 'Watermelons', 'Apples', 'Coconuts'],
  ['Who wrote the novel "Frankenstein"?', 'Mary Shelley', 'Bram Stoker', 'Edgar Allan Poe', 'Stephen King'],
  ['Who wrote the novel "Dracula"?', 'Bram Stoker', 'Mary Shelley', 'Charles Dickens', 'Stephen King'],
  ['Count Dracula\'s castle is in which region?', 'Transylvania', 'Bavaria', 'Scotland', 'Sicily'],
  ['What is the name of the Addams Family\'s helpful hand?', 'Thing', 'Handy', 'Fingers', 'Lefty'],
  ['How many Sanderson sisters are in "Hocus Pocus"?', '3', '2', '4', '5'],
  ['What giant monster stomps through New York in "Ghostbusters"?', 'The Stay Puft Marshmallow Man', 'A giant jack-o\'-lantern', 'King Kong', 'A huge gummy bear'],
  ['Jack Skellington is the Pumpkin King of which town?', 'Halloween Town', 'Spooky Hollow', 'Christmas Town', 'Gloomville'],
  ['What is the name of Jack Skellington\'s ghost dog?', 'Zero', 'Spot', 'Bones', 'Casper'],
  ['What is a group of crows called?', 'A murder', 'A gaggle', 'A pride', 'A pack'],
  ['Who wrote the poem "The Raven"?', 'Edgar Allan Poe', 'Mark Twain', 'Stephen King', 'Emily Dickinson'],
  ['What word does the raven keep repeating in Poe\'s poem?', '"Nevermore"', '"Forevermore"', '"Go away"', '"Caw-caw"'],
  ['In "The Legend of Sleepy Hollow", who does the Headless Horseman chase?', 'Ichabod Crane', 'Rip Van Winkle', 'Tom Sawyer', 'Paul Revere'],
  ['Who sang the 1982 hit "Thriller"?', 'Michael Jackson', 'Prince', 'Madonna', 'Elvis Presley'],
  ['In "Monster Mash", it was a ___ smash.', 'Graveyard', 'Pumpkin', 'Haunted', 'Midnight'],
  ['The Ghostbusters\' big rule: "Don\'t cross the..."', 'Streams', 'Wires', 'Beams', 'Bridges'],
  ['How many times do you say "Beetlejuice" to summon him?', '3', '1', '5', '13'],
  ['Which famous escape artist died on Halloween in 1926?', 'Harry Houdini', 'David Copperfield', 'P.T. Barnum', 'Buffalo Bill'],
  ['Breaking a mirror is said to bring how many years of bad luck?', '7', '1', '3', '13'],
  ['Which country is most famous for Día de los Muertos?', 'Mexico', 'Spain', 'Brazil', 'Italy'],
  ['What is a baby bat called?', 'A pup', 'A kit', 'A chick', 'A cub'],
  ['In "Coraline", what does the Other Mother have instead of eyes?', 'Buttons', 'Marbles', 'Coins', 'Beads'],
  ['Which Hogwarts ghost is "Nearly Headless"?', 'Nick', 'Ned', 'Norbert', 'Nigel'],
  ['In "Stranger Things", what is the creepy other dimension called?', 'The Upside Down', 'The Shadow Realm', 'The Flip Side', 'The Nether'],
  ['In "Stranger Things", which breakfast food does Eleven love?', 'Eggo waffles', 'Pancakes', 'Cereal', 'Donuts'],
  ['Ghostface is the masked villain in which movie series?', 'Scream', 'Halloween', 'Friday the 13th', 'Saw'],
  ['In "Monsters, Inc.", what powers Monstropolis at the start?', 'Kids\' screams', 'Candy', 'Lightning', 'Pumpkin juice'],
  ['Who is Sulley\'s one-eyed best friend in "Monsters, Inc."?', 'Mike Wazowski', 'Randall', 'Roz', 'Boo'],
  ['Who runs the hotel in "Hotel Transylvania"?', 'Dracula', 'Frankenstein', 'The Wolfman', 'The Mummy'],
  ['Botanically speaking, a pumpkin is a...', 'Fruit', 'Vegetable', 'Nut', 'Grain'],
  ['Pumpkins are mostly made of what?', 'Water', 'Sugar', 'Fiber', 'Oil'],
  ['Who wrote the "Goosebumps" books?', 'R.L. Stine', 'Stephen King', 'Roald Dahl', 'J.K. Rowling'],
  ['Salem the talking black cat is from which show?', 'Sabrina the Teenage Witch', 'Charmed', 'Bewitched', 'Wednesday'],
  ['What is Wednesday Addams\' little brother\'s name?', 'Pugsley', 'Gomez', 'Lurch', 'Fester'],
  ['What metal is said to hurt werewolves?', 'Silver', 'Gold', 'Iron', 'Copper'],
  ['Which lake is home to the legendary "Nessie"?', 'Loch Ness', 'Lake Tahoe', 'Lake Michigan', 'Lake Geneva'],
  ['What is another name for Bigfoot?', 'Sasquatch', 'Chupacabra', 'Mothman', 'Kraken'],
  ['Which spider has a red hourglass on its belly?', 'Black widow', 'Tarantula', 'Wolf spider', 'Daddy longlegs'],
  ['How do bats find their way in the dark?', 'Echolocation', 'Night-vision eyes', 'Smell only', 'Magnetic fields'],
  ['What is a "blood moon"?', 'A red moon during a lunar eclipse', 'A full moon in October', 'A moon with a ring', 'A moon on Friday the 13th'],
  ['What do Dementors feed on in Harry Potter?', 'Happiness', 'Blood', 'Candy', 'Moonlight'],
  ['Which Hogwarts ghost haunts a bathroom?', 'Moaning Myrtle', 'The Grey Lady', 'Peeves', 'The Fat Friar'],
  ['In "Twilight", what makes Edward sparkle?', 'Sunlight', 'Moonlight', 'Rain', 'Snow'],
  ['In "Twilight", who is Bella\'s werewolf friend?', 'Jacob', 'Edward', 'Mike', 'Emmett'],
  ['In Minecraft, which green mob sneaks up and explodes?', 'Creeper', 'Zombie', 'Skeleton', 'Enderman'],
  ['How many ghosts chase Pac-Man in the original game?', '4', '3', '5', '6'],
  ['Which of these is a Ghost-type Pokémon?', 'Gengar', 'Pikachu', 'Charmander', 'Snorlax'],
  ['Who plays Wednesday in the Netflix show "Wednesday"?', 'Jenna Ortega', 'Christina Ricci', 'Millie Bobby Brown', 'Zendaya'],
  ['How many bones are in an adult human skeleton?', '206', '106', '306', '412'],
  ['In "It\'s the Great Pumpkin, Charlie Brown", who waits for the Great Pumpkin?', 'Linus', 'Charlie Brown', 'Snoopy', 'Lucy'],
  ['What is the Scooby gang\'s van called?', 'The Mystery Machine', 'The Ghost Wagon', 'The Spook Van', 'The Clue Cruiser'],
  ['Sally from "The Nightmare Before Christmas" is a...', 'Rag doll', 'Witch', 'Ghost', 'Skeleton'],
  ['Which candy bar shares its name with a planet?', 'Mars', 'Snickers', 'Twix', 'Butterfinger'],
  ['What are real vampire bats\' main food?', 'Animal blood', 'Fruit', 'Insects', 'Fish'],
];

export const HARD = [
  ['What year did John Carpenter\'s original "Halloween" come out?', '1978', '1968', '1985', '1992'],
  ['Which Irish legend gave the jack-o\'-lantern its name?', 'Stingy Jack', 'Lucky Jack', 'Jack the Giant Killer', 'Jack Frost'],
  ['Which US state grows the most pumpkins?', 'Illinois', 'Texas', 'Maine', 'Florida'],
  ['The heaviest pumpkin ever grown weighed about how much?', 'Over 2,700 pounds', '300 pounds', '900 pounds', '10,000 pounds'],
  ['What is triskaidekaphobia the fear of?', 'The number 13', 'Spiders', 'Clowns', 'The dark'],
  ['Which actor played Dracula in the 1931 movie?', 'Bela Lugosi', 'Boris Karloff', 'Vincent Price', 'Christopher Lee'],
  ['Which actor played Frankenstein\'s monster in the 1931 movie?', 'Boris Karloff', 'Bela Lugosi', 'Lon Chaney Jr.', 'Peter Lorre'],
  ['Who wrote "It", the book about Pennywise the clown?', 'Stephen King', 'Dean Koontz', 'R.L. Stine', 'Anne Rice'],
  ['Who wrote "The Legend of Sleepy Hollow"?', 'Washington Irving', 'Mark Twain', 'Edgar Allan Poe', 'Nathaniel Hawthorne'],
  ['"Hocus Pocus" takes place in which town?', 'Salem', 'Boston', 'Sleepy Hollow', 'Halloweentown'],
  ['What is the name of the boy turned into a black cat in "Hocus Pocus"?', 'Thackery Binx', 'Max Dennison', 'Billy Butcherson', 'Salem Saberhagen'],
  ['What is the Addams Family butler\'s name?', 'Lurch', 'Jeeves', 'Igor', 'Alfred'],
  ['Which Shakespeare play opens with three witches?', 'Macbeth', 'Hamlet', 'Othello', 'Romeo and Juliet'],
  ['"Double, double toil and trouble; fire burn and..."', 'Cauldron bubble', 'Witches cackle', 'Ghosts will double', 'Pumpkins rumble'],
  ['In "Dracula", what is missing when the Count stands before a mirror?', 'His reflection', 'His cape', 'His fangs', 'His hat'],
  ['In "The Tell-Tale Heart", what gives the narrator away?', 'The sound of a beating heart', 'A ghost', 'A black cat', 'A raven'],
  ['What does "chupacabra" mean in Spanish?', 'Goat sucker', 'Night howler', 'Moon dog', 'Bone eater'],
  ['The wailing banshee comes from the folklore of which country?', 'Ireland', 'Germany', 'Japan', 'Egypt'],
  ['Which state is home to the legend of the Mothman?', 'West Virginia', 'New Jersey', 'Ohio', 'Oregon'],
  ['The "mummy\'s curse" is famously linked to which pharaoh\'s tomb?', 'Tutankhamun', 'Ramses II', 'Cleopatra', 'Khufu'],
  ['Ancient Egyptians stored a mummy\'s organs in what?', 'Canopic jars', 'Treasure chests', 'Clay bricks', 'Reed baskets'],
  ['Which horror legend does the spooky voice-over in "Thriller"?', 'Vincent Price', 'Christopher Lee', 'Boris Karloff', 'Bela Lugosi'],
  ['Which legendary ghost ship is doomed to sail forever?', 'The Flying Dutchman', 'The Black Pearl', 'The Titanic', 'The Mayflower'],
  ['What was Ichabod Crane\'s job in Sleepy Hollow?', 'Schoolteacher', 'Blacksmith', 'Farmer', 'Sheriff'],
  ['What is the green ghost in "Ghostbusters" called?', 'Slimer', 'Gooey', 'Spud', 'Zuul'],
  ['What are the decorated sugar skulls of Día de los Muertos called?', 'Calaveras', 'Piñatas', 'Ofrendas', 'Churros'],
  ['What is the name of Miguel\'s dog in "Coco"?', 'Dante', 'Pepita', 'Chico', 'Diego'],
  ['What is a group of owls called?', 'A parliament', 'A murder', 'A gaggle', 'A herd'],
  ['About how far can an owl turn its head?', '270 degrees', '90 degrees', '180 degrees', 'All the way around, 360'],
  ['What is the full moon closest to the fall equinox called?', 'Harvest moon', 'Wolf moon', 'Blood moon', 'Snow moon'],
  ['In the first Harry Potter book, what gets into Hogwarts on Halloween?', 'A troll', 'A dragon', 'A Dementor', 'A basilisk'],
  ['What is the name of the mischievous poltergeist at Hogwarts?', 'Peeves', 'Dobby', 'Filch', 'Moaning Myrtle'],
  ['How many "happy haunts" live in Disney\'s Haunted Mansion?', '999', '666', '100', '13'],
  ['What does Charlie Brown keep getting while trick-or-treating?', 'A rock', 'A sock', 'A potato', 'A toothbrush'],
  ['Which of these is NOT one of Pac-Man\'s ghosts?', 'Stinky', 'Blinky', 'Pinky', 'Clyde'],
  ['What do Boos in Mario games do when you look right at them?', 'Cover their faces', 'Attack', 'Laugh', 'Explode'],
  ['What are "The Simpsons" Halloween episodes called?', 'Treehouse of Horror', 'Spooky Springfield', 'Halloween Hijinks', 'Night of the Simpsons'],
  ['Which actor played Beetlejuice?', 'Michael Keaton', 'Jim Carrey', 'Johnny Depp', 'Robin Williams'],
  ['Who played Edward Scissorhands?', 'Johnny Depp', 'Jim Carrey', 'Keanu Reeves', 'Tom Cruise'],
  ['What is the longest bone in the human body?', 'The femur (thigh bone)', 'The spine', 'The skull', 'The shin bone'],
  ['What is the Bhut jolokia chili pepper better known as?', 'The ghost pepper', 'The devil pepper', 'The phantom chili', 'The witch\'s finger'],
  ['What is another word for werewolf?', 'Lycanthrope', 'Banshee', 'Ghoul', 'Wraith'],
  ['What does Jack Skellington call Santa Claus?', 'Sandy Claws', 'Saint Nick', 'Mr. Claus', 'Father Frost'],
  ['Oogie Boogie from "The Nightmare Before Christmas" is a sack filled with what?', 'Bugs', 'Sand', 'Candy', 'Leaves'],
  ['Who kidnaps Santa in "The Nightmare Before Christmas"?', 'Lock, Shock and Barrel', 'Zero', 'Sally', 'The Mayor'],
  ['What is the name of the town in "Stranger Things"?', 'Hawkins', 'Derry', 'Haddonfield', 'Woodsboro'],
  ['What creepy feature does Winifred\'s spell book have in "Hocus Pocus"?', 'An eye', 'A mouth', 'A hand', 'A nose'],
  ['Which professor hunts Dracula in the novel?', 'Van Helsing', 'Victor Frankenstein', 'Ichabod Crane', 'Moriarty'],
  ['What year did the original "Ghostbusters" come out?', '1984', '1979', '1990', '1995'],
  ['Which Disney Channel movie has Marnie discover a town full of monsters?', 'Halloweentown', 'Twitches', 'Hocus Pocus', 'Monster House'],
  ['Which dwarf planet is named for the Roman god of the underworld?', 'Pluto', 'Ceres', 'Eris', 'Makemake'],
  ['Which of these is the heaviest spider in the world?', 'Goliath birdeater', 'Wolf spider', 'Black widow', 'Jumping spider'],
  ['What are baby spiders called?', 'Spiderlings', 'Spiderkits', 'Webbies', 'Pups'],
  ['In the classic ad, how many licks did Mr. Owl take to reach the Tootsie Pop center?', '3', '52', '100', '1,000'],
  ['In "Frankenweenie", what does Victor bring back to life?', 'His dog, Sparky', 'His cat', 'His goldfish', 'His turtle'],
  ['Which Tim Burton movie has Victor accidentally marrying a ghost bride?', 'Corpse Bride', 'Frankenweenie', 'Beetlejuice', 'Sleepy Hollow'],
];

export const EXPERT = [
  ['What does the word "Samhain" roughly mean?', 'Summer\'s end', 'Moon night', 'Ghost feast', 'Harvest king'],
  ['Which Roman goddess of fruit trees may have inspired bobbing for apples?', 'Pomona', 'Venus', 'Juno', 'Diana'],
  ['What is the black cat named in Poe\'s story "The Black Cat"?', 'Pluto', 'Midnight', 'Shadow', 'Salem'],
  ['What ship carries Dracula to England in the novel?', 'The Demeter', 'The Nautilus', 'The Flying Dutchman', 'The Mayflower'],
  ['Michael Myers\' mask in "Halloween" was made from a mask of which Star Trek character?', 'Captain Kirk', 'Spock', 'Scotty', 'Data'],
  ['Which 1922 silent film was one of the first vampire movies?', 'Nosferatu', 'Dracula', 'The Lost Boys', 'Vampyr Returns'],
  ['Michael Myers\' hometown in "Halloween" is...', 'Haddonfield', 'Hawkins', 'Derry', 'Woodsboro'],
  ['Pennywise haunts which Stephen King town?', 'Derry', 'Hawkins', 'Haddonfield', 'Salem'],
  ['Bobby Pickett sang "Monster Mash" doing an impression of which horror star?', 'Boris Karloff', 'Bela Lugosi', 'Vincent Price', 'Christopher Lee'],
  ['Who sang the "Ghostbusters" theme song?', 'Ray Parker Jr.', 'Michael Jackson', 'Huey Lewis', 'Prince'],
  ['What is the full title of Mary Shelley\'s famous novel?', 'Frankenstein; or, The Modern Prometheus', 'Frankenstein: The Living Dead', 'Frankenstein: A Monster\'s Tale', 'Frankenstein of Geneva'],
  ['Which real ruler is often linked to the Dracula legend?', 'Vlad the Impaler', 'Ivan the Terrible', 'Attila the Hun', 'Genghis Khan'],
  ['Transylvania is in which country today?', 'Romania', 'Hungary', 'Bulgaria', 'Germany'],
  ['Which Hogwarts ghost belongs to Ravenclaw?', 'The Grey Lady', 'The Bloody Baron', 'The Fat Friar', 'Nearly Headless Nick'],
  ['What is Madame Leota in Disney\'s Haunted Mansion?', 'A head in a crystal ball', 'A ghost bride', 'A talking portrait', 'A singing bust'],
  ['What is Luigi\'s ghost-catching vacuum called?', 'The Poltergust', 'The Ghost-o-Vac', 'The Spookinator', 'The Boo Buster'],
  ['Which Pokémon looks like a pumpkin?', 'Pumpkaboo', 'Oddish', 'Jigglypuff', 'Squirtle'],
  ['Who played Wednesday Addams in the 1990s movies?', 'Christina Ricci', 'Jenna Ortega', 'Winona Ryder', 'Kirsten Dunst'],
  ['Who sings Jack Skellington\'s songs in "The Nightmare Before Christmas"?', 'Danny Elfman', 'Tim Burton', 'Johnny Depp', 'Elton John'],
  ['How many people were hanged in the Salem witch trials?', '19', '3', '50', '200'],
  ['In Scotland, going door to door in costume is traditionally called...', 'Guising', 'Wassailing', 'Caroling', 'Haggising'],
  ['In old England, children went "souling" door to door for what?', 'Soul cakes', 'Candy corn', 'Toffee apples', 'Chocolate coins'],
  ['What was candy corn first sold as in the 1880s?', 'Chicken Feed', 'Corn Kisses', 'Harvest Drops', 'Pumpkin Pebbles'],
  ['Which Caribbean country\'s folklore gave us the zombie?', 'Haiti', 'Jamaica', 'Cuba', 'The Bahamas'],
  ['In "Gremlins", you must never feed a Mogwai after...', 'Midnight', 'Noon', 'Sunset', 'Dinner'],
  ['What is the name of the summer camp in "Friday the 13th"?', 'Camp Crystal Lake', 'Camp Green Lake', 'Camp Blackwood', 'Camp Redwood'],
  ['What is a group of ravens called?', 'An unkindness', 'A murder', 'A parliament', 'A colony'],
  ['What is Scooby-Doo\'s full first name?', 'Scoobert', 'Scoobington', 'Scoobias', 'Samuel'],
  ['What is Lydia\'s last name in "Beetlejuice"?', 'Deetz', 'Maitland', 'Adams', 'Crane'],
  ['Which ghost pirate haunts SpongeBob and friends?', 'The Flying Dutchman', 'Captain Hook', 'Blackbeard', 'Davy Jones'],
  ['What is the October full moon after the harvest moon called?', 'Hunter\'s moon', 'Wolf moon', 'Pink moon', 'Strawberry moon'],
  ['What is the smallest bone in the human body found in?', 'The ear', 'The toe', 'The nose', 'The finger'],
  ['What do you call a scientist who studies spiders?', 'An arachnologist', 'An entomologist', 'A herpetologist', 'An ornithologist'],
  ['In what year was King Tut\'s tomb discovered?', '1922', '1822', '1952', '1899'],
  ['On what night did Voldemort attack Harry Potter\'s parents?', 'Halloween', 'Christmas Eve', 'New Year\'s Eve', 'Harry\'s birthday'],
  ['Where in New Jersey is the Jersey Devil said to roam?', 'The Pine Barrens', 'Atlantic City', 'The Meadowlands', 'Cape May'],
  ['"Jack-o\'-lantern" was also an old name for what spooky sight?', 'Strange lights over swamps', 'Shooting stars', 'Glowing mushrooms', 'Foggy full moons'],
  ['What is a Día de los Muertos home altar for loved ones called?', 'An ofrenda', 'A calavera', 'A piñata', 'A fiesta'],
  ['What flower is used to guide spirits home on Día de los Muertos?', 'Marigolds', 'Roses', 'Tulips', 'Daisies'],
  ['What is the fear of Halloween called?', 'Samhainophobia', 'Pumpkinophobia', 'Halloweenophobia', 'Ghoulophobia'],
  ['What is nyctophobia the fear of?', 'The dark', 'Water', 'Heights', 'Ghosts'],
  ['Which director made "Psycho" in 1960?', 'Alfred Hitchcock', 'Steven Spielberg', 'Stanley Kubrick', 'John Carpenter'],
  ['What does Snoopy pretend to be in "It\'s the Great Pumpkin, Charlie Brown"?', 'A World War I flying ace', 'An astronaut', 'A pirate', 'A cowboy'],
  ['Pumpkins first grew in which part of the world?', 'The Americas', 'Europe', 'Africa', 'Asia'],
  ['Hocus Pocus: what must be lit to bring the Sanderson sisters back?', 'The Black Flame Candle', 'The Pumpkin Torch', 'The Witch\'s Lantern', 'The Midnight Match'],
];

export const LEVELS = [EASY, MEDIUM, HARD, EXPERT];
export const LEVEL_NAMES = ['Easy', 'Medium', 'Hard', 'Expert'];
export const QUESTIONS = [...EASY, ...MEDIUM, ...HARD, ...EXPERT];

/** The level (0 to 3) for question `index` of `count`: it climbs evenly through the game. */
export const levelFor = (index, count) => Math.min(LEVELS.length - 1, Math.floor((index * LEVELS.length) / Math.max(1, count)));

const shuffle = (list, rand) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Picks `count` questions that get harder as the game goes, with shuffled answers.
 * rand() returns [0, 1). `seen` holds question texts already shown on this TV; unseen ones go first.
 */
export function pickQuestions(rand, count = 12, seen = []) {
  const shown = new Set(seen);
  const queues = LEVELS.map((level) => {
    const fresh = shuffle(level.filter((q) => !shown.has(q[0])), rand);
    const old = shuffle(level.filter((q) => shown.has(q[0])), rand);
    return fresh.concat(old);
  });
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    let lv = levelFor(i, count);
    while (!queues[lv].length && lv > 0) lv -= 1;
    const q = queues[lv].shift() || queues.find((x) => x.length)?.shift();
    if (!q) break;
    const [text, right, ...wrong] = q;
    const answers = shuffle([right, ...wrong], rand);
    picked.push({ text, answers, correct: answers.indexOf(right), level: lv });
  }
  return picked;
}
