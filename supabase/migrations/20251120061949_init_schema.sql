-- Create users table
create table public.users (
  id uuid default gen_random_uuid() primary key,
  steam_id text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create servers table
create table public.servers (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) not null,
  ip text not null,
  port integer not null,
  player_id text not null,
  player_token text not null,
  name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.users enable row level security;
alter table public.servers enable row level security;

-- Policies
create policy "Users can view their own data" on public.users
  for select using (auth.uid() = id);

create policy "Users can view their own servers" on public.servers
  for select using (auth.uid() = user_id);

-- Server Info Table
create table public.server_info (
  id uuid default gen_random_uuid() primary key,
  server_id uuid references public.servers(id) on delete cascade not null,
  name text,
  header_image text,
  url text,
  map text,
  map_size integer,
  wipe_time timestamp with time zone,
  players integer,
  max_players integer,
  queued_players integer,
  seed integer,
  salt integer,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(server_id)
);

-- Enable RLS
alter table public.server_info enable row level security;

-- Policies
create policy "Users can view their own server info" on public.server_info
  for select using (
    exists (
      select 1 from public.servers
      where servers.id = server_info.server_id
      and servers.user_id = auth.uid()
    )
  );
