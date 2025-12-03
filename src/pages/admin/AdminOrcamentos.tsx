import { useState, useEffect, useCallback, useMemo } from "react";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useMemoizedStats } from "@/hooks/use-memoized-stats";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { FileText, Search, Plus, Eye, Edit, Trash2, Calendar, User, MapPin, DollarSign, CheckCircle, Clock, AlertCircle, Package, Calculator, TrendingUp, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { supabaseLeads, hasLeadsSource, mapLeadToSolicitacao } from "@/lib/supabase-leads";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContextSimple";
import { format, isThisMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/types/database";

type SolicitacaoOrcamento = Database['public']['Tables']['solicitacoes_orcamento']['Row'];
type Orcamento = Database['public']['Tables']['orcamentos']['Row'];
type Produto = Database['public']['Tables']['produtos']['Row'];
type OrcamentoProduto = Database['public']['Tables']['orcamentos_produtos']['Row'] & {
  produtos?: Produto;
};

type OrcamentoCompleto = Orcamento & {
  orcamentos_produtos?: OrcamentoProduto[];
  usuarios?: { nome: string };
};

const AdminOrcamentos = () => {
  const { toast } = useToast();
  const { userData } = useAuth();

  const handleGeneratePDF = useCallback(async (orcamento: OrcamentoCompleto) => {
    try {
      const pdfModule = await import("@/hooks/use-pdf-generator");
      const generatePDF = pdfModule.usePDFGenerator().generatePDF;
      await generatePDF(orcamento);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao gerar PDF",
        variant: "destructive",
      });
    }
  }, [toast]);
  
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoOrcamento[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoCompleto[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [selectedTab, setSelectedTab] = useState("solicitacoes");
  const [isOrcamentoDialogOpen, setIsOrcamentoDialogOpen] = useState(false);
  const [editingOrcamento, setEditingOrcamento] = useState<OrcamentoCompleto | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedOrcamento, setSelectedOrcamento] = useState<OrcamentoCompleto | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isFullEditOpen, setIsFullEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [orcamentoToDelete, setOrcamentoToDelete] = useState<string | null>(null);
  const [isSyncingLeads, setIsSyncingLeads] = useState(false);
  const [editForm, setEditForm] = useState({
    nome_contratante: '',
    telefone: '',
    cpf: '',
    evento_nome: '',
    evento_data: '',
    evento_local: '',
    valor_total: 0,
    status: 'pendente' as 'pendente' | 'processado' | 'aprovado' | 'realizado' | 'cancelado',
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
  const [isSolicitacaoDetailsOpen, setIsSolicitacaoDetailsOpen] = useState(false);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<SolicitacaoOrcamento | null>(null);
  const [isSolicitacaoEditOpen, setIsSolicitacaoEditOpen] = useState(false);
  const [solicitacaoEditForm, setSolicitacaoEditForm] = useState({
    nome_completo: '',
    email: '',
    whatsapp: '',
    tipo_solicitacao: '',
    tipo_evento: '',
    data_evento: '',
    localizacao_evento: '',
    detalhes_adicionais: ''
  });
  const [selectedProducts, setSelectedProducts] = useState<Array<{ produto_id: string; nome: string; quantidade: number; valor_unitario: number }>>([]);
  const [newProduct, setNewProduct] = useState({ produto_id: '', nome: '', quantidade: 1, valor_unitario: 0 });
  const [orcamentoForm, setOrcamentoForm] = useState({
    tipo: 'venda_artigos' as 'show_pirotecnico' | 'venda_artigos',
    nome_contratante: '',
    telefone: '',
    cpf: '',
    evento_nome: '',
    evento_data: '',
    evento_local: '',
    modo_pagamento: 'dinheiro' as 'dinheiro' | 'pix' | 'cartao' | 'transferencia',
    margem_lucro: 30
  });

  const fetchSolicitacoes = useCallback(async () => {
    setIsSyncingLeads(true);
    try {
      if (hasLeadsSource && supabaseLeads) {
        const { data, error } = await supabaseLeads
          .from('lead_submissions')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('[Orçamentos] lead_submissions indisponível:', error.message);
          setSolicitacoes([]);
        } else {
          setSolicitacoes((data || []).map(mapLeadToSolicitacao));
        }
      } else {
        const { data, error } = await supabase
          .from('solicitacoes_orcamento')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          // 42P01 = undefined_table. Tratar como ausência do recurso no ambiente atual.
          if ((error as any).code === '42P01') {
            console.warn('[Orçamentos] solicitacoes_orcamento indisponível:', error.message);
            setSolicitacoes([]);
          } else {
            console.error('Erro ao buscar solicitações:', error);
            throw error;
          }
        } else {
          setSolicitacoes(data || []);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao carregar solicitações:', error);
      toast({
        title: "Erro ao carregar solicitações",
        description: "Não foi possível carregar as solicitações de orçamento.",
        variant: "destructive",
      });
    } finally {
      setIsSyncingLeads(false);
    }
  }, [toast, hasLeadsSource, supabaseLeads]);

  const fetchOrcamentos = useCallback(async () => {
    try {
      
      // Buscar orçamentos regulares
      const { data: orcamentosData, error: orcamentosError } = await supabase
        .from('orcamentos')
        .select(`
          *,
          orcamentos_produtos!inner (
            id,
            produto_id,
            quantidade,
            valor_unitario,
            produtos (
              id,
              codigo,
              nome_produto,
              categoria,
              valor_venda,
              duracao_segundos
            )
          ),
          usuarios (
            nome
          )
        `)
        .order('created_at', { ascending: false });

      // Filtrar duplicações no frontend
      const orcamentosLimpos = orcamentosData?.map(orcamento => {
        const produtosUnicos = orcamento.orcamentos_produtos?.filter((produto, index, array) => {
          return array.findIndex(p => 
            p.produto_id === produto.produto_id && 
            p.quantidade === produto.quantidade && 
            p.valor_unitario === produto.valor_unitario
          ) === index;
        });
        
        return {
          ...orcamento,
          orcamentos_produtos: produtosUnicos
        };
      });

      if (orcamentosError) {
        console.error('Erro ao buscar orçamentos:', orcamentosError);
        throw orcamentosError;
      }

      // Buscar solicitações "Contratar Equipe" para mostrar como orçamentos
      const { data: solicitacoesEquipe, error: solicitacoesError } = await supabase
        .from('solicitacoes_orcamento')
        .select('*')
        .eq('tipo_solicitacao', 'contratar_equipe')
        .order('created_at', { ascending: false });

      if (solicitacoesError) {
        console.error('Erro ao buscar solicitações de equipe:', solicitacoesError);
        throw solicitacoesError;
      }

      // Converter solicitações "Contratar Equipe" para formato de orçamento
      const orcamentosFromSolicitacoes = (solicitacoesEquipe || []).map(solicitacao => ({
        id: `solicitacao_${solicitacao.id}`,
        tipo: 'show_pirotecnico' as const,
        nome_contratante: solicitacao.nome_completo,
        telefone: solicitacao.whatsapp,
        cpf: '',
        evento_nome: `${solicitacao.tipo_evento} - ${solicitacao.nome_completo}`,
        evento_data: solicitacao.data_evento || '',
        evento_local: solicitacao.localizacao_evento || '',
        modo_pagamento: 'dinheiro' as const,
        valor_total: 0,
        margem_lucro: 0,
        status: 'pendente' as const,
        created_at: solicitacao.created_at,
        solicitacao_origem: solicitacao, // Manter referência à solicitação original
        orcamentos_produtos: [],
        usuarios: null
      }));

      // Combinar orçamentos regulares (limpos) com os convertidos de solicitações
      const todosOrcamentos = [...(orcamentosLimpos || []), ...orcamentosFromSolicitacoes];
      
      setOrcamentos(todosOrcamentos);
    } catch (error) {
      console.error('❌ Erro ao carregar orçamentos:', error);
      toast({
        title: "Erro ao carregar orçamentos",
        description: "Não foi possível carregar os orçamentos.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const fetchProdutos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .eq('ativo', true)
        .order('nome_produto');

      if (error) throw error;
      setProdutos(data || []);
    } catch (error) {
      console.error('❌ Erro ao carregar produtos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    await Promise.all([
      fetchSolicitacoes(),
      fetchOrcamentos(),
      fetchProdutos()
    ]);
  }, [fetchSolicitacoes, fetchOrcamentos, fetchProdutos]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Função para filtrar e ordenar produtos
  const sortedFilteredProducts = produtos.filter(produto => {
    // Filtro por termo de busca
    const searchMatch = !productSearchTerm || 
      produto.nome_produto.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      produto.codigo.toLowerCase().includes(productSearchTerm.toLowerCase());
    
    // Filtro por categoria
    const categoryMatch = productCategoryFilter === "all" || 
      produto.categoria.toLowerCase() === productCategoryFilter;
    
    // Filtro por efeito
    const effectMatch = productEffectFilter === "all" || 
      (produto.efeito && produto.efeito.toLowerCase() === productEffectFilter.toLowerCase());
    
    return searchMatch && categoryMatch && effectMatch;
  });

  // Ordenação por preço
  if (productPriceSort === "asc") {
    sortedFilteredProducts.sort((a, b) => a.valor_venda - b.valor_venda);
  } else if (productPriceSort === "desc") {
    sortedFilteredProducts.sort((a, b) => b.valor_venda - a.valor_venda);
  }

  // Ordenação por duração
  if (productDurationSort === "asc") {
    sortedFilteredProducts.sort((a, b) => (a.duracao_segundos || 0) - (b.duracao_segundos || 0));
  } else if (productDurationSort === "desc") {
    sortedFilteredProducts.sort((a, b) => (b.duracao_segundos || 0) - (a.duracao_segundos || 0));
  }

  const filteredSolicitacoes = solicitacoes.filter(solicitacao => {
    const matchesSearch = 
      solicitacao.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      solicitacao.whatsapp.includes(searchTerm) ||
      (solicitacao.email && solicitacao.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesTipo = filterTipo === "all" || solicitacao.tipo_solicitacao === filterTipo;

    return matchesSearch && matchesTipo;
  });

  // Filtros base sem busca de texto (otimizado)
  const baseFilteredOrcamentos = useMemo(() => {
    return orcamentos.filter(orcamento => {
      const matchesStatus = filterStatus === "all" || orcamento.status === filterStatus;
      return matchesStatus;
    });
  }, [orcamentos, filterStatus]);

  // Busca otimizada com debounce
  const { filteredItems: filteredOrcamentos } = useDebouncedSearch(
    baseFilteredOrcamentos,
    searchTerm,
    ['nome_contratante', 'evento_nome', 'telefone']
  );

  // Estatísticas otimizadas com memoização
  const stats = useMemoizedStats(orcamentos, {
    total: (items) => items.length,
    confirmados: (items) => items.filter(o => o.status === 'confirmado').length,
    pendentes: (items) => items.filter(o => o.status === 'pendente').length,
    faturamentoMes: (items) => items
      .filter(o => o.status === 'confirmado' && isThisMonth(new Date(o.created_at!)))
      .reduce((sum, o) => sum + (o.valor_total || 0), 0)
  });

  const solicitacoesPendentes = useMemo(() => 
    solicitacoes.filter(s => !s.enviado_email).length, 
    [solicitacoes]
  );

  const getStatusColor = (enviado: boolean) => {
    return enviado ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800";
  };

  const getTipoLabel = (tipo: string) => {
    return tipo === "artigos_pirotecnicos" ? "Artigos Pirotécnicos" : "Contratar Equipe";
  };

  // Evita deslocamento de fuso: formata usando apenas a parte da data (YYYY-MM-DD)
  const formatDate = (date: string) => {
    if (!date) return '';
    const [y, m, d] = date.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  };

  const formatDateOnly = formatDate;

  const calculateOrcamentoTotal = () => {
    const subtotal = selectedProducts.reduce((sum, item) => 
      sum + (item.quantidade * item.valor_unitario), 0
    );
    // Aplicar margem de lucro: para 30% de margem, adiciona 30% ao subtotal
    return subtotal + (subtotal * orcamentoForm.margem_lucro / 100);
  };

  const handleCreateOrcamento = async () => {
    if (!userData || selectedProducts.length === 0) {
      toast({
        title: "Erro",
        description: "Adicione pelo menos um produto ao orçamento.",
        variant: "destructive",
      });
      return;
    }

    try {
      const valorTotal = calculateOrcamentoTotal();
      
      // Corrigir a data do evento para evitar problemas de timezone
      const eventoDataCorrigida = orcamentoForm.evento_data 
        ? new Date(orcamentoForm.evento_data + 'T12:00:00').toISOString().split('T')[0]
        : orcamentoForm.evento_data;
      
      const { data: orcamento, error: orcamentoError } = await supabase
        .from('orcamentos')
        .insert({
          ...orcamentoForm,
          evento_data: eventoDataCorrigida,
          valor_total: valorTotal,
          created_by: userData.id
        })
        .select()
        .single();

      if (orcamentoError) throw orcamentoError;

      // Inserir produtos do orçamento
      const orcamentoProdutos = selectedProducts.map(item => ({
        orcamento_id: orcamento.id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_total: item.quantidade * item.valor_unitario
      }));

      const { error: produtosError } = await supabase
        .from('orcamentos_produtos')
        .insert(orcamentoProdutos);

      if (produtosError) throw produtosError;

      toast({
        title: "Orçamento criado!",
        description: "O orçamento foi criado com sucesso.",
      });

      setIsOrcamentoDialogOpen(false);
      resetOrcamentoForm();
      fetchOrcamentos();
    } catch (error) {
      console.error('❌ Erro ao criar orçamento:', error);
      toast({
        title: "Erro ao criar orçamento",
        description: "Não foi possível criar o orçamento.",
        variant: "destructive",
      });
    }
  };

  const resetOrcamentoForm = () => {
    setOrcamentoForm({
      tipo: 'venda_artigos',
      nome_contratante: '',
      telefone: '',
      cpf: '',
      evento_nome: '',
      evento_data: '',
      evento_local: '',
      modo_pagamento: 'dinheiro',
      margem_lucro: 30
    });
    setSelectedProducts([]);
    setEditingOrcamento(null);
  };

  const addProductToOrcamento = (product: { produto_id: number, nome: string, valor_unitario: number, quantidade: number }) => {
    setSelectedProducts([...selectedProducts, product]);
  };

  const removeProductFromOrcamento = (index: number) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  const updateProductInOrcamento = (index: number, updatedProduct: { produto_id: string; nome: string; quantidade: number; valor_unitario: number }) => {
    const updated = [...selectedProducts];
    updated[index] = updatedProduct;
    setSelectedProducts(updated);
  };

  const handleMarkSolicitacaoProcessed = async (id: string) => {
    // Quando a fonte é externa, evitamos mutar o outro projeto.
    if (hasLeadsSource) {
      toast({
        title: "Fonte externa",
        description: "Processamento visual apenas — não alteramos lead_submissions.",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('solicitacoes_orcamento')
        .update({ enviado_email: true })
        .eq('id', id);

      if (error && (error as any).code !== '42P01') throw error;

      toast({
        title: "Solicitação marcada como processada",
        description: "A solicitação foi marcada como processada.",
      });

      fetchSolicitacoes();
    } catch (error) {
      toast({
        title: "Erro ao processar solicitação",
        description: "Não foi possível marcar a solicitação como processada.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteOrcamento = (id: string) => {
    setOrcamentoToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteOrcamento = async () => {
    if (!orcamentoToDelete) return;
    
    try {
      // Verificar se é um orçamento real ou convertido de solicitação
      if (orcamentoToDelete.startsWith('solicitacao_')) {
        // É uma solicitação convertida - excluir da tabela solicitacoes_orcamento
        const solicitacaoId = orcamentoToDelete.replace('solicitacao_', '');
        
        const { error: solicitacaoError } = await supabase
          .from('solicitacoes_orcamento')
          .delete()
          .eq('id', solicitacaoId);

        if (solicitacaoError && (solicitacaoError as any).code !== '42P01') {
          console.error('Erro ao excluir solicitação:', solicitacaoError);
          throw solicitacaoError;
        }

        toast({
          title: "Solicitação excluída!",
          description: "A solicitação foi removida com sucesso.",
        });
      } else {
        // É um orçamento real - excluir da tabela orcamentos
        // Primeiro, excluir produtos associados do orçamento
        const { error: produtosError } = await supabase
          .from('orcamentos_produtos')
          .delete()
          .eq('orcamento_id', orcamentoToDelete);

        if (produtosError) {
          console.error('Erro ao excluir produtos do orçamento:', produtosError);
          throw produtosError;
        }

        // Depois, excluir o orçamento
        const { error: orcamentoError } = await supabase
          .from('orcamentos')
          .delete()
          .eq('id', orcamentoToDelete);

        if (orcamentoError) {
          console.error('Erro ao excluir orçamento:', orcamentoError);
          throw orcamentoError;
        }

        toast({
          title: "Orçamento excluído!",
          description: "O orçamento foi removido com sucesso.",
        });
      }

      fetchOrcamentos();
      setIsDeleteConfirmOpen(false);
      setOrcamentoToDelete(null);
    } catch (error) {
      console.error('Erro completo ao excluir:', error);
      toast({
        title: "Erro ao excluir",
        description: error?.message || "Não foi possível excluir o item.",
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = useCallback((orcamento: OrcamentoCompleto) => {
    setSelectedOrcamento(orcamento);
    setIsDetailsOpen(true);
  }, []);

  const handleEditOrcamento = useCallback((orcamento: OrcamentoCompleto) => {
    setSelectedOrcamento(orcamento);
    setIsEditOpen(true);
  }, []);

  const handleFullEdit = useCallback((orcamento: OrcamentoCompleto) => {
    setSelectedOrcamento(orcamento);
    
    // Preparar dados do formulário
    setEditForm({
      nome_contratante: orcamento.nome_contratante,
      telefone: orcamento.telefone || '',
      cpf: orcamento.cpf || '',
      evento_nome: orcamento.evento_nome,
      evento_data: orcamento.evento_data,
      evento_local: orcamento.evento_local,
      valor_total: orcamento.valor_total || 0,
      status: orcamento.status as 'pendente' | 'processado' | 'aprovado' | 'realizado' | 'cancelado',
      produtos: (orcamento.orcamentos_produtos || [])
        .filter((op, index, array) => {
          // Remove duplicatas baseado em produto_id + quantidade + valor_unitario
          const key = `${op.produto_id}-${op.quantidade}-${op.valor_unitario}`;
          return array.findIndex(item => 
            `${item.produto_id}-${item.quantidade}-${item.valor_unitario}` === key
          ) === index;
        })
        .map(op => ({
          produto_id: op.produto_id!,
          nome: op.produtos?.nome_produto || '',
          quantidade: op.quantidade,
          valor_unitario: op.produtos?.valor_venda || op.valor_unitario
        }))
    });
    
    setIsFullEditOpen(true);
  }, []);

  const handleSaveFullEdit = async () => {
    if (!selectedOrcamento) return;

    try {
      // Calcular valor total
      const valorTotal = editForm.produtos.reduce((sum, p) => {
        const quantidade = Number(p.quantidade) || 0;
        const valorUnitario = Number(p.valor_unitario) || 0;
        return sum + (quantidade * valorUnitario);
      }, 0);

      // Verificar se houve mudança de status para controle de estoque
      const statusAnterior = selectedOrcamento.status;
      const novoStatus = editForm.status;
      
      // Atualizar dados básicos do orçamento
      const { error: orcamentoError } = await supabase
        .from('orcamentos')
        .update({
          nome_contratante: editForm.nome_contratante,
          telefone: editForm.telefone,
          cpf: editForm.cpf,
          evento_nome: editForm.evento_nome,
          evento_data: editForm.evento_data,
          evento_local: editForm.evento_local,
          valor_total: valorTotal,
          status: editForm.status
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

      // Controle de estoque baseado na mudança de status
      if (statusAnterior !== novoStatus) {
        
        // Se mudou para aprovado - abater do estoque  
        if ((statusAnterior === 'pendente' || statusAnterior === 'cancelado') && (novoStatus === 'aprovado' || novoStatus === 'confirmado')) {
          
          for (const produto of editForm.produtos) {
            // Buscar dados atuais do produto
            const { data: produtoData, error: produtoError } = await supabase
              .from('produtos')
              .select('quantidade_disponivel')
              .eq('id', produto.produto_id)
              .single();

            if (produtoError || !produtoData) {
              console.error(`Erro ao buscar produto ${produto.nome}:`, produtoError);
              continue;
            }

            const novaQuantidade = produtoData.quantidade_disponivel - produto.quantidade;
            
            if (novaQuantidade < 0) {
              throw new Error(`Estoque insuficiente para ${produto.nome}. Disponível: ${produtoData.quantidade_disponivel}, Necessário: ${produto.quantidade}`);
            }

            // Atualizar estoque do produto
            const { error: estoqueError } = await supabase
              .from('produtos')
              .update({ quantidade_disponivel: novaQuantidade })
              .eq('id', produto.produto_id);

            if (estoqueError) throw estoqueError;

            // Registrar histórico de movimentação
            const { error: historicoError } = await supabase
              .from('historico_estoque')
              .insert({
                produto_id: produto.produto_id,
                tipo_movimentacao: 'saida',
                quantidade_anterior: produtoData.quantidade_disponivel,
                quantidade_movimentada: produto.quantidade,
                quantidade_atual: novaQuantidade,
                motivo: `Orçamento aprovado - ${editForm.evento_nome}`
              });

            if (historicoError) {
              console.error('Erro ao registrar histórico:', historicoError);
            }
          }
        }
        
        // Se mudou de confirmado para cancelado - devolver ao estoque
        if (statusAnterior === 'confirmado' && novoStatus === 'cancelado') {
          
          for (const produto of editForm.produtos) {
            // Buscar dados atuais do produto
            const { data: produtoData, error: produtoError } = await supabase
              .from('produtos')
              .select('quantidade_disponivel')
              .eq('id', produto.produto_id)
              .single();

            if (produtoError || !produtoData) {
              console.error(`Erro ao buscar produto ${produto.nome}:`, produtoError);
              continue;
            }

            const novaQuantidade = produtoData.quantidade_disponivel + produto.quantidade;

            // Atualizar estoque do produto
            const { error: estoqueError } = await supabase
              .from('produtos')
              .update({ quantidade_disponivel: novaQuantidade })
              .eq('id', produto.produto_id);

            if (estoqueError) throw estoqueError;

            // Registrar histórico de movimentação
            const { error: historicoError } = await supabase
              .from('historico_estoque')
              .insert({
                produto_id: produto.produto_id,
                tipo_movimentacao: 'entrada',
                quantidade_anterior: produtoData.quantidade_disponivel,
                quantidade_movimentada: produto.quantidade,
                quantidade_atual: novaQuantidade,
                motivo: `Orçamento cancelado - ${editForm.evento_nome}`
              });

            if (historicoError) {
              console.error('Erro ao registrar histórico:', historicoError);
            }
          }
        }
      }

      toast({
        title: "Orçamento atualizado!",
        description: "O orçamento foi atualizado com sucesso.",
      });

      setIsFullEditOpen(false);
      
      // Recarregar dados
      await fetchOrcamentos();
    } catch (error) {
      console.error('Erro ao salvar orçamento:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o orçamento",
        variant: "destructive",
      });
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      // Verificar se é um orçamento real ou convertido de solicitação
      if (id.startsWith('solicitacao_')) {
        // Para solicitações convertidas, não podemos atualizar status já que não existem na tabela orcamentos
        // Elas devem ser convertidas em orçamentos reais primeiro
        toast({
          title: "Ação não permitida",
          description: "Para alterar o status, primeiro converta a solicitação em orçamento.",
          variant: "destructive",
        });
        return;
      }

      // Buscar orçamento atual com produtos
      const { data: orcamentoAtual, error: fetchError } = await supabase
        .from('orcamentos')
        .select(`
          *,
          orcamentos_produtos (
            *,
            produtos (*)
          )
        `)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const statusAnterior = orcamentoAtual.status;

      // CORREÇÃO: O banco só aceita ['pendente', 'confirmado', 'cancelado']
      // Mapear status visuais para status do banco
      let dbStatus = newStatus;
      switch (newStatus) {
        case 'processado':
        case 'aprovado': 
        case 'realizado':
        case 'confirmado':
          dbStatus = 'confirmado'; // Todos os status "positivos" viram 'confirmado'
          break;
        case 'pendente':
        case 'cancelado':
          dbStatus = newStatus; // Mantém como está
          break;
        default:
          dbStatus = 'pendente';
      }

      // Atualizar status do orçamento no banco
      const { error } = await supabase
        .from('orcamentos')
        .update({ status: dbStatus })
        .eq('id', id);

      if (error) throw error;

      // Armazenar o status visual no localStorage para exibição correta
      const statusDisplay = JSON.parse(localStorage.getItem('orcamentos_status_display') || '{}');
      statusDisplay[id] = newStatus;
      localStorage.setItem('orcamentos_status_display', JSON.stringify(statusDisplay));

      // Controle de estoque automático
      if (orcamentoAtual.orcamentos_produtos && orcamentoAtual.orcamentos_produtos.length > 0) {
        
        // Se mudou para aprovado - abater do estoque
        if ((statusAnterior === 'pendente' || statusAnterior === 'cancelado') && (newStatus === 'aprovado' || newStatus === 'confirmado')) {
          
          for (const item of orcamentoAtual.orcamentos_produtos) {
            const novaQuantidade = item.produtos.quantidade_disponivel - item.quantidade;
            
            if (novaQuantidade < 0) {
              throw new Error(`Estoque insuficiente para ${item.produtos.nome_produto}. Disponível: ${item.produtos.quantidade_disponivel}, Necessário: ${item.quantidade}`);
            }

            // Atualizar estoque do produto
            const { error: estoqueError } = await supabase
              .from('produtos')
              .update({ quantidade_disponivel: novaQuantidade })
              .eq('id', item.produto_id);

            if (estoqueError) throw estoqueError;

            // Registrar histórico de movimentação
            const { error: historicoError } = await supabase
              .from('historico_estoque')
              .insert({
                produto_id: item.produto_id,
                tipo_movimentacao: 'saida',
                quantidade_anterior: item.produtos.quantidade_disponivel,
                quantidade_movimentada: item.quantidade,
                quantidade_atual: novaQuantidade,
                motivo: `Orçamento aprovado - ${orcamentoAtual.evento_nome}`
              });

            if (historicoError) throw historicoError;
          }
        }
        
        // Se mudou de confirmado para cancelado - devolver ao estoque  
        else if (statusAnterior === 'confirmado' && newStatus === 'cancelado') {
          
          for (const item of orcamentoAtual.orcamentos_produtos) {
            const novaQuantidade = item.produtos.quantidade_disponivel + item.quantidade;

            // Atualizar estoque do produto
            const { error: estoqueError } = await supabase
              .from('produtos')
              .update({ quantidade_disponivel: novaQuantidade })
              .eq('id', item.produto_id);

            if (estoqueError) throw estoqueError;

            // Registrar histórico de movimentação
            const { error: historicoError } = await supabase
              .from('historico_estoque')
              .insert({
                produto_id: item.produto_id,
                tipo_movimentacao: 'entrada',
                quantidade_anterior: item.produtos.quantidade_disponivel,
                quantidade_movimentada: item.quantidade,
                quantidade_atual: novaQuantidade,
                motivo: `Orçamento cancelado - ${orcamentoAtual.evento_nome}`
              });

            if (historicoError) throw historicoError;
          }
        }
      }

      toast({
        title: "Status atualizado",
        description: `Status do orçamento foi alterado para ${newStatus}${newStatus === 'aprovado' ? '. Estoque atualizado.' : newStatus === 'cancelado' ? '. Produtos devolvidos ao estoque.' : ''}`,
      });

      fetchOrcamentos();
      fetchProdutos(); // Atualizar lista de produtos para refletir mudanças no estoque
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Não foi possível atualizar o status",
        variant: "destructive",
      });
    }
  };

  // Funções para gerenciar solicitações
  const handleViewSolicitacaoDetails = (solicitacao: SolicitacaoOrcamento) => {
    setSelectedSolicitacao(solicitacao);
    setIsSolicitacaoDetailsOpen(true);
  };

  const handleEditSolicitacao = (solicitacao: SolicitacaoOrcamento) => {
    // Se for solicitação de contratar equipe, abrir formulário de orçamento preenchido
    if (solicitacao.tipo_solicitacao === 'contratar_equipe') {
      setEditForm({
        nome_contratante: solicitacao.nome_completo,
        telefone: solicitacao.whatsapp,
        cpf: '',
        evento_nome: solicitacao.tipo_evento || 'Show Pirotécnico',
        evento_data: solicitacao.data_evento || '',
        evento_local: solicitacao.localizacao_evento || '',
        valor_total: 0,
        produtos: []
      });
      setEditingOrcamento(null);
      setIsOrcamentoDialogOpen(true);
      toast({
        title: "📋 Orçamento Iniciado",
        description: `Dados de ${solicitacao.nome_completo} carregados. Adicione produtos para completar.`,
        className: "border-blue-200 bg-blue-50 text-blue-800",
      });
    } else {
      // Para outros tipos, usar edição normal de solicitação
      setSelectedSolicitacao(solicitacao);
      setSolicitacaoEditForm({
        nome_completo: solicitacao.nome_completo,
        email: solicitacao.email || '',
        whatsapp: solicitacao.whatsapp,
        tipo_solicitacao: solicitacao.tipo_solicitacao,
        tipo_evento: solicitacao.tipo_evento || '',
        data_evento: solicitacao.data_evento || '',
        localizacao_evento: solicitacao.localizacao_evento || '',
        detalhes_adicionais: solicitacao.detalhes_adicionais || ''
      });
      setIsSolicitacaoEditOpen(true);
    }
  };

  const handleUpdateSolicitacao = async () => {
    if (!selectedSolicitacao) return;

    if (hasLeadsSource) {
      toast({
        title: "Edição indisponível",
        description: "Leads vêm de outro projeto (lead_submissions). Edite lá ou converta em orçamento aqui.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('solicitacoes_orcamento')
        .update(solicitacaoEditForm)
        .eq('id', selectedSolicitacao.id);

      if (error && (error as any).code !== '42P01') throw error;

      toast({
        title: "Solicitação atualizada",
        description: "As informações da solicitação foram atualizadas com sucesso.",
      });

      setIsSolicitacaoEditOpen(false);
      fetchSolicitacoes();
    } catch (error) {
      toast({
        title: "Erro ao atualizar solicitação",
        description: "Não foi possível atualizar a solicitação.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSolicitacao = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta solicitação?')) return;

    if (hasLeadsSource) {
      toast({
        title: "Exclusão bloqueada",
        description: "Leads externos não são excluídos daqui.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('solicitacoes_orcamento')
        .delete()
        .eq('id', id);

      if (error && (error as any).code !== '42P01') throw error;

      toast({
        title: "Solicitação excluída!",
        description: "A solicitação foi removida com sucesso.",
      });

      fetchSolicitacoes();
    } catch (error) {
      toast({
        title: "Erro ao excluir solicitação",
        description: "Não foi possível excluir a solicitação.",
        variant: "destructive",
      });
    }
  };

  const getVisualStatus = (orcamentoId: string, dbStatus: string) => {
    const statusDisplay = JSON.parse(localStorage.getItem('orcamentos_status_display') || '{}');
    return statusDisplay[orcamentoId] || dbStatus;
  };

  const getOrcamentoStatusBadge = (status: string, orcamentoId?: string) => {
    const displayStatus = orcamentoId ? getVisualStatus(orcamentoId, status) : status;
    
    switch (displayStatus) {
      case 'pendente':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pendente</Badge>;
      case 'processado':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Processado</Badge>;
      case 'aprovado':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Aprovado</Badge>;
      case 'realizado':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Realizado</Badge>;
      case 'cancelado':
        return <Badge variant="destructive">Cancelado</Badge>;
      case 'confirmado':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Confirmado</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-40 sm:h-52 md:h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">Carregando dados...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold">Gestão de Orçamentos</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Gerencie solicitações e orçamentos do sistema
            </p>
          </div>
          <Dialog open={isOrcamentoDialogOpen} onOpenChange={setIsOrcamentoDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 sm:h-9 md:h-10 mt-2 sm:mt-0" onClick={() => setIsOrcamentoDialogOpen(true)}>
                <Plus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm">Novo Orçamento</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Criar Novo Orçamento</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Crie um orçamento completo com produtos e valores
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                {/* Dados do Cliente */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="tipo" className="text-xs sm:text-sm text-foreground">Tipo de Orçamento</Label>
                    <Select 
                      value={orcamentoForm.tipo} 
                      onValueChange={(value: 'show_pirotecnico' | 'venda_artigos') => 
                        setOrcamentoForm({...orcamentoForm, tipo: value})
                      }
                    >
                      <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm bg-background border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border">
                        <SelectItem value="venda_artigos" className="text-xs sm:text-sm text-foreground hover:bg-muted">Venda de Artigos</SelectItem>
                        <SelectItem value="show_pirotecnico" className="text-xs sm:text-sm text-foreground hover:bg-muted">Show Pirotécnico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="nome_contratante" className="text-xs sm:text-sm text-foreground">Nome do Contratante</Label>
                    <Input
                      id="nome_contratante"
                      value={orcamentoForm.nome_contratante}
                      onChange={(e) => setOrcamentoForm({...orcamentoForm, nome_contratante: e.target.value})}
                      placeholder="Nome completo"
                      className="h-8 sm:h-10 text-xs sm:text-sm bg-background border-border text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="telefone" className="text-xs sm:text-sm text-foreground">Telefone</Label>
                    <Input
                      id="telefone"
                      value={orcamentoForm.telefone}
                      onChange={(e) => setOrcamentoForm({...orcamentoForm, telefone: e.target.value})}
                      placeholder="(00) 00000-0000"
                      className="h-8 sm:h-10 text-xs sm:text-sm bg-background border-border text-foreground"
                    />
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="cpf" className="text-xs sm:text-sm text-foreground">CPF</Label>
                    <Input
                      id="cpf"
                      value={orcamentoForm.cpf}
                      onChange={(e) => setOrcamentoForm({...orcamentoForm, cpf: e.target.value})}
                      placeholder="000.000.000-00"
                      className="h-8 sm:h-10 text-xs sm:text-sm bg-background border-border text-foreground"
                    />
                  </div>
                </div>

                <Separator className="my-3 sm:my-4" />

                {/* Dados do Evento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="evento_nome" className="text-xs sm:text-sm text-foreground">Nome do Evento</Label>
                    <Input
                      id="evento_nome"
                      value={orcamentoForm.evento_nome}
                      onChange={(e) => setOrcamentoForm({...orcamentoForm, evento_nome: e.target.value})}
                      placeholder="Ex: Casamento, Formatura..."
                      className="h-8 sm:h-10 text-xs sm:text-sm bg-background border-border text-foreground"
                    />
                  </div>
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="evento_data" className="text-xs sm:text-sm text-foreground">Data do Evento</Label>
                    <Input
                      id="evento_data"
                      type="date"
                      value={orcamentoForm.evento_data}
                      onChange={(e) => setOrcamentoForm({...orcamentoForm, evento_data: e.target.value})}
                      className="h-8 sm:h-10 text-xs sm:text-sm bg-background border-border text-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="evento_local" className="text-xs sm:text-sm text-foreground">Local do Evento</Label>
                  <Input
                    id="evento_local"
                    value={orcamentoForm.evento_local}
                    onChange={(e) => setOrcamentoForm({...orcamentoForm, evento_local: e.target.value})}
                    placeholder="Endereço completo do evento"
                    className="h-8 sm:h-10 text-xs sm:text-sm bg-background border-border text-foreground"
                  />
                </div>

                <Separator className="my-3 sm:my-4" />

                {/* Seleção de Produtos */}
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm sm:text-base font-medium">Produtos Selecionados ({selectedProducts.length})</h3>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setSelectedProducts([])}
                      className="h-7 sm:h-8 text-xs sm:text-sm"
                      disabled={selectedProducts.length === 0}
                    >
                      Limpar Todos
                    </Button>
                  </div>

                  {/* Tabela de produtos selecionados */}
                  {selectedProducts.length > 0 ? (
                    <div className="border border-primary/20 rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-primary/5 border-primary/20">
                            <TableHead className="w-[40%] text-xs sm:text-sm font-semibold">Produto</TableHead>
                            <TableHead className="text-xs sm:text-sm font-semibold">Valor Unit.</TableHead>
                            <TableHead className="text-xs sm:text-sm font-semibold">Qtd</TableHead>
                            <TableHead className="text-right text-xs sm:text-sm font-semibold">Subtotal</TableHead>
                            <TableHead className="w-[5%]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedProducts.map((product, index) => (
                            <TableRow key={index} className="border-primary/10 hover:bg-primary/5">
                              <TableCell className="font-medium text-xs sm:text-sm">{product.nome}</TableCell>
                              <TableCell className="text-xs sm:text-sm">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={product.valor_unitario}
                                  onChange={(e) => {
                                    const newValue = parseFloat(e.target.value) || 0;
                                    updateProductInOrcamento(index, {
                                      ...product,
                                      valor_unitario: newValue
                                    });
                                  }}
                                  className="h-7 sm:h-8 text-xs sm:text-sm w-20 sm:w-24"
                                />
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm">
                                <Input
                                  type="number"
                                  min="1"
                                  value={product.quantidade}
                                  onChange={(e) => {
                                    const newQty = parseInt(e.target.value) || 1;
                                    updateProductInOrcamento(index, {
                                      ...product,
                                      quantidade: newQty
                                    });
                                  }}
                                  className="h-7 sm:h-8 text-xs sm:text-sm w-16 sm:w-20"
                                />
                              </TableCell>
                              <TableCell className="text-right text-xs sm:text-sm">
                                R$ {(product.quantidade * product.valor_unitario).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeProductFromOrcamento(index)}
                                  className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="border rounded-md p-6 text-center bg-muted/30">
                      <Package className="h-8 w-8 sm:h-10 sm:w-10 mx-auto text-muted-foreground" />
                      <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                        Nenhum produto selecionado. Adicione produtos ao orçamento.
                      </p>
                    </div>
                  )}

                  {/* Seletor de produtos com filtros inteligentes */}
                  <div className="border rounded-md p-3 sm:p-4 bg-muted/20 space-y-3 sm:space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs sm:text-sm font-medium">Adicionar Produtos</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearchTerm('');
                          setProductCategoryFilter('all');
                          setProductEffectFilter('all');
                          setProductPriceSort('none');
                          setProductDurationSort('none');
                        }}
                        className="h-7 text-xs"
                      >
                        Limpar Filtros
                      </Button>
                    </div>
                    
                    {/* Filtros */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                      {/* Busca */}
                      <div className="relative">
                        <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                        <Input
                          placeholder="Buscar produto..."
                          className="pl-7 h-8 text-xs"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>

                      {/* Filtro por categoria */}
                      <Select 
                        value={productCategoryFilter} 
                        onValueChange={setProductCategoryFilter}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as categorias</SelectItem>
                          <SelectItem value="tortas">Tortas</SelectItem>
                          <SelectItem value="rojoes">Rojões</SelectItem>
                          <SelectItem value="fumacas">Fumaças</SelectItem>
                          <SelectItem value="cascatas">Cascatas</SelectItem>
                          <SelectItem value="granadas">Granadas</SelectItem>
                          <SelectItem value="lancador">Lançadores</SelectItem>
                          <SelectItem value="cha_revelacao">Chá Revelação</SelectItem>
                          <SelectItem value="metralhas">Metralhas</SelectItem>
                          <SelectItem value="papel_picado">Papel Picado</SelectItem>
                          <SelectItem value="acessorios">Acessórios</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Filtro por efeito */}
                      <Select 
                        value={productEffectFilter} 
                        onValueChange={setProductEffectFilter}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Efeito" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os efeitos</SelectItem>
                          <SelectItem value="Leque W">Leque W</SelectItem>
                          <SelectItem value="Leque Z">Leque Z</SelectItem>
                          <SelectItem value="Reto">Reto</SelectItem>
                          <SelectItem value="Explosivo">Explosivo</SelectItem>
                          <SelectItem value="Fumaça Azul">Fumaça Azul</SelectItem>
                          <SelectItem value="Fumaça Rosa">Fumaça Rosa</SelectItem>
                          <SelectItem value="Chuva dourada">Chuva dourada</SelectItem>
                          <SelectItem value="Serpentina">Serpentina</SelectItem>
                          <SelectItem value="Papel picado">Papel picado</SelectItem>
                          <SelectItem value="Pó">Pó</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Ordenação por preço */}
                      <Select 
                        value={productPriceSort} 
                        onValueChange={setProductPriceSort}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Ordenar preço" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem ordenação</SelectItem>
                          <SelectItem value="asc">Preço: Menor → Maior</SelectItem>
                          <SelectItem value="desc">Preço: Maior → Menor</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Ordenação por duração */}
                      <Select 
                        value={productDurationSort} 
                        onValueChange={setProductDurationSort}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Ordenar duração" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem ordenação</SelectItem>
                          <SelectItem value="asc">Duração: Menor → Maior</SelectItem>
                          <SelectItem value="desc">Duração: Maior → Menor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Contador de resultados */}
                    <div className="text-xs text-muted-foreground">
                      {(() => {
                        const filteredProducts = produtos.filter(produto => {
                          const searchMatch = !searchTerm || 
                            produto.nome_produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            produto.codigo?.toLowerCase().includes(searchTerm.toLowerCase());
                          
                          const categoryMatch = productCategoryFilter === "all" || 
                            produto.categoria?.toLowerCase() === productCategoryFilter;
                          
                          const effectMatch = productEffectFilter === "all" || 
                            (produto.efeito && produto.efeito.toLowerCase() === productEffectFilter.toLowerCase());
                          
                          return produto.ativo && searchMatch && categoryMatch && effectMatch;
                        });
                        
                        return `${filteredProducts.length} produto(s) encontrado(s) de ${produtos.filter(p => p.ativo).length} total`;
                      })()}
                    </div>

                    {/* Tabela de produtos */}
                    <div className="border border-primary/20 rounded-md overflow-hidden max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-primary/5 border-primary/20">
                            <TableHead className="text-xs font-semibold">Código</TableHead>
                            <TableHead className="text-xs font-semibold">Fab.</TableHead>
                            <TableHead className="text-xs font-semibold">Produto</TableHead>
                            <TableHead className="text-xs font-semibold">Categoria</TableHead>
                            <TableHead className="text-xs font-semibold">Efeito</TableHead>
                            <TableHead className="text-xs font-semibold">Dur.</TableHead>
                            <TableHead className="text-xs font-semibold">Est.</TableHead>
                            <TableHead className="text-xs font-semibold">Valor</TableHead>
                            <TableHead className="w-[10%]">+</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            const filteredProducts = produtos.filter(produto => {
                              const searchMatch = !searchTerm || 
                                produto.nome_produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                produto.codigo?.toLowerCase().includes(searchTerm.toLowerCase());
                              
                              const categoryMatch = productCategoryFilter === "all" || 
                                produto.categoria?.toLowerCase() === productCategoryFilter;
                              
                              const effectMatch = productEffectFilter === "all" || 
                                (produto.efeito && produto.efeito.toLowerCase() === productEffectFilter.toLowerCase());
                              
                              return produto.ativo && searchMatch && categoryMatch && effectMatch;
                            });

                            // Aplicar ordenações
                            if (productPriceSort === 'asc') {
                              filteredProducts.sort((a, b) => a.valor_venda - b.valor_venda);
                            } else if (productPriceSort === 'desc') {
                              filteredProducts.sort((a, b) => b.valor_venda - a.valor_venda);
                            }

                            if (productDurationSort === 'asc') {
                              filteredProducts.sort((a, b) => (a.duracao_segundos || 0) - (b.duracao_segundos || 0));
                            } else if (productDurationSort === 'desc') {
                              filteredProducts.sort((a, b) => (b.duracao_segundos || 0) - (a.duracao_segundos || 0));
                            }

                            return filteredProducts.map((produto) => (
                              <TableRow key={produto.id} className="border-primary/10 hover:bg-primary/5 transition-colors">
                                <TableCell className="text-xs font-mono">{produto.codigo}</TableCell>
                                <TableCell className="text-xs">{produto.fabricante}</TableCell>
                                <TableCell className="text-xs font-medium">{produto.nome_produto}</TableCell>
                                <TableCell className="text-xs capitalize">{produto.categoria}</TableCell>
                                <TableCell className="text-xs">{produto.efeito || '—'}</TableCell>
                                <TableCell className="text-xs">
                                  {produto.duracao_segundos ? `${produto.duracao_segundos}s` : '—'}
                                </TableCell>
                                <TableCell className="text-xs">
                                  <span className={produto.quantidade_disponivel < 5 ? 'text-red-600 font-semibold' : ''}>
                                    {produto.quantidade_disponivel}
                                  </span>
                                  {produto.quantidade_disponivel < 5 && '!'}
                                </TableCell>
                                <TableCell className="text-xs">R$ {produto.valor_venda.toFixed(2)}</TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      // Verificar se o produto já está no orçamento
                                      const existingIndex = selectedProducts.findIndex(
                                        p => p.produto_id === produto.id
                                      );
                                      
                                      if (existingIndex >= 0) {
                                        // Se já existe, incrementa a quantidade
                                        const updatedProduct = {
                                          ...selectedProducts[existingIndex],
                                          quantidade: selectedProducts[existingIndex].quantidade + 1
                                        };
                                        updateProductInOrcamento(existingIndex, updatedProduct);
                                        toast({
                                          description: `Quantidade de ${produto.nome_produto} aumentada para ${updatedProduct.quantidade}`,
                                        });
                                      } else {
                                        // Se não existe, adiciona como novo
                                        const newProduct = {
                                          produto_id: produto.id,
                                          nome: produto.nome_produto,
                                          valor_unitario: produto.valor_venda,
                                          quantidade: 1
                                        };
                                        addProductToOrcamento(newProduct);
                                        toast({
                                          description: `${produto.nome_produto} adicionado ao orçamento`,
                                        });
                                      }
                                    }}
                                    className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                    disabled={produto.quantidade_disponivel === 0}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ));
                          })()}
                        </TableBody>
                      </Table>
                      
                      {(() => {
                        const filteredCount = produtos.filter(produto => {
                          const searchMatch = !searchTerm || 
                            produto.nome_produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            produto.codigo?.toLowerCase().includes(searchTerm.toLowerCase());
                          
                          const categoryMatch = productCategoryFilter === "all" || 
                            produto.categoria?.toLowerCase() === productCategoryFilter;
                          
                          const effectMatch = productEffectFilter === "all" || 
                            (produto.efeito && produto.efeito.toLowerCase() === productEffectFilter.toLowerCase());
                          
                          return produto.ativo && searchMatch && categoryMatch && effectMatch;
                        }).length;
                        
                        return filteredCount === 0 && (
                          <div className="p-4 text-center">
                            <p className="text-xs text-muted-foreground">
                              Nenhum produto encontrado com os filtros aplicados
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Pagamento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1 sm:space-y-2">
                    <Label htmlFor="modo_pagamento" className="text-xs sm:text-sm text-foreground">Modo de Pagamento</Label>
                    <Select 
                      value={orcamentoForm.modo_pagamento} 
                      onValueChange={(value: 'dinheiro' | 'pix' | 'cartao' | 'transferencia') => 
                        setOrcamentoForm({...orcamentoForm, modo_pagamento: value})
                      }
                    >
                      <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm bg-background border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border">
                        <SelectItem value="dinheiro" className="text-xs sm:text-sm text-foreground hover:bg-muted">Dinheiro</SelectItem>
                        <SelectItem value="pix" className="text-xs sm:text-sm text-foreground hover:bg-muted">PIX</SelectItem>
                        <SelectItem value="cartao" className="text-xs sm:text-sm text-foreground hover:bg-muted">Cartão</SelectItem>
                        <SelectItem value="transferencia" className="text-xs sm:text-sm text-foreground hover:bg-muted">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="margem_lucro" className="text-xs sm:text-sm text-foreground">Margem de Lucro (%)</Label>
                    <Input
                      id="margem_lucro"
                      type="number"
                      min="0"
                      max="100"
                      value={orcamentoForm.margem_lucro}
                      onChange={(e) => setOrcamentoForm({...orcamentoForm, margem_lucro: parseFloat(e.target.value) || 0})}
                      className="h-8 sm:h-10 text-xs sm:text-sm bg-background border-border text-foreground"
                    />
                  </div>
                </div>

                {/* Resumo */}
                <div className="border rounded-lg p-3 sm:p-4 bg-muted/50">
                  <div className="flex justify-between items-center mb-1 sm:mb-2">
                    <span className="text-xs sm:text-sm">Subtotal:</span>
                    <span className="text-xs sm:text-sm">R$ {selectedProducts.reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-1 sm:mb-2">
                    <span className="text-xs sm:text-sm">Margem ({orcamentoForm.margem_lucro}%):</span>
                    <span className="text-xs sm:text-sm">R$ {(calculateOrcamentoTotal() - selectedProducts.reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0)).toFixed(2)}</span>
                  </div>
                  <Separator className="my-1 sm:my-2" />
                  <div className="flex justify-between items-center font-bold text-sm sm:text-lg">
                    <span>Total:</span>
                    <span>R$ {calculateOrcamentoTotal().toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsOrcamentoDialogOpen(false)} className="h-8 sm:h-10 text-xs sm:text-sm">
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateOrcamento} disabled={selectedProducts.length === 0} className="h-8 sm:h-10 text-xs sm:text-sm">
                    Criar Orçamento
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200 p-0.5 sm:p-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3 md:pt-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-foreground">Solicitações Pendentes</CardTitle>
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3 md:pb-4 pt-0">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-600">{solicitacoesPendentes}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">aguardando resposta</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200 p-0.5 sm:p-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3 md:pt-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-foreground">Orçamentos Pendentes</CardTitle>
              <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3 md:pb-4 pt-0">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-primary">{stats.pendentes}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">aguardando confirmação</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200 p-0.5 sm:p-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3 md:pt-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-foreground">Orçamentos Aprovados</CardTitle>
              <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3 md:pb-4 pt-0">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">{stats.confirmados}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">aprovados/realizados</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200 p-0.5 sm:p-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-2 sm:px-3 md:px-4 pt-2 sm:pt-3 md:pt-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-foreground">Faturamento do Mês</CardTitle>
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            </CardHeader>
            <CardContent className="px-2 sm:px-3 md:px-4 pb-2 sm:pb-3 md:pb-4 pt-0">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-blue-600">
                R$ {stats.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">receita confirmada</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-2 bg-primary/10 border border-primary/20">
            <TabsTrigger value="solicitacoes" className="text-xs sm:text-sm py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Solicitações ({solicitacoes.length})
            </TabsTrigger>
            <TabsTrigger value="orcamentos" className="text-xs sm:text-sm py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Calculator className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Orçamentos ({orcamentos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="solicitacoes" className="space-y-4">
            {/* Filters */}
            <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm">
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-2 sm:top-2.5 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nome, WhatsApp ou email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-7 sm:pl-8 h-8 sm:h-10 text-xs sm:text-sm"
                      />
                    </div>
                  </div>
                  <Select value={filterTipo} onValueChange={setFilterTipo}>
                    <SelectTrigger className="w-full sm:w-48 h-8 sm:h-10 text-xs sm:text-sm">
                      <SelectValue placeholder="Filtrar por tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs sm:text-sm">Todos os tipos</SelectItem>
                      <SelectItem value="artigos_pirotecnicos" className="text-xs sm:text-sm">Artigos Pirotécnicos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="h-8 sm:h-10 text-xs sm:text-sm"
                    onClick={fetchSolicitacoes}
                    disabled={isSyncingLeads}
                  >
                    <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-2 ${isSyncingLeads ? 'animate-spin' : ''}`} />
                    {isSyncingLeads ? 'Sincronizando...' : 'Sincronizar agora'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Solicitações Table */}
            <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm">
              <CardHeader>
                <CardTitle className="text-foreground">Solicitações de Orçamento ({filteredSolicitacoes.length})</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Lista de todas as solicitações recebidas pelo site público
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-primary/20 bg-primary/5">
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Cliente</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Contato</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Tipo</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Evento</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Data</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Status</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Recebido em</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSolicitacoes.map((solicitacao) => (
                        <TableRow key={solicitacao.id} className="border-primary/10 hover:bg-primary/5 transition-colors">
                          <TableCell>
                            <div>
                              <div className="text-xs sm:text-sm font-medium">{solicitacao.nome_completo}</div>
                              {solicitacao.email && (
                                <div className="text-xs sm:text-sm text-muted-foreground">{solicitacao.email}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <span className="text-xs sm:text-sm">{solicitacao.whatsapp}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{getTipoLabel(solicitacao.tipo_solicitacao)}</Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              {solicitacao.tipo_evento && (
                                <div className="text-xs sm:text-sm font-medium">{solicitacao.tipo_evento}</div>
                              )}
                              {solicitacao.localizacao_evento && (
                                <div className="flex items-center text-xs text-muted-foreground">
                                  <MapPin className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                  {solicitacao.localizacao_evento}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {solicitacao.data_evento && (
                              <div className="text-xs sm:text-sm">
                                {formatDateOnly(solicitacao.data_evento)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getStatusColor(solicitacao.enviado_email || false)} text-xs`}>
                              {solicitacao.enviado_email ? "Processada" : "Pendente"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs sm:text-sm">
                              {formatDate(solicitacao.created_at!)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1 sm:space-x-2">
                              {!solicitacao.enviado_email && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                  onClick={() => handleMarkSolicitacaoProcessed(solicitacao.id)}
                                  title="Marcar como processada"
                                >
                                  <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                </Button>
                              )}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => handleViewSolicitacaoDetails(solicitacao)}
                                title="Ver detalhes"
                              >
                                <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => handleEditSolicitacao(solicitacao)}
                                title="Editar solicitação"
                              >
                                <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-red-600 hover:text-red-700"
                                onClick={() => handleDeleteSolicitacao(solicitacao.id)}
                                title="Excluir solicitação"
                              >
                                <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {filteredSolicitacoes.length === 0 && (
                    <div className="text-center py-6 sm:py-8">
                      <FileText className="mx-auto h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-muted-foreground" />
                      <h3 className="mt-1 sm:mt-2 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Nenhuma solicitação encontrada
                      </h3>
                      <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground">
                        {searchTerm || filterTipo !== "all" 
                          ? "Tente ajustar os filtros de busca."
                          : "Ainda não há solicitações de orçamento."}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orcamentos" className="space-y-4">
            {/* Orçamentos Filters */}
            <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm">
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-2 top-2 sm:top-2.5 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por cliente, evento ou telefone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-7 sm:pl-8 h-8 sm:h-10 text-xs sm:text-sm"
                      />
                    </div>
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-48 h-8 sm:h-10 text-xs sm:text-sm">
                      <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs sm:text-sm">Todos os status</SelectItem>
                      <SelectItem value="pendente" className="text-xs sm:text-sm">Pendente</SelectItem>
                      <SelectItem value="processado" className="text-xs sm:text-sm">Processado</SelectItem>
                      <SelectItem value="aprovado" className="text-xs sm:text-sm">Aprovado</SelectItem>
                      <SelectItem value="realizado" className="text-xs sm:text-sm">Realizado</SelectItem>
                      <SelectItem value="cancelado" className="text-xs sm:text-sm">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Orçamentos Table */}
            <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm">
              <CardHeader>
                <CardTitle className="text-foreground">Orçamentos ({filteredOrcamentos.length})</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Lista de todos os orçamentos criados no sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-primary/20 bg-primary/5">
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Cliente</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Evento</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Data Evento</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Tipo</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Valor Total</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Status</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Criado por</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary border-r border-primary/10">Criado em</TableHead>
                        <TableHead className="text-xs sm:text-sm font-semibold !text-primary">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrcamentos.map((orcamento) => (
                        <TableRow key={orcamento.id} className="border-primary/10 hover:bg-primary/5 transition-colors">
                          <TableCell>
                            <div>
                              <div className="text-xs sm:text-sm font-medium">{orcamento.nome_contratante}</div>
                              {orcamento.telefone && (
                                <div className="text-xs sm:text-sm text-muted-foreground">{orcamento.telefone}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="text-xs sm:text-sm font-medium">{orcamento.evento_nome}</div>
                              <div className="text-xs sm:text-sm text-muted-foreground">{orcamento.evento_local}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs sm:text-sm">
                              {formatDateOnly(orcamento.evento_data)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {orcamento.tipo === 'show_pirotecnico' ? 'Show Pirotécnico' : 'Venda de Artigos'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs sm:text-sm font-medium">
                              R$ {(orcamento.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {orcamento.orcamentos_produtos?.length || 0} produto(s)
                            </div>
                          </TableCell>
                          <TableCell>
                            {getOrcamentoStatusBadge(orcamento.status || 'pendente', orcamento.id)}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs sm:text-sm">
                              {orcamento.usuarios?.nome || 'Sistema'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs sm:text-sm">
                              {formatDate(orcamento.created_at!)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1 sm:space-x-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => handleViewDetails(orcamento)}
                                title="Ver detalhes"
                              >
                                <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-orange-600 hover:text-orange-700"
                                onClick={() => handleGeneratePDF(orcamento)}
                                title="Gerar PDF do orçamento"
                              >
                                <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => handleFullEdit(orcamento)}
                                title="Editar orçamento completo"
                              >
                                <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => handleEditOrcamento(orcamento)}
                                title="Editar status"
                              >
                                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleDeleteOrcamento(orcamento.id)}
                                className="text-red-600 hover:text-red-700 h-7 w-7 sm:h-8 sm:w-8 p-0"
                                title="Deletar orçamento"
                              >
                                <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {filteredOrcamentos.length === 0 && (
                    <div className="text-center py-6 sm:py-8">
                      <Calculator className="mx-auto h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-muted-foreground" />
                      <h3 className="mt-1 sm:mt-2 text-xs sm:text-sm font-semibold text-muted-foreground">
                        Nenhum orçamento encontrado
                      </h3>
                      <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground">
                        {searchTerm || filterStatus !== "all" 
                          ? "Tente ajustar os filtros de busca."
                          : "Ainda não há orçamentos criados."}
                      </p>
                      <Button onClick={() => setIsOrcamentoDialogOpen(true)} className="mt-3 sm:mt-4 h-8 sm:h-10 text-xs sm:text-sm">
                        <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        Criar Primeiro Orçamento
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Detalhes do Orçamento */}
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Detalhes do Orçamento</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Informações completas sobre o orçamento selecionado
              </DialogDescription>
            </DialogHeader>
            
            {selectedOrcamento && (
              <div className="space-y-6">
                {/* Informações do Cliente */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Cliente</Label>
                    <p className="text-sm mt-1">{selectedOrcamento.nome_contratante}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <div className="mt-1">
                      {getOrcamentoStatusBadge(selectedOrcamento.status || 'pendente', selectedOrcamento.id)}
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Telefone</Label>
                    <p className="text-sm mt-1">{selectedOrcamento.telefone || 'Não informado'}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">CPF</Label>
                    <p className="text-sm mt-1">{selectedOrcamento.cpf || 'Não informado'}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Tipo</Label>
                    <p className="text-sm mt-1">
                      {selectedOrcamento.tipo === 'show_pirotecnico' ? 'Show Pirotécnico' : 'Venda de Artigos'}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Modo de Pagamento</Label>
                    <p className="text-sm mt-1 capitalize">{selectedOrcamento.modo_pagamento || 'Não informado'}</p>
                  </div>
                </div>

                <Separator />

                {/* Informações do Evento */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Nome do Evento</Label>
                    <p className="text-sm mt-1">{selectedOrcamento.evento_nome}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Data do Evento</Label>
                    <p className="text-sm mt-1">
                      {formatDateOnly(selectedOrcamento.evento_data)}
                    </p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Local do Evento</Label>
                  <p className="text-sm mt-1">{selectedOrcamento.evento_local}</p>
                </div>

                <Separator />

                {/* Produtos do Orçamento */}
                <div>
                  <Label className="text-sm font-medium">Produtos ({selectedOrcamento.orcamentos_produtos?.length || 0})</Label>
                  {selectedOrcamento.orcamentos_produtos && selectedOrcamento.orcamentos_produtos.length > 0 ? (
                    <div className="mt-2 border border-primary/20 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-primary/5 border-primary/20">
                            <TableHead className="!text-primary font-semibold">Produto</TableHead>
                            <TableHead className="!text-primary font-semibold">Código</TableHead>
                            <TableHead className="!text-primary font-semibold">Duração</TableHead>
                            <TableHead className="!text-primary font-semibold">Quantidade</TableHead>
                            <TableHead className="!text-primary font-semibold">Valor Unit.</TableHead>
                            <TableHead className="text-right !text-primary font-semibold">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedOrcamento.orcamentos_produtos.map((item, index) => (
                            <TableRow key={index} className="border-primary/10 hover:bg-primary/5">
                              <TableCell className="font-medium">
                                {item.produtos?.nome_produto || 'Produto não encontrado'}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {item.produtos?.codigo || '-'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {item.produtos?.duracao_segundos ? `${item.produtos.duracao_segundos}s` : '—'}
                              </TableCell>
                              <TableCell>{item.quantidade}</TableCell>
                              <TableCell>R$ {item.valor_unitario.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-medium">
                                R$ {(item.quantidade * item.valor_unitario).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">Nenhum produto associado</p>
                  )}
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Valor Total</Label>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    R$ {(selectedOrcamento.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  {selectedOrcamento.status === 'pendente' && (
                    <Button 
                      onClick={() => {
                        handleUpdateStatus(selectedOrcamento.id, 'confirmado');
                        setIsDetailsOpen(false);
                      }}
                    >
                      Confirmar Orçamento
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

        {/* Modal de Edição de Status */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Editar Status do Orçamento</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Altere o status do orçamento conforme necessário
              </DialogDescription>
            </DialogHeader>
            
            {selectedOrcamento && (
              <div className="space-y-4">
                <div>
                  <Label>Cliente: {selectedOrcamento.nome_contratante}</Label>
                  <p className="text-sm text-muted-foreground">Evento: {selectedOrcamento.evento_nome}</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Novo Status</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={selectedOrcamento.status === 'pendente' ? 'default' : 'outline'}
                      onClick={() => {
                        handleUpdateStatus(selectedOrcamento.id, 'pendente');
                        setIsEditOpen(false);
                      }}
                      className="text-xs"
                    >
                      Pendente
                    </Button>
                    <Button
                      variant={selectedOrcamento.status === 'processado' ? 'default' : 'outline'}
                      onClick={() => {
                        handleUpdateStatus(selectedOrcamento.id, 'processado');
                        setIsEditOpen(false);
                      }}
                      className="text-xs"
                    >
                      Processado
                    </Button>
                    <Button
                      variant={selectedOrcamento.status === 'aprovado' ? 'default' : 'outline'}
                      onClick={() => {
                        handleUpdateStatus(selectedOrcamento.id, 'aprovado');
                        setIsEditOpen(false);
                      }}
                      className="text-xs bg-green-600 hover:bg-green-700 text-white"
                    >
                      Aprovado
                    </Button>
                    <Button
                      variant={selectedOrcamento.status === 'realizado' ? 'default' : 'outline'}
                      onClick={() => {
                        handleUpdateStatus(selectedOrcamento.id, 'realizado');
                        setIsEditOpen(false);
                      }}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Realizado
                    </Button>
                    <Button
                      variant={selectedOrcamento.status === 'cancelado' ? 'destructive' : 'outline'}
                      onClick={() => {
                        handleUpdateStatus(selectedOrcamento.id, 'cancelado');
                        setIsEditOpen(false);
                      }}
                      className="text-xs col-span-2"
                    >
                      Cancelado
                    </Button>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Detalhes da Solicitação */}
        <Dialog open={isSolicitacaoDetailsOpen} onOpenChange={setIsSolicitacaoDetailsOpen}>
          <DialogContent className="max-w-2xl bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Detalhes da Solicitação</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Informações completas sobre a solicitação de orçamento
              </DialogDescription>
            </DialogHeader>
            
            {selectedSolicitacao && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Nome Completo</Label>
                    <p className="text-sm mt-1">{selectedSolicitacao.nome_completo}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <div className="mt-1">
                      <Badge className={`${getStatusColor(selectedSolicitacao.enviado_email || false)} text-xs`}>
                        {selectedSolicitacao.enviado_email ? "Processada" : "Pendente"}
                      </Badge>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">WhatsApp</Label>
                    <p className="text-sm mt-1">{selectedSolicitacao.whatsapp}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Email</Label>
                    <p className="text-sm mt-1">{selectedSolicitacao.email || 'Não informado'}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Tipo de Solicitação</Label>
                    <p className="text-sm mt-1">{getTipoLabel(selectedSolicitacao.tipo_solicitacao)}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Tipo de Evento</Label>
                    <p className="text-sm mt-1">{selectedSolicitacao.tipo_evento || 'Não informado'}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Data do Evento</Label>
                    <p className="text-sm mt-1">
                      {selectedSolicitacao.data_evento ? formatDateOnly(selectedSolicitacao.data_evento) : 'Não informado'}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Localização</Label>
                    <p className="text-sm mt-1">{selectedSolicitacao.localizacao_evento || 'Não informado'}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Recebido em</Label>
                    <p className="text-sm mt-1">{formatDate(selectedSolicitacao.created_at!)}</p>
                  </div>
                </div>
                
                {selectedSolicitacao.detalhes_adicionais && (
                  <div>
                    <Label className="text-sm font-medium">Detalhes Adicionais</Label>
                    <p className="text-sm mt-1 p-3 bg-muted rounded-lg">{selectedSolicitacao.detalhes_adicionais}</p>
                  </div>
                )}
                
                <div className="flex justify-end gap-2 pt-4">
                  {!selectedSolicitacao.enviado_email && (
                    <Button 
                      onClick={() => {
                        handleMarkSolicitacaoProcessed(selectedSolicitacao.id);
                        setIsSolicitacaoDetailsOpen(false);
                      }}
                    >
                      Marcar como Processada
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsSolicitacaoDetailsOpen(false);
                      handleEditSolicitacao(selectedSolicitacao);
                    }}
                  >
                    Editar
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsSolicitacaoDetailsOpen(false)}
                  >
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Edição da Solicitação */}
        <Dialog open={isSolicitacaoEditOpen} onOpenChange={setIsSolicitacaoEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Editar Solicitação</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Modifique as informações da solicitação de orçamento
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nome_completo" className="text-foreground">Nome Completo</Label>
                  <Input
                    id="nome_completo"
                    value={solicitacaoEditForm.nome_completo}
                    onChange={(e) => setSolicitacaoEditForm({...solicitacaoEditForm, nome_completo: e.target.value})}
                    placeholder="Nome completo do cliente"
                  />
                </div>
                
                <div>
                  <Label htmlFor="whatsapp" className="text-foreground">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    value={solicitacaoEditForm.whatsapp}
                    onChange={(e) => setSolicitacaoEditForm({...solicitacaoEditForm, whatsapp: e.target.value})}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                
                <div>
                  <Label htmlFor="email" className="text-foreground">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={solicitacaoEditForm.email}
                    onChange={(e) => setSolicitacaoEditForm({...solicitacaoEditForm, email: e.target.value})}
                    placeholder="email@exemplo.com"
                  />
                </div>
                
                <div>
                  <Label htmlFor="tipo_solicitacao" className="text-foreground">Tipo de Solicitação</Label>
                  <Select 
                    value={solicitacaoEditForm.tipo_solicitacao} 
                    onValueChange={(value) => setSolicitacaoEditForm({...solicitacaoEditForm, tipo_solicitacao: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="artigos_pirotecnicos">Artigos Pirotécnicos</SelectItem>
                      <SelectItem value="contratar_equipe">Contratar Equipe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="tipo_evento" className="text-foreground">Tipo de Evento</Label>
                  <Input
                    id="tipo_evento"
                    value={solicitacaoEditForm.tipo_evento}
                    onChange={(e) => setSolicitacaoEditForm({...solicitacaoEditForm, tipo_evento: e.target.value})}
                    placeholder="Ex: Casamento, Formatura..."
                  />
                </div>
                
                <div>
                  <Label htmlFor="data_evento" className="text-foreground">Data do Evento</Label>
                  <Input
                    id="data_evento"
                    type="date"
                    value={solicitacaoEditForm.data_evento}
                    onChange={(e) => setSolicitacaoEditForm({...solicitacaoEditForm, data_evento: e.target.value})}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="localizacao_evento" className="text-foreground">Localização do Evento</Label>
                <Input
                  id="localizacao_evento"
                  value={solicitacaoEditForm.localizacao_evento}
                  onChange={(e) => setSolicitacaoEditForm({...solicitacaoEditForm, localizacao_evento: e.target.value})}
                  placeholder="Endereço do evento"
                />
              </div>
              
              <div>
                <Label htmlFor="detalhes_adicionais" className="text-foreground">Detalhes Adicionais</Label>
                <Textarea
                  id="detalhes_adicionais"
                  value={solicitacaoEditForm.detalhes_adicionais}
                  onChange={(e) => setSolicitacaoEditForm({...solicitacaoEditForm, detalhes_adicionais: e.target.value})}
                  placeholder="Informações adicionais sobre a solicitação..."
                  rows={4}
                  className="bg-background border-border text-foreground"
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsSolicitacaoEditOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleUpdateSolicitacao}>
                  Salvar Alterações
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Edição Completa do Orçamento */}
        <Dialog open={isFullEditOpen} onOpenChange={setIsFullEditOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Editar Orçamento Completo</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Modifique todos os dados do orçamento, incluindo produtos
              </DialogDescription>
            </DialogHeader>
            
            {selectedOrcamento && (
              <div className="space-y-6">
                {/* Dados básicos do orçamento */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nome_contratante">Nome do Contratante</Label>
                    <Input
                      id="nome_contratante"
                      value={editForm.nome_contratante}
                      onChange={(e) => setEditForm({...editForm, nome_contratante: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="telefone">Telefone</Label>
                    <Input
                      id="telefone"
                      value={editForm.telefone}
                      onChange={(e) => setEditForm({...editForm, telefone: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="cpf">CPF</Label>
                    <Input
                      id="cpf"
                      value={editForm.cpf}
                      onChange={(e) => setEditForm({...editForm, cpf: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="evento_nome">Nome do Evento</Label>
                    <Input
                      id="evento_nome"
                      value={editForm.evento_nome}
                      onChange={(e) => setEditForm({...editForm, evento_nome: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="evento_data">Data do Evento</Label>
                    <Input
                      id="evento_data"
                      type="date"
                      value={editForm.evento_data}
                      onChange={(e) => setEditForm({...editForm, evento_data: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="evento_local">Local do Evento</Label>
                    <Input
                      id="evento_local"
                      value={editForm.evento_local}
                      onChange={(e) => setEditForm({...editForm, evento_local: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="status">Status do Orçamento</Label>
                    <Select 
                      value={editForm.status} 
                      onValueChange={(value) => setEditForm({...editForm, status: value as 'pendente' | 'processado' | 'aprovado' | 'realizado' | 'cancelado'})}
                    >
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                            Pendente
                          </div>
                        </SelectItem>
                        <SelectItem value="processado">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            Processado
                          </div>
                        </SelectItem>
                        <SelectItem value="aprovado">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            Aprovado
                          </div>
                        </SelectItem>
                        <SelectItem value="realizado">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                            Realizado
                          </div>
                        </SelectItem>
                        <SelectItem value="cancelado">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            Cancelado
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                {/* Produtos selecionados */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Produtos do Orçamento</h3>
                  
                  {editForm.produtos.length > 0 && (
                    <div className="border border-primary/20 rounded-lg p-4 mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-primary/5 border-primary/20">
                            <TableHead className="!text-primary font-semibold">Produto</TableHead>
                            <TableHead className="!text-primary font-semibold">Quantidade</TableHead>
                            <TableHead className="!text-primary font-semibold">Valor Unitário</TableHead>
                            <TableHead className="!text-primary font-semibold">Total</TableHead>
                            <TableHead className="!text-primary font-semibold">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {editForm.produtos.map((produto, index) => (
                            <TableRow key={index} className="border-primary/10 hover:bg-primary/5">
                              <TableCell className="font-medium">{produto.nome}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="1"
                                  value={produto.quantidade}
                                  onChange={(e) => {
                                    const updated = [...editForm.produtos];
                                    updated[index].quantidade = Math.max(1, parseInt(e.target.value) || 1);
                                    setEditForm({...editForm, produtos: updated});
                                  }}
                                  className="w-20"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={produto.valor_unitario}
                                  onChange={(e) => {
                                    const updated = [...editForm.produtos];
                                    updated[index].valor_unitario = Math.max(0, parseFloat(e.target.value) || 0);
                                    setEditForm({...editForm, produtos: updated});
                                  }}
                                  className="w-24"
                                />
                              </TableCell>
                              <TableCell>
                                R$ {(Number(produto.quantidade) * Number(produto.valor_unitario)).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const updated = editForm.produtos.filter((_, i) => i !== index);
                                    setEditForm({...editForm, produtos: updated});
                                  }}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      
                      <div className="mt-4 text-right">
                        <p className="text-lg font-semibold">
                          Total: R$ {editForm.produtos.reduce((sum, p) => {
                            const quantidade = Number(p.quantidade) || 0;
                            const valorUnitario = Number(p.valor_unitario) || 0;
                            return sum + (quantidade * valorUnitario);
                          }, 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Seletor de Produtos com Filtros */}
                  <div className="border rounded-lg p-3 bg-muted/20 space-y-3">
                    <h4 className="font-medium text-sm">Adicionar Produtos</h4>
                    
                    {/* Filtros */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                      <div className="flex-1">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                          <Input
                            placeholder="Buscar por nome ou código..."
                            className="pl-10 bg-background border-border text-foreground"
                            value={productSearchTerm}
                            onChange={(e) => setProductSearchTerm(e.target.value)}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Select value={productCategoryFilter} onValueChange={setProductCategoryFilter}>
                          <SelectTrigger className="bg-background border-border text-foreground">
                            <SelectValue placeholder="Todas as categorias" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border">
                            <SelectItem value="all">Todas as categorias</SelectItem>
                            <SelectItem value="tortas">Tortas</SelectItem>
                            <SelectItem value="granadas">Granadas</SelectItem>
                            <SelectItem value="metralhas">Metralhas</SelectItem>
                            <SelectItem value="acessorios">Acessórios/Fios</SelectItem>
                            <SelectItem value="kits">Kits</SelectItem>
                            <SelectItem value="rojoes">Rojões</SelectItem>
                            <SelectItem value="fumacas">Fumaças</SelectItem>
                            <SelectItem value="cascata">Cascata</SelectItem>
                            <SelectItem value="morteiros">Morteiros</SelectItem>
                            <SelectItem value="bombas">Bombas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Select value={productEffectFilter} onValueChange={setProductEffectFilter}>
                          <SelectTrigger className="bg-background border-border text-foreground">
                            <SelectValue placeholder="Todos os efeitos" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border">
                            <SelectItem value="all">Todos os efeitos</SelectItem>
                            <SelectItem value="Explosivo">Explosivo</SelectItem>
                            <SelectItem value="Fumaça">Fumaça</SelectItem>
                            <SelectItem value="Leque">Leque</SelectItem>
                            <SelectItem value="Leque W">Leque W</SelectItem>
                            <SelectItem value="Leque Z">Leque Z</SelectItem>
                            <SelectItem value="Reto">Reto</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Select value={productPriceSort} onValueChange={setProductPriceSort}>
                          <SelectTrigger className="bg-background border-border text-foreground">
                            <SelectValue placeholder="Ordenar por preço" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border">
                            <SelectItem value="none">Sem ordenação</SelectItem>
                            <SelectItem value="asc">Menor preço</SelectItem>
                            <SelectItem value="desc">Maior preço</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Select value={productDurationSort} onValueChange={setProductDurationSort}>
                          <SelectTrigger className="bg-background border-border text-foreground">
                            <SelectValue placeholder="Ordenar por duração" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border">
                            <SelectItem value="none">Sem ordenação</SelectItem>
                            <SelectItem value="asc">Menor duração</SelectItem>
                            <SelectItem value="desc">Maior duração</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Contador de resultados */}
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                      <span>
                        {sortedFilteredProducts.length} produto(s) encontrado(s) de {produtos.length} total
                      </span>
                      {(productSearchTerm || productCategoryFilter !== "all" || productEffectFilter !== "all" || productPriceSort !== "none" || productDurationSort !== "none") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setProductSearchTerm("");
                            setProductCategoryFilter("all");
                            setProductEffectFilter("all");
                            setProductPriceSort("none");
                            setProductDurationSort("none");
                          }}
                          className="h-auto p-1 text-xs"
                        >
                          Limpar filtros
                        </Button>
                      )}
                    </div>
                    
                    <div className="max-h-72 overflow-y-auto overflow-x-auto border border-primary/20 rounded-lg">
                      <Table className="min-w-[700px] text-xs">
                        <TableHeader className="sticky top-0 bg-primary/5 border-b border-primary/20">
                          <TableRow className="h-8">
                            <TableHead className="font-semibold !text-primary text-xs px-2 py-1">Código</TableHead>
                            <TableHead className="font-semibold !text-primary text-xs px-2 py-1 max-w-[60px]">Fab.</TableHead>
                            <TableHead className="font-semibold !text-primary text-xs px-2 py-1">Produto</TableHead>
                            <TableHead className="font-semibold !text-primary text-xs px-2 py-1 hidden sm:table-cell">Categoria</TableHead>
                            <TableHead className="font-semibold !text-primary text-xs px-2 py-1 hidden md:table-cell">Efeito</TableHead>
                            <TableHead className="font-semibold !text-primary text-xs px-2 py-1 hidden sm:table-cell">Dur.</TableHead>
                            <TableHead className="font-semibold !text-primary text-xs px-2 py-1">Est.</TableHead>
                            <TableHead className="font-semibold !text-primary text-xs px-2 py-1">Valor</TableHead>
                            <TableHead className="w-[50px] font-semibold !text-primary text-xs px-1 py-1">+</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedFilteredProducts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-6">
                                <div className="flex flex-col items-center gap-1">
                                  <Search className="h-6 w-6 text-muted-foreground" />
                                  <p className="text-muted-foreground text-xs">
                                    {productSearchTerm || productCategoryFilter !== "all" || productEffectFilter !== "all" || productPriceSort !== "none" || productDurationSort !== "none"
                                      ? "Nenhum produto encontrado"
                                      : "Nenhum produto disponível"
                                    }
                                  </p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            sortedFilteredProducts.map((produto) => (
                              <TableRow key={produto.id} className="hover:bg-muted/50 border-b border-border h-10">
                                <TableCell className="font-mono text-xs px-2 py-1 max-w-[70px] truncate" title={produto.codigo}>{produto.codigo}</TableCell>
                                <TableCell className="text-xs px-2 py-1 max-w-[60px] truncate" title={produto.fabricante || "—"}>
                                  {produto.fabricante ? produto.fabricante.substring(0, 8) + (produto.fabricante.length > 8 ? "..." : "") : "—"}
                                </TableCell>
                                <TableCell className="font-medium text-xs px-2 py-1 max-w-[120px] truncate" title={produto.nome_produto}>
                                  {produto.nome_produto.length > 20 ? produto.nome_produto.substring(0, 20) + "..." : produto.nome_produto}
                                </TableCell>
                                <TableCell className="capitalize text-xs px-2 py-1 hidden sm:table-cell max-w-[80px] truncate">
                                  {produto.categoria.substring(0, 10)}{produto.categoria.length > 10 ? "..." : ""}
                                </TableCell>
                                <TableCell className="text-xs px-2 py-1 hidden md:table-cell max-w-[70px] truncate" title={produto.efeito || "—"}>
                                  {produto.efeito ? (produto.efeito.length > 12 ? produto.efeito.substring(0, 12) + "..." : produto.efeito) : "—"}
                                </TableCell>
                                <TableCell className="text-xs px-2 py-1 hidden sm:table-cell">
                                  {produto.duracao_segundos ? `${produto.duracao_segundos}s` : "—"}
                                </TableCell>
                                <TableCell className="px-2 py-1">
                                  <span className={`font-medium text-xs ${produto.quantidade_disponivel <= 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    {produto.quantidade_disponivel}
                                  </span>
                                  {produto.quantidade_disponivel <= 5 && (
                                    <span className="text-[10px] text-amber-600 block leading-none">!</span>
                                  )}
                                </TableCell>
                                <TableCell className="font-semibold text-xs px-2 py-1">R$ {produto.valor_venda.toFixed(2)}</TableCell>
                                <TableCell className="px-1 py-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const existingProduct = editForm.produtos.find(p => p.produto_id === produto.id);
                                      if (existingProduct) {
                                        // Se já existe, aumentar quantidade
                                        const updated = editForm.produtos.map(p => 
                                          p.produto_id === produto.id 
                                            ? { ...p, quantidade: p.quantidade + 1 }
                                            : p
                                        );
                                        setEditForm({...editForm, produtos: updated});
                                        toast({
                                          description: `Quantidade de ${produto.nome_produto} aumentada`,
                                        });
                                      } else {
                                        // Se não existe, adiciona como novo
                                        const newProduct = {
                                          produto_id: produto.id,
                                          nome: produto.nome_produto,
                                          valor_unitario: produto.valor_venda,
                                          quantidade: 1
                                        };
                                        const updated = [...editForm.produtos, newProduct];
                                        setEditForm({...editForm, produtos: updated});
                                        toast({
                                          description: `${produto.nome_produto} adicionado ao orçamento`,
                                        });
                                      }
                                    }}
                                    disabled={produto.quantidade_disponivel <= 0}
                                    className="h-6 w-6 p-0 hover:bg-blue-50 hover:text-blue-600"
                                    title={produto.quantidade_disponivel <= 0 ? "Produto sem estoque" : "Adicionar produto"}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsFullEditOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveFullEdit}>
                    Salvar Alterações
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog de Confirmação para Deletar Orçamento */}
        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent className="bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Confirmar Exclusão</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Tem certeza que deseja excluir este orçamento? Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => {
                setIsDeleteConfirmOpen(false);
                setOrcamentoToDelete(null);
              }}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={confirmDeleteOrcamento}>
                Excluir Orçamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminOrcamentos;
