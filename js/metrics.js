class MetricsManager {
  constructor(supabaseClient) { this.sb = supabaseClient; }

  async saveMetrics(metrics, chatId) {
    if (!metrics) {
      console.warn('[Socra] saveMetrics called with null metrics');
      return;
    }

    try {
      const { data: { session } } = await this.sb.auth.getSession();
      if (!session) {
        console.warn('[Socra] saveMetrics: no session');
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const { data: existing, error: fetchError } = await this.sb
        .from('cognitive_metrics')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('chat_id', chatId)
        .eq('date', today)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is fine
        console.error('[Socra] Metrics fetch error:', fetchError);
      }

      if (existing) {
        const c = existing.session_count + 1;
        const u = {
          session_count: c,
          reasoning_quality: this.avg(existing.reasoning_quality, metrics.reasoning_quality, c),
          logical_consistency: this.avg(existing.logical_consistency, metrics.logical_consistency, c),
          completeness: this.avg(existing.completeness, metrics.completeness, c),
          originality: this.avg(existing.originality, metrics.originality, c),
          confidence_alignment: this.avg(existing.confidence_alignment, metrics.confidence_alignment, c),
          avg_struggle_level: this.avg(existing.avg_struggle_level, metrics.struggle_level, c)
        };
        const iv = existing.interventions_used || {};
        if (metrics.intervention_type) {
          iv[metrics.intervention_type] = (iv[metrics.intervention_type] || 0) + 1;
          u.interventions_used = iv;
        }
        const { error: updateError } = await this.sb.from('cognitive_metrics').update(u).eq('id', existing.id);
        if (updateError) {
          console.error('[Socra] Metrics update error:', updateError);
        } else {
          console.log('[Socra] Metrics updated for chat', chatId, 'on', today);
        }
      } else {
        const { error: insertError } = await this.sb.from('cognitive_metrics').insert({
          user_id: session.user.id,
          chat_id: chatId,
          date: today,
          session_count: 1,
          reasoning_quality: metrics.reasoning_quality || 0,
          logical_consistency: metrics.logical_consistency || 0,
          completeness: metrics.completeness || 0,
          originality: metrics.originality || 0,
          confidence_alignment: metrics.confidence_alignment || 0,
          avg_struggle_level: metrics.struggle_level || 0,
          interventions_used: metrics.intervention_type ? { [metrics.intervention_type]: 1 } : {}
        });
        if (insertError) {
          console.error('[Socra] Metrics insert error:', insertError);
        } else {
          console.log('[Socra] Metrics inserted for chat', chatId, 'on', today);
        }
      }
    } catch (err) {
      console.error('[Socra] saveMetrics exception:', err);
    }
  }

  avg(current, newValue, count) {
    if (!newValue) return current;
    return Math.round(((current * (count - 1)) + newValue) / count * 10) / 10;
  }
}
window.MetricsManager = MetricsManager;
