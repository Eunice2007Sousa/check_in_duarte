-- ============================================================================
-- CHECK-IN — Esquema completo para Supabase (Postgres)
-- ============================================================================
-- Como usar:
--   1. Cria um projeto novo em supabase.com (plano Free chega perfeitamente).
--   2. Vai a "SQL Editor" -> "New query", cola este ficheiro inteiro e corre.
--   3. Confirma em "Table Editor" que as tabelas apareceram.
--   4. Guarda o "Project URL" e a "anon public key" (Settings -> API) —
--      vão ser usadas na app (Vercel) para ligar ao Supabase.
--
-- Nota importante sobre segurança:
--   Esta app NÃO usa o sistema de login do Supabase (Auth) — usa o esquema
--   próprio de ID + PIN de 4 dígitos que já tínhamos no protótipo. Por isso,
--   fechamos completamente o acesso direto às tabelas (nem sequer leitura) e
--   TODO o acesso da app passa exclusivamente pelas funções abaixo. Cada
--   função sensível volta a confirmar o ID+PIN (ou o PIN do Duarte) lá
--   dentro, na base de dados — nunca confiamos apenas no que o browser diz.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSÕES
-- ============================================================================
create extension if not exists pgcrypto;   -- para gen_random_uuid()


-- ============================================================================
-- 2. TABELAS
-- ============================================================================

-- Definições gerais (uma única linha) — PIN do Duarte.
create table if not exists settings (
  id smallint primary key default 1,
  owner_pin text not null default '0000',
  constraint settings_single_row check (id = 1)
);
insert into settings (id, owner_pin) values (1, '0000')
  on conflict (id) do nothing;

-- Sequência do ID incremental dos atletas.
-- Ajusta o "start with" consoante o último ID já usado (ex: se o último
-- atleta existente tem o ID 365, deixa em 366; se estás a começar do zero,
-- muda para "start with 1").
create sequence if not exists atleta_numero_seq start with 366;

create table if not exists atletas (
  id uuid primary key default gen_random_uuid(),
  numero_id integer not null unique default nextval('atleta_numero_seq'),
  nome text not null,
  codigo text not null unique check (codigo ~ '^[0-9]{4}$'),
  pack_total integer not null default 4 check (pack_total > 0),
  pack_usado integer not null default 0 check (pack_usado >= 0),
  criado_em timestamptz not null default now()
);

-- Turmas semanais fixas (ex: toda a Segunda às 18:00).
create table if not exists turmas (
  id uuid primary key default gen_random_uuid(),
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0=Domingo ... 6=Sábado
  hora time not null,
  capacidade integer not null default 5 check (capacidade > 0)
);

-- Marcações concretas (uma turma, numa data concreta, para um atleta).
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references atletas(id) on delete cascade,
  turma_id uuid not null references turmas(id) on delete cascade,
  data date not null,
  criado_em timestamptz not null default now(),
  unique (atleta_id, turma_id, data)
);
create index if not exists idx_bookings_turma_data on bookings (turma_id, data);
create index if not exists idx_bookings_atleta on bookings (atleta_id);

-- Registo de auditoria: marcações, desmarcações e tentativas bloqueadas.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  atleta_id uuid references atletas(id) on delete set null,
  action text not null check (action in ('marcacao', 'desmarcacao', 'tentativa_bloqueada')),
  detalhe text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_audit_atleta on audit_log (atleta_id, criado_em desc);


-- ============================================================================
-- 3. BLOQUEIO DE ACESSO DIRETO ÀS TABELAS
-- ============================================================================
-- Ninguém lê nem escreve diretamente nestas tabelas a partir do browser —
-- só através das funções (RPC) definidas mais abaixo.
alter table settings  enable row level security;
alter table atletas   enable row level security;
alter table turmas    enable row level security;
alter table bookings  enable row level security;
alter table audit_log enable row level security;

revoke all on settings, atletas, turmas, bookings, audit_log from anon, authenticated;


-- ============================================================================
-- 4. FUNÇÕES AUXILIARES
-- ============================================================================

create or replace function fn_verificar_owner(p_pin text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from settings where id = 1 and owner_pin = p_pin);
$$;


