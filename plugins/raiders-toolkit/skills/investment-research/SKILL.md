---
name: investment-research
description: >
  Systematic investment research on a company using a combined Buffett / Munger / Duan Yongping /
  Li Lu framework: business essence, economic moat, inversion and risk inventory, management
  quality, civilizational trend, and valuation with margin of safety. Use this when the user asks
  for a deep fundamental analysis of a stock or business, wants a value-investing research memo,
  or asks whether to buy/hold/avoid a company. English translation of the ai-berkshire framework.
when_to_use: >
  "Research <ticker/company>", "is <company> a good investment", "value investing analysis",
  "what's the moat on <company>", "build me an investment memo".
argument-hint: <company or ticker>
---

# Investment Research — Buffett · Munger · Duan Yongping · Li Lu

**Source:** https://github.com/xbtlin/ai-berkshire · MIT · translated from Simplified Chinese and
restructured into Claude Code skill format (upstream ships flat `.md` command files without frontmatter).

> **Not financial advice.** This is a research framework, not a recommendation. Output is analysis
> for the user's own decision-making. Always state that valuation figures are estimates, and never
> present model output as a guaranteed outcome.

Conduct research on **$ARGUMENTS** across the modules below, in order.

---

## Step 0 — AI research-bias awareness (mandatory)

Rate the company's *information richness* before analyzing, and record it at the top of the report.

| Level | Characteristics | AI research pitfall | Countermeasure |
| --- | --- | --- | --- |
| **A** — abundant | Listed for years, multi-broker coverage, dense media | Consensus is strong; AI output mirrors market pricing, little alpha | Reverse-validate: why *don't* smart investors buy? What's overlooked? |
| **B** — moderate | Listed 1–3 years, thin coverage, some data estimated | AI fills gaps with "reasonable inference" → false certainty | Annotate confidence per estimate; separate data-backed inference from assumption-filling |
| **C** — scarce | Recent IPO / obscure / emerging market | AI turns conservative from scarcity, misreading "unclear" as "poor" | Use first-principles inquiry below; extract business essence from limited data |

