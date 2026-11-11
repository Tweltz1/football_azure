# Curbsy photo naming check

Curbsy names a posted item with Gemini (`geminiJunkDetector` in `supabase/functions/_shared/junk.ts`). Gemini is
a hosted model, so it can't be retrained; what we can improve is its instructions (`DETECT_SYSTEM`): category
definitions, condition definitions, examples and rules for common mistakes.

`eval.mjs` scores the current instructions against an older set (`prompt-2026-11-10.txt`) on public photos from
Wikimedia Commons (`cases.json`: a search, the expected category, words the title should use, and whether it
should be allowed). Run it from the Actions tab (`curbsy-detect-eval.yml`, needs the `GEMINI_API_KEY` GitHub
secret) or locally:

    GEMINI_API_KEY=... node ml/curbsy-detect-eval/eval.mjs

When people fix a name or category in the app and the same mistake keeps coming up, add a rule or example to
`DETECT_SYSTEM` and a case here, then run the check before shipping.
