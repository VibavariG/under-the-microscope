-- Under the Microscope — Supabase schema.
-- Run this once in your Supabase project's SQL Editor (Dashboard →
-- SQL Editor → New query → paste this whole file → Run).

create table if not exists categories (
  name       text primary key,
  sort_order integer not null default 0
);

create table if not exists posts (
  slug        text primary key,
  title       text not null,
  date        date not null,
  category    text, -- intentionally no foreign key: removing a category
                     -- from the list shouldn't blank it out on posts that
                     -- already used it — the admin UI keeps it visible on
                     -- the entry itself, just drops it from the filter bar
  tags        text[] not null default '{}',
  excerpt     text not null default '',
  body_md     text not null default '',
  body_html   text not null default '',
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists posts_status_date_idx on posts (status, date desc);

-- Keeps updated_at current on every edit without the client having to
-- remember to set it.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists posts_set_updated_at on posts;
create trigger posts_set_updated_at
  before update on posts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security — this is what replaces a hand-written auth
-- middleware entirely. "anon" = anyone visiting the public site with no
-- login. "authenticated" = you, once logged in via the admin tool (the
-- only account is the one you create by hand in Authentication → Users
-- — there's no public sign-up, so "authenticated" effectively just
-- means "you").
-- ---------------------------------------------------------------------

alter table posts enable row level security;
alter table categories enable row level security;

-- Visitors can read published posts only.
create policy "public read published posts" on posts
  for select to anon
  using (status = 'published');

-- Once logged in, you can read everything (drafts included) and make
-- any change.
create policy "admin read all posts" on posts
  for select to authenticated using (true);
create policy "admin write posts" on posts
  for insert to authenticated with check (true);
create policy "admin update posts" on posts
  for update to authenticated using (true) with check (true);
create policy "admin delete posts" on posts
  for delete to authenticated using (true);

-- Categories are plain reference data — safe for anyone to read (the
-- public filter bar needs it), only you can change the list.
create policy "public read categories" on categories
  for select to anon using (true);
create policy "admin read categories" on categories
  for select to authenticated using (true);
create policy "admin write categories" on categories
  for all to authenticated using (true) with check (true);

-- Starter categories — safe to re-run (ON CONFLICT DO NOTHING), edit
-- this list before running if you want different defaults.
insert into categories (name, sort_order) values
  ('Systems', 0), ('Backend', 1), ('AI', 2), ('Biology', 3), ('Book Notes', 4), ('Career', 5)
on conflict (name) do nothing;
