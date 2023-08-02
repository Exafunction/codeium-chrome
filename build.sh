#!/bin/bash

set -euxo pipefail

if [[ "$1" != "public" && "$1" != "enterprise" ]]; then
    echo "Usage: $0 <public|enterprise>"
    exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
    echo "Use main branch only"
    exit 1
fi
# Make sure local git changes are clean.
git diff-index --quiet HEAD

cd -- "$( dirname -- "${BASH_SOURCE[0]}" )"

cd ../../.. && git clean -ffdx && cd -
npm install
# If the first arg is public, use npm run build
if [[ "$1" == "public" ]]; then
    npm run build
else
    npm run build:enterprise
fi
