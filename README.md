[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Azet17/makefun-btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Azet17/makefun-btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Bounty page: https://make.fun/bounty/btc-race-24h-20261118-1444

# Dip-recovery BTC bot — btc-race-24h-20261118-1444

Trades cbBTC/USDC on 1-minute bars, long only, $1,000 USDC paper money.
Built for the make.fun competition "Race a BTC trading bot live for 24 hours"
($250 prize pool).

## Strategy

The dev window (24h ending at the open) is a falling, choppy market:
buy-and-hold loses -280 bps, the range is only 335 bps peak to trough, and
1-minute volatility is tiny (stdev 6.7 bps). There is exactly one tradeable
event: a -264 bps washout in the first ~70 bars that rebounds +162 bps over
the next two hours, followed by a slow grind down. Momentum / EMA-cross
bots whipsaw in that chop, so this bot sits in cash and only buys a washout
that has already stopped falling, then banks the rebound quickly.

**Entry (washout):** close >= 60 bps below the rolling 45-bar high, >= 25 bps
below its 20-bar EMA, and the fall is over — the last 3 bars together are
no worse than -12 bps and the latest bar no worse than -6 bps.

**Entry (second dip, tier B):** same stabilisation test at only >= 40 bps
below the rolling 45-bar high and >= 15 bps below the 20-bar EMA, cut off
at bar 1000 — this catches the window's second dip (bar ~429, a -55 bps
dip that rebounds +139 bps from its fill). Dips after bar 1000 in this
falling window rebound at most ~+14 bps and lose money after costs.

**Entry (late safety net):** if nothing has traded by bar 1200 and the price
sits >= 40 bps below its 60-bar EMA with stabilising bars, buy once, so the
bot still makes its 1 guardrail trade on a race window with no washout.

**Exit (whole position):** take-profit +140 bps over cost, stop-loss -200 bps,
trailing fade (once peaked >= +100 bps, exit after giving back 40 bps), or a
120-bar time stop. A 3-bar cooldown follows every exit.

v2 vs v1: v1 bought bar 72 and sold at TP +100 bps, but its fill (bar 73
open, near the trough) peaked at +152 bps — the +100 bps TP left ~50 bps
on the table. v2 buys one bar earlier (stabilisation loosened to -12 / -6
bps), takes profit at +140 bps, and adds tier B so the bot trades the
second dip instead of sitting out the rest of the window after one trade.

**Guardrails:** no new entry in the last 60 bars (a buy that late has no time
for its rebound before the final flatten and is negative-EV after the ~26 bps
round-trip cost). Long only, one position, full equity per trade,
deterministic — no clock, no network, no randomness.

## Dev-window result (grade-local, process driver, two runs byte-identical)

- Net PnL: **+12.714170 USDC** (return +1.27%; v1 was +9.797551 USDC)
- Trades: 12 (6 round trips, win rate 0.667)
- Max drawdown: 1.02%
- Fees: 4.854748 USDC; net PnL at 2x fees: +7.897994 USDC
- Guardrails: met
- result_sha256: `3eb9102d7885c7e7b0c9e16b9c6eb83f89f3df371f1f9538aa6f5090ea47ca6c`
- action_log_sha256: `a11036556b2bf56728f4909b53daa8dd5aa1df156183e21b18191012ed902972`

Variants tested and rejected (grade-local, dev window): wider TP + earlier
entry alone (+8.085316 USDC, 4 trades) and the same plus tier B with
looser stabilisation -10 / -5 (+5.256049 USDC) — both below v1's
+9.797551 USDC, so neither was kept.

## Files

- `main.ts` — the bot (entrypoint, written in this session)
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's SDK shim
- `.makefun/owner.json` — claim file for wallet AKqmLDcoFGcD6a4he6UdJkh8iHrs31S1S2Ef69k2Fjop
- `LICENSE` — MIT
