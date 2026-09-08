/**
 * Utility functions for agency metadata serialization/deserialization.
 *
 * When the Supabase `agencies` table does not yet have native columns for
 * service agreements (`service_agreement_url`, `service_agreement_filename`,
 * `management_fee`, `agreement_start_date`, `agreement_end_date`),
 * these fields are packed cleanly into a metadata block in the `description` column.
 *
 * If native columns exist, they take precedence automatically.
 */

export interface AgencyMetadata {
    service_agreement_url?: string | null;
    service_agreement_filename?: string | null;
    management_fee?: number | null;
    agreement_start_date?: string | null;
    agreement_end_date?: string | null;
}

const METADATA_REGEX = /^<!-- __METADATA__:([\s\S]+?) -->\n?/;

/**
 * Extracts metadata from the agency description (if present) and merges it
 * with the agency record. Native columns always override metadata if present.
 */
export function unpackAgencyMetadata<T extends Record<string, any>>(agency: T): T {
    if (!agency) return agency;

    const desc: string = agency.description || '';
    let metadata: AgencyMetadata = {};
    let cleanDescription = desc;

    const match = desc.match(METADATA_REGEX);
    if (match) {
        try {
            metadata = JSON.parse(match[1]);
            cleanDescription = desc.substring(match[0].length).trim();
        } catch (e) {
            console.warn('[AgencyMetadata] Failed to parse metadata block:', e);
        }
    }

    return {
        ...agency,
        description: cleanDescription || null,
        service_agreement_url:
            agency.service_agreement_url !== undefined && agency.service_agreement_url !== null
                ? agency.service_agreement_url
                : metadata.service_agreement_url || null,
        service_agreement_filename:
            agency.service_agreement_filename !== undefined && agency.service_agreement_filename !== null
                ? agency.service_agreement_filename
                : metadata.service_agreement_filename || null,
        management_fee:
            agency.management_fee !== undefined && agency.management_fee !== null
                ? agency.management_fee
                : metadata.management_fee !== undefined
                ? metadata.management_fee
                : null,
        agreement_start_date:
            agency.agreement_start_date !== undefined && agency.agreement_start_date !== null
                ? agency.agreement_start_date
                : metadata.agreement_start_date || null,
        agreement_end_date:
            agency.agreement_end_date !== undefined && agency.agreement_end_date !== null
                ? agency.agreement_end_date
                : metadata.agreement_end_date || null,
    };
}

/**
 * Packs metadata fields into a hidden comment block at the beginning of `description`.
 */
export function packAgencyMetadata(
    userDescription: string | null | undefined,
    meta: AgencyMetadata
): string | null {
    const cleanMeta: Record<string, any> = {};

    if (meta.service_agreement_url) {
        cleanMeta.service_agreement_url = meta.service_agreement_url;
    }
    if (meta.service_agreement_filename) {
        cleanMeta.service_agreement_filename = meta.service_agreement_filename;
    }
    if (meta.management_fee !== undefined && meta.management_fee !== null && (meta.management_fee as any) !== '') {
        const num = Number(meta.management_fee);
        if (!isNaN(num)) cleanMeta.management_fee = num;
    }
    if (meta.agreement_start_date) {
        cleanMeta.agreement_start_date = meta.agreement_start_date;
    }
    if (meta.agreement_end_date) {
        cleanMeta.agreement_end_date = meta.agreement_end_date;
    }

    // Strip any existing metadata comment from userDescription
    const baseDesc = (userDescription || '').replace(METADATA_REGEX, '').trim();

    if (Object.keys(cleanMeta).length === 0) {
        return baseDesc || null;
    }

    const metaComment = `<!-- __METADATA__:${JSON.stringify(cleanMeta)} -->`;
    return baseDesc ? `${metaComment}\n${baseDesc}` : metaComment;
}
