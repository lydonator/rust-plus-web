DO $$ BEGIN
  CREATE TYPE device_type AS ENUM ('switch', 'alarm', 'storage_monitor');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS smart_devices (
  id uuid default gen_random_uuid() primary key,
  server_id uuid references servers(id) on delete cascade not null,
  entity_id integer not null,
  type device_type not null,
  name text not null,
  value integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(server_id, entity_id)
);

-- Add RLS policies
alter table smart_devices enable row level security;

create policy "Users can view devices for their servers"
  on smart_devices for select
  using (
    exists (
      select 1 from servers
      where servers.id = smart_devices.server_id
      and servers.user_id = auth.uid()
    )
  );

create policy "Users can insert devices for their servers"
  on smart_devices for insert
  with check (
    exists (
      select 1 from servers
      where servers.id = smart_devices.server_id
      and servers.user_id = auth.uid()
    )
  );

create policy "Users can update devices for their servers"
  on smart_devices for update
  using (
    exists (
      select 1 from servers
      where servers.id = smart_devices.server_id
      and servers.user_id = auth.uid()
    )
  );

create policy "Users can delete devices for their servers"
  on smart_devices for delete
  using (
    exists (
      select 1 from servers
      where servers.id = smart_devices.server_id
      and servers.user_id = auth.uid()
    )
  );
