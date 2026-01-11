DO $$
DECLARE
  v_author_id uuid;
  v_cat_impostos uuid;
  v_cat_salario uuid;
  v_article_id uuid;
BEGIN

  -- 1. Upsert Author
  INSERT INTO authors (slug, name, bio, avatar_url)
  VALUES ('artur-pedrosa', 'Artur Pedrosa', 'Fundador da Kitnets.com | Especialista em mercado imobiliário e finanças pessoais', '/images/authors/artur-pedrosa.jpg')
  ON CONFLICT (slug) DO UPDATE SET bio = EXCLUDED.bio RETURNING id INTO v_author_id;
  
  IF v_author_id IS NULL THEN
      SELECT id INTO v_author_id FROM authors WHERE slug = 'artur-pedrosa';
  END IF;

  -- 2. Upsert Categories
  -- Impostos
  INSERT INTO categories (slug, name, description)
  VALUES ('impostos-e-legislacao', 'Impostos e Legislação', 'Conteúdos sobre legislação e impostos no Brasil.')
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO v_cat_impostos FROM categories WHERE slug = 'impostos-e-legislacao';

  -- Salario
  INSERT INTO categories (slug, name, description)
  VALUES ('salario-e-renda', 'Salário e Renda', 'Conteúdos sobre salários, renda e economia popular.')
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO v_cat_salario FROM categories WHERE slug = 'salario-e-renda';

  -- 3. Article 1: Imposto Dividendos
  -- Check if exists first to avoid dupes purely by slug logic in separate blocks (slug is unique in translation, but article is parent)
  -- effectively we want "Upsert Article by checking if a translation with this slug exists". 
  -- Simpler: We insert article if not exists.
  
  -- But article table doesn't have the slug, translation does. 
  -- We'll assume if we run this script multiple times, we might create duplicate "Articles" if we don't check carefully.
  -- Strategy: Check if translation exists first.
  
  IF NOT EXISTS (SELECT 1 FROM article_translations WHERE slug = 'imposto-sobre-dividendos' AND lang = 'pt') THEN
      INSERT INTO articles (author_id, primary_category_id, status, published_at)
      VALUES (v_author_id, v_cat_impostos, 'published', '2026-01-01 00:00:00+00')
      RETURNING id INTO v_article_id;
      
      INSERT INTO article_translations (article_id, lang, title, slug, excerpt, reading_time_minutes, metadata, content_mdx)
      VALUES (
        v_article_id, 
        'pt', 
        'Imposto sobre dividendos e renda no Brasil: entenda as principais mudanças do PL 1087/2025', 
        'imposto-sobre-dividendos',
        'Entenda o PL 1087/2025: novas regras para dividendos, isenção de IR até R$ 5 mil e imposto mínimo para altas rendas.',
        10,
        '{"seo_title": "Imposto sobre dividendos e renda no Brasil: entenda as principais mudanças do PL 1087/2025 | Kitnets.com", "seo_description": "Entenda o PL 1087/2025: novas regras para dividendos, isenção de IR até R$ 5 mil e imposto mínimo para altas rendas."}'::jsonb,
        E'<p>
                    O Imposto de Renda no Brasil passa por uma das mudanças mais relevantes das últimas décadas. Com o avanço do <strong>PL 1087/2025</strong>, o país redesenha a tributação da renda ao mesmo tempo em que amplia a isenção do IR para milhões de brasileiros.
                </p>
                <p>
                    A proposta combina alívio fiscal para quem ganha menos com novas regras de tributação para dividendos e altas rendas, alterando a lógica histórica do sistema tributário brasileiro. A discussão deixa de ser apenas “quanto cada um paga” e passa a responder uma pergunta central: quem financia a ampliação da isenção do Imposto de Renda e quais são os efeitos econômicos dessa escolha?
                </p>
                <p>
                    Neste guia completo da <strong>Kitnets.com</strong>, você entende o que muda na prática, quem ganha, quem paga mais, como funcionará o imposto sobre dividendos, os impactos no Simples Nacional, a janela de transição até 2028 e o funcionamento do novo imposto mínimo para altas rendas.
                </p>

                <div className="bg-muted/40 p-8 rounded-2xl border border-border my-12">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-primary">
                        <TrendingUp className="h-6 w-6" />
                        O que muda no Imposto de Renda com o PL 1087/2025
                    </h2>
                    <p className="mb-6">
                        O projeto aprovado na Câmara e em análise no Senado redefine três pilares centrais da tributação da renda no Brasil, com vigência a partir de 2026:
                    </p>
                    <ul className="space-y-4 list-none pl-0">
                        <li className="flex gap-4">
                            <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">1</span>
                            <div>
                                <strong className="block text-foreground text-lg mb-1">Isenção total do IR para quem ganha até R$ 5.000 por mês</strong>
                                Contribuintes nessa faixa passam a não pagar Imposto de Renda, aumentando diretamente a renda disponível das famílias e estimulando o consumo.
                            </div>
                        </li>
                        <li className="flex gap-4">
                            <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">2</span>
                            <div>
                                <strong className="block text-foreground text-lg mb-1">Desconto parcial para rendas até R$ 7.350</strong>
                                Quem recebe entre R$ 5.000,01 e R$ 7.350 terá um benefício decrescente. Acima desse patamar, volta a valer a tabela progressiva tradicional, sem aumento das alíquotas máximas.
                            </div>
                        </li>
                        <li className="flex gap-4">
                            <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">3</span>
                            <div>
                                <strong className="block text-foreground text-lg mb-1">Compensação via altas rendas e dividendos</strong>
                                <span className="block mb-2">Para financiar a renúncia fiscal, o projeto institui:</span>
                                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                                    <li>Imposto mínimo anual para altas rendas, com alíquota de 0% a 10%;</li>
                                    <li>Retenção de 10% sobre dividendos que excederem R$ 50 mil por mês, por empresa pagadora;</li>
                                    <li>Tributação de 10% sobre lucros e dividendos remetidos ao exterior, com exceções específicas.</li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                    <p className="mt-6 text-sm text-muted-foreground italic border-t border-border/50 pt-4">
                        A lógica fiscal é clara: aliviar a base da pirâmide de renda sem gerar desequilíbrio fiscal, preservando a arrecadação de estados e municípios.
                    </p>
                </div>

                <h2 className="text-3xl font-bold mt-12 mb-6 flex items-center gap-3">
                    <Wallet className="h-7 w-7 text-primary" />
                    Quem paga a conta da nova isenção do IR?
                </h2>
                <p>
                    A ampliação da isenção do IRPF gera renúncia de arrecadação. O PL 1087/2025 estrutura a compensação em três frentes principais:
                </p>
                <div className="grid md:grid-cols-3 gap-6 my-8">
                    {[
                        "Imposto mínimo sobre rendas totais acima de R$ 600 mil por ano, com progressividade até 10%.",
                        "Retenção de 10% sobre dividendos elevados, como antecipação do imposto devido.",
                        "Tributação de dividendos remetidos ao exterior, preservando exceções legais."
                    ].map((item, idx) => (
                        <div key={idx} className="bg-card border border-border p-6 rounded-xl shadow-sm text-sm font-medium">
                            {item}
                        </div>
                    ))}
                </div>
                <p>
                    A engenharia do projeto prioriza <strong>compensar perdas de estados e municípios (FPE e FPM)</strong> para, apenas depois, avaliar eventuais reduções na CBS (tributo sobre consumo). Na prática, o sistema passa a considerar menos cada fonte isolada de renda e mais a alíquota efetiva global do contribuinte ao final do ano.
                </p>

                <h2 className="text-3xl font-bold mt-16 mb-6 flex items-center gap-3">
                    <Scale className="h-7 w-7 text-primary" />
                    Imposto sobre dividendos no Brasil: como funciona a retenção de 10%
                </h2>
                <p>
                    O ponto mais debatido do PL 1087/2025 é a criação da retenção de 10% sobre dividendos pagos a pessoas físicas residentes no Brasil.
                </p>

                <h3 className="text-xl font-bold mt-8 mb-4">Como funciona na prática</h3>
                <p>A retenção incide somente sobre o valor que exceder <strong>R$ 50 mil no mês</strong>, por empresa pagadora.</p>

                <div className="grid md:grid-cols-2 gap-6 my-6">
                    <div className="bg-green-50 dark:bg-green-950/20 p-6 rounded-xl border border-green-100 dark:border-green-900">
                        <h4 className="font-bold text-green-800 dark:text-green-400 mb-2">Exemplo 1:</h4>
                        <p className="text-green-900 dark:text-green-100 font-medium">Dividendos de R$ 80 mil de uma empresa.</p>
                        <p className="text-sm mt-2 text-green-800 dark:text-green-300">Retenção de 10% sobre R$ 30 mil (excedente).</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-xl border border-blue-100 dark:border-blue-900">
                        <h4 className="font-bold text-blue-800 dark:text-blue-400 mb-2">Exemplo 2:</h4>
                        <p className="text-blue-900 dark:text-blue-100 font-medium">Dividendos de R$ 40 mil de duas empresas diferentes.</p>
                        <p className="text-sm mt-2 text-blue-800 dark:text-blue-300">Sem retenção mensal (cada fonte está abaixo do teto).</p>
                    </div>
                </div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    Importante: a retenção não é definitiva. Ela é compensável no ajuste anual, funcionando como antecipação do imposto mínimo, quando aplicável.
                </p>

                <h3 className="text-xl font-bold mt-10 mb-4 text-orange-600 dark:text-orange-400">Janela de transição 2025–2028: oportunidade com governança</h3>
                <p>
                    O projeto cria uma regra de transição relevante: <strong>Lucros apurados até 2025, com distribuição aprovada até 31/12/2025, não sofrem a retenção de 10%</strong>, mesmo que sejam pagos entre 2026 e 2028.
                </p>
                <p>Para empresas com reservas acumuladas, isso traz previsibilidade — desde que haja governança e documentação robusta (demonstrações financeiras, atas societárias e fluxo de caixa real). Sem substância econômica, antecipações artificiais podem gerar risco fiscal relevante.</p>

                <h2 className="text-3xl font-bold mt-16 mb-6">Imposto mínimo para altas rendas: como funciona</h2>
                <p>O imposto mínimo não cria uma nova tabela progressiva tradicional. Ele estabelece um piso de tributação efetiva sobre a renda total anual:</p>

                <div className="overflow-hidden rounded-xl border border-border my-6">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted text-foreground font-medium">
                            <tr>
                                <th className="p-4">Renda anual total</th>
                                <th className="p-4">Alíquota mínima</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            <tr>
                                <td className="p-4">Até R$ 600 mil</td>
                                <td className="p-4 font-bold text-green-600">0%</td>
                            </tr>
                            <tr>
                                <td className="p-4">R$ 600 mil a R$ 1,2 milhão</td>
                                <td className="p-4 font-bold text-orange-600">0% → 10% (progressão linear)</td>
                            </tr>
                            <tr>
                                <td className="p-4">Acima de R$ 1,2 milhão</td>
                                <td className="p-4 font-bold text-red-600">10%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="grid md:grid-cols-2 gap-8 my-8">
                    <div>
                        <h4 className="font-semibold text-lg mb-3 text-green-600">✅ O que entra na base de cálculo</h4>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Salários</li>
                            <li>Dividendos</li>
                            <li>Rendimentos hoje isentos</li>
                            <li>Rendimentos tributados exclusivamente na fonte</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-lg mb-3 text-red-600">❌ O que fica fora</h4>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Poupança</li>
                            <li>Indenizações</li>
                            <li>Heranças e doações</li>
                            <li>Rendimentos isentos por doença grave</li>
                            <li>LCI, LCA, CRI, CRA, debêntures incentivadas</li>
                            <li>FIIs e Fiagros (sob requisitos legais)</li>
                        </ul>
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 border-l-4 border-blue-500 p-6 my-8 rounded-r-xl">
                    <h3 className="font-bold text-lg mb-2 text-blue-700 dark:text-blue-400">O redutor: evitando bitributação</h3>
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                        Para evitar que a soma da tributação na empresa (IRPJ + CSLL) com a tributação na pessoa física ultrapasse limites razoáveis, o projeto institui um redutor automático. Limites máximos combinados:
                    </p>
                    <ul className="mt-3 grid grid-cols-2 gap-4 text-sm font-medium">
                        <li className="bg-background p-2 rounded shadow-sm border border-border text-center">34% para empresas em geral</li>
                        <li className="bg-background p-2 rounded shadow-sm border border-border text-center">40% a 45% inst. financeiras</li>
                    </ul>
                </div>

                <h2 className="text-3xl font-bold mt-16 mb-6 flex items-center gap-3">
                    <Building2 className="h-7 w-7 text-primary" />
                    Simples Nacional e a distribuição de lucros
                </h2>
                <p>No Simples Nacional, a lógica estrutural permanece: lucros devidamente apurados continuam isentos no IRPF. Sem contabilidade, aplicam-se os tetos legais de presunção.</p>
                <p className="border-l-4 border-orange-500 pl-4 py-3 my-4 bg-orange-50 dark:bg-orange-950/20 text-orange-950 dark:text-orange-100 rounded-r-lg">
                    <strong>O que muda:</strong> Se a distribuição ao sócio exceder R$ 50 mil por mês por empresa, haverá retenção de 10% sobre o excedente, compensável no ajuste anual.
                </p>
                <p>Na prática, a contabilidade deixa de ser opcional para quem distribui valores elevados e passa a ser instrumento estratégico de proteção fiscal.</p>

                <h2 className="text-3xl font-bold mt-16 mb-6">Perguntas Frequentes (FAQ)</h2>
                <div className="space-y-4">
                    {[
                        { q: "Dividendos passam a ser tributados no Brasil?", a: "Sim. Haverá retenção de 10% sobre o excedente mensal acima de R$ 50 mil por empresa e possível incidência do imposto mínimo anual." },
                        { q: "Quem ganha apenas salário é afetado negativamente?", a: "Não. Até R$ 5 mil há isenção total; até R$ 7.350 há desconto parcial." },
                        { q: "O imposto mínimo cria bitributação?", a: "O projeto prevê redutores justamente para impedir que a carga combinada ultrapasse os limites legais." },
                        { q: "Estados e municípios perdem arrecadação?", a: "Não. A compensação aos entes subnacionais é prioridade na arquitetura fiscal do projeto." }
                    ].map((item, i) => (
                        <div key={i} className="border border-border rounded-lg p-4">
                            <h4 className="font-bold text-lg mb-2">{item.q}</h4>
                            <p className="text-muted-foreground">{item.a}</p>
                        </div>
                    ))}
                </div>

                <div className="border-t-2 border-primary/20 pt-10 mt-16">
                    <h2 className="text-3xl font-bold mb-6">Conclusão: o que muda na prática</h2>
                    <p>
                        O PL 1087/2025 representa uma virada estrutural na tributação da renda no Brasil. Ele reduz o peso do imposto para a base da população, amplia a incidência sobre rendas elevadas e introduz, pela primeira vez em décadas, um modelo sistemático de tributação de dividendos.
                    </p>
                    <p className="font-medium text-lg text-primary">
                        Para trabalhadores, o impacto é imediato: mais renda líquida no bolso. <br className="hidden md:block" />
                        Para empresários e investidores, o novo cenário exige planejamento tributário com governança.
                    </p>
                    <p>
                        Na <strong>Kitnets.com</strong>, você encontra análises atualizadas, simuladores e conteúdos práticos para entender como essas mudanças afetam sua renda, seus investimentos e seu patrimônio ao longo do tempo.
                    </p>
                </div>
'
      );
  END IF;

  -- 4. Article 2: Renda Fixa
  IF NOT EXISTS (SELECT 1 FROM article_translations WHERE slug = 'renda-fixa-reforma-imposto-de-renda' AND lang = 'pt') THEN
      INSERT INTO articles (author_id, primary_category_id, status, published_at)
      VALUES (v_author_id, v_cat_impostos, 'published', '2026-01-01 00:00:00+00')
      RETURNING id INTO v_article_id;

      INSERT INTO article_translations (article_id, lang, title, slug, excerpt, reading_time_minutes, metadata, content_mdx)
      VALUES (
        v_article_id, 
        'pt', 
        'Como fica a renda fixa com a reforma do Imposto de Renda', 
        'renda-fixa-reforma-imposto-de-renda',
        'A reforma do Imposto de Renda (PL 1087/2025) não muda a tributação direta do CDB e Tesouro, mas altera o planejamento para altas rendas. Entenda.',
        8,
        '{"seo_title": "Como fica a renda fixa com a reforma do Imposto de Renda | Kitnets.com", "seo_description": "A reforma do Imposto de Renda (PL 1087/2025) não muda a tributação direta do CDB e Tesouro, mas altera o planejamento para altas rendas. Entenda."}'::jsonb,
        E'<p>
                    Em outras palavras: <strong>o imposto do CDB não aumenta, mas o papel do CDB no planejamento tributário muda</strong>.
                </p>
                <p>
                    Neste artigo da <strong>Kitnets.com</strong>, você entende o que permanece igual, o que muda na prática e como a renda fixa passa a interagir com o novo imposto mínimo sobre altas rendas.
                </p>

                <h2 className="text-2xl font-bold mt-12 mb-6 flex items-center gap-3">
                    <BadgePercent className="h-7 w-7 text-primary" />
                    A tributação do CDB muda com a reforma do IR?
                </h2>
                <div className="bg-muted/40 p-6 rounded-xl border-l-4 border-green-500">
                    <p className="font-bold text-lg mb-2">Não.</p>
                    <p className="mb-0">A tributação do CDB e da renda fixa tributada permanece exatamente como é hoje.</p>
                </div>

                <div className="my-8">
                    <h3 className="text-xl font-bold mb-4">Como o CDB continua sendo tributado</h3>
                    <ul className="space-y-3 list-none pl-0">
                        <li className="flex items-start gap-3">
                            <ArrowRight className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                            <div><strong>Imposto de Renda retido na fonte</strong></div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                            <div>
                                <strong>Tabela regressiva:</strong>
                                <ul className="pl-4 mt-2 space-y-1 text-muted-foreground text-sm">
                                    <li>22,5% até 180 dias</li>
                                    <li>20% de 181 a 360 dias</li>
                                    <li>17,5% de 361 a 720 dias</li>
                                    <li>15% acima de 720 dias</li>
                                </ul>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                            <div><strong>IR considerado definitivo na fonte</strong></div>
                        </li>
                        <li className="flex items-start gap-3">
                            <ArrowRight className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                            <div><strong>IOF apenas nos primeiros 30 dias</strong> (regra já existente)</div>
                        </li>
                    </ul>
                </div>

                <p className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-lg border border-border">
                    <span className="text-lg">👉</span>
                    Não há nova alíquota, não há mudança de tabela e não há nova retenção específica sobre CDB, Tesouro Direto ou fundos DI.
                </p>

                <h2 className="text-3xl font-bold mt-12 mb-6 flex items-center gap-3">
                    <TrendingUp className="h-7 w-7 text-primary" />
                    Então o que muda com o PL 1087/2025?
                </h2>
                <p>
                    A mudança não está na tributação do produto, mas na forma como a Receita passa a olhar a <strong>renda total da pessoa física</strong>.
                </p>
                <p>
                    O projeto cria o chamado <strong>imposto mínimo para altas rendas</strong>, que considera a soma de todos os rendimentos recebidos no ano de forma global.
                </p>

                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl my-8">
                    <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Exemplo prático simplificado
                    </h3>
                    <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                        <p><strong>Renda total anual:</strong> R$ 1,3 milhão</p>
                        <p><strong>Alíquota mínima exigida:</strong> 10%</p>
                        <p className="border-b border-slate-200 dark:border-slate-700 pb-2 mb-2"><strong>Imposto mínimo esperado:</strong> R$ 130 mil</p>

                        <p>Se o contribuinte já tiver pago:</p>
                        <ul className="list-disc pl-5 mb-2">
                            <li>R$ 90 mil em IR sobre salários</li>
                            <li>R$ 30 mil em IR sobre CDB e outros investimentos</li>
                        </ul>
                        <p className="font-semibold">Total pago: R$ 120 mil</p>

                        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded mt-3 font-bold text-slate-900 dark:text-white">
                            ➡️ Diferença a pagar no ajuste: R$ 10 mil
                        </div>
                    </div>
                </div>

                <h2 className="text-2xl font-bold mt-12 mb-6">Renda fixa tributada x renda fixa isenta: o novo contraste</h2>
                <div className="overflow-x-auto my-6">
                    <table className="w-full text-sm border-collapse border border-border">
                        <thead className="bg-muted">
                            <tr>
                                <th className="p-3 border border-border">Produto</th>
                                <th className="p-3 border border-border">Entra no imposto mínimo?</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="p-3 border border-border font-medium">CDB / Tesouro / DI</td>
                                <td className="p-3 border border-border text-red-600 font-bold">✅ Sim</td>
                            </tr>
                            <tr>
                                <td className="p-3 border border-border font-medium">LCI / LCA / CRI / CRA</td>
                                <td className="p-3 border border-border text-green-600 font-bold">❌ Não</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
'
      );
  END IF;

  -- 5. Article 3: Salario Minimo
  IF NOT EXISTS (SELECT 1 FROM article_translations WHERE slug = 'salario-minimo-2026' AND lang = 'pt') THEN
      INSERT INTO articles (author_id, primary_category_id, status, published_at)
      VALUES (v_author_id, v_cat_salario, 'published', '2026-01-01 00:00:00+00')
      RETURNING id INTO v_article_id;

      INSERT INTO article_translations (article_id, lang, title, slug, excerpt, reading_time_minutes, metadata, content_mdx)
      VALUES (
        v_article_id, 
        'pt', 
        'Salário mínimo 2026 no Brasil: valor, reajuste e impactos', 
        'salario-minimo-2026',
        'Confira o novo valor do salário mínimo de 2026, entenda o cálculo do reajuste e o impacto na economia brasileira.',
        5,
        '{"seo_title": "Salário mínimo 2026 no Brasil: valor, reajuste e impactos | Kitnets.com", "seo_description": "Confira o novo valor do salário mínimo de 2026, entenda o cálculo do reajuste e o impacto na economia brasileira."}'::jsonb,
        E'<p>
                    O salário mínimo de 2026 no Brasil passou a vigorar em 1º de janeiro, com o novo valor fixado em R$ 1.621. O reajuste representa um aumento de 6,79%, equivalente a R$ 103 em relação ao salário mínimo anterior, que era de R$ 1.518.
                </p>

                <div className="bg-card border border-border p-6 rounded-xl my-8 shadow-sm">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-1 space-y-2 text-center md:text-left">
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Novo Valor (2026)</span>
                            <div className="text-4xl font-extrabold text-primary">R$ 1.621,00</div>
                            <div className="text-sm text-green-600 font-medium flex items-center justify-center md:justify-start gap-1">
                                <TrendingUp className="h-4 w-4" />
                                +6,79% de aumento
                            </div>
                        </div>
                        <div className="w-px h-16 bg-border hidden md:block"></div>
                        <div className="flex-1 space-y-2 text-center md:text-left">
                            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Aumento Real</span>
                            <div className="text-xl font-bold text-foreground">R$ 103,00</div>
                            <div className="text-sm text-muted-foreground">Sobre os R$ 1.518 de 2025</div>
                        </div>
                    </div>
                </div>

                <h2 className="text-3xl font-bold mt-12 mb-6 flex items-center gap-3">
                    <DollarSign className="h-7 w-7 text-primary" />
                    Como foi calculado o salário mínimo de 2026
                </h2>
                <p>
                    A política de reajuste do salário mínimo combina correção inflacionária com ganho real, seguindo regras definidas em lei e condicionadas ao arcabouço fiscal.
                </p>

                <div className="space-y-6 my-8">
                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">1</div>
                        <div>
                            <h3 className="text-xl font-bold mb-2">Correção pela inflação (INPC)</h3>
                            <p className="text-muted-foreground">
                                O Índice Nacional de Preços ao Consumidor (INPC), apurado pelo IBGE, acumulou 4,18% em 12 meses até novembro de 2025. Esse percentual recompõe o poder de compra do trabalhador frente à inflação.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">2</div>
                        <div>
                            <h3 className="text-xl font-bold mb-2">Crescimento econômico (PIB)</h3>
                            <p className="text-muted-foreground">
                                Além da inflação, a regra prevê a incorporação do crescimento do PIB de dois anos antes. Em dezembro, o IBGE revisou os dados do PIB de 2024, confirmando uma expansão de 3,4% da economia brasileira.
                            </p>
                        </div>
                    </div>
                </div>

                <h2 className="text-3xl font-bold mt-16 mb-6 flex items-center gap-3">
                    <Globe className="h-7 w-7 text-primary" />
                    Impacto do novo salário mínimo na economia
                </h2>
                <p>
                    De acordo com estimativas do Dieese, o novo salário mínimo deve injetar cerca de <strong>R$ 81,7 bilhões</strong> na economia brasileira.
                </p>
                <ul className="grid md:grid-cols-3 gap-4 list-none pl-0 my-6">
                    <li className="bg-card border border-border p-4 rounded-lg text-sm">
                        <ArrowUpRight className="h-5 w-5 text-green-500 mb-2" />
                        <strong>Aumento da renda disponível</strong> de trabalhadores e aposentados
                    </li>
                    <li className="bg-card border border-border p-4 rounded-lg text-sm">
                        <Wallet className="h-5 w-5 text-blue-500 mb-2" />
                        <strong>Estímulo ao consumo</strong>, especialmente nos setores de varejo e serviços
                    </li>
                    <li className="bg-card border border-border p-4 rounded-lg text-sm">
                        <FileText className="h-5 w-5 text-orange-500 mb-2" />
                        <strong>Impacto positivo indireto</strong> na arrecadação de tributos
                    </li>
                </ul>

                <div className="border-t-2 border-primary/20 pt-10 mt-16">
                    <h2 className="text-3xl font-bold mb-6">Conclusão</h2>
                    <p>
                        O salário mínimo de R$ 1.621 em 2026 representa um reajuste relevante, que recompõe a inflação e garante ganho real dentro dos limites do arcabouço fiscal. Além de afetar diretamente a renda de milhões de brasileiros, o novo valor tem impacto macroeconômico expressivo, reforçando o consumo e a atividade econômica.
                    </p>
                </div>
'
      );
  END IF;

END $$;
