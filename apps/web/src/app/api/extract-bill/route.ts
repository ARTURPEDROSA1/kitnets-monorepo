import { NextResponse } from "next/server";
import { inflateSync } from "zlib";

// ── Zero-dependency PDF text extractor ──────────────────────────────

function extractTextFromPDF(buffer: Buffer): string {
    const raw = buffer.toString("binary");
    const textChunks: string[] = [];

    // Find all stream...endstream sections
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    let match;

    while ((match = streamRegex.exec(raw)) !== null) {
        let streamContent = match[1];

        // Try to decompress FlateDecode streams
        try {
            const buf = Buffer.from(streamContent, "binary");
            const decompressed = inflateSync(buf);
            streamContent = decompressed.toString("binary");
        } catch {
            // Not compressed or different compression — use as-is
        }

        // Extract text from PDF text operators:
        // (text) Tj  — show text
        // (text) '   — move to next line and show text
        // [(text)] TJ — show text with positioning
        // Also handle escaped characters in PDF strings

        // Match text within parentheses — PDF string literals
        const textOpRegex = /\(([^)]*)\)\s*(?:Tj|'|TJ)/g;
        let textMatch;
        while ((textMatch = textOpRegex.exec(streamContent)) !== null) {
            let text = textMatch[1];
            // Unescape PDF string escapes
            text = text
                .replace(/\\n/g, "\n")
                .replace(/\\r/g, "\r")
                .replace(/\\t/g, "\t")
                .replace(/\\\(/g, "(")
                .replace(/\\\)/g, ")")
                .replace(/\\\\/g, "\\");
            if (text.trim()) textChunks.push(text);
        }

        // Handle TJ arrays: [(text1) -100 (text2)] TJ
        const tjArrayRegex = /\[((?:\([^)]*\)|[^[\]])*)\]\s*TJ/g;
        let tjMatch;
        while ((tjMatch = tjArrayRegex.exec(streamContent)) !== null) {
            const arrayContent = tjMatch[1];
            const parts: string[] = [];
            const partRegex = /\(([^)]*)\)/g;
            let partMatch;
            while ((partMatch = partRegex.exec(arrayContent)) !== null) {
                let text = partMatch[1];
                text = text
                    .replace(/\\n/g, "\n")
                    .replace(/\\r/g, "\r")
                    .replace(/\\t/g, "\t")
                    .replace(/\\\(/g, "(")
                    .replace(/\\\)/g, ")")
                    .replace(/\\\\/g, "\\");
                parts.push(text);
            }
            if (parts.length > 0) textChunks.push(parts.join(""));
        }
    }

    return textChunks.join("\n");
}

// ── Regex-based bill field parser ────────────────────────────────────

