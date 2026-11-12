/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import { conflictingEditors, scopesOverlap, uniqueScopes, describeScope, type EditingScope } from "./editingPresence.ts";

const scope = (gate = "FVAC", date: string | null = "2026-11-12", kind: "plan" | "capacity" = "plan"): EditingScope => ({ kind, gate, date });

test("conflicts follow the edited gate and day; capacity affects every date of its gate", () => {
  assert.equal(scopesOverlap(scope(), scope()), true);
  assert.equal(scopesOverlap(scope(), scope("FIN")), false);
  assert.equal(scopesOverlap(scope(), scope("FVAC", "2026-11-13")), false);
  assert.equal(scopesOverlap(scope(), scope("FVAC", null, "capacity")), true);
  assert.equal(scopesOverlap(scope("FVAC", null, "capacity"), scope("FVAC", "2027-01-01")), true);
  assert.equal(scopesOverlap(scope("FVAC", null), scope()), true);
});

test("warnings exclude the current account and viewing without edits never warns", () => {
  const editors = ["me", "other"].map(username => ({ username, fullName: username, role: "planner", scopes: [scope()] }));
  assert.deepEqual(conflictingEditors(editors, [scope()], "me").map(editor => editor.username), ["other"]);
  assert.deepEqual(conflictingEditors(editors, [], "me"), []);
  assert.deepEqual(conflictingEditors(editors, [scope("FIN")], "me"), []);
});

test("scope lists are stable and bounded while retaining warnings for large drafts", () => {
  assert.deepEqual(uniqueScopes([scope("FIN"), scope(), scope()]), uniqueScopes([scope(), scope("FIN")]));
  const large = Array.from({ length: 300 }, (_, index) => scope("FVAC", `2026-${index}`));
  assert.deepEqual(uniqueScopes(large), [scope("FVAC", null)]);
  assert.equal(describeScope(scope()), "Plan · FVAC · 12/11/2026");
  assert.equal(describeScope(scope("FIN", null, "capacity")), "Capacity · FIN");
});
