-- ConstantQuest — migration 2: daily streaks + speed runs
--
-- Only run this if you already ran supabase-schema.sql BEFORE this
-- update (i.e. your project is missing the current_streak /
-- longest_streak / last_practice_date columns and the speedruns
-- table). If you're setting up a brand new project, just run the
-- current supabase-schema.sql instead — it already includes this.
--
-- Run once in your Supabase project's SQL Editor.

alter table public.profiles add column if not exists current_streak int not null default 0;
alter table public.profiles add column if not exists longest_streak int not null default 0;
alter table public.profiles add column if not exists last_practice_date date;

create table if not exists public.speedruns (
  user_id uuid not null references auth.users(id) on delete cascade,
  constant_id text not null,
  time_limit int not null,
  best_streak int not null default 0,
  best_cpm numeric not null default 0,
  attempts int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, constant_id, time_limit)
);

alter table public.speedruns enable row level security;

create policy "Speedruns are viewable by everyone"
  on public.speedruns for select
  using (true);

create policy "Users can insert their own speedruns"
  on public.speedruns for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own speedruns"
  on public.speedruns for update
  using (auth.uid() = user_id);
