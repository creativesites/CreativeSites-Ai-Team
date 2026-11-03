# Round 1: opening positions

## Bezos

SEAT: Bezos (Strategy and decisions)
STANCE: Conditional yes
OPTION SCORES: [A] 7/10 · [B] 4/10 · [C] 5/10 · [D] 2/10 · [E] 3/10 · [F] 1/10
PILLAR SCORE: 7/10
CONFIDENCE: 3/5
RUIN RISK: possible
DOOR: one-way

THE CALL: Take A, cut to one agent pair doing one real job in one repo, with the runtime owning task data from day one.

WHY:
1. The task-store choice is the one-way door, so it goes first. Every later feature sits on it. "must be made methodically, carefully, slowly, with great deliberation and consultation." (Type 1 and Type 2 decisions, S063) The product shape around it is a two-way door: "Type 2 decisions can and should be made quickly by high judgment individuals or small groups." (Type 1 and Type 2 decisions, S063)
2. Start with the customer and work backwards (S056). Proof that agent work is right before it merges will still matter in ten years. Worktrees and diff review are already table stakes, so B is a race to parity with no reason to pay. Verification is the asset most tools lack, and A puts it at the center of a real job. D means building email, documents, and web integrations, which is undifferentiated heavy lifting. "The price of admission is too high." (S035) E is infrastructure with no customer in view. C is where A should grow, since audit buyers sell slowly. F keeps invented dashboard numbers in front of investors, which fails the credibility goal.
3. Runway is where my lens misfires. I cannot run a seven-year clock on 3 to 9 months. "I don't believe in bet the company bets that's when you're desperate" (S018). Cash burn makes "try it and see" a one-way door for this company (Fake two-way doors, inferred from S063, S048). My assumption is 3 months of runway, not 9. The build must reach a demo a real developer can use on a real repo by week 8, or I drop to B.

THE RISK I SEE: Scope creep turns one job into all six options, and the cash ends before any customer sees the verifier work.

WHAT WOULD CHANGE MY MIND: Fewer than 3 of 10 developers I interview naming a recent agent merge they would not have trusted without proof (my threshold, not a sourced number). Or runway confirmed at 3 months with no design partner by week 6. Either one moves me to B.

WHAT I'D DO THIS WEEK: Write one page stating that the runtime owns task data, and sign it so the store question stops reopening.

QUESTION FOR THE FOUNDER: Which named developer or business owner will run the verified-merge loop on a real repo within 90 days, and will they pay for it?

## Graham

SEAT: Graham (Product and startups)
STANCE: Conditional yes
OPTION SCORES: [A] 3/10 · [B] 4/10 · [C] 7/10 · [D] 1/10 · [E] 2/10 · [F] 2/10
PILLAR SCORE: 4/10
CONFIDENCE: 2/5
RUIN RISK: possible
DOOR: two-way

THE CALL: Option C, sold by hand to ten developers who run agents every day, with the rest of A built only when they ask for it.

WHY:
1. Runway is 3 to 9 months and there is no paying customer. I'm assuming a two-person team and a burn near their living costs, which makes this roughly 3 to 6 months of real time. A runtime and store rebuild eats most of that before anyone is asked for money. "The fatal pinch is default dead + slow growth + not enough time to fix it." (S080) That is the trap A and E walk into.
2. Verification is the one thing the brief says they have that most tools lack, so it is the only thing I'd build a wedge on. "Startups are as impersonal as physics. You have to make something people want, and you prosper only to the extent you do." (S092) Test that in six weeks by selling a proof report of what ran, checked against the diff and tests, to ten developers. "Launching teaches you what you should have been building." (S142)
3. A is a big plan with no single job working end to end yet. "If it does everything it does nothing" (S010). Normal Mode is simulated, so D is playing house (framework 22, S178). B polishes a cockpit that other tools already ship, so the growth number does not move.

THE RISK I SEE: Verification is a feature buyers want but may not pay for alone, and a hand-sold version drifts into audit consulting. "Consulting is where product companies go to die." (S194)

WHAT WOULD CHANGE MY MIND: Three developers who are not friends of the founders pay for the verification report within 30 days, or six of ten use it a second week running. If none pay by week six, I drop C too and the next question is whether anyone at all wants this.

WHAT I'D DO THIS WEEK: Run one real task through Claude Code in the app, capture the diff and test exit status by hand, and send the report to ten developers you know with a request for a card number.

QUESTION FOR THE FOUNDER: Name the first ten developers who would be upset if this disappeared, and tell me the last time one of them paid for a tool.

## Hormozi

SEAT: Hormozi (Offers, pricing, and sales)
STANCE: Conditional yes
OPTION SCORES: [A] 7/10 · [B] 4/10 · [C] 5/10 · [D] 2/10 · [E] 3/10 · [F] 1/10
PILLAR SCORE: 4/10
CONFIDENCE: 3/5
RUIN RISK: possible
DOOR: two-way

THE CALL: Take A, but cut it to one avatar (developer teams running two or more agents) and one paid design-partner pilot before the rest of the build.

