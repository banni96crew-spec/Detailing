begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_table('public', 'resource_occupancies', 'Единая таблица занятости существует');
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.resource_occupancies'::regclass and contype = 'x'),
  'На занятости есть EXCLUDE-ограничение'
);

create temporary table test_context as
with tenant as (
  select t.id, t.timezone, d.local_date, wh.opens_at
  from public.tenants t
  cross join lateral (
    select candidate::date as local_date
    from generate_series(
      (now() at time zone t.timezone)::date + 2,
      (now() at time zone t.timezone)::date + 14,
      interval '1 day'
    ) candidate
    join public.working_hours wh2 on wh2.tenant_id = t.id and wh2.weekday = extract(dow from candidate)::smallint and not wh2.closed
    order by candidate
    limit 1
  ) d
  join public.working_hours wh on wh.tenant_id = t.id and wh.weekday = extract(dow from d.local_date)::smallint
  where t.slug = 'graphite'
)
select id as tenant_id,
       (local_date + opens_at) at time zone timezone as start_at,
       (local_date + 7 + opens_at) at time zone timezone as ceramic_start
from tenant;

create temporary table test_bookings (label text primary key, booking_id uuid, starts_at timestamptz);

with made as (
  select public.server_create_booking(
    'graphite', 'deep-wash', (select start_at from test_context), 'Иван Тестов', '+79990000001',
    'Тестовый автомобиль 1', '', repeat('a', 64), '00000000-0000-4000-8000-000000000001', repeat('1', 64)
  ) result
)
insert into test_bookings select 'first', (result ->> 'bookingId')::uuid, (result ->> 'startsAt')::timestamptz from made;

with made as (
  select public.server_create_booking(
    'graphite', 'deep-wash', (select start_at from test_context), 'Пётр Тестов', '+79990000002',
    'Тестовый автомобиль 2', '', repeat('b', 64), '00000000-0000-4000-8000-000000000002', repeat('2', 64)
  ) result
)
insert into test_bookings select 'second', (result ->> 'bookingId')::uuid, (result ->> 'startsAt')::timestamptz from made;

select isnt(
  (select booking_id from test_bookings where label = 'first'),
  (select booking_id from test_bookings where label = 'second'),
  'Два ресурса принимают две одновременные записи'
);

select is(
  (public.server_create_booking(
    'graphite', 'deep-wash', (select start_at from test_context), 'Иван Тестов', '+79990000001',
    'Тестовый автомобиль 1', '', repeat('a', 64), '00000000-0000-4000-8000-000000000001', repeat('1', 64)
  ) ->> 'bookingId')::uuid,
  (select booking_id from test_bookings where label = 'first'),
  'Повтор с тем же ключом возвращает ту же запись'
);

select throws_ok(
  $$select public.server_create_booking(
    'graphite', 'deep-wash', (select start_at from test_context), 'Третий Клиент', '+79990000003',
    'Тестовый автомобиль 3', '', repeat('c', 64), '00000000-0000-4000-8000-000000000003', repeat('3', 64)
  )$$,
  '23P01', 'Выбранное время уже занято', 'Третья конкурентная запись отклоняется'
);

select is(
  (select count(*)::integer from public.resource_occupancies ro join test_bookings tb on tb.booking_id = ro.booking_id where ro.released_at is null),
  2,
  'На два успешных бронирования создано ровно две занятости'
);

with made as (
  select public.server_create_booking(
    'graphite', 'ceramic', (select ceramic_start from test_context), 'Анна Тестова', '+79990000004',
    'Тестовый автомобиль 4', '', repeat('d', 64), '00000000-0000-4000-8000-000000000004', repeat('4', 64)
  ) result
)
insert into test_bookings select 'ceramic', (result ->> 'bookingId')::uuid, (result ->> 'startsAt')::timestamptz from made;

select is(
  (select upper(occupied_range) - lower(occupied_range) from public.resource_occupancies where booking_id = (select booking_id from test_bookings where label = 'ceramic')),
  interval '38 hours',
  'Многодневная услуга занимает длительность вместе с буфером'
);

select throws_ok(
  $$with target as (
      select b.tenant_id, b.resource_id, b.starts_at, b.buffer_ends_at
      from public.bookings b where b.id = (select booking_id from test_bookings where label = 'ceramic')
    ), block as (
      insert into public.resource_blocks (tenant_id, resource_id, blocked_range, label, idempotency_key, created_by)
      select tenant_id, resource_id, tstzrange(starts_at, buffer_ends_at, '[)'), 'Конфликт', '00000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111' from target
      returning *
    )
    insert into public.resource_occupancies (tenant_id, resource_id, block_id, kind, occupied_range)
    select tenant_id, resource_id, id, 'block', blocked_range from block$$,
  '23P01', null, 'Блокировка поста конфликтует с записью тем же EXCLUDE'
);

