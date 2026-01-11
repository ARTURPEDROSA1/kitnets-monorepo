-- Idempotent script for INSS 2026 Article
DO $$
DECLARE
    v_article_id uuid;
    v_author_id uuid;
    v_category_id uuid;
    v_translation_id uuid;
    v_slug text := 'calendario-pagamentos-inss-2026';
    v_lang text := 'pt';
    v_title text := 'Calendário de Pagamentos do INSS 2026: Datas, Regras e Reajustes Importantes';
    v_published_at timestamptz := now();
    v_content text;
BEGIN

    -- Get Author ID (assuming Artur Pedrosa exists)
    SELECT id INTO v_author_id FROM public.authors WHERE slug = 'artur-pedrosa';
    IF v_author_id IS NULL THEN
        RAISE EXCEPTION 'Author Artur Pedrosa not found';
    END IF;

    -- Get Category ID (assuming Salario e Renda exists)
    SELECT id INTO v_category_id FROM public.categories WHERE slug = 'salario-e-renda';
    IF v_category_id IS NULL THEN
        RAISE EXCEPTION 'Category Salario e Renda not found';
    END IF;

    -- Construct MDX Content
    v_content := $mdx$
O Instituto Nacional do Seguro Social (INSS) já divulgou oficialmente o calendário de pagamentos dos benefícios de 2026. Essa informação é essencial para aposentados, pensionistas, segurados que recebem auxílios e quem depende das receitas previdenciárias para planejar despesas ao longo do ano.

A seguir, explicamos com detalhamento as datas dos depósitos mês a mês, a forma como o INSS organiza os pagamentos e quais são as mudanças mais relevantes em valores para este ano.

## Como o calendário funciona

O INSS organiza os pagamentos de acordo com duas faixas principais:

<div className="grid md:grid-cols-2 gap-6 my-8">
<div className="p-6 bg-card border rounded-xl shadow-sm">
<h3 className="text-xl font-semibold mb-3 flex items-center gap-2"><ArrowRight className="w-5 h-5 text-primary"/> Até 1 Salário Mínimo</h3>
<p className="text-muted-foreground">São valores que estão no piso previdenciário e seguem um calendário específico, iniciando os depósitos já no final de janeiro.</p>
</div>

<div className="p-6 bg-card border rounded-xl shadow-sm">
<h3 className="text-xl font-semibold mb-3 flex items-center gap-2"><ArrowRight className="w-5 h-5 text-primary"/> Acima de 1 Salário Mínimo</h3>
<p className="text-muted-foreground">Começam a ser pagos alguns dias depois, também de acordo com o número final do cartão do benefício (desconsiderando o dígito verificador).</p>
</div>
</div>

<Callout type="info">
<strong>Nota:</strong> A lógica de datas mensais é a mesma de anos anteriores, mas com datas concretas definidas para 2026.
</Callout>

## 📅 Datas principais do calendário INSS 2026

O calendário de pagamentos do INSS em 2026 é organizado de acordo com o valor do benefício e o número final do benefício (último dígito antes do hífen “–”).

<div className="my-8 rounded-xl overflow-hidden border bg-muted/20">
  <Image
    src="/images/articles/inss-cartao-beneficio-2026.png"
    alt="Cartão do benefício do INSS com destaque para o número final"
    width={800}
    height={400}
    className="w-full h-auto object-cover"
  />
  <div className="p-3 text-sm text-center text-muted-foreground bg-muted/50">
    O número final é o último dígito antes do traço verificador.
  </div>
</div>

### Pagamentos até 1 salário mínimo

Se você recebe até 1 salário mínimo — que é o caso da maioria dos beneficiários do INSS — as datas variam conforme o número final do benefício.

