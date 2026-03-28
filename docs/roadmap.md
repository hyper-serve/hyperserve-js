# Hyperserve SDK — Roadmap

## Legend
- `[x]` Done
- `[ ]` Not started
- `[-]` In progress

---

## v0.1.0 — Initial release

### Core SDK
- [x] `HyperserveClient` — `createVideo`, `completeUpload`, `uploadVideo`, `getVideo`, `deleteVideo`, `deleteResolution`
- [x] `hyperserve-sdk/browser` — `putVideoToStorage` (File | Blob + progress)
- [x] `hyperserve-sdk/react-native` — `putVideoToStorage` (URI string → Blob → PUT + progress)
- [x] Shared storage layer — fetch path + XHR path with progress events
- [x] Error hierarchy — `HyperserveError`, `HyperserveValidationError`, `HyperserveNotFoundError`, `HyperserveApiError`, `HyperserveUploadError`, `HyperserveTimeoutError`
- [x] Input normalization — `Blob | Buffer | ReadableStream` with size inference

### Tooling
- [x] TypeScript 6, strict mode
- [x] Biome 2 lint + format
- [x] tsup — CJS + ESM + `.d.ts` for all three entry points
- [x] Vitest — 97 tests passing
- [x] `specification.md`
- [x] `README.md`
- [x] `CONTRIBUTING.md`
- [x] CI — test + lint + typecheck + build on push and PR to main
- [x] Conventional Commits enforced via PR title lint (squash merge model)
- [x] release-please — automated changelog + release PRs from conventional commits
- [x] `CHANGELOG.md` — auto-maintained by release-please

### Pending before v0.1.0 can ship
- [ ] GitHub repo created and code pushed
- [ ] npm publish step uncommented in `release-please.yml` and `NPM_TOKEN` secret added to repo
- [ ] Package name confirmed available on npm (`hyperserve-sdk`)
- [ ] `version` field in `package.json` confirmed correct for first publish

---

## v0.2.0 — Other language SDKs

- [ ] Python SDK — generated from OpenAPI spec + hand-authored `upload_video` convenience wrapper
- [ ] Go SDK — generated from OpenAPI spec + hand-authored `UploadVideo` convenience wrapper
- [ ] Ruby SDK — generated from OpenAPI spec + hand-authored `upload_video` convenience wrapper

---

## Future / backlog

### SDK features
- [x] `retries` option on `HyperserveClient` — automatic retry with exponential backoff on transient failures
- [ ] `onProgress` support in Node.js `uploadVideo` — currently silently ignored; requires a custom `TransformStream` wrapping the readable
- [ ] Multipart / chunked upload support for files approaching 5 GB
- [ ] Polling helper — `waitUntilReady(videoId, options?)` that polls `getVideo` until `status === 'ready'` or a timeout is reached
- [x] Webhook signature verification utility — helper to verify `X-Hyperserve-Signature` on incoming webhook requests

### Maintenance
- [ ] Dependabot for automated dependency updates
