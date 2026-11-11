import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gsmText, smsSegments, fitOne } from '../functions/_shared/smsFit.ts';
import { fillTemplate } from '../functions/_shared/shop.ts';
import { SAY } from '../functions/_shared/shopGrow.ts';

const LINK = 'https://talkshops.app/?c=';
const TOKEN = 'Ab3dEf6hIj9kLm2nOp5q'; // new tokens are 20 characters
const STAGES = ['invited', 'checked_in', 'diagnosing', 'approval', 'parts', 'in_progress', 'qc', 'ready', 'picked_up'] as const;

test('plain characters: curly quotes, dashes, bullets, emoji and Spanish accents never force Unicode billing', () => {
  assert.equal(gsmText('We’re “done” — pick up… 🚗 now • thanks'), 'We\'re "done" - pick up... now - thanks');
  assert.equal(gsmText('Responda STOP para no recibir más mensajes. ¿Cómo está? Vehículo listo, señor'), 'Responda STOP para no recibir mas mensajes. ¿Como esta? Vehiculo listo, señor');
  assert.equal(smsSegments('a'.repeat(160)), 1);
  assert.equal(smsSegments('a'.repeat(161)), 2);
  assert.equal(smsSegments('a'.repeat(159) + '€'), 2); // extended characters count double
  assert.equal(smsSegments('’' + 'a'.repeat(69)), 1);
  assert.equal(smsSegments('’' + 'a'.repeat(70)), 2); // one curly quote: 70-character segments
  assert.equal(fitOne(['x'.repeat(200), 'short one']), 'short one');
});

function job(lang: 'en' | 'es', name: string, year: string, make: string, model: string) {
  return {
    id: 'j', shopId: 's', token: TOKEN, stage: 'ready', createdAt: '', updatedAt: '', bill: null,
    data: { customer: { name, phone: '+15555550100', lang, consent: true }, vehicle: { year, make, model }, eta: 'Thursday afternoon',
      estimate: [{ id: 'a', item: 'Brakes', price: 1234.56, status: 'approved' }], photos: [], events: [], messages: [], approval: null },
  } as any;
}

test('every stage text fits one segment, even with a long shop name, vehicle, hours and customer name', () => {
  const shops = [
    { name: 'Ridgeline Auto Repair', hours: 'Mon-Fri 8-5' },
    { name: 'Chippewa Valley Collision & Automotive Service Center', hours: 'Monday through Friday 7:30am to 5:30pm, Saturday 8am to noon' },
  ];
  const jobs = [job('en', 'Maria Lopez', '2018', 'Honda', 'Civic'), job('en', 'Christopher Montgomery', '2019', 'Chevrolet', 'Silverado 2500HD LTZ Crew Cab'),
    job('es', 'José Hernández', '2015', 'Toyota', 'Camry'), job('es', 'Maximiliano Rodríguez', '2021', 'Mercedes-Benz', 'Sprinter 3500XD Cargo')];
  for (const shop of shops) for (const j of jobs) for (const stage of STAGES) {
    const text = gsmText(fillTemplate(stage, shop as any, j, LINK));
    assert.equal(smsSegments(text), 1, `${stage} (${text.length}): ${text}`);
    if (['invited', 'checked_in', 'approval', 'ready'].includes(stage)) assert.ok(text.includes(LINK + TOKEN), `${stage} keeps the link`);
  }
});

test('walk-around, walk-through, booking and review texts fit one segment', () => {
  for (const say of [SAY.en, SAY.es]) for (const shop of ['Ridgeline Auto Repair', 'Chippewa Valley Collision & Automotive Service']) {
    const car = '2019 Chevrolet Silverado 2500HD';
    for (const t of [say.walkaround(shop, car, LINK + TOKEN), say.walk(shop, 'after', car, 14, 3, 2, LINK + TOKEN),
      say.booked('Christopher', shop, 'Tue, Nov 12 at 8:30 AM', LINK + TOKEN), say.review('Christopher', shop, 'https://g.page/r/CdA1b2C3d4E5f6g7/review')])
      assert.equal(smsSegments(gsmText(t)), 1, `${t.length}: ${t}`);
  }
});