<div className="overflow-x-auto my-8 border rounded-lg shadow-sm">
  <table className="w-full text-sm text-left whitespace-nowrap">
    <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
      <tr>
        <th className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Mês</th>
        <th className="px-4 py-3 font-medium">Final 1</th>
        <th className="px-4 py-3 font-medium">Final 2</th>
        <th className="px-4 py-3 font-medium">Final 3</th>
        <th className="px-4 py-3 font-medium">Final 4</th>
        <th className="px-4 py-3 font-medium">Final 5</th>
        <th className="px-4 py-3 font-medium">Final 6</th>
        <th className="px-4 py-3 font-medium">Final 7</th>
        <th className="px-4 py-3 font-medium">Final 8</th>
        <th className="px-4 py-3 font-medium">Final 9</th>
        <th className="px-4 py-3 font-medium">Final 0</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border">
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Janeiro</td>
        <td className="px-4 py-3">26/01</td>
        <td className="px-4 py-3">27/01</td>
        <td className="px-4 py-3">28/01</td>
        <td className="px-4 py-3">29/01</td>
        <td className="px-4 py-3">30/01</td>
        <td className="px-4 py-3">02/02</td>
        <td className="px-4 py-3">03/02</td>
        <td className="px-4 py-3">04/02</td>
        <td className="px-4 py-3">05/02</td>
        <td className="px-4 py-3">06/02</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Fevereiro</td>
        <td className="px-4 py-3">23/02</td>
        <td className="px-4 py-3">24/02</td>
        <td className="px-4 py-3">25/02</td>
        <td className="px-4 py-3">26/02</td>
        <td className="px-4 py-3">27/02</td>
        <td className="px-4 py-3">02/03</td>
        <td className="px-4 py-3">03/03</td>
        <td className="px-4 py-3">04/03</td>
        <td className="px-4 py-3">05/03</td>
        <td className="px-4 py-3">06/03</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Março</td>
        <td className="px-4 py-3">25/03</td>
        <td className="px-4 py-3">26/03</td>
        <td className="px-4 py-3">27/03</td>
        <td className="px-4 py-3">30/03</td>
        <td className="px-4 py-3">31/03</td>
        <td className="px-4 py-3">01/04</td>
        <td className="px-4 py-3">02/04</td>
        <td className="px-4 py-3">06/04</td>
        <td className="px-4 py-3">07/04</td>
        <td className="px-4 py-3">08/04</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Abril</td>
        <td className="px-4 py-3">24/04</td>
        <td className="px-4 py-3">27/04</td>
        <td className="px-4 py-3">28/04</td>
        <td className="px-4 py-3">29/04</td>
        <td className="px-4 py-3">30/04</td>
        <td className="px-4 py-3">04/05</td>
        <td className="px-4 py-3">05/05</td>
        <td className="px-4 py-3">06/05</td>
        <td className="px-4 py-3">07/05</td>
        <td className="px-4 py-3">08/04</td>
      </tr>
       <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Maio</td>
        <td className="px-4 py-3">25/05</td>
        <td className="px-4 py-3">26/05</td>
        <td className="px-4 py-3">27/05</td>
        <td className="px-4 py-3">28/05</td>
        <td className="px-4 py-3">29/05</td>
        <td className="px-4 py-3">01/06</td>
        <td className="px-4 py-3">02/06</td>
        <td className="px-4 py-3">03/06</td>
        <td className="px-4 py-3">05/06</td>
        <td className="px-4 py-3">08/06</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Junho</td>
        <td className="px-4 py-3">24/06</td>
        <td className="px-4 py-3">25/06</td>
        <td className="px-4 py-3">26/06</td>
        <td className="px-4 py-3">29/06</td>
        <td className="px-4 py-3">30/06</td>
        <td className="px-4 py-3">01/07</td>
        <td className="px-4 py-3">02/07</td>
        <td className="px-4 py-3">03/07</td>
        <td className="px-4 py-3">06/07</td>
        <td className="px-4 py-3">07/07</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Julho</td>
        <td className="px-4 py-3">27/07</td>
        <td className="px-4 py-3">28/07</td>
        <td className="px-4 py-3">29/07</td>
        <td className="px-4 py-3">30/07</td>
        <td className="px-4 py-3">31/07</td>
        <td className="px-4 py-3">03/08</td>
        <td className="px-4 py-3">04/08</td>
        <td className="px-4 py-3">05/08</td>
        <td className="px-4 py-3">06/08</td>
        <td className="px-4 py-3">07/08</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Agosto</td>
        <td className="px-4 py-3">25/08</td>
        <td className="px-4 py-3">26/08</td>
        <td className="px-4 py-3">27/08</td>
        <td className="px-4 py-3">28/08</td>
        <td className="px-4 py-3">31/08</td>
        <td className="px-4 py-3">01/09</td>
        <td className="px-4 py-3">02/09</td>
        <td className="px-4 py-3">03/09</td>
        <td className="px-4 py-3">04/09</td>
        <td className="px-4 py-3">08/09</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Setembro</td>
        <td className="px-4 py-3">24/09</td>
        <td className="px-4 py-3">25/09</td>
        <td className="px-4 py-3">28/09</td>
        <td className="px-4 py-3">29/09</td>
        <td className="px-4 py-3">30/09</td>
        <td className="px-4 py-3">01/10</td>
        <td className="px-4 py-3">02/10</td>
        <td className="px-4 py-3">05/10</td>
        <td className="px-4 py-3">06/10</td>
        <td className="px-4 py-3">07/10</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Outubro</td>
        <td className="px-4 py-3">26/10</td>
        <td className="px-4 py-3">27/10</td>
        <td className="px-4 py-3">28/10</td>
        <td className="px-4 py-3">29/10</td>
        <td className="px-4 py-3">30/10</td>
        <td className="px-4 py-3">03/11</td>
        <td className="px-4 py-3">04/11</td>
        <td className="px-4 py-3">05/11</td>
        <td className="px-4 py-3">06/11</td>
        <td className="px-4 py-3">09/11</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Novembro</td>
        <td className="px-4 py-3">24/11</td>
        <td className="px-4 py-3">25/11</td>
        <td className="px-4 py-3">26/11</td>
        <td className="px-4 py-3">27/11</td>
        <td className="px-4 py-3">30/11</td>
        <td className="px-4 py-3">01/12</td>
        <td className="px-4 py-3">02/12</td>
        <td className="px-4 py-3">03/12</td>
        <td className="px-4 py-3">04/12</td>
        <td className="px-4 py-3">07/12</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Dezembro</td>
        <td className="px-4 py-3">22/12</td>
        <td className="px-4 py-3">23/12</td>
        <td className="px-4 py-3">28/12</td>
        <td className="px-4 py-3">29/12</td>
        <td className="px-4 py-3">30/12</td>
        <td className="px-4 py-3">04/01/27</td>
        <td className="px-4 py-3">05/01/27</td>
        <td className="px-4 py-3">06/01/27</td>
        <td className="px-4 py-3">07/01/27</td>
        <td className="px-4 py-3">08/01/27</td>
      </tr>
    </tbody>
  </table>
