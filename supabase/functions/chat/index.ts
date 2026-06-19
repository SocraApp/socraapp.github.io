// Supabase Edge Function: Chat Proxy
// Proxies requests to OpenRouter API
// Deploy with: supabase functions deploy chat
// Set secret with: supabase secrets set OPENROUTER_API_KEY=your_key_here

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the user is authenticated
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the request body
    const { messages } = await req.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the OpenRouter API key from environment
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openrouterApiKey) {
      console.error('OPENROUTER_API_KEY not set')
      return new Response(
        JSON.stringify({ error: 'AI service not configured. Please set the OPENROUTER_API_KEY secret.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's plan for model selection
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()

    const plan = profile?.plan || 'doxa'

    // Select model based on plan
    // For now, all plans use gpt-oss-120b as per the prototype spec
    let model = 'gpt-oss-120b'

    // Plan-based model selection (for future use when plans are active)
    // if (plan === 'nous') model = 'gpt-oss-120b'
    // else if (plan === 'elenchus') model = 'gpt-oss-120b'
    // else model = 'gpt-oss-120b'

    // Call OpenRouter API
    // Note: gpt-oss-120b is a reasoning model. We pass reasoning: { exclude: true }
    // so the chain-of-thought analysis goes into a separate `reasoning` field
    // instead of leaking into the user-visible `content` field.
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://socraapp.github.io',
        'X-Title': 'Socra - Socratic AI Tutor'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 2048,
        temperature: 0.7,
        reasoning: { exclude: true },
      })
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('OpenRouter API error:', response.status, errorData)
      return new Response(
        JSON.stringify({ error: `AI service returned an error (${response.status})` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
