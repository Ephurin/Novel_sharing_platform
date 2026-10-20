import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeChart } from '../src/features/wallet/wallet-earnings.ts';

const asOfDay = '2026-10-20';
function day(offset) {
  const date = new Date(`${asOfDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

for (const period of ['7', '30', '365']) {
  test(`${period} days: calendar boundaries, previous period and source totals`, () => {
    const days = Number(period);
    const entries = [
      { day: day(-2 * days), amountCoins: 999, unlockCoins: 999, donateCoins: 0 },
      { day: day(-2 * days + 1), amountCoins: 30, unlockCoins: 0, donateCoins: 30 },
      { day: day(-days), amountCoins: 20, unlockCoins: 20, donateCoins: 0 },
      { day: day(-days + 1), amountCoins: 100, unlockCoins: 100, donateCoins: 0 },
      { day: asOfDay, amountCoins: 200, unlockCoins: 0, donateCoins: 200 },
      { day: day(1), amountCoins: 999, unlockCoins: 999, donateCoins: 0 }
    ];
    const chart = makeChart({ asOfDay, timeZone: 'Asia/Bangkok', totalEarnedCoins: 2348, daily: entries }, period);
    assert.equal(chart.total, 300);
    assert.equal(chart.previousTotal, 50);
    assert.equal(chart.unlockCoins, 100);
    assert.equal(chart.donateCoins, 200);
    assert.equal(chart.points.reduce((sum, point) => sum + point.amount, 0), chart.total);
    assert.ok(chart.points.every(point => Number.isFinite(point.heightPercent) && point.heightPercent <= 100));
  });
}

test('empty ledger has zero bars and no invented earnings', () => {
  const chart = makeChart({ asOfDay, timeZone: 'Asia/Bangkok', totalEarnedCoins: 0, daily: [] }, '7');
  assert.equal(chart.total, 0);
  assert.equal(chart.previousTotal, 0);
  assert.equal(chart.points.length, 7);
  assert.ok(chart.points.every(point => point.amount === 0 && point.heightPercent === 0));
});
