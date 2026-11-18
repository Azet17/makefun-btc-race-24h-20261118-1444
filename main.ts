// Dip-recovery bot for btc-race-24h-20261118-1444.
//
// Dev-window read (24h ending at the open, 1,440 1-minute cbBTC bars):
// buy-and-hold loses -280 bps, the range is only 335 bps peak to trough,
// and 1-minute volatility is tiny (stdev 6.7 bps). There is exactly one
// tradeable event: a -264 bps washout in the first ~70 bars that rebounds
// +162 bps over the next two hours, then a slow grind down for the rest
// of the day. Momentum and EMA-cross bots whipsaw in that chop; a bot
// that sits in cash and only buys a washout that has already stopped
// falling banks the rebound and stays out of the grind.
//
// Entry — a washout that has stopped falling (decided on a bar's close,
// filled at the next bar's open):
//   * the close is at least DROP_BPS below the rolling HIGH_BARS-bar high,
//   * it sits at least BELOW_EMA_BPS below its EMA_TREND-bar EMA (a real
//     stretch below trend, not a wiggle near the highs), and
//   * the fall is over: the last 3 bars together are flat or better and
//     the latest bar did not close down (MOD_BPS / LAST_BPS).
// Entry B — a second, looser dip tier: the same stabilisation test, but
// only DROP2_BPS below the rolling high and BELOW2_EMA_BPS below trend,
// so it also catches the smaller second dip the window holds (a -55 bps
// dip that rebounds +139 bps from its fill). Tier B is cut off at
// TIER2_CUTOFF_SEQ: late-window dips in this falling market have no
// rebound left before the final flatten and are negative-EV after costs.
// Entry C — late safety net: if nothing has traded by LATE_BAR and the
// price sits well below its long EMA with stabilising bars, buy once, so
// the bot still makes its 1 guardrail trade on a race window with no
// washout. It never fires after entry A traded, and no entry is taken in
// the last 60 bars (ENTRY_CUTOFF_SEQ): a buy that late has no time for
// its rebound before the final flatten and is negative-EV after costs.
//
// Exit — whole position, checked every bar while holding:
//   * take-profit at TP_BPS over cost, or
//   * stop-loss at STOP_BPS under cost, or
//   * trailing fade: once the trade peaked at least PEAK_BPS over cost,
//     exit when it gives back TRAIL_BPS from that peak, or
//   * time stop after HOLD_MAX bars.
// After any exit a short cooldown blocks an immediate re-buy of the same
// falling knife.
//
// v2 vs v1: the v1 trade bought bar 72 and sold at TP +100 bps, but the
// fill (bar 73 open, near the trough) peaked at +152 bps — the +100 bps
// TP left ~50 bps on the table. v2 buys one bar earlier (MOD_BPS /
// LAST_BPS loosened to -12 / -6: bar 70's 3-bar drift is -7.9 bps, so
// v1's flat-or-better test fired a bar late) and takes profit at +140
// bps, and adds tier B so the bot also trades the second dip instead of
// sitting out the rest of the window after one trade.
//
// Long only, one position, full equity per trade, deterministic: no wall
// clock, no network, no environment, no randomness (hello.seed unused).

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// --- parameters, tuned on THIS dev window (see README) ---
const HIGH_BARS = 45;
const DROP_BPS = 60;
const BELOW_EMA_BPS = 25;
const MOD_BPS = -12; // worst allowed 3-bar return at entry (bps)
const LAST_BPS = -6; // worst allowed latest-bar return at entry (bps)
const EMA_TREND = 20;
const EMA_LONG = 60;
const TP_BPS = 140;
const STOP_BPS = 200;
const PEAK_BPS = 100;
const TRAIL_BPS = 40;
const HOLD_MAX = 120;
const COOLDOWN_BARS = 3;
// Tier B (second dip): looser drop/stretch than the washout tier, same
// stabilisation test. Cut off at bar 1000: dips after that in this
// falling window rebound at most ~+14 bps and lose money after costs.
const DROP2_BPS = 40;
const BELOW2_EMA_BPS = 15;
const TIER2_CUTOFF_SEQ = 1000;
const LATE_BAR = 1200;
const LATE_BELOW_EMA_BPS = 40;
const LATE_MOD_BPS = -10;
// No new entry in the last 60 bars: a buy decided that late has no time
// for its rebound to develop before the window's final flatten, so after
// the ~26 bps round-trip cost it is negative expected value. It also
// stops the bot sending an order on the very last batch, which the
// replay rejects (after_end) — v1 did exactly that on the dev window.
const ENTRY_CUTOFF_SEQ = 1380;
const MAX_SLIPPAGE_BPS = 200;

type EntryVerdict = 'washout' | 'tier2' | 'late' | 'none';
type ExitVerdict = 'take-profit' | 'stop-loss' | 'trailing-fade' | 'time-stop' | 'hold';

