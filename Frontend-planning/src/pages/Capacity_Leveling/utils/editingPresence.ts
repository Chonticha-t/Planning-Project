export interface EditingScope {
  kind: "plan" | "capacity";
  gate: string;
  date: string | null;
}

export interface EditingUser {
  username: string;
  fullName: string;
  role: string;
  scopes: EditingScope[];
}

export const uniqueScopes = (scopes: EditingScope[]): EditingScope[] => {
  let unique = [...new Map(scopes.map(scope => [JSON.stringify([scope.kind, scope.gate, scope.date]), scope])).values()];
  // Very large drafts use a whole-gate indication instead of exceeding the heartbeat limit.
  if (unique.length > 256) unique = [...new Map(unique.map(scope => [JSON.stringify([scope.kind, scope.gate]), { ...scope, date: null }])).values()];
  return unique.sort((a, b) => a.gate.localeCompare(b.gate) || a.kind.localeCompare(b.kind) || (a.date ?? "").localeCompare(b.date ?? ""));
};

export const scopesOverlap = (a: EditingScope, b: EditingScope): boolean =>
  a.gate === b.gate && (a.kind === "capacity" || b.kind === "capacity" || !a.date || !b.date || a.date === b.date);

export const conflictingEditors = (editors: EditingUser[], ownScopes: EditingScope[], username?: string): EditingUser[] =>
  editors.filter(editor => editor.username !== username && editor.scopes.some(scope => ownScopes.some(own => scopesOverlap(scope, own))));

export const describeScope = (scope: EditingScope): string =>
  scope.kind === "capacity" ? `Capacity · ${scope.gate}` : `Plan · ${scope.gate}${scope.date ? ` · ${scope.date.split("-").reverse().join("/")}` : ""}`;
