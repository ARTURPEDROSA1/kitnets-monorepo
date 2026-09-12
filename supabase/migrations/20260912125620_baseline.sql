

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS "public";

ALTER SCHEMA "public" OWNER TO "pg_database_owner";

COMMENT ON SCHEMA "public" IS 'standard public schema';


CREATE TYPE "public"."article_status" AS ENUM (
    'draft',
    'published',
    'archived'
);

ALTER TYPE "public"."article_status" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_latest_billing_rate"("p_property_id" "uuid") RETURNS TABLE("reference_month" "text", "effective_rate_per_m3" numeric, "total_amount" numeric, "consumption_m3" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT
        reference_month,
        effective_rate_per_m3,
        total_amount,
        consumption_m3
    FROM water_bills
    WHERE property_id = p_property_id
      AND effective_rate_per_m3 IS NOT NULL
    ORDER BY reference_month DESC
    LIMIT 1;
$$;

ALTER FUNCTION "public"."get_latest_billing_rate"("p_property_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_property_bills"("p_property_id" "uuid") RETURNS TABLE("id" "uuid", "reference_month" "text", "meter_number" "text", "previous_reading" numeric, "current_reading" numeric, "consumption_m3" numeric, "billed_consumption_m3" numeric, "reading_date" "date", "reading_date_orig" "date", "due_date" "date", "water_tariff" numeric, "sewage_tariff" numeric, "water_basic_fee" numeric, "sewage_basic_fee" numeric, "total_amount" numeric, "effective_rate_per_m3" numeric, "occurrence_code" "text")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT
        id, reference_month, meter_number,
        previous_reading, current_reading,
        consumption_m3, billed_consumption_m3,
        reading_date, reading_date_orig, due_date,
        water_tariff, sewage_tariff, water_basic_fee, sewage_basic_fee,
        total_amount, effective_rate_per_m3, occurrence_code
    FROM water_bills
    WHERE property_id = p_property_id
    ORDER BY reference_month DESC;
$$;

ALTER FUNCTION "public"."get_property_bills"("p_property_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_property_details"("p_property_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "address" "text", "city" "text", "state" "text", "zip" "text", "connection_code" "text")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT id, name, address, city, state, zip, connection_code
    FROM properties
    WHERE id = p_property_id
    LIMIT 1;
$$;

ALTER FUNCTION "public"."get_property_details"("p_property_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."energy_bills" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "property_id" "uuid",
    "utility_company" "text" DEFAULT 'CEMIG'::"text",
    "consumer_unit" "text" NOT NULL,
    "installation_class" "text",
    "tariff_modality" "text",
    "reference_month" "text" NOT NULL,
    "reference_month_label" "text",
    "reading_date_current" "date",
    "reading_date_previous" "date",
    "reading_date_next" "date",
    "billing_days" integer DEFAULT 30,
    "due_date" "date",
    "meter_number" "text",
    "grid_reading_previous" numeric,
    "grid_reading_current" numeric,
    "grid_consumption_kwh" numeric NOT NULL,
    "daily_avg_kwh" numeric,
    "monthly_avg_kwh" numeric,
    "injected_reading_previous" numeric,
    "injected_reading_current" numeric,
    "solar_injected_kwh" numeric DEFAULT 0,
    "solar_compensated_kwh" numeric DEFAULT 0,
    "generation_balance_kwh" numeric DEFAULT 0,
    "unit_price" numeric,
    "availability_cost_kwh" numeric DEFAULT 100,
    "availability_cost_amount" numeric DEFAULT 0,
    "energy_scee_exempt_amount" numeric DEFAULT 0,
    "energy_compensated_amount" numeric DEFAULT 0,
    "availability_adjustment_amount" numeric DEFAULT 0,
    "bonus_discounts_amount" numeric DEFAULT 0,
    "flag_type" "text" DEFAULT 'Verde'::"text",
    "flag_amount" numeric DEFAULT 0,
    "taxes_icms" numeric DEFAULT 0,
    "taxes_pis_cofins" numeric DEFAULT 0,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "estimated_savings_amount" numeric GENERATED ALWAYS AS ("round"((COALESCE("solar_injected_kwh", (0)::numeric) * COALESCE("unit_price", (0)::numeric)), 2)) STORED,
    "solar_coverage_ratio" numeric GENERATED ALWAYS AS (
CASE
    WHEN ("grid_consumption_kwh" > (0)::numeric) THEN "round"(((COALESCE("solar_injected_kwh", (0)::numeric) / "grid_consumption_kwh") * (100)::numeric), 1)
    ELSE NULL::numeric
END) STORED,
    "is_historical_only" boolean DEFAULT false,
    "historical_consumption_raw" "jsonb" DEFAULT '[]'::"jsonb",
    "items_breakdown" "jsonb" DEFAULT '[]'::"jsonb",
    "extraction_confidence" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."energy_bills" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_property_energy_bills"("p_property_id" "uuid") RETURNS SETOF "public"."energy_bills"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT * FROM public.energy_bills
    WHERE property_id = p_property_id
    ORDER BY reference_month DESC;
$$;

ALTER FUNCTION "public"."get_property_energy_bills"("p_property_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_property_income_months_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_property_income_months_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_agents_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_agents_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_leases_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_leases_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_tenants_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_tenants_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."upsert_water_bill"("p_property_id" "uuid", "p_reference_month" "text", "p_meter_number" "text", "p_previous_reading" numeric, "p_current_reading" numeric, "p_consumption_m3" numeric, "p_billed_consumption_m3" numeric, "p_reading_date" "date", "p_reading_date_orig" "date", "p_due_date" "date", "p_total_amount" numeric, "p_water_tariff" numeric DEFAULT 0, "p_sewage_tariff" numeric DEFAULT 0, "p_water_basic_fee" numeric DEFAULT 0, "p_sewage_basic_fee" numeric DEFAULT 0, "p_occurrence_code" "text" DEFAULT NULL::"text", "p_average_consumption_m3" numeric DEFAULT NULL::numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_bill_id UUID;
BEGIN
    INSERT INTO public.water_bills (
        property_id, reference_month, meter_number,
        previous_reading, current_reading,
        consumption_m3, billed_consumption_m3,
        reading_date, reading_date_orig, due_date,
        water_tariff, sewage_tariff, water_basic_fee, sewage_basic_fee,
        total_amount, occurrence_code, average_consumption_m3, notes,
        updated_at
    ) VALUES (
        p_property_id, p_reference_month, p_meter_number,
        p_previous_reading, p_current_reading,
        p_consumption_m3, p_billed_consumption_m3,
        p_reading_date, p_reading_date_orig, p_due_date,
        p_water_tariff, p_sewage_tariff, p_water_basic_fee, p_sewage_basic_fee,
        p_total_amount, p_occurrence_code, p_average_consumption_m3, p_notes,
        NOW()
    )
    ON CONFLICT (property_id, reference_month)
    DO UPDATE SET
        meter_number = EXCLUDED.meter_number,
        previous_reading = EXCLUDED.previous_reading,
        current_reading = EXCLUDED.current_reading,
        consumption_m3 = EXCLUDED.consumption_m3,
        billed_consumption_m3 = EXCLUDED.billed_consumption_m3,
        reading_date = EXCLUDED.reading_date,
        reading_date_orig = EXCLUDED.reading_date_orig,
        due_date = EXCLUDED.due_date,
        water_tariff = EXCLUDED.water_tariff,
        sewage_tariff = EXCLUDED.sewage_tariff,
        water_basic_fee = EXCLUDED.water_basic_fee,
        sewage_basic_fee = EXCLUDED.sewage_basic_fee,
        total_amount = EXCLUDED.total_amount,
        occurrence_code = EXCLUDED.occurrence_code,
        average_consumption_m3 = EXCLUDED.average_consumption_m3,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    RETURNING id INTO v_bill_id;
    
    RETURN v_bill_id;
END;
$$;

ALTER FUNCTION "public"."upsert_water_bill"("p_property_id" "uuid", "p_reference_month" "text", "p_meter_number" "text", "p_previous_reading" numeric, "p_current_reading" numeric, "p_consumption_m3" numeric, "p_billed_consumption_m3" numeric, "p_reading_date" "date", "p_reading_date_orig" "date", "p_due_date" "date", "p_total_amount" numeric, "p_water_tariff" numeric, "p_sewage_tariff" numeric, "p_water_basic_fee" numeric, "p_sewage_basic_fee" numeric, "p_occurrence_code" "text", "p_average_consumption_m3" numeric, "p_notes" "text") OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."agencies" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "trade_name" "text",
    "cnpj" "text",
    "creci_number" "text",
    "creci_state" "text",
    "creci_type" "text",
    "owner_name" "text",
    "main_phone" "text" NOT NULL,
    "additional_phone" "text",
    "main_phone_whatsapp" boolean DEFAULT false,
    "email" "text",
    "website" "text",
    "postal_code" "text" NOT NULL,
    "street" "text" NOT NULL,
    "street_number" "text" NOT NULL,
    "address_complement" "text",
    "neighborhood" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "country" "text" DEFAULT 'BR'::"text" NOT NULL,
    "logo_url" "text",
    "description" "text",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "additional_phone_whatsapp" boolean DEFAULT false,
    CONSTRAINT "agencies_creci_type_check" CHECK (("creci_type" = ANY (ARRAY['PJ'::"text", 'PF'::"text"]))),
    CONSTRAINT "agencies_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ACTIVE'::"text", 'VERIFIED'::"text", 'SUSPENDED'::"text"])))
);

ALTER TABLE "public"."agencies" OWNER TO "postgres";

COMMENT ON TABLE "public"."agencies" IS 'Real estate agencies (imobiliárias) registered on Kitnets.com.';

COMMENT ON COLUMN "public"."agencies"."cnpj" IS 'CNPJ stored as 14 digits only (no punctuation). Validated with check-digit algorithm.';

COMMENT ON COLUMN "public"."agencies"."owner_name" IS 'Legal representative name — NOT the Kitnets.com account owner. These are separate concepts.';

COMMENT ON COLUMN "public"."agencies"."main_phone" IS 'Phone stored in E.164 international format (+5541999999999).';

COMMENT ON COLUMN "public"."agencies"."deleted_at" IS 'Soft-delete timestamp. NULL = active. When set, the agency is considered deleted.';

COMMENT ON COLUMN "public"."agencies"."deleted_by" IS 'FK to profiles.id — the user who deleted this agency.';

CREATE TABLE IF NOT EXISTS "public"."agency_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'AGENT'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agency_members_role_check" CHECK (("role" = ANY (ARRAY['OWNER'::"text", 'ADMIN'::"text", 'MANAGER'::"text", 'AGENT'::"text", 'VIEWER'::"text"])))
);

ALTER TABLE "public"."agency_members" OWNER TO "postgres";

COMMENT ON TABLE "public"."agency_members" IS 'Many-to-many membership between users (profiles) and agencies with role-based access.';

COMMENT ON COLUMN "public"."agency_members"."role" IS 'OWNER = registered the agency. ADMIN = full management. MANAGER = limited management. AGENT = broker. VIEWER = read-only.';

CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "cpf" "text",
    "photo_url" "text",
    "creci_number" "text" NOT NULL,
    "creci_state" "text" NOT NULL,
    "agent_type" "text" DEFAULT 'AUTONOMO'::"text" NOT NULL,
    "agency_id" "uuid",
    "main_phone" "text" NOT NULL,
    "additional_phone" "text",
    "email" "text",
    "website" "text",
    "notes" "text",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "main_phone_whatsapp" boolean DEFAULT false NOT NULL,
    "additional_phone_whatsapp" boolean DEFAULT false NOT NULL,
    CONSTRAINT "agents_agent_type_check" CHECK (("agent_type" = ANY (ARRAY['AUTONOMO'::"text", 'IMOBILIARIA'::"text"]))),
    CONSTRAINT "agents_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'INACTIVE'::"text"])))
);

ALTER TABLE "public"."agents" OWNER TO "postgres";

COMMENT ON TABLE "public"."agents" IS 'Real estate agents (corretores) managed by users';

COMMENT ON COLUMN "public"."agents"."cpf" IS 'Brazilian CPF, digits only (11 chars)';

COMMENT ON COLUMN "public"."agents"."creci_number" IS 'CRECI registration number';

COMMENT ON COLUMN "public"."agents"."creci_state" IS 'State (UF) of CRECI registration';

COMMENT ON COLUMN "public"."agents"."agent_type" IS 'AUTONOMO = independent, IMOBILIARIA = works at an agency';

COMMENT ON COLUMN "public"."agents"."agency_id" IS 'FK to agencies. SET NULL on agency deletion (agent becomes autonomous)';

CREATE TABLE IF NOT EXISTS "public"."article_categories" (
    "article_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL
);

ALTER TABLE "public"."article_categories" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."article_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "lang" "text" NOT NULL,
    "title" "text" NOT NULL,
    "excerpt" "text",
    "content_mdx" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "reason" "text"
);

ALTER TABLE "public"."article_revisions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."article_tags" (
    "article_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);

ALTER TABLE "public"."article_tags" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."article_translations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "lang" "text" NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "excerpt" "text",
    "content_mdx" "text" NOT NULL,
    "content_compiled" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reading_time_minutes" integer,
    "word_count" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."article_translations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "primary_category_id" "uuid" NOT NULL,
    "status" "public"."article_status" DEFAULT 'draft'::"public"."article_status" NOT NULL,
    "published_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."articles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."authors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "avatar_url" "text",
    "bio" "text",
    "social_links" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."authors" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."calculator_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "suggestion" "text" NOT NULL,
    "email" "text",
    "location" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE "public"."calculator_suggestions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."categories" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "subject" "text",
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE "public"."contact_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."economic_index_revisions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "index_value_id" "uuid" NOT NULL,
    "previous_value" numeric,
    "revised_value" numeric,
    "revision_date" "date" DEFAULT CURRENT_DATE,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."economic_index_revisions" OWNER TO "postgres";

COMMENT ON TABLE "public"."economic_index_revisions" IS 'Audit trail for revised index values.';

CREATE TABLE IF NOT EXISTS "public"."economic_index_values" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "index_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "reference_date" "date" NOT NULL,
    "value_percent" numeric NOT NULL,
    "accumulated_12m" numeric,
    "is_projection" boolean DEFAULT false,
    "source_url" "text",
    "published_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "economic_index_values_month_check" CHECK ((("month" >= 1) AND ("month" <= 12)))
);

