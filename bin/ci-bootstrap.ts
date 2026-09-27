#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { CiBootstrapStack } from '../lib/ci-bootstrap-stack';

// One-time, admin-run. Scope the trust to a branch (default) or an environment:
//   npm run bootstrap:ci -- -c repo=owner/name
//   npm run bootstrap:ci -- -c repo=owner/name -c gitRef=main
//   npm run bootstrap:ci -- -c repo=owner/name -c environment=production
//   (add -c oidcArn=<arn> if a GitHub OIDC provider already exists in the account)
const app = new App();
const repo = app.node.tryGetContext('repo');
if (!repo) {
  throw new Error('Pass the repo: cdk deploy ... -c repo=owner/name');
}

const environment = app.node.tryGetContext('environment');
const gitRef = app.node.tryGetContext('gitRef') ?? 'main';
const subject =
  app.node.tryGetContext('sub') ??
  (environment
    ? `repo:${repo}:environment:${environment}`
    : `repo:${repo}:ref:refs/heads/${gitRef}`);

new CiBootstrapStack(app, 'VendorPrefill-CiBootstrap', {
  repo,
  subject,
  existingOidcProviderArn: app.node.tryGetContext('oidcArn'),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
  },
});
