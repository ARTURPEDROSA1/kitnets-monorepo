import { Metadata } from "next";

export const metadata: Metadata = {
    title: "A renda do aluguel paga o financiamento? - Kitnets.com",
    description: "Descubra em quantos anos a renda do aluguel passa a pagar o financiamento imobiliário. Simule SAC ou PRICE, considere juros, seguros, impostos, vacância e reajuste anual.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
