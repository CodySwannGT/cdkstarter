# [cdkstarter] Add optional generic queues, DLQs, and worker alarms

Work item: CodySwannGT/cdkstarter#44. Target main. Bound worktree /tmp/cdkstarter-44-implementation, branch codex/44-optional-batch. Reviewed source foundation 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80; prior batch released as v0.0.2, source a8766e5e965d86138b996de31f373ccc2196a065. Full ignored context .lisa/work-item-context.md, SHA256 d3f24ec8a5af482b0b6cbe9a29e843d7c10b55f045adcd8d23071120f56b2132. Verified native claim/binding before this plan.

## Acceptance Criteria

```gherkin
Scenario: Module omission creates no queue resources
  Given a configuration with queues omitted or enabled:false
  When the app fixture synthesizes offline
  Then no new SQS queue, event-source mapping, worker policy, or queue alarm is emitted

Scenario: A single failed message is observable
  Given two explicitly configured queues and their DLQs
  When all DLQ alarm templates are inspected
  Then each alarm uses its DLQ QueueName dimension, visible-message Maximum metric, threshold zero with a greater-than comparison, one period, and NOT_BREACHING missing-data handling

Scenario: Worker binding is optional and scoped
  Given one queue with an existing function/role/timeout binding and one unbound queue
  When the fixture synthesizes offline
  Then only the bound function receives an event source mapping and consume permissions for its queue ARN, and no application worker is generated

Scenario: Invalid retry timing is rejected
  Given a bound worker with timeout 40 seconds and queue visibility 180 seconds
  When configuration validation runs
  Then it fails with the minimum visibility requirement of 240 seconds instead of synthesizing an unsafe binding

Scenario: Backlog and worker signals retain their target identity
  Given enabled backlog and optional worker alarms with explicit notification topics
  When alarm templates are inspected
  Then backlog age alarms name the source queue, worker alarms name the configured function, and notifications use only supplied topic ARNs

```


## Execution

1. Read the complete canonical context and existing bounded owning research. Preserve actual dependency edges. Prove meaningful baseline regressions and passing controls at the highest supported offline boundary.
2. Implement only this optional module and required named tests/documentation. Default-off behavior must preserve existing resources, identities, outputs and IAM. Preserve managed configuration and quality thresholds. Normal ticket-linked small commits and hooks.
3. Root independently reviews exact source and evidence. Integrate optional leaves after green38-41 and released PR52 ancestry; run actual combined named tests, native synth and quality gates.
4. Drive batched PR through real review, CI, ordinary merge, configured release, actual released-source verification, typed published artifacts, canonical usage/backlinks and native closeout. No AWS or downstream adoption claims.

The user explicitly authorized small local commits and batched PRs to avoid serial CI waits. Root authorizes the same narrow active technical body-prerequisite timing exception for optional source implementation while #41 is built and #38/#40 are green/#39 active. Preserve every dependency edge and actual OPEN status. No human hold is discharged, #23 remains excluded, and no container or AWS deployment claim is authorized. The next optional PR cannot merge or close before PR52 released ancestry and integrated green #38–41 are established. Code foundation is exact reviewed/root 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80.

## Local implementation checkpoint

The full ignored input was read before changes (2,166,470 bytes; two primary comment obligations 5960679447/5985337853). Exact final named test bytes on archived foundation 289ebe3 yielded 28 intended failures and two controls passing; candidate managed execution yielded 59 passing tests across three files, including all 30 queue cases. Typecheck, scoped ESLint/SonarJS, formatting and diff checks passed. Complete default-off stage templates equal the archived foundation bytes. Initial fixtures were corrected to disable inherited xray and verify CDK-generated keyed policy names; their earlier observations remain historical.

Resource authorization is demonstrated offline: one genuine imported-role source consume policy, no new worker or producer rights, actual QueueName metrics, stable keyed order and explicit topics. Source receive count is bounded to the primary AWS 1..1000 limit. The declared three-receive default remains intentionally below AWS Lambda guidance of five; documentation explains operator choice. No AWS/runtime or live topic delivery claim is made. Root independent review, integrated dependencies/modules, full quality, remote CI/review and release remain pending.
