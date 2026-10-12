export type Surface = "discord";
export type Visibility = "public" | "system" | "private";
export type SwitchHistory = "disabled" | "opted-in";

export interface ExternalAccountRef { readonly surface: Surface; readonly accountId: string }
export interface Context { readonly surface: Surface; readonly communityId: string }
export interface VisibleField { readonly value: string; readonly visibility: Visibility }
export interface ProxyTag { readonly prefix: string; readonly suffix: string }
export interface IdentitySystem {
  readonly id: string;
  readonly accountRefs: readonly ExternalAccountRef[];
  readonly name?: VisibleField;
  readonly description?: VisibleField;
  readonly switchHistory: SwitchHistory;
}
export interface HumanMember {
  readonly id: string;
  readonly systemId: string;
  readonly name: VisibleField;
  readonly description?: VisibleField;
  readonly pronouns?: VisibleField;
  readonly fields: Readonly<Record<string, VisibleField>>;
}
/** A human-selected context presentation; it is not an AI/session persona. */
export interface ContextMask {
  readonly id: string;
  readonly memberId: string;
  readonly context: Context;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly proxyTags: readonly ProxyTag[];
  readonly fields: Readonly<Record<string, VisibleField>>;
}
export interface AttributionReceipt {
  readonly id: string;
  readonly source: ExternalAccountRef;
  readonly systemId: string;
  readonly memberId: string;
  readonly maskId: string;
  readonly context: Context;
  readonly sourceMessageId: string;
  readonly status: "proposed";
}
export interface SwitchRecord { readonly systemId: string; readonly memberIds: readonly string[]; readonly recordedAt: string }
export interface IdentityAttributionState {
  readonly systems: readonly IdentitySystem[];
  readonly members: readonly HumanMember[];
  readonly masks: readonly ContextMask[];
  readonly receipts: readonly AttributionReceipt[];
  readonly switches: readonly SwitchRecord[];
}
export interface DiscordWebhookProposal {
  readonly kind: "discord-webhook-proposal";
  readonly content: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly replyTo?: string;
  readonly attachments: readonly string[];
}
export interface PublicSpeaker { readonly memberId: string; readonly maskId: string; readonly displayName: string; readonly fields: Readonly<Record<string, string>> }
export interface ModeratorAttribution { readonly receiptId: string; readonly sourceAccount: ExternalAccountRef; readonly systemId: string; readonly memberId: string; readonly maskId: string }
export type ProxyParseResult =
  | Readonly<{ kind: "matched"; memberId: string; maskId: string; body: string }>
  | Readonly<{ kind: "no-match"; reason: string }>
  | Readonly<{ kind: "ambiguous"; reason: string }>;

export class IdentityAttributionError extends Error { override name = "IdentityAttributionError"; }

export const emptyState = (): IdentityAttributionState => Object.freeze({ systems: Object.freeze([]), members: Object.freeze([]), masks: Object.freeze([]), receipts: Object.freeze([]), switches: Object.freeze([]) });

export function createSystem(state: IdentityAttributionState, input: Readonly<{ id: string; accountRefs: readonly ExternalAccountRef[]; name?: VisibleField; description?: VisibleField; switchHistory?: SwitchHistory }>): Readonly<{ state: IdentityAttributionState; system: IdentitySystem }> {
  requiredId(input.id, "system id");
  if (state.systems.some((system) => system.id === input.id)) throw new IdentityAttributionError("system id already exists");
  if (input.accountRefs.length === 0) throw new IdentityAttributionError("a system needs at least one linked account");
  const accountRefs = freezeAccounts(input.accountRefs);
  for (const ref of accountRefs) if (state.systems.some((system) => system.accountRefs.some((other) => sameAccount(other, ref)))) throw new IdentityAttributionError("a linked account already belongs to another system");
  const system = Object.freeze({ id: input.id, accountRefs, ...(input.name === undefined ? {} : { name: field(input.name) }), ...(input.description === undefined ? {} : { description: field(input.description) }), switchHistory: admittedSwitchHistory(input.switchHistory ?? "disabled") });
  return Object.freeze({ state: next(state, { systems: [...state.systems, system] }), system });
}

