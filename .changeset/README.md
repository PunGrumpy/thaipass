# Changesets

Only `thaipass` is published; the private workspace packages are never versioned. When a change should reach npm, run `bun run changeset`, pick `thaipass` and a bump, and commit the file this writes. The release workflow turns pending changesets into a "Version Packages" pull request, and merging that publishes.
