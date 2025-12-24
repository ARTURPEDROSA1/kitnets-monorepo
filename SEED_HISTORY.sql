-- Seeding Historical Data (2023 - 2025)
-- Based on real historical data + simulated future (2025) as per current date context.

DO $$
DECLARE
    v_ipca_id UUID;
    v_igpm_id UUID;
    v_inpc_id UUID;
    v_ivar_id UUID;
    v_fipezap_id UUID;
    v_selic_id UUID;
    v_cdi_id UUID;
BEGIN
    SELECT id INTO v_ipca_id FROM public.economic_indexes WHERE code = 'IPCA';
    SELECT id INTO v_igpm_id FROM public.economic_indexes WHERE code = 'IGPM';
    SELECT id INTO v_inpc_id FROM public.economic_indexes WHERE code = 'INPC';
    SELECT id INTO v_ivar_id FROM public.economic_indexes WHERE code = 'IVAR';
    SELECT id INTO v_fipezap_id FROM public.economic_indexes WHERE code = 'FIPEZAP';
    SELECT id INTO v_selic_id FROM public.economic_indexes WHERE code = 'SELIC';
    SELECT id INTO v_cdi_id FROM public.economic_indexes WHERE code = 'CDI';

    -- IPCA (IBGE)
    INSERT INTO public.economic_index_values (index_id, year, month, reference_date, value_percent, source_url) VALUES
    -- 2025
    (v_ipca_id, 2025, 11, '2025-11-01', 0.18, 'investidor10.com.br'),
    (v_ipca_id, 2025, 10, '2025-10-01', 0.09, 'investidor10.com.br'),
    (v_ipca_id, 2025, 9,  '2025-09-01', 0.48, 'investidor10.com.br'),
    (v_ipca_id, 2025, 8,  '2025-08-01', -0.11, 'investidor10.com.br'),
    (v_ipca_id, 2025, 7,  '2025-07-01', 0.26, 'investidor10.com.br'),
    (v_ipca_id, 2025, 6,  '2025-06-01', 0.24, 'investidor10.com.br'),
    (v_ipca_id, 2025, 5,  '2025-05-01', 0.26, 'investidor10.com.br'),
    (v_ipca_id, 2025, 4,  '2025-04-01', 0.43, 'investidor10.com.br'),
    (v_ipca_id, 2025, 3,  '2025-03-01', 0.56, 'investidor10.com.br'),
    (v_ipca_id, 2025, 2,  '2025-02-01', 1.31, 'investidor10.com.br'),
    (v_ipca_id, 2025, 1,  '2025-01-01', 0.16, 'investidor10.com.br'),
    -- 2024
    (v_ipca_id, 2024, 12, '2024-12-01', 0.52, 'investidor10.com.br'),
    (v_ipca_id, 2024, 11, '2024-11-01', 0.39, 'investidor10.com.br'),
    (v_ipca_id, 2024, 10, '2024-10-01', 0.56, 'investidor10.com.br'),
    (v_ipca_id, 2024, 9,  '2024-09-01', 0.44, 'investidor10.com.br'),
    (v_ipca_id, 2024, 8,  '2024-08-01', -0.02, 'investidor10.com.br'),
    (v_ipca_id, 2024, 7,  '2024-07-01', 0.38, 'investidor10.com.br'),
    (v_ipca_id, 2024, 6,  '2024-06-01', 0.21, 'investidor10.com.br'),
    (v_ipca_id, 2024, 5,  '2024-05-01', 0.46, 'investidor10.com.br'),
    (v_ipca_id, 2024, 4,  '2024-04-01', 0.38, 'investidor10.com.br'),
    (v_ipca_id, 2024, 3,  '2024-03-01', 0.16, 'investidor10.com.br'),
    (v_ipca_id, 2024, 2,  '2024-02-01', 0.83, 'investidor10.com.br'),
    (v_ipca_id, 2024, 1,  '2024-01-01', 0.42, 'investidor10.com.br'),
    -- 2023
    (v_ipca_id, 2023, 12, '2023-12-01', 0.56, 'investidor10.com.br'),
    (v_ipca_id, 2023, 11, '2023-11-01', 0.28, 'investidor10.com.br'),
    (v_ipca_id, 2023, 10, '2023-10-01', 0.24, 'investidor10.com.br'),
    (v_ipca_id, 2023, 9,  '2023-09-01', 0.26, 'investidor10.com.br'),
    (v_ipca_id, 2023, 8,  '2023-08-01', 0.23, 'investidor10.com.br'),
    (v_ipca_id, 2023, 7,  '2023-07-01', 0.12, 'investidor10.com.br'),
    (v_ipca_id, 2023, 6,  '2023-06-01', -0.08, 'investidor10.com.br'),
    (v_ipca_id, 2023, 5,  '2023-05-01', 0.23, 'investidor10.com.br'),
    (v_ipca_id, 2023, 4,  '2023-04-01', 0.61, 'investidor10.com.br'),
    (v_ipca_id, 2023, 3,  '2023-03-01', 0.71, 'investidor10.com.br'),
    (v_ipca_id, 2023, 2,  '2023-02-01', 0.84, 'investidor10.com.br'),
    (v_ipca_id, 2023, 1,  '2023-01-01', 0.53, 'investidor10.com.br')
    ON CONFLICT (index_id, year, month) DO UPDATE SET value_percent = EXCLUDED.value_percent;

    -- IGPM (FGV)
    INSERT INTO public.economic_index_values (index_id, year, month, reference_date, value_percent, source_url) VALUES
    -- 2025
    (v_igpm_id, 2025, 11, '2025-11-01', 0.27, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 10, '2025-10-01', -0.36, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 9,  '2025-09-01', 0.42, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 8,  '2025-08-01', 0.36, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 7,  '2025-07-01', -0.77, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 6,  '2025-06-01', -1.67, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 5,  '2025-05-01', -0.49, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 4,  '2025-04-01', 0.24, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 3,  '2025-03-01', -0.34, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 2,  '2025-02-01', 1.06, 'dadosdemercado.com.br'),
    (v_igpm_id, 2025, 1,  '2025-01-01', 0.27, 'dadosdemercado.com.br'),
    -- 2024
    (v_igpm_id, 2024, 12, '2024-12-01', 0.94, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 11, '2024-11-01', 1.30, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 10, '2024-10-01', 1.52, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 9,  '2024-09-01', 0.62, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 8,  '2024-08-01', 0.29, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 7,  '2024-07-01', 0.61, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 6,  '2024-06-01', 0.81, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 5,  '2024-05-01', 0.89, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 4,  '2024-04-01', 0.31, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 3,  '2024-03-01', -0.47, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 2,  '2024-02-01', -0.52, 'dadosdemercado.com.br'),
    (v_igpm_id, 2024, 1,  '2024-01-01', 0.07, 'dadosdemercado.com.br'),
    -- 2023
    (v_igpm_id, 2023, 12, '2023-12-01', 0.74, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 11, '2023-11-01', 0.59, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 10, '2023-10-01', 0.50, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 9,  '2023-09-01', 0.37, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 8,  '2023-08-01', -0.14, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 7,  '2023-07-01', -0.72, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 6,  '2023-06-01', -1.93, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 5,  '2023-05-01', -1.84, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 4,  '2023-04-01', -0.95, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 3,  '2023-03-01', 0.05, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 2,  '2023-02-01', -0.06, 'dadosdemercado.com.br'),
    (v_igpm_id, 2023, 1,  '2023-01-01', 0.21, 'dadosdemercado.com.br')
    ON CONFLICT (index_id, year, month) DO UPDATE SET value_percent = EXCLUDED.value_percent;

     -- INPC (IBGE)
    INSERT INTO public.economic_index_values (index_id, year, month, reference_date, value_percent, source_url) VALUES
    -- 2025
    (v_inpc_id, 2025, 11, '2025-11-01', 0.03, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 10, '2025-10-01', 0.03, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 9,  '2025-09-01', 0.52, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 8,  '2025-08-01', -0.21, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 7,  '2025-07-01', 0.21, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 6,  '2025-06-01', 0.23, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 5,  '2025-05-01', 0.35, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 4,  '2025-04-01', 0.48, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 3,  '2025-03-01', 0.51, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 2,  '2025-02-01', 1.48, 'dadosdemercado.com.br'),
    (v_inpc_id, 2025, 1,  '2025-01-01', 0.00, 'dadosdemercado.com.br'),
    -- 2024
    (v_inpc_id, 2024, 12, '2024-12-01', 0.48, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 11, '2024-11-01', 0.33, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 10, '2024-10-01', 0.61, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 9,  '2024-09-01', 0.48, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 8,  '2024-08-01', -0.14, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 7,  '2024-07-01', 0.26, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 6,  '2024-06-01', 0.25, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 5,  '2024-05-01', 0.46, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 4,  '2024-04-01', 0.37, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 3,  '2024-03-01', 0.19, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 2,  '2024-02-01', 0.81, 'dadosdemercado.com.br'),
    (v_inpc_id, 2024, 1,  '2024-01-01', 0.57, 'dadosdemercado.com.br'),
    -- 2023
    (v_inpc_id, 2023, 12, '2023-12-01', 0.55, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 11, '2023-11-01', 0.10, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 10, '2023-10-01', 0.12, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 9,  '2023-09-01', 0.11, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 8,  '2023-08-01', 0.20, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 7,  '2023-07-01', -0.09, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 6,  '2023-06-01', -0.10, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 5,  '2023-05-01', 0.36, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 4,  '2023-04-01', 0.53, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 3,  '2023-03-01', 0.64, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 2,  '2023-02-01', 0.77, 'dadosdemercado.com.br'),
    (v_inpc_id, 2023, 1,  '2023-01-01', 0.46, 'dadosdemercado.com.br')
    ON CONFLICT (index_id, year, month) DO UPDATE SET value_percent = EXCLUDED.value_percent;

    -- SELIC (Over)
    INSERT INTO public.economic_index_values (index_id, year, month, reference_date, value_percent, source_url) VALUES
    -- 2025
    (v_selic_id, 2025, 11, '2025-11-01', 1.05, 'debit.com.br'),
    (v_selic_id, 2025, 10, '2025-10-01', 1.28, 'debit.com.br'),
    (v_selic_id, 2025, 9,  '2025-09-01', 1.22, 'debit.com.br'),
    (v_selic_id, 2025, 8,  '2025-08-01', 1.16, 'debit.com.br'),
    (v_selic_id, 2025, 7,  '2025-07-01', 1.28, 'debit.com.br'),
    (v_selic_id, 2025, 6,  '2025-06-01', 1.10, 'debit.com.br'),
    (v_selic_id, 2025, 5,  '2025-05-01', 1.14, 'debit.com.br'),
    (v_selic_id, 2025, 4,  '2025-04-01', 1.06, 'debit.com.br'),
    (v_selic_id, 2025, 3,  '2025-03-01', 0.96, 'debit.com.br'),
    (v_selic_id, 2025, 2,  '2025-02-01', 0.99, 'debit.com.br'),
    (v_selic_id, 2025, 1,  '2025-01-01', 1.01, 'debit.com.br'),
    -- 2024
    (v_selic_id, 2024, 12, '2024-12-01', 0.9314, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 11, '2024-11-01', 0.7930, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 10, '2024-10-01', 0.9280, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 9,  '2024-09-01', 0.8352, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 8,  '2024-08-01', 0.8675, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 7,  '2024-07-01', 0.91, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 6,  '2024-06-01', 0.79, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 5,  '2024-05-01', 0.83, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 4,  '2024-04-01', 0.89, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 3,  '2024-03-01', 0.83, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 2,  '2024-02-01', 0.80, 'brasilindicadores.com.br'),
    (v_selic_id, 2024, 1,  '2024-01-01', 0.97, 'brasilindicadores.com.br'),
    -- 2023
    (v_selic_id, 2023, 12, '2023-12-01', 0.89, 'xpi.com.br'),
    (v_selic_id, 2023, 11, '2023-11-01', 0.92, 'xpi.com.br'),
    (v_selic_id, 2023, 10, '2023-10-01', 1.00, 'xpi.com.br'),
    (v_selic_id, 2023, 9,  '2023-09-01', 1.07, 'xpi.com.br'),
    (v_selic_id, 2023, 8,  '2023-08-01', 1.14, 'xpi.com.br'),
    (v_selic_id, 2023, 7,  '2023-07-01', 1.07, 'xpi.com.br'),
    (v_selic_id, 2023, 6,  '2023-06-01', 1.07, 'xpi.com.br'),
    (v_selic_id, 2023, 5,  '2023-05-01', 1.12, 'xpi.com.br'),
    (v_selic_id, 2023, 4,  '2023-04-01', 0.92, 'xpi.com.br'),
    (v_selic_id, 2023, 3,  '2023-03-01', 1.17, 'xpi.com.br'),
    (v_selic_id, 2023, 2,  '2023-02-01', 0.92, 'xpi.com.br'),
    (v_selic_id, 2023, 1,  '2023-01-01', 1.07, 'xpi.com.br')
    ON CONFLICT (index_id, year, month) DO UPDATE SET value_percent = EXCLUDED.value_percent;

    -- IVAR (FGV)
    INSERT INTO public.economic_index_values (index_id, year, month, reference_date, value_percent, source_url) VALUES
    -- 2025
    (v_ivar_id, 2025, 11, '2025-11-01', 0.37, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 10, '2025-10-01', 0.57, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 9,  '2025-09-01', 0.30, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 8,  '2025-08-01', 0.28, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 7,  '2025-07-01', 0.06, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 6,  '2025-06-01', 1.02, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 5,  '2025-05-01', -0.56, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 4,  '2025-04-01', 0.79, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 3,  '2025-03-01', -0.31, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 2,  '2025-02-01', 1.81, 'brasilindicadores.com.br'),
    (v_ivar_id, 2025, 1,  '2025-01-01', 3.73, 'brasilindicadores.com.br'),
    -- 2024
    (v_ivar_id, 2024, 12, '2024-12-01', -1.28, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 11, '2024-11-01', -0.88, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 10, '2024-10-01', -0.89, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 9,  '2024-09-01', 0.33, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 8,  '2024-08-01', 1.93, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 7,  '2024-07-01', -0.18, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 6,  '2024-06-01', 0.61, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 5,  '2024-05-01', 0.21, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 4,  '2024-04-01', 1.40, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 3,  '2024-03-01', 1.06, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 2,  '2024-02-01', 1.79, 'brasilindicadores.com.br'),
    (v_ivar_id, 2024, 1,  '2024-01-01', 4.34, 'brasilindicadores.com.br'),
    -- 2023
    (v_ivar_id, 2023, 12, '2023-12-01', -1.16, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 11, '2023-11-01', -0.37, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 10, '2023-10-01', 1.80, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 9,  '2023-09-01', -1.74, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 8,  '2023-08-01', 1.86, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 7,  '2023-07-01', 0.51, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 6,  '2023-06-01', -0.48, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 5,  '2023-05-01', -0.06, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 4,  '2023-04-01', 0.76, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 3,  '2023-03-01', 0.97, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 2,  '2023-02-01', 1.06, 'brasilindicadores.com.br'),
    (v_ivar_id, 2023, 1,  '2023-01-01', 4.20, 'brasilindicadores.com.br')
    ON CONFLICT (index_id, year, month) DO UPDATE SET value_percent = EXCLUDED.value_percent;


    -- FipeZAP (Estimated/Partial)
    INSERT INTO public.economic_index_values (index_id, year, month, reference_date, value_percent, source_url) VALUES
    -- 2025 (Partial)
    (v_fipezap_id, 2025, 8, '2025-08-01', 0.66, 'fipe.org.br'),
    (v_fipezap_id, 2025, 7, '2025-07-01', 0.45, 'fipe.org.br'),
    (v_fipezap_id, 2025, 6, '2025-06-01', 0.51, 'fipe.org.br'),
    (v_fipezap_id, 2025, 5, '2025-05-01', 0.59, 'fipe.org.br'),
    (v_fipezap_id, 2025, 4, '2025-04-01', 1.25, 'abril.com.br'),
    (v_fipezap_id, 2025, 3, '2025-03-01', 1.15, 'abril.com.br'),
    (v_fipezap_id, 2025, 2, '2025-02-01', 1.07, 'abril.com.br'),
    (v_fipezap_id, 2025, 1, '2025-01-01', 0.96, 'abril.com.br'),
    -- 2024 (Selected)
    (v_fipezap_id, 2024, 12, '2024-12-01', 0.93, 'fipe.org.br'),
    (v_fipezap_id, 2024, 11, '2024-11-01', 0.93, 'fipe.org.br'),
    (v_fipezap_id, 2024, 3,  '2024-03-01', 1.16, 'datazap.com.br'),
    (v_fipezap_id, 2024, 2,  '2024-02-01', 1.28, 'datazap.com.br'),
    (v_fipezap_id, 2024, 1,  '2024-01-01', 1.26, 'datazap.com.br'),
    -- 2023 (Selected)
    (v_fipezap_id, 2023, 12, '2023-12-01', 1.00, 'fipe.org.br'),
    (v_fipezap_id, 2023, 9,  '2023-09-01', 0.96, 'fipe.org.br')
    ON CONFLICT (index_id, year, month) DO UPDATE SET value_percent = EXCLUDED.value_percent;

    -- CDI (Using Selic as close proxy where identical or specific data)
    -- As per sources, CDI is very close to Selic Over.
    -- We can populate CDI with SELIC values as a robust fallback if CDI specific is missing, 
    -- but we DO have CDI specific for 2023-2025 from sources in the text (often matches or differs slightly).
    -- I will clone the SELIC block for CDI but adjust values where I have specific CDI info.
    -- Actually, the search result for CDI text explicitly listed "CDI Mensal" column.
    -- Let's use those explicit values.
    
    INSERT INTO public.economic_index_values (index_id, year, month, reference_date, value_percent, source_url) VALUES
    -- 2025
    (v_cdi_id, 2025, 11, '2025-11-01', 1.05, 'debit.com.br'),
    (v_cdi_id, 2025, 10, '2025-10-01', 1.28, 'debit.com.br'),
    (v_cdi_id, 2025, 9,  '2025-09-01', 1.22, 'debit.com.br'),
    (v_cdi_id, 2025, 8,  '2025-08-01', 1.16, 'debit.com.br'),
    (v_cdi_id, 2025, 7,  '2025-07-01', 1.28, 'debit.com.br'),
    (v_cdi_id, 2025, 6,  '2025-06-01', 1.10, 'debit.com.br'),
    (v_cdi_id, 2025, 5,  '2025-05-01', 1.14, 'debit.com.br'),
    (v_cdi_id, 2025, 4,  '2025-04-01', 1.06, 'debit.com.br'),
    (v_cdi_id, 2025, 3,  '2025-03-01', 0.96, 'debit.com.br'),
    (v_cdi_id, 2025, 2,  '2025-02-01', 0.99, 'debit.com.br'),
    (v_cdi_id, 2025, 1,  '2025-01-01', 1.01, 'debit.com.br'),
    -- 2024
    (v_cdi_id, 2024, 12, '2024-12-01', 0.88, 'debit.com.br'),
    (v_cdi_id, 2024, 11, '2024-11-01', 0.79, 'debit.com.br'),
    (v_cdi_id, 2024, 10, '2024-10-01', 0.88, 'debit.com.br'),
    (v_cdi_id, 2024, 9,  '2024-09-01', 0.79, 'debit.com.br'),
    (v_cdi_id, 2024, 8,  '2024-08-01', 0.82, 'debit.com.br'),
    (v_cdi_id, 2024, 7,  '2024-07-01', 0.91, 'debit.com.br'),
    (v_cdi_id, 2024, 6,  '2024-06-01', 0.79, 'debit.com.br'),
    (v_cdi_id, 2024, 5,  '2024-05-01', 0.83, 'debit.com.br'),
    (v_cdi_id, 2024, 4,  '2024-04-01', 0.89, 'debit.com.br'),
    (v_cdi_id, 2024, 3,  '2024-03-01', 0.83, 'debit.com.br'),
    (v_cdi_id, 2024, 2,  '2024-02-01', 0.80, 'debit.com.br'),
    (v_cdi_id, 2024, 1,  '2024-01-01', 0.97, 'debit.com.br'),
    -- 2023
    (v_cdi_id, 2023, 12, '2023-12-01', 0.90, 'debit.com.br'),
    (v_cdi_id, 2023, 11, '2023-11-01', 0.92, 'debit.com.br'),
    (v_cdi_id, 2023, 10, '2023-10-01', 0.95, 'debit.com.br'),
    (v_cdi_id, 2023, 9,  '2023-09-01', 1.07, 'debit.com.br'),
    (v_cdi_id, 2023, 8,  '2023-08-01', 1.14, 'debit.com.br'),
    (v_cdi_id, 2023, 7,  '2023-07-01', 1.07, 'debit.com.br'),
    (v_cdi_id, 2023, 6,  '2023-06-01', 1.07, 'debit.com.br'),
    (v_cdi_id, 2023, 5,  '2023-05-01', 1.12, 'debit.com.br'),
    (v_cdi_id, 2023, 4,  '2023-04-01', 0.92, 'debit.com.br'),
    (v_cdi_id, 2023, 3,  '2023-03-01', 1.17, 'debit.com.br'),
    (v_cdi_id, 2023, 2,  '2023-02-01', 0.92, 'debit.com.br'),
    (v_cdi_id, 2023, 1,  '2023-01-01', 1.07, 'debit.com.br')
    ON CONFLICT (index_id, year, month) DO UPDATE SET value_percent = EXCLUDED.value_percent;
    
END $$;
