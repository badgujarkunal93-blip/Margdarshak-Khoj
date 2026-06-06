create table if not exists public.shortlists (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  college_id uuid not null references public.colleges(id) on delete cascade,
  branch text not null,
  priority_order integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, college_id, branch)
);

alter table public.students
  add column if not exists updated_at timestamptz not null default now();

alter table public.shortlists
  add column if not exists updated_at timestamptz not null default now();

create index if not exists shortlists_student_id_idx on public.shortlists(student_id);
create index if not exists shortlists_priority_idx on public.shortlists(student_id, priority_order);

alter table public.shortlists enable row level security;

create policy "Students can read own shortlist"
  on public.shortlists for select
  to authenticated
  using (auth.uid() = student_id);

create policy "Students can insert own shortlist"
  on public.shortlists for insert
  to authenticated
  with check (auth.uid() = student_id);

create policy "Students can update own shortlist"
  on public.shortlists for update
  to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

create policy "Students can delete own shortlist"
  on public.shortlists for delete
  to authenticated
  using (auth.uid() = student_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_shortlists_updated_at on public.shortlists;

create trigger touch_shortlists_updated_at
  before update on public.shortlists
  for each row execute function public.touch_updated_at();