function parseDateBR(dateStr: string): string | null {
    const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseDecimalBR(value: string): number {
    return parseFloat(value.replace(/\./g, "").replace(",", "."));
}

function extractFirst(text: string, pattern: RegExp): string | null {
    const m = text.match(pattern);
    return m ? m[1].trim() : null;
}

interface ExtractedBill {
    referenceMonth: string | null;
    meterNumber: string | null;
    previousReading: number | null;
    currentReading: number | null;
    consumptionM3: number | null;
    billedConsumptionM3: number | null;
    readingDate: string | null;
    readingDateOrig: string | null;
    dueDate: string | null;
    waterTariff: number | null;
    sewageTariff: number | null;
    waterBasicFee: number | null;
    sewageBasicFee: number | null;
    totalAmount: number | null;
    occurrenceCode: string | null;
    confidence: number;
}

function parseBillText(text: string): ExtractedBill {
    const t = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");

    // Reference month: "MÊS/ANO 01/2026" or "01/2026"
    let referenceMonth: string | null = null;
    const mesAno = extractFirst(t, /M[ÊE]S\s*\/?\s*ANO\s*[:\n]?\s*(\d{2}\/\d{4})/i);
    if (mesAno) {
        const [mm, yyyy] = mesAno.split("/");
        referenceMonth = `${yyyy}-${mm}`;
    }

    // Meter number
    const meterNumber = extractFirst(t, /HIDR[ÔO]METRO\s*[:\n]?\s*([A-Z0-9]+)/i);

    // Readings
    const prevStr = extractFirst(t, /L\.?\s*ANTERIOR\s*[:\n]?\s*([\d.,]+)/i);
    const currStr = extractFirst(t, /L\.?\s*ATUAL\s*[:\n]?\s*([\d.,]+)/i);
    const previousReading = prevStr ? parseDecimalBR(prevStr) : null;
    const currentReading = currStr ? parseDecimalBR(currStr) : null;

    // Consumption
    const consRealStr = extractFirst(t, /CONS\.?\s*REAL\s*[:\n]?\s*([\d.,]+)\s*m/i);
    const consumptionM3 = consRealStr ? parseDecimalBR(consRealStr) : null;

    const consFatStr = extractFirst(t, /CONS\.?\s*FATURADO\s*[:\n]?\s*([\d.,]+)\s*m/i);
    const billedConsumptionM3 = consFatStr ? parseDecimalBR(consFatStr) : null;

    // Dates
    const readingDateRaw = extractFirst(t, /DATA\s+DE\s+LEITURA\s*[:\n]?\s*(\d{2}\/\d{2}\/\d{4})/i);
    const readingDate = readingDateRaw ? parseDateBR(readingDateRaw) : null;

    const readingDateOrigRaw = extractFirst(t, /DATA\s+LEITURA\s+ORIG\.?\s*[:\n]?\s*(\d{2}\/\d{2}\/\d{4})/i);
    const readingDateOrig = readingDateOrigRaw ? parseDateBR(readingDateOrigRaw) : null;

    const dueDateRaw = extractFirst(t, /VENCIMENTO\s*[:\n]?\s*(\d{2}\/\d{2}\/\d{4})/i);
    const dueDate = dueDateRaw ? parseDateBR(dueDateRaw) : null;

    // Tariffs
    const waterTariffStr = extractFirst(t, /TARIFA\s+DE\s+[ÁA]GUA\s*[:\n]?\s*([\d.,]+)/i);
    const waterTariff = waterTariffStr ? parseDecimalBR(waterTariffStr) : null;

    const sewageTariffStr = extractFirst(t, /TARIFA\s+DE\s+ESGOTO\s*[:\n]?\s*([\d.,]+)/i);
    const sewageTariff = sewageTariffStr ? parseDecimalBR(sewageTariffStr) : null;

    // Basic fees
    const waterBasicFeeStr = extractFirst(t, /(?:TBOA|TAR\s*B[ÁA]SICA\s*OPERAC?\s*[ÁA]GUA)\s*[:\n]?\s*([\d.,]+)/i);
    const waterBasicFee = waterBasicFeeStr ? parseDecimalBR(waterBasicFeeStr) : null;

    const sewageBasicFeeStr = extractFirst(t, /(?:TBOE|TAR\s*B[ÁA]SICA\s*OPERAC?\s*ESGOTO)\s*[:\n]?\s*([\d.,]+)/i);
    const sewageBasicFee = sewageBasicFeeStr ? parseDecimalBR(sewageBasicFeeStr) : null;

    // Total
    const totalStr = extractFirst(t, /VALOR\s+A\s+PAGAR\s*[:\n]?\s*R?\$?\s*([\d.,]+)/i);
    const totalAmount = totalStr ? parseDecimalBR(totalStr) : null;

    // Occurrence
    const occurrenceCode = extractFirst(t, /OCORR[ÊE]NCIA\s*[:\n]?\s*(\d+)/i);

    // Confidence
    const fields = [
        referenceMonth, meterNumber, previousReading, currentReading,
        consumptionM3, readingDate, dueDate, totalAmount,
    ];
    const found = fields.filter(f => f !== null).length;
    const confidence = Math.round((found / fields.length) * 100) / 100;

    return {
        referenceMonth,
        meterNumber,
        previousReading,
        currentReading,
        consumptionM3,
        billedConsumptionM3: billedConsumptionM3 ?? consumptionM3,
        readingDate,
        readingDateOrig: readingDateOrig ?? readingDate,
        dueDate,
        waterTariff,
        sewageTariff,
        waterBasicFee,
        sewageBasicFee,
        totalAmount,
        occurrenceCode,
        confidence,
    };
}

// ── GPT-4o Vision prompt (images only) ──────────────────────────────

const IMAGE_PROMPT = `You are an expert at reading Brazilian water utility bills (contas de água).
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

Rules:
- "referenceMonth": MÊS/ANO as YYYY-MM
- "meterNumber": HIDRÔMETRO
- "previousReading": L. ANTERIOR
- "currentReading": L. ATUAL
- "consumptionM3": CONS. REAL in m³
- "billedConsumptionM3": CONS. FATURADO in m³
- "readingDate": DATA DE LEITURA → YYYY-MM-DD
- "readingDateOrig": DATA LEITURA ORIG → YYYY-MM-DD (if only one, use for both)
- "dueDate": VENCIMENTO → YYYY-MM-DD
- "waterTariff": TARIFA DE ÁGUA value
- "sewageTariff": TARIFA DE ESGOTO value
- "waterBasicFee": TBOA value
- "sewageBasicFee": TBOE value
- "totalAmount": VALOR A PAGAR
- "occurrenceCode": OCORRÊNCIA code
- "confidence": 0–1
- Convert Brazilian decimals: "303,83" → 303.83
- Convert dates: "20/01/2026" → "2026-01-20"
- If not found: null for strings, 0 for numbers
- CRITICAL: Extract EXACT values. Do NOT invent values.`;

// ── API Route ───────────────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { error: "No file uploaded" },
                { status: 400 }
            );
        }

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

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json(
                { error: "Arquivo muito grande. Máximo: 10MB." },
                { status: 400 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // ── PDF: zero-dependency text extraction + regex parser ──────
        if (file.type === "application/pdf") {
            const pdfText = extractTextFromPDF(buffer);

            if (!pdfText || pdfText.trim().length < 20) {
                return NextResponse.json(
                    { error: "Não foi possível extrair texto do PDF. Tente enviar como imagem (JPG/PNG)." },
                    { status: 400 }
                );
            }

            const extracted = parseBillText(pdfText);

            return NextResponse.json({
                success: true,
                data: extracted,
                method: "regex",
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            });
        }

        // ── Image: GPT-4o Vision ────────────────────────────────────
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: "OpenAI API key not configured. Para imagens, é necessário configurar a chave da API." },
                { status: 500 }
            );
        }

        let mediaType = file.type;
        if (mediaType === "image/jpg") mediaType = "image/jpeg";
        const base64 = buffer.toString("base64");

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
                        content: [
                            { type: "text", text: IMAGE_PROMPT },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${mediaType};base64,${base64}`,
                                    detail: "high",
                                },
                            },
                        ],
                    },
                ],
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

        let cleanContent = content.trim();
        if (cleanContent.startsWith("```")) {
            cleanContent = cleanContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }

        const extracted = JSON.parse(cleanContent);

        return NextResponse.json({
            success: true,
            data: extracted,
            method: "gpt-4o-vision",
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
