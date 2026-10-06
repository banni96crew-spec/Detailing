# Новая студия из одного файла

## 1. Создайте каталог

```powershell
pnpm tenant:new polar-auto --name "POLAR AUTO"
```

Команда копирует структуру образца в `tenants/polar-auto`, ставит состояние `preview` и не изменяет уже опубликованные студии.

## 2. Заполните `business.json`

Измените только `tenants/polar-auto/business.json`: бренд, цвет акцента, контакты, часовой пояс, услуги, ресурсы, часы, ограничения записи, сведения и подписи галереи. `slug` должен совпадать с именем каталога.

## 3. Замените изображения

Положите изображения в `tenants/polar-auto/images` и укажите их относительные имена в `business.json`. Обязательны логотип, главное фото и изображения галереи.

## 4. Проверьте входные данные

```powershell
pnpm tenant:validate polar-auto
pnpm tenant:assets polar-auto
pnpm tenant:publish polar-auto --dry-run
```

Ошибки схемы, отсутствующие файлы и пересечения ключей должны быть исправлены до публикации.

## 5. Опубликуйте предварительную версию

```powershell
pnpm tenant:publish polar-auto
pnpm build
pnpm tenant:verify polar-auto
```

Откройте `/s/polar-auto/` и `/s/polar-auto/owner/`. Проверьте услуги, подходящие ресурсы, часы приёма, цену, длительность, буфер и часовой пояс.

## 6. Включите рабочий режим

```powershell
pnpm tenant:publish polar-auto --live
```

Рабочий режим включайте только после проверки бизнес-настроек. Интерфейс, сценарии записи и Supabase остаются общими; новая студия получает свой путь, метаданные, манифест, иконки, область service worker и имя кэша.

