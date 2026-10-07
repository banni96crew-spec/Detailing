select public.admin_publish_tenant($json$
{
  "version":1,"slug":"graphite","status":"preview","timezone":"Europe/Moscow",
  "brand":{"name":"GRAPHITE Detailing","shortName":"GRAPHITE","description":"Спокойный детейлинг без конвейера: фиксируем состояние автомобиля, согласуем работы и показываем результат.","accent":"#4690FF","logo":"images/logo.svg","hero":"images/hero.svg"},
  "contact":{"phone":"+7 900 000-00-01","address":"Москва, Береговой проезд, 5","directionsUrl":"https://yandex.ru/maps/?text=Москва%2C%20Береговой%20проезд%2C%205"},
  "booking":{"slotIntervalMinutes":30,"minimumLeadMinutes":120,"horizonDays":45,"cancellationHours":12},
  "hours":[{"weekday":0,"closed":false,"opensAt":"10:00","lastArrivalAt":"18:00"},{"weekday":1,"closed":false,"opensAt":"09:00","lastArrivalAt":"20:00"},{"weekday":2,"closed":false,"opensAt":"09:00","lastArrivalAt":"20:00"},{"weekday":3,"closed":false,"opensAt":"09:00","lastArrivalAt":"20:00"},{"weekday":4,"closed":false,"opensAt":"09:00","lastArrivalAt":"20:00"},{"weekday":5,"closed":false,"opensAt":"09:00","lastArrivalAt":"20:00"},{"weekday":6,"closed":false,"opensAt":"10:00","lastArrivalAt":"18:00"}],
  "resources":[{"key":"detailing-bay-1","name":"Детейлинг-бокс 1","kind":"bay"},{"key":"detailing-bay-2","name":"Детейлинг-бокс 2","kind":"bay"}],
  "services":[{"key":"deep-wash","name":"Детейлинг-мойка","description":"Тщательная мойка кузова, дисков, проёмов и безопасная сушка.","priceCents":650000,"durationMinutes":180,"bufferMinutes":30,"resourceKeys":["detailing-bay-1","detailing-bay-2"],"featured":true},{"key":"polishing","name":"Восстановительная полировка","description":"Диагностика лака и поэтапная полировка с контролем толщины покрытия.","priceCents":2800000,"durationMinutes":720,"bufferMinutes":60,"resourceKeys":["detailing-bay-1","detailing-bay-2"],"featured":true},{"key":"ceramic","name":"Керамическая защита","description":"Подготовка кузова и нанесение защитного состава с выдержкой в боксе.","priceCents":4200000,"durationMinutes":2160,"bufferMinutes":120,"resourceKeys":["detailing-bay-1"],"featured":true}],
  "infoCards":[{"key":"inspection","title":"Осмотр до начала","text":"Фиксируем состояние кузова и заранее согласуем каждую дополнительную работу."},{"key":"materials","title":"Проверенные составы","text":"Подбираем химию и защиту под покрытие, состояние и режим эксплуатации."},{"key":"result","title":"Результат в деталях","text":"Показываем выполненные этапы и даём понятные рекомендации по уходу."}],
  "gallery":[{"key":"graphite-coupe","image":"images/work-1.svg","caption":"Полировка и защита тёмного кузова"},{"key":"graphite-suv","image":"images/work-2.svg","caption":"Комплексная подготовка внедорожника"},{"key":"graphite-interior","image":"images/work-3.svg","caption":"Бережная работа с салоном"}],
  "pwa":{"name":"GRAPHITE Detailing — запись","shortName":"GRAPHITE","description":"Услуги, свободное время и запись в GRAPHITE Detailing"},
  "assets":{"logo":"/generated/graphite/icon-192.png","hero":"/generated/graphite/assets/hero.webp","appleTouchIcon":"/generated/graphite/apple-touch-icon.png","icon192":"/generated/graphite/icon-192.png","icon512":"/generated/graphite/icon-512.png","maskable512":"/generated/graphite/icon-maskable-512.png","gallery":[{"key":"graphite-coupe","image":"/generated/graphite/assets/gallery-1.webp","caption":"Полировка и защита тёмного кузова"},{"key":"graphite-suv","image":"/generated/graphite/assets/gallery-2.webp","caption":"Комплексная подготовка внедорожника"},{"key":"graphite-interior","image":"/generated/graphite/assets/gallery-3.webp","caption":"Бережная работа с салоном"}]}
}
$json$::jsonb, false);

