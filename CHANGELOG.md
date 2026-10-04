# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### 0.0.1 (2026-10-04)


### Features

* add domain-conditional cloudfront + waf edge for the http api ([0b18210](https://github.com/CodySwannGT/cdkstarter/commit/0b1821088cf90ce02b1fdb42e3fd9417ea90655c))
* add scoped remote-agent AWS access ([f38afe4](https://github.com/CodySwannGT/cdkstarter/commit/f38afe47e82a8dbace96edcc7d12bc8220511c9d))
* **agent-operations:** prefix generated AWS profile names ([e6d5296](https://github.com/CodySwannGT/cdkstarter/commit/e6d5296f6a5b16ba87968106aeed44f6c2cd1676))
* bump aws-cdk-lib to 2.259.0 and add MySQL db-connect scripts ([470e45a](https://github.com/CodySwannGT/cdkstarter/commit/470e45af35c16156ed6997313e90e2216cee1d34))
* **observability:** optional composite alarm, backup alerts, cost anomaly detection ([595da26](https://github.com/CodySwannGT/cdkstarter/commit/595da26763895cd4e70a59179fa3a5291aa30f05))
* **observability:** optional sentry forwarding, synthetic canary, aurora enhanced monitoring ([96a2366](https://github.com/CodySwannGT/cdkstarter/commit/96a2366fe34d83e5660886a7806b69cf757f5d34))
* support frontend-only Amplify hosting ([0454e1a](https://github.com/CodySwannGT/cdkstarter/commit/0454e1a110a3bf14523b03846cd3e37cdf0ea9a8))
* upstream battle-tested infrastructure patterns from downstream project ([f7da532](https://github.com/CodySwannGT/cdkstarter/commit/f7da5324d8dd36ea3df88ef40810d519d2b54fd0))


### Bug Fixes

* bump aws-cdk cli above the schema-54 floor ([723cb3f](https://github.com/CodySwannGT/cdkstarter/commit/723cb3f68c6a09317b2bd223cc9fb16ca580187c))
* catch empty domain mappings in findDeadWafFlags ([41187c3](https://github.com/CodySwannGT/cdkstarter/commit/41187c320c31fac122fa4e7f814f60ec361d570a))
* **ci:** grant the release caller required token scopes ([060aca2](https://github.com/CodySwannGT/cdkstarter/commit/060aca25787805da3caafda0acc09d97859e3ccf)), closes [CodySwannGT/cdkstarter#29](https://github.com/CodySwannGT/cdkstarter/issues/29)
* **deps:** floor fast-uri and js-yaml at their patched versions ([706eb76](https://github.com/CodySwannGT/cdkstarter/commit/706eb763c350b572be4d78ab94e6895f92e4befd))
* enforce jsdoc doc linting on constructs, stacks, and functions ([e2f990b](https://github.com/CodySwannGT/cdkstarter/commit/e2f990b6eca0ae86608a4aa3f08b5884a6647469))
* **observability:** encrypt severity topics with a cmk cloudwatch can use ([fc5a4b6](https://github.com/CodySwannGT/cdkstarter/commit/fc5a4b667388e5f28b2abbbb66cc9628cd8a1b78)), closes [gunnertech/qualis-infrastructure#181](https://github.com/gunnertech/qualis-infrastructure/issues/181)
* patch CDK bundled advisory prerequisite ([fbf50b2](https://github.com/CodySwannGT/cdkstarter/commit/fbf50b2ae4ec461b55ac1058dfa0d5a0bab5f89c)), closes [#48](https://github.com/CodySwannGT/cdkstarter/issues/48) [CodySwannGT/cdkstarter#48](https://github.com/CodySwannGT/cdkstarter/issues/48)
* **pipeline:** give the synth build the agent-operations ExternalId ([3606b64](https://github.com/CodySwannGT/cdkstarter/commit/3606b649c39edce69766cd8ff9b7459954d13bcc)), closes [TunnlAI/infrastructure#76](https://github.com/TunnlAI/infrastructure/issues/76)
* **security:** bump aws-cdk-lib to 2.246.0 to resolve GHSA-999r-qq7v-r334 ([1f57c41](https://github.com/CodySwannGT/cdkstarter/commit/1f57c419f4e771e8227868cddcf161c9cf495595)), closes [#1306](https://github.com/CodySwannGT/cdkstarter/issues/1306)


### Code Refactoring

* **pipeline:** drop the redundant ExternalId secret grant ([2a5b308](https://github.com/CodySwannGT/cdkstarter/commit/2a5b3081420c2515627153bfd68ac4aadf5d45b6))


### Documentation

* **security:** distinguish historical CDK proof from combined delivery ([20aca4b](https://github.com/CodySwannGT/cdkstarter/commit/20aca4b766c7dc5ae9f4a843175214b092912287)), closes [CodySwannGT/cdkstarter#29](https://github.com/CodySwannGT/cdkstarter/issues/29)

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.
