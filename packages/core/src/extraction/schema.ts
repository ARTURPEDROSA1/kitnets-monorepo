import { z } from "zod";

export const PropertyExtractionSchema = z.object({
    title: z.string().describe("The listing title"),
    description: z.string().describe("A summary description"),
    monthlyRent: z.number().describe("Monthly rent price in local currency"),
    address: z.object({
        street: z.string().optional(),
        city: z.string().optional(),
        neighborhood: z.string().optional(),
        zipCode: z.string().optional(),
    }).describe("Approximate location"),
    amenities: z.array(z.string()).describe("List of amenities (e.g., WiFi, AC)"),
    contact: z.object({
        phone: z.string().optional(),
        name: z.string().optional(),
    }).optional(),
    confidence: z.number().min(0).max(1).describe("Confidence score of extraction"),
});

export type ExtractedProperty = z.infer<typeof PropertyExtractionSchema>;
