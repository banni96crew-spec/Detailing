import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { addGalleryItem, replaceBrandAsset, replaceGalleryImage, updateGalleryCaption, updateHours, updateInfoCard, updateResource, updateService } from "./settings-repository";

function useRefreshTenant(slug: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["tenant", slug] });
}

export function ServiceEditor({ tenant, service }: { tenant: PublishedBusinessConfig; service: PublishedBusinessConfig["services"][number] }) {
  const [price, setPrice] = useState(String(service.priceCents / 100));
  const [duration, setDuration] = useState(String(service.durationMinutes));
  const [buffer, setBuffer] = useState(String(service.bufferMinutes));
  const refresh = useRefreshTenant(tenant.slug);
  const save = useMutation({
    mutationFn: () => updateService(tenant, service.key, { priceCents: Math.round(Number(price) * 100), durationMinutes: Number(duration), bufferMinutes: Number(buffer), active: true }),
    onSuccess: refresh,
  });
  return (
    <li className="settings-row">
      <VStack gap={3}>
        <Heading level={3}>{service.name}</Heading>
        <HStack gap={2} wrap="wrap">
          <TextInput label="Цена, ₽" value={price} onChange={setPrice} width="100%" />
          <TextInput label="Работа, мин" value={duration} onChange={setDuration} width="100%" />
          <TextInput label="Буфер, мин" value={buffer} onChange={setBuffer} width="100%" />
        </HStack>
        {save.isError ? <Banner status="error" title="Услуга не сохранена" description={save.error.message} /> : null}
        <Button label="Сохранить услугу" variant="secondary" isLoading={save.isPending} onClick={() => save.mutate()} />
      </VStack>
    </li>
  );
}

export function ResourceEditor({ tenant, resource }: { tenant: PublishedBusinessConfig; resource: PublishedBusinessConfig["resources"][number] }) {
  const [name, setName] = useState(resource.name);
  const [active, setActive] = useState(true);
  const refresh = useRefreshTenant(tenant.slug);
  const save = useMutation({ mutationFn: () => updateResource(tenant, resource.key, { name, active }), onSuccess: refresh });
  return (
    <li className="settings-row">
      <VStack gap={2}>
        <TextInput label="Название поста" value={name} onChange={setName} width="100%" />
        <Switch label="Принимать записи на этот пост" value={active} onChange={setActive} />
        {save.isError ? <Banner status="error" title="Пост не сохранён" description={save.error.message} /> : null}
        <Button label="Сохранить пост" variant="secondary" isLoading={save.isPending} onClick={() => save.mutate()} />
      </VStack>
    </li>
  );
}

export function HoursEditor({ tenant, hour }: { tenant: PublishedBusinessConfig; hour: PublishedBusinessConfig["hours"][number] }) {
  const names = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const [closed, setClosed] = useState(hour.closed);
  const [opensAt, setOpensAt] = useState(hour.opensAt ?? "09:00");
  const [lastArrivalAt, setLastArrivalAt] = useState(hour.lastArrivalAt ?? "18:00");
  const refresh = useRefreshTenant(tenant.slug);
  const save = useMutation({ mutationFn: () => updateHours(tenant, hour.weekday, { closed, opensAt, lastArrivalAt }), onSuccess: refresh });
  return (
    <li className="settings-row">
      <VStack gap={2}>
        <Heading level={3}>{names[hour.weekday]}</Heading>
        <Switch label="Выходной" value={closed} onChange={setClosed} />
        {!closed ? <HStack gap={2} wrap="wrap"><TextInput label="Открытие" value={opensAt} onChange={setOpensAt} width="100%" /><TextInput label="Последний приём" value={lastArrivalAt} onChange={setLastArrivalAt} width="100%" /></HStack> : null}
        {save.isError ? <Banner status="error" title="График не сохранён" description={save.error.message} /> : null}
        <Button label="Сохранить день" variant="secondary" isLoading={save.isPending} onClick={() => save.mutate()} />
      </VStack>
    </li>
  );
}