</div>

### Pagamentos acima de 1 salário mínimo

Para quem recebe acima de 1 salário mínimo, o INSS agrupa os pagamentos por dois finais de benefício:

<div className="overflow-x-auto my-8 border rounded-lg shadow-sm">
  <table className="w-full text-sm text-left whitespace-nowrap">
    <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
      <tr>
        <th className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Mês</th>
        <th className="px-4 py-3 font-medium">Final 1 ou 6</th>
        <th className="px-4 py-3 font-medium">Final 2 ou 7</th>
        <th className="px-4 py-3 font-medium">Final 3 ou 8</th>
        <th className="px-4 py-3 font-medium">Final 4 ou 9</th>
        <th className="px-4 py-3 font-medium">Final 5 ou 0</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border">
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Janeiro</td>
        <td className="px-4 py-3">02/02</td>
        <td className="px-4 py-3">03/02</td>
        <td className="px-4 py-3">04/02</td>
        <td className="px-4 py-3">05/02</td>
        <td className="px-4 py-3">06/02</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Fevereiro</td>
        <td className="px-4 py-3">02/03</td>
        <td className="px-4 py-3">03/03</td>
        <td className="px-4 py-3">04/03</td>
        <td className="px-4 py-3">05/03</td>
        <td className="px-4 py-3">06/03</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Março</td>
        <td className="px-4 py-3">01/04</td>
        <td className="px-4 py-3">02/04</td>
        <td className="px-4 py-3">06/04</td>
        <td className="px-4 py-3">07/04</td>
        <td className="px-4 py-3">08/04</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Abril</td>
        <td className="px-4 py-3">02/05</td>
        <td className="px-4 py-3">05/05</td>
        <td className="px-4 py-3">06/05</td>
        <td className="px-4 py-3">07/05</td>
        <td className="px-4 py-3">08/05</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Maio</td>
        <td className="px-4 py-3">01/06</td>
        <td className="px-4 py-3">02/06</td>
        <td className="px-4 py-3">03/06</td>
        <td className="px-4 py-3">05/06</td>
        <td className="px-4 py-3">08/06</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Junho</td>
        <td className="px-4 py-3">01/07</td>
        <td className="px-4 py-3">02/07</td>
        <td className="px-4 py-3">03/07</td>
        <td className="px-4 py-3">06/07</td>
        <td className="px-4 py-3">07/07</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Julho</td>
        <td className="px-4 py-3">03/08</td>
        <td className="px-4 py-3">04/08</td>
        <td className="px-4 py-3">05/08</td>
        <td className="px-4 py-3">06/08</td>
        <td className="px-4 py-3">07/08</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Agosto</td>
        <td className="px-4 py-3">01/09</td>
        <td className="px-4 py-3">02/09</td>
        <td className="px-4 py-3">03/09</td>
        <td className="px-4 py-3">04/09</td>
        <td className="px-4 py-3">08/09</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Setembro</td>
        <td className="px-4 py-3">01/10</td>
        <td className="px-4 py-3">02/10</td>
        <td className="px-4 py-3">05/10</td>
        <td className="px-4 py-3">06/10</td>
        <td className="px-4 py-3">07/10</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Outubro</td>
        <td className="px-4 py-3">03/11</td>
        <td className="px-4 py-3">04/11</td>
        <td className="px-4 py-3">05/11</td>
        <td className="px-4 py-3">06/11</td>
        <td className="px-4 py-3">09/11</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Novembro</td>
        <td className="px-4 py-3">01/12</td>
        <td className="px-4 py-3">02/12</td>
        <td className="px-4 py-3">03/12</td>
        <td className="px-4 py-3">04/12</td>
        <td className="px-4 py-3">07/12</td>
      </tr>
      <tr className="bg-background hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium sticky left-0 bg-background md:bg-transparent shadow-[1px_0_0_0_rgba(0,0,0,0.1)] md:shadow-none">Dezembro</td>
        <td className="px-4 py-3">04/01/27</td>
        <td className="px-4 py-3">05/01/27</td>
        <td className="px-4 py-3">06/01/27</td>
        <td className="px-4 py-3">07/01/27</td>
        <td className="px-4 py-3">08/01/27</td>
      </tr>
    </tbody>
  </table>
