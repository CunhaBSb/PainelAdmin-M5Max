import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AcessoNegado = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl"></div>
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-destructive/20 rounded-full blur-2xl animate-pulse"></div>
            <AlertTriangle className="relative h-20 w-20 mx-auto mb-4 text-destructive drop-shadow-2xl" />
          </div>
          <h1 className="text-3xl font-bold text-primary mb-2">Acesso Negado</h1>
          <p className="text-muted-foreground">Você não tem permissão para acessar esta área</p>
        </div>

        <Card className="shadow-2xl border-destructive/20 bg-card/95 backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center text-destructive">Área Restrita</CardTitle>
            <CardDescription className="text-center">
              Esta área é exclusiva para administradores do sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Se você acredita que deveria ter acesso:</p>
              <p className="text-xs text-muted-foreground">Entre em contato com o administrador do sistema</p>
            </div>

            <div className="flex flex-col gap-2">
              <Button 
                onClick={() => navigate('/admin/login')}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao Login
              </Button>
              
              <Button 
                onClick={() => navigate('/admin/dashboard')}
                variant="outline"
                className="w-full"
              >
                Ir para Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AcessoNegado;
