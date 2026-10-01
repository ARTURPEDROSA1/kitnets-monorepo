"use client";

/**
 * A contract's title with the tenant's name blurred by the eye toggle (components/privacy): the
 * place stays readable, only the name is wrapped. A title without the name is printed as it is.
 */
import React from "react";
import { Sensitive } from "@/components/privacy";
import { splitTitle } from "@/lib/lease-title";

export function LeaseTitle({ title, tenant }: { title: string; tenant: string | null | undefined }) {
    const parts = splitTitle(title, tenant);
    if (!parts) return <>{title}</>;
    return (
        <>
            {parts.before}
            <Sensitive>{parts.match}</Sensitive>
            {parts.after}
        </>
    );
}
