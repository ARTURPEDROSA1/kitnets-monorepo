
import SignupForm from "./SignupForm";

export default async function Page({ params }: { params: Promise<{ lang: "en" | "pt" | "es" }> }) {
    const { lang } = await params;
    return <SignupForm lang={lang} />;
}
