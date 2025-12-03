import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'

// Nesta aplicação tratamos os orçamentos como "eventos" (fonte única). 
// Assim, listamos pendentes, confirmados, realizados e cancelados.

type Evento = {
  id: string
  evento_nome: string
  evento_data: string
  evento_local: string
  nome_contratante: string
  telefone: string | null
  tipo: string
  status: string
  observacoes?: string | null
  pdf_url?: string | null
  created_at: string
  updated_at?: string | null
  orcamentos?: {
    evento_nome: string
    evento_data: string
    evento_local: string
    nome_contratante: string
    telefone: string | null
    tipo: string
    valor_total?: number | null
  }
}

type FiltrosEventos = {
  status?: string
  tipo?: string
  data_inicio?: string
  data_fim?: string
  cliente_nome?: string
  search?: string
}

type BuscarEventosParams = {
  filtros?: FiltrosEventos
  ordenacao?: {
    campo: string
    direcao: 'asc' | 'desc'
  }
  paginacao?: {
    pagina: number
    limite: number
  }
}

export function useEventos() {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  // Busca eventos (orcamentos) com filtros/ordenação
  const buscarEventos = useCallback(async (params?: BuscarEventosParams) => {
    setIsLoading(true)
    try {
      let query = supabase
        .from('orcamentos')
        .select(
          `id, evento_nome, evento_data, evento_local, nome_contratante, telefone, tipo, status, pdf_url, created_at, updated_at`,
          { count: 'exact' }
        )

      // Filtros
      if (params?.filtros) {
        const { status, tipo, data_inicio, data_fim, cliente_nome, search } = params.filtros
        if (status) query = query.eq('status', status)
        if (tipo) query = query.eq('tipo', tipo)
        if (data_inicio) query = query.gte('evento_data', data_inicio)
        if (data_fim) query = query.lte('evento_data', data_fim)
        if (cliente_nome) query = query.ilike('nome_contratante', `%${cliente_nome}%`)
        if (search) {
          query = query.or(
            `evento_nome.ilike.%${search}%,nome_contratante.ilike.%${search}%,evento_local.ilike.%${search}%`
          )
        }
      }

      // Ordenação
      if (params?.ordenacao) {
        const { campo, direcao } = params.ordenacao
        query = query.order(campo, { ascending: direcao === 'asc' })
      } else {
        query = query.order('evento_data', { ascending: false })
      }

      // Paginação
      if (params?.paginacao) {
        const { pagina, limite } = params.paginacao
        const from = (pagina - 1) * limite
        const to = from + limite - 1
        query = query.range(from, to)
      }

      const { data, error, count } = await query
      if (error) throw error

      const mapped = (data || []).map((o: any) => ({
        ...o,
        orcamentos: {
          evento_nome: o.evento_nome,
          evento_data: o.evento_data,
          evento_local: o.evento_local,
          nome_contratante: o.nome_contratante,
          telefone: o.telefone,
          tipo: o.tipo,
          valor_total: o.valor_total,
        },
      })) as Evento[]

      return { data: mapped, count }
    } catch (error: unknown) {
      console.error('[useEventos] buscarEventos error:', error)
      toast({
        title: 'Erro ao buscar eventos',
        description: error instanceof Error ? error.message : 'Ocorreu um erro ao buscar os eventos.',
        variant: 'destructive'
      })
      return { data: [], count: 0 }
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  // Atualiza status
  const atualizarStatusEvento = async (id: string, status: string) => {
    setIsLoading(true)
    try {
      const atualizacoes: Record<string, any> = { status }
      if (status === 'confirmado') atualizacoes.confirmado_em = new Date().toISOString()
      if (status === 'realizado') atualizacoes.realizado_em = new Date().toISOString()
      if (status === 'cancelado') atualizacoes.cancelado_em = new Date().toISOString()

      const { data, error } = await supabase
        .from('orcamentos')
        .update(atualizacoes)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      toast({ title: 'Status atualizado', description: 'Evento atualizado com sucesso.' })
      return { data }
    } catch (error: unknown) {
      console.error('[useEventos] atualizarStatusEvento error:', error)
      toast({
        title: 'Erro ao atualizar status',
        description: error instanceof Error ? error.message : 'Ocorreu um erro ao atualizar o status.',
        variant: 'destructive'
      })
      return { data: null }
    } finally {
      setIsLoading(false)
    }
  }

  // Observações
  const adicionarObservacoes = async (id: string, observacoes: string) => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('orcamentos')
        .update({ observacoes })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      toast({ title: 'Observações salvas', description: 'As observações foram salvas.' })
      return { data }
    } catch (error: unknown) {
      console.error('[useEventos] adicionarObservacoes error:', error)
      toast({
        title: 'Erro ao salvar observações',
        description: error instanceof Error ? error.message : 'Ocorreu um erro ao salvar as observações.',
        variant: 'destructive'
      })
      return { data: null }
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    buscarEventos,
    atualizarStatusEvento,
    adicionarObservacoes,
    inscreverAtualizacoes: (callback: () => void) => {
      const channel = supabase
        .channel('orcamentos-as-eventos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos' }, () => callback())
        .subscribe()
      return () => {
        supabase.removeChannel(channel)
      }
    },
  }
}