export function addMember(state: IdentityAttributionState, input: Readonly<{ id: string; systemId: string; name: VisibleField; description?: VisibleField; pronouns?: VisibleField; fields?: Readonly<Record<string, VisibleField>> }>): Readonly<{ state: IdentityAttributionState; member: HumanMember }> {
  requiredId(input.id, "member id");
  systemOf(state, input.systemId);
  if (state.members.some((member) => member.id === input.id)) throw new IdentityAttributionError("member id already exists");
  const member = Object.freeze({ id: input.id, systemId: input.systemId, name: field(input.name), ...(input.description === undefined ? {} : { description: field(input.description) }), ...(input.pronouns === undefined ? {} : { pronouns: field(input.pronouns) }), fields: freezeFields(input.fields ?? {}) });
  return Object.freeze({ state: next(state, { members: [...state.members, member] }), member });
}

export function addContextMask(state: IdentityAttributionState, input: Readonly<{ id: string; memberId: string; context: Context; displayName: string; avatarUrl?: string; proxyTags: readonly ProxyTag[]; fields?: Readonly<Record<string, VisibleField>> }>): Readonly<{ state: IdentityAttributionState; mask: ContextMask }> {
  requiredId(input.id, "mask id");
  const member = memberOf(state, input.memberId);
  if (state.masks.some((mask) => mask.id === input.id)) throw new IdentityAttributionError("mask id already exists");
  requiredContext(input.context); requiredText(input.displayName, "display name");
  const proxyTags = freezeTags(input.proxyTags);
  const mask = Object.freeze({ id: input.id, memberId: member.id, context: Object.freeze({ ...input.context }), displayName: input.displayName, ...(input.avatarUrl === undefined ? {} : { avatarUrl: httpsUrl(input.avatarUrl, "avatar URL") }), proxyTags, fields: freezeFields(input.fields ?? {}) });
  return Object.freeze({ state: next(state, { masks: [...state.masks, mask] }), mask });
}

export function parseExplicitProxy(state: IdentityAttributionState, input: Readonly<{ account: ExternalAccountRef; context: Context; content: string }>): ProxyParseResult {
  requiredAccount(input.account); requiredContext(input.context);
  const system = state.systems.find((candidate) => candidate.accountRefs.some((account) => sameAccount(account, input.account)));
  if (system === undefined) return Object.freeze({ kind: "no-match", reason: "account is not linked to a system" });
  const matches = state.masks.filter((mask) => memberOf(state, mask.memberId).systemId === system.id && sameContext(mask.context, input.context) && mask.proxyTags.some((tag) => wrapped(input.content, tag)));
  if (matches.length === 0) return Object.freeze({ kind: "no-match", reason: "content does not match an explicit proxy tag" });
  if (matches.length !== 1) return Object.freeze({ kind: "ambiguous", reason: "more than one mask matches the explicit proxy tag" });
  const mask = matches[0]!;
  const tag = mask.proxyTags.find((candidate) => wrapped(input.content, candidate))!;
  return Object.freeze({ kind: "matched", memberId: mask.memberId, maskId: mask.id, body: input.content.slice(tag.prefix.length, input.content.length - tag.suffix.length) });
}

