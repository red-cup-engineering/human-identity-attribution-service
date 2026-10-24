import assert from "node:assert/strict";
import test from "node:test";
import {
  IdentityAttributionError, addContextMask, addMember, createSystem, emptyState,
  exportSystem, importSystem, parseExplicitProxy, projectPublicSpeaker,
  proposeDiscordProxy, resolveModeratorAttribution,
} from "../src/index.mjs";

const account = () => ({ surface: "discord", accountId: "account-original" });
const context = () => ({ surface: "discord", communityId: "guild-one" });
const tag = () => ({ prefix: "[name] ", suffix: "" });

function fixture() {
  const system = createSystem(emptyState(), {
    id: "original-system", accountRefs: [account()], name: { value: "owner", visibility: "private" },
  });
  const member = addMember(system.state, {
    id: "member-one", systemId: "original-system",
    name: { value: "A name", visibility: "private" },
    fields: { publicrole: { value: "writer", visibility: "public" } },
  });
  return addContextMask(member.state, {
    id: "mask-one", memberId: "member-one", context: context(),
    displayName: "Public mask", proxyTags: [tag()],
  }).state;
}

function oneProposal(state = fixture(), source = account(), place = context()) {
  return proposeDiscordProxy(state, {
    receiptId: "receipt-one", sourceMessageId: "message-one",
    sourceAccount: source, context: place, content: "[name] hello",
  });
}

test("ordinary exact source coordinates still form identical portable, public and moderator receipts", () => {
  const result = oneProposal();
  const exported = exportSystem(result.state, "original-system");
  assert.deepEqual(exported.system.accountRefs[0], account());
  assert.deepEqual(result.receipt.source, account());
  assert.deepEqual(result.receipt.context, context());
  assert.deepEqual(projectPublicSpeaker(result.state, "receipt-one").fields,
    { publicrole: "writer" });
  assert.deepEqual(resolveModeratorAttribution(result.state, {
    receiptId: "receipt-one", authorizedPurpose: "moderation",
  }).sourceAccount, account());
  assert.deepEqual(exportSystem(importSystem(emptyState(), exported).state, "original-system"), exported);
  assert.deepEqual(parseExplicitProxy(result.state, {
    account: account(), context: context(), content: "[name] hello",
  }), { kind: "matched", memberId: "member-one", maskId: "mask-one", body: "hello" });
});

test("unexpected credentials on system account references cannot be exported", () => {
  for (const field of ["accessToken", "Authorization", "password", "privateKey"]) {
    const contaminated = { ...account(), [field]: "fixture-only-secret" };
    assert.throws(() => createSystem(emptyState(), {
      id: "original-system", accountRefs: [contaminated],
    }), IdentityAttributionError);
  }
  assert.throws(() => createSystem(emptyState(), {
    id: "original-system", accountRefs: account(),
  }), IdentityAttributionError);
});

test("proxy and export refuse extra bearer/private data before any receipt is admitted", () => {
  for (const extra of ["bearer", "apiKey", "rawAuth"]) {
    const contaminated = { ...account(), [extra]: "fixture-only-secret" };
    assert.throws(() => oneProposal(fixture(), contaminated), IdentityAttributionError);
    assert.throws(() => parseExplicitProxy(fixture(), {
      account: contaminated, context: context(), content: "[name] hello",
    }), IdentityAttributionError);
  }
  const valid = oneProposal();
  const exported = exportSystem(valid.state, "original-system");
  const malicious = { ...exported, receipts: [
    { ...exported.receipts[0], source: { ...account(), accessToken: "fixture-only-secret" } },
  ] };
  assert.throws(() => importSystem(emptyState(), malicious), IdentityAttributionError);
});

test("private context fields cannot be smuggled into mask or source-message receipts", () => {
  const badContext = { ...context(), oauthToken: "fixture-only-secret" };
  const initial = createSystem(emptyState(), { id: "one", accountRefs: [account()] }).state;
  const withMember = addMember(initial, {
    id: "member-one", systemId: "one",
    name: { value: "A", visibility: "private" },
  }).state;
  assert.throws(() => addContextMask(withMember, {
    id: "one-mask", memberId: "member-one", context: badContext,
    displayName: "A mask", proxyTags: [tag()],
  }), IdentityAttributionError);
  assert.throws(() => oneProposal(fixture(), account(), badContext), IdentityAttributionError);
  const good = oneProposal();
  const exportData = exportSystem(good.state, "original-system");
  assert.throws(() => importSystem(emptyState(), {
    ...exportData, masks: [{ ...exportData.masks[0], context: badContext }],
  }), IdentityAttributionError);
  assert.throws(() => importSystem(emptyState(), {
    ...exportData, receipts: [{ ...exportData.receipts[0], context: badContext }],
  }), IdentityAttributionError);
});

