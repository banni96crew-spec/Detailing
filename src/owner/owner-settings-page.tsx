import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTenant } from "@/tenant/tenant-context";
import { updateProfile } from "./settings-repository";
import { AddGalleryEditor, BrandAssetEditor, GalleryEditor, HoursEditor, InfoCardEditor, ResourceEditor, ServiceEditor } from "./settings-editors";

export function OwnerSettingsPage() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [name, setName] = useState(tenant.brand.name);
  const [shortName, setShortName] = useState(tenant.brand.shortName);
  const [description, setDescription] = useState(tenant.brand.description);
  const [phone, setPhone] = useState(tenant.contact.phone);
  const [address, setAddress] = useState(tenant.contact.address);
  const [directionsUrl, setDirectionsUrl] = useState(tenant.contact.directionsUrl);
  const accentColor = tenant.brand.accent;
  const profile = useMutation({
    mutationFn: () => updateProfile(tenant, { name, shortName, description, phone, address, directionsUrl, accentColor }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tenant", tenant.slug] }),
  });
  return (
    <Section className="owner-settings-section" variant="transparent" padding={0}>
      <VStack as="main" className="owner-settings-page" gap={5}>
        <VStack as="section" className="owner-studio-section" gap={3}>
          <Heading level={2}>Студия</Heading>
          <TextInput label="Название" value={name} onChange={setName} width="100%" />
          <TextInput label="Короткое название" value={shortName} onChange={setShortName} width="100%" />
          <TextArea label="Описание" value={description} onChange={setDescription} rows={4} maxLength={300} width="100%" />
          <TextInput label="Телефон" value={phone} onChange={setPhone} width="100%" />
          <TextInput label="Адрес" value={address} onChange={setAddress} width="100%" />
          <TextInput label="Ссылка Яндекс Карт" value={directionsUrl} onChange={setDirectionsUrl} width="100%" />
          {profile.isError ? <Banner status="error" title="Настройки не сохранены" description={profile.error.message} /> : null}
          {profile.isSuccess ? <Banner status="success" title="Основные настройки сохранены" isDismissable /> : null}
          <Button className="owner-settings-save" label="Сохранить изменения" variant="primary" isLoading={profile.isPending} onClick={() => profile.mutate()} />
          <VStack className="owner-media-settings" gap={3}>
            <Heading level={3}>Изображения</Heading>
            <BrandAssetEditor tenant={tenant} assetKey="logo" label="Логотип" />
            <BrandAssetEditor tenant={tenant} assetKey="hero" label="Главное фото" />
          </VStack>
        </VStack>
        <VStack as="section" gap={3}><Heading level={2}>Услуги</Heading><ul className="settings-list">{tenant.services.map((service) => <ServiceEditor key={service.key} tenant={tenant} service={service} />)}</ul></VStack>
        <VStack as="section" gap={3}><Heading level={2}>Посты и боксы</Heading><ul className="settings-list">{tenant.resources.map((resource) => <ResourceEditor key={resource.key} tenant={tenant} resource={resource} />)}</ul></VStack>
        <VStack as="section" gap={3}><Heading level={2}>Часы приёма</Heading><ul className="settings-list">{tenant.hours.map((hour) => <HoursEditor key={hour.weekday} tenant={tenant} hour={hour} />)}</ul></VStack>
        <VStack as="section" gap={3}><Heading level={2}>Три карточки на главной</Heading><ul className="settings-list">{tenant.infoCards.map((card) => <InfoCardEditor key={card.key} tenant={tenant} card={card} />)}</ul></VStack>
        <VStack as="section" gap={3}><Heading level={2}>Фотографии работ</Heading><AddGalleryEditor tenant={tenant} /><ul className="settings-list">{tenant.gallery.map((item) => <GalleryEditor key={item.key} tenant={tenant} item={item} />)}</ul></VStack>
      </VStack>
    </Section>
  );
}
