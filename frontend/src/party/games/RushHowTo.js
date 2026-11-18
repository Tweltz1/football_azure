import React, { useMemo } from 'react';
import { sfx } from '../sound';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';
import { RushScene } from './RushStage';
import { BELT, JOBS, JOB_INFO, OPTIONS, ZONES } from './giftRush';
import { choiceArt } from './giftArt';

// Gift Wrap Rush's how-to-play intro: two presents ride the belt; one is perfect, one gets the wrong paper.

export const HOWTO_MS = 33000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: "Welcome to Gift Wrap Rush! Santa's workshop needs your help." },
  { at: 5000, step: '1', title: 'Toys ride the belt past four stations: Box, Wrap, Bow and Tag.', say: 'Toys ride the belt past four stations. Box, wrap, bow, and tag.' },
  { at: 10500, step: '2', title: 'Your phone shows your station. The card over each present says what it needs.', say: 'Your phone shows your station. The card over each present says what it needs.' },
  { at: 16500, step: '3', title: 'When a present reaches your part of the belt, tap the right one. Fast!', say: 'When a present reaches your part of the belt, tap the right choice. Fast!' },
  { at: 22000, step: '4', title: 'Perfect presents fly onto the sleigh. Mistakes go in the coal bin!', say: 'Perfect presents fly onto the sleigh. Mistakes go in the coal bin!' },
  { at: 29500, step: '', title: 'Wrap it up!', say: 'Three rounds, faster every time. Wrap it up!' },
];

const SPEED = 100;
const mid = (job) => (ZONES[job][0] + ZONES[job][1]) / 2;
const DEMO = [
  { id: 1, toy: 'bear', start: 5000, order: { box: 'cube', wrap: 'red', bow: 'white', tag: 'nana' }, wrong: null },
  { id: 2, toy: 'train', start: 9000, order: { box: 'long', wrap: 'green', bow: 'red', tag: 'baby' }, wrong: { job: 'wrap', pick: 'blue' } },
];
const at = (d, job) => d.start + ((mid(job) - BELT.x0) / SPEED) * 1000;
const endAt = (d) => d.start + ((BELT.end - BELT.x0) / SPEED) * 1000;

const present = (d, t) => {
  if (t < d.start) return null;
  const p = { id: d.id, toy: d.toy, order: d.order, at: d.start, x: BELT.x0 + ((t - d.start) / 1000) * SPEED, done: {}, wrong: {}, missed: {}, fate: null, fateAt: 0 };
  JOBS.forEach((j) => {
    if (t < at(d, j)) return;
    if (d.wrong && d.wrong.job === j) { p.done[j] = d.wrong.pick; p.wrong[j] = true; } else p.done[j] = d.order[j];
  });
  if (t >= endAt(d)) {
    p.x = BELT.end;
    p.fate = d.wrong ? 'coal' : 'sleigh';
    p.fateAt = endAt(d);
    if (t - p.fateAt > 800) return null;
  }
  return p;
};

export default function RushHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 4);
  const cues = [];
  DEMO.forEach((d) => {
    JOBS.forEach((j) => cues.push([`${d.id}${j}`, at(d, j), d.wrong && d.wrong.job === j ? sfx.fizzle : sfx.hit]));
    cues.push([`${d.id}end`, endAt(d), d.wrong ? sfx.candle : sfx.banish]);
  });
  cues.push(['end', 29600, sfx.won]);
  useCues(t, cues);

  const presents = DEMO.map((d) => present(d, t)).filter(Boolean)
    .map((p) => ({ ...p, at: startedAt + p.at, fateAt: startedAt + p.fateAt }));
  const flashes = [];
  DEMO.forEach((d) => JOBS.forEach((j) => {
    if (t >= at(d, j) && t < at(d, j) + 700) flashes.push({ present: d.id, ok: !(d.wrong && d.wrong.job === j), at: startedAt + at(d, j) });
  }));
  const elves = JOBS.map((j, i) => {
    const hit = DEMO.find((d) => t >= at(d, j) && t < at(d, j) + 500);
    let pose = hit ? (hit.wrong && hit.wrong.job === j ? 'scared' : 'throw') : 'stand';
    if (t > 29500) pose = 'cheer';
    return { key: j, x: mid(j), y: 1025, look: cast[i].look, name: cast[i].name, pose, delay: i, jobs: [j] };
  });
  const delivered = t >= endAt(DEMO[0]) + 700 ? 1 : 0;
  const showPhone = between(t, 10800, 16500);
  const wrapButtons = useMemo(() => OPTIONS.wrap.map((o) => ({ ...o, svg: choiceArt('wrap', o.id) })), []);

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Gift Wrap Rush" onSkip={onSkip}>
      <RushScene presents={presents} elves={elves} delivered={delivered} now={now} speed={SPEED} flashes={flashes} />
      {showPhone && (
        <div className="lq-demo-phone lh-demo-phone" style={{ transform: `translateY(${(1 - ease((t - 10800) / 500)) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[1].name}&apos;s phone</div>
          <div className="gr-station is-live">
            <h3>{JOB_INFO.wrap.icon} {JOB_INFO.wrap.label}</h3>
            <div className="gr-picks">
              {wrapButtons.map((o) => (
                <span key={o.id} className="gr-pick is-compact">
                  <svg viewBox="-48 -44 96 88" dangerouslySetInnerHTML={{ __html: o.svg }} />
                  <span>{o.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </HowToFrame>
  );
}
