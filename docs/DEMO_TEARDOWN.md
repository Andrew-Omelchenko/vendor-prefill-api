# Removing the `demo` deployment

Teardown guide for the `VendorPrefill-demo` stack deployed to **AWS Frankfurt
(`eu-central-1`)**. Run the commands from the project root (the folder with
`package.json`).

---

## 1. Destroy the stack

```bash
npx cdk destroy -c env=demo
```

- It lists the resources it will delete and asks for confirmation — type `y`.
- This removes the entire `VendorPrefill-demo` stack: Lambdas, API Gateway,
  the DynamoDB table, the KMS key, log groups, and IAM roles.
- It takes a minute or two and ends with `✅ VendorPrefill-demo: destroyed`.

The demo table is deleted for good — `demo` is not a production environment, so it
has no deletion protection or point-in-time recovery and leaves no snapshot behind.
That is the intended behaviour for a throwaway environment.

---

## 2. Verify nothing lingers

**CloudFormation** (region `eu-central-1`) → **Stacks**: confirm
`VendorPrefill-demo` is gone.

**CloudWatch** → **Log groups** (region `eu-central-1`): confirm nothing starting
with `VendorPrefill-demo` or `/aws/lambda/VendorPrefill-demo…` remains. The demo
config uses `DESTROY` removal, so these should be deleted with the stack — delete
any leftovers manually if you see them.

CLI alternative:

```bash
aws cloudformation describe-stacks --region eu-central-1 --stack-name VendorPrefill-demo
# Expect: "Stack with id VendorPrefill-demo does not exist" once teardown is complete.
```

---

## 3. What to keep vs. remove

**Keep — the `CDKToolkit` stack** (created once by `cdk bootstrap`). It is a small
S3 bucket plus a few roles that cost essentially nothing, and it is needed for any
future deploy. Only delete it if you are closing out the AWS account entirely.

**Consider removing — the `cdk-deployer` IAM credentials.** If this was a one-off
demo and you will not redeploy soon, delete the access keys (IAM → Users →
`cdk-deployer` → Security credentials), or delete the whole user. Long-lived admin
access keys are the main thing not to leave lying around.

---

## 4. Redeploying later

If you kept the `CDKToolkit` stack, bringing the demo back is a single command (no
re-bootstrap needed):

```bash
npm run deploy:demo
```

---

## Troubleshooting

**Stack stuck in `DELETE_FAILED`.** Usually a resource could not be removed — most
often a non-empty log group or a resource still in use. Open the stack in the
CloudFormation console, check the **Events** tab for the resource that failed, remove
it manually, then retry `npx cdk destroy -c env=demo` (or **Delete** from the
console).

**`destroy` reports nothing to delete.** The stack is already gone — you are done.

**Wrong region.** If `destroy` cannot find the stack, confirm your CLI region is
`eu-central-1` (`aws configure get region`) or pass it explicitly, since the demo was
deployed to Frankfurt.
