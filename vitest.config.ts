import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		// Both date helpers read local-time getters off a UTC-parsed Date, so
		// their output moves with the machine's zone. Pin it, or the same test
		// passes in CI and fails on a laptop west of Greenwich.
		env: { TZ: "UTC" },
	},
});
