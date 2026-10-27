// Many ways people word the same fantasy question, for the chat bar's phrasebook test. Each intent lists
// phrasings with slots the test fills from its league: {A} and {B} are players on your team, {O} a player
// on another team, {W} a player on waivers, {POS} a position word, {P} a position's short form (qb, rb, wr, te)
// and {TEAM} another team in the league.
// KINDS says which kinds of answer fit each intent (the answer's data-kind).

export const PHRASEBOOK = {
  lineup: [
    'who do i start this week', 'set my lineup for me', 'whats the best lineup i can put out', 'who should be in my lineup',
    'help me with my lineup', 'can you optimize my starters', 'who should i put at flex', 'who goes in my flex spot',
    'which {POS} should i start', 'who is my best {POS} this week', 'who should start at {POS} for me', 'my lineup good?',
    'is my lineup right', 'did i set my lineup right', 'any changes to my lineup', 'who should i sit this week',
    'who should i bench this week', 'whats my projected score this week', 'how many points will my team score',
    'who should i start at superflex', 'what lineup gives me the most points', 'give me my optimal lineup',
    'who are my starters supposed to be', 'flex options?', 'who should i flex', 'which kicker do i start',
    'what defense should i start', 'who do i put in at {POS}', 'start em sit em for my team', 'lineup advice',
  ],
  startOne: [
    'should i start {A}', 'is {A} a start', 'start or sit {A}', '{A} start or sit', 'do i play {A} this week',
    'is {A} worth starting', 'should {A} be in my lineup', 'can i trust {A} this week', 'is {A} startable',
    'should i bench {A}', 'is {A} a must start', 'would you start {A}', 'is {A} a good play this week', 'is {A} a flex play',
    'is {A} going to have a good game', 'how many points will {A} score', 'what is {A} projected for', 'should i sit {A} this week',
    'is it safe to start {A}', '{A} this week?', 'thoughts on {A} this week', 'is {A} a sleeper this week', 'is {A} a bust this week',
    'do you like {A} this week', 'confidence in {A}?',
  ],
  startTwo: [
    'start {A} or {B}', '{A} or {B}', '{A} vs {B}', 'who should i start {A} or {B}', 'who do i flex {A} or {B}',
    'should i play {A} over {B}', 'is {A} better than {B} this week', 'sit {B} start {A}?', 'which one {A} or {B}',
    'who scores more {A} or {B}', 'who has the better matchup {A} or {B}', '{A} or {B} in ppr', 'help me pick {A} or {B}',
    'torn between {A} and {B}', 'cant decide {A} or {B}', 'who has more upside {A} or {B}', 'who is safer {A} or {B}',
    'who has the higher floor {A} or {B}', 'would you rather start {A} or {B}', 'who should i flex between {A} and {B}',
  ],
  injury: [
    'is {A} hurt', 'is {A} injured', 'is {A} playing this week', 'whats {A} status', 'when is {A} coming back', 'is {A} out',
    'whats the injury update on {A}', 'will {A} play sunday', 'is {A} healthy', 'is {A} questionable', 'any news on {A}',
    'whats going on with {A}', 'is {A} active this week', 'how long is {A} out', 'when does {A} return', 'is {O} hurt',
    'who is hurt on my team', 'any injuries on my team', 'who on my roster is injured', 'is anyone on my team out this week',
  ],
  replace: [
    '{A} is out who do i start instead', 'who replaces {A}', 'who do i start if {A} cant play', 'who fills in for {A}',
    'replacement for {A}?', 'who should i play instead of {A}', 'if {A} sits who starts', '{A} is hurt now what',
    'need someone to replace {A}', 'who takes {A} spot in my lineup',
  ],
  bye: [
    'who is on a bye', 'who on my team has a bye this week', 'when are my players bye weeks', 'any byes this week',
    'which of my guys are on bye', 'when is {A} bye week', 'does {A} have a bye this week', 'bye week problems?',
    'who do i start with {A} on bye', 'what weeks am i short on players because of byes',
  ],
  needs: [
    'what does my team need', 'where is my team weak', 'whats my weakest position', 'what position should i upgrade',
    'where am i thin', 'what are my teams weaknesses', 'what are my teams strengths', 'do i need a {POS}', 'is my {POS} room good enough',
    'how deep is my bench', 'what am i missing', 'where do i have holes', 'what does {TEAM} need', 'where is {TEAM} weak',
    'which position is my strongest',
  ],
  pickup: [
    'who should i pick up', 'who is on the waiver wire', 'best waiver pickups', 'any good free agents', 'who should i add',
    'who should i grab off waivers', 'best available {POS}', 'any {POS} worth picking up', 'who should i stream at {POS}',
    'who is the best defense to stream', 'kicker to pick up?', 'waiver wire targets', 'who should i claim', 'anyone good on waivers',
    'who is the top free agent', 'best pickup this week', 'should i pick up {W}', 'is {W} worth an add', 'is {W} available',
    'who should i put a claim on', 'deep sleeper pickups', 'who is everyone adding', 'any handcuffs on waivers',
  ],
  drop: [
    'who should i drop', 'who is my worst player', 'who can i cut', 'who should i release', 'should i drop {A}', 'is {A} droppable',
    'cut {A}?', 'who is the least valuable guy on my roster', 'who can go to make room', 'who should i drop for {W}',
  ],
  trade: [
    'trade {A} for {O}', 'should i trade {A} for {O}', 'would you trade {A} for {O}', '{A} for {O} fair?', 'is {A} for {O} a good trade',
    'i got offered {O} for {A}', 'someone offered me {O} for {A} should i accept', 'should i accept {A} for {O}', 'does {A} for {O} help me',
    'what can i get for {A}', 'who can i trade {A} for', 'how do i get {O}', 'what would it take to get {O}', 'trade {A} and {B} for {O}',
    'is {A} plus {B} for {O} fair', 'would {TEAM} take {A} for {O}', 'who should i trade', 'any trades i should make', 'find me a trade',
    'who should i trade for', 'what trades help my team', 'who wants {A}', 'should i sell {A}', 'should i buy {O}', 'buy low candidates',
    'sell high candidates', 'who are some buy low targets', 'who should i sell high on',
  ],
  stats: [
    'how is {A} doing', '{A} stats', 'how has {A} been playing', '{A} last 3 games', 'how many targets does {A} get',
    'what is {A} averaging', '{A} snap share', 'how many carries does {A} get', 'is {A} trending up', 'tell me about {A}',
    'whats {A} ppg', 'how good is {A}', 'whats {A} been doing lately', '{A} usage', 'how many touches is {A} getting',
    'whats {O} averaging', 'has {A} been good', 'what happened to {A}', 'is {A} a bust', 'how is {O} doing this year',
  ],
  value: [
    'what is {A} worth', 'whats {A} trade value', '{A} rest of season', 'should i keep {A}', 'should i hold {A}',
    'is {A} a buy low', 'is {A} a sell high', 'what is {A} value rest of season', 'is {A} going to be good the rest of the year',
    'long term outlook for {A}', 'is {A} worth holding', 'what is {O} worth', '{A} dynasty value', 'should i sell {A} now',
  ],
  rankings: [
    'top 10 {POS} this week', 'who are the best {POS} this week', 'rank the {POS}', '{POS} rankings', 'who is the {P}1',
    'top {POS} rest of season', 'best {POS} in the league', 'who are the top 5 {POS}', 'show me {POS} rankings', 'top {POS} available',
  ],
  rank: [
    'where does {A} rank', 'what is {A} ranked', 'is {A} a {P}1', 'what tier is {A}', '{A} ranking this week', 'how high is {A} ranked',
  ],
  matchup: [
    'who does {A} play this week', 'is {A} a good matchup', 'what is {A} matchup', 'who is {A} facing', 'how tough is {A} matchup',
    'is the defense {A} faces good', 'does {A} have a tough matchup', '{A} matchup this week', 'who has the best matchups this week',
    'easiest matchups this week', 'which defenses are worst against {POS}', 'who gives up the most points to {POS}',
    'toughest matchups on my team',
  ],
  schedule: [
    'how does {A} schedule look', '{A} upcoming schedule', 'who does {A} play next few weeks', 'is {A} schedule easy', '{A} next 4 games',
    'does {A} have a good playoff schedule',
  ],
  league: [
    'what are my playoff odds', 'will i make the playoffs', 'what are my chances to win the league', 'power rankings', 'who is the best team',
    'rank all the teams', 'who is the worst team', 'standings?', 'whats my record', 'who am i playing this week', 'will i win this week',
    'whats my chance to win my matchup', 'who is my opponent', 'am i going to finish last', 'toilet bowl odds', 'odds to win the title',
    'how is my team doing', 'how good is {TEAM}', 'what are {TEAM} playoff odds', 'is {TEAM} a contender',
  ],
  plan: [
    'how do i make my team better', 'what should i do to win', 'help me win my league', 'my team sucks what do i do', 'any advice',
    'how can i improve', 'what moves should i make', 'give me tips', 'what should i do this week', 'how do i fix my team',
  ],
  handcuff: [
    'who is {A} handcuff', 'who is {A} backup', 'do i need {A} handcuff', 'who backs up {A}', 'should i get {A} backup',
  ],
  trending: [
    'who is hot on my team', 'who is cold on my team', 'who is struggling', 'who is underperforming', 'who is on fire',
    'who is trending up', 'who is trending down', 'any breakouts', 'who has disappointed', 'who is in a slump',
  ],
  best: ['who is my best player', 'who is my mvp', 'whats my most valuable player'],
  weakest: ['who is my weakest starter', 'whats my weak link', 'who is my worst starter'],
  bench: ['who is on my bench', 'how is my bench', 'show my bench'],
  help: ['help', 'what can you do', 'what can i ask', 'how does this work', 'examples'],
  smalltalk: ['hi', 'hey', 'thanks', 'thank you', 'good morning', 'cool', 'nice'],

  // Kinds of questions the chat used to miss.
  news: [
    'why did {A} get benched', 'why did {A} score so low', 'why was {A} bad last week', 'what happened to {A} last week',
    'is {A} losing his job', 'is {A} still the starter', 'did {A} get demoted', 'is {A} in a timeshare', 'is {A} the lead back',
    'why isnt {A} getting the ball', 'is {A} being phased out', 'did {A} lose snaps', 'whats the latest on {A}', 'any {A} news',
    'is {A} going to get more work', 'is {A} getting more targets lately',
  ],
  opinion: [
    'should i tank', 'is my season over', 'am i a contender', 'am i a playoff team', 'should i rebuild', 'should i go all in',
    'should i panic', 'am i good', 'is my team good', 'is my team bad', 'how screwed am i', 'can i still make the playoffs',
    'is it time to sell', 'should i be buying or selling', 'do i have a chance', 'what if i lose this week', 'what if {A} gets hurt',
    'what if i trade {A}', 'am i the favorite', 'should i be worried about my team',
  ],
  rules: [
    'how many teams make the playoffs', 'when do playoffs start', 'what week do the playoffs start', 'is this ppr', 'what is our scoring',
    'how is scoring set up', 'how many points per reception', 'what are the lineup spots', 'how many flex spots do we have',
    'is this a superflex league', 'how many teams are in the league', 'how many starters do we have', 'how many weeks are left',
    'what week is it', 'when is the regular season over', 'when is the trade deadline', 'whats our trade deadline',
    'is the trade deadline passed',
  ],
  weather: [
    'whats the weather for {A}', 'is it raining in the {A} game', 'will weather affect {A}', 'any snow this week',
    'which games have bad weather', 'whats the forecast for {A} this week', 'is {A} playing in a dome', 'is {A} indoors',
    'will wind be a problem for {A}', 'any of my guys in bad weather', 'is there rain in any games this week', 'weather report',
    'should i worry about weather for {A}', 'cold weather games this week',
  ],
  vegas: [
    'what is the vegas line for {A}', 'what is the spread for the {A} game', 'is {A} team favored', 'what is the over under for {A}',
    'which games have the highest totals', 'what are the vegas odds this week', 'is {A} an underdog', 'what is {A} implied total',
    'which games will be a shootout', 'highest scoring games this week', 'betting lines this week', 'whats the point total for {A} game',
  ],
  headlines: [
    'any news', 'whats the latest news', 'news on my players', 'any headlines about my team', 'latest headlines',
    'whats the latest on my guys', 'any {A} news', 'news on {A}', 'headlines for {A}',
  ],
  about: [
    'who are you', 'are you ai', 'are you a bot', 'how do you work', 'where do your numbers come from', 'how do you make projections',
    'are you better than espn', 'how smart are you', 'who made you', 'are you chatgpt', 'can i trust you', 'you suck', 'you are wrong',
    'that was a bad answer', 'good job', 'love this', 'tell me a joke', 'whats up', 'how are you',
  ],
  multi: [
    'should i start {A} and who should i pick up', 'is {A} hurt and who replaces him', 'who should i drop and who should i add',
    'start {A} or {B} and is {O} worth trading for', 'who is on bye and who do i start instead', 'how is {A} doing and should i trade him',
    'who should i start? also who should i pick up?', 'is {A} playing. if not who do i start',
  ],
};