ALTER TABLE "public"."economic_index_values" OWNER TO "postgres";

COMMENT ON TABLE "public"."economic_index_values" IS 'Time-series data for index values. Unique per index/year/month.';

CREATE TABLE IF NOT EXISTS "public"."economic_indexes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "source" "text" NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text",
    "category" "text" NOT NULL,
    "is_official" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "economic_indexes_category_check" CHECK (("category" = ANY (ARRAY['inflation'::"text", 'rent'::"text", 'market'::"text"])))
);

ALTER TABLE "public"."economic_indexes" OWNER TO "postgres";

COMMENT ON TABLE "public"."economic_indexes" IS 'Static metadata for economic indexes (IPCA, IGPM, etc.)';

CREATE TABLE IF NOT EXISTS "public"."faq_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "email" "text" NOT NULL,
    "question" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE "public"."faq_questions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."fipezap_series" (
    "id" bigint NOT NULL,
    "reference_date" "date" NOT NULL,
    "index_type" "text" NOT NULL,
    "metric" "text" NOT NULL,
    "dormitorios" "text" NOT NULL,
    "value" numeric(10,4),
    "source" "text" DEFAULT 'FIPEZAP'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "fipezap_series_dormitorios_check" CHECK (("dormitorios" = ANY (ARRAY['total'::"text", '1'::"text", '2'::"text", '3'::"text", '4'::"text"]))),
    CONSTRAINT "fipezap_series_index_type_check" CHECK (("index_type" = ANY (ARRAY['venda'::"text", 'locacao'::"text", 'yield'::"text"]))),
    CONSTRAINT "fipezap_series_metric_check" CHECK (("metric" = ANY (ARRAY['var_mensal'::"text", 'var_12m'::"text", 'preco_m2'::"text", 'yield_mensal'::"text"])))
);

ALTER TABLE "public"."fipezap_series" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."fipezap_series_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."fipezap_series_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."fipezap_series_id_seq" OWNED BY "public"."fipezap_series"."id";

