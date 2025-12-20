
# Landlord Sign-Up & Gateway Integration Plan

## 1. Authentication & Database Setup

We are using **Clerk** for authentication and **Supabase** for the database.

### Prerequisites

1. **Clerk Project**: Create a new project at [dashboard.clerk.com](https://dashboard.clerk.com/).
2. **Supabase Project**: Create a new project at [supabase.com](https://supabase.com/).
3. **Environment Variables**: Add the following to `apps/web/.env.local`:

    ```env
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
    CLERK_SECRET_KEY=sk_test_...
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login/proprietario
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup/proprietario
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

    NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=...
    SUPABASE_SERVICE_ROLE_KEY=...
    ```

### Database Schema

Run the SQL script located at `packages/core/database/schema.sql` in your Supabase SQL Editor.
This will create:

- `profiles`: Users linked to Clerk accounts.
- `gateways`: Physical devices (Kitnet Gateways).
- `meters`: Utility meters attached to gateways.
- `readings`: Historical data.

## 2. Gateway Integration (MQTT)

For the Smart Gateway to communicate with the cloud, we need an MQTT Broker.

### Recommendation

**HiveMQ Cloud (Free)**

- Connects up to 100 devices for free.
- No credit card required.
- Easy WebSocket support for web clients.

### Configuration

Update the Gateway `config.ts` (link below) and the Web App's environment variables with the Broker URL and credentials.

## 3. Implementation Steps

- [x] Create Sign-Up Page UI (`apps/web/src/app/[lang]/signup/proprietario/page.tsx`)
- [x] Define Database Schema (`packages/core/database/schema.sql`)
- [ ] **Action Required**: Install Dependencies

    ```bash
    npm install @clerk/nextjs @supabase/supabase-js
    ```

- [ ] Implement "Claim Gateway" logic in Next.js API Routes.
- [ ] Create Landlord Dashboard to view real-time meter data.
