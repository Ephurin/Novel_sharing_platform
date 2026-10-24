import type { WalletEarnings } from './wallet-api';

export type PeriodType = '7' | '30' | '365';

type ChartDataPoint = {
  label: string;
  amount: number;
  heightPercent: number;
  highlight?: boolean;
};

export function makeChart(earnings: WalletEarnings, period: PeriodType) {
  const days = Number(period);
  const bucketCount = period === '7' ? 7 : period === '30' ? 6 : 12;
  const today = new Date(`${earnings.asOfDay}T00:00:00Z`);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const amounts = Array.from({ length: bucketCount }, () => 0);
  let previousTotal = 0;
  let unlockCoins = 0;
  let donateCoins = 0;
  for (const entry of earnings.daily) {
    const day = new Date(`${String(entry.day).slice(0, 10)}T00:00:00Z`);
    const offset = Math.floor((day.getTime() - start.getTime()) / 86400000);
    if (offset >= -days && offset < 0) previousTotal += entry.amountCoins;
    if (offset < 0 || offset >= days) continue;
    const bucket = Math.min(bucketCount - 1, Math.floor(offset * bucketCount / days));
    amounts[bucket] += entry.amountCoins;
    unlockCoins += entry.unlockCoins;
    donateCoins += entry.donateCoins;
  }
  const maxAmount = Math.max(1, ...amounts);
  const points: ChartDataPoint[] = amounts.map((amount, index) => {
    const bucketDay = new Date(start);
    bucketDay.setUTCDate(start.getUTCDate() + Math.ceil(index * days / bucketCount));
    return {
      label: bucketDay.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
      amount,
      heightPercent: amount / maxAmount * 100,
      highlight: index === bucketCount - 1
    };
  });
  return { points, total: unlockCoins + donateCoins, previousTotal, unlockCoins, donateCoins, maxAmount };
}
