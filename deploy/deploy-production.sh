#!/bin/bash
set -euo pipefail

# =============================================================================
# Production Deployment Script for OBA Core
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGE_NAME="ghcr.io/triskel-labs/oba-core"
IMAGE_TAG="${IMAGE_TAG:-latest}"
STACK_FILE="$SCRIPT_DIR/oba-stack.yml"
VPS_HOST="dvemolina@contabo"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SKIP_BUILD=false
SKIP_DEPLOY=false

for arg in "$@"; do
  case $arg in
    --skip-build)  SKIP_BUILD=true ;;
    --skip-deploy) SKIP_DEPLOY=true ;;
    --help)
      echo "Usage: $0 [--skip-build] [--skip-deploy]"
      echo "  IMAGE_TAG env var sets the tag (default: latest)"
      exit 0
      ;;
  esac
done

# Build and push
if [ "$SKIP_BUILD" = false ]; then
  echo -e "${YELLOW}Building Docker image...${NC}"
  docker context use default
  cd "$PROJECT_ROOT"
  docker buildx build \
    --platform linux/amd64 \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    -t "$IMAGE_NAME:latest" \
    --push \
    .
  echo -e "${GREEN}Image built and pushed${NC}"
fi

# Deploy to VPS
if [ "$SKIP_DEPLOY" = false ]; then
  echo -e "${YELLOW}Deploying stack to VPS...${NC}"

  scp "$STACK_FILE" "$VPS_HOST:~/oba-stack.yml"

  ssh "$VPS_HOST" bash << ENDSSH
set -euo pipefail
export IMAGE_TAG=${IMAGE_TAG}
docker stack deploy -c ~/oba-stack.yml oba --with-registry-auth
echo ""
echo "Stack status:"
docker service ls | grep oba || true
ENDSSH

  echo -e "${GREEN}Deployed!${NC}"
  echo ""
  echo "Monitor: ssh $VPS_HOST 'docker service logs oba_app -f'"
  echo "Status:  ssh $VPS_HOST 'docker service ps oba_app'"
fi