</div>

## Como identificar sua data de pagamento

Para verificar exatamente quando seu benefício cairá na conta, o INSS orienta que o segurado:

1. Acesse o site ou aplicativo **Meu INSS** e consulte o serviço Extrato de Pagamento.
2. Ligue para o telefone **135** (funciona de segunda a sábado, das 7h às 22h).
3. Consulte a tabela oficial do INSS com o uso número final do benefício.

<Callout type="info">
<strong>Dica:</strong> A lógica de final de benefício e calendário mensal se repete para todos os meses de 2026, facilitando o controle financeiro mensal.
</Callout>

## Reajustes de valores em 2026

Além das datas de depósito, 2026 traz alterações importantes nos valores recebidos pelos beneficiários:

<div className="grid gap-4 my-6">
<div className="flex gap-4 p-4 bg-muted/30 rounded-lg">
    <TrendingUp className="w-6 h-6 text-green-600 mt-1 shrink-0" />
    <div>
        <h3 className="font-semibold text-lg">Salário mínimo e piso previdenciário</h3>
        <p className="text-muted-foreground">O piso de referência do país (salário mínimo) foi reajustado e passou a ser <strong>R$ 1.621,00</strong> em 1º de janeiro de 2026. Aposentadorias e pensões no piso seguem este valor.</p>
    </div>
