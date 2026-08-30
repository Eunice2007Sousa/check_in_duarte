import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured) {
  // Isto aparece na consola do browser e ajuda a perceber rapidamente
  // porque é que a app não consegue falar com a base de dados.
  console.error(
    "Faltam as variáveis de ambiente VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY. " +
      "Define-as num ficheiro .env (local) ou nas Environment Variables do projeto na Vercel."
  );
}

// Em desenvolvimento local sem .env, criamos na mesma um client com valores
// vazios para a app não rebentar ao arrancar — os pedidos falham de forma
// controlada e a app mostra o aviso em vez de ecrã em branco.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);