CREATE TABLE IF NOT EXISTS "public"."gateways" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "serial_number" "text" NOT NULL,
    "status" "text" DEFAULT 'unclaimed'::"text",
    "owner_id" "uuid",
    "label" "text",
    "last_seen_at" timestamp with time zone,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "property_id" "uuid",
    "description" "text",
    "photo_url" "text",
    "panel_photo_url" "text",
    CONSTRAINT "gateways_status_check" CHECK (("status" = ANY (ARRAY['online'::"text", 'offline'::"text", 'unclaimed'::"text"])))
);

ALTER TABLE "public"."gateways" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "email" "text" NOT NULL,
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "location" "jsonb" DEFAULT '{}'::"jsonb",
    "page_url" "text",
    "user_agent" "text",
    "consent_newsletter" boolean DEFAULT true,
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "first_seen_at" timestamp with time zone DEFAULT "now"(),
    "lead_type" "text",
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "location_source" "text",
    "trigger_type" "text",
    "interaction_count" integer,
    "engaged_seconds" numeric,
    "export_type" "text"
);

ALTER TABLE "public"."leads" OWNER TO "postgres";

COMMENT ON COLUMN "public"."leads"."last_seen_at" IS 'Timestamp of most recent interaction';

COMMENT ON COLUMN "public"."leads"."first_seen_at" IS 'Timestamp of initial capture';

COMMENT ON COLUMN "public"."leads"."lead_type" IS 'Origin type e.g. index_filter_gate';

CREATE TABLE IF NOT EXISTS "public"."lease_charges" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lease_id" "uuid" NOT NULL,
    "charge_type" "text" NOT NULL,
    "label" "text",
    "responsibility" "text" DEFAULT 'TENANT'::"text" NOT NULL,
    "amount" numeric(12,2),
    CONSTRAINT "lease_charges_charge_type_check" CHECK (("charge_type" = ANY (ARRAY['CONDOMINIUM'::"text", 'IPTU'::"text", 'WATER'::"text", 'ELECTRICITY'::"text", 'GAS'::"text", 'INTERNET'::"text", 'OTHER'::"text"]))),
    CONSTRAINT "lease_charges_responsibility_check" CHECK (("responsibility" = ANY (ARRAY['TENANT'::"text", 'LANDLORD'::"text", 'INCLUDED'::"text"])))
);

ALTER TABLE "public"."lease_charges" OWNER TO "postgres";

COMMENT ON TABLE "public"."lease_charges" IS 'Additional charges (condominium, IPTU, utilities) and their responsibility assignment per lease.';

CREATE TABLE IF NOT EXISTS "public"."lease_documents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lease_id" "uuid" NOT NULL,
    "document_type" "text" DEFAULT 'OTHER'::"text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer,
    "mime_type" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lease_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['CONTRACT'::"text", 'ADDENDUM'::"text", 'INSPECTION'::"text", 'TENANT_DOC'::"text", 'DEPOSIT_RECEIPT'::"text", 'OTHER'::"text"])))
);

ALTER TABLE "public"."lease_documents" OWNER TO "postgres";

COMMENT ON TABLE "public"."lease_documents" IS 'Documents uploaded for a lease: contracts, addenda, inspection reports, etc.';

CREATE TABLE IF NOT EXISTS "public"."lease_tenants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lease_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'CO_TENANT'::"text" NOT NULL,
    CONSTRAINT "lease_tenants_role_check" CHECK (("role" = ANY (ARRAY['CO_TENANT'::"text", 'OCCUPANT'::"text"])))
);

ALTER TABLE "public"."lease_tenants" OWNER TO "postgres";

COMMENT ON TABLE "public"."lease_tenants" IS 'Additional tenants (co-tenants/occupants) associated with a lease. Primary tenant is on the leases table.';

CREATE TABLE IF NOT EXISTS "public"."leases" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reference_name" "text",
    "property_id" "uuid" NOT NULL,
    "primary_tenant_id" "uuid" NOT NULL,
    "management_type" "text" NOT NULL,
    "agency_id" "uuid",
    "agent_id" "uuid",
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "monthly_rent" numeric(12,2) NOT NULL,
    "rent_due_day" integer NOT NULL,
    "security_deposit" numeric(12,2),
    "deposit_months" integer,
    "adjustment_index" "text",
    "adjustment_frequency" integer DEFAULT 12,
    "next_adjustment_date" "date",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "termination_date" "date",
    "termination_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "chk_lease_dates" CHECK ((("end_date" IS NULL) OR ("end_date" > "start_date"))),
    CONSTRAINT "leases_adjustment_index_check" CHECK ((("adjustment_index" IS NULL) OR ("adjustment_index" = ANY (ARRAY['IPCA'::"text", 'IGP_M'::"text", 'INPC'::"text", 'IVAR'::"text", 'CUSTOM'::"text", 'NONE'::"text"])))),
    CONSTRAINT "leases_management_type_check" CHECK (("management_type" = ANY (ARRAY['SELF_MANAGED'::"text", 'AGENCY'::"text", 'AGENT'::"text"]))),
    CONSTRAINT "leases_monthly_rent_check" CHECK (("monthly_rent" > (0)::numeric)),
    CONSTRAINT "leases_rent_due_day_check" CHECK ((("rent_due_day" >= 1) AND ("rent_due_day" <= 31))),
    CONSTRAINT "leases_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ACTIVE'::"text", 'EXPIRING_SOON'::"text", 'EXPIRED'::"text", 'TERMINATED'::"text", 'CANCELLED'::"text"])))
);

ALTER TABLE "public"."leases" OWNER TO "postgres";

COMMENT ON TABLE "public"."leases" IS 'Rental/lease contracts connecting properties, tenants, and management.';

COMMENT ON COLUMN "public"."leases"."reference_name" IS 'User-friendly reference like "Kitnet 03 - João - 2026".';

COMMENT ON COLUMN "public"."leases"."management_type" IS 'SELF_MANAGED = owner manages, AGENCY = managed by agency, AGENT = managed by independent agent.';

COMMENT ON COLUMN "public"."leases"."monthly_rent" IS 'Monthly rent in BRL. Must be greater than zero.';

COMMENT ON COLUMN "public"."leases"."rent_due_day" IS 'Day of month (1-31) when rent is due.';

COMMENT ON COLUMN "public"."leases"."adjustment_index" IS 'Economic index used for rent adjustments: IPCA, IGP_M, INPC, IVAR, CUSTOM, or NONE.';

COMMENT ON COLUMN "public"."leases"."status" IS 'DRAFT, ACTIVE, EXPIRING_SOON, EXPIRED, TERMINATED, CANCELLED.';

CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "profile_id" "uuid",
    "title" "text",
    "description" "text",
    "price" numeric,
    "area" numeric,
    "bedrooms" integer,
    "bathrooms" integer,
    "parking" integer,
    "location" "jsonb",
    "photos" "text"[],
    "type" "text",
    "intent" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE "public"."listings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."meter_anomalies" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "meter_id" "text",
    "detected_at" timestamp with time zone DEFAULT "now"(),
    "severity" "text",
    "type" "text",
    "description" "text",
    "resolved" boolean DEFAULT false,
    CONSTRAINT "meter_anomalies_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);

ALTER TABLE "public"."meter_anomalies" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."meter_readings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "meter_id" "text" NOT NULL,
    "value" numeric NOT NULL,
    "read_at" timestamp with time zone NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."meter_readings" OWNER TO "postgres";

COMMENT ON TABLE "public"."meter_readings" IS 'Raw meter readings synced from Edge Gateways.';

CREATE TABLE IF NOT EXISTS "public"."meter_readings_hourly" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "meter_id" "text",
    "value" numeric NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."meter_readings_hourly" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."meters" (
    "id" "text" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "gateway_id" "uuid",
    "property_id" "uuid",
    "type" "text" DEFAULT 'water'::"text",
    "unit" "text" DEFAULT 'L'::"text",
    "is_main_meter" boolean DEFAULT false,
    "pulse_factor" numeric DEFAULT 1.0
);

