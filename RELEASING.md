# Releasing

Releases are prepped by hand: `CHANGELOG.md` is maintained directly (no
changesets), and each release is a single `Prep release vX.Y.Z` commit that the
version tag points at.

## During development

Add every meaningful change to `CHANGELOG.md` under an `## Unreleased` heading
as part of the change's own commit. Use the established section names:

- `### Features` — new capabilities
- `### Behavior Changes` — existing behavior that now works differently
- `### Fixes` — bug fixes
- `### Demo` — demo-only changes (not published to npm)

Entries are written for consumers: **bold summary** followed by what changed and
why it matters, not a restatement of the commit message.

## Release workflow

1. **Check the current version and tags first** (avoids duplicate/skipped
   versions):
   ```bash
   node -p "require('./package.json').version" && git tag --list | sort -V | tail -3
   ```

2. **Pick the bump** using the semver guidelines below.

3. **Retitle the changelog section**: change `## Unreleased` to
   `## X.Y.Z — YYYY-MM-DD`.

4. **Bump the version** in `package.json` and `package-lock.json`:
   ```bash
   npm version X.Y.Z --no-git-tag-version
   ```

5. **Run the full check suite** (the same gate `prepack` runs on publish):
   ```bash
   npx tsc --noEmit && npm test && npm run test:browser && npx vite build
   ```

6. **Commit and tag**:
   ```bash
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "Prep release v$(node -p "require('./package.json').version")"
   git tag v$(node -p "require('./package.json').version")
   ```

7. **Publish** to npm (`prepack` re-runs type-check, tests, and build):
   ```bash
   npm publish
   ```

8. **Push** the commit and tag:
   ```bash
   git push && git push --tags
   ```

### Re-prepping before publish

If more changes must go into a release that is tagged but not yet published or
pushed: land the change with its changelog entry under the release heading,
commit as `Re-prep release vX.Y.Z`, and move the tag to the new commit:

```bash
git tag -f vX.Y.Z
```

Never move a tag that has been pushed or published.

## Semver guidelines for early development (0.x)

- **patch** (0.1.0 → 0.1.1): Bug fixes, documentation
- **minor** (0.1.0 → 0.2.0): New features, non-breaking API changes
- **major** (0.x → 1.0.0): Reserved for "stable" API declaration