export function InfoCardEditor({ tenant, card }: { tenant: PublishedBusinessConfig; card: PublishedBusinessConfig["infoCards"][number] }) {
  const [title, setTitle] = useState(card.title);
  const [text, setText] = useState(card.text);
  const refresh = useRefreshTenant(tenant.slug);
  const save = useMutation({ mutationFn: () => updateInfoCard(tenant, card.key, { title, text }), onSuccess: refresh });
  return (
    <li className="settings-row">
      <VStack gap={2}>
        <TextInput label="Заголовок" value={title} onChange={setTitle} width="100%" />
        <TextArea label="Текст" value={text} onChange={setText} rows={3} maxLength={240} width="100%" />
        {save.isError ? <Banner status="error" title="Карточка не сохранена" description={save.error.message} /> : null}
        <Button label="Сохранить карточку" variant="secondary" isLoading={save.isPending} onClick={() => save.mutate()} />
      </VStack>
    </li>
  );
}

export function GalleryEditor({ tenant, item }: { tenant: PublishedBusinessConfig; item: PublishedBusinessConfig["gallery"][number] }) {
  const [caption, setCaption] = useState(item.caption);
  const [file, setFile] = useState<File | null>(null);
  const refresh = useRefreshTenant(tenant.slug);
  const saveCaption = useMutation({ mutationFn: () => updateGalleryCaption(tenant, item.key, caption), onSuccess: refresh });
  const replace = useMutation({ mutationFn: async () => { if (!file) throw new Error("Выберите изображение"); await replaceGalleryImage(tenant, item.key, file); }, onSuccess: () => { setFile(null); refresh(); } });
  return (
    <li className="settings-row">
      <VStack gap={2}>
        <img className="settings-thumb" src={item.image} alt={item.caption} />
        <TextInput label="Подпись" value={caption} onChange={setCaption} width="100%" />
        <Button label="Сохранить подпись" variant="secondary" isLoading={saveCaption.isPending} onClick={() => saveCaption.mutate()} />
        <FileInput label="Заменить конкретную фотографию" value={file} onChange={(value) => setFile(value as File | null)} accept="image/jpeg,image/png,image/webp" maxSize={10_485_760} width="100%" />
        <Button label="Заменить фото" variant="secondary" isDisabled={!file} isLoading={replace.isPending} onClick={() => replace.mutate()} />
        {saveCaption.isError || replace.isError ? <Banner status="error" title="Изменение не сохранено" description={(saveCaption.error ?? replace.error)?.message} /> : null}
      </VStack>
    </li>
  );
}

export function AddGalleryEditor({ tenant }: { tenant: PublishedBusinessConfig }) {
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const refresh = useRefreshTenant(tenant.slug);
  const add = useMutation({ mutationFn: async () => { if (!file || !caption.trim()) throw new Error("Выберите фото и добавьте подпись"); await addGalleryItem(tenant, file, caption.trim()); }, onSuccess: () => { setFile(null); setCaption(""); refresh(); } });
  return (
    <VStack gap={2} className="settings-row">
      <Heading level={3}>Добавить новую карточку</Heading>
      <FileInput label="Новое фото" value={file} onChange={(value) => setFile(value as File | null)} accept="image/jpeg,image/png,image/webp" maxSize={10_485_760} mode="dropzone" width="100%" />
      <TextInput label="Подпись" value={caption} onChange={setCaption} width="100%" />
      {add.isError ? <Banner status="error" title="Карточка не добавлена" description={add.error.message} /> : null}
      <Button label="Добавить карточку" variant="secondary" isDisabled={!file || !caption.trim()} isLoading={add.isPending} onClick={() => add.mutate()} />
    </VStack>
  );
}

export function BrandAssetEditor({ tenant, assetKey, label }: { tenant: PublishedBusinessConfig; assetKey: "logo" | "hero"; label: string }) {
  const [file, setFile] = useState<File | null>(null);
  const refresh = useRefreshTenant(tenant.slug);
  const replace = useMutation({ mutationFn: async () => { if (!file) throw new Error("Выберите изображение"); await replaceBrandAsset(tenant, assetKey, file); }, onSuccess: () => { setFile(null); refresh(); } });
  return (
    <VStack gap={2}>
      <FileInput label={label} value={file} onChange={(value) => setFile(value as File | null)} accept="image/jpeg,image/png,image/webp" maxSize={10_485_760} width="100%" />
      <Button label={`Заменить ${label.toLocaleLowerCase("ru-RU")}`} variant="secondary" isDisabled={!file} isLoading={replace.isPending} onClick={() => replace.mutate()} />
      {replace.isError ? <Banner status="error" title="Файл не сохранён" description={replace.error.message} /> : null}
    </VStack>
  );
}
