

/** A human-selected context presentation; it is not an AI/session persona. */

export class IdentityAttributionError extends Error { name = "IdentityAttributionError"; }

export const emptyState = () => Object.freeze({ systems: Object.freeze([]), members: Object.freeze([]), masks: Object.freeze([]), receipts: Object.freeze([]), switches: Object.freeze([]) });

export function createSystem(state, input) {
  requiredId(input.id, "system id");
  if (state.systems.some((system) => system.id === input.id)) throw new IdentityAttributionError("system id already exists");
  if (!Array.isArray(input.accountRefs) || input.accountRefs.length === 0) throw new IdentityAttributionError("a system needs at least one linked account");
  const accountRefs = freezeAccounts(input.accountRefs);
  for (const ref of accountRefs) if (state.systems.some((system) => system.accountRefs.some((other) => sameAccount(other, ref)))) throw new IdentityAttributionError("a linked account already belongs to another system");
  const system = Object.freeze({ id: input.id, accountRefs, ...(input.name === undefined ? {} : { name: field(input.name) }), ...(input.description === undefined ? {} : { description: field(input.description) }), switchHistory: admittedSwitchHistory(input.switchHistory ?? "disabled") });
  return Object.freeze({ state: next(state, { systems: [...state.systems, system] }), system });
}

export function addMember(state, input) {
  requiredId(input.id, "member id");
  systemOf(state, input.systemId);
  if (state.members.some((member) => member.id === input.id)) throw new IdentityAttributionError("member id already exists");
  const member = Object.freeze({ id: input.id, systemId: input.systemId, name: field(input.name), ...(input.description === undefined ? {} : { description: field(input.description) }), ...(input.pronouns === undefined ? {} : { pronouns: field(input.pronouns) }), fields: freezeFields(input.fields ?? {}) });
  return Object.freeze({ state: next(state, { members: [...state.members, member] }), member });
}

export function addContextMask(state, input) {
  requiredId(input.id, "mask id");
  const member = memberOf(state, input.memberId);
  if (state.masks.some((mask) => mask.id === input.id)) throw new IdentityAttributionError("mask id already exists");
  const context = requiredContext(input.context); requiredText(input.displayName, "display name");
  const proxyTags = freezeTags(input.proxyTags);
  const mask = Object.freeze({ id: input.id, memberId: member.id, context, displayName: input.displayName, ...(input.avatarUrl === undefined ? {} : { avatarUrl: httpsUrl(input.avatarUrl, "avatar URL") }), proxyTags, fields: freezeFields(input.fields ?? {}) });
  return Object.freeze({ state: next(state, { masks: [...state.masks, mask] }), mask });
}

export function parseExplicitProxy(state, input) {
  const sourceAccount = requiredAccount(input.account), context = requiredContext(input.context);
  if (typeof input.content !== "string") throw new IdentityAttributionError("proxy content must be a string");
  const system = state.systems.find((candidate) => candidate.accountRefs.some((account) => sameAccount(account, sourceAccount)));
  if (system === undefined) return Object.freeze({ kind: "no-match", reason: "account is not linked to a system" });
  const matches = state.masks.filter((mask) => memberOf(state, mask.memberId).systemId === system.id && sameContext(mask.context, context) && mask.proxyTags.some((tag) => wrapped(input.content, tag)));
  if (matches.length === 0) return Object.freeze({ kind: "no-match", reason: "content does not match an explicit proxy tag" });
  if (matches.length !== 1) return Object.freeze({ kind: "ambiguous", reason: "more than one mask matches the explicit proxy tag" });
  const mask = matches[0];
  const tag = mask.proxyTags.find((candidate) => wrapped(input.content, candidate));
  return Object.freeze({ kind: "matched", memberId: mask.memberId, maskId: mask.id, body: input.content.slice(tag.prefix.length, input.content.length - tag.suffix.length) });
}

export function proposeDiscordProxy(state, input) {
  requiredId(input.receiptId, "receipt id"); requiredText(input.sourceMessageId, "source message id");
  if (input.replyTo !== undefined) requiredText(input.replyTo, "reply reference");
  if (input.attachments !== undefined && (!Array.isArray(input.attachments) || input.attachments.some((attachment) => typeof attachment !== "string" || attachment.trim() === ""))) throw new IdentityAttributionError("attachment references must be nonempty strings");
  if (state.receipts.some((receipt) => receipt.id === input.receiptId)) throw new IdentityAttributionError("receipt id already exists");
  const parsed = parseExplicitProxy(state, { account: input.sourceAccount, context: input.context, content: input.content });
  if (parsed.kind !== "matched") return parsed;
  const mask = maskOf(state, parsed.maskId), member = memberOf(state, parsed.memberId);
  const receipt = Object.freeze({ id: input.receiptId, source: requiredAccount(input.sourceAccount), systemId: member.systemId, memberId: member.id, maskId: mask.id, context: requiredContext(input.context), sourceMessageId: input.sourceMessageId, status: "proposed" });
  const proposal = Object.freeze({ kind: "discord-webhook-proposal", content: parsed.body, displayName: mask.displayName, ...(mask.avatarUrl === undefined ? {} : { avatarUrl: mask.avatarUrl }), ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }), attachments: Object.freeze([...(input.attachments ?? [])]) });
  return Object.freeze({ state: next(state, { receipts: [...state.receipts, receipt] }), proposal, receipt });
}

