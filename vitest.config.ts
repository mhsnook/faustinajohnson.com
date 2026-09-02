import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		// Deliberately no TZ pin. The date helpers name their own zone, so these
		// tests must pass under whatever zone the machine is in — that is the
		// property being tested. Pinning TZ here would hide a regression to
		// host-local getters, which is the bug this suite exists to catch.
	},
});
