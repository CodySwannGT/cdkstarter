# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.3](https://github.com/CodySwannGT/cdkstarter/compare/v0.0.2...v0.0.3) (2026-10-05)


### Features

* **amplify:** add explicit routing headers and failed-build alerts ([9e26aa7](https://github.com/CodySwannGT/cdkstarter/commit/9e26aa784340b5349739011e6e5f00becf889cd3)), closes [#43](https://github.com/CodySwannGT/cdkstarter/issues/43) [CodySwannGT/cdkstarter#43](https://github.com/CodySwannGT/cdkstarter/issues/43)
* **dns:** add retained cross-account child delegation ([8bd92f2](https://github.com/CodySwannGT/cdkstarter/commit/8bd92f24cf4eb7c958fce266def05f582cce38a1)), closes [CodySwannGT/cdkstarter#42](https://github.com/CodySwannGT/cdkstarter/issues/42)
* **observability:** add optional GraphQL alarms and cause grouping ([d6f08d3](https://github.com/CodySwannGT/cdkstarter/commit/d6f08d3c1517062995ef0ee225297b3322619baa)), closes [CodySwannGT/cdkstarter#45](https://github.com/CodySwannGT/cdkstarter/issues/45)
* **onboarding:** verify clean generated starter projects ([a483e0d](https://github.com/CodySwannGT/cdkstarter/commit/a483e0dc5196a8860887ebe7b53b8243cfec8f3d)), closes [#41](https://github.com/CodySwannGT/cdkstarter/issues/41) [CodySwannGT/cdkstarter#41](https://github.com/CodySwannGT/cdkstarter/issues/41)
* **optional:** add scoped secret delivery and exact build tool pins ([e9a6e6d](https://github.com/CodySwannGT/cdkstarter/commit/e9a6e6d04b2478529ead4801271c7657cd78062b)), closes [CodySwannGT/cdkstarter#46](https://github.com/CodySwannGT/cdkstarter/issues/46)
* **queues:** add optional DLQs and existing worker bindings ([5600764](https://github.com/CodySwannGT/cdkstarter/commit/5600764ad2d7bcb666efb9ba879582dbe03555fb)), closes [#44](https://github.com/CodySwannGT/cdkstarter/issues/44) [CodySwannGT/cdkstarter#44](https://github.com/CodySwannGT/cdkstarter/issues/44)
* **sms:** add optional account spend monitoring and recovery ([4f624d6](https://github.com/CodySwannGT/cdkstarter/commit/4f624d652b759da520d7c6e1ac97afe03721f797)), closes [#47](https://github.com/CodySwannGT/cdkstarter/issues/47) [CodySwannGT/cdkstarter#47](https://github.com/CodySwannGT/cdkstarter/issues/47)


### Bug Fixes

* allow bounded SMS counter startup warmup ([bf10996](https://github.com/CodySwannGT/cdkstarter/commit/bf10996fa940808c51648cbe5f31da6d92cb1e06)), closes [CodySwannGT/cdkstarter#47](https://github.com/CodySwannGT/cdkstarter/issues/47)
* **amplify:** preserve quoted headers and static htm callbacks ([a5f211f](https://github.com/CodySwannGT/cdkstarter/commit/a5f211f3a401cfa249083a00259042fd6517d15a)), closes [#43](https://github.com/CodySwannGT/cdkstarter/issues/43) [CodySwannGT/cdkstarter#43](https://github.com/CodySwannGT/cdkstarter/issues/43)
* **edge:** reject unsupported CloudFront WAF regions ([8da1717](https://github.com/CodySwannGT/cdkstarter/commit/8da1717cb8cd2556f502f7205109256fcef6a1d6)), closes [#40](https://github.com/CodySwannGT/cdkstarter/issues/40) [CodySwannGT/cdkstarter#40](https://github.com/CodySwannGT/cdkstarter/issues/40)
* reject duplicate Amplify header names ([6ae7e48](https://github.com/CodySwannGT/cdkstarter/commit/6ae7e487975f901b666bb01f397b4ec06b7937b0)), closes [CodySwannGT/cdkstarter#43](https://github.com/CodySwannGT/cdkstarter/issues/43)
* **sms:** restrict reconciliation to pending recovery ([7a5086f](https://github.com/CodySwannGT/cdkstarter/commit/7a5086f40e0cf2378f410717b177abddd7c567be)), closes [#47](https://github.com/CodySwannGT/cdkstarter/issues/47) [CodySwannGT/cdkstarter#47](https://github.com/CodySwannGT/cdkstarter/issues/47)
* validate complete GraphQL alarm names ([7167670](https://github.com/CodySwannGT/cdkstarter/commit/7167670a32bc6e78cd3de3e5cdfdcda2a0ea54da)), closes [CodySwannGT/cdkstarter#45](https://github.com/CodySwannGT/cdkstarter/issues/45)


### Documentation

* explain Amplify build command migration ([e831c95](https://github.com/CodySwannGT/cdkstarter/commit/e831c9567366e4c51086085ffc553d6c66dceb9e)), closes [CodySwannGT/cdkstarter#46](https://github.com/CodySwannGT/cdkstarter/issues/46)

### [0.0.2](https://github.com/CodySwannGT/cdkstarter/compare/v0.0.1...v0.0.2) (2026-10-04)


### Bug Fixes

* attach application deployment permission ceilings ([4b882e6](https://github.com/CodySwannGT/cdkstarter/commit/4b882e66be2ca6f2671ae8995409de32c22aa63d)), closes [CodySwannGT/cdkstarter#33](https://github.com/CodySwannGT/cdkstarter/issues/33)
* clarify direct selectors and verify frontend stage ([f75de18](https://github.com/CodySwannGT/cdkstarter/commit/f75de186db037cd78f15e552fc32056970daad23)), closes [CodySwannGT/cdkstarter#30](https://github.com/CodySwannGT/cdkstarter/issues/30)
* compose direct deployments under one environment stage ([905130c](https://github.com/CodySwannGT/cdkstarter/commit/905130c7729f2292417f3fb5598673c3ac567305)), closes [CodySwannGT/cdkstarter#30](https://github.com/CodySwannGT/cdkstarter/issues/30)
* **config:** reject reserved Aurora runtime role ([289ebe3](https://github.com/CodySwannGT/cdkstarter/commit/289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80)), closes [CodySwannGT/cdkstarter#37](https://github.com/CodySwannGT/cdkstarter/issues/37) [CodySwannGT/cdkstarter#37](https://github.com/CodySwannGT/cdkstarter/issues/37)
* **config:** validate database usernames before synthesis ([57a76cb](https://github.com/CodySwannGT/cdkstarter/commit/57a76cb4cb0689505e1ffec7fb737220ca29c165)), closes [CodySwannGT/cdkstarter#37](https://github.com/CodySwannGT/cdkstarter/issues/37)
* **config:** validate supported environment and Aurora settings ([387a0a4](https://github.com/CodySwannGT/cdkstarter/commit/387a0a4bd18e11ff93523320df8641a7a5402ed6)), closes [CodySwannGT/cdkstarter#37](https://github.com/CodySwannGT/cdkstarter/issues/37)
* constrain GitHub OIDC trust to immutable repositories ([6cac544](https://github.com/CodySwannGT/cdkstarter/commit/6cac5449bffc5d6339d2313b054cd355e1e5b16e)), closes [CodySwannGT/cdkstarter#32](https://github.com/CodySwannGT/cdkstarter/issues/32)
* correct Aurora capacity saturation alarms ([afd6393](https://github.com/CodySwannGT/cdkstarter/commit/afd6393256580f6b89b53e235be0de85a14af85c)), closes [#34](https://github.com/CodySwannGT/cdkstarter/issues/34) [CodySwannGT/cdkstarter#34](https://github.com/CodySwannGT/cdkstarter/issues/34)
* **database:** grant proxy access to dedicated IAM users ([b2be2eb](https://github.com/CodySwannGT/cdkstarter/commit/b2be2eb23a3b318a645e3642245744b9fe45c2f9)), closes [CodySwannGT/cdkstarter#31](https://github.com/CodySwannGT/cdkstarter/issues/31) [CodySwannGT/cdkstarter#31](https://github.com/CodySwannGT/cdkstarter/issues/31)
* **database:** reject unsafe inherited default privileges ([bb590bd](https://github.com/CodySwannGT/cdkstarter/commit/bb590bdef224b68d758a6acb890529171501a2e2)), closes [CodySwannGT/cdkstarter#31](https://github.com/CodySwannGT/cdkstarter/issues/31)
* enroll Aurora backups and filter failure alerts ([ace7d18](https://github.com/CodySwannGT/cdkstarter/commit/ace7d18c554f86392a3ac3e6331f19779f558d56)), closes [#36](https://github.com/CodySwannGT/cdkstarter/issues/36) [CodySwannGT/cdkstarter#36](https://github.com/CodySwannGT/cdkstarter/issues/36)
* honor configured private service endpoints ([6047e1d](https://github.com/CodySwannGT/cdkstarter/commit/6047e1d5cbd92308d71257554b4c992b5c047214)), closes [#35](https://github.com/CodySwannGT/cdkstarter/issues/35) [CodySwannGT/cdkstarter#35](https://github.com/CodySwannGT/cdkstarter/issues/35)
* **iam:** use owning partition in application deploy policy ([dabbf11](https://github.com/CodySwannGT/cdkstarter/commit/dabbf117b9fc4b249c44266667ed88edd174f297)), closes [CodySwannGT/cdkstarter#33](https://github.com/CodySwannGT/cdkstarter/issues/33)


### Documentation

* **oidc:** retain the legacy provider before native migration ([001c808](https://github.com/CodySwannGT/cdkstarter/commit/001c808e343f5ba7dd01fbebe414260875d9a83d)), closes [CodySwannGT/cdkstarter#32](https://github.com/CodySwannGT/cdkstarter/issues/32)

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
