
export type LegalProfile = 'pf' | 'pj' | 'imobiliaria';
export type PortfolioSize = '1' | '2-5' | '6-20' | '21-100' | '100+';

export interface WaitlistData {
    profile: LegalProfile | null;
    identity: {
        cpf?: string;
        cnpj?: string;
        businessName?: string; // Razão Social
        tradeName?: string; // Nome Fantasia
        partners?: string[]; // Sócios
        creci?: string; // CRECI
    };
    portfolioSize: PortfolioSize | null;
    location: {
        city: string;
        state: string;
        zip?: string;
        street?: string;
        number?: string;
        complement?: string;
        neighborhood?: string;
    };
    contact: {
        name: string;
        email: string;
        whatsapp: string;
        ddi?: string;
    };
}

export type WaitlistStepId =
    | 'landing'
    | 'profile'
    | 'identity'
    | 'portfolio'
    | 'location'
    | 'contact'
    | 'success';

export const WAITLIST_STEPS: WaitlistStepId[] = [
    'landing',
    'profile',
    'identity',
    'portfolio',
    'location',
    'contact',
    'success'
];