interface DipBot {
  closes: number[];
  emaTrend: number;
  emaLong: number;
  peakGainBps: number;
  barsHeld: number;
  cooldown: number;
  fills: number;
}

function newBot(firstClose: number): DipBot {
  return {
    closes: [],
    emaTrend: firstClose,
    emaLong: firstClose,
    peakGainBps: 0,
    barsHeld: 0,
    cooldown: 0,
    fills: 0,
  };
}

/** Basis points from `from` to `to`, positive when `to` is higher. */
function bpsBetween(from: number, to: number): number {
  return ((to - from) / from) * 10_000;
}

function rollingHigh(closes: number[], bars: number): number {
  let high = -Infinity;
  for (let i = closes.length - bars; i < closes.length; i++) {
    if (closes[i]! > high) high = closes[i]!;
  }
  return high;
}

function updateEmas(bot: DipBot, close: number): void {
  const kTrend = 2 / (EMA_TREND + 1);
  const kLong = 2 / (EMA_LONG + 1);
  bot.emaTrend = close * kTrend + bot.emaTrend * (1 - kTrend);
  bot.emaLong = close * kLong + bot.emaLong * (1 - kLong);
}

function classifyEntry(bot: DipBot, close: number, seq: number): EntryVerdict {
  if (seq >= ENTRY_CUTOFF_SEQ) return 'none';
  const n = bot.closes.length;
  if (n >= HIGH_BARS + 1) {
    const dropBps = bpsBetween(close, rollingHigh(bot.closes, HIGH_BARS));
    const stretchBps = bpsBetween(close, bot.emaTrend);
    const drift3Bps = bpsBetween(bot.closes[n - 4]!, close);
    const drift1Bps = bpsBetween(bot.closes[n - 2]!, close);
    const stoppedFalling = drift3Bps >= MOD_BPS && drift1Bps >= LAST_BPS;
    if (dropBps >= DROP_BPS && stretchBps >= BELOW_EMA_BPS && stoppedFalling) return 'washout';
    if (
      seq < TIER2_CUTOFF_SEQ &&
      dropBps >= DROP2_BPS &&
      stretchBps >= BELOW2_EMA_BPS &&
      stoppedFalling
    ) {
      return 'tier2';
    }
  }
  if (bot.fills === 0 && seq >= LATE_BAR && n >= EMA_LONG + 1) {
    const stretchLongBps = bpsBetween(close, bot.emaLong);
    const drift3Bps = bpsBetween(bot.closes[n - 4]!, close);
    if (stretchLongBps >= LATE_BELOW_EMA_BPS && drift3Bps >= LATE_MOD_BPS) return 'late';
  }
  return 'none';
}

function classifyExit(bot: DipBot, gainBps: number): ExitVerdict {
  if (gainBps >= TP_BPS) return 'take-profit';
  if (gainBps <= -STOP_BPS) return 'stop-loss';
  if (bot.peakGainBps >= PEAK_BPS && gainBps <= bot.peakGainBps - TRAIL_BPS) return 'trailing-fade';
  if (bot.barsHeld >= HOLD_MAX) return 'time-stop';
  return 'hold';
}

let bot: DipBot | null = null;

await runBars({
  onBatch(state: BarsState, batch) {
    const orders: (BuyInput | SellInput)[] = [];
    if (state.warmingUp) return orders;
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return orders;
    const close = Number(bar.c);
    if (bot === null) bot = newBot(close);
    const b = bot;
    b.closes.push(close);
    if (b.closes.length > 1) updateEmas(b, close);
    if (b.cooldown > 0) b.cooldown--;

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      b.barsHeld++;
      const value = state.value(SYMBOL, held.qty);
      const gainBps = ((Number(value) - Number(held.cost)) / Number(held.cost)) * 10_000;
      if (gainBps > b.peakGainBps) b.peakGainBps = gainBps;
      if (classifyExit(b, gainBps) !== 'hold') {
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        b.peakGainBps = 0;
        b.barsHeld = 0;
        b.cooldown = COOLDOWN_BARS;
      }
      return orders;
    }

    // Flat: no open position.
    b.peakGainBps = 0;
    b.barsHeld = 0;
    if (b.cooldown > 0) return orders;
    if (state.cash < BigInt(state.hello.fees.min_notional_quote_units)) return orders;
    if (classifyEntry(b, close, batch.seq) === 'none') return orders;
    let size = state.cash;
    const room = state.weightRoom(SYMBOL);
    if (size > room) size = room;
    if (size < BigInt(state.hello.fees.min_notional_quote_units)) return orders;
    orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: size, max_slippage_bps: MAX_SLIPPAGE_BPS });
    b.fills++;
    return orders;
  },
});
