import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IdentityAttributionError, addContextMask, addMember, appendSwitch, createSystem,
  emptyState, eraseSystem, exportSystem, importSystem, parseExplicitProxy,
  projectPublicSpeaker, proposeDiscordProxy, resolveModeratorAttribution,

} from "../src/identity-attribution.mjs";

const account = Object.freeze({ surface: "discord", accountId: "account-1" });
const context = Object.freeze({ surface: "discord", communityId: "guild-1" });

function fixture() {
  let state = createSystem(emptyState(), { id: "system-one", accountRefs: [account], name: { value: "Private system", visibility: "private" } }).state;
  state = addMember(state, { id: "member-a", systemId: "system-one", name: { value: "A", visibility: "public" }, pronouns: { value: "they/them", visibility: "public" }, fields: { note: { value: "not public", visibility: "private" } } }).state;
  state = addMember(state, { id: "member-b", systemId: "system-one", name: { value: "B", visibility: "system" } }).state;
  state = addContextMask(state, { id: "mask-a", memberId: "member-a", context, displayName: "A at TTI", proxyTags: [{ prefix: "[a] ", suffix: "" }] }).state;
  return addContextMask(state, { id: "mask-b", memberId: "member-b", context, displayName: "B at TTI", proxyTags: [{ prefix: "[b] ", suffix: "" }] }).state;
}

test("system ownership is explicit and a Discord account cannot belong to two systems", () => {
  const state = createSystem(emptyState(), { id: "system-one", accountRefs: [account] }).state;
  assert.deepEqual(state.systems[0]?.accountRefs, [account]);
  assert.throws(() => createSystem(state, { id: "system-two", accountRefs: [account] }), IdentityAttributionError);
  assert.throws(() => createSystem(emptyState(), { id: "system-invalid", accountRefs: [account], switchHistory: "ambient" }), IdentityAttributionError);
});

test("members and context masks must retain their system relation", () => {
  const state = fixture();
  assert.equal(state.members.length, 2);
  assert.equal(state.masks.length, 2);
  assert.throws(() => addContextMask(state, { id: "broken", memberId: "missing", context, displayName: "Broken", proxyTags: [{ prefix: "[x]", suffix: "" }] }), IdentityAttributionError);
  assert.equal(exportSystem(state, "system-one").masks[0]?.memberId, "member-a");
});

test("explicit proxy tags match exactly and leave untagged content inert", () => {
  const state = fixture();
  assert.deepEqual(parseExplicitProxy(state, { account, context, content: "[a] hello" }), { kind: "matched", memberId: "member-a", maskId: "mask-a", body: "hello" });
  assert.equal(parseExplicitProxy(state, { account, context, content: "hello" }).kind, "no-match");
});

test("an ambiguous tag is refused without a proposal or receipt", () => {
  let state = fixture();
  state = addContextMask(state, { id: "mask-c", memberId: "member-b", context, displayName: "B alternate", proxyTags: [{ prefix: "[a] ", suffix: "" }] }).state;
  const result = proposeDiscordProxy(state, { receiptId: "receipt-one", sourceAccount: account, context, sourceMessageId: "source-1", content: "[a] collision" });
  assert.ok(!("proposal" in result));
  if ("proposal" in result) return;
  assert.equal(result.kind, "ambiguous");
  assert.equal(state.receipts.length, 0);
});

test("a Discord webhook proposal is inert and preserves reply and attachment references", () => {
  const result = proposeDiscordProxy(fixture(), { receiptId: "receipt-one", sourceAccount: account, context, sourceMessageId: "source-1", content: "[a] hello", replyTo: "reply-1", attachments: ["attachment-1"] });
  assert.ok("proposal" in result);
  if (!("proposal" in result)) return;
  assert.deepEqual(result.proposal, { kind: "discord-webhook-proposal", content: "hello", displayName: "A at TTI", replyTo: "reply-1", attachments: ["attachment-1"] });
  assert.equal(result.receipt.status, "proposed");
  assert.equal(result.state.receipts.length, 1);
  assert.throws(() => proposeDiscordProxy(fixture(), { receiptId: "receipt-two", sourceAccount: account, context, sourceMessageId: "source-2", content: "[a] hello", attachments: [""] }), IdentityAttributionError);
});

test("public projections disclose only selected public speaker fields", () => {
  const result = proposeDiscordProxy(fixture(), { receiptId: "receipt-one", sourceAccount: account, context, sourceMessageId: "source-1", content: "[a] hello" });
  assert.ok("proposal" in result);
  if (!("proposal" in result)) return;
  assert.deepEqual(projectPublicSpeaker(result.state, "receipt-one"), { memberId: "member-a", maskId: "mask-a", displayName: "A at TTI", fields: { name: "A", pronouns: "they/them" } });
});

test("moderator attribution requires the exact moderation purpose", () => {
  const result = proposeDiscordProxy(fixture(), { receiptId: "receipt-one", sourceAccount: account, context, sourceMessageId: "source-1", content: "[a] hello" });
  assert.ok("proposal" in result);
  if (!("proposal" in result)) return;
  assert.throws(() => resolveModeratorAttribution(result.state, { receiptId: "receipt-one", authorizedPurpose: "public" }), IdentityAttributionError);
  assert.deepEqual(resolveModeratorAttribution(result.state, { receiptId: "receipt-one", authorizedPurpose: "moderation" }), { receiptId: "receipt-one", sourceAccount: account, systemId: "system-one", memberId: "member-a", maskId: "mask-a" });
});

test("export/import preserves owned state and deletion erases all dependent records", () => {
  const proposed = proposeDiscordProxy(fixture(), { receiptId: "receipt-one", sourceAccount: account, context, sourceMessageId: "source-1", content: "[a] hello" });
  assert.ok("proposal" in proposed);
  if (!("proposal" in proposed)) return;
  const exported = exportSystem(proposed.state, "system-one");
  const imported = importSystem(emptyState(), exported).state;
  assert.deepEqual(exportSystem(imported, "system-one"), exported);
  const receipt = exported.receipts[0];
  const tampered = { ...exported, receipts: [{ ...receipt, source: { ...receipt.source, accountId: "unlinked-account" } }] };
  assert.throws(() => importSystem(emptyState(), tampered), IdentityAttributionError);
  const erased = eraseSystem(imported, "system-one").state;
  assert.equal(erased.systems.length, 0);
  assert.equal(erased.members.length, 0);
  assert.equal(erased.masks.length, 0);
  assert.equal(erased.receipts.length, 0);
  assert.throws(() => exportSystem(erased, "system-one"), IdentityAttributionError);
});

test("switches are absent by default and only append after explicit opt-in", () => {
  const disabled = fixture();
  assert.equal(disabled.switches.length, 0);
  assert.throws(() => appendSwitch(disabled, { systemId: "system-one", memberIds: ["member-a"], recordedAt: "2026-08-29T00:00:00Z" }), IdentityAttributionError);
  let optedIn = createSystem(emptyState(), { id: "system-opted", accountRefs: [{ surface: "discord", accountId: "account-2" }], switchHistory: "opted-in" }).state;
  optedIn = addMember(optedIn, { id: "member-opted", systemId: "system-opted", name: { value: "Opted", visibility: "private" } }).state;
  assert.equal(appendSwitch(optedIn, { systemId: "system-opted", memberIds: ["member-opted"], recordedAt: "2026-08-29T00:00:00Z" }).state.switches.length, 1);
  assert.throws(() => appendSwitch(optedIn, { systemId: "system-opted", memberIds: ["member-opted"], recordedAt: "sometime" }), IdentityAttributionError);
});
