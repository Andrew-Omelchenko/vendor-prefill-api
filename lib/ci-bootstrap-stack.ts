import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

interface CiBootstrapProps extends StackProps {
  repo: string; // "owner/name"
  // The OIDC `sub` claim to trust — scoped to a branch or environment, never a
  // bare "repo:owner/name:*" (which would let any PR assume the role).
  subject: string;
  existingOidcProviderArn?: string;
}

// Deployed ONCE by an admin, separate from the app stack.
export class CiBootstrapStack extends Stack {
  constructor(scope: Construct, id: string, props: CiBootstrapProps) {
    super(scope, id, props);

    const provider = props.existingOidcProviderArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubOidc',
          props.existingOidcProviderArn,
        )
      : new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });

    const role = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'vendor-prefill-github-deploy',
      description: 'Assumed by GitHub Actions via OIDC to run cdk deploy',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        // Scoped subject — a specific branch or environment, not the whole repo.
        StringLike: {
          'token.actions.githubusercontent.com:sub': props.subject,
        },
      }),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', {
      value: role.roleArn,
      description: 'Set this as the AWS_DEPLOY_ROLE_ARN secret in GitHub',
    });
    new CfnOutput(this, 'TrustedSubject', { value: props.subject });
  }
}
