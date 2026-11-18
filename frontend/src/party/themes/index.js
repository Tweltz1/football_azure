// Every Games Night theme except Halloween ('spooky'), whose lists live in quizQuestions.js, mashPrompts.js
// and maskWords.js. Each set: levels (4 quiz levels, easy to expert), categories (Behind the Mask words),
// prompts and finals (Mash-up). To add a holiday: add a file here, a date window in ../season.js, and its labels there.
import thanksgiving from './thanksgiving.js';
import christmas from './christmas.js';
import newyear from './newyear.js';
import valentines from './valentines.js';
import stpatricks from './stpatricks.js';
import easter from './easter.js';
import july4 from './july4.js';
import classic from './classic.js';

export const THEME_SETS = { thanksgiving, christmas, newyear, valentines, stpatricks, easter, july4, classic };
