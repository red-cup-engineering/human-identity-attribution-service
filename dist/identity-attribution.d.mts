export type Surface = "discord";
export type Visibility = "public" | "system" | "private";
export type SwitchHistory = "disabled" | "opted-in";
export interface ExternalAccountRef {
    readonly surface: Surface;
    readonly accountId: string;
}
export interface Context {
    readonly surface: Surface;
    readonly communityId: string;
}
export interface VisibleField {
    readonly value: string;
    readonly visibility: Visibility;
}
export interface ProxyTag {
    readonly prefix: string;
    readonly suffix: string;
}
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
export interface SwitchRecord {
    readonly systemId: string;
    readonly memberIds: readonly string[];
    readonly recordedAt: string;
}
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
export interface PublicSpeaker {
    readonly memberId: string;
    readonly maskId: string;
    readonly displayName: string;
    readonly fields: Readonly<Record<string, string>>;
}
export interface ModeratorAttribution {
    readonly receiptId: string;
    readonly sourceAccount: ExternalAccountRef;
    readonly systemId: string;
    readonly memberId: string;
    readonly maskId: string;
}
export type ProxyParseResult = Readonly<{
    kind: "matched";
    memberId: string;
    maskId: string;
    body: string;
}> | Readonly<{
    kind: "no-match";
    reason: string;
}> | Readonly<{
    kind: "ambiguous";
    reason: string;
}>;
export declare class IdentityAttributionError extends Error {
    name: string;
}
export declare const emptyState: () => IdentityAttributionState;
export declare function createSystem(state: IdentityAttributionState, input: Readonly<{
    id: string;
    accountRefs: readonly ExternalAccountRef[];
    name?: VisibleField;
    description?: VisibleField;
    switchHistory?: SwitchHistory;
}>): Readonly<{
    state: IdentityAttributionState;
    system: IdentitySystem;
}>;
export declare function addMember(state: IdentityAttributionState, input: Readonly<{
    id: string;
    systemId: string;
    name: VisibleField;
    description?: VisibleField;
    pronouns?: VisibleField;
    fields?: Readonly<Record<string, VisibleField>>;
}>): Readonly<{
    state: IdentityAttributionState;
    member: HumanMember;
}>;
export declare function addContextMask(state: IdentityAttributionState, input: Readonly<{
    id: string;
    memberId: string;
    context: Context;
    displayName: string;
    avatarUrl?: string;
    proxyTags: readonly ProxyTag[];
    fields?: Readonly<Record<string, VisibleField>>;
}>): Readonly<{
    state: IdentityAttributionState;
    mask: ContextMask;
}>;
export declare function parseExplicitProxy(state: IdentityAttributionState, input: Readonly<{
    account: ExternalAccountRef;
    context: Context;
    content: string;
}>): ProxyParseResult;
export declare function proposeDiscordProxy(state: IdentityAttributionState, input: Readonly<{
    receiptId: string;
    sourceAccount: ExternalAccountRef;
    context: Context;
    sourceMessageId: string;
    content: string;
    replyTo?: string;
    attachments?: readonly string[];
}>): Readonly<{
    state: IdentityAttributionState;
    proposal: DiscordWebhookProposal;
    receipt: AttributionReceipt;
}> | ProxyParseResult;
export declare function projectPublicSpeaker(state: IdentityAttributionState, receiptId: string): PublicSpeaker;
export declare function resolveModeratorAttribution(state: IdentityAttributionState, input: Readonly<{
    receiptId: string;
    authorizedPurpose: "moderation" | string;
}>): ModeratorAttribution;
export interface PortableSystemRecord {
    readonly version: 1;
    readonly system: IdentitySystem;
    readonly members: readonly HumanMember[];
    readonly masks: readonly ContextMask[];
    readonly receipts: readonly AttributionReceipt[];
    readonly switches: readonly SwitchRecord[];
}
export declare function exportSystem(state: IdentityAttributionState, systemId: string): PortableSystemRecord;
export declare function importSystem(state: IdentityAttributionState, record: PortableSystemRecord): Readonly<{
    state: IdentityAttributionState;
    system: IdentitySystem;
}>;
export declare function eraseSystem(state: IdentityAttributionState, systemId: string): Readonly<{
    state: IdentityAttributionState;
    erasedSystemId: string;
}>;
export declare function appendSwitch(state: IdentityAttributionState, input: SwitchRecord): Readonly<{
    state: IdentityAttributionState;
    record: SwitchRecord;
}>;
//# sourceMappingURL=identity-attribution.d.mts.map