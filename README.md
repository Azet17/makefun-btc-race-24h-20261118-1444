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
flat or better and the latest bar did not close down.

**Entry (late safety net):** if nothing has traded by bar 1200 and the price
sits >= 40 bps below its 60-bar EMA with stabilising bars, buy once, so the
bot still makes its 1 guardrail trade on a race window with no washout.

**Exit (whole position):** take-profit +100 bps over cost, stop-loss -200 bps,
trailing fade (once peaked >= +80 bps, exit after giving back 35 bps), or a
120-bar time stop. A 3-bar cooldown follows every exit.

**Guardrails:** no new entry in the last 60 bars (a buy that late has no time
for its rebound before the final flatten and is negative-EV after the ~26 bps
round-trip cost). Long only, one position, full equity per trade,
deterministic — no clock, no network, no randomness.

## Dev-window result (grade-local, process driver, two runs byte-identical)

- Net PnL: **+9.797551 USDC** (return +0.98%)
- Trades: 2 (1 round trip: buy bar 72, sell bar 81, +105 bps gross)
- Max drawdown: 0.12%
- Fees: 0.804081 USDC; net PnL at 2x fees: +8.990504 USDC
- Guardrails: met
- result_sha256: `fb336962cd1d40f6a7636a78c4df67bb5eb2fd4d723756439d1b9d5658882c18`
- action_log_sha256: `e3571e7e7cca011e253d433083c44985a9a37b37c68252ec4023f65cf77ae8d5`

## Files

- `main.ts` — the bot (entrypoint, written in this session)
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's SDK shim
- `.makefun/owner.json` — claim file for wallet AKqmLDcoFGcD6a4he6UdJkh8iHrs31S1S2Ef69k2Fjop
- `LICENSE` — MIT
