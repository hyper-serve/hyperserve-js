import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		browser: "src/browser.ts",
		"react-native": "src/react-native.ts",
	},
	format: ["cjs", "esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	// Splitting is disabled because the three entry points (index, browser, react-native)
	// are designed for distinct runtime environments and are never imported together.
	// Each bundle independently includes the shared error classes — this is intentional:
	// consumers import errors from the same entry they use (e.g. @hyperserve/hyperserve-js/browser),
	// so instanceof checks remain consistent within each bundle context.
	splitting: false,
	treeshake: true,
	target: "es2020",
});
