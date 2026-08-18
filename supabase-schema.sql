-- ConstantQuest — Supabase schema
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- This creates: user profiles (with unique usernames), per-constant
-- quiz progress, friendships, and a leaderboard view — all with Row
-- Level Security so users can only write their own data.

-- ---------------------------------------------------------------
-- profiles: public username tied to the private auth.users account
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (
    char_length(username) between 3 and 20
    and username ~ '^[A-Za-z0-9_]+$'
  ),
  created_at timestamptz not null default now()
);

-- case-insensitive uniqueness ("Alice" and "alice" can't both exist)
create unique index profiles_username_lower_idx on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------
-- progress: best streak per user, per constant, per difficulty
-- ---------------------------------------------------------------
create table public.progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  constant_id text not null,
  difficulty_id text not null,
  best_streak int not null default 0,
  perfect boolean not null default false,
  attempts int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, constant_id, difficulty_id)
);

alter table public.progress enable row level security;

-- readable by everyone so leaderboards (friends + global) can be built
create policy "Progress is viewable by everyone"
  on public.progress for select
  using (true);

create policy "Users can insert their own progress"
  on public.progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on public.progress for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- friendships: a request/accept model
-- ---------------------------------------------------------------
create table public.friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint no_self_friend check (requester_id <> addressee_id),
  constraint unique_pair unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

create policy "Users can view their own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can send friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "Addressee can respond to a request"
  on public.friendships for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

create policy "Either side can remove a friendship"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ---------------------------------------------------------------
-- leaderboard_entries: progress joined with usernames, for reading
-- ---------------------------------------------------------------
create view public.leaderboard_entries as
select
  p.user_id,
  pr.username,
  p.constant_id,
  p.difficulty_id,
  p.best_streak,
  p.perfect,
  p.attempts,
  p.updated_at
from public.progress p
join public.profiles pr on pr.id = p.user_id;