test("accessor and inherited sensitive account coordinates cannot execute during admission", () => {
  let calls = 0;
  const getter = { surface: "discord" };
  Object.defineProperty(getter, "accountId", {
    enumerable: true, get() { calls++; return "account-original"; },
  });
  assert.throws(() => createSystem(emptyState(), {
    id: "one", accountRefs: [getter],
  }), IdentityAttributionError);
  assert.equal(calls, 0, "the application cannot trigger an untrusted getter");
  const inherited = Object.create({ surface: "discord" });
  inherited.accountId = "account-original";
  assert.throws(() => createSystem(emptyState(), {
    id: "one", accountRefs: [inherited],
  }), IdentityAttributionError);
  assert.equal(calls, 0);
  const hidden = account();
  Object.defineProperty(hidden, "accessToken", { value: "fixture-only-secret", enumerable: false });
  assert.throws(() => createSystem(emptyState(), {
    id: "one", accountRefs: [hidden],
  }), IdentityAttributionError);
  const marked = account();
  marked[Symbol.for("secrets")] = "fixture-only-secret";
  assert.throws(() => createSystem(emptyState(), {
    id: "one", accountRefs: [marked],
  }), IdentityAttributionError);
});

test("member public/private fields store only declared value and visibility, not provider metadata", () => {
  const system = createSystem(emptyState(), { id: "one", accountRefs: [account()] }).state;
  assert.throws(() => addMember(system, {
    id: "a", systemId: "one",
    name: { value: "A", visibility: "public", apiToken: "fixture-only-secret" },
  }), IdentityAttributionError);
  assert.throws(() => addMember(system, {
    id: "a", systemId: "one", name: { value: "A", visibility: "public" },
    fields: { role: { value: "editor", visibility: "public", rawSecret: "fixture-only-secret" } },
  }), IdentityAttributionError);
  const normal = addMember(system, {
    id: "a", systemId: "one", name: { value: "A", visibility: "public" },
    fields: { role: { value: "editor", visibility: "public" } },
  });
  assert.deepEqual(normal.member.fields.role, { value: "editor", visibility: "public" });
});

test("proxy tag configuration cannot stash credentials or exploit ill-typed fragments", () => {
  const member = addMember(createSystem(emptyState(), {
    id: "one", accountRefs: [account()],
  }).state, {
    id: "a", systemId: "one", name: { value: "A", visibility: "public" },
  }).state;
  for (const tags of [
    [{ ...tag(), authorization: "fixture-only-secret" }],
    [{ prefix: "[name] ", suffix: null }],
    [{ prefix: null, suffix: "" }],
    [{ prefix: "", suffix: "" }],
    { prefix: "[name] ", suffix: "" },
  ]) {
    assert.throws(() => addContextMask(member, {
      id: "mask-a", memberId: "a", context: context(),
      displayName: "A", proxyTags: tags,
    }), IdentityAttributionError);
  }
});

test("incorrect account/context types and non-text content refuse without raw runtime errors", () => {
  const state = fixture();
  for (const bad of [{ surface: "discord", accountId: null },
    { surface: "discord", accountId: 42 },
    { surface: "web", accountId: "account-original" }]) {
    assert.throws(() => parseExplicitProxy(state, {
      account: bad, context: context(), content: "[name] hello",
    }), IdentityAttributionError);
  }
  for (const value of [null, 4, [], {}, undefined]) {
    assert.throws(() => parseExplicitProxy(state, {
      account: account(), context: context(), content: value,
    }), IdentityAttributionError);
  }
  const nullPrototype = Object.assign(Object.create(null), account());
  const admitted = parseExplicitProxy(state, {
    account: nullPrototype, context: context(), content: "[name] hello",
  });
  assert.equal(admitted.kind, "matched");
});

test("same original source and consent boundary still prevents unrelated system attribution", () => {
  const different = { surface: "discord", accountId: "another-account" };
  const original = fixture();
  const notMatched = parseExplicitProxy(original, {
    account: different, context: context(), content: "[name] hello",
  });
  assert.equal(notMatched.kind, "no-match");
  assert.equal(oneProposal(original, different).kind, "no-match");
  assert.throws(() => resolveModeratorAttribution(oneProposal().state, {
    receiptId: "receipt-one", authorizedPurpose: "advertising",
  }), IdentityAttributionError);
});