select public.admin_publish_tenant($json$
{
  "version":1,"slug":"ember-garage","status":"preview","timezone":"Asia/Yekaterinburg",
  "brand":{"name":"EMBER Garage","shortName":"EMBER","description":"Городской автосервис для понятного обслуживания: диагностика, регламентные работы и честный статус ремонта.","accent":"#FF6B35","logo":"images/logo.svg","hero":"images/hero.svg"},
  "contact":{"phone":"+7 900 000-00-02","address":"Екатеринбург, улица Монтажников, 24","directionsUrl":"https://yandex.ru/maps/?text=Екатеринбург%2C%20улица%20Монтажников%2C%2024"},
  "booking":{"slotIntervalMinutes":30,"minimumLeadMinutes":60,"horizonDays":30,"cancellationHours":6},
  "hours":[{"weekday":0,"closed":true},{"weekday":1,"closed":false,"opensAt":"08:00","lastArrivalAt":"19:00"},{"weekday":2,"closed":false,"opensAt":"08:00","lastArrivalAt":"19:00"},{"weekday":3,"closed":false,"opensAt":"08:00","lastArrivalAt":"19:00"},{"weekday":4,"closed":false,"opensAt":"08:00","lastArrivalAt":"19:00"},{"weekday":5,"closed":false,"opensAt":"08:00","lastArrivalAt":"19:00"},{"weekday":6,"closed":false,"opensAt":"09:00","lastArrivalAt":"16:00"}],
  "resources":[{"key":"lift-1","name":"Подъёмник 1","kind":"lift"},{"key":"lift-2","name":"Подъёмник 2","kind":"lift"},{"key":"diagnostic-bay","name":"Диагностический пост","kind":"bay"}],
  "services":[{"key":"diagnostics","name":"Компьютерная диагностика","description":"Считывание ошибок, проверка параметров и понятное заключение мастера.","priceCents":250000,"durationMinutes":60,"bufferMinutes":15,"resourceKeys":["diagnostic-bay"],"featured":true},{"key":"oil-service","name":"Замена масла и фильтров","description":"Регламентная замена с проверкой уровней и состояния расходных материалов.","priceCents":450000,"durationMinutes":90,"bufferMinutes":15,"resourceKeys":["lift-1","lift-2"],"featured":true},{"key":"brake-service","name":"Обслуживание тормозов","description":"Осмотр, очистка и замена согласованных элементов тормозной системы.","priceCents":900000,"durationMinutes":180,"bufferMinutes":30,"resourceKeys":["lift-1","lift-2"],"featured":false}],
  "infoCards":[{"key":"estimate","title":"Смета до ремонта","text":"Сначала диагностика и согласование, затем работы без неожиданных пунктов."},{"key":"parts","title":"Выбор запчастей","text":"Предлагаем варианты по бюджету и объясняем разницу в ресурсе."},{"key":"status","title":"Статус без звонков","text":"Владелец отмечает приёмку и готовность автомобиля прямо в записи."}],
  "gallery":[{"key":"ember-lift","image":"images/work-1.svg","caption":"Проверка автомобиля на подъёмнике"},{"key":"ember-diagnostics","image":"images/work-2.svg","caption":"Диагностика электронных систем"},{"key":"ember-brakes","image":"images/work-3.svg","caption":"Обслуживание тормозных механизмов"}],
  "pwa":{"name":"EMBER Garage — запись","shortName":"EMBER","description":"Онлайн-запись и статус обслуживания в EMBER Garage"},
  "assets":{"logo":"/generated/ember-garage/icon-192.png","hero":"/generated/ember-garage/assets/hero.webp","appleTouchIcon":"/generated/ember-garage/apple-touch-icon.png","icon192":"/generated/ember-garage/icon-192.png","icon512":"/generated/ember-garage/icon-512.png","maskable512":"/generated/ember-garage/icon-maskable-512.png","gallery":[{"key":"ember-lift","image":"/generated/ember-garage/assets/gallery-1.webp","caption":"Проверка автомобиля на подъёмнике"},{"key":"ember-diagnostics","image":"/generated/ember-garage/assets/gallery-2.webp","caption":"Диагностика электронных систем"},{"key":"ember-brakes","image":"/generated/ember-garage/assets/gallery-3.webp","caption":"Обслуживание тормозных механизмов"}]}
}
$json$::jsonb, false);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'graphite.owner@example.test', extensions.crypt('DemoGraphite!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'ember.owner@example.test', extensions.crypt('DemoEmber!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'graphite.owner@example.test', '11111111-1111-4111-8111-111111111111', '{"sub":"11111111-1111-4111-8111-111111111111","email":"graphite.owner@example.test","email_verified":true}', 'email', now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'ember.owner@example.test', '22222222-2222-4222-8222-222222222222', '{"sub":"22222222-2222-4222-8222-222222222222","email":"ember.owner@example.test","email_verified":true}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into public.tenant_members (tenant_id, user_id, role)
select id, '11111111-1111-4111-8111-111111111111', 'owner' from public.tenants where slug = 'graphite'
on conflict do nothing;
insert into public.tenant_members (tenant_id, user_id, role)
select id, '22222222-2222-4222-8222-222222222222', 'owner' from public.tenants where slug = 'ember-garage'
on conflict do nothing;
