# PDFwise on AWS (free tier)

Everything is in `infra/aws.yml` (CloudFormation) and stays inside AWS's Always Free allowances at
launch traffic:

| Part                           | Service                                | Free each month                                                        |
| ------------------------------ | -------------------------------------- | ---------------------------------------------------------------------- |
| Site (every in-browser tool)   | S3 + CloudFront                        | 1 TB transfer, 10M requests                                            |
| Office → PDF, HTML → PDF       | Lambda (container image with Chromium) | 1M requests, 400,000 GB-seconds (≈ 40,000 conversions)                 |
| Deploy on every push to `main` | CodeBuild + GitHub connection          | 100 build minutes (≈ 30 site deploys; a server rebuild takes about 10) |

Storage (site files, the server image, files in transit) costs a few cents a month and comes out of
the project's credits.

How a conversion works: Lambda takes at most 6 MB per request, so the browser uploads the file
straight to S3 with a short-lived signed URL, the server converts it and returns a signed link to
the PDF. Inputs are deleted right after reading, and the bucket deletes anything left after a day.
Only CloudFront can call the function (origin access control), so `/api` can't be reached around
the CDN.

## First-time setup

Region: the project's selected Region (ap-southeast-2). Confirm it in AWS Settings → View all
projects → Overview → Additional info → Region.

1. **Verify the project for CloudFront.** New AWS projects can't create CloudFront distributions
   until AWS Support verifies them. In the console: Support → Create case → Account and billing,
   and paste the error: _"Your account must be verified before you can add new CloudFront
   resources."_ Wait for the reply (usually within a day or two).
2. **Create the stack** (without the server, whose image doesn't exist yet):
   ```bash
   aws cloudformation create-stack --stack-name pdfwise --template-body file://infra/aws.yml \
     --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --region ap-southeast-2
   ```
3. **Approve the GitHub connection** (it can only be approved in the console): Developer Tools →
   Settings → Connections → `pdfwise-github` → Update pending connection → install the
   _AWS Connector for GitHub_ app on the `pdfwise` repository → Connect.
4. **Build the first server image in AWS** (no Docker needed on your computer):
   ```bash
   aws codebuild start-build --project-name pdfwise-deploy --region ap-southeast-2 \
     --environment-variables-override name=DEPLOY_MODE,value=image
   ```
   The build log ends with the image URI (`…/pdfwise-server:<commit>`).
5. **Add the server and turn on deploys**:
   ```bash
   aws cloudformation update-stack --stack-name pdfwise --template-body file://infra/aws.yml \
     --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --region ap-southeast-2 \
     --parameters ParameterKey=ImageUri,ParameterValue=<image URI from step 4> \
                  ParameterKey=AutoDeploy,ParameterValue=true
   ```
6. **First full deploy**: push to `main`, or
   `aws codebuild start-build --project-name pdfwise-deploy --region ap-southeast-2`. The site is at
   the stack's `SiteUrl` output.

## Every day

Push to `main`. CodeBuild runs `npm run check`, rebuilds the server image only if `server/`, the
Dockerfile or dependencies changed, uploads the site and clears the CloudFront cache. Build logs are
in CloudWatch Logs (`/aws/codebuild/pdfwise-deploy`); server logs in `/aws/lambda/pdfwise-server`.

To change infrastructure, edit `infra/aws.yml` and run `update-stack` as in step 5 with
`UsePreviousValue=true` for both parameters (so the running server image isn't replaced by an older
one).

## Custom domain

Add the domain to the distribution with an ACM certificate in us-east-1 (CloudFront requires that
Region for certificates), point DNS at it, then set `SITE_URL=https://your-domain.com` as an
environment variable on the `pdfwise-deploy` CodeBuild project so canonical URLs and the sitemap use
it.

## Costs to watch

- Above 1 TB a month of traffic, CloudFront charges per GB; above 400,000 GB-seconds, Lambda charges
  per conversion second. Both come from credits first.
- On the Free plan the project closes when it ends (six months after sign-up) unless you upgrade to
  the Paid plan in AWS Settings. The Always Free allowances stay free on the Paid plan.
- To remove everything: empty the two S3 buckets, then
  `aws cloudformation delete-stack --stack-name pdfwise --region ap-southeast-2`.