</div>

<div className="flex gap-4 p-4 bg-muted/30 rounded-lg">
    <BadgePercent className="w-6 h-6 text-blue-600 mt-1 shrink-0" />
    <div>
        <h3 className="font-semibold text-lg">Correção acima do piso</h3>
        <p className="text-muted-foreground">Para valores acima do mínimo, a correção é baseada no INPC. O aumento estimado é de cerca de <strong>3,9%</strong> para 2026.</p>
    </div>
</div>

<div className="flex gap-4 p-4 bg-muted/30 rounded-lg">
    <Wallet className="w-6 h-6 text-purple-600 mt-1 shrink-0" />
    <div>
        <h3 className="font-semibold text-lg">Teto do INSS</h3>
        <p className="text-muted-foreground">O valor máximo (teto previdenciário) também foi ajustado para cerca de <strong>R$ 8.537,55</strong> em 2026.</p>
    </div>
</div>
</div>

## Dicas para aposentados e pensionistas

* **Confira todos os meses:** Verifique sua data antes de comprometer valores fixos.
* **Meu INSS:** Utilize o app para acessar extratos e histórico.
* **Planejamento:** Considere o reajuste ao planejar despesas anuais.
* **Organização:** Se receber valores abaixo ou acima do mínimo, sua data de pagamento será diferente — organize-se conforme sua faixa.

## Conclusão

O calendário de pagamentos do INSS 2026 já está disponível e traz datas bem definidas mês a mês, organizadas pelo final do número do benefício e pelo valor do pagamento. Além disso, os valores foram ajustados conforme o novo salário mínimo e a inflação, beneficiando milhões de aposentados e pensionistas.
$mdx$;

    -- Check if article translation already exists
    SELECT article_id INTO v_article_id
    FROM public.article_translations
    WHERE lang = v_lang AND slug = v_slug;

    IF v_article_id IS NOT NULL THEN
        -- UPDATE existing
        RAISE NOTICE 'Updating existing article with ID: %', v_article_id;

        UPDATE public.article_translations
        SET 
            title = v_title,
            content_mdx = v_content,
            excerpt = 'O INSS divulgou o calendário de 2026. Confira as datas de pagamento para quem recebe até um salário mínimo e acima, além dos reajustes confirmados.',
            metadata = jsonb_build_object(
                'seo_title', v_title,
                'seo_description', 'Confira o calendário completo de pagamentos do INSS para 2026, com datas para benefícios até e acima de 1 salário mínimo e valores reajustados.',
                'og_image_url', '/images/articles/inss-cartao-beneficio-2026.png'
            ),
            updated_at = now()
        WHERE article_id = v_article_id AND lang = v_lang;

        -- Update main article timestamp
        UPDATE public.articles
        SET updated_at = now(), status = 'published'
        WHERE id = v_article_id;

    ELSE
        -- INSERT new
        v_article_id := gen_random_uuid();
        v_translation_id := gen_random_uuid();
        
        RAISE NOTICE 'Inserting new article with ID: %', v_article_id;

        INSERT INTO public.articles (id, author_id, primary_category_id, status, published_at, updated_at, created_at)
        VALUES (v_article_id, v_author_id, v_category_id, 'published', v_published_at, v_published_at, v_published_at);

        INSERT INTO public.article_translations (
            id, article_id, lang, title, slug, excerpt, content_mdx, metadata, reading_time_minutes, updated_at, created_at
        )
        VALUES (
            v_translation_id,
            v_article_id,
            v_lang,
            v_title,
            v_slug,
            'O INSS divulgou o calendário de 2026. Confira as datas de pagamento para quem recebe até um salário mínimo e acima, além dos reajustes confirmados.',
            v_content,
            jsonb_build_object(
                'seo_title', v_title,
                'seo_description', 'Confira o calendário completo de pagamentos do INSS para 2026, com datas para benefícios até e acima de 1 salário mínimo e valores reajustados.',
                'og_image_url', '/images/articles/inss-cartao-beneficio-2026.png'
            ),
            5,
            v_published_at,
            v_published_at
        );
    END IF;

END $$;