WHY:
1. Nothing is sold yet, so the offer is the constraint. "nailing the offer is the single strongest lever on your business success" (S114). Run the Value Equation: the dream outcome is high (merge agent work without reading every diff), but likelihood is near zero today. Normal Mode is simulated, and diff and test evidence is not captured (Value Equation, S115). Fix the top of the fraction before spending on anything else.
2. Assumed numbers, since the brief has none: $99 per seat per month, 70% gross margin, 5% monthly churn. That is about $1,390 lifetime gross profit per seat. At a 3:1 floor (LTV to CAC, S070), I can afford about $460 to acquire a seat. Founder-led selling clears that if the sales cycle stays short.
3. Let the customer fund the build. "30-day cash must be greater than two times the cost of acquiring customer and the cost of fulfilling that customer." (Client-financed acquisition, S037). A $1,500 paid pilot passes that test if CAC plus COGS stays under $750. With 3 to 9 months of runway, a paid pilot beats a free beta. Under $1M, a second avatar is a strike: C (audit-trail buyers, long procurement) and D (business owners, low ticket) both fail now (111 rule, S059). "Most businesses die from indigestion, not starvation." (S113)

THE RISK I SEE: The build runs past month 9 with no paid team, and the runway ends with a demo nobody bought.

WHAT WOULD CHANGE MY MIND: Ten developer teams contacted with no paid pilot after 100 outreach actions in 100 days. Under the Rule of 100 (S002), that is a fair test of the channel. If it happens, I drop A and back B as the fallback. A single real run where verifier evidence cuts review time in half would move me toward a higher stance.

WHAT I'D DO THIS WEEK: Write a one-page offer: one job, one avatar, a $1,500 paid pilot with a refund if the verifier fails a real run. Then send the first 100 outreach messages to developer leads.

QUESTION FOR THE FOUNDER: Name five developers who would pay $1,500 this month for one agent job verified end to end. What did each of them say when you asked?

## Wickman

SEAT: Wickman (Operations and scaling)
STANCE: Conditional yes
OPTION SCORES: [A] 7/10 · [B] 4/10 · [C] 4/10 · [D] 2/10 · [E] 6/10 · [F] 2/10
PILLAR SCORE: 6/10
CONFIDENCE: 3/5
RUIN RISK: possible
DOOR: two-way