export function projectPublicSpeaker(state, receiptId) {
  const receipt = receiptOf(state, receiptId), member = memberOf(state, receipt.memberId), mask = maskOf(state, receipt.maskId);
  return Object.freeze({ memberId: member.id, maskId: mask.id, displayName: mask.displayName, fields: publicFields({ name: member.name, ...(member.description === undefined ? {} : { description: member.description }), ...(member.pronouns === undefined ? {} : { pronouns: member.pronouns }), ...member.fields, ...mask.fields }) });
}

export function resolveModeratorAttribution(state, input) {
  if (input.authorizedPurpose !== "moderation") throw new IdentityAttributionError("moderator attribution requires the moderation purpose");
  const receipt = receiptOf(state, input.receiptId);
  return Object.freeze({ receiptId: receipt.id, sourceAccount: receipt.source, systemId: receipt.systemId, memberId: receipt.memberId, maskId: receipt.maskId });
}

export function exportSystem(state, systemId) {
  const system = systemOf(state, systemId), members = state.members.filter((member) => member.systemId === system.id), memberIds = new Set(members.map((member) => member.id));
  return Object.freeze({ version: 1, system, members: Object.freeze(members), masks: Object.freeze(state.masks.filter((mask) => memberIds.has(mask.memberId))), receipts: Object.freeze(state.receipts.filter((receipt) => receipt.systemId === system.id)), switches: Object.freeze(state.switches.filter((record) => record.systemId === system.id)) });
}

export function importSystem(state, record) {
  if (record.version !== 1) throw new IdentityAttributionError("unsupported portable record version");
  if (!Array.isArray(record.members) || !Array.isArray(record.masks) || !Array.isArray(record.receipts) || !Array.isArray(record.switches)) throw new IdentityAttributionError("portable record collections are required");
  let imported = createSystem(state, record.system).state;
  for (const member of record.members) imported = addMember(imported, member).state;
  for (const mask of record.masks) imported = addContextMask(imported, mask).state;
  for (const receipt of record.receipts) {
    requiredId(receipt.id, "receipt id"); requiredText(receipt.sourceMessageId, "source message id");
    const source = requiredAccount(receipt.source), context = requiredContext(receipt.context);
    const member = memberOf(imported, receipt.memberId), mask = maskOf(imported, receipt.maskId);
    if (receipt.status !== "proposed" || receipt.systemId !== record.system.id || member.systemId !== record.system.id || mask.memberId !== member.id || !sameContext(mask.context, context) || !record.system.accountRefs.some((account) => sameAccount(account, source)) || imported.receipts.some((candidate) => candidate.id === receipt.id)) throw new IdentityAttributionError("portable receipt is inconsistent");
    imported = next(imported, { receipts: [...imported.receipts, Object.freeze({ ...receipt, source, context })] });
  }
  for (const recordSwitch of record.switches) imported = appendSwitch(imported, recordSwitch).state;
  return Object.freeze({ state: imported, system: systemOf(imported, record.system.id) });
}

export function eraseSystem(state, systemId) {
  systemOf(state, systemId);
  const memberIds = new Set(state.members.filter((member) => member.systemId === systemId).map((member) => member.id));
  const stateAfter = next(state, { systems: state.systems.filter((system) => system.id !== systemId), members: state.members.filter((member) => member.systemId !== systemId), masks: state.masks.filter((mask) => !memberIds.has(mask.memberId)), receipts: state.receipts.filter((receipt) => receipt.systemId !== systemId), switches: state.switches.filter((record) => record.systemId !== systemId) });
  return Object.freeze({ state: stateAfter, erasedSystemId: systemId });
}

export function appendSwitch(state, input) {
  const system = systemOf(state, input.systemId);
  if (system.switchHistory !== "opted-in") throw new IdentityAttributionError("switch history is disabled until the system opts in");
  if (input.memberIds.length === 0 || !input.memberIds.every((id) => memberOf(state, id).systemId === system.id)) throw new IdentityAttributionError("switch members must belong to the opted-in system");
  const recordedAt = isoInstant(input.recordedAt, "switch timestamp");
  const record = Object.freeze({ systemId: input.systemId, memberIds: Object.freeze([...new Set(input.memberIds)]), recordedAt });
  return Object.freeze({ state: next(state, { switches: [...state.switches, record] }), record });
}

