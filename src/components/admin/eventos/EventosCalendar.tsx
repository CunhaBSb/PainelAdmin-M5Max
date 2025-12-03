import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar as CalendarIcon, Clock, MapPin, User, FileText, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useEventos } from '@/hooks/use-eventos'
import { format, parseISO, isSameDay, startOfMonth, endOfMonth, isWithinInterval, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Filtros = {
  status?: string
  tipo?: string
  data_inicio?: string
  data_fim?: string
}

export function EventosCalendar() {
  const [filtros, setFiltros] = useState<Filtros>({})
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  
  const { 
    isLoading, 
    buscarEventos, 
    atualizarStatusEvento,
    inscreverAtualizacoes 
  } = useEventos()

  const [eventos, setEventos] = useState<Array<{
    id: string;
    status: string;
    pdf_url?: string;
    observacoes?: string;
    orcamentos?: {
      evento_nome: string;
      evento_data: string;
      evento_local: string;
      nome_contratante: string;
      telefone?: string;
      tipo: string;
    };
  }>>([])
  const [eventosDoDia, setEventosDoDia] = useState<Array<{
    id: string;
    status: string;
    pdf_url?: string;
    observacoes?: string;
    orcamentos?: {
      evento_nome: string;
      evento_data: string;
      evento_local: string;
      nome_contratante: string;
      telefone?: string;
      tipo: string;
    };
  }>>([])

  // Buscar eventos do mês atual
  useEffect(() => {
    const fetchData = async () => {
      const inicio = startOfMonth(currentMonth)
      const fim = endOfMonth(currentMonth)
      
      const { data } = await buscarEventos({
        filtros: {
          ...filtros,
          data_inicio: format(inicio, 'yyyy-MM-dd'),
          data_fim: format(fim, 'yyyy-MM-dd')
        }
      })

      if (data) {
        setEventos(data)
      }
    }

    fetchData()
  }, [buscarEventos, currentMonth, filtros])

  // Filtrar eventos do dia selecionado
  useEffect(() => {
    if (!selectedDate || !eventos.length) {
      setEventosDoDia([])
      return
    }

    const eventosFiltrados = eventos.filter(evento => 
      evento.orcamentos && isSameDay(parseISO(evento.orcamentos.evento_data), selectedDate)
    )

    setEventosDoDia(eventosFiltrados)
  }, [selectedDate, eventos])

  // Inscrever para atualizações em tempo real
  useEffect(() => {
    const unsubscribe = inscreverAtualizacoes(() => {
      // Recarregar dados quando houver atualizações
      const fetchData = async () => {
        const inicio = startOfMonth(currentMonth)
        const fim = endOfMonth(currentMonth)
        
        const { data } = await buscarEventos({
          filtros: {
            ...filtros,
            data_inicio: format(inicio, 'yyyy-MM-dd'),
            data_fim: format(fim, 'yyyy-MM-dd')
          }
        })
  
        if (data) {
          setEventos(data)
        }
      }

      fetchData()
    })

    return () => {
      unsubscribe()
    }
  }, [buscarEventos, currentMonth, filtros, inscreverAtualizacoes])

  // Formatar data
  const formatarData = (dataString: string) => {
    try {
      return format(parseISO(dataString), "dd/MM/yyyy", { locale: ptBR })
    } catch (e) {
      return dataString
    }
  }

  // Formatar hora
  const formatarHora = (dataString: string) => {
    try {
      return format(parseISO(dataString), "HH:mm", { locale: ptBR })
    } catch (e) {
      return dataString
    }
  }

  // Atualizar status do evento
  const handleAtualizarStatus = async (id: string, status: string) => {
    await atualizarStatusEvento(id, status)
  }

  // Abrir PDF
  const abrirPdf = (url: string) => {
    if (url) {
      window.open(url, '_blank')
    }
  }

  // Obter badge de status
  const getBadgeStatus = (status: string) => {
    switch (status) {
      case 'confirmado':
        return <Badge variant="default">Confirmado</Badge>
      case 'realizado':
        return <Badge className="bg-green-100 text-green-800">Realizado</Badge>
      case 'cancelado':
        return <Badge variant="destructive">Cancelado</Badge>
      case 'pendente':
        return <Badge variant="outline">Pendente</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Função para verificar se um dia tem eventos
  const dayHasEvents = (day: Date) => {
    return eventos.some(evento => 
      evento.orcamentos && isSameDay(parseISO(evento.orcamentos.evento_data), day)
    )
  }

  // Função para renderizar o conteúdo do dia no calendário
  const renderDayContent = (day: Date) => {
    const hasEvents = dayHasEvents(day)
    return (
      <div className={`w-full h-full flex items-center justify-center ${hasEvents ? 'font-bold' : ''}`}>
        {day.getDate()}
        {hasEvents && (
          <div className="w-1 h-1 bg-primary rounded-full absolute bottom-1"></div>
        )}
      </div>
    )
  }

  // Navegar para o mês anterior
  const handlePreviousMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1))
  }

  // Navegar para o próximo mês
  const handleNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Calendário de Eventos</CardTitle>
          <CardDescription>
            Visualize e gerencie os eventos agendados.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Select
              value={filtros.status || ''}
              onValueChange={(value) => 
                setFiltros(prev => ({ ...prev, status: value || undefined }))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="realizado">Realizado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            
            <Select
              value={filtros.tipo || ''}
              onValueChange={(value) => 
                setFiltros(prev => ({ ...prev, tipo: value || undefined }))
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos os tipos</SelectItem>
                <SelectItem value="casamento">Casamento</SelectItem>
                <SelectItem value="aniversario">Aniversário</SelectItem>
                <SelectItem value="corporativo">Corporativo</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Calendário e Eventos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Calendário */}
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-4">
                <Button variant="outline" onClick={handlePreviousMonth}>
                  Mês Anterior
                </Button>
                <h3 className="text-lg font-medium">
                  {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                </h3>
                <Button variant="outline" onClick={handleNextMonth}>
                  Próximo Mês
                </Button>
              </div>
              
              {isLoading ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  month={currentMonth}
                  onMonthChange={setCurrentMonth}
                  className="rounded-md border"
                  locale={ptBR}
                  components={{
                    Day: ({ day, ...props }) => (
                      <button {...props}>
                        {renderDayContent(day)}
                      </button>
                    )
                  }}
                />
              )}
            </div>
            
            {/* Lista de Eventos do Dia */}
            <div className="md:col-span-1">
              <div className="rounded-md border p-4 h-full">
                <h3 className="font-medium mb-4">
                  {selectedDate ? (
                    <>Eventos em {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}</>
                  ) : (
                    <>Selecione uma data</>
                  )}
                </h3>
                
                {selectedDate && eventosDoDia.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum evento nesta data.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {eventosDoDia.map((evento) => (
                      <Card key={evento.id} className="overflow-hidden">
                        <CardHeader className="p-4 pb-2">
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-base">{evento.orcamentos?.evento_nome || 'Evento sem nome'}</CardTitle>
                            {getBadgeStatus(evento.status)}
                          </div>
                          <CardDescription>{evento.orcamentos?.tipo || 'Tipo não definido'}</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-2">
                          <div className="flex items-center text-sm">
                            <User className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>{evento.orcamentos?.nome_contratante || 'Cliente não definido'}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>{evento.orcamentos ? formatarData(evento.orcamentos.evento_data) : 'Data não definida'}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>{evento.orcamentos?.evento_local || 'Local não definido'}</span>
                          </div>
                          
                          <div className="flex justify-end space-x-2 mt-4">
                            {evento.pdf_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => abrirPdf(evento.pdf_url)}
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                Contrato
                              </Button>
                            )}
                            
                            {evento.status === 'pendente' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => handleAtualizarStatus(evento.id, 'confirmado')}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Confirmar
                              </Button>
                            )}
                            
                            {evento.status === 'confirmado' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => handleAtualizarStatus(evento.id, 'realizado')}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Realizado
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => handleAtualizarStatus(evento.id, 'cancelado')}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Cancelar
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
