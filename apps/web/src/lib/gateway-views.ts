/**
 * One IoT gateway as the "Meus Gateways" block on /proprietario shows it (the founder-only pilot; see
 * lib/gateways-access.ts). Built by lib/gateway-views-server.ts. Types only: safe for client components.
 */
export interface GatewayView {
    id: string;
    label: string | null;
    serialNumber: string;
    status: string | null;
    lastSeenAt: string | null;
    online: boolean;
    propertyId: string | null;
}
