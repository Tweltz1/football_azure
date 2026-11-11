// Cloudflare Pages build for talkshops.app: writes public/config.js with the public Supabase settings.
// Talk Shops has its own Supabase project (ref evpcfkasnbpoajkpltch): database, sign-in and the shop API.
// Its URL and publishable key are public (they ship in the website), so they are the defaults here. The older
// SUPABASE_URL / SUPABASE_ANON_KEY build variables pointed at the shared hood-league project and are ignored;
// TALKSHOPS_SUPABASE_URL / TALKSHOPS_SUPABASE_ANON_KEY / TALKSHOPS_API_URL override for a test project.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = process.env.TALKSHOPS_SUPABASE_URL || 'https://evpcfkasnbpoajkpltch.supabase.co';
const anon = process.env.TALKSHOPS_SUPABASE_ANON_KEY || 'sb_publishable_o9TSIXd0LVAGCycmr-Pt9A_a2FVBA_k';
const config = { supabaseUrl: url, supabaseAnonKey: anon, apiUrl: process.env.TALKSHOPS_API_URL || `${url}/functions/v1/api` };
fs.writeFileSync(path.join(root, 'public', 'config.js'), `window.BAY_CONFIG = ${JSON.stringify(config)};\n`);
console.log(`Wrote public/config.js${anon ? '' : ' (WARNING: SUPABASE_ANON_KEY is not set, so shop sign-in will not work)'}`);
