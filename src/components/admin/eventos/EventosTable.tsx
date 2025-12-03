import { useState, useEffect } from 'react'
import { useEventos } from '@/hooks/use-eventos'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  FileText, 
  User, 
  MapPin, 
  Calendar as CalendarIcon,
  Phone,
  Loader2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type EventoCompleto = {
  id: string;
  status: string;
  pdf_url?: string;
  observacoes?: string;
  confirmado_em?: string;
  realizado_em?: string;
  cancelado_em?: string;
  created_at: string;
  orcamentos?: {
    evento_nome: string;
    evento_data: string;
    evento_local: string;
    nome_contratante: string;
    telefone?: string;
    tipo: string;
  };
}

export function EventosTable() {
  const [eventos, setEventos] = useState<EventoCompleto[]>([])
  const [filtros, setFiltros] = useState({
    search: '',
    status: '',
    tipo: ''
  })
  const [selectedEvento, setSelectedEvento] = useState<EventoCompleto | null>(null)
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
  const [isObservacoesDialogOpen, setIsObservacoesDialogOpen] = useState(false)
  const [observacoes, setObservacoes] = useState('')
  
  const { 
    isLoading, 
    buscarEventos, 
    atualizarStatusEvento,
    adicionarObservacoes 
  } = useEventos()

  // Buscar eventos
  useEffect(() => {
    const fetchData = async () => {
      const { data } = await buscarEventos({
        filtros: {
          search: filtros.search || undefined,
          status: filtros.status || undefined,
          tipo: filtros.tipo || undefined
        }
      })

      if (data) {
        setEventos(data)
      }
    }

    const timeoutId = setTimeout(fetchData, 300) // Debounce
    return () => clearTimeout(timeoutId)
  }, [buscarEventos, filtros])

  // Formatar data
  const formatarData = (dataString: string) => {
    try {
      return format(parseISO(dataString), "dd/MM/yyyy", { locale: ptBR })
    } catch (e) {
      return dataString
    }
  }

  // Formatar data e hora
  const formatarDataHora = (dataString: string) => {
    try {
      return format(parseISO(dataString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    } catch (e) {
      return dataString
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

  // Atualizar status do evento
  const handleAtualizarStatus = async (id: string, status: string) => {
    await atualizarStatusEvento(id, status)
    // Recarregar dados
    const { data } = await buscarEventos({ filtros })
    if (data) setEventos(data)
  }

  // Abrir diálogo de detalhes
  const handleVerDetalhes = (evento: EventoCompleto) => {
    setSelectedEvento(evento)
    setIsDetailsDialogOpen(true)
  }

  // Abrir diálogo de observações
  const handleAdicionarObservacoes = (evento: EventoCompleto) => {
    setSelectedEvento(evento)
    setObservacoes(evento.observacoes || '')
    setIsObservacoesDialogOpen(true)
  }

  // Salvar observações
  const handleSalvarObservacoes = async () => {
    if (selectedEvento && adicionarObservacoes) {
      await adicionarObservacoes(selectedEvento.id, observacoes)
      setIsObservacoesDialogOpen(false)
      // Recarregar dados
      const { data } = await buscarEventos({ filtros })
      if (data) setEventos(data)
    }
  }

  // Abrir PDF
  const abrirPdf = (url?: string) => {
    if (url) {
      window.open(url, '_blank')
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar por evento, cliente ou local..."
            className="pl-10"
            value={filtros.search}
            onChange={(e) => setFiltros(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>
        
        <Select
          value={filtros.status}
          onValueChange={(value) => setFiltros(prev => ({ ...prev, status: value }))}
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
          value={filtros.tipo}
          onValueChange={(value) => setFiltros(prev => ({ ...prev, tipo: value }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos os tipos</SelectItem>
            <SelectItem value="show_pirotecnico">Show Pirotécnico</SelectItem>
            <SelectItem value="venda_artigos">Venda de Artigos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : eventos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum evento encontrado
                </TableCell>
              </TableRow>
            ) : (
              eventos.map((evento) => (
                <TableRow key={evento.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {evento.orcamentos?.evento_nome || 'Evento sem nome'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {evento.orcamentos?.tipo === 'show_pirotecnico' ? 'Show Pirotécnico' : 'Venda de Artigos'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {evento.orcamentos?.nome_contratante || 'Cliente não definido'}
                      </div>
                      {evento.orcamentos?.telefone && (
                        <div className="text-sm text-muted-foreground">
                          {evento.orcamentos.telefone}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {evento.orcamentos?.evento_data ? formatarData(evento.orcamentos.evento_data) : 'Data não definida'}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[200px] truncate">
                      {evento.orcamentos?.evento_local || 'Local não definido'}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getBadgeStatus(evento.status)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerDetalhes(evento)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAdicionarObservacoes(evento)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      
                      {evento.pdf_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirPdf(evento.pdf_url)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                      
                      {evento.status === 'pendente' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-green-600 hover:text-green-700"
                          onClick={() => handleAtualizarStatus(evento.id, 'confirmado')}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      
                      {evento.status === 'confirmado' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleAtualizarStatus(evento.id, 'realizado')}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleAtualizarStatus(evento.id, 'cancelado')}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Diálogo de Detalhes */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Evento</DialogTitle>
            <DialogDescription>
              Informações completas sobre o evento selecionado
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvento && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Nome do Evento</Label>
                  <p className="text-sm">{selectedEvento.orcamentos?.evento_nome || 'Não definido'}</p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Status</Label>
                  <div>{getBadgeStatus(selectedEvento.status)}</div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Cliente</Label>
                  <p className="text-sm">{selectedEvento.orcamentos?.nome_contratante || 'Não definido'}</p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Telefone</Label>
                  <p className="text-sm">{selectedEvento.orcamentos?.telefone || 'Não informado'}</p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Data do Evento</Label>
                  <p className="text-sm">
                    {selectedEvento.orcamentos?.evento_data ? formatarData(selectedEvento.orcamentos.evento_data) : 'Não definida'}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tipo</Label>
                  <p className="text-sm">
                    {selectedEvento.orcamentos?.tipo === 'show_pirotecnico' ? 'Show Pirotécnico' : 'Venda de Artigos'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Local do Evento</Label>
                <p className="text-sm">{selectedEvento.orcamentos?.evento_local || 'Não definido'}</p>
              </div>
              
              {selectedEvento.observacoes && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Observações</Label>
                  <p className="text-sm whitespace-pre-wrap">{selectedEvento.observacoes}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div>
                  <Label className="text-xs font-medium">Criado em</Label>
                  <p>{formatarDataHora(selectedEvento.created_at)}</p>
                </div>
                
                {selectedEvento.confirmado_em && (
                  <div>
                    <Label className="text-xs font-medium">Confirmado em</Label>
                    <p>{formatarDataHora(selectedEvento.confirmado_em)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de Observações */}
      <Dialog open={isObservacoesDialogOpen} onOpenChange={setIsObservacoesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Observações</DialogTitle>
            <DialogDescription>
              Adicione ou edite observações sobre este evento
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                placeholder="Digite suas observações aqui..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={4}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsObservacoesDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleSalvarObservacoes}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
