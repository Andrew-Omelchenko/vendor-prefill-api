# 23. Configurable authentication: external-IdP JWT authorizer or Cognito fallback

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0012

## Context

The API must be authenticated, but the token issuer is not fixed. In the target environment an
enterprise IdP behind ApigeeX issues OAuth2/JWT (the exact issuer is still to be confirmed), while a
greenfield or local deployment has no IdP at all. ADR-0012 assumed an external issuer via a
placeholder; hard-coding either choice would be wrong for the other.

## Decision

Select the authorizer from configuration. When `config.auth` (issuer, audience, JWKS URI) is set, the
stack builds the Lambda TOKEN authorizer that validates JWTs from that issuer and applies it to every
method (`AuthorizationType.CUSTOM`). When `config.auth` is absent, the stack provisions a hardened
Cognito user pool — 12-char password policy, required TOTP MFA, Plus feature plan with full threat
protection, no self-sign-up — and attaches a `CognitoUserPoolsAuthorizer`
(`AuthorizationType.COGNITO`). A `-c authMode=cognito` context override forces the Cognito path
regardless of config, so both branches are exercised in CI. The configured environments
(dev/staging/prod) use the external-IdP path, matching the ApigeeX reality.

## Consequences

- One codebase supports an existing enterprise IdP and a self-contained greenfield deployment.
- The Cognito fallback is not free: it creates a real user pool and the Plus tier bills per active
  user. It is off unless `config.auth` is omitted.
- Downstream identity context differs between the two (Lambda authorizer context vs Cognito claims);
  handlers here read neither, so nothing else changes. The COG4 nag suppression covers the
  external-IdP branch; the Cognito branch satisfies that rule directly.