export function proposeDiscordProxy(state: IdentityAttributionState, input: Readonly<{ receiptId: string; sourceAccount: ExternalAccountRef; context: Context; sourceMessageId: string; content: string; replyTo?: string; attachments?: readonly string[] }>): Readonly<{ state: IdentityAttributionState; proposal: DiscordWebhookProposal; receipt: AttributionReceipt }> | ProxyParseResult {
  requiredId(input.receiptId, "receipt id"); requiredText(input.sourceMessageId, "source message id");
  if (input.replyTo !== undefined) requiredText(input.replyTo, "reply reference");
  if (input.attachments !== undefined && (!Array.isArray(input.attachments) || input.attachments.some((attachment) => typeof attachment !== "string" || attachment.trim() === ""))) throw new IdentityAttributionError("attachment references must be nonempty strings");
  if (state.receipts.some((receipt) => receipt.id === input.receiptId)) throw new IdentityAttributionError("receipt id already exists");
  const parsed = parseExplicitProxy(state, { account: input.sourceAccount, context: input.context, content: input.content });
  if (parsed.kind !== "matched") return parsed;
  const mask = maskOf(state, parsed.maskId), member = memberOf(state, parsed.memberId);
  const receipt = Object.freeze({ id: input.receiptId, source: Object.freeze({ ...input.sourceAccount }), systemId: member.systemId, memberId: member.id, maskId: mask.id, context: Object.freeze({ ...input.context }), sourceMessageId: input.sourceMessageId, status: "proposed" as const });
  const proposal = Object.freeze({ kind: "discord-webhook-proposal" as const, content: parsed.body, displayName: mask.displayName, ...(mask.avatarUrl === undefined ? {} : { avatarUrl: mask.avatarUrl }), ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }), attachments: Object.freeze([...(input.attachments ?? [])]) });
  return Object.freeze({ state: next(state, { receipts: [...state.receipts, receipt] }), proposal, receipt });
}

export function projectPublicSpeaker(state: IdentityAttributionState, receiptId: string): PublicSpeaker {
  const receipt = receiptOf(state, receiptId), member = memberOf(state, receipt.memberId), mask = maskOf(state, receipt.maskId);
  return Object.freeze({ memberId: member.id, maskId: mask.id, displayName: mask.displayName, fields: publicFields({ name: member.name, ...(member.description === undefined ? {} : { description: member.description }), ...(member.pronouns === undefined ? {} : { pronouns: member.pronouns }), ...member.fields, ...mask.fields }) });
}

export function resolveModeratorAttribution(state: IdentityAttributionState, input: Readonly<{ receiptId: string; authorizedPurpose: "moderation" | string }>): ModeratorAttribution {
  if (input.authorizedPurpose !== "moderation") throw new IdentityAttributionError("moderator attribution requires the moderation purpose");
  const receipt = receiptOf(state, input.receiptId);
  return Object.freeze({ receiptId: receipt.id, sourceAccount: receipt.source, systemId: receipt.systemId, memberId: receipt.memberId, maskId: receipt.maskId });
}

export interface PortableSystemRecord { readonly version: 1; readonly system: IdentitySystem; readonly members: readonly HumanMember[]; readonly masks: readonly ContextMask[]; readonly receipts: readonly AttributionReceipt[]; readonly switches: readonly SwitchRecord[] }
export function exportSystem(state: IdentityAttributionState, systemId: string): PortableSystemRecord {
  const system = systemOf(state, systemId), members = state.members.filter((member) => member.systemId === system.id), memberIds = new Set(members.map((member) => member.id));
  return Object.freeze({ version: 1, system, members: Object.freeze(members), masks: Object.freeze(state.masks.filter((mask) => memberIds.has(mask.memberId))), receipts: Object.freeze(state.receipts.filter((receipt) => receipt.systemId === system.id)), switches: Object.freeze(state.switches.filter((record) => record.systemId === system.id)) });
}

