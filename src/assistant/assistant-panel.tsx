import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useTenant } from "@/tenant/tenant-context";
import { askAssistant, type ChatMessage } from "./assistant-repository";

export function AssistantPanel({ scope }: { scope: "client" | "owner" }) {
  const tenant = useTenant();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const prompts = scope === "client" ? ["Когда ближайшее окно?", "Сколько стоит полировка?", "Как найти студию?"] : ["Что у меня завтра?", "Сколько машин было на неделе?", "Сколько денег получено?"];
  const ask = useMutation({
    mutationFn: (content: string) => askAssistant(tenant, scope, content, history),
    onSuccess: (answer, content) => { setHistory((items) => [...items, { role: "user", content }, { role: "assistant", content: answer }]); setMessage(""); },
  });
  function submit(content = message): void {
    if (content.trim() && !ask.isPending) ask.mutate(content.trim());
  }
  return (
    <>
      <Button label={scope === "client" ? "Спросить помощника" : "Помощник владельца"} variant="secondary" onClick={() => setOpen(true)} />
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>Помощник</DrawerTitle><DrawerDescription>Ответы основаны на данных этой студии.</DrawerDescription></DrawerHeader>
          <VStack className="booking-sheet-content" gap={3} padding={4}>
            <HStack gap={2} wrap="wrap">{prompts.map((prompt) => <Button key={prompt} label={prompt} variant="secondary" onClick={() => submit(prompt)} />)}</HStack>
            {history.length === 0 ? <Text color="secondary">Выберите пример или напишите свой вопрос.</Text> : <ol className="chat-list">{history.map((item, index) => <li key={`${index}-${item.role}`} data-role={item.role}><Text>{item.content}</Text></li>)}</ol>}
            {ask.isPending ? <Text role="status">Проверяю данные…</Text> : null}
            {ask.isError ? <Banner status="error" title="Помощник не ответил" description={ask.error.message} /> : null}
            <TextArea label="Ваш вопрос" value={message} onChange={setMessage} rows={3} maxLength={1000} width="100%" />
          </VStack>
          <DrawerFooter><Button label="Отправить" variant="primary" isDisabled={!message.trim()} isLoading={ask.isPending} onClick={() => submit()} /></DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