export const KINDS = {
  lineup: ['lineup', 'bye', 'replace', 'rankings'],
  startOne: ['player', 'compare', 'lineup', 'injury', 'replace', 'stats'],
  startTwo: ['compare', 'comparefloor', 'compareceiling', 'comparevalue', 'player'],
  injury: ['injury', 'teaminjuries', 'replace', 'news'],
  replace: ['replace', 'lineup', 'compare', 'injury'],
  bye: ['bye', 'lineup', 'replace'],
  needs: ['needs', 'plan', 'weakest', 'bench'],
  pickup: ['pickup', 'availability', 'rankings', 'handcuff'],
  drop: ['drop', 'pickup', 'availability'],
  trade: ['trade', 'buylow', 'sellhigh', 'value'],
  stats: ['stats', 'player', 'rank', 'value', 'trending', 'news'],
  value: ['value', 'trade', 'stats'],
  rankings: ['rankings'],
  rank: ['rank', 'rankings'],
  matchup: ['matchup', 'schedule', 'matchuplist', 'defenses'],
  schedule: ['schedule', 'matchup'],
  league: ['league'],
  plan: ['plan', 'needs', 'lineup', 'weakest'],
  handcuff: ['handcuff'],
  trending: ['trending', 'stats'],
  best: ['best'],
  weakest: ['weakest'],
  bench: ['bench'],
  help: null,
  smalltalk: null,
  news: ['news', 'injury'],
  opinion: ['league', 'plan', 'replace', 'trade', 'value', 'injury'],
  rules: ['rules'],
  weather: ['weather'],
  vegas: ['vegas'],
  headlines: ['news'],
  about: null,
  multi: null,
};