ALTER TABLE "public"."meters" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."minimum_wage_history" (
    "id" bigint NOT NULL,
    "reference_date" "date" NOT NULL,
    "amount_brl" numeric(10,2) NOT NULL,
    "variation_percent" numeric(10,2),
    "legislation" "text",
    "remarks" "text",
    "year" integer GENERATED ALWAYS AS (EXTRACT(year FROM "reference_date")) STORED,
    "month" integer GENERATED ALWAYS AS (EXTRACT(month FROM "reference_date")) STORED,
    "is_projection" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."minimum_wage_history" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."minimum_wage_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."minimum_wage_history_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."minimum_wage_history_id_seq" OWNED BY "public"."minimum_wage_history"."id";

CREATE TABLE IF NOT EXISTS "public"."ownership_proofs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "file_url" "text" NOT NULL,
    "original_name" "text",
    "file_size" integer,
    "mime_type" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "property_index" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "ownership_proofs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

ALTER TABLE "public"."ownership_proofs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "clerk_id" "text" NOT NULL,
    "role" "text" DEFAULT 'landlord'::"text",
    "full_name" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "cpf" "text",
    "phone" "text",
    "birth_date" "date",
    "address" "jsonb" DEFAULT '{}'::"jsonb",
    "property_address" "jsonb" DEFAULT '{}'::"jsonb",
    "property_photos" "text"[] DEFAULT '{}'::"text"[],
    "person_type" "text" DEFAULT 'pf'::"text",
    "cnpj" "text",
    "business_name" "text",
    "trade_name" "text",
    "registration_status_date" "date",
    "property_type" "text",
    "admin_data" "jsonb",
    "property_details" "jsonb" DEFAULT '{}'::"jsonb",
    "sub_units" "jsonb" DEFAULT '[]'::"jsonb",
    "property_videos" "jsonb" DEFAULT '[]'::"jsonb",
    "additional_properties" "jsonb" DEFAULT '[]'::"jsonb",
    "profile_photo_url" "text",
    CONSTRAINT "profiles_person_type_check" CHECK (("person_type" = ANY (ARRAY['pf'::"text", 'pj'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['landlord'::"text", 'tenant'::"text", 'admin'::"text"])))
);

ALTER TABLE "public"."profiles" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."properties" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "address" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "connection_code" "text",
    "cadastral_map" "text",
    "electronic_id" "text",
    "allocation_model" "text" DEFAULT 'proportional'::"text",
    CONSTRAINT "chk_allocation_model" CHECK (("allocation_model" = ANY (ARRAY['equal'::"text", 'proportional'::"text", 'fixed'::"text"])))
);

ALTER TABLE "public"."properties" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."property_income_months" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "received_on" "date",
    "received_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "energy_portion" numeric(12,2) DEFAULT 0 NOT NULL,
    "other_income" numeric(12,2) DEFAULT 0 NOT NULL,
    "agency_fee_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'CONFIRMED'::"text" NOT NULL,
    "source" "text" DEFAULT 'MANUAL'::"text" NOT NULL,
    "bank_reference" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "property_income_months_month_is_first_day" CHECK ((EXTRACT(day FROM "month") = (1)::numeric)),
    CONSTRAINT "property_income_months_non_negative" CHECK ((("received_amount" >= (0)::numeric) AND ("energy_portion" >= (0)::numeric) AND ("other_income" >= (0)::numeric) AND ("agency_fee_pct" >= (0)::numeric) AND ("agency_fee_pct" < (100)::numeric))),
    CONSTRAINT "property_income_months_source_check" CHECK (("source" = ANY (ARRAY['MANUAL'::"text", 'IMPORT'::"text", 'BANK'::"text"]))),
    CONSTRAINT "property_income_months_status_check" CHECK (("status" = ANY (ARRAY['EXPECTED'::"text", 'CONFIRMED'::"text"])))
);

ALTER TABLE "public"."property_income_months" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."readings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "meter_id" "uuid" NOT NULL,
    "value" double precision NOT NULL,
    "delta" double precision,
    "timestamp" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE "public"."readings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."tags" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "cpf" "text" NOT NULL,
    "main_phone" "text" NOT NULL,
    "email" "text",
    "date_of_birth" "date",
    "rg" "text",
    "additional_phone" "text",
    "postal_code" "text",
    "street" "text",
    "street_number" "text",
    "address_complement" "text",
    "neighborhood" "text",
    "city" "text",
    "state" "text",
    "property_id" "uuid" NOT NULL,
    "use_property_address" boolean DEFAULT false NOT NULL,
    "management_type" "text" NOT NULL,
    "agency_id" "uuid",
    "agent_id" "uuid",
    "move_in_date" "date",
    "move_out_date" "date",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "tenants_management_type_check" CHECK (("management_type" = ANY (ARRAY['SELF_MANAGED'::"text", 'AGENCY'::"text"]))),
    CONSTRAINT "tenants_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'FUTURE'::"text", 'FORMER'::"text"])))
);

ALTER TABLE "public"."tenants" OWNER TO "postgres";

COMMENT ON TABLE "public"."tenants" IS 'Tenants (inquilinos) managed by property owners';

COMMENT ON COLUMN "public"."tenants"."cpf" IS 'Brazilian CPF, digits only (11 chars). Unique per user account.';

COMMENT ON COLUMN "public"."tenants"."main_phone" IS 'Phone stored in E.164 international format (+5531999999999).';

COMMENT ON COLUMN "public"."tenants"."property_id" IS 'FK to properties. RESTRICT deletion if tenant references it.';

COMMENT ON COLUMN "public"."tenants"."use_property_address" IS 'If true, the tenant current address is the same as the rented property address.';

COMMENT ON COLUMN "public"."tenants"."management_type" IS 'SELF_MANAGED = owner manages directly, AGENCY = managed by a real estate agency';

COMMENT ON COLUMN "public"."tenants"."agency_id" IS 'FK to agencies. Required when management_type = AGENCY. SET NULL on agency deletion.';

COMMENT ON COLUMN "public"."tenants"."agent_id" IS 'FK to agents. Optional agent within the selected agency. SET NULL on agent deletion.';

COMMENT ON COLUMN "public"."tenants"."status" IS 'ACTIVE = currently occupying, FUTURE = future tenant, FORMER = ex-tenant';

CREATE TABLE IF NOT EXISTS "public"."useful_link_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "url" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE "public"."useful_link_suggestions" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."vw_latest_indices" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("i"."id") "i"."code",
    "i"."name",
    "v"."value_percent",
    "v"."accumulated_12m",
    "v"."reference_date",
    "v"."is_projection"
   FROM ("public"."economic_indexes" "i"
     JOIN "public"."economic_index_values" "v" ON (("v"."index_id" = "i"."id")))
  ORDER BY "i"."id", "v"."year" DESC, "v"."month" DESC;

ALTER VIEW "public"."vw_latest_indices" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."waitlist_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_type" "text" NOT NULL,
    "cpf" "text",
    "cnpj" "text",
    "business_name" "text",
    "trade_name" "text",
    "portfolio_size" "text",
    "city" "text",
    "state" "text",
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "whatsapp" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "source" "text" DEFAULT 'waitlist_wizard'::"text",
    "zip_code" "text",
    "street" "text",
    "neighborhood" "text",
    "number" "text",
    "complement" "text",
    "partners_json" "text",
    "creci" "text"
);

ALTER TABLE "public"."waitlist_leads" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."water_bills" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "property_id" "uuid",
    "reference_month" "text" NOT NULL,
    "meter_number" "text",
    "previous_reading" numeric,
    "current_reading" numeric,
    "consumption_m3" numeric NOT NULL,
    "billed_consumption_m3" numeric,
    "reading_date" "date",
    "due_date" "date",
    "water_tariff" numeric DEFAULT 0,
    "sewage_tariff" numeric DEFAULT 0,
    "water_basic_fee" numeric DEFAULT 0,
    "sewage_basic_fee" numeric DEFAULT 0,
    "total_amount" numeric NOT NULL,
    "effective_rate_per_m3" numeric GENERATED ALWAYS AS (
CASE
    WHEN ("consumption_m3" > (0)::numeric) THEN "round"(("total_amount" / "consumption_m3"), 2)
    ELSE NULL::numeric
END) STORED,
    "occurrence_code" "text",
    "average_consumption_m3" numeric,
    "bill_pdf_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "reading_date_orig" "date"
);

ALTER TABLE "public"."water_bills" OWNER TO "postgres";

ALTER TABLE ONLY "public"."fipezap_series" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fipezap_series_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."minimum_wage_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."minimum_wage_history_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agency_members"
    ADD CONSTRAINT "agency_members_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."article_categories"
    ADD CONSTRAINT "article_categories_pkey" PRIMARY KEY ("article_id", "category_id");

