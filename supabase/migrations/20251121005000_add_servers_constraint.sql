-- Add unique constraint to servers table to allow upserting
ALTER TABLE public.servers ADD CONSTRAINT servers_ip_port_player_id_key UNIQUE (ip, port, player_id);
