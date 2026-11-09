create schema if not exists barberflow_private;
revoke all on schema barberflow_private from public, anon, authenticated;
create table barberflow_private.master_account (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
revoke all on barberflow_private.master_account from public, anon, authenticated;

insert into barberflow_private.master_account (user_id)
select id from auth.users
where lower(email) = 'jorgericardosalgado@gmail.com' and email_confirmed_at is not null
order by created_at limit 1;

create function public.barberflow_is_master() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from barberflow_private.master_account m join auth.users u on u.id=m.user_id
    where m.user_id=(select auth.uid()) and lower(u.email)='jorgericardosalgado@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.barberflow_is_master() from public, anon;
grant execute on function public.barberflow_is_master() to authenticated;

create table public.barberflow_landing_blocks (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('hero','segmentos','funcionalidades','estoque','duvidas')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null default '' check (char_length(body) <= 1200),
  image_url text not null default '' check (char_length(image_url) <= 1500),
  image_alt text not null default '' check (char_length(image_alt) <= 240),
  position integer not null default 0 check (position between 0 and 9999),
  published boolean not null default true
);

alter table public.barberflow_landing_blocks enable row level security;
revoke all on public.barberflow_landing_blocks from public, anon, authenticated;
grant select on public.barberflow_landing_blocks to anon, authenticated;
grant insert, update, delete on public.barberflow_landing_blocks to authenticated;
create policy "Read published content" on public.barberflow_landing_blocks
  for select to anon, authenticated using (published);
create policy "Master manages landing" on public.barberflow_landing_blocks
  for all to authenticated using ((select public.barberflow_is_master()))
  with check ((select public.barberflow_is_master()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('barberflow-landing', 'barberflow-landing', true, 950000, array['image/jpeg','image/png','image/webp','image/avif']);
create policy "Master uploads landing media" on storage.objects
  for insert to authenticated with check (bucket_id='barberflow-landing' and (select public.barberflow_is_master()));
create policy "Master reads landing media metadata" on storage.objects
  for select to authenticated using (bucket_id='barberflow-landing' and (select public.barberflow_is_master()));

insert into public.barberflow_landing_blocks(section,title,body,image_url,image_alt,position) values
('hero','Mais tempo para atender. Mais controle para crescer.','Agenda e gestão para profissionais, equipes e negócios de beleza e bem-estar.','/media/salao-editorial.webp','Profissional atendendo uma cliente em um salão',10),
('segmentos','Cabeleireiros','','','',10),
('segmentos','Barbearias','','','',20),
('segmentos','Esmalterias','','','',30),
('segmentos','Estética','','','',40),
('segmentos','Manicure e pedicure','','','',50),
('segmentos','Trancistas','','','',60),
('segmentos','Massoterapia','','','',70),
('segmentos','Estúdios de tatuagem e piercing','','','',80),
('segmentos','Clínicas de bronzeamento','','','',90),
('funcionalidades','Agenda online','Horários por profissional e agendamento pelo cliente.','','',10),
('funcionalidades','Equipe e serviços','Organize horários, folgas, preços, durações e permissões.','','',20),
('funcionalidades','Página do negócio','Apresente seus serviços, profissionais e horários em um endereço próprio.','','',30),
('funcionalidades','Marketplace','Ajude clientes a encontrar profissionais de beleza e bem-estar na sua cidade.','','',40),
('funcionalidades','Gestão de clientes','Consulte o histórico de atendimento e acompanhe os retornos.','','',50),
('funcionalidades','Financeiro','Acompanhe receitas, comissões e serviços mais procurados.','','',60),
('funcionalidades','Fidelidade','Defina quais atendimentos contam e o benefício ao atingir a meta.','','',70),
('estoque','Serviços e produtos na mesma comanda','Em desenvolvimento. Inclua produtos vendidos durante o atendimento e reúna tudo em uma única cobrança.','/media/produtos-editorial.webp','Produtos de cuidado pessoal em uma bancada',10),
('duvidas','Como é feito o agendamento?','O cliente escolhe serviço, profissional e horário pela página do negócio.','','',10),
('duvidas','Onde o cliente paga pelo atendimento?','O pagamento é feito diretamente ao estabelecimento ou profissional responsável pelo serviço.','','',20),
('duvidas','A assinatura cobre quantos estabelecimentos?','Cada assinatura corresponde a um estabelecimento.','','',30);
