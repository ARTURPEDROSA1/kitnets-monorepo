export interface MeterConfig {
    meter_id: string;
    display_name: string;
    pulse_volume_liters: number;
    counter_lsb_register: number;
    counter_msb_register: number;
    physical_meter_offset_m3: number; // New in v1.2
    enabled: number; // 0 or 1
    updated_at?: string;
}

export interface DailySnapshot {
    id?: number;
    meter_id: string;
    date: string;
    counter_value_end_day: number;
    counter_value_prev_day: number;
    delta_pulses: number;
    daily_liters: number;
    effective_m3?: number; // New in v1.2
    created_at?: string;
}

export interface MonthlyConsumption {
    id?: number;
    meter_id: string;
    year: number;
    month: number;
    monthly_liters: number;
    monthly_m3: number;
    source_days_count: number;
    created_at?: string;
}

export type GatewayHealth = 'HEALTHY' | 'DEGRADED' | 'DOWN';

export interface GatewayStatusPayload {
    event: 'gateway_status';
    status: GatewayHealth;
    gateway_ip: string;
    timestamp: string;
}

export interface LiveMeterPayload {
    meter: string;
    timestamp: string;
    pulse_count: number;
    raw_gateway_m3: number;
    offset_m3: number;
    effective_m3: number;
    daily_liters_so_far: number;
}
