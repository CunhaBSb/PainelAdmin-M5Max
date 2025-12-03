import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, DollarSign, FileText, Calendar, TrendingUp, Activity, AlertTriangle, Eye, ShoppingCart, Zap, Clock } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/lib/supabase";
import { supabaseLeads, hasLeadsSource, mapLeadToSolicitacao } from "@/lib/supabase-leads";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { format, parseISO, isToday, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalProdutos: 0,
    valorTotalEstoque: 0,
    valorEstoque: 0,
    orcamentosDoMes: 0,
    valorOrcamentosDoMes: 0,
    eventosDoMes: 0,
    eventosHoje: 0,
    solicitacoesPendentes: 0
  });

  const [loading, setLoading] = useState(true);
  const [recentActivities, setRecentActivities] = useState<Array<{
    id: string;
    tipo: string;
    descricao: string;
    data: string;
    status?: string;
  }>>([]);
  const [eventosProximos, setEventosProximos] = useState<Array<{
    id: string;
    nome: string;
    data: string;
    local: string;
    status: string;
    cliente_nome: string;
  }>>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchDashboardData = useCallback(async () => {
    try {
      
      // Buscar estatísticas de produtos
      const { data: produtos, error: produtosError } = await supabase
        .from('produtos')
        .select('quantidade_disponivel, valor_compra, valor_venda, ativo');

      if (produtosError) throw produtosError;

      // Buscar orçamentos do mês atual
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      
      const { data: orcamentos, error: orcamentosError } = await supabase
        .from('orcamentos')
        .select('valor_total, status, created_at')
        .gte('created_at', inicioMes.toISOString());

      if (orcamentosError) throw orcamentosError;

      // Buscar eventos próximos (próximos 30 dias)
      const hoje = new Date();
      const proximos30Dias = addDays(hoje, 30);
      
      const { data: eventos, error: eventosError } = await supabase
        .from('eventos')
        .select(`
          id,
          status,
          confirmado_em,
          realizado_em,
          created_at,
          orcamentos!inner (
            id,
            evento_nome,
            evento_data,
            evento_local,
            nome_contratante
          )
        `)
        .gte('orcamentos.evento_data', hoje.toISOString().split('T')[0])
        .lte('orcamentos.evento_data', proximos30Dias.toISOString().split('T')[0])
        .order('created_at', { ascending: false });

      if (eventosError) throw eventosError;

      // Buscar solicitações pendentes (prioriza fonte externa lead_submissions)
      let solicitacoes: Array<{ id: string; nome_completo: string; tipo_solicitacao: string; created_at: string }> = [];

      if (hasLeadsSource && supabaseLeads) {
        const { data, error } = await supabaseLeads
          .from('lead_submissions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          console.warn('[Dashboard] lead_submissions indisponível:', error.message);
        } else if (data) {
          solicitacoes = data.map(mapLeadToSolicitacao) as typeof solicitacoes;
        }
      } else {
        const { data: solicitacoesData, error: solicitacoesError } = await supabase
          .from('solicitacoes_orcamento')
          .select('id, nome_completo, tipo_solicitacao, created_at')
          .eq('enviado_email', false)
          .order('created_at', { ascending: false })
          .limit(10);

        if (solicitacoesError) {
          console.warn('[Dashboard] solicitacoes_orcamento indisponível:', solicitacoesError.message);
        } else if (solicitacoesData) {
          solicitacoes = solicitacoesData;
        }
      }

      // Calcular estatísticas
      const produtosAtivos = produtos?.filter(p => p.ativo) || [];
      const valorEstoque = produtosAtivos.reduce((sum, p) => sum + (p.valor_compra * p.quantidade_disponivel), 0);
      const valorTotalEstoque = produtosAtivos.reduce((sum, p) => sum + (p.valor_venda * p.quantidade_disponivel), 0);
      
      const orcamentosConfirmados = orcamentos?.filter(o => o.status === 'confirmado') || [];
      const valorOrcamentosDoMes = orcamentosConfirmados.reduce((sum, o) => sum + (o.valor_total || 0), 0);
      
      const eventosHoje = eventos?.filter(e => {
        if (!e.orcamentos || Array.isArray(e.orcamentos)) return false;
        const orcamento = e.orcamentos as { evento_data?: string };
        if (!orcamento.evento_data) return false;
        const eventoData = new Date(orcamento.evento_data);
        return isToday(eventoData);
      }) || [];

      // Atualizar estatísticas
      setStats({
        totalProdutos: produtosAtivos.length,
        valorTotalEstoque,
        valorEstoque,
        orcamentosDoMes: orcamentos?.length || 0,
        valorOrcamentosDoMes,
        eventosDoMes: eventos?.length || 0,
        eventosHoje: eventosHoje.length,
        solicitacoesPendentes: solicitacoes?.length || 0
      });

      // Configurar eventos próximos
      const eventosFormatados = eventos?.filter(e => e.orcamentos && !Array.isArray(e.orcamentos)).map(e => ({
        id: e.id,
        nome: (e.orcamentos as { evento_nome?: string }).evento_nome || 'Evento sem nome',
        data: (e.orcamentos as { evento_data?: string }).evento_data || '',
        local: (e.orcamentos as { evento_local?: string }).evento_local || 'Local não definido',
        status: e.status || 'pendente',
        cliente_nome: (e.orcamentos as { nome_contratante?: string }).nome_contratante || 'Cliente não definido'
      })) || [];

      setEventosProximos(eventosFormatados.slice(0, 5));

      // Configurar atividades recentes
      const atividades = [
        ...(solicitacoes?.map(s => ({
          id: s.id,
          tipo: 'solicitacao',
          descricao: `Nova solicitação de ${s.nome_completo}`,
          data: s.created_at,
          status: 'pendente'
        })) || []),
        ...(orcamentos?.slice(0, 5).map(o => ({
          id: o.created_at,
          tipo: 'orcamento',
          descricao: `Orçamento ${o.status}`,
          data: o.created_at,
          status: o.status
        })) || [])
      ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 8);

      setRecentActivities(atividades);

    } catch (error) {
      console.error('❌ Erro ao carregar dashboard:', error);
      toast({
        title: "Erro ao carregar dashboard",
        description: "Alguns dados podem não estar atualizados.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Há poucos minutos';
    if (diffInHours === 1) return 'Há 1 hora';
    if (diffInHours < 24) return `Há ${diffInHours} horas`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'Há 1 dia';
    return `Há ${diffInDays} dias`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmado':
        return <Badge variant="default">Confirmado</Badge>;
      case 'pendente':
        return <Badge variant="outline">Pendente</Badge>;
      case 'realizado':
        return <Badge className="bg-green-100 text-green-800">Realizado</Badge>;
      case 'cancelado':
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Activity className="h-8 w-8 animate-pulse mx-auto mb-4" />
            <p>Carregando dashboard...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-primary">Dashboard</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Visão geral do sistema M5 Max Produções</p>
          </div>
          <Button onClick={fetchDashboardData} variant="outline" size="sm" className="text-xs py-1 h-8 sm:text-sm sm:h-9 border-primary/20 text-primary hover:bg-primary/5">
            <TrendingUp className="h-3 w-3 mr-1 sm:h-4 sm:w-4 sm:mr-2" />
            Atualizar Dados
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {/* Total Produtos */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-3 sm:px-4 pt-3 sm:pt-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-foreground">Total de Produtos</CardTitle>
              <Package className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            </CardHeader>
            <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4">
              <div className="text-lg sm:text-xl md:text-2xl font-bold text-primary">{stats.totalProdutos}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                produtos ativos no estoque
              </p>
            </CardContent>
          </Card>

          {/* Valor do Estoque */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Valor do Estoque</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                R$ {stats.valorEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">
                valor total de compra
              </p>
            </CardContent>
          </Card>

          {/* Valor Total do Estoque */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Valor Total</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                R$ {stats.valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">
                valor total de venda do estoque
              </p>
            </CardContent>
          </Card>

          {/* Solicitações Pendentes */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Solicitações Pendentes</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.solicitacoesPendentes}</div>
              <p className="text-xs text-muted-foreground">
                aguardando resposta
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Segunda linha de stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Orçamentos do Mês */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Orçamentos do Mês</CardTitle>
              <ShoppingCart className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.orcamentosDoMes}</div>
              <p className="text-xs text-muted-foreground">
                orçamentos criados
              </p>
            </CardContent>
          </Card>

          {/* Valor Orçamentos */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Receita Potencial</CardTitle>
              <Zap className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                R$ {stats.valorOrcamentosDoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">
                orçamentos confirmados
              </p>
            </CardContent>
          </Card>

          {/* Eventos do Mês */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Eventos Próximos</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.eventosDoMes}</div>
              <p className="text-xs text-muted-foreground">
                próximos 30 dias
              </p>
            </CardContent>
          </Card>

          {/* Eventos Hoje */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Eventos Hoje</CardTitle>
              <Clock className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.eventosHoje}</div>
              <p className="text-xs text-muted-foreground">
                eventos programados
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Eventos Próximos */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                Próximos Eventos
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Eventos agendados para os próximos dias
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventosProximos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-4 opacity-50" />
                  <p>Nenhum evento agendado</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {eventosProximos.map((evento) => (
                    <div key={evento.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{evento.nome}</p>
                        <p className="text-sm text-muted-foreground">{evento.cliente_nome}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(evento.data), "dd/MM/yyyy", { locale: ptBR })} • {evento.local}
                        </p>
                      </div>
                      <div className="ml-4">
                        {getStatusBadge(evento.status)}
                      </div>
                    </div>
                  ))}
                  <Button 
                    variant="outline" 
                    className="w-full mt-4"
                    onClick={() => navigate('/admin/eventos')}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Todos os Eventos
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Atividades Recentes */}
          <Card className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Activity className="h-5 w-5 text-muted-foreground" />
                Atividades Recentes
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Últimas movimentações do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma atividade recente</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentActivities.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm">{activity.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimeAgo(activity.data)}
                        </p>
                      </div>
                      {activity.status && (
                        <div className="ml-4">
                          {getStatusBadge(activity.status)}
                        </div>
                      )}
                    </div>
                  ))}
                  <Button 
                    variant="outline" 
                    className="w-full mt-2 sm:mt-3 md:mt-4 text-xs sm:text-sm py-1 h-8 sm:h-9"
                    onClick={() => navigate('/admin/orcamentos')}
                  >
                    <FileText className="h-3 w-3 mr-1 sm:h-4 sm:w-4 sm:mr-2" />
                    Ver Todas as Solicitações
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-card border border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Activity className="h-5 w-5 text-muted-foreground" />
              Ações Rápidas
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Acesso direto às principais funcionalidades do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
              <Button 
                className="h-14 sm:h-16 md:h-20 flex flex-col gap-1 sm:gap-2 text-xs sm:text-sm"
                onClick={() => navigate('/admin/estoque')}
              >
                <Package className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                <span>Gerenciar Estoque</span>
                <span className="text-xs opacity-70">{stats.totalProdutos} produtos</span>
              </Button>
              <Button 
                className="h-14 sm:h-16 md:h-20 flex flex-col gap-1 sm:gap-2 text-xs sm:text-sm"
                variant="outline"
                onClick={() => navigate('/admin/orcamentos')}
              >
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                <span>Ver Orçamentos</span>
                <span className="text-xs opacity-70">{stats.orcamentosDoMes} este mês</span>
              </Button>
              <Button 
                className="h-14 sm:h-16 md:h-20 flex flex-col gap-1 sm:gap-2 text-xs sm:text-sm"
                variant="outline"
                onClick={() => navigate('/admin/eventos')}
              >
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                <span>Calendário de Eventos</span>
                <span className="text-xs opacity-70">{stats.eventosDoMes} próximos</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Alertas e Notificações */}
        {(stats.solicitacoesPendentes > 0 || stats.eventosHoje > 0) && (
          <Card className="bg-card border border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <AlertTriangle className="h-5 w-5" />
                Alertas e Notificações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.solicitacoesPendentes > 0 && (
                  <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Solicitações pendentes</p>
                        <p className="text-xs text-muted-foreground">{stats.solicitacoesPendentes} solicitações aguardando resposta</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate('/admin/orcamentos')}>
                      Responder
                    </Button>
                  </div>
                )}
                
                {stats.eventosHoje > 0 && (
                  <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-destructive rounded-full"></div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Eventos hoje</p>
                        <p className="text-xs text-muted-foreground">{stats.eventosHoje} eventos programados para hoje</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate('/admin/eventos')}>
                      Ver Eventos
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