ALTER TABLE ONLY "public"."article_revisions"
    ADD CONSTRAINT "article_revisions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."article_tags"
    ADD CONSTRAINT "article_tags_pkey" PRIMARY KEY ("article_id", "tag_id");

ALTER TABLE ONLY "public"."article_translations"
    ADD CONSTRAINT "article_translations_article_id_lang_key" UNIQUE ("article_id", "lang");

ALTER TABLE ONLY "public"."article_translations"
    ADD CONSTRAINT "article_translations_lang_slug_key" UNIQUE ("lang", "slug");

ALTER TABLE ONLY "public"."article_translations"
    ADD CONSTRAINT "article_translations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."authors"
    ADD CONSTRAINT "authors_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."authors"
    ADD CONSTRAINT "authors_slug_key" UNIQUE ("slug");

ALTER TABLE ONLY "public"."calculator_suggestions"
    ADD CONSTRAINT "calculator_suggestions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");

ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."economic_index_revisions"
    ADD CONSTRAINT "economic_index_revisions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."economic_index_values"
    ADD CONSTRAINT "economic_index_values_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."economic_indexes"
    ADD CONSTRAINT "economic_indexes_code_key" UNIQUE ("code");

ALTER TABLE ONLY "public"."economic_indexes"
    ADD CONSTRAINT "economic_indexes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."energy_bills"
    ADD CONSTRAINT "energy_bills_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."faq_questions"
    ADD CONSTRAINT "faq_questions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."fipezap_series"
    ADD CONSTRAINT "fipezap_series_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."fipezap_series"
    ADD CONSTRAINT "fipezap_series_reference_date_index_type_metric_dormitorios_key" UNIQUE ("reference_date", "index_type", "metric", "dormitorios");

ALTER TABLE ONLY "public"."gateways"
    ADD CONSTRAINT "gateways_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."gateways"
    ADD CONSTRAINT "gateways_serial_number_key" UNIQUE ("serial_number");

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_email_key" UNIQUE ("email");

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."lease_charges"
    ADD CONSTRAINT "lease_charges_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."lease_documents"
    ADD CONSTRAINT "lease_documents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."lease_tenants"
    ADD CONSTRAINT "lease_tenants_lease_id_tenant_id_key" UNIQUE ("lease_id", "tenant_id");

ALTER TABLE ONLY "public"."lease_tenants"
    ADD CONSTRAINT "lease_tenants_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."leases"
    ADD CONSTRAINT "leases_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."meter_anomalies"
    ADD CONSTRAINT "meter_anomalies_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."meter_readings_hourly"
    ADD CONSTRAINT "meter_readings_hourly_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."meter_readings"
    ADD CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."meters"
    ADD CONSTRAINT "meters_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."minimum_wage_history"
    ADD CONSTRAINT "minimum_wage_history_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."minimum_wage_history"
    ADD CONSTRAINT "minimum_wage_history_reference_date_key" UNIQUE ("reference_date");

ALTER TABLE ONLY "public"."ownership_proofs"
    ADD CONSTRAINT "ownership_proofs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_clerk_id_key" UNIQUE ("clerk_id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."property_income_months"
    ADD CONSTRAINT "property_income_months_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."property_income_months"
    ADD CONSTRAINT "property_income_months_unique" UNIQUE ("property_id", "month");

ALTER TABLE ONLY "public"."readings"
    ADD CONSTRAINT "readings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_slug_key" UNIQUE ("slug");

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agency_members"
    ADD CONSTRAINT "unique_agency_user" UNIQUE ("agency_id", "user_id");

ALTER TABLE ONLY "public"."water_bills"
    ADD CONSTRAINT "unique_bill_per_property_month" UNIQUE ("property_id", "reference_month");

ALTER TABLE ONLY "public"."energy_bills"
    ADD CONSTRAINT "unique_energy_bill_per_property_month" UNIQUE ("property_id", "reference_month");

ALTER TABLE ONLY "public"."meter_readings_hourly"
    ADD CONSTRAINT "unique_hourly_reading" UNIQUE ("meter_id", "start_time");

ALTER TABLE ONLY "public"."economic_index_values"
    ADD CONSTRAINT "unique_index_year_month" UNIQUE ("index_id", "year", "month");

ALTER TABLE ONLY "public"."meter_readings"
    ADD CONSTRAINT "unique_meter_date" UNIQUE ("meter_id", "read_at");

ALTER TABLE ONLY "public"."meter_readings"
    ADD CONSTRAINT "unique_reading_per_meter_time" UNIQUE ("meter_id", "read_at");

ALTER TABLE ONLY "public"."useful_link_suggestions"
    ADD CONSTRAINT "useful_link_suggestions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."waitlist_leads"
    ADD CONSTRAINT "waitlist_leads_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."water_bills"
    ADD CONSTRAINT "water_bills_pkey" PRIMARY KEY ("id");

CREATE INDEX "article_revisions_article_lang_created_idx" ON "public"."article_revisions" USING "btree" ("article_id", "lang", "created_at" DESC);

CREATE INDEX "article_tags_tag_id_idx" ON "public"."article_tags" USING "btree" ("tag_id");

CREATE INDEX "article_translations_article_lang_idx" ON "public"."article_translations" USING "btree" ("article_id", "lang");

CREATE INDEX "article_translations_lang_slug_idx" ON "public"."article_translations" USING "btree" ("lang", "slug");

CREATE INDEX "articles_author_status_idx" ON "public"."articles" USING "btree" ("author_id", "status");

CREATE INDEX "articles_primary_category_status_idx" ON "public"."articles" USING "btree" ("primary_category_id", "status");

CREATE INDEX "articles_status_published_at_idx" ON "public"."articles" USING "btree" ("status", "published_at" DESC);

CREATE INDEX "idx_agencies_cnpj" ON "public"."agencies" USING "btree" ("cnpj") WHERE ("cnpj" IS NOT NULL);

CREATE INDEX "idx_agencies_deleted_at" ON "public"."agencies" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);

CREATE INDEX "idx_agencies_status" ON "public"."agencies" USING "btree" ("status");

CREATE INDEX "idx_agency_members_agency_id" ON "public"."agency_members" USING "btree" ("agency_id");

CREATE INDEX "idx_agency_members_user_id" ON "public"."agency_members" USING "btree" ("user_id");

CREATE INDEX "idx_agents_agency_id" ON "public"."agents" USING "btree" ("agency_id") WHERE ("agency_id" IS NOT NULL);

CREATE UNIQUE INDEX "idx_agents_cpf_unique" ON "public"."agents" USING "btree" ("cpf") WHERE (("deleted_at" IS NULL) AND ("cpf" IS NOT NULL));

CREATE UNIQUE INDEX "idx_agents_creci_unique" ON "public"."agents" USING "btree" ("creci_number", "creci_state") WHERE ("deleted_at" IS NULL);

CREATE INDEX "idx_agents_deleted_at" ON "public"."agents" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);

CREATE INDEX "idx_agents_user_id" ON "public"."agents" USING "btree" ("user_id");

CREATE INDEX "idx_economic_index_values_index_id" ON "public"."economic_index_values" USING "btree" ("index_id");

CREATE INDEX "idx_economic_index_values_reference_date" ON "public"."economic_index_values" USING "btree" ("reference_date");

CREATE INDEX "idx_economic_index_values_year_month" ON "public"."economic_index_values" USING "btree" ("year", "month");

CREATE INDEX "idx_economic_indexes_code" ON "public"."economic_indexes" USING "btree" ("code");

CREATE INDEX "idx_energy_bills_consumer_unit" ON "public"."energy_bills" USING "btree" ("consumer_unit");

CREATE INDEX "idx_energy_bills_due_date" ON "public"."energy_bills" USING "btree" ("due_date" DESC);

CREATE INDEX "idx_energy_bills_property_month" ON "public"."energy_bills" USING "btree" ("property_id", "reference_month" DESC);

CREATE INDEX "idx_fipezap_date" ON "public"."fipezap_series" USING "btree" ("reference_date");

CREATE INDEX "idx_fipezap_dorm" ON "public"."fipezap_series" USING "btree" ("dormitorios");