export function importSystem(state: IdentityAttributionState, record: PortableSystemRecord): Readonly<{ state: IdentityAttributionState; system: IdentitySystem }> {
  if (record.version !== 1) throw new IdentityAttributionError("unsupported portable record version");
  if (!Array.isArray(record.members) || !Array.isArray(record.masks) || !Array.isArray(record.receipts) || !Array.isArray(record.switches)) throw new IdentityAttributionError("portable record collections are required");
  let imported = createSystem(state, record.system).state;
  for (const member of record.members) imported = addMember(imported, member).state;
  for (const mask of record.masks) imported = addContextMask(imported, mask).state;
  for (const receipt of record.receipts) {
    requiredId(receipt.id, "receipt id"); requiredText(receipt.sourceMessageId, "source message id"); requiredAccount(receipt.source); requiredContext(receipt.context);
    const member = memberOf(imported, receipt.memberId), mask = maskOf(imported, receipt.maskId);
    if (receipt.status !== "proposed" || receipt.systemId !== record.system.id || member.systemId !== record.system.id || mask.memberId !== member.id || !sameContext(mask.context, receipt.context) || !record.system.accountRefs.some((account) => sameAccount(account, receipt.source)) || imported.receipts.some((candidate) => candidate.id === receipt.id)) throw new IdentityAttributionError("portable receipt is inconsistent");
    imported = next(imported, { receipts: [...imported.receipts, Object.freeze({ ...receipt, source: Object.freeze({ ...receipt.source }), context: Object.freeze({ ...receipt.context }) })] });
  }
  for (const recordSwitch of record.switches) imported = appendSwitch(imported, recordSwitch).state;
  return Object.freeze({ state: imported, system: systemOf(imported, record.system.id) });
}

export function eraseSystem(state: IdentityAttributionState, systemId: string): Readonly<{ state: IdentityAttributionState; erasedSystemId: string }> {
  systemOf(state, systemId);
  const memberIds = new Set(state.members.filter((member) => member.systemId === systemId).map((member) => member.id));
  const stateAfter = next(state, { systems: state.systems.filter((system) => system.id !== systemId), members: state.members.filter((member) => member.systemId !== systemId), masks: state.masks.filter((mask) => !memberIds.has(mask.memberId)), receipts: state.receipts.filter((receipt) => receipt.systemId !== systemId), switches: state.switches.filter((record) => record.systemId !== systemId) });
  return Object.freeze({ state: stateAfter, erasedSystemId: systemId });
}

export function appendSwitch(state: IdentityAttributionState, input: SwitchRecord): Readonly<{ state: IdentityAttributionState; record: SwitchRecord }> {
  const system = systemOf(state, input.systemId);
  if (system.switchHistory !== "opted-in") throw new IdentityAttributionError("switch history is disabled until the system opts in");
  if (input.memberIds.length === 0 || !input.memberIds.every((id) => memberOf(state, id).systemId === system.id)) throw new IdentityAttributionError("switch members must belong to the opted-in system");
  const recordedAt = isoInstant(input.recordedAt, "switch timestamp");
  const record = Object.freeze({ systemId: input.systemId, memberIds: Object.freeze([...new Set(input.memberIds)]), recordedAt });
  return Object.freeze({ state: next(state, { switches: [...state.switches, record] }), record });
}

