import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { billId } = body;

        if (!billId) {
            return NextResponse.json(
                { error: "billId is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        const { error, count } = await supabase
            .from("water_bills")
            .delete({ count: "exact" })
            .eq("id", billId);

        if (error) {
            console.error("Delete bill error:", error);
            return NextResponse.json(
                { error: `Erro ao excluir: ${error.message}` },
                { status: 500 }
            );
        }

        if (count === 0) {
            return NextResponse.json(
                { error: "Conta não encontrada ou já foi excluída." },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, deleted: count });
    } catch (error) {
        console.error("Delete bill error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { error: `Erro inesperado: ${message}` },
            { status: 500 }
        );
    }
}
