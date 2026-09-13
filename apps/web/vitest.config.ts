import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors the "@/…" path alias from tsconfig so units that import app modules
// (e.g. lib/rate-limit → utils/supabase/admin) load outside Next.js.
export default defineConfig({
    resolve: {
        alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
        environment: "node",
    },
});
