#!/usr/bin/env node
import { App, Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { VendorPrefillStack } from '../lib/vendor-prefill-stack';
import { getConfig } from '../config';

const app = new App();

// Security/best-practice linting of the synthesized template; findings fail synth.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Pick the environment: `cdk deploy -c env=staging` (defaults to dev via cdk.json)
let config = getConfig(app.node.tryGetContext('env'));

// Force the Cognito fallback auth path with `-c authMode=cognito` (for greenfield
// deploys and for exercising that branch in CI); otherwise auth follows config.auth.
if (app.node.tryGetContext('authMode') === 'cognito') {
  config = { ...config, auth: undefined };
}

new VendorPrefillStack(app, `VendorPrefill-${config.env}`, {
  config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
  },
  tags: {
    project: 'vendor-prefill-api',
    environment: config.env,
  },
});
