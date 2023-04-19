#!/bin/bash

set -euxo pipefail

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
    echo "Use main branch only"
    exit 1
fi
# Make sure local git changes are clean.
git diff-index --quiet HEAD

cd -- "$( dirname -- "${BASH_SOURCE[0]}" )"

git clean -ffdx
npm install
npm run build
