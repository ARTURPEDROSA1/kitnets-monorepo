import { NextResponse } from "next/server";
import { requireProfile, getOwnedProperty, UUID_REGEX } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;

const GATEWAY_COLUMNS =
    "id, label, serial_number, status, description, photo_url, panel_photo_url, property_id, owner_id, last_seen_at, created_at";

/**
 * Gateway detail for the signed-in owner. Replaces the browser-side anon
 * Supabase queries on `gateways`, `meters` and `meter_readings` (those tables
 * had RLS disabled in production, so anyone with the anon key could read and
 * rewrite any gateway).
 *
 * GET /api/gateways/[id]                       → { gateway, properties }
 * GET /api/gateways/[id]?start=…&end=…         → + { readings, prevReadings, range }
 *   start/end are YYYY-MM-DD (inclusive). prevReadings covers the same number
 *   of days immediately before `start`.
 */
export async function GET(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) {
        return NextResponse.json({ error: "Gateway não encontrado" }, { status: 404 });
    }

    const { data: gateway, error } = await supabase
        .from("gateways")
        .select(`${GATEWAY_COLUMNS}, meters(*)`)
        .eq("id", id)
        .eq("owner_id", profileId)
        .maybeSingle();

    if (error) {
        console.error("[Gateway GET] Error:", error.message);
        return NextResponse.json({ error: "Erro ao carregar gateway" }, { status: 500 });
    }
    if (!gateway) {
        return NextResponse.json({ error: "Gateway não encontrado" }, { status: 404 });
    }

    const { data: properties } = await supabase
        .from("properties")
        .select("id, name, address")
        .eq("owner_id", profileId)
        .order("name", { ascending: true });

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start && !end) {
        return NextResponse.json({ gateway, properties: properties ?? [] });
    }

    if (!start || !end || !DATE_REGEX.test(start) || !DATE_REGEX.test(end) || start > end) {
        return NextResponse.json({ error: "Período inválido (use start e end como AAAA-MM-DD)" }, { status: 400 });
    }

    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    const days = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
    if (days > MAX_RANGE_DAYS) {
        return NextResponse.json({ error: `Período máximo: ${MAX_RANGE_DAYS} dias` }, { status: 400 });
    }

    const meterIds: string[] = ((gateway as { meters?: Array<{ id: string }> }).meters ?? []).map((m) => m.id);
    if (meterIds.length === 0) {
        return NextResponse.json({ gateway, properties: properties ?? [], readings: [], prevReadings: [], range: { start, end } });
    }

    const prevEnd = new Date(startDate.getTime() - 86_400_000);
    const prevStart = new Date(startDate.getTime() - days * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const [current, previous] = await Promise.all([
        supabase
            .from("meter_readings")
            .select("meter_id, value, read_at")
            .in("meter_id", meterIds)
            .gte("read_at", start)
            .lte("read_at", `${end}T23:59:59.999Z`)
            .order("read_at", { ascending: true }),
        supabase
            .from("meter_readings")
            .select("value")
            .in("meter_id", meterIds)
            .gte("read_at", iso(prevStart))
            .lte("read_at", `${iso(prevEnd)}T23:59:59.999Z`),
    ]);

    if (current.error || previous.error) {
        console.error("[Gateway GET] Readings error:", current.error?.message ?? previous.error?.message);
        return NextResponse.json({ error: "Erro ao carregar leituras" }, { status: 500 });
    }

    return NextResponse.json({
        gateway,
        properties: properties ?? [],
        readings: current.data ?? [],
        prevReadings: previous.data ?? [],
        range: { start, end, prevStart: iso(prevStart), prevEnd: iso(prevEnd) },
    });
}

/**
 * PATCH /api/gateways/[id]
 * body: { label?: string, description?: string | null, property_id?: string | null }
 */
export async function PATCH(request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) {
        return NextResponse.json({ error: "Gateway não encontrado" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
        return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }

    const updates: Record<string, string | null> = {};

    if (body.label !== undefined) {
        const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
        if (!label) {
            return NextResponse.json({ error: "Nome do gateway é obrigatório" }, { status: 400 });
        }
        updates.label = label;
    }

    if (body.description !== undefined) {
        updates.description =
            typeof body.description === "string" && body.description.trim()
                ? body.description.trim().slice(0, 1000)
                : null;
    }

    if (body.property_id !== undefined) {
        if (body.property_id === null || body.property_id === "") {
            updates.property_id = null;
        } else {
            const owned = await getOwnedProperty(supabase, profileId, String(body.property_id));
            if (!owned) {
                return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
            }
            updates.property_id = String(body.property_id);
        }
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    const { data: updated, error } = await supabase
        .from("gateways")
        .update(updates)
        .eq("id", id)
        .eq("owner_id", profileId)
        .select(GATEWAY_COLUMNS)
        .maybeSingle();

    if (error) {
        console.error("[Gateway PATCH] Error:", error.message);
        return NextResponse.json({ error: "Erro ao salvar gateway" }, { status: 500 });
    }
    if (!updated) {
        return NextResponse.json({ error: "Gateway não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, gateway: updated });
}

/**
 * DELETE /api/gateways/[id]
 * Unclaims the gateway: detaches it from the owner and property and resets it
 * to `unclaimed` so it can be claimed again with its serial number.
 */
export async function DELETE(_request: Request, context: RouteContext) {
    const authed = await requireProfile();
    if ("response" in authed) return authed.response;
    const { profileId, supabase } = authed.ctx;

    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) {
        return NextResponse.json({ error: "Gateway não encontrado" }, { status: 404 });
    }

    const { data: removed, error } = await supabase
        .from("gateways")
        .update({
            owner_id: null,
            property_id: null,
            status: "unclaimed",
            description: null,
            photo_url: null,
            panel_photo_url: null,
        })
        .eq("id", id)
        .eq("owner_id", profileId)
        .select("id")
        .maybeSingle();

    if (error) {
        console.error("[Gateway DELETE] Error:", error.message);
        return NextResponse.json({ error: "Erro ao remover gateway" }, { status: 500 });
    }
    if (!removed) {
        return NextResponse.json({ error: "Gateway não encontrado" }, { status: 404 });
    }

    // Best effort: drop the photos that belonged to this owner's claim
    try {
        const { data: files } = await supabase.storage.from("gateway-photos").list(id);
        if (files?.length) {
            await supabase.storage.from("gateway-photos").remove(files.map((f) => `${id}/${f.name}`));
        }
    } catch {
        // ignore
    }

    return NextResponse.json({ success: true });
}
