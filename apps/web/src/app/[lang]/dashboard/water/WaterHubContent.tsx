"use client";

/**
 * Água — the hub of the rental properties whose main water meter the landlord pays. Each card opens
 * the property's water dashboard (`/dashboard/billing/[propertyId]`). The list is built on the
 * server by the page; nothing is changed from here.
 */
import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import WaterHub from "@/components/water/WaterHub";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import { todayBRT } from "@/lib/lease-dashboard";
import { monthLabel, waterRows, waterViewFromParam, type WaterUnitRow, type WaterView } from "@/lib/water-hub";
import type { WaterPropertySummary } from "@/lib/water-properties-server";

export default function WaterHubContent({ lang, properties }: { lang: string; properties: WaterPropertySummary[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const view = waterViewFromParam(searchParams.get("view"));
    const today = useMemo(() => todayBRT(), []);
    const base = `/${lang}/dashboard/water`;
    const rows = useMemo(() => waterRows(properties, today), [properties, today]);

    const setView = (next: WaterView) => router.replace(next === "todos" ? base : `${base}?view=${next}`, { scroll: false });
    const open = (row: WaterUnitRow) => router.push(`/${lang}/dashboard/billing/${row.unit.id}`);

    const [pdf, setPdf] = useState<{ url: string; title: string; fileName: string } | null>(null);
    const viewPdf = (row: WaterUnitRow) => {
        if (!row.unit.latestBillPdfUrl) return;
        const month = row.latest ? monthLabel(row.latest.month) : "";
        setPdf({ url: row.unit.latestBillPdfUrl, title: `Conta de Água - ${row.unit.name} - ${month}`, fileName: `conta-agua-${row.latest?.month ?? "atual"}.pdf` });
    };

    return (
        <>
            <WaterHub lang={lang} rows={rows} view={view} onViewChange={setView} onOpen={open} onViewPdf={viewPdf} />
            {pdf && <PdfViewerModal isOpen onClose={() => setPdf(null)} url={pdf.url} title={pdf.title} fileName={pdf.fileName} />}
        </>
    );
}
