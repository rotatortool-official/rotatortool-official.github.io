# Rotator: product flow and guardrails

Written 2026-09-29, from the site owner's own description of what Rotator is
for. Every change to the page should fit this flow. If a new feature does not
clearly belong to one of the steps below, it probably does not belong on the
page yet.

## The flow a visitor should walk through

The page is one long read, top to bottom. Each section is one step in the flow.
It should hand the visitor on to the next step, not compete with it.

| # | Step | What the visitor learns or does | Section |
|---|------|---------------------------------|---------|
| 1 | **Market momentum** | Where the market is right now. This is the first thing they see. | TODAY |
| 2 | **Leaders and laggards** | What performed well, what lagged behind, and which coins are starting to turn. | MOMENTUM |
| 3 | **Track and build** | Pick the coins they hold or watch and build their portfolio. | YOURS |
| 4 | **Stay informed** | Turn on notifications, including Telegram market pulse notifications. | YOURS: alerts |
| 5 | **Support, if they want to** | Pro is optional. Rotator is free, and Pro runs on donations and the honor system. | Pro window, Support |
| 6 | **Learn the coins** | The full coin list, and for each coin what the score and relative strength mean. | COINS |
| 7 | **Act on it** | If they keep coins, turn part of a holding into BTC, or any coin they prefer, with the swap tool. | SWAP |
| 8 | **Learn more** | How our readings have held up. It is last on the page because the current engine's record is not yet graded. | RECORD |

## Guardrails

### Honesty and tone

- **Information, not calls.** We show what happened and how readings held up. We
  never say what to buy or sell, and results are in the past tense.
- **Free first.** Everything a visitor needs to follow the flow is free.
- **Pro is optional and runs on honor.** Pro is a thank-you for supporting
  development, not a paywall. It unlocks the **full features**.
- **Promise only what a donation-funded project can keep.**
  - Do not say "lifetime" or "for life".
  - Avoid "forever" in new copy.
- **State the record openly.** Say the old engine's 76.2% together with
  its bar: about 68% for calling every coin, graded on the best price in the
  window, so it is an upper bound. The current engine is graded against the
  median coin, where chance is 50%, and makes no claim until its first 30-day
  grades from 11 October.
- **Notifications, not signals.** Telegram delivers *market pulse
  notifications*. It does not deliver trading signals.
- **The channel is free; Pro is personal.** The Telegram channel is public and
  free for everyone. Pro adds personal alerts about the visitor's own coins.
- **One definition of the market's direction.** BTC above or below its 200-day
  average, everywhere: site pill, bear banner, Telegram posts and images. With
  no reading, say nothing rather than guess.
- **Colour follows what happened.** Green means the number went up, red means
  it went down, on the site and in every bot image. Never colour a coin by
  which list it is in, and never draw an arrow from one coin to another.

### The Telegram channel: fewer, better posts

Agreed 2026-09-30, thresholds set 2026-10-01 (HANDOVER.md Task 2,
promptove/78). Change a threshold only when the grades give a reason, and
write the reason here.

- **Weekly pulse, every Monday 08:00 UTC**, even when quiet ("Quiet week:
  nothing crossed a threshold"). BTC against its 200-day average, breadth,
  the groups' 30-day returns, what happened this week, coin-list changes.
- **Market event posts**, only when one of these happened and held:

  | Event | Rule | Fired in 91 weeks of history |
  |---|---|---|
  | BTC and its 200-day average | closes more than 2% on the other side, 3 days in a row | 4 |
  | Breadth | share of listed coins above their own 50-day average goes from under 25% to over 50%, or from over 75% to under 50%, and holds 5 days | 10 |
  | Leadership | the group with the best median 30-day return (BTC, ranks 2-20, ranks 101-250) changes, leads by 3 points or more, and holds 7 days | 7 |

- **At most 3 event posts a week** (Monday to Sunday, UTC). More wait for
  the pulse.
- **No coin posts for now.** The quick RSI bounce, the only coin sign with
  any record, beat the median coin 49.7% of the time over 7 days on the live
  list (1,636 cases). Unusual, held and volume-confirmed versions did no
  better. Coin signs stay on the site and in Pro direct messages. Revisit
  when a coin sign beats the median in a backtest with the bar written down
  first.
- **No daily leaders and laggards list.** That is the site's job.
- **Every event post is graded** after 7 and 30 days on whether the move it
  described held (BTC stayed on that side; the median coin moved the way
  breadth turned; the new leading group beat the old one) and shown on the
  RECORD page. Market events are rare, so about 30 grades of a kind will
  take years. Until then they are described as what happened, never as a
  forecast.

### Visual hierarchy: sections first, details after

- There are three text levels, and nothing on the page should skip a level:
  1. **Section heading.** 18px, full contrast, gold bar beside it, space above
     it. This is the only level allowed to shout.
  2. **Card title.** One quieter style for the title of each block inside a
     section.
  3. **Body, numbers and descriptions.** Muted descriptions, full contrast
     numbers.
- **One accent at a time.** Gold marks where you are and what is selected.
  Green and red are for up and down only. Purple is for Pro only. Do not use
  colour as decoration.
- **Space separates, lines are secondary.** Sections are divided by space
  first.
- **Controls step back until needed.** Sort buttons, filters and toggles are
  quiet by default. Only the active one is filled.
- **Phones get the same order.** The phone page follows the same steps in the
  same order, just narrower.

### Before adding something to the page

1. Which step of the flow does it serve?
2. Does it make the step clearer, or add one more thing competing for
   attention?
3. Is it written as information, not a call, and does it promise only what we
   can keep?
