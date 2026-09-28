import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwactions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { NagSuppressions } from 'cdk-nag';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as path from 'node:path';
import { z } from 'zod';
import type { AppConfig } from '../config';
import { createPrefillSchema, updatePrefillSchema } from '../src/domain/schemas';
import { METRIC_NAMESPACE, CIRCUIT_OPEN_METRIC } from '../src/lib/metric-names';

interface VendorPrefillStackProps extends StackProps {
  config: AppConfig;
}

export class VendorPrefillStack extends Stack {
  constructor(scope: Construct, id: string, props: VendorPrefillStackProps) {
    super(scope, id, props);
    const { config } = props;
    const isProd = config.env === 'prod';
    const serviceName = `vendor-prefill-${config.env}`;

    // ---- Data tier ----
    // Customer-managed KMS key so encryption is auditable and rotatable, and the
    // grant model is explicit (each function is granted use of this key via the
    // table grants below).
    const tableKey = new kms.Key(this, 'PrefillTableKey', {
      description: `${serviceName} DynamoDB encryption key`,
      enableKeyRotation: true,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const table = new dynamodb.Table(this, 'PrefillCache', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: tableKey,
      deletionProtection: isProd, // block accidental table deletion in prod
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
    });

    // ---- Function factory ----
    const defaultEnv: Record<string, string> = {
      TABLE_NAME: table.tableName,
      LOG_LEVEL: config.logLevel,
      SERVICE_NAME: serviceName,
      NODE_OPTIONS: '--enable-source-maps',
    };

    const makeFn = (
      fnId: string,
      entry: string,
      env: Record<string, string> = {},
      reservedConcurrency?: number,
    ): NodejsFunction => {
      const logGroup = new logs.LogGroup(this, `${fnId}Logs`, {
        retention: isProd ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
        removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      });
      return new NodejsFunction(this, fnId, {
        entry: path.join(__dirname, entry),
        handler: 'handler',
        runtime: Runtime.NODEJS_24_X,
        memorySize: config.lambda.memorySize,
        timeout: Duration.seconds(config.lambda.timeoutSeconds),
        reservedConcurrentExecutions: reservedConcurrency || undefined,
        tracing: Tracing.ACTIVE,
        logGroup,
        environment: { ...defaultEnv, ...env },
        bundling: { format: OutputFormat.ESM, target: 'node24', minify: isProd, sourceMap: true },
      });
    };

    // Vendor wiring only when a real vendor is configured; otherwise GET uses the
    // in-process fake vendor and needs no URL, secret, or breaker env (ADR-0024).
    const vendorEnv: Record<string, string> = config.vendorBaseUrl
      ? {
          VENDOR_BASE_URL: config.vendorBaseUrl,
          VENDOR_API_KEY_SECRET_NAME: config.vendorApiKeySecretName ?? '',
          VENDOR_TIMEOUT_MS: String(config.circuitBreaker.timeoutMs),
          VENDOR_ERROR_THRESHOLD_PCT: String(config.circuitBreaker.errorThresholdPercentage),
          VENDOR_RESET_TIMEOUT_MS: String(config.circuitBreaker.resetTimeoutMs),
        }
      : {};

    const getPrefillFn = makeFn(
      'GetPrefillFn',
      '../src/entry/get-prefill.ts',
      {
        CACHE_TTL_SECONDS: String(config.cacheTtlSeconds),
        ...vendorEnv,
      },
      config.concurrency.getReserved,
    );
    table.grantReadWriteData(getPrefillFn);

    // Secret imported BY NAME (its value never enters CloudFormation) and read access
    // granted only when a real vendor is configured.
    if (config.vendorApiKeySecretName) {
      const vendorApiKey = secretsmanager.Secret.fromSecretNameV2(
        this,
        'VendorApiKey',
        config.vendorApiKeySecretName,
      );
      vendorApiKey.grantRead(getPrefillFn);
    }

    const postPrefillFn = makeFn('PostPrefillFn', '../src/entry/post-prefill.ts');
    table.grantWriteData(postPrefillFn);
    const putPrefillFn = makeFn('PutPrefillFn', '../src/entry/put-prefill.ts');
    table.grantWriteData(putPrefillFn);
    const deletePrefillFn = makeFn('DeletePrefillFn', '../src/entry/delete-prefill.ts');
    table.grantWriteData(deletePrefillFn);

    // ---- Auth: none (demo) | external-IdP JWT (configured) | Cognito (fallback) ----
    // Enterprise deployments set config.auth and get the Lambda TOKEN authorizer that
    // validates JWTs from the IdP behind ApigeeX. Greenfield/local deployments leave it
    // unset and get a hardened Cognito user pool (ADR-0023). A demo environment sets
    // disableAuth and attaches no authorizer at all — a public API (ADR-0025).
    let authorizer: apigw.IAuthorizer | undefined;
    let defaultAuthType: apigw.AuthorizationType;

    if (config.disableAuth) {
      authorizer = undefined;
      defaultAuthType = apigw.AuthorizationType.NONE;
    } else if (config.auth) {
      const authorizerFn = makeFn('AuthorizerFn', '../src/entry/authorizer.ts', {
        JWT_ISSUER: config.auth.issuer,
        JWT_AUDIENCE: config.auth.audience,
        JWKS_URI: config.auth.jwksUri,
      });
      authorizer = new apigw.TokenAuthorizer(this, 'JwtAuthorizer', {
        handler: authorizerFn,
        resultsCacheTtl: Duration.minutes(5),
      });
      defaultAuthType = apigw.AuthorizationType.CUSTOM;
    } else {
      const userPool = new cognito.UserPool(this, 'UserPool', {
        userPoolName: serviceName,
        selfSignUpEnabled: false, // callers are provisioned, not self-registered
        signInAliases: { email: true },
        passwordPolicy: {
          minLength: 12,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        mfa: cognito.Mfa.REQUIRED,
        mfaSecondFactor: { sms: false, otp: true }, // TOTP, no SMS role needed
        // Plus feature plan enables threat protection (compromised-credential and
        // adaptive auth checks). Costs more per MAU — only incurred on this greenfield path.
        featurePlan: cognito.FeaturePlan.PLUS,
        standardThreatProtectionMode: cognito.StandardThreatProtectionMode.FULL_FUNCTION,
        removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      });
      userPool.addClient('ApiClient', { authFlows: { userSrp: true }, generateSecret: false });
      authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
        cognitoUserPools: [userPool],
        resultsCacheTtl: Duration.minutes(5),
      });
      defaultAuthType = apigw.AuthorizationType.COGNITO;
    }

    // ---- Presentation tier ----
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      retention: isProd ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const api = new apigw.RestApi(this, 'PrefillApi', {
      restApiName: serviceName,
      cloudWatchRole: true, // account-level role so the stage can write logs/metrics
      // CORS is intentionally off unless a browser origin is configured (ADR-0022).
      ...(config.cors
        ? {
            defaultCorsPreflightOptions: {
              allowOrigins: config.cors.allowOrigins,
              allowMethods: apigw.Cors.ALL_METHODS,
            },
          }
        : {}),
      deployOptions: {
        stageName: config.env,
        tracingEnabled: true,
        throttlingRateLimit: config.throttle.rateLimit,
        throttlingBurstLimit: config.throttle.burstLimit,
        accessLogDestination: new apigw.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigw.AccessLogFormat.jsonWithStandardFields({
          caller: false,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: false,
        }),
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        metricsEnabled: true,
        dataTraceEnabled: false, // never log request/response bodies (PII)
      },
      // Every method requires authorization unless the env disables it (demo).
      defaultMethodOptions: {
        ...(authorizer ? { authorizer } : {}),
        authorizationType: defaultAuthType,
      },
    });

    const toApigwSchema = (schema: z.ZodType): apigw.JsonSchema => {
      const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
      delete json.$schema;
      return json as unknown as apigw.JsonSchema;
    };
    const createModel = api.addModel('CreatePrefillModel', {
      modelName: 'CreatePrefillInput',
      contentType: 'application/json',
      schema: toApigwSchema(createPrefillSchema),
    });
    const updateModel = api.addModel('UpdatePrefillModel', {
      modelName: 'UpdatePrefillInput',
      contentType: 'application/json',
      schema: toApigwSchema(updatePrefillSchema),
    });
    const bodyValidator = api.addRequestValidator('BodyValidator', {
      requestValidatorName: 'validate-body',
      validateRequestBody: true,
    });

    const prefill = api.root.addResource('prefill');
    prefill.addMethod('POST', new apigw.LambdaIntegration(postPrefillFn), {
      requestModels: { 'application/json': createModel },
      requestValidator: bodyValidator,
    });
    const byId = prefill.addResource('{id}');
    byId.addMethod('GET', new apigw.LambdaIntegration(getPrefillFn));
    byId.addMethod('PUT', new apigw.LambdaIntegration(putPrefillFn), {
      requestModels: { 'application/json': updateModel },
      requestValidator: bodyValidator,
    });
    byId.addMethod('DELETE', new apigw.LambdaIntegration(deletePrefillFn));

    // ---- WAF (prod only): AWS common rules + a per-IP rate limit ----
    if (isProd) {
      const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
        scope: 'REGIONAL',
        defaultAction: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `${serviceName}-waf`,
          sampledRequestsEnabled: true,
        },
        rules: [
          {
            name: 'AWSCommon',
            priority: 1,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet',
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: `${serviceName}-common`,
              sampledRequestsEnabled: true,
            },
          },
          {
            name: 'RateLimit',
            priority: 2,
            action: { block: {} },
            statement: { rateBasedStatement: { limit: 2000, aggregateKeyType: 'IP' } },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: `${serviceName}-rate`,
              sampledRequestsEnabled: true,
            },
          },
        ],
      });
      new wafv2.CfnWebACLAssociation(this, 'WebAclAssoc', {
        resourceArn: api.deploymentStage.stageArn,
        webAclArn: webAcl.attrArn,
      });
    }

    // ---- Observability ----
    const circuitOpenMetric = new cloudwatch.Metric({
      namespace: METRIC_NAMESPACE,
      metricName: CIRCUIT_OPEN_METRIC,
      dimensionsMap: { service: serviceName },
      statistic: 'Sum',
      period: Duration.minutes(1),
    });

    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `${serviceName}-alarms`,
      enforceSSL: true, // AwsSolutions-SNS3: require publishers to use HTTPS/TLS
    });
    if (config.alarmEmail) {
      alarmTopic.addSubscription(new subscriptions.EmailSubscription(config.alarmEmail));
    }

    const circuitAlarm = new cloudwatch.Alarm(this, 'VendorCircuitOpenAlarm', {
      metric: circuitOpenMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Vendor circuit breaker opened — the vendor is failing.',
    });
    circuitAlarm.addAlarmAction(new cwactions.SnsAction(alarmTopic));

    // ---- cdk-nag: documented, evidence-based suppressions ----
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'CDK injects these AWS managed policies for baseline function/stage logging; they are ' +
          'scoped to the log actions each service needs.',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs',
        ],
      },
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'AWS X-Ray (active tracing) does not support resource-level permissions, so ' +
          'xray:PutTraceSegments / PutTelemetryRecords must be granted on Resource:*. The kms:* ' +
          'entries are the action-name families CDK grants for the table CMK (ReEncryptFrom/To, ' +
          'GenerateDataKey/WithoutPlaintext), scoped to that single key. Business permissions ' +
          '(DynamoDB, Secrets Manager) remain least-privilege per function.',
        appliesTo: ['Resource::*', 'Action::kms:ReEncrypt*', 'Action::kms:GenerateDataKey*'],
      },
      {
        id: 'AwsSolutions-COG4',
        reason:
          'When config.auth is set, authorization uses a custom Lambda JWT authorizer applied to ' +
          'every method (ADR-0012/0023), validating tokens from the enterprise IdP behind ApigeeX ' +
          'rather than a Cognito user pool. The Cognito fallback path satisfies this rule directly.',
      },
      {
        id: 'AwsSolutions-APIG2',
        reason:
          'Request-body validation is enabled on the mutating methods (POST/PUT) via JSON models ' +
          'and a request validator; GET/DELETE carry no body, and full schema validation (zod) ' +
          'runs in every Lambda — the deeper backend validation this rule recommends.',
      },
      {
        id: 'AwsSolutions-DDB3',
        reason:
          'Point-in-time recovery and RETAIN are enabled in prod (see config); lower environments ' +
          'gate them off to control cost, consistent with the WAF gating.',
      },
      {
        id: 'AwsSolutions-APIG3',
        reason:
          'A WAFv2 web ACL (AWS common rule set + per-IP rate limit) is associated in prod (see ' +
          'stack); lower environments are internal and gate it off to control cost.',
      },
    ]);

    // Demonstration mode is intentionally public; document that decision for cdk-nag.
    if (config.disableAuth) {
      NagSuppressions.addStackSuppressions(this, [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'Demonstration environment is intentionally open (no authorizer): it holds no secrets ' +
            'and serves only mock vendor data, is ephemeral (DESTROY on teardown), and is bounded ' +
            'by stage throttling. Enabled only when config.disableAuth is set (ADR-0025).',
        },
      ]);
    }

    new cloudwatch.Dashboard(this, 'PrefillDashboard', { dashboardName: serviceName }).addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Vendor circuit breaker opens',
        left: [circuitOpenMetric],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda errors',
        left: [getPrefillFn, postPrefillFn, putPrefillFn, deletePrefillFn].map((fn) =>
          fn.metricErrors({ period: Duration.minutes(1) }),
        ),
        width: 12,
      }),
    );
  }
}
