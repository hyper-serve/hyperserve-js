# Changelog

## [0.2.0](https://github.com/hyper-serve/hyperserve-js/compare/hyperserve-js-v0.1.1...hyperserve-js-v0.2.0) (2026-09-09)


### ⚠ BREAKING CHANGES

* CreateVideoOptions.fileSizeBytes is removed. TypeScript callers passing it get an excess-property error. The runtime call is unaffected, since the API ignores the field.

### Features

* drop fileSizeBytes from createVideo, send Content-Length on stream uploads ([#3](https://github.com/hyper-serve/hyperserve-js/issues/3)) ([dd6f633](https://github.com/hyper-serve/hyperserve-js/commit/dd6f633377d1a58800403df64a8d4e2164875ac2))

## [0.1.1](https://github.com/hyper-serve/hyperserve-js/compare/hyperserve-js-v0.1.0...hyperserve-js-v0.1.1) (2026-06-02)


### Bug Fixes

* correct exports map to match tsup output extensions ([96d9ad5](https://github.com/hyper-serve/hyperserve-js/commit/96d9ad5875279acadcbc584b823628d0636d3465))
* harden SDK for v0.1.0 release ([c72a16d](https://github.com/hyper-serve/hyperserve-js/commit/c72a16dc6f8fe672dafa79d45c202f0aff0625fc))
* move /api prefix into default base URL ([f374aa0](https://github.com/hyper-serve/hyperserve-js/commit/f374aa0e5fe08e06baabbf9d749678d310a31f76))
* pass request/response fields through as camelCase ([fb9be50](https://github.com/hyper-serve/hyperserve-js/commit/fb9be50e4566e1202472cd1bd21e787b274b990b))

## Changelog

All notable changes to this project will be documented in this file.

This file is auto-maintained by [release-please](https://github.com/googleapis/release-please) based on [Conventional Commits](https://www.conventionalcommits.org/).