CREATE INDEX "idx_fipezap_main_filter" ON "public"."fipezap_series" USING "btree" ("index_type", "metric", "dormitorios", "reference_date");

CREATE INDEX "idx_fipezap_type_metric" ON "public"."fipezap_series" USING "btree" ("index_type", "metric");

CREATE INDEX "idx_leads_email" ON "public"."leads" USING "btree" ("email");

CREATE INDEX "idx_lease_charges_lease_id" ON "public"."lease_charges" USING "btree" ("lease_id");

CREATE INDEX "idx_lease_documents_lease_id" ON "public"."lease_documents" USING "btree" ("lease_id");

CREATE INDEX "idx_lease_tenants_lease_id" ON "public"."lease_tenants" USING "btree" ("lease_id");

CREATE INDEX "idx_lease_tenants_tenant_id" ON "public"."lease_tenants" USING "btree" ("tenant_id");

CREATE INDEX "idx_leases_deleted_at" ON "public"."leases" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);

CREATE INDEX "idx_leases_primary_tenant_id" ON "public"."leases" USING "btree" ("primary_tenant_id");

CREATE INDEX "idx_leases_property_active" ON "public"."leases" USING "btree" ("property_id", "status") WHERE (("status" = 'ACTIVE'::"text") AND ("deleted_at" IS NULL));

CREATE INDEX "idx_leases_property_id" ON "public"."leases" USING "btree" ("property_id");

CREATE INDEX "idx_leases_status" ON "public"."leases" USING "btree" ("status") WHERE ("deleted_at" IS NULL);

CREATE INDEX "idx_leases_user_id" ON "public"."leases" USING "btree" ("user_id");

CREATE INDEX "idx_meter_readings_meter_id" ON "public"."meter_readings" USING "btree" ("meter_id");

CREATE INDEX "idx_meter_readings_read_at" ON "public"."meter_readings" USING "btree" ("read_at");

CREATE INDEX "idx_minimum_wage_date" ON "public"."minimum_wage_history" USING "btree" ("reference_date");

CREATE INDEX "idx_ownership_proofs_profile_property" ON "public"."ownership_proofs" USING "btree" ("profile_id", "property_index");

CREATE UNIQUE INDEX "idx_profiles_email_unique" ON "public"."profiles" USING "btree" ("lower"("email"));

CREATE INDEX "idx_property_income_months_owner" ON "public"."property_income_months" USING "btree" ("owner_id");

CREATE INDEX "idx_property_income_months_property_month" ON "public"."property_income_months" USING "btree" ("property_id", "month" DESC);

CREATE INDEX "idx_readings_meter_timestamp" ON "public"."readings" USING "btree" ("meter_id", "timestamp" DESC);

CREATE INDEX "idx_tenants_agency_id" ON "public"."tenants" USING "btree" ("agency_id") WHERE ("agency_id" IS NOT NULL);

CREATE UNIQUE INDEX "idx_tenants_cpf_per_user" ON "public"."tenants" USING "btree" ("user_id", "cpf") WHERE ("deleted_at" IS NULL);

CREATE INDEX "idx_tenants_deleted_at" ON "public"."tenants" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);

CREATE INDEX "idx_tenants_property_id" ON "public"."tenants" USING "btree" ("property_id");

CREATE INDEX "idx_tenants_status" ON "public"."tenants" USING "btree" ("status") WHERE ("deleted_at" IS NULL);

CREATE INDEX "idx_tenants_user_id" ON "public"."tenants" USING "btree" ("user_id");

CREATE INDEX "idx_water_bills_due_date" ON "public"."water_bills" USING "btree" ("due_date" DESC);

CREATE INDEX "idx_water_bills_property_month" ON "public"."water_bills" USING "btree" ("property_id", "reference_month" DESC);

CREATE OR REPLACE TRIGGER "trg_agents_updated_at" BEFORE UPDATE ON "public"."agents" FOR EACH ROW EXECUTE FUNCTION "public"."update_agents_updated_at"();

CREATE OR REPLACE TRIGGER "trg_leases_updated_at" BEFORE UPDATE ON "public"."leases" FOR EACH ROW EXECUTE FUNCTION "public"."update_leases_updated_at"();

CREATE OR REPLACE TRIGGER "trg_property_income_months_updated_at" BEFORE UPDATE ON "public"."property_income_months" FOR EACH ROW EXECUTE FUNCTION "public"."set_property_income_months_updated_at"();

CREATE OR REPLACE TRIGGER "trg_tenants_updated_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."update_tenants_updated_at"();

CREATE OR REPLACE TRIGGER "update_agencies_modtime" BEFORE UPDATE ON "public"."agencies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_economic_index_values_modtime" BEFORE UPDATE ON "public"."economic_index_values" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_economic_indexes_modtime" BEFORE UPDATE ON "public"."economic_indexes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."agency_members"
    ADD CONSTRAINT "agency_members_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agency_members"
    ADD CONSTRAINT "agency_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."article_categories"
    ADD CONSTRAINT "article_categories_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."article_categories"
    ADD CONSTRAINT "article_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."article_revisions"
    ADD CONSTRAINT "article_revisions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."article_tags"
    ADD CONSTRAINT "article_tags_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."article_tags"
    ADD CONSTRAINT "article_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."article_translations"
    ADD CONSTRAINT "article_translations_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id");

ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "public"."categories"("id");

ALTER TABLE ONLY "public"."economic_index_revisions"
    ADD CONSTRAINT "economic_index_revisions_index_value_id_fkey" FOREIGN KEY ("index_value_id") REFERENCES "public"."economic_index_values"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."economic_index_values"
    ADD CONSTRAINT "economic_index_values_index_id_fkey" FOREIGN KEY ("index_id") REFERENCES "public"."economic_indexes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."energy_bills"
    ADD CONSTRAINT "energy_bills_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."gateways"
    ADD CONSTRAINT "gateways_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."gateways"
    ADD CONSTRAINT "gateways_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."lease_charges"
    ADD CONSTRAINT "lease_charges_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."lease_documents"
    ADD CONSTRAINT "lease_documents_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."lease_tenants"
    ADD CONSTRAINT "lease_tenants_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."lease_tenants"
    ADD CONSTRAINT "lease_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."leases"
    ADD CONSTRAINT "leases_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."leases"
    ADD CONSTRAINT "leases_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."leases"
    ADD CONSTRAINT "leases_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."leases"
    ADD CONSTRAINT "leases_primary_tenant_id_fkey" FOREIGN KEY ("primary_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."leases"
    ADD CONSTRAINT "leases_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."leases"
    ADD CONSTRAINT "leases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."meter_anomalies"
    ADD CONSTRAINT "meter_anomalies_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."meter_readings_hourly"
    ADD CONSTRAINT "meter_readings_hourly_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."meter_readings"
    ADD CONSTRAINT "meter_readings_meter_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id");

ALTER TABLE ONLY "public"."meters"
    ADD CONSTRAINT "meters_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."meters"
    ADD CONSTRAINT "meters_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."ownership_proofs"
    ADD CONSTRAINT "ownership_proofs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."property_income_months"
    ADD CONSTRAINT "property_income_months_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."property_income_months"
    ADD CONSTRAINT "property_income_months_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."water_bills"
    ADD CONSTRAINT "water_bills_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;

CREATE POLICY "Enable select for authenticated users" ON "public"."calculator_suggestions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Enable select for authenticated users" ON "public"."contact_messages" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Enable select for authenticated users" ON "public"."faq_questions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Enable select for authenticated users" ON "public"."useful_link_suggestions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Members can view own memberships" ON "public"."agency_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "agency_members"."user_id") AND ("p"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Members can view their agencies" ON "public"."agencies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."agency_members" "am"
     JOIN "public"."profiles" "p" ON (("p"."id" = "am"."user_id")))
  WHERE (("am"."agency_id" = "agencies"."id") AND ("p"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Owners and admins can update agencies" ON "public"."agencies" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."agency_members" "am"
     JOIN "public"."profiles" "p" ON (("p"."id" = "am"."user_id")))
  WHERE (("am"."agency_id" = "agencies"."id") AND ("p"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))) AND ("am"."role" = ANY (ARRAY['OWNER'::"text", 'ADMIN'::"text"]))))));

