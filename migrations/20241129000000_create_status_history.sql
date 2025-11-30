-- Create status_history table
create table if not exists status_history (
  id uuid default gen_random_uuid() primary key,
  service_name text not null check (service_name in ('web_app', 'cloud_shim')),
  status text not null check (status in ('operational', 'degraded', 'down')),
  response_time_ms integer,
  checked_at timestamp with time zone default timezone('utc'::text, now()) not null,
  metadata jsonb default '{}'::jsonb
);

-- Create indexes for efficient querying
create index if not exists idx_status_history_service_time 
  on status_history (service_name, checked_at desc);

create index if not exists idx_status_history_checked_at 
  on status_history (checked_at desc);

-- Enable RLS
alter table status_history enable row level security;

-- Allow public read access (for status page)
create policy "Allow public read access"
  on status_history for select
  using (true);

-- Allow service role write access (for monitor worker)
create policy "Allow service role insert"
  on status_history for insert
  with check (true);

-- Comment
comment on table status_history is 'Historical health status of system components';
