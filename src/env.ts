import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url({ message: 'VITE_SUPABASE_URL deve ser uma URL válida' }),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, 'VITE_SUPABASE_ANON_KEY é obrigatório'),
  // Fonte alternativa de leads (projeto web externo)
  VITE_LEADS_SUPABASE_URL: z.string().url().optional(),
  VITE_LEADS_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  VITE_WHATSAPP_NUMBER: z.string().default('5561982735575'),
});

// Valida variáveis em tempo de build/runtime (browser)
export const env = envSchema.parse(import.meta.env);

export type Env = typeof env;