CREATE POLICY "Owners can manage own bills" ON "public"."water_bills" USING (("property_id" IN ( SELECT "properties"."id"
   FROM "public"."properties"
  WHERE ("properties"."owner_id" IN ( SELECT "profiles"."id"
           FROM "public"."profiles"
          WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))))) WITH CHECK (("property_id" IN ( SELECT "properties"."id"
   FROM "public"."properties"
  WHERE ("properties"."owner_id" IN ( SELECT "profiles"."id"
           FROM "public"."profiles"
          WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))));

CREATE POLICY "Owners can manage own energy bills" ON "public"."energy_bills" USING (("property_id" IN ( SELECT "properties"."id"
   FROM "public"."properties"
  WHERE ("properties"."owner_id" IN ( SELECT "profiles"."id"
           FROM "public"."profiles"
          WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))))) WITH CHECK (("property_id" IN ( SELECT "properties"."id"
   FROM "public"."properties"
  WHERE ("properties"."owner_id" IN ( SELECT "profiles"."id"
           FROM "public"."profiles"
          WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))));

CREATE POLICY "Owners can manage own properties" ON "public"."properties" USING (("owner_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))) WITH CHECK (("owner_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))));

CREATE POLICY "Owners can view own bills" ON "public"."water_bills" FOR SELECT USING (("property_id" IN ( SELECT "properties"."id"
   FROM "public"."properties"
  WHERE ("properties"."owner_id" IN ( SELECT "profiles"."id"
           FROM "public"."profiles"
          WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))));

CREATE POLICY "Owners can view own energy bills" ON "public"."energy_bills" FOR SELECT USING (("property_id" IN ( SELECT "properties"."id"
   FROM "public"."properties"
  WHERE ("properties"."owner_id" IN ( SELECT "profiles"."id"
           FROM "public"."profiles"
          WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))));

CREATE POLICY "Owners can view own gateways" ON "public"."gateways" FOR SELECT USING (("owner_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))));

CREATE POLICY "Owners can view own meter readings" ON "public"."meter_readings" FOR SELECT USING (("meter_id" IN ( SELECT "m"."id"
   FROM ("public"."meters" "m"
     JOIN "public"."gateways" "g" ON (("g"."id" = "m"."gateway_id")))
  WHERE ("g"."owner_id" IN ( SELECT "profiles"."id"
           FROM "public"."profiles"
          WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))));

CREATE POLICY "Owners can view own meters" ON "public"."meters" FOR SELECT USING (("gateway_id" IN ( SELECT "g"."id"
   FROM "public"."gateways" "g"
  WHERE ("g"."owner_id" IN ( SELECT "profiles"."id"
           FROM "public"."profiles"
          WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))))));

CREATE POLICY "Owners can view own properties" ON "public"."properties" FOR SELECT USING (("owner_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))));

CREATE POLICY "Owners insert listings" ON "public"."listings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "listings"."profile_id") AND ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Public Read Access FipeZap" ON "public"."fipezap_series" FOR SELECT USING (true);

CREATE POLICY "Public Read Access Indexes" ON "public"."economic_indexes" FOR SELECT USING (true);

CREATE POLICY "Public Read Access Minimum Wage" ON "public"."minimum_wage_history" FOR SELECT USING (true);

CREATE POLICY "Public Read Access Revisions" ON "public"."economic_index_revisions" FOR SELECT USING (true);

CREATE POLICY "Public Read Access Values" ON "public"."economic_index_values" FOR SELECT USING (true);

CREATE POLICY "Public article_categories read" ON "public"."article_categories" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."articles"
  WHERE (("articles"."id" = "article_categories"."article_id") AND ("articles"."status" = 'published'::"public"."article_status") AND (("articles"."published_at" IS NULL) OR ("articles"."published_at" <= "now"()))))));

CREATE POLICY "Public article_tags read" ON "public"."article_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."articles"
  WHERE (("articles"."id" = "article_tags"."article_id") AND ("articles"."status" = 'published'::"public"."article_status") AND (("articles"."published_at" IS NULL) OR ("articles"."published_at" <= "now"()))))));

CREATE POLICY "Public articles read" ON "public"."articles" FOR SELECT USING ((("status" = 'published'::"public"."article_status") AND (("published_at" IS NULL) OR ("published_at" <= "now"()))));

CREATE POLICY "Public authors read" ON "public"."authors" FOR SELECT USING (true);

CREATE POLICY "Public categories read" ON "public"."categories" FOR SELECT USING (true);

CREATE POLICY "Public tags read" ON "public"."tags" FOR SELECT USING (true);

CREATE POLICY "Public translations read" ON "public"."article_translations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."articles"
  WHERE (("articles"."id" = "article_translations"."article_id") AND ("articles"."status" = 'published'::"public"."article_status") AND (("articles"."published_at" IS NULL) OR ("articles"."published_at" <= "now"()))))));

CREATE POLICY "Public view listings" ON "public"."listings" FOR SELECT USING (true);

CREATE POLICY "Users can delete own proofs" ON "public"."ownership_proofs" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "ownership_proofs"."profile_id") AND ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))));

CREATE POLICY "Users can insert own proofs" ON "public"."ownership_proofs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "ownership_proofs"."profile_id") AND ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))) WITH CHECK (("clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));

CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));

CREATE POLICY "Users can view own proofs" ON "public"."ownership_proofs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "ownership_proofs"."profile_id") AND ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

ALTER TABLE "public"."agencies" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."agency_members" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_select_own" ON "public"."agents" FOR SELECT USING (("user_id" = "auth"."uid"()));

ALTER TABLE "public"."article_categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."article_revisions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."article_tags" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."article_translations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."articles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."authors" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."calculator_suggestions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."economic_index_revisions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."economic_index_values" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."economic_indexes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."energy_bills" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."faq_questions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."fipezap_series" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gateways" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lease_charges" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lease_charges_select_own" ON "public"."lease_charges" FOR SELECT USING (("lease_id" IN ( SELECT "leases"."id"
   FROM "public"."leases"
  WHERE ("leases"."user_id" = "auth"."uid"()))));

ALTER TABLE "public"."lease_documents" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lease_documents_select_own" ON "public"."lease_documents" FOR SELECT USING (("lease_id" IN ( SELECT "leases"."id"
   FROM "public"."leases"
  WHERE ("leases"."user_id" = "auth"."uid"()))));

ALTER TABLE "public"."lease_tenants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lease_tenants_select_own" ON "public"."lease_tenants" FOR SELECT USING (("lease_id" IN ( SELECT "leases"."id"
   FROM "public"."leases"
  WHERE ("leases"."user_id" = "auth"."uid"()))));

ALTER TABLE "public"."leases" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leases_select_own" ON "public"."leases" FOR SELECT USING (("user_id" = "auth"."uid"()));

ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."meter_readings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."meters" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."minimum_wage_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ownership_proofs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."properties" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."property_income_months" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."readings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select_own" ON "public"."tenants" FOR SELECT USING (("user_id" = "auth"."uid"()));

ALTER TABLE "public"."useful_link_suggestions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."waitlist_leads" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."water_bills" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners delete own property media" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'property-media'::"text") AND (("storage"."foldername"("name"))[1] = ANY (ARRAY['photos'::"text", 'videos'::"text", 'listings'::"text"])) AND (("storage"."foldername"("name"))[2] IN ( SELECT ("profiles"."id")::"text" AS "id"
   FROM "public"."profiles"
  WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Owners manage own documents (delete)" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'documents'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("profiles"."id")::"text" AS "id"
   FROM "public"."profiles"
  WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Owners manage own documents (insert)" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'documents'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("profiles"."id")::"text" AS "id"
   FROM "public"."profiles"
  WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Owners manage own documents (select)" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'documents'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("profiles"."id")::"text" AS "id"
   FROM "public"."profiles"
  WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

CREATE POLICY "Owners upload own property media" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'property-media'::"text") AND (("storage"."foldername"("name"))[1] = ANY (ARRAY['photos'::"text", 'videos'::"text", 'listings'::"text"])) AND (("storage"."foldername"("name"))[2] IN ( SELECT ("profiles"."id")::"text" AS "id"
   FROM "public"."profiles"
  WHERE ("profiles"."clerk_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text")))))));

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_latest_billing_rate"("p_property_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_latest_billing_rate"("p_property_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_property_bills"("p_property_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_property_bills"("p_property_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_property_details"("p_property_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_property_details"("p_property_id" "uuid") TO "service_role";