**First-principles inquiry for C-tier companies** (don't fabricate a complete-looking report):
1. Who are the customers, why do they pay, what are the alternatives?
2. What drives repeat purchase — habit, lock-in, or continuous value creation?
3. Could a competitor with $1B replicate this business?
4. What major decisions has management made, and what judgment/values do they reveal?

**Bias self-audit** (keep active throughout):
- [ ] Does my confidence come from business fundamentals or merely data volume?
- [ ] If the data were halved, would my conclusion change?
- [ ] Does my output just track market consensus? If so, where is the information edge?
- [ ] Could this be "scarce public data but excellent fundamentals" — i.e. underestimated?

## Step 1 — Data collection

Use two independent sources per critical figure; flag any variance >1%.
US: macrotrends + stockanalysis · HK: aastocks + macrotrends ADR · A-shares: East Money + CNINFO.

Collect: (1) revenue structure by segment, growth, margins; (2) 5-year revenue, net income, gross and
operating margin, FCF, cash; (3) competitive landscape and share; (4) business model and moat sources;
(5) core technology and R&D spend; (6) management background, ownership, key decisions; (7) TAM and
industry outlook; (8) risks — geopolitical, regulatory, supply chain; (9) valuation: market cap, PE,
PS, PEG, EV/Revenue; (10) bull and bear theses.

**Cross-validation rules — do not do arithmetic mentally.**
- Verify market cap by computing `price × shares` and comparing to the reported figure (catches unit
  errors: HK$m vs CNY m vs US$m).
- Minimum two independent sources per critical datum; prefer annual reports / exchange filings on conflict.
- Watch: FCF definitions differ (capex scope), debt scope (operating leases?), and dual-class shares
  where economic ≠ voting rights.
- Record every check in a "Critical Data Cross-Validation Log" appendix.

If the upstream repo is cloned locally, its helper scripts do this deterministically:
`python3 tools/financial_rigor.py verify-market-cap|cross-validate|verify-valuation|three-scenario`.
Otherwise compute with an explicit calculation step and show the arithmetic.

## Step 2 — Business essence (Duan Yongping: "the right business")

Define the business in one sentence. Break down revenue structure and the 5-year profitability trend.
Classify the model: one-time sale vs subscription/recurring; hardware vs software vs platform. Assess
ecosystem stickiness and lock-in. Compare gross margin to peers and *explain* why it's high or low.
Analyze operating leverage.

> **Duan's question:** What makes this a good business? In one sentence, what *is* it?

## Step 3 — Moat (Buffett: "economic moat")

| Moat type | How to verify |
| --- | --- |
| Brand / pricing power | Can it raise price without losing volume? |
| Switching cost | How expensive is it for a customer to leave? |
| Network effects | Does the product improve as users grow? |
| Scale economies | How large is the cost advantage from scale? |
| Technology / patent | How many years ahead? Replicable? |

Then chart the trajectory: has the moat widened or narrowed over 5 years, and what's the 5-year outlook?

> **Buffett's question:** Does this moat survive 10 years? What destroys it?

## Step 4 — Inversion and risk inventory (Munger: "invert, always invert")

Table every failure pathway with probability and impact. Find historical analogs — similar-stage
companies and how they actually ended. Apply cross-disciplinary lenses (network-effect theory,
technology adoption curves, game theory). Self-check for narrative bias, anchoring, survivorship bias.
Actively collect the bear case.

> **Munger's question:** Where am I most likely wrong? Why would a smart investor avoid or short this?

## Step 5 — Management (Duan: "the right people" + Buffett: integrity)

Review key CEO/founder decisions in a table (date / decision / outcome / score). Assess capital
allocation: R&D return, M&A success rate, buyback timing. Check shareholder alignment: insider
ownership, compensation structure, selling history. Assess org capability, team stability, key-person risk,
and culture.

> **Duan's question:** If the CEO retired, would the company keep its edge?

## Step 6 — Industry and civilizational trend (Li Lu)

Is the industry undergoing a civilization-level paradigm shift? Draw parallels to prior technology
revolutions (steam, electricity, internet, AI). Analyze the TAM growth curve and its ceiling, the
company's position in the value chain, technology-pathway risk, and customer/supplier concentration.

> **Li Lu's question:** Looking back from 20 years hence — is this the Standard Oil of our era, or 3Com's fleeting moment?

## Step 7 — Valuation and margin of safety (Buffett + Duan: "the right price")

Current pricing table (verified, not estimated). **Reverse DCF:** what growth does today's price
already assume? Three-scenario valuation (bull / base / bear) with explicit growth and exit-multiple
assumptions — show the calculation. Compare to the company's own valuation history and to peers.

> **Duan's question:** If the market closed for 5 years, would you hold at this price?

## Step 8 — Integrated decision memo

| Dimension | Conclusion | Confidence |
| --- | --- | --- |
| Business quality (Duan) | | |
| Economic moat (Buffett) | | |
| Management (Duan + Buffett) | | |
| Primary risk (Munger) | | |
| Civilizational trend (Li Lu) | | |
| Valuation (Buffett + Duan) | | |

Then a decision table covering: no position / current holder / sell signal / accumulation signal.

---

## Output requirements

1. Cite a source for every figure.
2. Use Markdown tables for key data.
3. End each module with that investor's question.
4. Write the full report to `~/<Company>_Investment_Research_Report.md`.
5. State a clear conclusion: buy / wait / avoid — framed as analysis, **not advice**.
6. Give specific price ranges in the valuation section.
7. Open the report with the Information Richness Rating (A/B/C) and an AI-limitation disclosure.
8. Close by distinguishing **AI analysis confidence** from **investment certainty** — say which
   conclusions rest on complete data and which on limited-information reasoning.
9. For C-tier companies, add a Field Validation Checklist so the reader can close the gaps directly.

## Release spot-check

Before presenting: sample ~15% of the report's data points at random, re-verify each against a
reliable source, and only release at ≤1% variance. Any point exceeding 1% → correct and re-audit.
