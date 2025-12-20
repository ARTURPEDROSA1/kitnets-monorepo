export type UserRole = 'builder' | 'broker' | 'agency' | 'owner';
export type ListingIntent = 'launch' | 'sale' | 'rent';
export type PropertyType = 'kitnet' | 'apartment' | 'house' | 'commercial' | 'land' | 'other';

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
        salePrice: string;
        financing: boolean;
    };
    media: {
        photos: File[]; // In a real app we might store URLs or blobs, here File is fine for local state
        video: File | null;
        pdf: File | null;
    };
    description: string;
    contact: {
        email: string;
    };
}

export type StepId =
    | 'profile'
    | 'intent'
    | 'type'
    | 'location'
    | 'details'
    | 'media'
    | 'description'
    | 'contact'
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
    'review',
    'success'
];