function next(state, patch) { return Object.freeze({ systems: Object.freeze([...(patch.systems ?? state.systems)]), members: Object.freeze([...(patch.members ?? state.members)]), masks: Object.freeze([...(patch.masks ?? state.masks)]), receipts: Object.freeze([...(patch.receipts ?? state.receipts)]), switches: Object.freeze([...(patch.switches ?? state.switches)]) }); }
// Identity/attribution carriers are privacy boundaries, not bags for
// provider SDK responses. Admit exactly the public reference coordinates;
// reject extra fields (including accidental API keys), inherited and
// accessor-supplied data before it reaches any receipt/export.
function exactCarrier(value, names, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new IdentityAttributionError(`${label} needs a plain explicit carrier`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some(key =>
      typeof key !== "string" || !names.includes(key)))
    throw new IdentityAttributionError(`${label} has undeclared or missing fields`);
  const values = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable)
      throw new IdentityAttributionError(`${label} fields must be own data properties`);
    values[name] = descriptor.value;
  }
  return Object.freeze(values);
}
function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "")
    throw new IdentityAttributionError(`${label} is required`);
}
function requiredId(value, label) { requiredText(value, label); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) throw new IdentityAttributionError(`${label} must be a lowercase hyphenated identifier`); }
function requiredAccount(ref) {
  const account = exactCarrier(ref, ["surface", "accountId"], "account reference");
  if (account.surface !== "discord") throw new IdentityAttributionError("unsupported account surface");
  requiredText(account.accountId, "account id");
  return account;
}
function requiredContext(ref) {
  const context = exactCarrier(ref, ["surface", "communityId"], "context reference");
  if (context.surface !== "discord") throw new IdentityAttributionError("unsupported context surface");
  requiredText(context.communityId, "community id");
  return context;
}
function admittedSwitchHistory(value) { if (value !== "disabled" && value !== "opted-in") throw new IdentityAttributionError("invalid switch-history setting"); return value; }
function httpsUrl(value, label) { let parsed; try { parsed = new URL(value); } catch { throw new IdentityAttributionError(`${label} must be an HTTPS URL`); } if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") throw new IdentityAttributionError(`${label} must be an HTTPS URL`); return parsed.href; }
function isoInstant(value, label) { if (typeof value !== "string" || !/([zZ]|[+-]\d\d:\d\d)$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new IdentityAttributionError(`${label} must be an ISO instant with timezone`); return new Date(value).toISOString(); }
function field(value) {
  const normalized = exactCarrier(value, ["value", "visibility"], "member field");
  requiredText(normalized.value, "field value");
  if (!["public", "system", "private"].includes(normalized.visibility)) throw new IdentityAttributionError("invalid field visibility");
  return normalized;
}
function freezeFields(values) {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new IdentityAttributionError("member fields must be an object");
  return Object.freeze(Object.fromEntries(Object.entries(values).map(([key, value]) => { requiredId(key, "field key"); return [key, field(value)]; })));
}
function freezeAccounts(refs) {
  if (!Array.isArray(refs)) throw new IdentityAttributionError("account refs must be a list");
  const seen = new Set();
  return Object.freeze(refs.map(ref => {
    const normalized = requiredAccount(ref);
    const key = `${normalized.surface}:${normalized.accountId}`;
    if (seen.has(key)) throw new IdentityAttributionError("duplicate account ref");
    seen.add(key);
    return normalized;
  }));
}
function freezeTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0)
    throw new IdentityAttributionError("a mask needs at least one explicit proxy tag");
  const seen = new Set();
  return Object.freeze(tags.map(tag => {
    const normalized = exactCarrier(tag, ["prefix", "suffix"], "proxy tag");
    if (typeof normalized.prefix !== "string" || typeof normalized.suffix !== "string" ||
        (normalized.prefix === "" && normalized.suffix === ""))
      throw new IdentityAttributionError("a proxy tag needs string prefix and suffix");
    const key = `${normalized.prefix}\u0000${normalized.suffix}`;
    if (seen.has(key)) throw new IdentityAttributionError("duplicate proxy tag");
    seen.add(key);
    return normalized;
  }));
}
function systemOf(state, id) { const found = state.systems.find((system) => system.id === id); if (found === undefined) throw new IdentityAttributionError("system does not exist"); return found; }
function memberOf(state, id) { const found = state.members.find((member) => member.id === id); if (found === undefined) throw new IdentityAttributionError("member does not exist"); return found; }
function maskOf(state, id) { const found = state.masks.find((mask) => mask.id === id); if (found === undefined) throw new IdentityAttributionError("mask does not exist"); return found; }
function receiptOf(state, id) { const found = state.receipts.find((receipt) => receipt.id === id); if (found === undefined) throw new IdentityAttributionError("attribution receipt does not exist"); return found; }
function sameAccount(left, right) { return left.surface === right.surface && left.accountId === right.accountId; }
function sameContext(left, right) { return left.surface === right.surface && left.communityId === right.communityId; }
function wrapped(content, tag) { return content.startsWith(tag.prefix) && content.endsWith(tag.suffix) && content.length >= tag.prefix.length + tag.suffix.length; }
function publicFields(fields) { return Object.freeze(Object.fromEntries(Object.entries(fields).flatMap(([key, value]) => value.visibility === "public" ? [[key, value.value]] : []))); }
