/**
 * Server side of /proprietario: the holding's record, its documents, and the Cartão CNPJ import
 * that fills the record (and the accounting policies' natureza jurídica and porte) from the card.
 *
 * The card is read twice over: the AI reader (Gemini, OpenAI as the fallback — the same runner the
 * Projetos documents use) answers the whole form, and the regexes in lib/cnpj-card-extract.ts
 * read the CNPJ, the CNAEs, the natureza jurídica and the porte straight from the PDF's text, which
 * win over the model. Without an AI key the regexes alone still fill most of the card.
 */
import type { AdminSupabase } from "@/lib/api-auth";
import type { ReadBy } from "@/lib/ai-reader-label";
import { aiConfigured, pdfText, runDocumentExtraction } from "@/lib/document-extract-server";
import { CNPJ_CARD_PROMPT, companySizeFromRegistry, legalNatureFromRegistry, normalizeCompanyRegistry, type CompanyRegistry } from "@/lib/cnpj-card-extract";
import type { CompanySize, LegalNature } from "@/lib/accounting-policies";
import { HOLDING_COLUMNS, holdingFromRow, registryToProfileColumns, type HoldingProfile } from "@/lib/profile-holding";
import type { ProfileDocument } from "@/lib/profile-documents";

/** The owner's files share the private bucket the property documents use, under <profile>/company/. */
export const PROFILE_DOCUMENTS_BUCKET = "documents";

const DOCUMENT_COLUMNS = "id, category, path, original_name, mime_type, file_size, created_at";

export async function loadHolding(supabase: AdminSupabase, profileId: string): Promise<HoldingProfile | null> {
    const { data, error } = await supabase.from("profiles").select(HOLDING_COLUMNS).eq("id", profileId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? holdingFromRow(data as Record<string, unknown>) : null;
}

export async function listProfileDocuments(supabase: AdminSupabase, profileId: string): Promise<ProfileDocument[]> {
    const { data, error } = await supabase.from("profile_documents").select(DOCUMENT_COLUMNS).eq("profile_id", profileId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ProfileDocument[];
}

export async function loadProfileDocument(supabase: AdminSupabase, profileId: string, id: string): Promise<ProfileDocument | null> {
    const { data, error } = await supabase.from("profile_documents").select(DOCUMENT_COLUMNS).eq("id", id).eq("profile_id", profileId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as ProfileDocument) ?? null;
}

export interface CardReading {
    registry: CompanyRegistry;
    /** null when the regexes alone read the card (no AI key, or the model failed) */
    readBy: ReadBy | null;
}

/** The card as a CompanyRegistry, or null when nothing in the file looks like one. */
export async function readCompanyCard(buffer: Buffer, mimeType: string, tag = "Company Card Import"): Promise<CardReading | null> {
    const text = mimeType === "application/pdf" ? await pdfText(buffer, tag) : "";
    let answer: unknown = null;
    let readBy: ReadBy | null = null;
    if (aiConfigured()) {
        try {
            const result = await runDocumentExtraction({ prompt: CNPJ_CARD_PROMPT, buffer, mimeType, textContent: text, tag });
            if (result) {
                answer = result.data;
                readBy = result.readBy;
            }
        } catch (err) {
            console.warn(`[${tag}] AI read failed:`, err);
        }
    }
    const registry = normalizeCompanyRegistry(answer ?? {}, text);
    return registry ? { registry, readBy } : null;
}

export interface PoliciesFill {
    legal_nature: LegalNature | null;
    company_size: CompanySize | null;
    /** true when the card changed the policies (a choice the owner had not made yet) */
    filled: boolean;
}

/**
 * Natureza jurídica and porte for /contabil/politicas, where the owner has not chosen yet — a
 * choice already made is never overwritten (the card may say LTDA for a unipessoal).
 */
export async function fillPoliciesFromCard(supabase: AdminSupabase, ownerId: string, reg: CompanyRegistry): Promise<PoliciesFill> {
    const legal_nature = legalNatureFromRegistry(reg);
    const company_size = companySizeFromRegistry(reg.porte);
    const { data: row, error } = await supabase.from("accounting_settings").select("legal_nature, company_size").eq("owner_id", ownerId).maybeSingle();
    if (error) throw new Error(error.message);
    const current = (row ?? {}) as { legal_nature?: LegalNature | null; company_size?: CompanySize | null };

    const patch: Record<string, unknown> = {};
    if (legal_nature && !current.legal_nature) patch.legal_nature = legal_nature;
    if (company_size && !current.company_size) patch.company_size = company_size;
    if (Object.keys(patch).length === 0) {
        return { legal_nature: current.legal_nature ?? null, company_size: current.company_size ?? null, filled: false };
    }

    const write = row
        ? await supabase.from("accounting_settings").update(patch).eq("owner_id", ownerId)
        : await supabase.from("accounting_settings").insert({ owner_id: ownerId, ...patch });
    if (write.error) throw new Error(write.error.message);
    return {
        legal_nature: (patch.legal_nature as LegalNature | undefined) ?? current.legal_nature ?? null,
        company_size: (patch.company_size as CompanySize | undefined) ?? current.company_size ?? null,
        filled: true,
    };
}

export interface CardImport {
    holding: HoldingProfile;
    readBy: ReadBy | null;
    policies: PoliciesFill;
}

/** Writes the card into the profile (registry + mirrored columns) and the policies. */
export async function applyCompanyCard(supabase: AdminSupabase, profileId: string, reading: CardReading, sourcePath: string | null): Promise<CardImport> {
    const read_at = new Date().toISOString();
    const columns = registryToProfileColumns(reading.registry, { read_at, read_by: reading.readBy, source_path: sourcePath });
    const { data, error } = await supabase.from("profiles").update(columns).eq("id", profileId).select(HOLDING_COLUMNS).single();
    if (error) throw new Error(error.message);
    const policies = await fillPoliciesFromCard(supabase, profileId, reading.registry);
    return { holding: holdingFromRow(data as Record<string, unknown>), readBy: reading.readBy, policies };
}

/** The stored file as a buffer, or null when the bucket no longer has it. */
export async function downloadProfileDocument(supabase: AdminSupabase, path: string): Promise<Buffer | null> {
    const { data, error } = await supabase.storage.from(PROFILE_DOCUMENTS_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
}
