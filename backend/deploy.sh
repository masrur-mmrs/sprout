#!/usr/bin/env bash
# Builds the sprout-api image, migrates the database with it, then rolls it out.
# Migrations run as the sprout-migrate Cloud Run job before the service update, never at startup.
# Env vars and secrets live on the service and the job, so a deploy only changes the image.
set -euo pipefail

PROJECT=sprout-515308
REGION=asia-south1
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/sprout/api:$(git -C "$BACKEND_DIR" describe --always --dirty)-$(date +%Y%m%d%H%M%S)"

gcloud builds submit "$BACKEND_DIR" \
  --project "$PROJECT" --region "$REGION" \
  --config "$BACKEND_DIR/cloudbuild.yaml" \
  --substitutions "_IMAGE=$IMAGE" \
  --service-account "projects/$PROJECT/serviceAccounts/sprout-build@$PROJECT.iam.gserviceaccount.com" \
  --gcs-source-staging-dir "gs://$PROJECT-build/source"

gcloud run jobs update sprout-migrate --project "$PROJECT" --region "$REGION" --image "$IMAGE"
gcloud run jobs execute sprout-migrate --project "$PROJECT" --region "$REGION" --wait

gcloud run deploy sprout-api --project "$PROJECT" --region "$REGION" --image "$IMAGE"