with target as (
  select tc.tenant_id, r.id as resource_id, tc.ceramic_start
  from test_context tc
  join public.resources r on r.tenant_id = tc.tenant_id and r.resource_key = 'detailing-bay-2'
), made as (
  insert into public.resource_blocks (tenant_id, resource_id, blocked_range, label, idempotency_key, created_by)
  select tenant_id, resource_id, tstzrange(ceramic_start, ceramic_start + interval '38 hours', '[)'), 'Плановые работы',
         '00000000-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111'
  from target returning *
)
insert into public.resource_occupancies (tenant_id, resource_id, block_id, kind, occupied_range)
select tenant_id, resource_id, id, 'block', blocked_range from made;

select throws_ok(
  $$select private.reschedule_booking(
    (select tenant_id from test_context),
    (select booking_id from test_bookings where label = 'first'),
    (select ceramic_start from test_context),
    '00000000-0000-4000-8000-000000000006', repeat('6', 64), 'test_reschedule'
  )$$,
  '23P01', 'Новое время уже занято', 'Перенос на занятый единственный ресурс отклоняется'
);

select is(
  (select starts_at from public.bookings where id = (select booking_id from test_bookings where label = 'first')),
  (select start_at from test_context),
  'Неудачный перенос сохраняет исходное время'
);

update public.services set current_price_cents = current_price_cents + 10000
where tenant_id = (select tenant_id from test_context) and service_key = 'deep-wash';
select is(
  (select price_cents_snapshot from public.bookings where id = (select booking_id from test_bookings where label = 'first')),
  650000,
  'Историческая цена записи не меняется вместе с прайсом'
);

insert into public.payments (tenant_id, booking_id, kind, amount_cents, received_at, idempotency_key, created_by)
values
  ((select tenant_id from test_context), (select booking_id from test_bookings where label = 'first'), 'payment', 500000, now(), '00000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111'),
  ((select tenant_id from test_context), (select booking_id from test_bookings where label = 'first'), 'refund', 125000, now(), '00000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111');

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is(
  (public.owner_dashboard_stats('graphite', (now() at time zone 'Europe/Moscow')::date, (now() at time zone 'Europe/Moscow')::date) ->> 'receivedCents')::integer,
  375000,
  'Статистика считает оплаты за вычетом возвратов'
);

select ok(not has_table_privilege('anon', 'public.bookings', 'SELECT'), 'anon не имеет прямого доступа к персональным записям');
select ok(not has_function_privilege('anon', 'public.owner_bookings(text,date,date)', 'EXECUTE'), 'Клиент не может вызвать инструмент владельца');
select ok(not has_function_privilege('authenticated', 'public.server_create_booking(text,text,timestamptz,text,text,text,text,text,uuid,text)', 'EXECUTE'), 'Клиент и владелец не вызывают серверную функцию с сервисным ключом');

set local role authenticated;
select is((select count(distinct tenant_id)::integer from public.bookings), 1, 'RLS показывает владельцу записи только одной студии');
reset role;

update public.tenants set status = 'live' where id = (select tenant_id from test_context);
select private.enqueue_booking_job((select tenant_id from test_context), (select booking_id from test_bookings where label = 'first'), 'dedupe_test', now(), 'same');
select private.enqueue_booking_job((select tenant_id from test_context), (select booking_id from test_bookings where label = 'first'), 'dedupe_test', now(), 'same');
select is(
  (select count(*)::integer from public.notification_jobs where booking_id = (select booking_id from test_bookings where label = 'first') and event_type = 'dedupe_test'),
  1,
  'Outbox дедуплицирует одинаковое событие'
);

select is(
  (select count(*)::integer from public.notification_jobs nj join public.bookings b on b.id = nj.booking_id where b.is_demo),
  0,
  'Демонстрационные записи не создают реальные уведомления'
);

select is(public.server_consume_counter('test-limit', repeat('f', 64), 2, 60, 1), 1, 'Атомарный счётчик принимает первый запрос');
select is(public.server_consume_counter('test-limit', repeat('f', 64), 2, 60, 1), 2, 'Атомарный счётчик принимает запрос в пределах лимита');
select throws_ok(
  $$select public.server_consume_counter('test-limit', repeat('f', 64), 2, 60, 1)$$,
  'P0001', 'Превышен допустимый предел запросов', 'Атомарный счётчик отклоняет превышение'
);

select * from finish();
rollback;
