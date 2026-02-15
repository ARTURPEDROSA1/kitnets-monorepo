import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

const EXTRACTION_PROMPT_IMAGE = `You are an expert at reading Brazilian water utility bills (contas de água).
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
- "referenceMonth" is the billing period (mês de referência or MÊS/ANO), format as YYYY-MM
- "meterNumber" is the hidrômetro number
- "previousReading" is "L. ANTERIOR" or "leitura anterior"
- "currentReading" is "L. ATUAL" or "leitura atual"
- "consumptionM3" is "CONS. REAL" or "consumo real" in cubic meters
- "billedConsumptionM3" is "CONS. FATURADO" or "consumo faturado" in cubic meters
- "readingDate" is "DATA DE LEITURA" (the scheduled reading date)
- "readingDateOrig" is "DATA LEITURA ORIG" (the actual physical reading date)
  If only one reading date is visible, use it for both fields
- "dueDate" is "VENCIMENTO"
- "waterTariff" is "TARIFA DE ÁGUA" value
- "sewageTariff" is "TARIFA DE ESGOTO" value
- "waterBasicFee" is "TBOA" or "TAR BÁSICA OPERAC ÁGUA" value
- "sewageBasicFee" is "TBOE" or "TAR BÁSICA OPERAC ESGOTO" value
- "totalAmount" is "VALOR A PAGAR" (the total amount due)
- "occurrenceCode" is "OCORRÊNCIA" code number
- "confidence" is your confidence level from 0 to 1 that the extraction is correct
- All monetary values must be numbers (not strings), using dot as decimal separator
- Brazilian bills use comma as decimal separator — convert "303,83" to 303.83
- All dates must be in ISO format YYYY-MM-DD — convert "20/01/2026" to "2026-01-20"
- If a field is not found on the bill, use null for strings and 0 for numbers
- The bill may be from SAAE, CAESB, SABESP, COPASA, or any Brazilian water utility
- CRITICAL: You MUST extract the EXACT values printed on the bill. Do NOT invent or guess values.`;

function buildTextPrompt(pdfText: string): string {
    return `You are an expert at reading Brazilian water utility bills (contas de água).
Below is the extracted text from a water bill PDF. Extract ALL data fields from this text.

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
- "referenceMonth" is the billing period (MÊS/ANO), format as YYYY-MM. Example: "01/2026" → "2026-01"
- "meterNumber" is "HIDRÔMETRO" value
- "previousReading" is "L. ANTERIOR" value
- "currentReading" is "L. ATUAL" value
- "consumptionM3" is "CONS. REAL" value (number before "m3")
- "billedConsumptionM3" is "CONS. FATURADO" value (number before "m3")
- "readingDate" is "DATA DE LEITURA" — convert "20/01/2026" to "2026-01-20"
- "readingDateOrig" is "DATA LEITURA ORIG" — convert "21/01/2026" to "2026-01-21"
  If only one date is found, use it for both
- "dueDate" is "VENCIMENTO" date — convert to YYYY-MM-DD
- "waterTariff" is "TARIFA DE ÁGUA" value — convert "303,83" to 303.83
- "sewageTariff" is "TARIFA DE ESGOTO" value — convert "182,30" to 182.30
- "waterBasicFee" is "TBOA" or "TAR BÁSICA OPERAC ÁGUA" value
- "sewageBasicFee" is "TBOE" or "TAR BÁSICA OPERAC ESGOTO" value
- "totalAmount" is "VALOR A PAGAR" (e.g. "R$521,14" → 521.14)
- "occurrenceCode" is "OCORRÊNCIA" number
- "confidence" is 0 to 1 based on how clearly the data was found in the text
- All monetary values: numbers with dot decimal (not comma)
- CRITICAL: Extract EXACT values from the text. Do NOT guess.

--- BEGIN BILL TEXT ---
${pdfText}
--- END BILL TEXT ---`;
}

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

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        let messages: unknown[];

        if (file.type === "application/pdf") {
            // PDF: Extract text with pdf-parse, then send as text prompt
            const pdfData = await pdfParse(buffer);
            const pdfText = pdfData.text;

            if (!pdfText || pdfText.trim().length < 20) {
                return NextResponse.json(
                    { error: "Não foi possível extrair texto do PDF. Tente enviar como imagem (JPG/PNG)." },
                    { status: 400 }
                );
            }

            messages = [
                {
                    role: "user",
                    content: buildTextPrompt(pdfText),
                },
            ];
        } else {
            // Image: use GPT-4o Vision
            let mediaType = file.type;
            if (mediaType === "image/jpg") mediaType = "image/jpeg";
            const base64 = buffer.toString("base64");

            messages = [
                {
                    role: "user",
                    content: [
                        { type: "text", text: EXTRACTION_PROMPT_IMAGE },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mediaType};base64,${base64}`,
                                detail: "high",
                            },
                        },
                    ],
                },
            ];
        }

        // Call OpenAI API
        const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages,
                max_tokens: 1500,
                temperature: 0,
            }),
        });

        if (!apiResponse.ok) {
            const errBody = await apiResponse.text();
            console.error("OpenAI API error:", apiResponse.status, errBody);
            return NextResponse.json(
                { error: `OpenAI API error (${apiResponse.status}): ${errBody.substring(0, 300)}` },
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
