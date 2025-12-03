import { useState, useEffect, useMemo } from "react";
import { useDebouncedNestedSearch } from "@/hooks/use-debounced-nested-search";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Plus, Activity, Users, Clock, CheckCircle, Loader2, Search, Filter, Eye, Edit, Trash2, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

type EventoCompleto = {
  id: string;
  orcamento_id: string | null;
  status: string | null;
  pdf_url: string | null;
  observacoes: string | null;
  confirmado_em: string | null;
  realizado_em: string | null;
  created_at: string | null;
  updated_at: string | null;
  orcamentos?: {
    id: string;
    evento_nome: string;
    evento_data: string;
    evento_local: string;
    nome_contratante: string;
    telefone: string | null;
    tipo: string;
    valor_total: number | null;
    orcamentos_produtos?: Array<{
      id: string;
      quantidade: number;
      valor_unitario: number;
      valor_total: number;
      produtos?: {
        id: string;
        codigo: string;
        nome_produto: string;
        categoria: string;
        valor_venda: number;
        valor_compra: number;
      };
    }>;
  };
};

const AdminEventos = () => {
  const [eventos, setEventos] = useState<EventoCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [selectedEvento, setSelectedEvento] = useState<EventoCompleto | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isNewEventOpen, setIsNewEventOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [produtos, setProdutos] = useState<Array<{
    id: string;
    codigo: string;
    nome_produto: string;
    categoria: string;
    fabricante: string | null;
    efeito: string | null;
    duracao_segundos: number | null;
    valor_venda: number;
    quantidade_disponivel: number;
  }>>([]);
  const [editForm, setEditForm] = useState({
    tipo: '',
    nome_contratante: '',
    telefone: '',
    cpf: '',
    evento_nome: '',
    evento_data: '',
    evento_local: '',
    modo_pagamento: '',
    produtos: [] as Array<{
      produto_id: string;
      nome: string;
      quantidade: number;
      valor_unitario: number;
    }>
  });
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productEffectFilter, setProductEffectFilter] = useState("all");
  const [productPriceSort, setProductPriceSort] = useState("none");
  const [productDurationSort, setProductDurationSort] = useState("none");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrcamentos = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Carrega todos os orçamentos como "eventos" (inclui realizados/passados)
        const { data, error: fetchError } = await supabase
          .from('orcamentos')
          .select(`
            id,
            evento_nome,
            evento_data,
            evento_local,
            nome_contratante,
            telefone,
            tipo,
            status,
            valor_total,
            pdf_url,
            created_at,
            updated_at
          `)
          .order('evento_data', { ascending: false });

        if (fetchError) throw fetchError;

        const mapped = (data || []).map((o) => ({
          id: o.id,
          status: o.status,
          pdf_url: o.pdf_url,
          observacoes: null,
          confirmado_em: null,
          realizado_em: null,
          created_at: o.created_at,
          updated_at: o.updated_at,
          orcamentos: {
            id: o.id,
            evento_nome: o.evento_nome,
            evento_data: o.evento_data,
            evento_local: o.evento_local,
            nome_contratante: o.nome_contratante,
            telefone: o.telefone,
            tipo: o.tipo,
            valor_total: o.valor_total,
          },
        }));

        setEventos(mapped);
      } catch (err) {
        console.error('Erro ao buscar orçamentos:', err);
        setError('Erro ao carregar eventos');
        setEventos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrcamentos();
    
    // Buscar produtos para edição
    const fetchProdutos = async () => {
      try {
        const { data, error } = await supabase
          .from('produtos')
          .select('id, codigo, nome_produto, categoria, fabricante, efeito, duracao_segundos, valor_venda, quantidade_disponivel')
          .eq('ativo', true)
          .order('nome_produto');
        
        if (error) throw error;
        setProdutos(data || []);
      } catch (error) {
        console.error('Erro ao buscar produtos:', error);
      }
    };
    
    fetchProdutos();
  }, []);

  // Filtros base sem busca de texto (otimizado)
  const baseFilteredEventos = useMemo(() => {
    return eventos.filter(evento => {
      const matchesStatus = statusFilter === "all" || evento.status === statusFilter;
      const matchesTipo = tipoFilter === "all" || evento.orcamentos?.tipo === tipoFilter;
      
      return matchesStatus && matchesTipo;
    });
  }, [eventos, statusFilter, tipoFilter]);

  // Busca otimizada com debounce para estrutura aninhada
  const { filteredItems: filteredEventos } = useDebouncedNestedSearch(
    baseFilteredEventos,
    searchTerm,
    (evento, term) => {
      const nome = (evento.orcamentos?.evento_nome || '').toLowerCase();
      const contratante = (evento.orcamentos?.nome_contratante || '').toLowerCase();
      const local = (evento.orcamentos?.evento_local || '').toLowerCase();
      const status = (evento.status || '').toLowerCase();
      return (
        nome.includes(term) ||
        contratante.includes(term) ||
        local.includes(term) ||
        status.includes(term)
      );
    }
  );

  // Calcular estatísticas baseadas nos eventos
  const estatisticas = {
    total: eventos.length,
    pendentes: eventos.filter(e => e.status === 'pendente').length,
    confirmados: eventos.filter(e => e.status === 'confirmado').length,
    cancelados: eventos.filter(e => e.status === 'cancelado').length,
    realizados: eventos.filter(e => e.status === 'realizado').length,
  };

  // Funções para ações
  const handleViewDetails = (evento: EventoCompleto) => {
    setSelectedEvento(evento);
    setIsDetailsOpen(true);
  };

  const handleEditEvento = (evento: EventoCompleto) => {
    setSelectedEvento(evento);
    setIsEditOpen(true);
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      // Atualiza status direto na tabela de orçamentos (fonte dos eventos)
      const { error } = await supabase
        .from('orcamentos')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: `Status do evento foi alterado para ${newStatus}`,
      });

      // Recarregar lista mapeada de orçamentos
      const { data: orcData } = await supabase
        .from('orcamentos')
        .select(`
          id,
          evento_nome,
          evento_data,
          evento_local,
          nome_contratante,
          telefone,
          tipo,
          status,
          valor_total,
          pdf_url,
          created_at,
          updated_at
        `)
        .order('evento_data', { ascending: false });

      if (orcData) {
        const mapped = orcData.map((o) => ({
          id: o.id,
          status: o.status,
          pdf_url: o.pdf_url,
          observacoes: null,
          confirmado_em: null,
          realizado_em: null,
          created_at: o.created_at,
          updated_at: o.updated_at,
          orcamentos: {
            id: o.id,
            evento_nome: o.evento_nome,
            evento_data: o.evento_data,
            evento_local: o.evento_local,
            nome_contratante: o.nome_contratante,
            telefone: o.telefone,
            tipo: o.tipo,
            valor_total: o.valor_total,
          },
        }));
        setEventos(mapped);
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status",
        variant: "destructive",
      });
    }
  };

  const handleGenerateReport = () => {
    toast({
      title: "Relatório",
      description: "Funcionalidade de relatórios em desenvolvimento",
    });
  };

  const handleNewEvent = () => {
    navigate("/admin/orcamentos");
  };


  const handleUpdateOrcamento = async () => {
    if (!selectedOrcamento) return;

    try {
      // Calcular valor total
      const valorTotal = editForm.produtos.reduce((sum, p) => sum + (p.quantidade * p.valor_unitario), 0);

      // Atualizar orçamento
      const { error: orcamentoError } = await supabase
        .from('orcamentos')
        .update({
          tipo: editForm.tipo,
          nome_contratante: editForm.nome_contratante,
          telefone: editForm.telefone || null,
          cpf: editForm.cpf || null,
          evento_nome: editForm.evento_nome,
          evento_data: editForm.evento_data,
          evento_local: editForm.evento_local,
          modo_pagamento: editForm.modo_pagamento,
          valor_total: valorTotal
        })
        .eq('id', selectedOrcamento.id);

      if (orcamentoError) throw orcamentoError;

      // Deletar produtos existentes
      const { error: deleteError } = await supabase
        .from('orcamentos_produtos')
        .delete()
        .eq('orcamento_id', selectedOrcamento.id);

      if (deleteError) throw deleteError;

      // Inserir novos produtos
      if (editForm.produtos.length > 0) {
        const novosProducts = editForm.produtos.map(p => ({
          orcamento_id: selectedOrcamento.id,
          produto_id: p.produto_id,
          quantidade: p.quantidade,
          valor_unitario: p.valor_unitario,
          valor_total: p.quantidade * p.valor_unitario
        }));

        const { error: insertError } = await supabase
          .from('orcamentos_produtos')
          .insert(novosProducts);

        if (insertError) throw insertError;
      }

      toast({
        title: "Orçamento atualizado!",
        description: "O orçamento foi atualizado com sucesso.",
      });

      setIsFullEditOpen(false);
      // Recarregar dados
      const { data } = await supabase
        .from('orcamentos')
        .select(`
          *,
          orcamentos_produtos (
            id,
            quantidade,
            valor_unitario,
            valor_total,
            produtos (
              id,
              codigo,
              nome_produto,
              categoria,
              valor_venda
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (data) setOrcamentos(data);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o orçamento",
        variant: "destructive",
      });
    }
  };

  const addProductToEdit = (produto: typeof produtos[0]) => {
    const existingIndex = editForm.produtos.findIndex(p => p.produto_id === produto.id);
    
    if (existingIndex >= 0) {
      const updated = [...editForm.produtos];
      updated[existingIndex].quantidade += 1;
      setEditForm({ ...editForm, produtos: updated });
    } else {
      setEditForm({
        ...editForm,
        produtos: [...editForm.produtos, {
          produto_id: produto.id,
          nome: produto.nome_produto,
          quantidade: 1,
          valor_unitario: produto.valor_venda
        }]
      });
    }
  };

  const removeProductFromEdit = (index: number) => {
    const updated = editForm.produtos.filter((_, i) => i !== index);
    setEditForm({ ...editForm, produtos: updated });
  };

  const updateProductInEdit = (index: number, field: 'quantidade' | 'valor_unitario', value: number) => {
    const updated = [...editForm.produtos];
    updated[index] = { ...updated[index], [field]: value };
    setEditForm({ ...editForm, produtos: updated });
  };

  const filteredProducts = produtos.filter(produto => {
    // REGRA CONDICIONAL: Se filtros de ordenação estão ativos, produtos sem duração não aparecem
    const hasOrderingFilters = productPriceSort !== "none" || productDurationSort !== "none";
    if (hasOrderingFilters && (!produto.duracao_segundos || produto.duracao_segundos <= 0)) {
      return false;
    }
    
    const matchesSearch = productSearchTerm === "" || 
      produto.nome_produto.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      produto.codigo.toLowerCase().includes(productSearchTerm.toLowerCase());
    
    const matchesCategory = productCategoryFilter === "all" || produto.categoria === productCategoryFilter;
    
    // Filtro de efeito por grupo principal
    let matchesEffect = true;
    if (productEffectFilter !== "all") {
      if (!produto.efeito) {
        matchesEffect = false;
      } else {
        const efeito = produto.efeito.toLowerCase();
        const filtro = productEffectFilter.toLowerCase();
        
        if (filtro === "leque w") {
          matchesEffect = efeito.includes("leque w");
        } else if (filtro === "leque z") {
          matchesEffect = efeito.includes("leque z");
        } else if (filtro === "leque") {
          matchesEffect = efeito.includes("leque");
        } else if (filtro === "reto") {
          matchesEffect = efeito.includes("reto");
        } else if (filtro === "fumaça") {
          matchesEffect = efeito.includes("fumaça");
        } else {
          matchesEffect = efeito.includes(filtro);
        }
      }
    }
    
    return matchesSearch && matchesCategory && matchesEffect;
  });

  // Sistema SIMPLES de custo-benefício que FUNCIONA
  const sortedFilteredProducts = useMemo(() => {
    let result = [...filteredProducts];
    
    // ABORDAGEM SUPER SIMPLES: Calcular custo por segundo
    if (productPriceSort !== "none" && productDurationSort !== "none") {
      result = result.sort((a, b) => {
        // Calcular custo por segundo (menor = melhor custo-benefício)
        const custoSegundoA = a.valor_venda / a.duracao_segundos;
        const custoSegundoB = b.valor_venda / b.duracao_segundos;
        
        // Para "menor preço" + "maior duração" = menor custo por segundo primeiro
        if (productPriceSort === "asc" && productDurationSort === "desc") {
          return custoSegundoA - custoSegundoB; // Melhor custo-benefício primeiro
        }
        // Para "maior preço" + "menor duração" = maior custo por segundo primeiro  
        else if (productPriceSort === "desc" && productDurationSort === "asc") {
          return custoSegundoB - custoSegundoA; // Pior custo-benefício primeiro
        }
        // Outras combinações: ordenar por duração primeiro
        else {
          const durationCompare = productDurationSort === "asc" 
            ? a.duracao_segundos - b.duracao_segundos 
            : b.duracao_segundos - a.duracao_segundos;
          
          // Se durações iguais, usar preço
          if (durationCompare === 0) {
            return productPriceSort === "asc" 
              ? a.valor_venda - b.valor_venda 
              : b.valor_venda - a.valor_venda;
          }
          return durationCompare;
        }
      });
      
    } else if (productDurationSort !== "none") {
      result = result.sort((a, b) => {
        return productDurationSort === "asc" 
          ? a.duracao_segundos - b.duracao_segundos 
          : b.duracao_segundos - a.duracao_segundos;
      });
      
    } else if (productPriceSort !== "none") {
      result = result.sort((a, b) => {
        return productPriceSort === "asc" 
          ? a.valor_venda - b.valor_venda 
          : b.valor_venda - a.valor_venda;
      });
      
    } else {
      // Sem filtros: manter ordem original
    }
    
    return result;
  }, [filteredProducts, productPriceSort, productDurationSort]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Carregando eventos...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Gestão de Eventos</h1>
            <p className="text-muted-foreground">Visualize e gerencie eventos confirmados e agendados</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleGenerateReport}>
              <Activity className="h-4 w-4 mr-2" />
              Relatórios
            </Button>
            <Button onClick={handleNewEvent}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Evento
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="text-red-800">{error}</div>
            </CardContent>
          </Card>
        )}

        {/* Estatísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Total de Eventos</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{estatisticas.total}</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Pendentes</CardTitle>
              <Clock className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{estatisticas.pendentes}</div>
              <p className="text-xs text-muted-foreground">Aguardando confirmação</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Confirmados</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{estatisticas.confirmados}</div>
              <p className="text-xs text-muted-foreground">Próximos eventos</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Cancelados</CardTitle>
              <CheckCircle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{estatisticas.cancelados}</div>
              <p className="text-xs text-muted-foreground">Eventos cancelados</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm">
          <CardHeader>
            <CardTitle className="text-foreground">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="search">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    id="search"
                    placeholder="Buscar por evento, cliente ou local..."
                    className="pl-10 bg-background border-border text-foreground"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="min-w-[180px]">
                <Label htmlFor="status">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="realizado">Realizado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="min-w-[180px]">
                <Label htmlFor="tipo">Tipo</Label>
                <Select value={tipoFilter} onValueChange={setTipoFilter}>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Todos os tipos" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="show_pirotecnico">Show Pirotécnico</SelectItem>
                    <SelectItem value="venda_artigos">Venda de Artigos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Eventos */}
        <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm">
          <CardHeader>
            <CardTitle className="text-foreground">
              Eventos ({filteredEventos.length} de {eventos.length})
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Lista dos eventos cadastrados no sistema
            </CardDescription>
          </CardHeader>
      <CardContent>
            {filteredEventos.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">
                  {eventos.length === 0 ? "Nenhum evento encontrado" : "Nenhum evento corresponde aos filtros"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {eventos.length === 0 
                    ? "Não há eventos cadastrados no sistema ainda." 
                    : "Tente ajustar os filtros para encontrar eventos."
                  }
                </p>
                {eventos.length === 0 && (
                  <Button onClick={handleNewEvent}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Primeiro Evento
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop View */}
                <div className="hidden lg:block space-y-4">
                  {filteredEventos.map((evento) => {
                    const orc = evento.orcamentos;
                    return (
                  <Card key={evento.id} className="bg-card border border-border hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between gap-6">
                        {/* Informações principais */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1">
                          {/* Evento e Status */}
                          <div className="flex flex-col">
                            <div className="mb-3">
                              <h3 className="text-lg font-semibold text-foreground truncate">
                                {orc?.evento_nome || 'Evento sem nome'}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {orc?.tipo === 'show_pirotecnico' ? 'Show Pirotécnico' : 'Venda de Artigos'}
                              </p>
                            </div>
                            <Badge 
                              variant={
                                evento.status === 'confirmado' ? 'default' : 
                                evento.status === 'cancelado' ? 'destructive' : 'outline'
                              }
                              className="w-fit"
                            >
                              {evento.status === 'pendente' && 'Pendente'}
                              {evento.status === 'confirmado' && 'Confirmado'}
                              {evento.status === 'cancelado' && 'Cancelado'}
                            </Badge>
                          </div>
                          
                          {/* Cliente e Data */}
                          <div>
                            <div className="mb-3">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cliente</p>
                              <p className="font-medium text-foreground truncate">{orc?.nome_contratante || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data</p>
                              <p className="font-medium text-foreground">
                                {(() => {
                                  if (!orc?.evento_data) return '—'
                                  const d = new Date(orc.evento_data)
                                  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
                                })()}
                              </p>
                            </div>
                          </div>
                          
                          {/* Local */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Local</p>
                            <p className="font-medium text-foreground text-sm leading-tight" title={orc?.evento_local}>
                              {orc?.evento_local || '—'}
                            </p>
                          </div>
                          
                          {/* Valor e Margem */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Valor Total</p>
                            <p className="text-xl font-bold text-primary">
                              R$ {Number(orc?.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                            {orc?.orcamentos_produtos && orc.orcamentos_produtos.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Margem de Lucro</p>
                                <p className="text-sm font-semibold text-green-600">
                                  {(() => {
                                    const produtosUnicos = (orc.orcamentos_produtos || [])
                                      .filter((item, index, array) => {
                                        const key = `${item.produtos?.id}-${item.quantidade}-${item.valor_unitario}`;
                                        return array.findIndex(i => 
                                          `${i.produtos?.id}-${i.quantidade}-${i.valor_unitario}` === key
                                        ) === index;
                                      });
                                    const valorCompra = produtosUnicos.reduce((total, item) => {
                                      const produto = item.produtos;
                                      if (produto && produto.valor_compra) {
                                        return total + (produto.valor_compra * item.quantidade);
                                      }
                                      return total;
                                      }, 0);
                                    const valorVenda = Number(orc?.valor_total || 0);
                                    const margem = valorVenda - valorCompra;
                                    const percentual = valorCompra > 0 ? ((margem / valorCompra) * 100) : 0;
                                    return `R$ ${margem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${percentual.toFixed(1)}%)`;
                                  })()}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Ações */}
                        <div className="flex flex-col gap-2 shrink-0">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewDetails(evento)}
                            className="min-w-[100px]"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          
                          
                          {evento.status === 'pendente' && (
                            <Button 
                              size="sm"
                              onClick={() => handleUpdateStatus(evento.id, 'confirmado')}
                              className="min-w-[100px]"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Confirmar
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  )})}
                </div>

                {/* Mobile View */}
                <div className="lg:hidden space-y-3">
                  {filteredEventos.map((evento) => {
                    const orc = evento.orcamentos;
                    return (
                    <Card key={evento.id} className="bg-card border border-border hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {/* Header com nome e status */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-semibold text-foreground truncate">
                                {orc?.evento_nome || 'Evento'}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {orc?.tipo === 'show_pirotecnico' ? 'Show Pirotécnico' : 'Venda de Artigos'}
                              </p>
                            </div>
                            <Badge 
                              variant={
                                evento.status === 'confirmado' ? 'default' : 
                                evento.status === 'cancelado' ? 'destructive' : 'outline'
                              }
                              className="shrink-0"
                            >
                              {evento.status === 'pendente' && 'Pendente'}
                              {evento.status === 'confirmado' && 'Confirmado'}
                              {evento.status === 'cancelado' && 'Cancelado'}
                            </Badge>
                          </div>

                          {/* Informações em grid */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide font-medium">Cliente:</span>
                              <p className="font-medium text-foreground truncate">{orc?.nome_contratante || '—'}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide font-medium">Data:</span>
                              <p className="font-medium text-foreground">
                                {(() => {
                                  if (!orc?.evento_data) return '—'
                                  const d = new Date(orc.evento_data)
                                  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
                                })()}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide font-medium">Local:</span>
                              <p className="font-medium text-foreground text-sm leading-tight">{orc?.evento_local || '—'}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-xs uppercase tracking-wide font-medium">Valor Total:</span>
                              <p className="text-lg font-bold text-primary">
                                R$ {Number(orc?.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            {orc?.orcamentos_produtos && orc.orcamentos_produtos.length > 0 && (
                              <div>
                                <span className="text-muted-foreground block text-xs uppercase tracking-wide font-medium">Margem:</span>
                                <p className="text-sm font-semibold text-green-600">
                                  {(() => {
                                    const produtosUnicos = (orc.orcamentos_produtos || [])
                                      .filter((item, index, array) => {
                                        const key = `${item.produtos?.id}-${item.quantidade}-${item.valor_unitario}`;
                                        return array.findIndex(i => 
                                          `${i.produtos?.id}-${i.quantidade}-${i.valor_unitario}` === key
                                        ) === index;
                                      });
                                    const valorCompra = produtosUnicos.reduce((total, item) => {
                                      const produto = item.produtos;
                                      if (produto && produto.valor_compra) {
                                        return total + (produto.valor_compra * item.quantidade);
                                      }
                                      return total;
                                    }, 0);
                                    const valorVenda = Number(orc?.valor_total || 0);
                                    const margem = valorVenda - valorCompra;
                                    const percentual = valorCompra > 0 ? ((margem / valorCompra) * 100) : 0;
                                    return `${percentual.toFixed(1)}%`;
                                  })()}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Ações em linha */}
                          <div className="flex gap-2 pt-2 border-t border-border">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleViewDetails(evento)}
                              className="flex-1"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                            
                            
                            {evento.status === 'pendente' && (
                              <Button 
                                size="sm"
                                onClick={() => handleUpdateStatus(evento.id, 'confirmado')}
                                className="flex-1"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Confirmar
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )})}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Modal de Detalhes */}
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-2xl max-w-[95vw] bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Detalhes do Evento</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Informações completas sobre o evento selecionado
              </DialogDescription>
            </DialogHeader>
            
        {selectedEvento?.orcamentos && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Nome do Evento</Label>
                <p className="text-sm mt-1">{selectedEvento.orcamentos.evento_nome}</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Status</Label>
                <div className="mt-1">
                  <Badge 
                    variant={
                      selectedEvento.status === 'confirmado' ? 'default' : 
                      selectedEvento.status === 'cancelado' ? 'destructive' : 'outline'
                    }
                  >
                    {selectedEvento.status === 'pendente' && 'Pendente'}
                    {selectedEvento.status === 'confirmado' && 'Confirmado'}
                    {selectedEvento.status === 'cancelado' && 'Cancelado'}
                  </Badge>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Cliente</Label>
                <p className="text-sm mt-1">{selectedEvento.orcamentos.nome_contratante}</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Telefone</Label>
                <p className="text-sm mt-1">{selectedEvento.orcamentos.telefone || 'Não informado'}</p>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Data do Evento</Label>
                <p className="text-sm mt-1">
                  {(() => {
                    const d = new Date(selectedEvento.orcamentos.evento_data)
                    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
                  })()}
                </p>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Tipo</Label>
                <p className="text-sm mt-1">
                  {selectedEvento.orcamentos.tipo === 'show_pirotecnico' ? 'Show Pirotécnico' : 'Venda de Artigos'}
                </p>
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium">Local do Evento</Label>
              <p className="text-sm mt-1">{selectedEvento.orcamentos.evento_local}</p>
            </div>
            
            <div>
              <Label className="text-sm font-medium">Valor Total</Label>
              <p className="text-lg font-bold text-green-600 mt-1">
                R$ {Number(selectedEvento.orcamentos.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              {selectedEvento.status === 'pendente' && (
                <Button 
                  onClick={() => {
                    handleUpdateStatus(selectedEvento.id, 'confirmado');
                    setIsDetailsOpen(false);
                  }}
                >
                  Confirmar Evento
                </Button>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={() => setIsDetailsOpen(false)}
                  >
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </AdminLayout>
  );
};

export default AdminEventos;