-- ============================================================================
-- 5. LOGIN DO ATLETA (fluxo em dois passos: ID -> nome -> PIN)
-- ============================================================================

-- Passo 1: mostra o nome associado a um ID, sem revelar o código privado.
create or replace function fn_buscar_nome_atleta(p_numero_id integer)
returns table (numero_id integer, nome text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select a.numero_id, a.nome from atletas a where a.numero_id = p_numero_id;
$$;

-- Passo 2: confirma o PIN e devolve os dados necessários ao dashboard.
-- Devolve zero linhas se o ID+PIN não corresponderem.
create or replace function fn_login_atleta(p_numero_id integer, p_codigo text)
returns table (id uuid, numero_id integer, nome text, pack_total integer, pack_usado integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.numero_id, a.nome, a.pack_total, a.pack_usado
  from atletas a
  where a.numero_id = p_numero_id and a.codigo = p_codigo;
$$;


-- ============================================================================
-- 6. TURMAS E MARCAÇÕES (uso pelo atleta)
-- ============================================================================

-- Lista de turmas semanais — pública, é preciso para o atleta ver o horário.
create or replace function fn_listar_turmas()
returns setof turmas
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from turmas order by dia_semana, hora;
$$;

-- As minhas marcações futuras (para "As minhas aulas marcadas").
create or replace function fn_minhas_marcacoes(p_numero_id integer, p_codigo text)
returns table (booking_id uuid, turma_id uuid, dia_semana smallint, hora time, data date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atleta atletas;
begin
  select * into v_atleta from atletas where numero_id = p_numero_id and codigo = p_codigo;
  if not found then
    raise exception 'CREDENCIAIS_INVALIDAS';
  end if;

  return query
    select b.id, t.id, t.dia_semana, t.hora, b.data
    from bookings b
    join turmas t on t.id = b.turma_id
    where b.atleta_id = v_atleta.id
      and b.data >= (now() at time zone 'Europe/Lisbon')::date
    order by b.data, t.hora;
end;
$$;

-- Todas as marcações do atleta (passadas e futuras) — para as estrelinhas no calendário.
create or replace function fn_historico_marcacoes(p_numero_id integer, p_codigo text)
returns table (data date, hora time)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atleta atletas;
begin
  select * into v_atleta from atletas where numero_id = p_numero_id and codigo = p_codigo;
  if not found then
    raise exception 'CREDENCIAIS_INVALIDAS';
  end if;

  return query
    select b.data, t.hora
    from bookings b
    join turmas t on t.id = b.turma_id
    where b.atleta_id = v_atleta.id
    order by b.data desc;
end;
$$;

-- Ocupação de uma turma numa data (para o atleta ver vagas antes de marcar).
create or replace function fn_ocupacao_turma(p_turma_id uuid, p_data date)
returns table (ocupadas integer, capacidade integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::int from bookings where turma_id = p_turma_id and data = p_data),
    (select t.capacidade from turmas t where t.id = p_turma_id);
$$;


-- ----------------------------------------------------------------------------
-- fn_marcar_aula — O "SEMÁFORO": esta é a função que impede overbooking.
-- ----------------------------------------------------------------------------
-- pg_advisory_xact_lock tranca, dentro desta transação, um "cadeado" único
-- para o par (turma, data). Se 3 pedidos chegarem ao mesmo tempo para a
-- MESMA aula, o Postgres põe-nos em fila automaticamente: o 1º tranca, lê a
-- contagem, insere e liberta o cadeado; só aí o 2º continua (já vê a
-- contagem atualizada); depois o 3º. Nunca dois pedidos passam a contagem
-- ao mesmo tempo para a mesma aula — por isso nunca há mais marcações do
-- que vagas, mesmo com muitos telemóveis a tentar ao mesmo tempo.
-- ----------------------------------------------------------------------------
create or replace function fn_marcar_aula(
  p_numero_id integer,
  p_codigo text,
  p_turma_id uuid,
  p_data date
)
returns table (booking_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atleta   atletas;
  v_turma    turmas;
  v_ocupadas integer;
  v_booking_id uuid;
begin
  select * into v_atleta from atletas where numero_id = p_numero_id and codigo = p_codigo;
  if not found then
    raise exception 'CREDENCIAIS_INVALIDAS';
  end if;

  select * into v_turma from turmas where id = p_turma_id;
  if not found then
    raise exception 'TURMA_INEXISTENTE';
  end if;

  -- Não é possível marcar uma aula que já começou/aconteceu (horário de Lisboa).
  if (
    (p_data::text || ' ' || v_turma.hora::text)::timestamp at time zone 'Europe/Lisbon'
  ) <= now() then
    raise exception 'AULA_JA_PASSOU';
  end if;

  -- O semáforo: só um pedido de cada vez para esta turma+data passa daqui para a frente.
  perform pg_advisory_xact_lock(hashtext(p_turma_id::text || p_data::text));

  if (v_atleta.pack_total - v_atleta.pack_usado) <= 0 then
    raise exception 'PACK_ESGOTADO';
  end if;

  if exists (
    select 1 from bookings
    where atleta_id = v_atleta.id and turma_id = p_turma_id and data = p_data
  ) then
    raise exception 'JA_INSCRITO';
  end if;

  select count(*) into v_ocupadas from bookings where turma_id = p_turma_id and data = p_data;
  if v_ocupadas >= v_turma.capacidade then
    raise exception 'TURMA_CHEIA';
  end if;

  insert into bookings (atleta_id, turma_id, data)
  values (v_atleta.id, p_turma_id, p_data)
  returning id into v_booking_id;

  update atletas set pack_usado = pack_usado + 1 where id = v_atleta.id;

  insert into audit_log (atleta_id, action, detalhe)
  values (v_atleta.id, 'marcacao', format('Aula de %s (%s)', v_turma.hora, p_data));

  return query select v_booking_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- fn_desmarcar_aula — regra das 12h, calculada em horário de Lisboa.
-- ----------------------------------------------------------------------------
create or replace function fn_desmarcar_aula(
  p_numero_id integer,
  p_codigo text,
  p_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atleta atletas;
  v_booking bookings;
  v_turma turmas;
  v_aula_ts timestamptz;
  v_horas_restantes numeric;
begin
  select * into v_atleta from atletas where numero_id = p_numero_id and codigo = p_codigo;
  if not found then
    raise exception 'CREDENCIAIS_INVALIDAS';
  end if;

  -- Semáforo por marcação: evita duas desmarcações simultâneas da mesma reserva.
  perform pg_advisory_xact_lock(hashtext(p_booking_id::text));

  select * into v_booking from bookings where id = p_booking_id and atleta_id = v_atleta.id;
  if not found then
    raise exception 'MARCACAO_INEXISTENTE';
  end if;

  select * into v_turma from turmas where id = v_booking.turma_id;

  -- Interpreta data+hora da aula como horário de Lisboa (o Postgres trata o
  -- horário de verão/inverno automaticamente através da tz database).
  v_aula_ts := (v_booking.data::text || ' ' || v_turma.hora::text)::timestamp
               at time zone 'Europe/Lisbon';
  v_horas_restantes := extract(epoch from (v_aula_ts - now())) / 3600.0;

  if v_horas_restantes < 12 then
    insert into audit_log (atleta_id, action, detalhe)
    values (
      v_atleta.id, 'tentativa_bloqueada',
      format('Aula de %s (%s) — faltavam %.1fh', v_turma.hora, v_booking.data, v_horas_restantes)
    );
    raise exception 'MENOS_DE_12H';
  end if;

  delete from bookings where id = v_booking.id;
  update atletas set pack_usado = greatest(0, pack_usado - 1) where id = v_atleta.id;

  insert into audit_log (atleta_id, action, detalhe)
  values (v_atleta.id, 'desmarcacao', format('Aula de %s (%s)', v_turma.hora, v_booking.data));
end;
$$;


-- ============================================================================
-- 7. ÁREA DO DUARTE (todas exigem o PIN do dono)
-- ============================================================================

create or replace function fn_alterar_pin_dono(p_pin_atual text, p_novo_pin text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_verificar_owner(p_pin_atual) then
    raise exception 'PIN_INVALIDO';
  end if;
  if p_novo_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN_FORMATO_INVALIDO';
  end if;
  update settings set owner_pin = p_novo_pin where id = 1;
end;
$$;

create or replace function fn_criar_atleta(
  p_owner_pin text, p_nome text, p_codigo text, p_pack_total integer
)
returns atletas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atleta atletas;
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;
  if p_codigo !~ '^[0-9]{4}$' then
    raise exception 'CODIGO_INVALIDO';
  end if;

  insert into atletas (nome, codigo, pack_total, pack_usado)
  values (trim(p_nome), p_codigo, p_pack_total, 0)
  returning * into v_atleta;

  return v_atleta;
exception
  when unique_violation then
    raise exception 'CODIGO_JA_USADO';
end;
$$;

create or replace function fn_remover_atleta(p_owner_pin text, p_atleta_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;
  delete from atletas where id = p_atleta_id;
end;
$$;

create or replace function fn_atribuir_pack(p_owner_pin text, p_atleta_id uuid, p_pack_total integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;
  update atletas set pack_total = p_pack_total, pack_usado = 0 where id = p_atleta_id;
end;
$$;

create or replace function fn_alterar_codigo_atleta(p_owner_pin text, p_atleta_id uuid, p_novo_codigo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;
  if p_novo_codigo !~ '^[0-9]{4}$' then
    raise exception 'CODIGO_INVALIDO';
  end if;
  update atletas set codigo = p_novo_codigo where id = p_atleta_id;
exception
  when unique_violation then
    raise exception 'CODIGO_JA_USADO';
end;
$$;

-- Lista completa de atletas (inclui o código — só o Duarte vê isto).
create or replace function fn_listar_atletas(p_owner_pin text)
returns setof atletas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;
  return query select * from atletas order by numero_id;
end;
$$;

create or replace function fn_criar_turma(p_owner_pin text, p_dia_semana smallint, p_hora time)
returns turmas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_turma turmas;
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;
  insert into turmas (dia_semana, hora) values (p_dia_semana, p_hora) returning * into v_turma;
  return v_turma;
end;
$$;

create or replace function fn_remover_turma(p_owner_pin text, p_turma_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;
  delete from turmas where id = p_turma_id;
end;
$$;

-- Quem está inscrito numa turma, numa data — devolve "nome" e "numero_id"
-- para a app mostrar "Nome - ID" no calendário do Duarte.
create or replace function fn_ver_inscritos(p_owner_pin text, p_turma_id uuid, p_data date)
returns table (nome text, numero_id integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;

  return query
    select a.nome, a.numero_id
    from bookings b
    join atletas a on a.id = b.atleta_id
    where b.turma_id = p_turma_id and b.data = p_data
    order by a.nome;
end;
$$;

-- Resumo do calendário do Duarte: para cada dia visível, quantas turmas e
-- quantas já têm marcações (para desenhar o pontinho no calendário sem
-- teres de pedir dia a dia).
create or replace function fn_resumo_periodo(p_owner_pin text, p_desde date, p_ate date)
returns table (data date, turma_id uuid, hora time, ocupadas integer, capacidade integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;

  return query
    select d::date as data, t.id, t.hora,
           (select count(*)::int from bookings b where b.turma_id = t.id and b.data = d::date) as ocupadas,
           t.capacidade
    from generate_series(p_desde, p_ate, interval '1 day') as d
    join turmas t on t.dia_semana = extract(dow from d)::smallint
    order by data, t.hora;
end;
$$;

-- Equivalente ao anterior, mas para o atleta usar no seu próprio calendário
-- de marcação — não exige PIN do Duarte porque só revela contagens de vagas
-- (informação não sensível), nunca nomes de outros atletas. Serve para
-- pintar o calendário mensal a verde/vermelho sem fazer uma chamada por dia.
create or replace function fn_disponibilidade_periodo(p_desde date, p_ate date)
returns table (data date, turma_id uuid, hora time, ocupadas integer, capacidade integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  select d::date as data, t.id, t.hora,
         (select count(*)::int from bookings b where b.turma_id = t.id and b.data = d::date) as ocupadas,
         t.capacidade
  from generate_series(p_desde, p_ate, interval '1 day') as d
  join turmas t on t.dia_semana = extract(dow from d)::smallint;
$$;

-- Só para mostrar a dica "o próximo ID será #___" no painel de Atletas.
-- O ID real continua a ser atribuído automaticamente pela sequência ao
-- inserir — isto é só informativo.
create or replace function fn_proximo_numero_id()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select (select last_value from atleta_numero_seq) + 1;
$$;

-- Auditoria: marcações, desmarcações e tentativas bloqueadas do último mês.
create or replace function fn_auditoria_atleta(p_owner_pin text, p_atleta_id uuid)
returns table (action text, detalhe text, criado_em timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_verificar_owner(p_owner_pin) then
    raise exception 'PIN_INVALIDO';
  end if;

  return query
    select l.action, l.detalhe, l.criado_em
    from audit_log l
    where l.atleta_id = p_atleta_id
      and l.criado_em >= now() - interval '1 month'
    order by l.criado_em desc;
end;
$$;


-- ============================================================================
-- 8. PERMISSÕES — só as funções acima são chamáveis a partir da app
-- ============================================================================
revoke execute on all functions in schema public from public;

grant execute on function
  fn_verificar_owner(text),
  fn_buscar_nome_atleta(integer),
  fn_login_atleta(integer, text),
  fn_listar_turmas(),
  fn_minhas_marcacoes(integer, text),
  fn_historico_marcacoes(integer, text),
  fn_ocupacao_turma(uuid, date),
  fn_disponibilidade_periodo(date, date),
  fn_marcar_aula(integer, text, uuid, date),
  fn_desmarcar_aula(integer, text, uuid),
  fn_alterar_pin_dono(text, text),
  fn_criar_atleta(text, text, text, integer),
  fn_remover_atleta(text, uuid),
  fn_atribuir_pack(text, uuid, integer),
  fn_alterar_codigo_atleta(text, uuid, text),
  fn_listar_atletas(text),
  fn_proximo_numero_id(),
  fn_criar_turma(text, smallint, time),
  fn_remover_turma(text, uuid),
  fn_ver_inscritos(text, uuid, date),
  fn_resumo_periodo(text, date, date),
  fn_auditoria_atleta(text, uuid)
to anon, authenticated;


-- ============================================================================
-- 9. DADOS DE EXEMPLO (opcional — apaga este bloco se não quiseres dados de teste)
-- ============================================================================
insert into atletas (numero_id, nome, codigo, pack_total, pack_usado) values
  (363, 'Ana Costa', '1010', 8, 2),
  (364, 'Bruno Ferreira', '2020', 4, 4),
  (365, 'Carla Santos', '3030', 12, 0)
on conflict (numero_id) do nothing;

insert into turmas (dia_semana, hora, capacidade) values
  (1, '18:00', 5),
  (1, '19:00', 5),
  (3, '18:00', 5),
  (5, '09:00', 5)
on conflict do nothing;


-- ============================================================================
-- 10. CÓDIGOS DE ERRO QUE A APP DEVE TRATAR (em error.message do supabase-js)
-- ============================================================================
-- CREDENCIAIS_INVALIDAS   -> ID ou PIN errados
-- TURMA_INEXISTENTE       -> turma_id não existe
-- AULA_JA_PASSOU          -> a aula já começou/aconteceu, não é possível marcar
-- PACK_ESGOTADO           -> atleta sem treinos disponíveis no pack
-- JA_INSCRITO             -> já estava inscrito nesta aula
-- TURMA_CHEIA             -> as vagas já estão todas ocupadas
-- MARCACAO_INEXISTENTE    -> booking_id não pertence a este atleta
-- MENOS_DE_12H            -> tentativa de desmarcar a menos de 12h da aula
-- PIN_INVALIDO            -> PIN do Duarte incorreto
-- CODIGO_INVALIDO         -> código do atleta não tem 4 dígitos
-- CODIGO_JA_USADO         -> código já pertence a outro atleta
-- PIN_FORMATO_INVALIDO    -> novo PIN do Duarte não tem 4 dígitos
-- ============================================================================
