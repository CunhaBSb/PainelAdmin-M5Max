import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/env'

// Client para ler leads vindos de outro projeto (tabela lead_submissions)
// Se as variáveis não estiverem configuradas, permanece null e o app usa a base local.
export const supabaseLeads: SupabaseClient | null = env.VITE_LEADS_SUPABASE_URL && env.VITE_LEADS_SUPABASE_ANON_KEY
  ? createClient(env.VITE_LEADS_SUPABASE_URL, env.VITE_LEADS_SUPABASE_ANON_KEY)
  : null

export const hasLeadsSource = Boolean(supabaseLeads)

// Schema da tabela lead_submissions (projeto de leads externo)
export type LeadSubmission = {
  id: number
  name: string
  email: string
  phone: string
  city: string | null
  event_type: string | null
  event_date: string | null // date
  audience_size: string | null
  budget: string | null
  noise_restrictions: boolean | null
  audience: string | null
  audience_profile: string | null
  source: string | null
  page: string | null
  lead_score: number | null
  message: string | null
  created_at: string | null
  updated_at: string | null
  firework_points: string | null
}

export const mapLeadToSolicitacao = (lead: LeadSubmission) => ({
  id: String(lead.id),
  nome_completo: lead.name || 'Lead sem nome',
  whatsapp: lead.phone || '',
  email: lead.email || '',
  tipo_solicitacao: lead.event_type || lead.source || 'lead',
  tipo_evento: lead.event_type || null,
  data_evento: lead.event_date || null,
  localizacao_evento: lead.city || null,
  kit_selecionado: lead.firework_points || null,
  observacoes: lead.message || null,
  enviado_email: false,
  created_at: lead.created_at || null,
})
