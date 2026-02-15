import { NextResponse } from "next/server";

const EXTRACTION_PROMPT = `You are an expert at reading Brazilian water utility bills (contas de água).
Analyze this bill image carefully and extract ALL data fields.

Return ONLY a valid JSON object (no markdown, no explanation) with these exact keys:

{
  "referenceMonth": "YYYY-MM",
  "meterNumber": "string",
  "previousReading": number,
  "currentReading": number,
  "consumptionM3": number,
  "billedConsumptionM3": number,
  "readingDate": "YYYY-MM-DD",
  "readingDateOrig": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "waterTariff": number,
  "sewageTariff": number,
  "waterBasicFee": number,
  "sewageBasicFee": number,
  "totalAmount": number,
  "occurrenceCode": "string or null",
  "confidence": number
}

Important rules:
- "referenceMonth" is the billing period (mês de referência), format as YYYY-MM
- "meterNumber" is the hidrômetro number
- "previousReading" is "leitura anterior"
- "currentReading" is "leitura atual"
- "consumptionM3" is "consumo medido" or "consumo real" in cubic meters
- "billedConsumptionM3" is "consumo faturado" in cubic meters (may equal consumptionM3)
- "readingDate" is the scheduled reading round date ("Data de Leitura")
- "readingDateOrig" is the actual physical reading date ("Data Leitura Orig")
  If only one reading date is visible, use it for both fields
- "dueDate" is "vencimento"
- "waterTariff" is the water consumption charge amount (tarifa de água)
- "sewageTariff" is the sewage charge amount (tarifa de esgoto)
- "waterBasicFee" is TBOA or "Taxa Básica Operacional de Água" or "Tar Básica Operac Água"
- "sewageBasicFee" is TBOE or "Taxa Básica Operacional de Esgoto" or "Tar Básica Operac Esgoto"
- "totalAmount" is the total amount due ("valor a pagar")
- "occurrenceCode" is any occurrence/situation code on the bill (e.g. "33")
- "confidence" is your confidence level from 0 to 1 that the extraction is correct
- All monetary values must be numbers (not strings), using dot as decimal separator
- Brazilian bills use comma as decimal separator — convert "303,83" to 303.83
- All dates must be in ISO format YYYY-MM-DD — convert "20/01/2026" to "2026-01-20"
- If a field is not found on the bill, use null for strings and 0 for numbers
- The bill may be from SAAE, CAESB, SABESP, COPASA, or any Brazilian water utility
- CRITICAL: Extract the EXACT values printed on the bill. Do NOT guess or generate values.`;

export async function POST(request: Request) {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: "OpenAI API key not configured" },
                { status: 500 }
            );
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { error: "No file uploaded" },
                { status: 400 }
            );
        }

        // Validate file type
        const allowedTypes = [
            "image/jpeg", "image/jpg", "image/png", "image/webp",
            "image/gif", "application/pdf"
        ];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: `Tipo de arquivo não suportado: ${file.type}. Use JPG, PNG, WebP ou PDF.` },
                { status: 400 }
            );
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json(
                { error: "Arquivo muito grande. Máximo: 10MB." },
                { status: 400 }
            );
        }

        // Convert file to base64
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");

        // Determine media type
        let mediaType = file.type;
        if (mediaType === "image/jpg") mediaType = "image/jpeg";

        // Build the content parts for the API
        // Use raw fetch to OpenAI API to avoid SDK type issues with PDFs
        const contentParts: unknown[] = [
            { type: "text", text: EXTRACTION_PROMPT },
        ];

        if (file.type === "application/pdf") {
            // GPT-4o supports PDFs via the "file" content type
            contentParts.push({
                type: "file",
                file: {
                    filename: file.name || "bill.pdf",
                    file_data: `data:application/pdf;base64,${base64}`,
                },
            });
        } else {
            // Images use the standard image_url content type
            contentParts.push({
                type: "image_url",
                image_url: {
                    url: `data:${mediaType};base64,${base64}`,
                    detail: "high",
                },
            });
        }

        // Call OpenAI API directly via fetch to avoid SDK serialization issues
        const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: contentParts,
                    },
                ],
                max_tokens: 1000,
                temperature: 0,
            }),
        });

        if (!apiResponse.ok) {
            const errBody = await apiResponse.text();
            console.error("OpenAI API error:", apiResponse.status, errBody);
            return NextResponse.json(
                { error: `OpenAI API error (${apiResponse.status}): ${errBody.substring(0, 200)}` },
                { status: 500 }
            );
        }

        const response = await apiResponse.json();
        const content = response.choices?.[0]?.message?.content;

        if (!content) {
            return NextResponse.json(
                { error: "GPT-4o returned empty response" },
                { status: 500 }
            );
        }

        // Parse the JSON response (strip markdown code fences if present)
        let cleanContent = content.trim();
        if (cleanContent.startsWith("```")) {
            cleanContent = cleanContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }

        const extracted = JSON.parse(cleanContent);

        return NextResponse.json({
            success: true,
            data: extracted,
            usage: {
                prompt_tokens: response.usage?.prompt_tokens,
                completion_tokens: response.usage?.completion_tokens,
                total_tokens: response.usage?.total_tokens,
            },
        });
    } catch (error) {
        console.error("Bill extraction error:", error);

        if (error instanceof SyntaxError) {
            return NextResponse.json(
                { error: "Failed to parse GPT response as JSON. Please try again." },
                { status: 500 }
            );
        }

        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { error: `Extraction failed: ${message}` },
            { status: 500 }
        );
    }
}