THE CALL: Take A, but only with the runtime owning task data (E's spine) and Normal Mode's simulated screens cut before anything new is built.

WHY:
1. The root is Data and Process, not the UI. Two stores and invented dashboard numbers mean nobody can see the truth, and every feature built on top inherits that. Fix the root component first (Six Key Components, S064). One store, owned by the runtime, is that fix.
2. Structure first. A needs three seats: a builder on the Tauri app, an owner of the runtime and the task contract, and an Integrator who runs the weekly build. I'm assuming a team of two or three. If the founder holds all three, the answer to your question is no. "We always teach structure first, people second." (Accountability Chart, S044)
3. Scope to one Rock. One real job end to end, one owner, 90 days. The Scorecard is five numbers at most, weekly: jobs run with captured diff and test evidence, and jobs verified by a second agent (Scorecard, S077). No number, no decision.
4. B is cheap but leaves the two-store problem alive. D is a new market outside the Core Focus, so it is a no for now (Core Focus, S110). F keeps invented numbers on the screen, which is a Data failure.
5. Cash. I'm assuming a burn near the low end of your 3 to 9 months. Keep six months of cash in view as the rule (S098). If there is no credible demo at day 90, cut to B.

THE RISK I SEE: The founder builds A alone, the runtime contract drifts from the app, and the demo slips past runway with nothing a customer can touch.

WHAT WOULD CHANGE MY MIND: A team of one that cannot ship a runtime change without the founder for two weeks moves me to B. A named paying pilot inside 90 days moves me to a firm yes.

WHAT I'D DO THIS WEEK: Write the Accountability Chart for the next six months on one page, three seats with one name each, then run GWC on the person who owns the task store.

QUESTION FOR THE FOUNDER: Who besides you could ship one Mission Control job end to end this month, and who would you hand the day-to-day to?

## Buffett

SEAT: Buffett (Money and capital)
STANCE: Conditional yes
OPTION SCORES: [A] 7/10 · [B] 5/10 · [C] 4/10 · [D] 2/10 · [E] 2/10 · [F] 3/10
PILLAR SCORE: 6/10
CONFIDENCE: 3/5
RUIN RISK: possible
DOOR: one-way

THE CALL: Take A, cut to one job with a fixed budget and a week-six checkpoint, and keep B as the fallback.

WHY:
1. The brief gives no burn rate, so I'm assuming about $40k a month. That puts your runway at $120k to $360k. Birds in the bush (S011): "all investing is, is laying out cash now to get more cash back at a later date. Now, the question is how much do you get back, how sure are you of getting it, when do you get it?" Today the answers are none, no proof, and unknown. Any option that burns months before a customer touches it is a bet on hope. A is the only option that makes a real job run end to end, which is the first thing a buyer can check. (My translation.)
2. Dollar-retained test (S010): each dollar of rebuild has to beat the next best use. E fails that cleanly. A runtime with an API and a thin client is months of spend before anyone can pay. D is outside your circle. Non-developer email, documents, and real approvals are a new market with new economics (Circle of competence, S022). C has the best moat, but it sells to audit buyers you have not found, and those sales run long.
3. Moat (Economic castle and moat, S005): verification is the one thing you have that most parallel-agent tools lack. A puts it in front of a user. B is cheap, but worktrees and diff review are now expected, so B is a commodity lane where you win only as the lowest-cost operator.

THE RISK I SEE: The rebuild eats the runway before a single developer pays, and the split between the two stores turns the task-data move into the whole project. "The most important thing to do when you find yourself in a hole is to stop digging." (S063)

WHAT WOULD CHANGE MY MIND: If real burn is above $40k a month and runway is under four months, I move to B. If two developers or design partners commit money before week six, I move to a firmer yes.

WHAT I'D DO THIS WEEK: Write down the one job from outcome to approval, pick the single store that owns tasks, and set a $60k spending cap with a week-six kill date.

QUESTION FOR THE FOUNDER: Which named developer team will pay for the first end-to-end run, and what will they pay?

## Elon

SEAT: Elon (First principles and execution speed)
STANCE: Conditional yes
OPTION SCORES: [A] 8/10 (cut to one job) · [B] 4/10 · [C] 5/10 · [D] 1/10 · [E] 4/10 · [F] 1/10
PILLAR SCORE: 7/10
CONFIDENCE: 3/5
RUIN RISK: possible
DOOR: two-way

THE CALL: Option A, cut to one job with one agent and one verifier, with the runtime as the only task store, and Normal Mode's fake progress deleted before anything new gets built.

WHY:
1. Cash is the clock. Runway is 3 to 9 months with no paying customer, so the limiting factor is weeks until one real job runs end to end, not screen count (Tackle the limiting factor, S002). The loop is: outcome in, agent works, verifier checks observed results, human approves. Everything outside that loop waits.
2. Delete first. Canned 35% progress, hard-coded coworkers, and invented dashboard numbers go before any feature is added. "if you're not adding things back in 10% of the time, you're clearly not deleting enough." (The algorithm, S014) Each thing that survives needs a named owner: "make your requirements less dumb. Your requirements are definitely dumb." (The algorithm, S014)
3. Two stores is a broken loop, not a design choice. The verifier cannot see app-made tasks, so the fix is one store, owned by the runtime. "possibly the most common error of a smart engineer is to optimize a thing that should not exist." (S014) Skip the API and thin-client rewrite until a customer asks for it. Worktrees and diff review are table stakes, so they come after the loop works. Verification is the wedge: "instead of kind of grading your own homework, you would at least have competitors grading your homework." (S018)

THE RISK I SEE: The team spends the runway on store migration and worktree plumbing, and reaches month six with a verifier that has never run on a paying team's real repo.

WHAT WOULD CHANGE MY MIND: A two-week spike showing the store migration fits in under two weeks and one real repo runs the loop with one agent. If ten developer interviews show nobody will pay for verification alone, I move to C as the product. I assume a team of about three engineers. If it is one person, I cut harder.

WHAT I'D DO THIS WEEK: List every screen, view, and hard-coded object, mark each as in-loop or deleted, and remove the fake progress and invented numbers in one tagged PR so it can come back.

QUESTION FOR THE FOUNDER: Who is the first paying customer, and which single job would they pay for before the runway runs out?

## Chair notes

**Scores (Round 1, weights Bezos 3, others 2).** Option totals: A 6.5 · B 4.2 · C 5.0 · D 1.7 · E 3.3 · F 1.6. A leads, so the recommended option is A.

**Unanimity check.** Not unanimous. Top options are A for five seats and C for Graham. No override.

**Spread and confidence.** Spread on A is 5 (Elon 8, Graham 3). Average confidence 2.8, so council confidence is 5 after the spread penalty.

**Cruxes.**
1. Build the loop first, or sell before building? Bezos, Buffett, Wickman, and Elon back A and the runtime store first. Graham and Hormozi want a paid pilot or hand sale before the build goes further.
2. Can verification sell alone? Graham says yes, sold by hand as a report. Bezos, Buffett, Elon, and Wickman say the wedge only holds inside the full loop. Elon would move to C only if ten interviews show no one pays for verification alone.
3. How much runway is there? Bezos and Graham assume about 3 months. Buffett assumes a $40k a month burn, which gives $120k to $360k of cash. The brief gives neither number. The founder's answer is 3 to 9 months, and the seats disagree on what that means in cash.

**Format and brief.** All six cards broke no format. Hormozi's prices, churn, and margin are the seat's own assumptions and are marked as such in the card. Buffett's burn figure and Wickman's team size are also assumptions, and the card says so. Quotes will be checked against the brains before the verdict.
