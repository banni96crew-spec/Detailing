import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { LoadingState } from "@/components/app-state";
import { isDemoMode } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";

export function OwnerGate({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["owner-session"],
    queryFn: async () => (await getSupabase().auth.getSession()).data.session,
    enabled: !isDemoMode,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isDemoMode) return;
    const { data } = getSupabase().auth.onAuthStateChange(() => void queryClient.invalidateQueries({ queryKey: ["owner-session"] }));
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const signIn = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) throw new Error("Неверная почта или пароль");
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["owner-session"] }),
  });

  if (isDemoMode) return <>{children}</>;
  if (session.isPending) return <LoadingState label="Проверяем вход" />;
  if (session.data) return <>{children}</>;
  return (
    <Section variant="transparent" padding={4}>
      <VStack as="main" gap={4} className="owner-login">
        <Heading level={1}>Кабинет владельца</Heading>
        <TextInput label="Почта" value={email} type="email" autoComplete="email" onChange={setEmail} width="100%" />
        <TextInput label="Пароль" value={password} type="password" autoComplete="current-password" onChange={setPassword} width="100%" onEnter={() => signIn.mutate()} />
        {signIn.isError ? <Banner status="error" title="Войти не удалось" description={signIn.error.message} /> : null}
        <Button label="Войти" variant="primary" width="100%" isLoading={signIn.isPending} isDisabled={!email || !password} onClick={() => signIn.mutate()} />
      </VStack>
    </Section>
  );
}
