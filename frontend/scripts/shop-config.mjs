// Writes build/shop/config.js for the repair shop app (/shop/), a plain page outside the React app,
// from the same public Supabase settings the React app is built with. Runs after `react-scripts build`.
import fs from 'fs';
import path from 'path';

const url = process.env.REACT_APP_SUPABASE_URL || '';
const config = {
  supabaseUrl: url,
  supabaseAnonKey: process.env.REACT_APP_SUPABASE_ANON_KEY || '',
  apiUrl: process.env.REACT_APP_API_URL || (url ? `${url}/functions/v1/api` : ''),
};
const out = path.join(process.cwd(), 'build', 'shop', 'config.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `window.BAY_CONFIG = ${JSON.stringify(config)};\n`);
console.log(`Wrote ${out}${url ? '' : ' (no Supabase URL set)'}`);
