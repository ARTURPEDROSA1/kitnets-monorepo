import { PropertyExtractionSchema, ExtractedProperty } from "./schema";

export async function extractPropertyFromText(text: string): Promise<ExtractedProperty> {
    // TODO: Replace with actual LLM call (OpenAI/Anthropic)
    console.log("Simulating extraction for:", text);

    // Mock delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock response
    const mockData: ExtractedProperty = {
        title: "Cozy Kitnet in Downtown",
        description: "Beautiful studio apartment, close to subway. Bills included.",
        monthlyRent: 1200,
        address: {
            city: "São Paulo",
            neighborhood: "Centro",
        },
        amenities: ["WiFi", "Furnished", "Bills Included"],
        contact: {
            name: "Maria",
            phone: "+55 11 99999-9999",
        },
        confidence: 0.85,
    };

    return PropertyExtractionSchema.parse(mockData);
}
