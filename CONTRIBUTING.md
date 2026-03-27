# Contributing

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) on **PR titles only**. Individual commits within a branch are not enforced. Since we squash merge, the PR title becomes the single commit message on `main` and is what drives versioning and the changelog.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

### Types

| Type | When to use | Version bump |
|---|---|---|
| `feat` | New feature or behaviour | Minor (`0.x.0`) |
| `fix` | Bug fix | Patch (`0.0.x`) |
| `perf` | Performance improvement | Patch |
| `refactor` | Code change with no feature/fix | None |
| `revert` | Reverts a previous commit | Patch |
| `docs` | Documentation only | None |
| `test` | Adding or updating tests | None |
| `build` | Build system or dependency changes | None |
| `ci` | CI configuration | None |
| `chore` | Maintenance, no production code change | None |
| `style` | Formatting, no logic change | None |

### Breaking changes

Append `!` to the type for a breaking change. This triggers a major version bump.

```
feat!: remove support for Node 16
fix!: getVideo now throws HyperserveNotFoundError instead of returning null
```

### Examples

```
feat: add retries option to HyperserveClient
fix: correct Content-Type header on storage PUT for .mov files
docs: add React Native usage example to README
chore: update vitest to v3
feat(react-native)!: require uri instead of file in putVideoToStorage
```

## Branching

- `main` is the trunk — direct commits are not allowed
- Open a PR for all changes, no matter how small
- PRs are squash merged

## Releases

Releases are managed by [release-please](https://github.com/googleapis/release-please). When commits land on `main`, release-please maintains an open release PR that accumulates the changelog. Merging the release PR bumps the version and triggers the publish workflow.

You do not need to manually update `CHANGELOG.md` or `package.json` version.
