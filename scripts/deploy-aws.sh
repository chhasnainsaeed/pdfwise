#!/usr/bin/env bash
# Deploys PDFwise to the AWS stack from infra/aws.yml (see docs/aws.md): the conversion server image
# to Lambda, then the site to S3, then clears the CloudFront cache. AWS CodeBuild runs it on every push
# to main (infra/buildspec.yml); it also works from a terminal with AWS credentials and Docker.
#
#   scripts/deploy-aws.sh            # server and site
#   scripts/deploy-aws.sh auto       # site, plus the server if its code changed since the last deploy
#   scripts/deploy-aws.sh site       # site only
#   scripts/deploy-aws.sh server     # server only
#   scripts/deploy-aws.sh image      # push the server image only (first-time setup, see docs/aws.md)
#
# Environment: STACK (default pdfwise), AWS_REGION (default ap-southeast-2), IMAGE_TAG (default the
# current commit), SITE_URL (default the CloudFront address; set it once you have a custom domain),
# and the optional analytics/verification variables `npm run build` reads.
set -euo pipefail

WHAT="${1:-all}"
STACK="${STACK:-pdfwise}"
export AWS_REGION="${AWS_REGION:-ap-southeast-2}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short=12 HEAD)}"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# Files that go into the server image; anything else (the site) doesn't need a new image.
SERVER_FILES=(server Dockerfile package.json package-lock.json)

server_changed() {
  local deployed
  deployed="$(aws lambda get-function --function-name "$(output FunctionName)" --query Code.ImageUri --output text)"
  deployed="${deployed##*:}"
  # Unknown or missing commit (e.g. a shallow clone): rebuild to be safe.
  git cat-file -e "$deployed^{commit}" 2>/dev/null || return 0
  ! git diff --quiet "$deployed" HEAD -- "${SERVER_FILES[@]}"
}

push_image() {
  local repo
  repo="$(output RepositoryUri)"
  image="$repo:$IMAGE_TAG"
  echo "==> Server image $image"
  # Tags are immutable, so a re-run for the same commit reuses the pushed image.
  if ! aws ecr describe-images --repository-name "${repo#*/}" --image-ids imageTag="$IMAGE_TAG" >/dev/null 2>&1; then
    # Lambda accepts single-platform images only, so no provenance attestation (a multi-platform index).
    docker build --target lambda --provenance=false -t "$image" .
    aws ecr get-login-password | docker login --username AWS --password-stdin "${repo%%/*}"
    docker push "$image"
  fi
}

deploy_server() {
  local function image
  function="$(output FunctionName)"
  push_image
  aws lambda update-function-code --function-name "$function" --image-uri "$image" --query LastUpdateStatus --output text
  aws lambda wait function-updated-v2 --function-name "$function"
}

deploy_site() {
  local bucket pages page excludes=()
  bucket="$(output SiteBucket)"
  export SITE_URL="${SITE_URL:-$(output SiteUrl)}"
  echo "==> Site $SITE_URL → s3://$bucket"
  npm run build

  # Hashed files never change: cache them for a year. Old ones stay for visitors still on an older page.
  aws s3 sync dist/assets "s3://$bucket/assets" --cache-control 'public, max-age=31536000, immutable' --only-show-errors

  # Pages are served at /merge-pdf, not /merge-pdf.html: store each under its extensionless name too.
  pages=()
  for page in dist/*.html; do
    page="$(basename "$page" .html)"
    [[ "$page" == index || "$page" == 404 ]] && continue
    pages+=("$page")
    excludes+=(--exclude "$page")
  done
  printf '%s\n' "${pages[@]}" | xargs -P 8 -I{} aws s3 cp "dist/{}.html" "s3://$bucket/{}" \
    --content-type 'text/html; charset=utf-8' --cache-control 'no-cache' --only-show-errors

  # Everything else must be re-checked on each visit (pages, service worker, manifest) so updates arrive.
  aws s3 sync dist "s3://$bucket" --delete --exclude 'assets/*' "${excludes[@]}" --cache-control 'no-cache' --only-show-errors
}

case "$WHAT" in
  all) deploy_server && deploy_site ;;
  auto)
    if server_changed; then deploy_server; else echo "==> Server unchanged since the last deploy"; fi
    deploy_site
    ;;
  server) deploy_server ;;
  site) deploy_site ;;
  image)
    push_image
    echo "==> Pushed. Create the function with: ImageUri=$image (docs/aws.md, step 3)"
    exit 0
    ;;
  *) echo "Usage: $0 [all|auto|server|site|image]" >&2 && exit 1 ;;
esac

distribution="$(output DistributionId)"
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' --query Invalidation.Id --output text
echo "==> Deployed: $(output SiteUrl)"
