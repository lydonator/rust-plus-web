export interface SmartDevice {
    id: string;
    server_id: string;
    entity_id: number;
    type: 'switch' | 'alarm' | 'storage_monitor';
    name: string;
    value: number;
    created_at: string;
    updated_at: string;
}