GRANT ALL ON TABLE "public"."energy_bills" TO "anon";
GRANT ALL ON TABLE "public"."energy_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."energy_bills" TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_property_energy_bills"("p_property_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_property_energy_bills"("p_property_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."set_property_income_months_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_property_income_months_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_property_income_months_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_agents_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_agents_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_agents_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_leases_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_leases_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_leases_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_tenants_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenants_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenants_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."upsert_water_bill"("p_property_id" "uuid", "p_reference_month" "text", "p_meter_number" "text", "p_previous_reading" numeric, "p_current_reading" numeric, "p_consumption_m3" numeric, "p_billed_consumption_m3" numeric, "p_reading_date" "date", "p_reading_date_orig" "date", "p_due_date" "date", "p_total_amount" numeric, "p_water_tariff" numeric, "p_sewage_tariff" numeric, "p_water_basic_fee" numeric, "p_sewage_basic_fee" numeric, "p_occurrence_code" "text", "p_average_consumption_m3" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_water_bill"("p_property_id" "uuid", "p_reference_month" "text", "p_meter_number" "text", "p_previous_reading" numeric, "p_current_reading" numeric, "p_consumption_m3" numeric, "p_billed_consumption_m3" numeric, "p_reading_date" "date", "p_reading_date_orig" "date", "p_due_date" "date", "p_total_amount" numeric, "p_water_tariff" numeric, "p_sewage_tariff" numeric, "p_water_basic_fee" numeric, "p_sewage_basic_fee" numeric, "p_occurrence_code" "text", "p_average_consumption_m3" numeric, "p_notes" "text") TO "service_role";

GRANT ALL ON TABLE "public"."agencies" TO "anon";
GRANT ALL ON TABLE "public"."agencies" TO "authenticated";
GRANT ALL ON TABLE "public"."agencies" TO "service_role";

GRANT ALL ON TABLE "public"."agency_members" TO "anon";
GRANT ALL ON TABLE "public"."agency_members" TO "authenticated";
GRANT ALL ON TABLE "public"."agency_members" TO "service_role";

GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";

GRANT ALL ON TABLE "public"."article_categories" TO "anon";
GRANT ALL ON TABLE "public"."article_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."article_categories" TO "service_role";

GRANT ALL ON TABLE "public"."article_revisions" TO "anon";
GRANT ALL ON TABLE "public"."article_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."article_revisions" TO "service_role";

GRANT ALL ON TABLE "public"."article_tags" TO "anon";
GRANT ALL ON TABLE "public"."article_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."article_tags" TO "service_role";

GRANT ALL ON TABLE "public"."article_translations" TO "anon";
GRANT ALL ON TABLE "public"."article_translations" TO "authenticated";
GRANT ALL ON TABLE "public"."article_translations" TO "service_role";

GRANT ALL ON TABLE "public"."articles" TO "anon";
GRANT ALL ON TABLE "public"."articles" TO "authenticated";
GRANT ALL ON TABLE "public"."articles" TO "service_role";

GRANT ALL ON TABLE "public"."authors" TO "anon";
GRANT ALL ON TABLE "public"."authors" TO "authenticated";
GRANT ALL ON TABLE "public"."authors" TO "service_role";

GRANT ALL ON TABLE "public"."calculator_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."calculator_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."calculator_suggestions" TO "service_role";

GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";

GRANT ALL ON TABLE "public"."contact_messages" TO "anon";
GRANT ALL ON TABLE "public"."contact_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";

GRANT ALL ON TABLE "public"."economic_index_revisions" TO "anon";
GRANT ALL ON TABLE "public"."economic_index_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."economic_index_revisions" TO "service_role";

GRANT ALL ON TABLE "public"."economic_index_values" TO "anon";
GRANT ALL ON TABLE "public"."economic_index_values" TO "authenticated";
GRANT ALL ON TABLE "public"."economic_index_values" TO "service_role";

GRANT ALL ON TABLE "public"."economic_indexes" TO "anon";
GRANT ALL ON TABLE "public"."economic_indexes" TO "authenticated";
GRANT ALL ON TABLE "public"."economic_indexes" TO "service_role";

GRANT ALL ON TABLE "public"."faq_questions" TO "anon";
GRANT ALL ON TABLE "public"."faq_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."faq_questions" TO "service_role";

GRANT ALL ON TABLE "public"."fipezap_series" TO "anon";
GRANT ALL ON TABLE "public"."fipezap_series" TO "authenticated";
GRANT ALL ON TABLE "public"."fipezap_series" TO "service_role";

GRANT ALL ON SEQUENCE "public"."fipezap_series_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fipezap_series_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fipezap_series_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."gateways" TO "anon";
GRANT ALL ON TABLE "public"."gateways" TO "authenticated";
GRANT ALL ON TABLE "public"."gateways" TO "service_role";

GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";

GRANT ALL ON TABLE "public"."lease_charges" TO "anon";
GRANT ALL ON TABLE "public"."lease_charges" TO "authenticated";
GRANT ALL ON TABLE "public"."lease_charges" TO "service_role";

GRANT ALL ON TABLE "public"."lease_documents" TO "anon";
GRANT ALL ON TABLE "public"."lease_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."lease_documents" TO "service_role";

GRANT ALL ON TABLE "public"."lease_tenants" TO "anon";
GRANT ALL ON TABLE "public"."lease_tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."lease_tenants" TO "service_role";

GRANT ALL ON TABLE "public"."leases" TO "anon";
GRANT ALL ON TABLE "public"."leases" TO "authenticated";
GRANT ALL ON TABLE "public"."leases" TO "service_role";

GRANT ALL ON TABLE "public"."listings" TO "anon";
GRANT ALL ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";

GRANT ALL ON TABLE "public"."meter_anomalies" TO "anon";
GRANT ALL ON TABLE "public"."meter_anomalies" TO "authenticated";
GRANT ALL ON TABLE "public"."meter_anomalies" TO "service_role";

GRANT ALL ON TABLE "public"."meter_readings" TO "anon";
GRANT ALL ON TABLE "public"."meter_readings" TO "authenticated";
GRANT ALL ON TABLE "public"."meter_readings" TO "service_role";

GRANT ALL ON TABLE "public"."meter_readings_hourly" TO "anon";
GRANT ALL ON TABLE "public"."meter_readings_hourly" TO "authenticated";
GRANT ALL ON TABLE "public"."meter_readings_hourly" TO "service_role";

GRANT ALL ON TABLE "public"."meters" TO "anon";
GRANT ALL ON TABLE "public"."meters" TO "authenticated";
GRANT ALL ON TABLE "public"."meters" TO "service_role";

GRANT ALL ON TABLE "public"."minimum_wage_history" TO "anon";
GRANT ALL ON TABLE "public"."minimum_wage_history" TO "authenticated";
GRANT ALL ON TABLE "public"."minimum_wage_history" TO "service_role";

GRANT ALL ON SEQUENCE "public"."minimum_wage_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."minimum_wage_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."minimum_wage_history_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."ownership_proofs" TO "anon";
GRANT ALL ON TABLE "public"."ownership_proofs" TO "authenticated";
GRANT ALL ON TABLE "public"."ownership_proofs" TO "service_role";

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT ALL ON TABLE "public"."properties" TO "anon";
GRANT ALL ON TABLE "public"."properties" TO "authenticated";
GRANT ALL ON TABLE "public"."properties" TO "service_role";

GRANT ALL ON TABLE "public"."property_income_months" TO "service_role";

GRANT ALL ON TABLE "public"."readings" TO "anon";
GRANT ALL ON TABLE "public"."readings" TO "authenticated";
GRANT ALL ON TABLE "public"."readings" TO "service_role";

GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";

GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";

GRANT ALL ON TABLE "public"."useful_link_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."useful_link_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."useful_link_suggestions" TO "service_role";

GRANT ALL ON TABLE "public"."vw_latest_indices" TO "anon";
GRANT ALL ON TABLE "public"."vw_latest_indices" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_latest_indices" TO "service_role";

GRANT ALL ON TABLE "public"."waitlist_leads" TO "anon";
GRANT ALL ON TABLE "public"."waitlist_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist_leads" TO "service_role";

GRANT ALL ON TABLE "public"."water_bills" TO "anon";
GRANT ALL ON TABLE "public"."water_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."water_bills" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
