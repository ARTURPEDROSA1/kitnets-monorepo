import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Server-side guard for every /[lang]/dashboard/* page.
 *
 * Several dashboard pages are client components with no auth check of their
 * own, and middleware alone is not a sufficient boundary (see the Next.js
 * middleware-bypass advisories). This layout runs on the server for every
 * request to the dashboard subtree and redirects anonymous visitors.
 */
export default async function DashboardLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    const { userId } = await auth();
    if (!userId) {
        redirect(`/${lang}/login/proprietario`);
    }
    return <>{children}</>;
}
