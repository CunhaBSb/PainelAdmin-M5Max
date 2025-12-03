import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { env } from '@/env'

export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'm5-max-auth',
  },
  global: {
    headers: {
      'x-application-name': 'm5-max-producoes'
    }
  }
})

// Helper functions
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

type ExtendedUser = User & Database['public']['Tables']['usuarios']['Row']

export const onAuthStateChange = (callback: (user: ExtendedUser | User | null) => void) => {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      // Buscar dados completos do usuário na tabela usuarios
      const { data: userData, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', session.user.id)
        .single()
      
      if (!error && userData) {
        callback({ ...session.user, ...userData } as ExtendedUser)
      } else {
        callback(session.user)
      }
    } else {
      callback(null)
    }
  })
}
