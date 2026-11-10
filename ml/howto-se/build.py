"""Builds the free "answered by other mechanics" library for How-to from Mechanics Stack Exchange.

Content: mechanics.stackexchange.com questions and answers, CC BY-SA 4.0, by their authors (each answer keeps its
author, profile link and question link). Source copy: HuggingFaceH4/stack-exchange-preferences (question, answers,
authors) joined with flax-sentence-embeddings/stackexchange_title_body_jsonl (titles). Changes: HTML removed,
answers shortened. Output goes to talkshops/public/se/ (served as static files, no database):
  index.json   [[id, title, words]] for the search in howto.js
  a/<n>.json   {id: {q, url, answers: [{by, profile, score, text}]}} where n = id % 64

  python3 ml/howto-se/build.py <stack-exchange-preferences mechanics parquet> <title_body jsonl.gz>
"""
import gzip, html, json, os, re, sys
from html.parser import HTMLParser
import pyarrow.parquet as pq

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'talkshops', 'public', 'se')
STOP = set('a an the and or but if of to in on at for with by from is are was were be been am do does did i my me we our you your it its this that these those what which who how why when where can could should would will just have has had not no so as up out about into than then there here very any some'.split())

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.out = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'br', 'li', 'h1', 'h2', 'h3', 'pre', 'blockquote', 'tr'): self.out.append('\n')
        if tag == 'li': self.out.append('- ')
        if tag == 'img': self.out.append('[picture]')
    def handle_data(self, d): self.out.append(d)
def plain(h):
    p = Text(); p.feed(h or ''); t = html.unescape(''.join(p.out))
    t = re.sub(r'[ \t]+', ' ', t); t = re.sub(r'\n\s*\n+', '\n\n', t)
    return t.strip()
def words(t):
    return [w for w in re.findall(r'[a-z0-9]+', t.lower()) if w not in STOP and len(w) > 1]
def key(t):
    return re.sub(r'[^a-z0-9]', '', plain(t).lower())[:120]

def main(parquet, titles_gz):
    titles = {}
    with gzip.open(titles_gz, 'rt') as f:
        for line in f:
            title, body = json.loads(line)['texts'][:2]
            titles[re.sub(r'[^a-z0-9]', '', body.lower())[:120]] = title
    rows = pq.read_table(parquet).to_pylist()
    index, shards, kept, skipped = [], {}, 0, {'no title': 0, 'no good answer': 0}
    for r in rows:
        title = titles.get(key(r['question']))
        if not title: skipped['no title'] += 1; continue
        qwords = set(words(title + ' ' + plain(r['question'])))
        good = []
        for a in sorted(r['answers'], key=lambda a: (-a['selected'], -a['pm_score'])):
            text = plain(a['text'])
            # Some answers in this copy belong to another question: keep only answers that share words with it.
            shared = len(qwords & set(words(text)))
            if a['pm_score'] < 2 or len(text) < 60 or shared < 3: continue
            if len(text) > 2500: text = text[:2500].rsplit(' ', 1)[0] + ' ...'
            good.append({'by': a['author'], 'profile': a['author_profile'], 'score': a['pm_score'], 'accepted': bool(a['selected']), 'text': text})
            if len(good) == 2: break
        if not good: skipped['no good answer'] += 1; continue
        qid = int(r['qid'])
        meta = r['metadata'] if isinstance(r['metadata'], list) else []
        url = next((m for m in meta if '/questions/' in m), 'https://mechanics.stackexchange.com/questions/%d' % qid)
        index.append([qid, title, ' '.join(sorted(set(words(title))))])
        q = plain(r['question'])
        shards.setdefault(qid % 64, {})[qid] = {'q': q[:600] + (' ...' if len(q) > 600 else ''), 'url': url, 'answers': good}
        kept += 1
    os.makedirs(os.path.join(OUT, 'a'), exist_ok=True)
    with open(os.path.join(OUT, 'index.json'), 'w') as f: json.dump(index, f, separators=(',', ':'))
    for n, s in shards.items():
        with open(os.path.join(OUT, 'a', '%d.json' % n), 'w') as f: json.dump(s, f, separators=(',', ':'))
    print('kept', kept, 'of', len(rows), skipped)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
