# Screenshots

Images referenced from pull request descriptions. This branch is never merged
and carries no application code, so Vercel deployments are disabled for it in
`vercel.json` — without that, every push here fails a build with "No Next.js
version detected".

Reference images by commit SHA rather than by branch name:

    raw.githubusercontent.com/korzainc/devx-home/<sha>/pr-17/pr-skills.png

GitHub proxies images through a cache keyed on the URL, so reusing a branch
URL after replacing a file serves the old image.
