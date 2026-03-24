# Releasing

## Workflow

1. **Add a changeset** for each meaningful change:
   ```bash
   npx changeset
   ```
   Select the semver bump type (patch/minor/major) and write a summary.
   This creates a markdown file in `.changeset/`.

2. **When ready to release**, consume all pending changesets:
   ```bash
   npx changeset version
   ```
   This updates `package.json` version, writes `CHANGELOG.md`, and deletes consumed changeset files.

3. **Review** the updated CHANGELOG.md and package.json version.

4. **Commit** the version bump:
   ```bash
   git add -A && git commit -m "Release v$(node -p "require('./package.json').version")"
   ```

5. **Tag** the release:
   ```bash
   git tag v$(node -p "require('./package.json').version")
   ```

6. **Publish** to npm:
   ```bash
   npm publish
   ```
   The `prepack` script automatically runs type-check, tests, and build.

7. **Push** the commit and tag:
   ```bash
   git push && git push --tags
   ```

## Semver guidelines for early development (0.x)

- **patch** (0.1.0 → 0.1.1): Bug fixes, documentation
- **minor** (0.1.0 → 0.2.0): New features, non-breaking API changes
- **major** (0.x → 1.0.0): Reserved for "stable" API declaration