function next(state: IdentityAttributionState, patch: Partial<IdentityAttributionState>): IdentityAttributionState { return Object.freeze({ systems: Object.freeze([...(patch.systems ?? state.systems)]), members: Object.freeze([...(patch.members ?? state.members)]), masks: Object.freeze([...(patch.masks ?? state.masks)]), receipts: Object.freeze([...(patch.receipts ?? state.receipts)]), switches: Object.freeze([...(patch.switches ?? state.switches)]) }); }
function requiredText(value: string, label: string): void { if (value.trim() === "") throw new IdentityAttributionError(`${label} is required`); }
function requiredId(value: string, label: string): void { requiredText(value, label); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) throw new IdentityAttributionError(`${label} must be a lowercase hyphenated identifier`); }
function requiredAccount(ref: ExternalAccountRef): void { if (ref.surface !== "discord") throw new IdentityAttributionError("unsupported account surface"); requiredText(ref.accountId, "account id"); }
function requiredContext(context: Context): void { if (context.surface !== "discord") throw new IdentityAttributionError("unsupported context surface"); requiredText(context.communityId, "community id"); }
function admittedSwitchHistory(value: string): SwitchHistory { if (value !== "disabled" && value !== "opted-in") throw new IdentityAttributionError("invalid switch-history setting"); return value; }
function httpsUrl(value: string, label: string): string { let parsed: URL; try { parsed = new URL(value); } catch { throw new IdentityAttributionError(`${label} must be an HTTPS URL`); } if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") throw new IdentityAttributionError(`${label} must be an HTTPS URL`); return parsed.href; }
function isoInstant(value: string, label: string): string { if (!/([zZ]|[+-]\d\d:\d\d)$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new IdentityAttributionError(`${label} must be an ISO instant with timezone`); return new Date(value).toISOString(); }
function field(value: VisibleField): VisibleField { requiredText(value.value, "field value"); if (!["public", "system", "private"].includes(value.visibility)) throw new IdentityAttributionError("invalid field visibility"); return Object.freeze({ ...value }); }
function freezeFields(values: Readonly<Record<string, VisibleField>>): Readonly<Record<string, VisibleField>> { return Object.freeze(Object.fromEntries(Object.entries(values).map(([key, value]) => { requiredId(key, "field key"); return [key, field(value)]; }))); }
function freezeAccounts(refs: readonly ExternalAccountRef[]): readonly ExternalAccountRef[] { const seen = new Set<string>(); return Object.freeze(refs.map((ref) => { requiredAccount(ref); const key = `${ref.surface}:${ref.accountId}`; if (seen.has(key)) throw new IdentityAttributionError("duplicate account ref"); seen.add(key); return Object.freeze({ ...ref }); })); }
function freezeTags(tags: readonly ProxyTag[]): readonly ProxyTag[] { if (tags.length === 0) throw new IdentityAttributionError("a mask needs at least one explicit proxy tag"); const seen = new Set<string>(); return Object.freeze(tags.map((tag) => { if (tag.prefix === "" && tag.suffix === "") throw new IdentityAttributionError("a proxy tag needs a prefix or suffix"); const key = `${tag.prefix}\u0000${tag.suffix}`; if (seen.has(key)) throw new IdentityAttributionError("duplicate proxy tag"); seen.add(key); return Object.freeze({ ...tag }); })); }
function systemOf(state: IdentityAttributionState, id: string): IdentitySystem { const found = state.systems.find((system) => system.id === id); if (found === undefined) throw new IdentityAttributionError("system does not exist"); return found; }
function memberOf(state: IdentityAttributionState, id: string): HumanMember { const found = state.members.find((member) => member.id === id); if (found === undefined) throw new IdentityAttributionError("member does not exist"); return found; }
function maskOf(state: IdentityAttributionState, id: string): ContextMask { const found = state.masks.find((mask) => mask.id === id); if (found === undefined) throw new IdentityAttributionError("mask does not exist"); return found; }
function receiptOf(state: IdentityAttributionState, id: string): AttributionReceipt { const found = state.receipts.find((receipt) => receipt.id === id); if (found === undefined) throw new IdentityAttributionError("attribution receipt does not exist"); return found; }
function sameAccount(left: ExternalAccountRef, right: ExternalAccountRef): boolean { return left.surface === right.surface && left.accountId === right.accountId; }
function sameContext(left: Context, right: Context): boolean { return left.surface === right.surface && left.communityId === right.communityId; }
function wrapped(content: string, tag: ProxyTag): boolean { return content.startsWith(tag.prefix) && content.endsWith(tag.suffix) && content.length >= tag.prefix.length + tag.suffix.length; }
function publicFields(fields: Readonly<Record<string, VisibleField>>): Readonly<Record<string, string>> { return Object.freeze(Object.fromEntries(Object.entries(fields).flatMap(([key, value]) => value.visibility === "public" ? [[key, value.value]] : []))); }
