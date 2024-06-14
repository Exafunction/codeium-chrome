#!/bin/bash

set -euxo pipefail

if [[ $# -lt 1 || "$1" != "public" && "$1" != "enterprise" ]]; then
    echo "Usage: $0 <public|enterprise>"
    exit 1
fi

# Make sure local git changes are clean.
git diff-index --quiet HEAD

cd -- "$( dirname -- "${BASH_SOURCE[0]}" )"

cd ../../.. && git clean -ffdx -e local.bazelrc && cd -
pnpm install
# If the first arg is public, use pnpm run build
if [[ "$1" == "public" ]]; then
    pnpm run build
else
    pnpm run build:enterprise
fi
