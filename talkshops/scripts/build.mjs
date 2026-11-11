// Cloudflare Pages build for talkshops.app: writes public/config.js with the public Supabase settings.
// Talk Shops has its own Supabase project (database, sign-in, texting API). Set SUPABASE_URL and SUPABASE_ANON_KEY
// in the Cloudflare project's build variables to that project's values. The anon key is public; the API checks
// sign-in tokens itself. Without SUPABASE_URL this falls back to the old shared hood-league project.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || 'https://nkwedlskhnojseeroezm.supabase.co';
const anon = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || '';
const config = { supabaseUrl: url, supabaseAnonKey: anon, apiUrl: process.env.API_URL || `${url}/functions/v1/api` };
fs.writeFileSync(path.join(root, 'public', 'config.js'), `window.BAY_CONFIG = ${JSON.stringify(config)};\n`);
console.log(`Wrote public/config.js${anon ? '' : ' (WARNING: SUPABASE_ANON_KEY is not set, so shop sign-in will not work)'}`);
