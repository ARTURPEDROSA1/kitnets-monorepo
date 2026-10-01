import { describe, expect, it } from "vitest";
import { SIDEBAR_GROUP_KEYS, sanitizeCollapsedGroups } from "./sidebar-groups";
import { SIDEBAR_GROUPS_KEY, sidebarPrefKey, tableKeyFromSidebarPrefKey } from "./ui-preferences";

describe("the sidebar entry of user_ui_preferences", () => {
    it("is stored under sidebar:collapsed-groups and read back from it only", () => {
        expect(sidebarPrefKey(SIDEBAR_GROUPS_KEY)).toBe("sidebar:collapsed-groups");
        expect(tableKeyFromSidebarPrefKey("sidebar:collapsed-groups")).toBe("collapsed-groups");
        expect(tableKeyFromSidebarPrefKey("hidden-columns:income-ledger")).toBeNull();
        expect(sidebarPrefKey("Collapsed Groups")).toBeNull();
    });
});

describe("sanitizeCollapsedGroups", () => {
    it("keeps known keys in menu order, once each", () => {
        expect(sanitizeCollapsedGroups(["ferramentas", "contabil", "contabil"])).toEqual(["contabil", "ferramentas"]);
        expect(sanitizeCollapsedGroups([...SIDEBAR_GROUP_KEYS].reverse())).toEqual([...SIDEBAR_GROUP_KEYS]);
        expect(sanitizeCollapsedGroups([])).toEqual([]);
    });

    it("drops unknown keys and rejects anything that is not a list of strings", () => {
        expect(sanitizeCollapsedGroups(["contabil", "sair", "<script>"])).toEqual(["contabil"]);
        expect(sanitizeCollapsedGroups("contabil")).toBeNull();
        expect(sanitizeCollapsedGroups([1, "contabil"])).toBeNull();
        expect(sanitizeCollapsedGroups(null)).toBeNull();
        expect(sanitizeCollapsedGroups(undefined)).toBeNull();
    });
});
