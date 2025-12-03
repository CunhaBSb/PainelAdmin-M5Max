import { test, expect } from '@playwright/test';

// Painel é apenas admin: validar redirecionamento raiz e elementos do login

test('redireciona / para /admin/login e exibe formulário', async ({ page }) => {
  const response = await page.goto('/');
  // Deve redirecionar para rota de login
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(response?.status()).toBeLessThan(400);

  await expect(page.getByText(/Painel Administrativo/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Entrar/i })).toBeVisible();
  await expect(page.getByLabel(/E-mail/i)).toBeVisible();
  await expect(page.getByLabel(/Senha/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Entrar/i })).toBeVisible();
});

test('mostra mensagem de required ao tentar submeter vazio (validação nativa)', async ({ page }) => {
  await page.goto('/admin/login');
  const submit = page.getByRole('button', { name: /Entrar/i });
  await submit.click();

  // Browser validation: foco deve ficar no primeiro campo obrigatório
  await expect(page.getByLabel(/E-mail/i)).toBeFocused();
});
