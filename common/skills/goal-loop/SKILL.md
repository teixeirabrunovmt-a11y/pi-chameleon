---
name: goal-loop
description: Set a persistent goal and work toward it iteratively across turns until complete. Use when the user wants a multi-step task done autonomously without re-prompting, mentions "goal", "keep going until", or wants an autonomous work loop. Based on the Ralph loop pattern from Hermes/Codex.
---

# Goal Loop (Ralph Loop)

Keep a standing goal alive and work toward it iteratively. After each step, check if the goal is satisfied. If not, take the next step. Don't stop until the goal is achieved, the user interrupts, or you've exhausted reasonable effort.

## When this triggers

The user sets a goal with `/goal <text>`. You then:
1. Parse the goal into concrete success criteria
2. Work one step at a time
3. After each step, evaluate: is the goal met?
4. If not, continue with the next concrete step
5. When done, explicitly state: "Goal achieved: <reason>"

## Completion contracts

When the user writes a goal with field: value lines, treat these as binding:

| Field | Meaning |
|---|---|
| `outcome:` | The single end state that must be true when done |
| `verify:` / `verified by:` | Test/command/artifact that proves completion |
| `constraints:` / `preserve:` | What must not change or regress |
| `boundaries:` / `scope:` | Which files, dirs, or systems are in scope |
| `stop when:` / `blocked:` | Conditions to stop and ask for input |

Example:
```
/goal Migrate auth to JWT
verify: pytest tests/auth passes
constraints: keep the /login response shape unchanged
boundaries: only touch services/auth and its tests
```

## Loop rules

- **One step per turn.** Take a single concrete action, verify it, then check against the goal.
- **Don't ask for permission to continue.** Just take the next step.
- **Self-evaluate.** After each turn, ask: is the goal met? If no, what's the next step?
- **Verification is evidence.** Don't claim done without running the verification command/tests.
- **User messages pause the loop.** If the user sends a message mid-goal, respond to it, then resume the goal.
- **Don't infinite loop.** If stuck, state what's blocking and ask.
- **State progress.** Start each continuation with a brief status: "Step 3/5: ..."

## /goal draft

When the user writes `/goal draft <text>`, expand their one-liner into a full completion contract with outcome, verification, constraints, and boundaries fields. Then set it and begin working.
