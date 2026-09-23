export type UserRole = 'builder' | 'broker' | 'agency' | 'owner';
/** Renting is what kitnets.com is about; "vender" left the wizard on 2026-09-24 (owner's call). */
export type ListingIntent = 'launch' | 'rent';
export type PropertyType = 'kitnet' | 'apartment' | 'house' | 'commercial' | 'land' | 'other';
import { OwnershipClaim } from '@/types/ownership';

export interface ListingData {
    role: UserRole | null;
    intent: ListingIntent | null;
    propertyType: PropertyType | null;
    location: {
        city: string;
        state: string;
        neighborhood: string;
        street: string;
        number: string;
        complement: string;
        address: string; // Keep for legacy/combined display
        zip: string;
    };
    details: {
        area: string;
        bedrooms: number;
        bathrooms: number;
        parking: number;
        furnished: boolean;
        pets: boolean;
        // Conditional
        deliveryDate: string;
        units: string;
        rentValue: string;
        condoFee: string;
        tax: string;
        minPeriod: string;
    };
    media: {
        photos: (File | string)[]; // Can be File objects or URL strings
        video: File | null;
        pdf: File | null;
    };
    description: string;
    contact: {
        email: string;
        phone: string;
        whatsapp: boolean;
    };
    identity: {
        cpf: string;
        cnpj: string;
        creci: string; // Only for broker
        fullName: string; // For CPF
        businessName: string; // Razão Social for CNPJ
        tradeName: string; // Nome Fantasia
        birthDate: string;
    };
    ownership: {
        documents: File[];
        verified: boolean;
        claim?: OwnershipClaim | null;
    };
}

export type StepId =
    | 'profile'
    | 'identity'
    | 'intent'
    | 'type'
    | 'location'
    | 'details'
    | 'media'
    | 'description'
    | 'contact'
    | 'ownership'
    | 'review'
    | 'success';

export const STEPS: StepId[] = [
    'profile',
    'intent',
    'type',
    'location',
    'details',
    'media',
    'description',
    'contact',
    'ownership',
    'review',
    'success'
];
