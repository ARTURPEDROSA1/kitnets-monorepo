import { getDictionary } from "../../../dictionaries";
import { OnboardingWizard } from "../../../components/Onboarding/OnboardingWizard";

export default async function OnboardingPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = getDictionary(lang);

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <OnboardingWizard t={dict.onboarding} lang={lang} />
        </div>
    );
}
